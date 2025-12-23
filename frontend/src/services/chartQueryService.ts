/**
 * Chart Query Service
 * 
 * Executes per-chart queries locally using DuckDB WASM.
 * This enables optimal per-pair DISTINCT and ROUND operations
 * without backend round-trips.
 */

import { duckdbService, QueryResult } from './duckdbService';
import { Field } from '../types';
import { getFieldOutputColumnName } from '../utils/fieldColumnName';

export interface ChartQueryOptions {
  /** Apply rounding to reduce point count */
  rounding?: boolean;
  /** Target number of buckets per dimension when rounding */
  targetBuckets?: number;
  /** Maximum result size before forcing rounding */
  roundingThreshold?: number;
  /** Additional columns to include (color, size, labels) */
  additionalColumns?: string[];
  /** Filter conditions (WHERE clause) */
  whereClause?: string;
}

export interface ChartQueryResult {
  rows: Record<string, any>[];
  rowCount: number;
  roundingApplied: boolean;
  roundingPrecision?: { [column: string]: number };
  queryTime: number;
}

export interface RoundingPrecision {
  xPrecision: number;
  yPrecision: number;
}

const DEFAULT_TARGET_BUCKETS = 100;
const DEFAULT_ROUNDING_THRESHOLD = 10000;

/**
 * Service for executing chart-specific queries locally via DuckDB WASM.
 * 
 * Key features:
 * - Per-chart DISTINCT queries (no cross-product of all dimensions)
 * - Adaptive rounding based on per-pair cardinality and range
 * - Supports additional encoding columns (color, size)
 */
class ChartQueryService {

  /**
   * Query data for a single chart (X, Y pair) from local cache.
   * 
   * @param cacheKey - DuckDB table name holding the cached slice
   * @param xField - X-axis field
   * @param yField - Y-axis field
   * @param options - Query options (rounding, additional columns, etc.)
   * @returns Chart-optimized data
   */
  async queryForChartPair(
    cacheKey: string,
    xField: Field,
    yField: Field,
    options: ChartQueryOptions = {}
  ): Promise<ChartQueryResult> {
    const startTime = performance.now();
    
    if (!duckdbService.isReady) {
      throw new Error('DuckDB WASM not initialized');
    }

    if (!duckdbService.hasTable(cacheKey)) {
      throw new Error(`Table "${cacheKey}" not found in cache`);
    }

    const xCol = getFieldOutputColumnName(xField);
    const yCol = getFieldOutputColumnName(yField);
    
    const {
      rounding = false,
      targetBuckets = DEFAULT_TARGET_BUCKETS,
      roundingThreshold = DEFAULT_ROUNDING_THRESHOLD,
      additionalColumns = [],
      whereClause,
    } = options;

    // Check if rounding is needed based on cardinality
    let applyRounding = rounding;
    let roundingPrecision: { [column: string]: number } | undefined;

    if (!rounding && roundingThreshold > 0) {
      // Auto-detect if rounding is needed
      const pairCount = await this.getDistinctPairCount(cacheKey, xCol, yCol);
      applyRounding = pairCount > roundingThreshold;
      
      if (applyRounding) {
        console.log(`🔄 Auto-enabling rounding: ${pairCount} pairs > ${roundingThreshold} threshold`);
      }
    }

    if (applyRounding) {
      // Calculate optimal rounding precision for each dimension
      const precision = await this.calculateRoundingPrecision(
        cacheKey,
        xCol,
        yCol,
        targetBuckets
      );
      roundingPrecision = {
        [xCol]: precision.xPrecision,
        [yCol]: precision.yPrecision,
      };
    }

    // Build and execute query
    const sql = this.buildChartQuery(
      cacheKey,
      xCol,
      yCol,
      additionalColumns,
      applyRounding,
      roundingPrecision,
      whereClause
    );

    console.log(`📊 Chart query for ${xCol} × ${yCol}:`, sql);

    const result = await duckdbService.query(sql);
    const queryTime = performance.now() - startTime;

    console.log(`✅ Chart query returned ${result.rowCount} rows in ${queryTime.toFixed(1)}ms`);

    return {
      rows: result.rows,
      rowCount: result.rowCount,
      roundingApplied: applyRounding,
      roundingPrecision,
      queryTime,
    };
  }

  /**
   * Check if rounding should be applied based on cardinality.
   */
  async shouldApplyRounding(
    cacheKey: string,
    xCol: string,
    yCol: string,
    threshold: number = DEFAULT_ROUNDING_THRESHOLD
  ): Promise<boolean> {
    const pairCount = await this.getDistinctPairCount(cacheKey, xCol, yCol);
    return pairCount > threshold;
  }

  /**
   * Get count of distinct (X, Y) pairs.
   */
  async getDistinctPairCount(
    cacheKey: string,
    xCol: string,
    yCol: string
  ): Promise<number> {
    const sql = `
      SELECT COUNT(*) as cnt FROM (
        SELECT DISTINCT "${xCol}", "${yCol}"
        FROM "${cacheKey}"
        WHERE "${xCol}" IS NOT NULL AND "${yCol}" IS NOT NULL
      ) t
    `;

    const result = await duckdbService.query(sql);
    return result.rows[0]?.cnt ?? 0;
  }

  /**
   * Calculate optimal rounding precision for X and Y dimensions.
   * 
   * Uses the data range and target bucket count to determine
   * appropriate decimal places for rounding.
   */
  async calculateRoundingPrecision(
    cacheKey: string,
    xCol: string,
    yCol: string,
    targetBuckets: number = DEFAULT_TARGET_BUCKETS
  ): Promise<RoundingPrecision> {
    // Query min/max for both dimensions
    const sql = `
      SELECT 
        MIN("${xCol}") as x_min, MAX("${xCol}") as x_max,
        MIN("${yCol}") as y_min, MAX("${yCol}") as y_max
      FROM "${cacheKey}"
      WHERE "${xCol}" IS NOT NULL AND "${yCol}" IS NOT NULL
    `;

    const result = await duckdbService.query(sql);
    
    if (result.rows.length === 0) {
      return { xPrecision: 2, yPrecision: 2 };
    }

    const { x_min, x_max, y_min, y_max } = result.rows[0];

    const xPrecision = this.calculatePrecisionForRange(
      Number(x_min),
      Number(x_max),
      targetBuckets
    );
    const yPrecision = this.calculatePrecisionForRange(
      Number(y_min),
      Number(y_max),
      targetBuckets
    );

    return { xPrecision, yPrecision };
  }

  /**
   * Calculate rounding precision based on data range and target buckets.
   * 
   * @param min - Minimum value
   * @param max - Maximum value
   * @param targetBuckets - Desired number of distinct values
   * @returns Number of decimal places (can be negative for large ranges)
   */
  private calculatePrecisionForRange(
    min: number,
    max: number,
    targetBuckets: number
  ): number {
    const range = max - min;
    
    if (range === 0 || !isFinite(range)) {
      return 0;
    }

    const bucketSize = range / targetBuckets;
    
    if (bucketSize === 0 || !isFinite(bucketSize)) {
      return 2;
    }

    // Calculate order of magnitude
    // If bucket_size = 0.01, magnitude = -2, precision = 2
    // If bucket_size = 1.0, magnitude = 0, precision = 0
    // If bucket_size = 100, magnitude = 2, precision = -2
    const magnitude = Math.floor(Math.log10(Math.abs(bucketSize)));
    const precision = -magnitude;

    // Clamp to reasonable range
    return Math.max(-6, Math.min(10, precision));
  }

  /**
   * Build SQL query for chart data.
   */
  private buildChartQuery(
    cacheKey: string,
    xCol: string,
    yCol: string,
    additionalColumns: string[],
    applyRounding: boolean,
    roundingPrecision?: { [column: string]: number },
    whereClause?: string
  ): string {
    // Build SELECT expressions
    let xExpr = `"${xCol}"`;
    let yExpr = `"${yCol}"`;

    if (applyRounding && roundingPrecision) {
      const xPrec = roundingPrecision[xCol] ?? 2;
      const yPrec = roundingPrecision[yCol] ?? 2;
      xExpr = `ROUND("${xCol}", ${xPrec}) as "${xCol}"`;
      yExpr = `ROUND("${yCol}", ${yPrec}) as "${yCol}"`;
    }

    // Additional columns (color, size, labels)
    // For additional columns, we need to handle aggregation when rounding
    const additionalExprs = additionalColumns.map(col => {
      if (applyRounding) {
        // For discrete columns, take ANY value (they should be the same within a rounded bucket)
        // For continuous columns, take the average
        return `FIRST("${col}") as "${col}"`;
      }
      return `"${col}"`;
    });

    const selectExprs = [xExpr, yExpr, ...additionalExprs].join(', ');

    // Build WHERE clause
    let where = `"${xCol}" IS NOT NULL AND "${yCol}" IS NOT NULL`;
    if (whereClause) {
      where = `${where} AND (${whereClause})`;
    }

    // Build query with DISTINCT or GROUP BY depending on rounding
    if (applyRounding) {
      // When rounding, use GROUP BY to handle additional columns properly
      const groupBy = additionalColumns.length > 0
        ? `GROUP BY ROUND("${xCol}", ${roundingPrecision?.[xCol] ?? 2}), ROUND("${yCol}", ${roundingPrecision?.[yCol] ?? 2})`
        : '';
      
      return `
        SELECT DISTINCT ${selectExprs}
        FROM "${cacheKey}"
        WHERE ${where}
        ${groupBy}
      `;
    } else {
      // No rounding - simple DISTINCT
      return `
        SELECT DISTINCT ${selectExprs}
        FROM "${cacheKey}"
        WHERE ${where}
      `;
    }
  }

  /**
   * Query data for multiple chart pairs (batch operation).
   * Useful when generating a grid of charts.
   */
  async queryForChartGrid(
    cacheKey: string,
    xFields: Field[],
    yFields: Field[],
    options: ChartQueryOptions = {}
  ): Promise<Map<string, ChartQueryResult>> {
    const results = new Map<string, ChartQueryResult>();

    // Execute queries in parallel for better performance
    const promises: Promise<void>[] = [];

    for (const yField of yFields) {
      for (const xField of xFields) {
        const key = `${getFieldOutputColumnName(xField)}_${getFieldOutputColumnName(yField)}`;
        
        promises.push(
          this.queryForChartPair(cacheKey, xField, yField, options)
            .then(result => {
              results.set(key, result);
            })
            .catch(error => {
              console.error(`Failed to query chart pair ${key}:`, error);
              // Store error result
              results.set(key, {
                rows: [],
                rowCount: 0,
                roundingApplied: false,
                queryTime: 0,
              });
            })
        );
      }
    }

    await Promise.all(promises);
    return results;
  }

  /**
   * Query for a single dimension (tick strip / 1D visualization).
   */
  async queryForSingleDimension(
    cacheKey: string,
    field: Field,
    options: ChartQueryOptions = {}
  ): Promise<ChartQueryResult> {
    const startTime = performance.now();
    const col = getFieldOutputColumnName(field);

    const {
      rounding = false,
      targetBuckets = DEFAULT_TARGET_BUCKETS,
      roundingThreshold = DEFAULT_ROUNDING_THRESHOLD,
      additionalColumns = [],
      whereClause,
    } = options;

    // Check if rounding is needed
    let applyRounding = rounding;
    let precision: number | undefined;

    if (!rounding && roundingThreshold > 0) {
      const distinctCount = await this.getDistinctCount(cacheKey, col);
      applyRounding = distinctCount > roundingThreshold;
    }

    if (applyRounding) {
      precision = await this.calculateSingleDimensionPrecision(
        cacheKey,
        col,
        targetBuckets
      );
    }

    // Build query
    let colExpr = `"${col}"`;
    if (applyRounding && precision !== undefined) {
      colExpr = `ROUND("${col}", ${precision}) as "${col}"`;
    }

    const additionalExprs = additionalColumns.map(c => 
      applyRounding ? `FIRST("${c}") as "${c}"` : `"${c}"`
    );

    const selectExprs = [colExpr, ...additionalExprs].join(', ');
    let where = `"${col}" IS NOT NULL`;
    if (whereClause) {
      where = `${where} AND (${whereClause})`;
    }

    const sql = `
      SELECT DISTINCT ${selectExprs}
      FROM "${cacheKey}"
      WHERE ${where}
    `;

    const result = await duckdbService.query(sql);
    const queryTime = performance.now() - startTime;

    return {
      rows: result.rows,
      rowCount: result.rowCount,
      roundingApplied: applyRounding,
      roundingPrecision: precision !== undefined ? { [col]: precision } : undefined,
      queryTime,
    };
  }

  /**
   * Get distinct count for a single column.
   */
  async getDistinctCount(cacheKey: string, col: string): Promise<number> {
    const sql = `
      SELECT COUNT(DISTINCT "${col}") as cnt
      FROM "${cacheKey}"
      WHERE "${col}" IS NOT NULL
    `;

    const result = await duckdbService.query(sql);
    return result.rows[0]?.cnt ?? 0;
  }

  /**
   * Calculate rounding precision for a single dimension.
   */
  private async calculateSingleDimensionPrecision(
    cacheKey: string,
    col: string,
    targetBuckets: number
  ): Promise<number> {
    const sql = `
      SELECT MIN("${col}") as min_val, MAX("${col}") as max_val
      FROM "${cacheKey}"
      WHERE "${col}" IS NOT NULL
    `;

    const result = await duckdbService.query(sql);
    
    if (result.rows.length === 0) {
      return 2;
    }

    const { min_val, max_val } = result.rows[0];
    return this.calculatePrecisionForRange(
      Number(min_val),
      Number(max_val),
      targetBuckets
    );
  }
}

// Export singleton instance
export const chartQueryService = new ChartQueryService();

// Also export class for testing
export { ChartQueryService };

