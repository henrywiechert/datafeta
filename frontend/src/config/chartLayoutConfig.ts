// Central layout constants for chart grid and intrinsic sizing

export const MIN_GRID_COLUMN_PX = 120;
export const MIN_GRID_ROW_PX = 120;

// Fixed bar thickness step for categorical axis sizing in bar charts
export const BAR_STEP_PX = 40;

// Minimum bar thickness step when resizing down (allows shrinking bars)
// Minimum resize size = categories * MIN_BAR_STEP_PX
export const MIN_BAR_STEP_PX = 15;

// Default chart color used across all chart types
export const DEFAULT_CHART_COLOR = 'steelblue';

// Default color scheme for categorical color encoding
// Using Paired for better support of many categories (12 distinct paired colors)
export const DEFAULT_COLOR_SCHEME = 'Paired' as const;

// Shared ratios and paddings for domains and band scales
export const DOMAIN_PAD_RATIO = 0.05;
export const BAND_PADDING = 0.1;

// Minimum track multipliers and series panes
export const MIN_BAND_TRACKS = 1; // Minimum number of band steps to allocate
export const MIN_SERIES_PANES = 1; // Minimum panes when splitting series per facet

// Grid visual constants
export const GRID_DIVIDER_COLOR = '#99a795';
export const NAMES_BAND_LEFT_PX = 20;
export const VALUES_BAND_LEFT_PX = 20;
export const VALUES_BAND_TOP_PX = 20;
export const X_LABEL_ROW_PX = 20;
export const VERTICAL_SCROLLBAR_GUTTER_PX = 14;
export const HORIZONTAL_SCROLLBAR_GUTTER_PX = 16;

// Table-refactor (table chart type) layout constants.
// Compact bands and short rows so a table with many discrete tuples is
// readable at a glance — closer to a Tableau text-table than to a chart.
export const MIN_NON_PLOT_GRID_ROW_PX = 28;
export const TABLE_NAMES_BAND_LEFT_PX = 88;
export const TABLE_VALUES_BAND_LEFT_PX = 96;
export const TABLE_VALUES_BAND_TOP_PX = 18;

// Heatmap layout constants.
// Reset-to-auto should size a facet from its cell counts rather than from the
// generic facet floor, while manual resize can still shrink below that default.
export const HEATMAP_DEFAULT_CELL_SIZE_PX = 14;
export const HEATMAP_MIN_CELL_SIZE_PX = 1;

// Resize handle constants (for future dynamic resize feature)
export const RESIZE_HANDLE_WIDTH = 2;
export const RESIZE_HANDLE_COLOR = '#99a795';
export const RESIZE_HANDLE_HOVER_COLOR = '#6b7a67';

// Aggressive min/max for cell resize (will be refined per chart type later)
export const MIN_CELL_WIDTH_PX = 50;
export const MAX_CELL_WIDTH_PX = 5000;
export const MIN_CELL_HEIGHT_PX = 50;
export const MAX_CELL_HEIGHT_PX = 5000;
export const MIN_FACET_WIDTH_PX = 16;
export const MAX_FACET_WIDTH_PX = 800;
export const MIN_FACET_HEIGHT_PX = 16;
export const MAX_FACET_HEIGHT_PX = 400;

// Gantt chart constants
// Base pixels per data unit for intrinsic width calculation
// Future zoom will multiply this value (zoomLevel * GANTT_UNIT_PX)
export const GANTT_UNIT_PX = 10;
export const MIN_GANTT_WIDTH_PX = 200;
export const MAX_GANTT_WIDTH_PX = 10000;

// Chart-specific default sizes for manualSize (1-50 range)
// These values represent "reasonable" defaults for each chart type
export const SIZE_DEFAULTS_BY_CHART_TYPE: Record<string, number> = {
  scatter: 5,   // 5px dot radius
  line: 2,      // 2px stroke width
  bar: 40,      // Low band padding (thick bars)
  tick: 40,     // Low band padding (thick marks)
  gantt: 40,    // Low band padding (thick task bars)
  pie: 40,      // Large default radius within each cell
  heatmap: 40,  // Cells fill their band; size is not user-tweaked.
  'table-refactor': 8, // Symbol radius (px); ~π·8² ≈ 200 area, matching legacy default mark.
};

// Default for auto-detected or unknown chart types
export const SIZE_DEFAULT_FALLBACK = 10;
