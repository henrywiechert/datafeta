# Bundle Size Analysis & Code Splitting Proposal

## Current Build Analysis

### Bundle Size Summary (Post-GZIP)
```
436.62 kB  - chunk 570 (largest - likely vendor libraries)
150.6 kB   - main bundle
62.63 kB   - chunk 97 (likely route-based split)
2.44 kB    - chunk 9
1.76 kB    - chunk 453
```

**Total Bundle Size (uncompressed):** ~12 MB  
**Total GZIP Size:** ~654 KB

### Key Dependencies Analysis

Based on package.json, the heaviest dependencies are:

1. **@mui/material + @mui/icons-material** (~500KB gzipped)
   - Core UI framework used throughout
   - Icons library (~150KB alone)

2. **ag-grid-community + ag-grid-react** (~200KB gzipped)
   - Only used in `TableView.tsx`
   - Heavy grid library for data display

3. **@observablehq/plot** (~150KB gzipped)
   - D3-based plotting library
   - Used in ChartGrid, ObservablePlot components
   - Core to visualization functionality

4. **ag-charts-react** (~100KB gzipped)
   - Alternative charting library
   - Check if actually used

5. **react-router-dom** (~30KB gzipped)
   - Already doing route-based code splitting

## Current Code Splitting Status

✅ **Already Implemented:**
- Route-level splitting (DataSourceSelectionPage, VisualizationPage)
- React lazy loading on pages in `App.tsx`:
```tsx
const DataSourceSelectionPage = lazy(() => import('./pages/DataSourceSelectionPage'));
const VisualizationPage = lazy(() => import('./pages/VisualizationPage'));
```

## Proposed Code Splitting Strategies

### 1. **Heavy Library Lazy Loading** (HIGH IMPACT)

#### A. Split AG-Grid (saves ~200KB)
AG-Grid is only used for table view, which is optional visualization mode.

**Implementation:**
```tsx
// components/Visualization/TableView.tsx
const AgGridReact = lazy(() => import('ag-grid-react').then(module => ({ 
  default: module.AgGridReact 
})));

// Wrap in Suspense with loading indicator
const TableView: React.FC<TableViewProps> = ({ columns, rows, xFields, yFields }) => {
  return (
    <Suspense fallback={<div>Loading table view...</div>}>
      <AgGridReactLazy {...props} />
    </Suspense>
  );
};
```

#### B. Split Observable Plot Components (saves ~100KB)
Observable Plot is only used when visualizations are active.

**Implementation:**
```tsx
// components/Visualization/ChartArea/components/ChartRenderer.tsx
const ObservablePlot = lazy(() => import('../ObservablePlot'));
const ChartGrid = lazy(() => import('../ChartGrid/ChartGrid'));
```

### 2. **Component-Level Splitting** (MEDIUM IMPACT)

#### A. Split Large Feature Components
Break down complex feature areas that aren't always needed:

```tsx
// Lazy load filter panel (used conditionally)
const FilterPanel = lazy(() => import('./Filters/FilterPanel'));

// Lazy load color controls (modal/panel based)
const ColorPanel = lazy(() => import('./Color/ColorPanel'));

// Lazy load field overrides (advanced feature)
const FieldOverridesPanel = lazy(() => import('./Overrides/FieldOverridesPanel'));

// Lazy load debug panels (dev feature)
const DebugPanel = lazy(() => import('./DebugPanel'));
const DebugView = lazy(() => import('./DebugView'));
```

#### B. Split Virtual Column Editor
Virtual columns are advanced features not used immediately:

```tsx
const VirtualColumnManager = lazy(() => import('./VirtualColumns/VirtualColumnManager'));
const VirtualColumnEditor = lazy(() => import('./VirtualColumns/VirtualColumnEditor'));
```

### 3. **MUI Icon Tree-Shaking** (MEDIUM IMPACT)

Currently importing individual icons correctly (good), but can optimize further:

**Current (GOOD):**
```tsx
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
```

**Optimization:**
Consider using Material Symbols (smaller) or custom SVG sprites for frequently used icons.

### 4. **Vendor Bundle Optimization** (HIGH IMPACT)

The 436KB vendor chunk can be optimized:

#### A. Configure webpack to split vendors
Since using CRA, need to either eject or use CRACO:

**Install CRACO:**
```bash
npm install @craco/craco --save-dev
```

**Create craco.config.js:**
```js
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Split chunks configuration
      webpackConfig.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          // MUI in separate chunk
          mui: {
            test: /[\\/]node_modules[\\/](@mui)[\\/]/,
            name: 'mui',
            priority: 20,
          },
          // AG-Grid in separate chunk (lazy loaded)
          agGrid: {
            test: /[\\/]node_modules[\\/](ag-grid|ag-charts)[\\/]/,
            name: 'ag-grid',
            priority: 20,
          },
          // Observable Plot separate
          plot: {
            test: /[\\/]node_modules[\\/](@observablehq)[\\/]/,
            name: 'observable-plot',
            priority: 20,
          },
          // React core libraries
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|react-router)[\\/]/,
            name: 'react-vendor',
            priority: 15,
          },
          // Everything else from node_modules
          defaultVendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: 10,
          },
        },
      };
      return webpackConfig;
    },
  },
};
```

**Update package.json scripts:**
```json
{
  "scripts": {
    "start": "craco start",
    "build": "craco build",
    "test": "craco test"
  }
}
```

### 5. **Dynamic Feature Loading** (LOW-MEDIUM IMPACT)

#### A. Conditional Feature Imports
Load advanced features only when needed:

```tsx
// In App.tsx or feature components
const loadVirtualColumnFeature = () => import('./features/virtualColumns');
const loadAdvancedFiltering = () => import('./features/advancedFiltering');

// Usage
if (userWantsVirtualColumns) {
  const { VirtualColumnManager } = await loadVirtualColumnFeature();
  // Use component
}
```

### 6. **Remove Unused Dependencies** (QUICK WIN)

Check if these are actually used:
- `ag-charts-react` - if Observable Plot covers all chart needs
- `@mui/lab` - verify usage
- `web-vitals` - can be optional/dev dependency

**Audit script:**
```bash
npx depcheck
```

## Implementation Priority

### Phase 1: Quick Wins (Estimated savings: 50-100KB)
1. ✅ Remove unused dependencies
2. ✅ Audit and remove unused imports (ESLint warnings indicate some exist)
3. ✅ Lazy load DebugPanel, DebugView (dev-only features)

### Phase 2: Heavy Library Splitting (Estimated savings: 200-300KB)
1. 🎯 Lazy load AG-Grid components
2. 🎯 Setup CRACO for vendor splitting
3. 🎯 Split MUI, Observable Plot, AG-Grid into separate chunks

### Phase 3: Feature-Based Splitting (Estimated savings: 50-100KB)
1. 🎯 Lazy load FilterPanel
2. 🎯 Lazy load FieldOverridesPanel
3. 🎯 Lazy load ColorPanel
4. 🎯 Lazy load VirtualColumn components

### Phase 4: Advanced Optimizations (Estimated savings: 30-50KB)
1. Icon optimization
2. Dynamic import strategies for advanced features
3. Preload critical chunks

## Expected Results

| Phase | Initial Size | After Optimization | Savings |
|-------|-------------|-------------------|---------|
| Current | 654 KB | - | - |
| After Phase 1 | 654 KB | ~600 KB | ~50 KB |
| After Phase 2 | ~600 KB | ~350 KB | ~250 KB |
| After Phase 3 | ~350 KB | ~250 KB | ~100 KB |
| **Total** | **654 KB** | **~250 KB** | **~400 KB (61%)** |

## Code Examples

### Example 1: Lazy Load TableView with AG-Grid

**Before:**
```tsx
// TableView.tsx
import { AgGridReact } from 'ag-grid-react';

const TableView: React.FC<Props> = (props) => {
  return <AgGridReact {...gridProps} />;
};
```

**After:**
```tsx
// TableView.tsx
import { lazy, Suspense } from 'react';

const AgGridReactLazy = lazy(() => 
  import('ag-grid-react').then(m => ({ default: m.AgGridReact }))
);

const TableView: React.FC<Props> = (props) => {
  return (
    <Suspense fallback={<TableViewSkeleton />}>
      <AgGridReactLazy {...gridProps} />
    </Suspense>
  );
};
```

### Example 2: Conditional Heavy Feature Loading

**ChartArea.tsx:**
```tsx
const ChartArea: React.FC = () => {
  const [ChartGridComponent, setChartGrid] = useState<any>(null);
  
  useEffect(() => {
    if (needsChartGrid) {
      import('./ChartGrid/ChartGrid').then(module => {
        setChartGrid(() => module.default);
      });
    }
  }, [needsChartGrid]);

  return (
    <Suspense fallback={<ChartSkeleton />}>
      {ChartGridComponent && <ChartGridComponent {...props} />}
    </Suspense>
  );
};
```

### Example 3: Feature Flag Based Loading

```tsx
// config/features.ts
export const FEATURES = {
  VIRTUAL_COLUMNS: true,
  ADVANCED_FILTERING: true,
  DEBUG_PANEL: process.env.NODE_ENV === 'development',
};

// App.tsx
const VirtualColumnManager = FEATURES.VIRTUAL_COLUMNS 
  ? lazy(() => import('./components/VirtualColumns/VirtualColumnManager'))
  : null;

const DebugPanel = FEATURES.DEBUG_PANEL
  ? lazy(() => import('./components/DebugPanel'))
  : null;
```

## Monitoring & Validation

### Build Analysis Tools

1. **Install webpack-bundle-analyzer:**
```bash
npm install --save-dev webpack-bundle-analyzer
```

2. **Add to CRACO config:**
```js
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  webpack: {
    plugins: [
      new BundleAnalyzerPlugin({
        analyzerMode: process.env.ANALYZE ? 'server' : 'disabled',
      }),
    ],
  },
};
```

3. **Run analysis:**
```bash
ANALYZE=true npm run build
```

### Performance Metrics

Monitor these after implementing splits:
- Initial bundle load time
- Time to interactive (TTI)
- First Contentful Paint (FCP)
- Largest Contentful Paint (LCP)
- Chunk load times

## Risks & Considerations

### 1. Loading States
Each lazy-loaded component needs proper loading states:
- Skeleton screens
- Loading spinners
- Error boundaries

### 2. Network Waterfalls
Too much splitting can cause:
- Multiple sequential requests
- Delayed feature availability
- Solution: Preload critical chunks

### 3. Caching Strategy
- Ensure proper cache headers for chunks
- Use content-hashed filenames (already done by CRA)
- Consider service worker for offline support

### 4. Testing
- Test lazy-loaded components work correctly
- Verify error boundaries handle load failures
- Check network tab for proper chunk loading

## Next Steps

1. **Immediate Actions:**
   - Run `npx depcheck` to find unused dependencies
   - Install CRACO for webpack customization
   - Implement Phase 1 quick wins

2. **Short-term (1-2 weeks):**
   - Implement vendor splitting (Phase 2)
   - Add lazy loading to AG-Grid and Observable Plot
   - Setup bundle analyzer

3. **Medium-term (2-4 weeks):**
   - Implement feature-based splitting (Phase 3)
   - Add loading states and error boundaries
   - Performance testing and optimization

4. **Long-term:**
   - Consider migration to Vite (faster builds, better splitting)
   - Implement preloading strategies
   - Add service worker for offline support
