// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { CustomTooltip } from '../../CustomTooltip/CustomTooltip';
import { useChartTooltip } from '../../../../hooks/useChartTooltip';
import { useFullscreenPortalTarget } from '../../../../hooks/useFullscreenPortalTarget';
import { useElementSize } from '../../../../hooks/useElementSize';
import { PiePlotSpec } from '../../../../observable-plot-generator/types';
import { CustomTooltipConfig } from '../../../../types';
import { encodeCatValue } from '../../stampColorCategories';
import { buildPieArcSegments } from './pieArcUtils';

interface PieSvgRendererProps {
  pieSpec: PiePlotSpec;
  tooltipConfig?: CustomTooltipConfig;
  plotId?: string;
  onRenderComplete?: (plotId: string) => void;
}

const SVG_PADDING = 12;
const FULL_CIRCLE_EPSILON = 1e-6;

function getLabelPosition(segment: { startAngle: number; endAngle: number; radius: number; cx: number; cy: number }) {
  const span = segment.endAngle - segment.startAngle;
  if (Math.abs(span - Math.PI * 2) < FULL_CIRCLE_EPSILON) {
    return { x: segment.cx, y: segment.cy };
  }
  const angle = segment.startAngle + span / 2;
  const radius = segment.radius * 0.62;
  return {
    x: segment.cx + radius * Math.cos(angle),
    y: segment.cy + radius * Math.sin(angle),
  };
}

const PieSvgRenderer: React.FC<PieSvgRendererProps> = ({ pieSpec, tooltipConfig, plotId, onRenderComplete }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Shared singleton ResizeObserver across all chart cells (one observer, N targets).
  const dimensions = useElementSize(containerRef);
  // Shared across all chart cells: one set of fullscreenchange listeners total.
  const portalTarget = useFullscreenPortalTarget();
  const { tooltip, showTooltip, hideTooltip, updatePosition, pinTooltip, unpinTooltip } = useChartTooltip();

  useEffect(() => {
    if (!plotId || !onRenderComplete) return;
    const frame = requestAnimationFrame(() => onRenderComplete(plotId));
    return () => cancelAnimationFrame(frame);
  }, [plotId, onRenderComplete, pieSpec]);

  const geometry = useMemo(() => {
    const width = dimensions.width || 240;
    const height = dimensions.height || 240;
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.max(0, Math.min(width, height) / 2 - SVG_PADDING);
    const radius = maxRadius * Math.max(0.2, Math.min(1, pieSpec.radiusScale || 1));
    const segments = buildPieArcSegments({
      values: pieSpec.slices.map((slice) => slice.value),
      radius,
      cx,
      cy,
    });
    return { width, height, segments };
  }, [dimensions, pieSpec]);

  const handleMouseMove = (event: React.MouseEvent<SVGPathElement>) => {
    updatePosition(event.clientX, event.clientY);
  };

  if (pieSpec.emptyMessage || pieSpec.slices.length === 0) {
    return (
      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'rgba(0, 0, 0, 0.6)',
          fontSize: 14,
          textAlign: 'center',
          paddingLeft: 16,
          paddingRight: 16,
          boxSizing: 'border-box',
        }}
      >
        {pieSpec.emptyMessage || 'No pie slices to display.'}
      </div>
    );
  }

  return (
    <>
      <div ref={containerRef} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${geometry.width} ${geometry.height}`}
          role="img"
          style={{ display: 'block' }}
        >
          <title>{pieSpec.colorLabel ? `${pieSpec.measureLabel} by ${pieSpec.colorLabel}` : pieSpec.measureLabel}</title>
          {geometry.segments.map((segment, index) => {
            const slice = pieSpec.slices[index];
            if (!slice || !segment.path) return null;
            return (
              <path
                key={slice.id}
                d={segment.path}
                fill={slice.color}
                stroke="#fff"
                strokeWidth={1}
                data-cat={encodeCatValue(slice.rawValue)}
                onMouseEnter={(event) => showTooltip(event.clientX, event.clientY, slice.tooltipFields, slice.color)}
                onMouseMove={handleMouseMove}
                onMouseLeave={hideTooltip}
                onClick={(event) => {
                  event.stopPropagation();
                  showTooltip(event.clientX, event.clientY, slice.tooltipFields, slice.color);
                  pinTooltip();
                }}
                style={{ cursor: 'pointer' }}
              />
            );
          })}
          {geometry.segments.map((segment, index) => {
            const slice = pieSpec.slices[index];
            if (!slice || slice.labelLines.length === 0) return null;
            const position = getLabelPosition(segment);
            const lineHeight = 12;
            const startDy = -((slice.labelLines.length - 1) * lineHeight) / 2;
            return (
              <text
                key={`${slice.id}-label`}
                x={position.x}
                y={position.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={11}
                fontWeight={600}
                fill="black"
                stroke="white"
                strokeWidth={3}
                paintOrder="stroke"
                pointerEvents="none"
              >
                {slice.labelLines.map((line, lineIndex) => (
                  <tspan
                    key={lineIndex}
                    x={position.x}
                    dy={lineIndex === 0 ? startDy : lineHeight}
                  >
                    {line}
                  </tspan>
                ))}
              </text>
            );
          })}
        </svg>
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
          onFilterAction={tooltipConfig?.onFilterAction}
        />,
        portalTarget
      )}
    </>
  );
};

export default React.memo(PieSvgRenderer);
