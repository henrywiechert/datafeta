export function quoteIdent(name: string): string {
  // DuckDB uses standard SQL identifier quoting via double quotes.
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * DuckDB can end up with VARCHAR columns when upstream types are ambiguous.
 * For local aggregations, be defensive: strip embedded quote characters and TRY_CAST to DOUBLE.
 */
export function buildNumericExpr(colName: string): string {
  const col = quoteIdent(colName);
  // Goal:
  // - If the cached DuckDB column is already numeric, DON'T do expensive string parsing.
  // - If it's string-like, parse common numeric string formats.
  // - In both cases, treat NaN/Inf as NULL so SUM/AVG don't get poisoned.

  const isBadFloat = (expr: string) =>
    `LOWER(CAST(${expr} AS VARCHAR)) IN ('nan','-nan','inf','infinity','-inf','-infinity')`;

  // Numeric path: keep the value, but drop NaN/Inf.
  const numeric = `CASE
  WHEN ${col} IS NULL THEN NULL
  WHEN ${isBadFloat(col)} THEN NULL
  ELSE CAST(${col} AS DOUBLE)
END`;

  // String parsing path:
  // - Cast to VARCHAR, trim, remove embedded quotes, remove spaces
  // - If there's a '.', treat ',' as thousands separator (remove)
  // - Else, treat ',' as decimal separator (replace with '.')
  const cleaned = `REPLACE(REPLACE(TRIM(CAST(${col} AS VARCHAR)), '"', ''), ' ', '')`;
  const parsed = `TRY_CAST(CASE WHEN INSTR(${cleaned}, '.') > 0 THEN REPLACE(${cleaned}, ',', '') ELSE REPLACE(${cleaned}, ',', '.') END AS DOUBLE)`;
  const parsedSafe = `CASE
  WHEN ${parsed} IS NULL THEN NULL
  WHEN ${isBadFloat(parsed)} THEN NULL
  ELSE ${parsed}
END`;

  // Use DuckDB's typeof() to avoid guessing based on Arrow metadata.
  // typeof() returns strings like 'DOUBLE', 'VARCHAR', etc.
  return `CASE
  WHEN typeof(${col}) IN ('TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT','UTINYINT','USMALLINT','UINTEGER','UBIGINT','DECIMAL','REAL','FLOAT','DOUBLE') THEN (${numeric})
  ELSE (${parsedSafe})
END`;
}

export type MeasureLike = {
  field: string;
  aggregation?: string;
  alias: string;
};

export function buildMeasureExpr(m: MeasureLike): string {
  const fn = (m.aggregation || 'sum').toLowerCase();
  const alias = quoteIdent(m.alias);

  if (fn === 'count') return `COUNT(*) AS ${alias}`;
  if (fn === 'count_distinct') return `COUNT(DISTINCT ${quoteIdent(m.field)}) AS ${alias}`;
  if (fn === 'min') return `MIN(${buildNumericExpr(m.field)}) AS ${alias}`;
  if (fn === 'max') return `MAX(${buildNumericExpr(m.field)}) AS ${alias}`;
  if (fn === 'avg') return `AVG(${buildNumericExpr(m.field)}) AS ${alias}`;
  // default sum
  return `SUM(${buildNumericExpr(m.field)}) AS ${alias}`;
}

export function buildSelectSql(args: {
  tableName: string;
  columns: string[];
  whereClause?: string;
}): string {
  const selectCols = args.columns.map(quoteIdent).join(', ');
  let sql = `SELECT ${selectCols} FROM ${quoteIdent(args.tableName)}`;
  if (args.whereClause) sql += ` WHERE ${args.whereClause}`;
  return sql;
}

export function buildAggregateSql(args: {
  tableName: string;
  dimensionColumns: string[];
  measures: MeasureLike[];
  whereClause?: string;
}): string {
  const dimCols = args.dimensionColumns.map(quoteIdent);
  const selectDims = dimCols.join(', ');
  const selectMeasures = args.measures.map(buildMeasureExpr).join(', ');
  const selectList = [selectDims, selectMeasures].filter(Boolean).join(', ');

  let sql = `SELECT ${selectList} FROM ${quoteIdent(args.tableName)}`;
  if (args.whereClause) sql += ` WHERE ${args.whereClause}`;
  if (args.dimensionColumns.length > 0) {
    sql += ` GROUP BY ${dimCols.join(', ')}`;
  }
  return sql;
}

export function applyPointBudgetSql(
  baseSql: string,
  budget: { stratifyField?: string; maxRows: number; minPerStratum?: number }
): string {
  const { stratifyField, maxRows, minPerStratum = 0 } = budget;
  if (!baseSql) return baseSql;

  if (stratifyField) {
    const strat = quoteIdent(stratifyField);
    return `
WITH base AS (
  ${baseSql}
),
ranked AS (
  SELECT
    base.*,
    row_number() OVER (PARTITION BY ${strat} ORDER BY random()) AS rn,
    count(*) OVER (PARTITION BY ${strat}) AS cat_cnt,
    count(*) OVER () AS total_cnt
  FROM base
)
SELECT * FROM ranked
WHERE rn <= greatest(${minPerStratum}, cast(${maxRows} * cat_cnt / total_cnt as integer))
    `.trim();
  }

  return `SELECT * FROM (${baseSql}) AS base ORDER BY random() LIMIT ${maxRows}`;
}


