## ChartGrid Module Architecture

The `ChartGrid` module is the **rendering engine** for Observable Plot faceted charts. It implements a sophisticated **three-layer scrolling system** to handle arbitrarily large grid layouts with independent horizontal and vertical scrolling while keeping axes aligned.

---

### **Module Structure**

```
ChartGrid/
├── ChartGrid.tsx            # Main orchestrator, hooks composition
├── MultiPlotGrid.tsx        # Three-layer scrolling architecture
├── PlotArea.tsx             # CSS Grid with actual ObservablePlot cells
├── XAxes.tsx                # Bottom X-axis strip (one per column)
├── YAxes.tsx                # Left Y-axis strip (one per row)
├── FacetLabels.tsx          # Top/Left hierarchical facet headers
├── GridResizeOverlay.tsx    # Interactive column/row resize handles
├── GridResizeHandle.tsx     # Individual resize handle component
├── VirtualResizeLine.tsx    # Visual feedback line during resize
├── ChartGrid.module.css     # Grid layout styles
├── hooks/
│   ├── useChartGridLayout   # Computes all layout dimensions
│   ├── useScrollSync        # Syncs horizontal/vertical layers
│   ├── useCellSizeOverrides # User-adjusted cell widths/heights
│   ├── useRowHeightCalculation # Dynamic row height from container
│   ├── useContainerDimensions # ResizeObserver for container
│   └── useStabilization     # Prevents layout thrash on transitions
└── utils/
    └── layoutUtils.ts       # Pure layout calculation functions
```

---

### **Three-Layer Scrolling Architecture**

The key innovation is separating scrolling concerns into three stacked layers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONTAINER (position: relative)                        │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ LAYER 1: HORIZONTAL SCROLL (z-index: 3)                               │  │
│  │ position: absolute, left: leftFixedWidthPx, right: 14px               │  │
│  │ overflowX: scroll, overflowY: hidden                                  │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ Top Facet Headers (TopFacetLabels)                              │  │  │
│  │  │ Field names + hierarchical value labels                         │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ PLOT AREA (PlotArea) - LAYER 3                                  │  │  │
│  │  │ CSS Grid with ObservablePlot cells                              │  │  │
│  │  │ Transform: translateY(-verticalScrollOffset)                    │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ X-Axes (XAxes) - one Observable Plot per column                 │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  │  ┌─────────────────────────────────────────────────────────────────┐  │  │
│  │  │ X-Labels (field names)                                          │  │  │
│  │  └─────────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ LAYER 2: VERTICAL SCROLL (z-index: 2)                                 │  │
│  │ position: absolute, top: topHeaderHeight, bottom: xAxisHeight         │  │
│  │ overflowY: scroll, overflowX: hidden                                  │  │
│  │                                                                       │  │
│  │  ┌────────────────────────┬───────────────────────────────────────┐  │  │
│  │  │ LEFT FIXED AREA        │ Transparent sizing div               │  │  │
│  │  │ ┌────────────────────┐ │ (drives vertical scrollbar height)   │  │  │
│  │  │ │ Left Facet Labels  │ │                                       │  │  │
│  │  │ │ (LeftFacetLabels)  │ │                                       │  │  │
│  │  │ ├────────────────────┤ │                                       │  │  │
│  │  │ │ Y-Label Column     │ │                                       │  │  │
│  │  │ │ (rotated text)     │ │                                       │  │  │
│  │  │ ├────────────────────┤ │                                       │  │  │
│  │  │ │ Y-Axes (YAxes)     │ │                                       │  │  │
│  │  │ │ Observable Plot    │ │                                       │  │  │
│  │  │ └────────────────────┘ │                                       │  │  │
│  │  └────────────────────────┴───────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │ RESIZE OVERLAY (z-index: 100, pointerEvents: none)                    │  │
│  │ GridResizeOverlay - handles positioned at gridlines                   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  [Reset Grid Size] button (if user has resized)                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### **Data Flow Diagram**

```
┌──────────────────────────────────────────────────────────────────┐
│                    FROM ChartArea                                 │
│  Props: grid (GridResultModel), data, onPlotRenderComplete       │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                    ChartGrid.tsx                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ useDeferredValue(grid)                                     │  │
│  │  • Prevents intermediate "half-ready" renders              │  │
│  │  • Shows old grid while new one is being prepared          │  │
│  │  • isTransitioning = gridProp !== grid                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│              ┌───────────────┼───────────────┐                   │
│              ▼               ▼               ▼                   │
│  ┌──────────────────┐ ┌──────────────┐ ┌──────────────────────┐  │
│  │ useStabilization │ │ useCellSize  │ │ useRowHeight         │  │
│  │  • Prevents      │ │ Overrides    │ │ Calculation          │  │
│  │   layout thrash  │ │  • user      │ │  • ResizeObserver    │  │
│  └──────────────────┘ │   widths     │ │  • min height        │  │
│                       │  • user      │ └──────────────────────┘  │
│                       │   heights    │                           │
│                       │  • reset     │                           │
│                       └──────────────┘                           │
│              │               │               │                   │
│              └───────────────┼───────────────┘                   │
│                              ▼                                   │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ useChartGridLayout                                         │  │
│  │  • columns, rows from grid.layout                          │  │
│  │  • plotTemplateColumns (CSS grid-template)                 │  │
│  │  • plotRowsSpec (row heights)                              │  │
│  │  • dynamicXAxisPx, dynamicYAxisPx (gutter sizes)           │  │
│  │  • leftFixedWidthPx (labels + Y-axis)                      │  │
│  │  • topHeaderHeight (facet headers)                         │  │
│  └────────────────────────────────────────────────────────────┘  │
│                              │                                   │
│              ┌───────────────┼───────────────┐                   │
│              ▼               ▼               ▼                   │
│  ┌──────────────────┐ ┌──────────────┐ ┌──────────────────────┐  │
│  │ useScrollSync    │ │ useContainer │ │ DOM Refs             │  │
│  │  • scrollOffsets │ │ Dimensions   │ │  • containerRef      │  │
│  │  • onWheelCapture│ │  • width     │ │  • hScrollRef        │  │
│  │  • translateY    │ │  • height    │ │  • vScrollRef        │  │
│  │   sync           │ └──────────────┘ │  • plotsTranslateRef │  │
│  └──────────────────┘                  │  • plotGridRef       │  │
│                                        └──────────────────────┘  │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                              ▼ Props
┌──────────────────────────────────────────────────────────────────┐
│                    MultiPlotGrid.tsx                              │
│  Assembles the three-layer structure from:                       │
│   • TopFacetLabels, PlotArea, XAxes (Layer 1)                    │
│   • LeftFacetLabels, YAxes (Layer 2)                             │
│   • GridResizeOverlay                                            │
└─────────────────────────────┬────────────────────────────────────┘
                              │
             ┌────────────────┼────────────────┐
             ▼                ▼                ▼
┌────────────────────┐ ┌──────────────┐ ┌──────────────────────────┐
│ PlotArea           │ │ XAxes/YAxes  │ │ FacetLabels              │
│  • CSS Grid layout │ │ • Standalone │ │ • TopFacetLabels         │
│  • ObservablePlot  │ │   axis-only  │ │ • LeftFacetLabels        │
│    cells           │ │   plots      │ │ • Hierarchical spans     │
│  • suppressAxes()  │ │ • Domain     │ └──────────────────────────┘
│    removes axes    │ │   matching   │
│    from cell plots │ └──────────────┘
└────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    ObservablePlot                                 │
│  • Renders individual Plot.plot() to SVG                         │
│  • Has own ResizeObserver                                        │
│  • Calls onPlotRenderComplete(plotId) when done                  │
└──────────────────────────────────────────────────────────────────┘
```

---

### **Hook Responsibilities**

| Hook | Purpose | Key State |
|------|---------|-----------|
| `useChartGridLayout` | All layout math: grid dimensions, gutters, templates | `LayoutCalculations` |
| `useScrollSync` | Keeps Layer 1 plots in sync with Layer 2 vertical scroll | `scrollOffsets`, `onWheelCapture` |
| `useCellSizeOverrides` | User can drag gridlines to resize cells | `userCellWidth`, `userCellHeight`, `handleReset` |
| `useRowHeightCalculation` | Computes row height from container / row count | `rowHeightPx` |
| `useContainerDimensions` | ResizeObserver tracking container size | `{ width, height }` |
| `useStabilization` | Prevents rapid re-layout during transitions | `pendingRowHeightRef` |

---

### **External Connections**

**Props from ChartArea:**
- `grid: GridResultModel` — The generated grid result with `cells`, `layout`, and optional `headers`
- `data: QueryResult` — Raw data (currently unused in ChartGrid, data is embedded in cell options)
- `onPlotRenderComplete` — Callback to coordinate rendering completion

**Renders:**
- `ObservablePlot` — The actual Observable Plot renderer (for plot cells)
- `PieSvgRenderer` — Custom SVG renderer for pie cells

**Imports from:**
- `chartLayoutConfig` — Constants: `MIN_GRID_ROW_PX`, `MIN_GRID_COLUMN_PX`, `GRID_DIVIDER_COLOR`, gutter sizes
- `observable-plot-generator/gridModel` — `GridResultModel` type and helpers

---

### **Key Patterns**

1. **Three-layer scrolling** — Horizontal and vertical scrolling are separated to allow fixed Y-axes while plots scroll horizontally
2. **Transform-based sync** — `translateY(-scrollTop)` keeps plots aligned with vertical scroll without re-rendering
3. **External axes** — Axes are rendered separately from plots using `suppressAxes()` to remove them from cells
4. **useDeferredValue** — React 18 feature to defer spec updates, showing old chart during transitions
5. **Aggressive memoization** — All components use `React.memo` with custom comparators to prevent re-renders
6. **User resize** — `GridResizeOverlay` provides drag handles on gridlines for manual cell sizing
