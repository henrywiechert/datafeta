import React, { useMemo, useCallback, useState, useRef } from 'react';
import { AgGridReact } from 'ag-grid-react';
import {
  ColDef,
  ModuleRegistry,
  AllCommunityModule,
  SortChangedEvent,
  CellContextMenuEvent,
  GridApi,
} from 'ag-grid-community';
import { Box, Typography } from '@mui/material';

import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-material.css';

import { TableRowsSortModel } from '../ChartArea/hooks/useTableRowsQuery';
import { QueryResultColumn } from '../../../types';
import { mapBackendDataType } from '../../../utils/fieldUtils';
import ContextMenu from '../ContextMenu';
import menuStyles from '../ContextMenu.module.css';

ModuleRegistry.registerModules([AllCommunityModule]);

/**
 * Detect the epoch unit from magnitude and return { ms (for Date), microsFraction (0–999999) }.
 * Handles seconds, milliseconds, microseconds, and nanoseconds.
 */
function epochToComponents(num: number): { ms: number; microsFraction: number } | null {
  if (!Number.isFinite(num)) return null;
  const abs = Math.abs(num);
  let ms: number;
  let microsFraction: number;
  if (abs >= 1e18) {
    // nanoseconds → µs fraction = (ns / 1000) % 1_000_000
    ms = num / 1_000_000;
    microsFraction = Math.abs(Math.trunc(num / 1000) % 1_000_000);
  } else if (abs >= 1e15) {
    // microseconds → µs fraction = value % 1_000_000
    ms = num / 1000;
    microsFraction = Math.abs(Math.trunc(num) % 1_000_000);
  } else if (abs >= 1e12) {
    // milliseconds — may carry sub-ms precision as a fractional part
    // (apache-arrow returns epoch-ms floats like 1762955629225.794 for µs data)
    ms = num;
    const msInSecond = Math.abs(Math.trunc(num) % 1000);
    const subMsFraction = Math.abs(num) % 1;
    microsFraction = msInSecond * 1000 + Math.round(subMsFraction * 1000);
  } else {
    // seconds → no sub-second data
    ms = num * 1000;
    microsFraction = 0;
  }
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? { ms, microsFraction } : null;
}

function epochToDate(num: number): Date | null {
  const c = epochToComponents(num);
  return c ? new Date(c.ms) : null;
}

function formatEpochHighPrecision(num: number): string | null {
  const c = epochToComponents(num);
  if (!c) return null;
  const d = new Date(c.ms);
  if (!Number.isFinite(d.getTime())) return null;
  const frac = c.microsFraction.toString().padStart(6, '0');
  return `${d.toLocaleString()}.${frac}`;
}

function formatDate(d: Date, highPrecision: boolean): string {
  if (!highPrecision) return d.toLocaleString();
  const ms = d.getMilliseconds().toString().padStart(3, '0');
  return `${d.toLocaleString()}.${ms}000`;
}

/** True when the backend column type has sub-second precision (DateTime64, Timestamp(p), etc.). */
function isHighPrecisionDatetime(colType: string): boolean {
  const lower = colType.toLowerCase();
  return lower.includes('datetime64') || lower.includes('timestamp');
}

/** Payload emitted by the table context menu filter action. */
export interface TableCellFilterAction {
  action: 'keep' | 'exclude';
  columnName: string;
  /** One or more raw values (multi-row selection supported). */
  values: any[];
}

interface TableViewRowsProps {
  rows: Record<string, any>[];
  columns: QueryResultColumn[];
  sortModel: TableRowsSortModel | null;
  onSortChanged: (sort: TableRowsSortModel | null) => void;
  loading: boolean;
  /** Callback for context-menu filter actions (keep only / exclude). */
  onCellFilterAction?: (action: TableCellFilterAction) => void;
}

/** Truncate a display value for the context menu label. */
const truncate = (v: any, maxLen = 24): string => {
  const s = v === null || v === undefined ? 'null' : String(v);
  return s.length > maxLen ? s.slice(0, maxLen) + '…' : s;
};

const TableViewRows: React.FC<TableViewRowsProps> = ({
  rows,
  columns,
  sortModel,
  onSortChanged,
  loading,
  onCellFilterAction,
}) => {
  const gridApiRef = useRef<GridApi | null>(null);

  // Context menu state
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [menuContext, setMenuContext] = useState<{
    columnName: string;
    values: any[];
    displayLabel: string;
  } | null>(null);

  const datetimeColumnsMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const col of columns) {
      if (mapBackendDataType(col.type) === 'datetime') {
        map.set(col.name, isHighPrecisionDatetime(col.type));
      }
    }
    return map;
  }, [columns]);

  const columnDefs: ColDef[] = useMemo(() => {
    return columns.map((col) => {
      const highPrecision = datetimeColumnsMap.get(col.name);
      const isDatetime = highPrecision !== undefined;
      const withMs = highPrecision === true;
      return {
        field: col.name,
        headerName: col.name,
        sortable: true,
        resizable: true,
        minWidth: 80,
        valueGetter: (params: any) => params.data?.[col.name],
        valueFormatter: (params: any) => {
          if (params.value === null || params.value === undefined) return '';
          if (isDatetime) {
            if (typeof params.value === 'bigint' || typeof params.value === 'number') {
              if (withMs) {
                const s = formatEpochHighPrecision(Number(params.value));
                if (s) return s;
              }
              const d = epochToDate(Number(params.value));
              if (d) return d.toLocaleString();
            }
            if (params.value instanceof Date) return formatDate(params.value, withMs);
            if (typeof params.value === 'string') {
              const parsed = new Date(params.value);
              if (!isNaN(parsed.getTime())) return formatDate(parsed, withMs);
            }
            return String(params.value);
          }
          if (typeof params.value === 'number') return params.value.toLocaleString();
          if (params.value instanceof Date) return params.value.toLocaleString();
          return String(params.value);
        },
      };
    });
  }, [columns, datetimeColumnsMap]);

  const handleSortChanged = useCallback(
    (event: SortChangedEvent) => {
      const colState = event.api.getColumnState();
      const sorted = colState.find((c) => c.sort);
      if (sorted && sorted.colId) {
        onSortChanged({ field: sorted.colId, direction: sorted.sort as 'asc' | 'desc' });
      } else {
        onSortChanged(null);
      }
    },
    [onSortChanged],
  );

  // Right-click handler: gather selected row values and show context menu
  const handleCellContextMenu = useCallback(
    (event: CellContextMenuEvent) => {
      const browserEvent = event.event as MouseEvent | undefined;
      if (!browserEvent || !onCellFilterAction) return;
      browserEvent.preventDefault();

      const colId = event.column?.getColId();
      if (!colId) return;

      const api = event.api;
      const selectedRows = api.getSelectedRows();

      // If 2+ rows are selected, use values from all selected rows for this column
      // Otherwise, use the single right-clicked cell value
      let values: any[];
      let displayLabel: string;

      if (selectedRows.length >= 2) {
        values = Array.from(new Set(selectedRows.map((r) => r[colId])));
        displayLabel = `${values.length} selected values`;
      } else {
        const cellValue = event.data?.[colId];
        values = [cellValue];
        displayLabel = truncate(cellValue);
      }

      setMenuContext({ columnName: colId, values, displayLabel });
      setMenuPosition({ x: browserEvent.clientX, y: browserEvent.clientY });
    },
    [onCellFilterAction],
  );

  const closeMenu = useCallback(() => {
    setMenuPosition(null);
    setMenuContext(null);
  }, []);

  const handleKeepOnly = useCallback(() => {
    if (menuContext && onCellFilterAction) {
      onCellFilterAction({ action: 'keep', columnName: menuContext.columnName, values: menuContext.values });
    }
    closeMenu();
  }, [menuContext, onCellFilterAction, closeMenu]);

  const handleExclude = useCallback(() => {
    if (menuContext && onCellFilterAction) {
      onCellFilterAction({ action: 'exclude', columnName: menuContext.columnName, values: menuContext.values });
    }
    closeMenu();
  }, [menuContext, onCellFilterAction, closeMenu]);

  if (columns.length === 0 && !loading) {
    return (
      <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography variant="body1" color="text.secondary">
          Add fields to axes or encoding channels to view data.
        </Typography>
      </Box>
    );
  }

  return (
    <div className="ag-theme-material" style={{ height: '100%', width: '100%' }}>
      <AgGridReact
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={{
          sortable: true,
          resizable: true,
          minWidth: 80,
          cellStyle: { textAlign: 'left' as const },
          valueFormatter: (params: any) =>
            params.value === null || params.value === undefined ? '' : String(params.value),
        }}
        pagination={false}
        animateRows={false}
        rowSelection="multiple"
        suppressRowClickSelection={false}
        domLayout="normal"
        loading={loading}
        onGridReady={(params) => {
          gridApiRef.current = params.api;
          params.api.sizeColumnsToFit();
        }}
        onSortChanged={handleSortChanged}
        onCellContextMenu={handleCellContextMenu}
        suppressHorizontalScroll={false}
        preventDefaultOnContextMenu={true}
      />

      {/* Context menu for "Keep only" / "Exclude" */}
      {menuPosition && menuContext && (
        <ContextMenu position={menuPosition} onClose={closeMenu}>
          <div className={menuStyles.menuItem} onClick={handleKeepOnly}>
            Keep only {menuContext.displayLabel}
          </div>
          <div className={menuStyles.menuItem} onClick={handleExclude}>
            Exclude {menuContext.displayLabel}
          </div>
        </ContextMenu>
      )}
    </div>
  );
};

export default TableViewRows;
