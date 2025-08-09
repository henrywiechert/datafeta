import * as Plot from '@observablehq/plot';
import { Field } from '../../types';

/**
 * Chart sizing strategies for different chart types in faceted environments
 */

export type ChartType = 'bar' | 'line' | 'scatter' | 'default';

export interface SizingRequirements {
  minWidth?: number;
  minHeight?: number;
  width?: number;
  height?: number;
  preferredAspectRatio?: number;
}

export interface ChartSizingContext {
  data: any[];
  measureField?: Field;
  dimensionField?: Field;
  facetFields?: Field[];
  chartType: ChartType;
  orientation: 'vertical' | 'horizontal';
  // New properties for measure faceting context
  isMeasureFaceting?: boolean;
  originalData?: any[]; // Original data before measure transformation
  measureCount?: number; // Number of measures being faceted
}

/**
 * Detects chart type from plot marks
 */
export function detectChartType(marks: Plot.Markish[]): ChartType {
  for (const mark of marks) {
    if (mark && typeof mark === 'object' && 'constructor' in mark) {
      const markName = mark.constructor.name.toLowerCase();
      
      if (markName.includes('bar')) return 'bar';
      if (markName.includes('line')) return 'line';
      if (markName.includes('dot') || markName.includes('scatter')) return 'scatter';
    }
  }
  
  return 'default';
}

/**
 * Bar chart sizing strategy: Based on bar thickness and number of categories
 */
export class BarChartSizingStrategy {
  private static readonly BAR_WIDTH = 40; // Base bar width/height
  private static readonly MIN_BAR_COUNT = 1; // Minimum bars for reasonable sizing

  static calculateSize(context: ChartSizingContext): SizingRequirements {
    const { data, dimensionField, orientation, facetFields, isMeasureFaceting, originalData } = context;
    const isFaceted = facetFields && facetFields.length > 0;

    // Special handling for measure faceting
    if (isMeasureFaceting && originalData) {
      console.log(`📏 Bar sizing for measure faceting scenario`);
      return this.calculateMeasureFacetingSize(context);
    }

    // When there is no dimension, we are often using a dummy dimension to control thickness.
    // In this case, we want a fixed, small size for the single bar.
    if (!dimensionField) {
      const size = this.BAR_WIDTH * 2; // e.g., 80px
      console.log(`📏 Sizing for a single bar (no dimension): ${size}px`);
      // Use min-dimension for faceted single bars, and absolute for non-faceted.
      if (isFaceted) {
        return orientation === 'vertical' ? { minWidth: size } : { minHeight: size };
      }
      return orientation === 'vertical' ? { width: size } : { height: size };
    }

    // Calculate size based on the number of categories.
    const categorySet = new Set(data.map(row => row[dimensionField.columnName]));
    const categoryCount = Math.max(categorySet.size, this.MIN_BAR_COUNT);
    const calculatedSize = categoryCount * this.BAR_WIDTH;

    // For faceted charts, use min-dimensions to let CSS handle overflow.
    // For single charts, set the absolute dimension to enforce scrolling.
    if (orientation === 'vertical') {
      return isFaceted ? { minWidth: calculatedSize } : { width: calculatedSize };
    } else {
      return isFaceted ? { minHeight: calculatedSize } : { height: calculatedSize };
    }
  }

  /**
   * Special sizing calculation for measure faceting scenarios.
   * In measure faceting, each facet represents one measure, and we want consistent bar thickness.
   */
  private static calculateMeasureFacetingSize(context: ChartSizingContext): SizingRequirements {
    const { originalData, dimensionField, orientation } = context;
    
    if (!originalData) {
      console.warn(`⚠️ No original data provided for measure faceting size calculation`);
      return { minWidth: this.BAR_WIDTH * 2, minHeight: this.BAR_WIDTH * 2 };
    }

    let categoryCount = this.MIN_BAR_COUNT;
    
    if (dimensionField) {
      // Calculate categories from original data (before measure transformation)
      const categorySet = new Set(originalData.map(row => row[dimensionField.columnName]));
      categoryCount = Math.max(categorySet.size, this.MIN_BAR_COUNT);
      console.log(`📊 Measure faceting: ${categoryCount} categories from dimension '${dimensionField.columnName}'`);
    } else {
      // No dimension field - each measure facet will have one bar
      categoryCount = 1;
      console.log(`📊 Measure faceting: Single bar per facet (no dimension)`);
    }

    const calculatedSize = categoryCount * this.BAR_WIDTH;
    console.log(`📏 Calculated size for measure faceting: ${calculatedSize}px (${categoryCount} categories × ${this.BAR_WIDTH}px)`);

    // For measure faceting, always use min dimensions to allow proper facet sizing
    if (orientation === 'vertical') {
      return { minWidth: calculatedSize };
    } else {
      return { minHeight: calculatedSize };
    }
  }
}

/**
 * Default sizing strategy: Fixed minimum sizes for line charts, scatter plots, etc.
 */
export class DefaultChartSizingStrategy {
  private static readonly MIN_CHART_WIDTH = 200;
  private static readonly MIN_CHART_HEIGHT = 150;
  private static readonly PREFERRED_ASPECT_RATIO = 4/3;

  static calculateSize(context: ChartSizingContext): SizingRequirements {
    return {
      minWidth: this.MIN_CHART_WIDTH,
      minHeight: this.MIN_CHART_HEIGHT,
      preferredAspectRatio: this.PREFERRED_ASPECT_RATIO
    };
  }
}

/**
 * Line chart sizing strategy: Similar to default but with different dimensions
 */
export class LineChartSizingStrategy {
  private static readonly MIN_CHART_WIDTH = 300;
  private static readonly MIN_CHART_HEIGHT = 200;
  private static readonly PREFERRED_ASPECT_RATIO = 3/2;

  static calculateSize(context: ChartSizingContext): SizingRequirements {
    return {
      minWidth: this.MIN_CHART_WIDTH,
      minHeight: this.MIN_CHART_HEIGHT,
      preferredAspectRatio: this.PREFERRED_ASPECT_RATIO
    };
  }
}

/**
 * Scatter plot sizing strategy: Square-ish for better data point visibility
 */
export class ScatterPlotSizingStrategy {
  private static readonly MIN_CHART_SIZE = 250;
  private static readonly PREFERRED_ASPECT_RATIO = 1; // Square

  static calculateSize(context: ChartSizingContext): SizingRequirements {
    return {
      minWidth: this.MIN_CHART_SIZE,
      minHeight: this.MIN_CHART_SIZE,
      preferredAspectRatio: this.PREFERRED_ASPECT_RATIO
    };
  }
}

/**
 * Main chart sizing coordinator
 */
export class ChartSizingCoordinator {
  /**
   * Calculate sizing requirements for a chart based on its type and context
   */
  static calculateSizing(context: ChartSizingContext): SizingRequirements {
    switch (context.chartType) {
      case 'bar':
        return BarChartSizingStrategy.calculateSize(context);
      case 'line':
        return LineChartSizingStrategy.calculateSize(context);
      case 'scatter':
        return ScatterPlotSizingStrategy.calculateSize(context);
      default:
        return DefaultChartSizingStrategy.calculateSize(context);
    }
  }

  /**
   * Apply sizing requirements to a Plot.PlotOptions object
   */
  static applySizing(plotOptions: Plot.PlotOptions, sizing: SizingRequirements): Plot.PlotOptions {
    const result = { ...plotOptions };

    // Apply exact dimensions if specified
    if (sizing.width) {
      result.width = sizing.width;
    }
    if (sizing.height) {
      result.height = sizing.height;
    }

    // For faceted charts with minimum sizes, use CSS-based approach
    // The container will handle overflow and scrolling
    if (sizing.minWidth || sizing.minHeight) {
      const newStyle: any = {
        minWidth: sizing.minWidth ? `${sizing.minWidth}px` : undefined,
        minHeight: sizing.minHeight ? `${sizing.minHeight}px` : undefined,
      };

      if (result.style) {
        Object.assign(newStyle, result.style);
      }
      
      result.style = newStyle;
    }

    return result;
  }

  /**
   * Calculate faceted chart container requirements
   */
  static calculateFacetedContainerSizing(
    individualSizing: SizingRequirements,
    facetCount: { fx?: number; fy?: number }
  ): { containerMinWidth?: number; containerMinHeight?: number; enableScrolling: boolean } {
    let containerMinWidth: number | undefined;
    let containerMinHeight: number | undefined;
    let enableScrolling = false;

    // Calculate container dimensions based on facet grid
    if (facetCount.fx && (individualSizing.width || individualSizing.minWidth)) {
      const chartWidth = individualSizing.width || individualSizing.minWidth || 200;
      containerMinWidth = chartWidth * facetCount.fx;
      
      // Enable horizontal scrolling if container would be too wide
      if (containerMinWidth > 1200) { // Reasonable max container width
        enableScrolling = true;
      }
    }

    if (facetCount.fy && (individualSizing.height || individualSizing.minHeight)) {
      const chartHeight = individualSizing.height || individualSizing.minHeight || 150;
      containerMinHeight = chartHeight * facetCount.fy;
      
      // Enable vertical scrolling if container would be too tall
      if (containerMinHeight > 800) { // Reasonable max container height
        enableScrolling = true;
      }
    }

    return {
      containerMinWidth,
      containerMinHeight,
      enableScrolling
    };
  }
}