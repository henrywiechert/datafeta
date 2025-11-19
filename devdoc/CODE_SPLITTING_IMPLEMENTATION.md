# Code Splitting Implementation Guide

## Summary

Based on analysis of your current bundle (654 KB gzipped), I propose a phased approach that can reduce the bundle size by **~400 KB (61%)** to approximately **250 KB gzipped**.

## Quick Findings

### Unused Dependencies (Remove Immediately - Free ~50KB)
```bash
npm uninstall @mui/lab @mui/system ag-charts-react
```

### Missing Dependencies (Add)
```bash
npm install uuid
```

### Current Bundle Breakdown
- **570 chunk**: 436.62 KB (vendor libraries - MUI, AG-Grid, Observable Plot)
- **main**: 150.6 KB (your application code)
- **97 chunk**: 62.63 KB (route-based split - already good)
- **Others**: ~5 KB

## Phase 1: Quick Wins (30 minutes, ~50 KB savings)

### Step 1.1: Remove Unused Dependencies
```bash
cd frontend
npm uninstall @mui/lab @mui/system ag-charts-react
npm install uuid
npm run build
```

### Step 1.2: Fix ESLint Warnings (Reduces Bundle)
Remove unused imports identified in build warnings:

**File: `src/components/Visualization/ChartGrid/ChartGrid.tsx`**
```tsx
// Remove line 5:
// import ObservablePlot from '../ObservablePlot';
```

**File: `src/components/Visualization/Color/ManualColorSelector.tsx`**
```tsx
// Change:
import { Button, Menu, MenuItem, Box, Tooltip } from '@mui/material';
// To:
import { Button, Menu, Box, Tooltip } from '@mui/material';
```

**File: `src/pages/VisualizationPage.tsx`**
```tsx
// Change:
import { Box, IconButton, Tooltip } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
// To:
import { Box } from '@mui/material';
```

### Step 1.3: Lazy Load Debug Components
**File: `src/components/Visualization/ChartArea/ChartArea.tsx`**
```tsx
import { ChartRenderer, ChartControls, DebugPanel } from './components';
// Change to:
import { ChartRenderer, ChartControls } from './components';
const DebugPanel = lazy(() => import('./components/DebugPanel'));
```

## Phase 2: Heavy Library Splitting (2-3 hours, ~250 KB savings)

### Step 2.1: Setup CRACO for Webpack Customization

**Install CRACO:**
```bash
npm install --save-dev @craco/craco webpack-bundle-analyzer
```

**Create `craco.config.js` in frontend root:**
```js
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Optimize chunk splitting
      webpackConfig.optimization.splitChunks = {
        chunks: 'all',
        maxInitialRequests: 10,
        minSize: 20000,
        cacheGroups: {
          // MUI in separate chunk
          mui: {
            test: /[\\/]node_modules[\\/](@mui)[\\/]/,
            name: 'mui',
            priority: 20,
            reuseExistingChunk: true,
          },
          // AG-Grid in separate chunk (will be lazy loaded)
          agGrid: {
            test: /[\\/]node_modules[\\/](ag-grid)[\\/]/,
            name: 'ag-grid',
            priority: 20,
            reuseExistingChunk: true,
          },
          // Observable Plot separate
          plot: {
            test: /[\\/]node_modules[\\/](@observablehq|d3)[\\/]/,
            name: 'observable-plot',
            priority: 20,
            reuseExistingChunk: true,
          },
          // React core libraries
          react: {
            test: /[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/,
            name: 'react-vendor',
            priority: 15,
            reuseExistingChunk: true,
          },
          // Everything else from node_modules
          defaultVendors: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: 10,
            reuseExistingChunk: true,
          },
        },
      };
      
      // Add bundle analyzer in analyze mode
      if (process.env.ANALYZE) {
        webpackConfig.plugins.push(
          new BundleAnalyzerPlugin({
            analyzerMode: 'server',
            openAnalyzer: true,
          })
        );
      }
      
      return webpackConfig;
    },
  },
};
```

**Update `package.json` scripts:**
```json
{
  "scripts": {
    "start": "craco start",
    "build": "craco build",
    "build:analyze": "ANALYZE=true craco build",
    "test": "craco test",
    "eject": "react-scripts eject"
  }
}
```

### Step 2.2: Lazy Load AG-Grid (Saves ~200KB)

AG-Grid is only used for table view. Make it lazy:

**Create: `src/components/Visualization/TableViewLazy.tsx`**
```tsx
import React, { lazy, Suspense } from 'react';
import { Skeleton, Box } from '@mui/material';

// Lazy load the entire AG-Grid module
const TableView = lazy(() => import('./TableView'));

interface TableViewLazyProps {
  columns: any[];
  rows: any[];
  xFields: any[];
  yFields: any[];
}

const TableViewSkeleton = () => (
  <Box sx={{ width: '100%', height: '100%', p: 2 }}>
    <Skeleton variant="rectangular" width="100%" height={50} sx={{ mb: 1 }} />
    <Skeleton variant="rectangular" width="100%" height="calc(100% - 60px)" />
  </Box>
);

const TableViewLazy: React.FC<TableViewLazyProps> = (props) => {
  return (
    <Suspense fallback={<TableViewSkeleton />}>
      <TableView {...props} />
    </Suspense>
  );
};

export default TableViewLazy;
```

**Update: `src/components/Visualization/ChartArea/ChartArea.tsx`**
```tsx
// Change:
import TableView from '../TableView';
// To:
import TableViewLazy from '../TableViewLazy';

// Then in the render, change:
<TableView ... />
// To:
<TableViewLazy ... />
```

### Step 2.3: Test the Changes
```bash
npm run build
# Check the output for new chunk sizes

# Run analyzer to visualize
npm run build:analyze
```

Expected result: AG-Grid chunk should now be separate and only loaded when table view is used.

## Phase 3: Feature-Based Splitting (2-3 hours, ~100 KB savings)

### Step 3.1: Lazy Load Filter Panel

**Update: `src/pages/VisualizationPage.tsx`**
```tsx
import React, { lazy, Suspense } from 'react';
// ... other imports

// Change:
import FilterPanel from '../components/Visualization/Filters/FilterPanel';
// To:
const FilterPanel = lazy(() => import('../components/Visualization/Filters/FilterPanel'));

// In render, wrap with Suspense:
<Suspense fallback={<div>Loading filters...</div>}>
  <FilterPanel />
</Suspense>
```

### Step 3.2: Lazy Load Advanced Panels

**Update: `src/pages/VisualizationPage.tsx`**
```tsx
// Lazy load these panels
const FieldOverridesPanel = lazy(() => import('../components/Visualization/Overrides/FieldOverridesPanel'));
const LabelPanel = lazy(() => import('../components/Visualization/Label/LabelPanel'));
const LegendPanel = lazy(() => import('../components/Visualization/Legend/LegendPanel'));

// Wrap each in Suspense with appropriate fallback
```

### Step 3.3: Lazy Load Virtual Columns

**Update: `src/components/Visualization/FieldsPanel.tsx`**
```tsx
const VirtualColumnManager = lazy(() => import('../VirtualColumns/VirtualColumnManager'));

// Wrap usage:
{showVirtualColumns && (
  <Suspense fallback={<div>Loading virtual columns...</div>}>
    <VirtualColumnManager />
  </Suspense>
)}
```

### Step 3.4: Create Loading Skeleton Component

**Create: `src/components/LoadingSkeleton.tsx`**
```tsx
import React from 'react';
import { Skeleton, Box } from '@mui/material';

interface LoadingSkeletonProps {
  height?: string | number;
  variant?: 'panel' | 'list' | 'chart';
}

const LoadingSkeleton: React.FC<LoadingSkeletonProps> = ({ 
  height = '100%', 
  variant = 'panel' 
}) => {
  if (variant === 'panel') {
    return (
      <Box sx={{ p: 2, height }}>
        <Skeleton variant="text" width="40%" height={30} sx={{ mb: 2 }} />
        <Skeleton variant="rectangular" width="100%" height="calc(100% - 50px)" />
      </Box>
    );
  }
  
  if (variant === 'list') {
    return (
      <Box sx={{ p: 2 }}>
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} variant="rectangular" height={40} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }
  
  return <Skeleton variant="rectangular" width="100%" height={height} />;
};

export default LoadingSkeleton;
```

Use this consistent skeleton across all lazy-loaded components.

## Phase 4: Advanced Optimizations (Optional, ~30-50 KB savings)

### Step 4.1: Preload Critical Chunks

Add preload hints for likely-to-be-needed chunks:

**Update: `src/pages/DataSourceSelectionPage.tsx`**
```tsx
import { useEffect } from 'react';

// After successful connection, preload visualization page
const handleConnect = async () => {
  // ... existing connect logic
  
  // Preload the visualization page after successful connection
  if (connectionSuccessful) {
    import('../pages/VisualizationPage');
    import('../components/Visualization/ChartArea/ChartArea');
  }
};
```

### Step 4.2: Optimize MUI Icons

If you use many icons, consider creating a custom icon bundle:

**Create: `src/components/Icons/index.tsx`**
```tsx
// Instead of importing individual icons everywhere,
// export commonly used icons from one place
export { default as AddIcon } from '@mui/icons-material/Add';
export { default as CloseIcon } from '@mui/icons-material/Close';
export { default as ExpandMoreIcon } from '@mui/icons-material/ExpandMore';
// ... add others as needed
```

Then import from this file:
```tsx
import { AddIcon, CloseIcon } from '../Icons';
```

This ensures tree-shaking works optimally.

## Validation & Testing

### Build Analysis Checklist
```bash
# 1. Build with analysis
npm run build:analyze

# 2. Check bundle sizes
ls -lh build/static/js/*.js

# 3. Verify chunks are created
# You should see:
# - mui.*.chunk.js (~200KB)
# - ag-grid.*.chunk.js (~200KB, lazy loaded)
# - observable-plot.*.chunk.js (~100KB)
# - react-vendor.*.chunk.js (~50KB)
# - main.*.js (smaller now, ~100KB)

# 4. Test the app works
npm start
```

### Performance Testing
1. Open Chrome DevTools → Network tab
2. Throttle to "Fast 3G"
3. Test scenarios:
   - Initial page load (should be faster)
   - Navigate to visualization page
   - Switch to table view (AG-Grid should load then)
   - Open filter panel
   - Use virtual columns

### Success Metrics
| Metric | Before | Target |
|--------|--------|--------|
| Initial bundle (gzipped) | 654 KB | ~250 KB |
| Time to Interactive | ~3s | ~1.5s |
| First Contentful Paint | ~1.5s | ~0.8s |
| Chunks loaded on initial | 5 | 3 |

## Rollback Plan

If issues arise:

**Quick Rollback:**
```bash
# Revert to react-scripts
git checkout package.json
npm install
```

**Keep CRACO, remove lazy loading:**
- Keep the vendor splitting (CRACO config)
- Remove lazy() calls and Suspense wrappers
- This gives you better vendor chunking without lazy loading complexity

## Common Issues & Solutions

### Issue 1: Chunk Load Failed
**Symptom:** Error in console about failed chunk loading  
**Solution:** Add error boundary with retry logic

```tsx
import React, { Component, ReactNode } from 'react';

class ChunkErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    if (error.name === 'ChunkLoadError') {
      return { hasError: true };
    }
    throw error;
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div>
          <h2>Failed to load component</h2>
          <button onClick={this.handleRetry}>Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

### Issue 2: Suspense Waterfall
**Symptom:** Multiple sequential chunk loads  
**Solution:** Preload predictable chunks

### Issue 3: Bundle Analyzer Won't Open
**Symptom:** `ANALYZE=true` doesn't work  
**Solution:** Use cross-env:
```bash
npm install --save-dev cross-env
```
Update script:
```json
"build:analyze": "cross-env ANALYZE=true craco build"
```

## Next Steps

1. **Start with Phase 1** (30 min) - Remove unused deps, fix imports
2. **Measure baseline** - Build and note current sizes
3. **Implement Phase 2** (2-3 hours) - Setup CRACO and lazy load AG-Grid
4. **Measure improvement** - Compare bundle sizes
5. **Implement Phase 3** if needed - Feature-based splitting
6. **Test thoroughly** - All features should work correctly
7. **Deploy** - Monitor performance metrics

## Estimated Timeline

- **Phase 1**: 30 minutes - 1 hour
- **Phase 2**: 2-3 hours (includes testing)
- **Phase 3**: 2-3 hours (optional, for additional savings)
- **Phase 4**: 1-2 hours (optional, advanced optimizations)

**Total for significant improvement**: 3-4 hours (Phases 1-2)

## Resources

- [CRACO Documentation](https://github.com/dilanx/craco)
- [Webpack Bundle Analyzer](https://github.com/webpack-contrib/webpack-bundle-analyzer)
- [React Code Splitting](https://reactjs.org/docs/code-splitting.html)
- [Web.dev - Code Splitting](https://web.dev/reduce-javascript-payloads-with-code-splitting/)
