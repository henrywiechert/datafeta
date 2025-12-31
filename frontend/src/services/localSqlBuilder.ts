export function quoteIdent(name: string): string {
  // DuckDB uses standard SQL identifier quoting via double quotes.
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Build a robust DuckDB timestamp expression for a column that might be typed as
 * TIMESTAMP/DATE already or might be a string.
 *
 * We prefer not to throw: if parsing fails, return NULL (TRY_CAST).
 */
export function buildDuckDbTimestampExpr(colName: string): string {
  const col = quoteIdent(colName);
  // DuckDB typeof() returns strings like 'TIMESTAMP', 'DATE', 'VARCHAR', ...
  // Treat DATE/TIMESTAMP* as safe; otherwise try-cast from string-like columns.
  //
  // Many CSV-derived datasets store time as epoch seconds/milliseconds in an integer column.
  // In those cases, TRY_CAST(... AS TIMESTAMP) will not work, but to_timestamp()/epoch_ms() will.
  const numericTypes =
    "('TINYINT','SMALLINT','INTEGER','BIGINT','HUGEINT','UTINYINT','USMALLINT','UINTEGER','UBIGINT','DECIMAL','REAL','FLOAT','DOUBLE')";
  return `CASE
  WHEN ${col} IS NULL THEN NULL
  WHEN typeof(${col}) LIKE 'TIMESTAMP%' THEN CAST(${col} AS TIMESTAMP)
  WHEN typeof(${col}) = 'DATE' THEN CAST(${col} AS TIMESTAMP)
  WHEN typeof(${col}) = 'TIMESTAMPTZ' THEN CAST(${col} AS TIMESTAMP)
  WHEN typeof(${col}) IN ${numericTypes} THEN
    CASE
      -- Heuristic: epoch milliseconds are typically >= 1e12 (vs seconds ~ 1e9).
      WHEN abs(CAST(${col} AS DOUBLE)) >= 1e12 THEN CAST(epoch_ms(CAST(${col} AS BIGINT)) AS TIMESTAMP)
      ELSE CAST(to_timestamp(CAST(${col} AS DOUBLE)) AS TIMESTAMP)
    END
  ELSE TRY_CAST(${col} AS TIMESTAMP)
END`;
}

export type SelectItem =
  | { kind: 'column'; column: string; alias?: string }
  | { kind: 'expr'; expr: string; alias: string };

export function buildSelectItemSql(item: SelectItem): string {
  if (item.kind === 'column') {
    const col = quoteIdent(item.column);
    if (item.alias && item.alias !== item.column) {
      return `${col} AS ${quoteIdent(item.alias)}`;
    }
    return col;
  }
  return `${item.expr} AS ${quoteIdent(item.alias)}`;
}

/**
 * Build DuckDB SQL expression for datetime parts in UTC.
 *
 * Modes:
 * - distinct: bounded part extraction (minute 0-59, hour 0-23, ...)
 * - timeline: date_trunc bins along the full timeline
 *
 * Weekday (distinct) is normalized to ISO (Mon=1 ... Sun=7).
 */
export function buildDuckDbDateTimePartSelectItem(args: {
  field: string;
  datePart: string;
  dateMode: string;
}): SelectItem {
  const { field, datePart, dateMode } = args;
  const alias = `${field}_${datePart}_${dateMode}`;
  const ts = buildDuckDbTimestampExpr(field);

  // We interpret timestamps as UTC in local DuckDB. Most cached timestamps are timezone-naive
  // and already represent UTC, so this is intentionally a no-op beyond robust parsing.
  const utcTs = ts;

  if (dateMode === 'timeline') {
    // Special-case weekday timeline: treat as day-binning (same as backend)
    const unit = datePart === 'weekday' ? 'day' : datePart;
    return { kind: 'expr', expr: `date_trunc('${unit}', ${utcTs})`, alias };
  }

  if (datePart === 'weekday') {
    // DuckDB EXTRACT(DOW) is 0=Sunday..6=Saturday; normalize to ISO weekday 1=Mon..7=Sun.
    const dow = `EXTRACT(DOW FROM ${utcTs})`;
    const iso = `((CAST(${dow} AS INTEGER) + 6) % 7) + 1`;
    return { kind: 'expr', expr: iso, alias };
  }

  // Distinct mode for supported parts
  return { kind: 'expr', expr: `EXTRACT(${datePart.toUpperCase()} FROM ${utcTs})`, alias };
}

export function buildDuckDbDateTimePartExpr(args: {
  field: string;
  datePart: string;
  dateMode: string;
}): string {
  const item = buildDuckDbDateTimePartSelectItem(args);
  // DateTime parts always produce an expression; fall back defensively.
  return item.kind === 'expr' ? item.expr : quoteIdent(args.field);
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
  columns?: string[];
  selectItems?: SelectItem[];
  whereClause?: string;
}): string {
  const items: SelectItem[] =
    args.selectItems && args.selectItems.length > 0
      ? args.selectItems
      : (args.columns || []).map((c) => ({ kind: 'column', column: c }));
  const selectCols = items.map(buildSelectItemSql).join(', ');
  let sql = `SELECT ${selectCols} FROM ${quoteIdent(args.tableName)}`;
  if (args.whereClause) sql += ` WHERE ${args.whereClause}`;
  return sql;
}

export function buildAggregateSql(args: {
  tableName: string;
  dimensionColumns?: string[];
  dimensionSelectItems?: SelectItem[];
  measures: MeasureLike[];
  whereClause?: string;
}): string {
  const dimItems: SelectItem[] =
    args.dimensionSelectItems && args.dimensionSelectItems.length > 0
      ? args.dimensionSelectItems
      : (args.dimensionColumns || []).map((c) => ({ kind: 'column', column: c }));
  const selectDims = dimItems.map(buildSelectItemSql).join(', ');
  const groupByCols = dimItems.map((d) =>
    d.kind === 'expr' ? quoteIdent(d.alias) : quoteIdent(d.alias || d.column)
  );
  const selectMeasures = args.measures.map(buildMeasureExpr).join(', ');
  const selectList = [selectDims, selectMeasures].filter(Boolean).join(', ');

  let sql = `SELECT ${selectList} FROM ${quoteIdent(args.tableName)}`;
  if (args.whereClause) sql += ` WHERE ${args.whereClause}`;
  if (groupByCols.length > 0) {
    sql += ` GROUP BY ${groupByCols.join(', ')}`;
  }
  return sql;
}

export function applyPointBudgetSql(
  baseSql: string,
  budget: { 
    stratifyField?: string; 
    maxRows: number; 
    minPerStratum?: number;
    strategy?: 'none' | 'random' | 'stratified' | 'preserve_extremes';
    preserveFields?: string[];
  }
): string {
  const { stratifyField, maxRows, minPerStratum = 0, strategy, preserveFields } = budget;
  if (!baseSql) return baseSql;

  // Handle preserve_extremes strategy for scatter plots
  if (strategy === 'preserve_extremes' && preserveFields && preserveFields.length > 0) {
    // Build extreme selects for each field (MIN and MAX)
    const extremeSelects = preserveFields.flatMap(field => {
      const qf = quoteIdent(field);
      return [
        `SELECT * FROM base WHERE ${qf} = (SELECT MIN(${qf}) FROM base)`,
        `SELECT * FROM base WHERE ${qf} = (SELECT MAX(${qf}) FROM base)`,
      ];
    });
    const extremesUnion = extremeSelects.join('\nUNION ALL\n');
    const reservedForExtremes = preserveFields.length * 2;
    const sampleLimit = Math.max(1, maxRows - reservedForExtremes);

    return `
WITH base AS (
  ${baseSql}
),
extremes AS (
${extremesUnion}
),
sample AS (
  SELECT * FROM base ORDER BY random() LIMIT ${sampleLimit}
)
SELECT * FROM extremes
UNION ALL
SELECT * FROM sample
    `.trim();
  }

  // Stratified sampling with discrete color/category field
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

  // Fallback: random sampling
  return `SELECT * FROM (${baseSql}) AS base ORDER BY random() LIMIT ${maxRows}`;
}


