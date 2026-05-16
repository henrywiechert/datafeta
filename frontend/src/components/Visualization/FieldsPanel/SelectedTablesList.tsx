// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import {
  Box,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  Tooltip,
  Typography,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import type { Field } from '../../../types';
import { formatCompactCount } from '../../../utils/compactCount';
import styles from './SelectedTablesList.module.css';

type UnionTableRef = { database: string; table_name: string };

interface SelectedTablesListProps {
  primaryDatabase: string;
  primaryTable: string;
  unionTables: UnionTableRef[];
  joinedTables?: string[];
  availableFields?: Field[];
  onRemovePrimary: () => void;
  onRemoveUnionTable: (database: string, tableName: string) => void;
  onRemoveJoinedTable?: (tableName: string) => void;
}

// ── Shared types ──────────────────────────────────────────────────────

type StatValue = 'loading' | 'error' | number;
type RowTarget = { key: string; table: string; database?: string };

// ── Column counting from field attribution ────────────────────────────

function countColumnsForTable(
  availableFields: Field[] | undefined,
  tableName: string,
  primaryTableName: string,
  hasSecondaryTables: boolean
): number | undefined {
  if (!availableFields?.length) return undefined;
  const physical = availableFields.filter((f) => !f.is_virtual);
  if (physical.length === 0) return undefined;

  const tagged = physical.filter((f) => f.sourceTable);
  if (tagged.length > 0) {
    const n = physical.filter((f) => f.sourceTable === tableName).length;
    return n > 0 ? n : undefined;
  }

  // Untagged fields: only valid for true single-table mode.
  // In UNION mode fields are untagged but physical.length is the merged
  // superset — not any individual table's count — so we must fall through
  // to the per-table listColumns fetch.
  if (hasSecondaryTables) return undefined;
  return tableName === primaryTableName ? physical.length : undefined;
}

// ── Generic parallel-fetch hook (shared by row counts & column counts) ─

function useParallelFetch<T>(
  targets: RowTarget[],
  fetchFn: (
    api: typeof import('../../../services/api/metadataApi')['metadataApi'],
    target: RowTarget,
    signal: AbortSignal
  ) => Promise<T>,
  /** Extra key that triggers re-fetch even if targets haven't changed. */
  extraKey: string = ''
): Record<string, StatValue> {
  const [state, setState] = React.useState<Record<string, StatValue>>({});

  const targetsKey = React.useMemo(
    () => JSON.stringify([...targets].sort((a, b) => a.key.localeCompare(b.key))),
    [targets]
  );

  React.useEffect(() => {
    if (targets.length === 0) {
      setState({});
      return;
    }

    const ac = new AbortController();
    const loading: Record<string, StatValue> = {};
    targets.forEach((t) => { loading[t.key] = 'loading'; });
    setState(loading);

    (async () => {
      const { metadataApi } = await import('../../../services/api/metadataApi');
      if (ac.signal.aborted) return;

      targets.forEach((target) => {
        fetchFn(metadataApi, target, ac.signal)
          .then((value) => {
            if (ac.signal.aborted) return;
            setState((prev) => ({ ...prev, [target.key]: value as number }));
          })
          .catch((err: Error) => {
            if (err.name === 'AbortError' || ac.signal.aborted) return;
            setState((prev) => ({ ...prev, [target.key]: 'error' }));
          });
      });
    })();

    return () => ac.abort();
    // targets mirrored by targetsKey; additional invalidation via extraKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetsKey, extraKey]);

  return state;
}

// ── Row-count and column-count hooks ──────────────────────────────────

function useTableRowStats(targets: RowTarget[]): Record<string, StatValue> {
  return useParallelFetch(targets, (api, { table, database }, signal) =>
    api.getRowCount(table, database || undefined, undefined, undefined, undefined, signal)
  );
}

function useColumnCounts(
  targets: RowTarget[],
  availableFields: Field[] | undefined,
  primaryTableName: string,
  hasSecondaryTables: boolean
): Record<string, StatValue> {
  /** Stable key that changes only when field-to-table attribution actually changes. */
  const fieldsKey = React.useMemo(() => {
    if (!availableFields?.length) return 'empty';
    const physical = availableFields.filter((f) => !f.is_virtual);
    if (physical.length === 0) return 'empty';
    if (!physical.some((f) => f.sourceTable)) return 'untagged';
    return physical
      .map((f) => `${f.columnName}\0${f.sourceTable ?? ''}`)
      .sort()
      .join('\n');
  }, [availableFields]);

  const needFetch = React.useMemo(
    () => targets.filter(
      (t) => countColumnsForTable(availableFields, t.table, primaryTableName, hasSecondaryTables) === undefined
    ),
    // fieldsKey is a stable derivative of availableFields
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [targets, primaryTableName, hasSecondaryTables, fieldsKey]
  );

  return useParallelFetch(
    needFetch,
    (api, { table, database }, signal) =>
      api.listColumns(table, database || undefined, signal).then((r) => r.columns?.length ?? 0),
    fieldsKey
  );
}

// ── Presentational helpers ────────────────────────────────────────────

function StatLabel({ rowStat, colCount, colLoading }: {
  rowStat?: StatValue;
  colCount?: number;
  colLoading?: boolean;
}) {
  const rowLabel = rowStat === 'loading' || rowStat === undefined ? '…'
    : rowStat === 'error' ? '—'
    : formatCompactCount(rowStat);
  const colLabel = colLoading ? '…' : colCount === undefined ? '—' : formatCompactCount(colCount);

  const colTitle = colLoading ? 'Loading…' : colCount !== undefined ? `${colCount} columns` : '— columns';
  const title = typeof rowStat === 'number'
    ? `${rowStat.toLocaleString()} rows · ${colTitle}`
    : rowStat === 'loading'
      ? `Loading… · ${colTitle}`
      : `— rows · ${colTitle}`;

  return (
    <Tooltip title={title} placement="left">
      <span className={styles.stats}>{rowLabel} · {colLabel}</span>
    </Tooltip>
  );
}

type BadgeVariant = 'P' | 'J' | 'U';
const badgeClasses: Record<BadgeVariant, string> = {
  P: styles.badgeP,
  J: styles.badgeJ,
  U: styles.badgeU,
};
const badgeTooltips: Record<BadgeVariant, string> = {
  P: 'Primary',
  J: 'Join',
  U: 'Union',
};

function TableRow({
  badge,
  database,
  table,
  primaryTableName,
  hasSecondaryTables,
  availableFields,
  rowStat,
  statKey,
  fetchedCols,
  onRemove,
}: {
  badge: BadgeVariant;
  database: string;
  table: string;
  primaryTableName: string;
  hasSecondaryTables: boolean;
  availableFields?: Field[];
  rowStat?: StatValue;
  statKey: string;
  fetchedCols: Record<string, StatValue>;
  onRemove?: () => void;
}) {
  const hasDb = !!database;
  const fromFields = countColumnsForTable(availableFields, table, primaryTableName, hasSecondaryTables);
  const fetched = fetchedCols[statKey];
  const colCount = fromFields ?? (typeof fetched === 'number' ? fetched : undefined);
  const colLoading = fromFields === undefined && fetched === 'loading';

  return (
    <ListItem divider className={styles.listItem}>
      <ListItemText
        disableTypography
        className={styles.listItemText}
        primary={
          <Box className={styles.row}>
            <Tooltip title={badgeTooltips[badge]}>
              <span className={`${styles.badge} ${badgeClasses[badge]}`}>{badge}</span>
            </Tooltip>
            <Box className={styles.nameAndStats}>
              <Box className={styles.names}>
                {hasDb && (
                  <Typography component="span" className={styles.dbLine} noWrap title={database}>
                    {database}
                  </Typography>
                )}
                <Typography component="span" className={styles.tableLine} noWrap title={table}>
                  {table}
                </Typography>
              </Box>
              <StatLabel rowStat={rowStat} colCount={colCount} colLoading={colLoading} />
            </Box>
          </Box>
        }
      />
      {onRemove && (
        <ListItemSecondaryAction className={styles.secondaryAction}>
          <IconButton
            size="small"
            edge="end"
            aria-label={`Remove ${table}`}
            onClick={onRemove}
            sx={{ padding: '2px' }}
          >
            <DeleteOutlineIcon sx={{ fontSize: '1rem' }} />
          </IconButton>
        </ListItemSecondaryAction>
      )}
    </ListItem>
  );
}

// ── Main component ────────────────────────────────────────────────────

const SelectedTablesList: React.FC<SelectedTablesListProps> = ({
  primaryDatabase,
  primaryTable,
  unionTables,
  joinedTables = [],
  availableFields,
  onRemovePrimary,
  onRemoveUnionTable,
  onRemoveJoinedTable,
}) => {
  const [expanded, setExpanded] = React.useState(true);
  const hasPrimary = !!primaryTable;
  const hasAny = hasPrimary || unionTables.length > 0 || joinedTables.length > 0;

  const sortedJoined = React.useMemo(
    () => [...joinedTables].sort((a, b) => a.localeCompare(b)),
    [joinedTables]
  );

  const rowTargets = React.useMemo((): RowTarget[] => {
    if (!hasAny) return [];
    const out: RowTarget[] = [];
    if (hasPrimary) {
      out.push({ key: 'primary', table: primaryTable, database: primaryDatabase || undefined });
    }
    sortedJoined.forEach((t) => {
      out.push({ key: `join:${t}`, table: t, database: primaryDatabase || undefined });
    });
    unionTables.forEach((u) => {
      out.push({ key: `union:${u.database}:${u.table_name}`, table: u.table_name, database: u.database || undefined });
    });
    return out;
  }, [hasAny, hasPrimary, primaryTable, primaryDatabase, sortedJoined, unionTables]);

  const hasSecondaryTables = sortedJoined.length > 0 || unionTables.length > 0;
  const rowStats = useTableRowStats(rowTargets);
  const fetchedCols = useColumnCounts(rowTargets, availableFields, primaryTable, hasSecondaryTables);

  if (!hasAny) return null;

  const entryCount = (hasPrimary ? 1 : 0) + sortedJoined.length + unionTables.length;

  return (
    <Box className={styles.container}>
      <Box className={styles.header}>
        <Typography
          variant="subtitle2"
          fontWeight="bold"
          align="left"
          className={styles.sectionTitle}
          component="span"
        >
          Selected Tables
          {!expanded && (
            <Typography component="span" variant="caption" className={styles.collapsedCount}>
              {' '}({entryCount})
            </Typography>
          )}
        </Typography>
        <IconButton
          size="small"
          onClick={() => setExpanded((e) => !e)}
          className={styles.expandButton}
          aria-expanded={expanded}
          aria-controls="selected-tables-list"
          aria-label={expanded ? 'Collapse selected tables' : 'Expand selected tables'}
        >
          {expanded ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
        </IconButton>
      </Box>

      <Collapse in={expanded}>
        <List dense disablePadding className={styles.list} id="selected-tables-list">
          {hasPrimary && (
            <TableRow
              key="primary"
              badge="P"
              database={primaryDatabase}
              table={primaryTable}
              primaryTableName={primaryTable}
              hasSecondaryTables={hasSecondaryTables}
              availableFields={availableFields}
              rowStat={rowStats.primary}
              statKey="primary"
              fetchedCols={fetchedCols}
              onRemove={onRemovePrimary}
            />
          )}

          {sortedJoined.map((tableName) => (
            <TableRow
              key={`join:${tableName}`}
              badge="J"
              database={primaryDatabase}
              table={tableName}
              primaryTableName={primaryTable}
              hasSecondaryTables={hasSecondaryTables}
              availableFields={availableFields}
              rowStat={rowStats[`join:${tableName}`]}
              statKey={`join:${tableName}`}
              fetchedCols={fetchedCols}
              onRemove={onRemoveJoinedTable ? () => onRemoveJoinedTable(tableName) : undefined}
            />
          ))}

          {unionTables.map((t) => {
            const key = `union:${t.database}:${t.table_name}`;
            return (
              <TableRow
                key={key}
                badge="U"
                database={t.database}
                table={t.table_name}
                primaryTableName={primaryTable}
                hasSecondaryTables={hasSecondaryTables}
                availableFields={availableFields}
                rowStat={rowStats[key]}
                statKey={key}
                fetchedCols={fetchedCols}
                onRemove={() => onRemoveUnionTable(t.database, t.table_name)}
              />
            );
          })}
        </List>
      </Collapse>
    </Box>
  );
};

export default SelectedTablesList;
