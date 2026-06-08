// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import * as Plot from '@observablehq/plot';
import { CustomTooltip } from './CustomTooltip/CustomTooltip';
import { useChartTooltip } from '../../hooks/useChartTooltip';
import { useFullscreenPortalTarget } from '../../hooks/useFullscreenPortalTarget';
import { useElementSize } from '../../hooks/useElementSize';
import { CustomTooltipConfig, MapViewBounds } from '../../types';
import { addTooltipListeners } from './CustomTooltip/addTooltipListeners';
import { stampColorCategories } from './stampColorCategories';
import { fitMapDimensions } from '../../utils/mapUtils';
import { applyMapViewToPlotOptions } from '../../utils/mapRenderOptions';
import type { MapPlotOptionsMetadata } from '../../observable-plot-generator/chartTypes/mapChart';
import { attachMapPanZoom, MapPanZoomHandlers } from './map/attachMapPanZoom';
import { resolvePlotSvg } from './map/resolvePlotSvg';

interface ObservablePlotProps {
  options: Plot.PlotOptions & MapPlotOptionsMetadata & {
    __customTooltip?: CustomTooltipConfig;
  };
  plotId?: string;
  onRenderComplete?: (plotId: string) => void;
  onPlotReady?: (plot: SVGSVGElement | HTMLElement) => void;
  autoExpandPinnedComparison?: boolean;
  onAutoExpandPinnedComparisonChange?: (enabled: boolean) => void;
  /** Map navigation handlers (when chart type is map). */
  mapPanZoom?: MapPanZoomHandlers;
  /** Transient pan/zoom override for this cell (applied without regenerating the grid). */
  mapViewBounds?: MapViewBounds | null;
}

const ObservablePlot: React.FC<ObservablePlotProps> = ({
  options,
  plotId,
  onRenderComplete,
  onPlotReady,
  autoExpandPinnedComparison = false,
  onAutoExpandPinnedComparisonChange,
  mapPanZoom,
  mapViewBounds,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotHostRef = useRef<HTMLDivElement>(null);
  const dimensions = useElementSize(containerRef);
  const portalTarget = useFullscreenPortalTarget();
  const { tooltip, showTooltip, hideTooltip, updatePosition, pinTooltip, unpinTooltip, pinnedRef } = useChartTooltip();
  const cleanupFunctionsRef = useRef<Array<() => void>>([]);
  const mapPanZoomRef = useRef(mapPanZoom);
  mapPanZoomRef.current = mapPanZoom;

  const renderOptions = useMemo(
    () => (options.__mapInteractive ? applyMapViewToPlotOptions(options, mapViewBounds) : options),
    [options, mapViewBounds],
  );

  const mapAspectRatio = renderOptions.__mapAspectRatio;

  useEffect(() => {
    if (!containerRef.current) return;

    const observedWidth = dimensions.width;
    const observedHeight = dimensions.height;

    let finalWidth: number;
    let finalHeight: number;
    if (mapAspectRatio != null && observedWidth > 0 && observedHeight > 0) {
      ({ width: finalWidth, height: finalHeight } = fitMapDimensions(
        observedWidth,
        observedHeight,
        mapAspectRatio,
      ));
    } else {
      finalWidth = renderOptions.width !== undefined ? renderOptions.width : (observedWidth > 0 ? observedWidth : 400);
      finalHeight = renderOptions.height !== undefined ? renderOptions.height : (observedHeight > 0 ? observedHeight : 300);
    }

    if (finalWidth > 0 && finalHeight > 0) {
      hideTooltip();

      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];

      const newOptions = {
        ...renderOptions,
        width: finalWidth,
        height: finalHeight,
        style: {
          ...(renderOptions as any).style,
          ...(renderOptions.__mapInteractive ? { overflow: 'visible' } : {}),
        } as any,
      } as Plot.PlotOptions;

      try {
        const plot = Plot.plot(newOptions);

        const host = plotHostRef.current;
        if (host) {
          host.replaceChildren(plot);
        } else {
          containerRef.current.replaceChildren(plot);
        }

        onPlotReady?.(plot);

        stampColorCategories(plot, renderOptions);

        const customTooltipConfig = (renderOptions as ObservablePlotProps['options']).__customTooltip;
        if (customTooltipConfig?.enabled) {
          const cleanup = addTooltipListeners(
            plot, customTooltipConfig, showTooltip, hideTooltip, updatePosition,
            pinTooltip, unpinTooltip, pinnedRef
          );
          cleanupFunctionsRef.current.push(cleanup);
        }

        const handlers = mapPanZoomRef.current;
        const mapSvg = resolvePlotSvg(plot);
        if (
          renderOptions.__mapInteractive &&
          handlers &&
          renderOptions.__mapHomeBounds &&
          renderOptions.__mapCurrentView &&
          renderOptions.__mapPlotId &&
          mapSvg
        ) {
          const cleanupPanZoom = attachMapPanZoom({
            svg: mapSvg,
            wheelRoot: plot instanceof SVGSVGElement ? undefined : (plot as HTMLElement),
            plotId: renderOptions.__mapPlotId,
            homeBounds: renderOptions.__mapHomeBounds,
            currentView: renderOptions.__mapCurrentView,
            width: finalWidth,
            height: finalHeight,
            handlers,
          });
          cleanupFunctionsRef.current.push(cleanupPanZoom);
        }

        if (plotId && onRenderComplete) {
          requestAnimationFrame(() => {
            if (process.env.NODE_ENV === 'development') {
              console.log('[ObservablePlot] Render complete for plot:', plotId);
            }
            onRenderComplete(plotId);
          });
        }
      } catch (error) {
        console.error('ObservablePlot - Error creating plot:', error);
        if (plotId && onRenderComplete) {
          if (process.env.NODE_ENV === 'development') {
            console.log('[ObservablePlot] Render error for plot, marking complete:', plotId);
          }
          onRenderComplete(plotId);
        }
      }
    } else if (process.env.NODE_ENV === 'development') {
      console.warn('[ObservablePlot] Skipping render - invalid dimensions:', { finalWidth, finalHeight });
    }

    return () => {
      hideTooltip();
      cleanupFunctionsRef.current.forEach(cleanup => cleanup());
      cleanupFunctionsRef.current = [];
    };
  }, [renderOptions, dimensions, showTooltip, hideTooltip, updatePosition, pinTooltip, unpinTooltip, pinnedRef, onRenderComplete, plotId, onPlotReady, mapAspectRatio]);

  return (
    <>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          ...(mapAspectRatio != null
            ? { display: 'flex', alignItems: 'center', justifyContent: 'center' }
            : {}),
        }}
      >
        <div
          ref={plotHostRef}
          style={mapAspectRatio == null ? { width: '100%', height: '100%' } : undefined}
        />
      </div>
      {portalTarget && ReactDOM.createPortal(
        <CustomTooltip
          x={tooltip.x}
          y={tooltip.y}
          fields={tooltip.fields}
          visible={tooltip.visible}
          colorHex={tooltip.colorHex}
          pinnedComparison={tooltip.pinnedComparison}
          pinned={tooltip.pinned}
          onUnpin={unpinTooltip}
          onFilterAction={options.__customTooltip?.onFilterAction}
          autoExpandPinnedComparison={autoExpandPinnedComparison}
          onAutoExpandPinnedComparisonChange={onAutoExpandPinnedComparisonChange}
        />,
        portalTarget
      )}
    </>
  );
};

function sameMapViewBounds(a?: MapViewBounds | null, b?: MapViewBounds | null): boolean {
  if (a === b) return true;
  if (!a || !b) return !a && !b;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

export default React.memo(ObservablePlot, (prevProps, nextProps) => {
  return (
    prevProps.options === nextProps.options &&
    prevProps.autoExpandPinnedComparison === nextProps.autoExpandPinnedComparison &&
    prevProps.onAutoExpandPinnedComparisonChange === nextProps.onAutoExpandPinnedComparisonChange &&
    prevProps.mapPanZoom === nextProps.mapPanZoom &&
    sameMapViewBounds(prevProps.mapViewBounds, nextProps.mapViewBounds)
  );
});
