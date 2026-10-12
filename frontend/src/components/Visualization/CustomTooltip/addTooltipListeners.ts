// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Tooltip Event Listeners
 *
 * Wires mouseenter / mousemove / mouseleave / click (and global safety handlers)
 * onto Observable Plot SVG mark elements so that the CustomTooltip component
 * can display field data on hover, and optionally pin on click for filter actions.
 *
 * Extracted from ObservablePlot.tsx for maintainability — this module is
 * purely imperative DOM work with no React dependencies beyond a Ref type.
 */

import React from 'react';

import { TooltipField, CustomTooltipConfig, PinnedTooltipComparison } from '../../../types';
import { T } from '../../../theme/tokens';
import { isDecorationElement, queryDataMarkElements, getMarkDatum } from '../ChartGrid/utils/markElementUtils';
import { RECT_HOVER_PROXY_CLASS } from '../../../observable-plot-generator/utils/tooltipUtils';

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/*
 * The values a browser reports for "no colour here". These are compared against
 * getComputedStyle output to detect a transparent mark — they are not colours
 * this app renders, which is why they stay literal. Both spacings occur because
 * engines serialise rgba() differently.
 */
/* eslint-disable-next-line no-restricted-syntax */
const TRANSPARENT_VALUES = ['none', 'transparent', 'rgba(0, 0, 0, 0)', 'rgba(0,0,0,0)'];

/** Check whether a CSS colour string represents a visible (non-transparent) value. */
function isVisibleColor(val: string | null): boolean {
  if (!val) return false;
  return TRANSPARENT_VALUES.indexOf(val.trim().toLowerCase()) === -1;
}

/**
 * Build a one-time index of "visible colour at this (cx,cy)" for every
 * non-decoration circle in the plot. Computed once per render instead of
 * once per mouseenter: `resolveColorFromElement`'s fallback previously
 * re-scanned every circle in the SVG on EVERY hover (O(circle count) per
 * event), which scales directly with mark count — any chart type that adds
 * more invisible circles (e.g. Gantt's snap-target dots) made every hover
 * proportionally slower. First visible circle at a given position wins,
 * matching the original scan's break-on-first-match behaviour.
 */
function buildCircleColorIndex(root: Element): Map<string, string> {
  const index = new Map<string, string>();
  const circles = root.querySelectorAll('circle');
  for (let i = 0; i < circles.length; i++) {
    const circle = circles[i];
    if (isDecorationElement(circle, root)) continue;
    const cx = circle.getAttribute('cx');
    const cy = circle.getAttribute('cy');
    if (cx == null || cy == null) continue;
    const key = `${cx},${cy}`;
    if (index.has(key)) continue;

    const fill = circle.getAttribute('fill');
    const stroke = circle.getAttribute('stroke');
    if (isVisibleColor(fill)) {
      index.set(key, fill!);
      continue;
    }
    if (isVisibleColor(stroke)) {
      index.set(key, stroke!);
      continue;
    }
    const cs = getComputedStyle(circle);
    const csFill = cs.getPropertyValue('fill');
    const csStroke = cs.getPropertyValue('stroke');
    if (isVisibleColor(csFill)) {
      index.set(key, csFill);
    } else if (isVisibleColor(csStroke)) {
      index.set(key, csStroke);
    }
  }
  return index;
}

/**
 * Resolve the rendered colour of an SVG mark element.
 *
 * Reads fill/stroke from both DOM attributes and computed styles.
 * For transparent hover-dots (tick strips) it looks up the precomputed
 * `circleColorByPosition` index for a visible circle at the same position.
 */
function resolveColorFromElement(el: Element, circleColorByPosition: Map<string, string>): string | undefined {
  const cs = getComputedStyle(el);
  const resolveColor = (val: string | null): string | undefined => {
    if (!val) return undefined;
    const v = val.trim();
    if (TRANSPARENT_VALUES.indexOf(v.toLowerCase()) !== -1) return undefined;
    if (v === 'currentColor') {
      const cc = cs.getPropertyValue('color');
      return cc && cc !== 'none' ? cc.trim() : undefined;
    }
    return v;
  };
  
  // Try the element directly first
  let color = resolveColor(el.getAttribute('fill')) || resolveColor(cs.getPropertyValue('fill')) ||
              resolveColor(el.getAttribute('stroke')) || resolveColor(cs.getPropertyValue('stroke'));
  
  if (color) return color;
  
  // If this element is transparent (like hover dots), look up a visible sibling at the same position
  if (el.tagName.toLowerCase() === 'circle') {
    const cx = el.getAttribute('cx');
    const cy = el.getAttribute('cy');
    if (cx != null && cy != null) {
      color = circleColorByPosition.get(`${cx},${cy}`);
    }
  }
  
  return color;
}

// ---------------------------------------------------------------------------
// Tick-strip line matching
// ---------------------------------------------------------------------------

const SVG_MATCH_EPSILON = 0.75;

function parseSvgNumber(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nearlyEqual(a: number, b: number, epsilon = SVG_MATCH_EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}

function isWithinRange(value: number, start: number, end: number, epsilon = SVG_MATCH_EPSILON): boolean {
  const min = Math.min(start, end) - epsilon;
  const max = Math.max(start, end) + epsilon;
  return value >= min && value <= max;
}

function isInsideGridAxisOrFrame(el: Element, root: Element): boolean {
  let parent = el.parentElement;
  while (parent && parent !== root) {
    const ariaLabel = parent.getAttribute('aria-label');
    if (ariaLabel) {
      const lower = ariaLabel.toLowerCase();
      if (lower.includes('grid') || lower.includes('axis') || lower.includes('frame')) {
        return true;
      }
    }
    parent = parent.parentElement;
  }
  return false;
}

function hasVisibleStroke(el: Element): boolean {
  const stroke = el.getAttribute('stroke');
  if (isVisibleColor(stroke)) return true;
  return isVisibleColor(getComputedStyle(el).getPropertyValue('stroke'));
}

/**
 * For transparent hover-dot circles (tick strips), find the corresponding
 * visible line element that passes through the same point.
 */
function findCorrespondingLine(circle: Element): Element | null {
  const cx = parseSvgNumber(circle.getAttribute('cx'));
  const cy = parseSvgNumber(circle.getAttribute('cy'));
  if (cx == null || cy == null) return null;
  
  const svgRoot = circle.closest('svg');
  if (!svgRoot) return null;
  
  let bestMatch: Element | null = null;
  let bestLength = Number.POSITIVE_INFINITY;

  // Find the shortest visible non-decoration line whose segment covers the hover point.
  const lines = Array.from(svgRoot.querySelectorAll('line'));
  for (const line of lines) {
    if (isInsideGridAxisOrFrame(line, svgRoot)) continue;
    if (!hasVisibleStroke(line)) continue;

    const x1 = parseSvgNumber(line.getAttribute('x1'));
    const y1 = parseSvgNumber(line.getAttribute('y1'));
    const x2 = parseSvgNumber(line.getAttribute('x2'));
    const y2 = parseSvgNumber(line.getAttribute('y2'));
    if (x1 == null || y1 == null || x2 == null || y2 == null) continue;

    const isVertical = nearlyEqual(x1, x2);
    const isHorizontal = nearlyEqual(y1, y2);

    const isOnLine = (
      (isVertical && nearlyEqual(cx, x1) && isWithinRange(cy, y1, y2)) ||
      (isHorizontal && nearlyEqual(cy, y1) && isWithinRange(cx, x1, x2))
    );
    if (!isOnLine) continue;

    const lineLength = isVertical
      ? Math.abs(y2 - y1)
      : isHorizontal
        ? Math.abs(x2 - x1)
        : Math.hypot(x2 - x1, y2 - y1);

    if (lineLength < bestLength) {
      bestLength = lineLength;
      bestMatch = line;
    }
  }
  return bestMatch;
}

/**
 * For circles of a RECT_HOVER_PROXY_CLASS mark (Gantt hover dots), find the
 * rect bound to the same row. Plot binds every element to its row index, so
 * matching __data__ identifies the bar regardless of its size or position.
 */
function findProxiedRect(circle: Element): Element | null {
  if (circle.tagName.toLowerCase() !== 'circle' || !circle.closest(`.${RECT_HOVER_PROXY_CLASS}`)) {
    return null;
  }
  const datum = (circle as any).__data__;
  const svgRoot = circle.closest('svg');
  if (datum == null || !svgRoot) return null;

  const rects = Array.from(svgRoot.querySelectorAll('rect'));
  for (const rect of rects) {
    if ((rect as any).__data__ === datum && !isInsideGridAxisOrFrame(rect, svgRoot)) {
      return rect;
    }
  }
  return null;
}

function resolveGuideLineYRange(svgRoot: SVGSVGElement): { y1: number; y2: number } {
  const gridLines = Array.from(svgRoot.querySelectorAll('[aria-label="x-grid"] line'));
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const gridLine of gridLines) {
    const y1 = parseSvgNumber(gridLine.getAttribute('y1'));
    const y2 = parseSvgNumber(gridLine.getAttribute('y2'));
    if (y1 == null || y2 == null) continue;
    minY = Math.min(minY, y1, y2);
    maxY = Math.max(maxY, y1, y2);
  }

  if (Number.isFinite(minY) && Number.isFinite(maxY)) {
    return { y1: minY, y2: maxY };
  }

  const viewBox = svgRoot.viewBox?.baseVal;
  if (viewBox && Number.isFinite(viewBox.height) && viewBox.height > 0) {
    return { y1: 0, y2: viewBox.height };
  }

  const heightAttr = parseSvgNumber(svgRoot.getAttribute('height'));
  return { y1: 0, y2: heightAttr ?? svgRoot.getBoundingClientRect().height };
}

function updateVerticalGuideLine(
  svgRoot: SVGSVGElement,
  config: CustomTooltipConfig,
  mark: Element,
  colorHex?: string
): SVGLineElement | null {
  if (!config.showVerticalGuideLine || mark.tagName.toLowerCase() !== 'circle') {
    return null;
  }

  const cx = parseSvgNumber(mark.getAttribute('cx'));
  if (cx == null) {
    return null;
  }

  const { y1, y2 } = resolveGuideLineYRange(svgRoot);
  let guideLine = svgRoot.querySelector('.chart-tooltip-x-guide-line') as SVGLineElement | null;

  if (!guideLine) {
    guideLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    guideLine.classList.add('chart-tooltip-x-guide-line', 'overlay-no-tooltip');
    guideLine.setAttribute('pointer-events', 'none');
    svgRoot.appendChild(guideLine);
  }

  guideLine.setAttribute('x1', String(cx));
  guideLine.setAttribute('x2', String(cx));
  guideLine.setAttribute('y1', String(y1));
  guideLine.setAttribute('y2', String(y2));
  guideLine.setAttribute('stroke', colorHex || T.chartGuideLine);
  guideLine.setAttribute('stroke-width', '1');
  guideLine.setAttribute('stroke-dasharray', '3 3');
  guideLine.setAttribute('opacity', '0.9');

  return guideLine;
}

// ---------------------------------------------------------------------------
// Main listener wiring
// ---------------------------------------------------------------------------

/**
 * Add tooltip event listeners to Observable Plot marks.
 * Extracts data from marks and displays custom tooltip on hover.
 * Returns a cleanup function to remove all event listeners.
 */
export function addTooltipListeners(
  plot: SVGSVGElement | HTMLElement,
  config: CustomTooltipConfig,
  showTooltip: (x: number, y: number, fields: TooltipField[], colorHex?: string, pinnedComparison?: PinnedTooltipComparison) => void,
  hideTooltip: () => void,
  updatePosition: (x: number, y: number) => void,
  pinTooltip?: () => void,
  unpinTooltip?: () => void,
  pinnedRef?: React.MutableRefObject<boolean>
): () => void {
  // RAF throttle state for mousemove position updates — shared across all marks in this chart.
  // Caps DOM mutations from position updates to at most one per animation frame (~16 ms).
  let rafId: number | null = null;
  let pendingX = 0;
  let pendingY = 0;

  // Find all interactive marks (circles, rects, paths with fill, lines),
  // excluding grid lines, axis ticks, and overlay-only marks (linear
  // regression, moving average — they have no data).
  const marks = queryDataMarkElements(plot);
  const circleColorByPosition = buildCircleColorIndex(plot);
  const cleanupFunctions: Array<() => void> = [];
  
  // Track which element is actually highlighted (may differ from hovered element)
  let highlightedElement: Element | null = null;
  let activeGuideLine: SVGLineElement | null = null;

  const clearAnyHighlight = () => {
    if (highlightedElement) {
      highlightedElement.classList.remove('chart-mark--highlighted');
      highlightedElement = null;
    }

    if (activeGuideLine) {
      activeGuideLine.remove();
      activeGuideLine = null;
    }
  };

  marks.forEach((mark, index) => {
    // Observable Plot stores data on elements via __data__ property
    const element = mark as any;
    
    /**
     * Extract data from a mark, show tooltip, and highlight the element.
     * Shared between mouseenter and click handlers to avoid duplication.
     */
    const showMarkTooltip = (mouseEvent: MouseEvent) => {
      const data = getMarkDatum(element, index, config.data);

      if (!data) {
        console.warn('[CustomTooltip] No data found for mark:', { index, element, available: config.data?.length });
        return;
      }
      
      try {
        const fields = config.getFields(data);
        const pinnedComparison = config.getPinnedComparison?.(data);

        // A hover-proxy dot stands in for its bar: colour and highlight come from the bar.
        const proxiedRect = findProxiedRect(mark);

        // PRIMARY: Read color directly from the SVG element - this is what's actually rendered
        // and is always correct. Do this BEFORE adding highlight class.
        let colorHex: string | undefined = undefined;
        if (mark instanceof Element) {
          colorHex = resolveColorFromElement(proxiedRect ?? mark, circleColorByPosition);
        }

        clearAnyHighlight();

        showTooltip(mouseEvent.clientX, mouseEvent.clientY, fields, colorHex, pinnedComparison);

        // Determine which element to highlight
        // If this is a transparent circle (hover dot for tick strips), highlight the line instead
        let elementToHighlight: Element = proxiedRect ?? mark;
        if (!proxiedRect && mark.tagName.toLowerCase() === 'circle') {
          const fill = mark.getAttribute('fill');
          const stroke = mark.getAttribute('stroke');
          const isTransparent = (fill === 'transparent' || fill === 'none' || !fill) &&
                                (stroke === 'transparent' || stroke === 'none' || !stroke);
          if (isTransparent) {
            const correspondingLine = findCorrespondingLine(mark);
            if (correspondingLine) {
              elementToHighlight = correspondingLine;
            }
          }
        }
        
        // Add highlight class AFTER computing color to avoid style interference
        elementToHighlight.classList.add('chart-mark--highlighted');
        highlightedElement = elementToHighlight;

        const svgRoot = mark.closest('svg');
        if (svgRoot instanceof SVGSVGElement) {
          activeGuideLine = updateVerticalGuideLine(svgRoot, config, mark, colorHex);
        }
      } catch (error) {
        console.warn('[CustomTooltip] Error generating tooltip fields:', error);
      }
    };

    /** Remove highlight from the currently highlighted element. */
    const clearHighlight = () => {
      clearAnyHighlight();
    };

    const handleMouseEnter = (e: Event) => {
      // Don't replace a pinned tooltip on hover — the user must click to switch marks
      if (pinnedRef?.current) return;
      showMarkTooltip(e as MouseEvent);
    };

    const handleMouseMove = (e: Event) => {
      // Don't move a pinned tooltip
      if (pinnedRef?.current) return;
      const mouseEvent = e as MouseEvent;
      pendingX = mouseEvent.clientX;
      pendingY = mouseEvent.clientY;
      // Throttle to one React state update per animation frame to reduce DOM
      // mutations and limit Bitwarden's shadow-root traversal overhead.
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          rafId = null;
          updatePosition(pendingX, pendingY);
        });
      }
    };

    const handleMouseLeave = () => {
      // Don't dismiss when tooltip is pinned
      if (pinnedRef?.current) return;
      clearHighlight();
      hideTooltip();
    };

    const handleClick = (e: Event) => {
      if (!pinTooltip) return;
      e.stopPropagation(); // Prevent document click handler from immediately hiding
      
      // If already pinned (e.g. on a different mark), switch to this mark:
      // unpin first, clear old highlight, then show + pin the new one
      if (pinnedRef?.current) {
        unpinTooltip?.();
        clearHighlight();
        showMarkTooltip(e as MouseEvent);
      }
      
      pinTooltip();
    };

    mark.addEventListener('mouseenter', handleMouseEnter);
    mark.addEventListener('mousemove', handleMouseMove);
    mark.addEventListener('mouseleave', handleMouseLeave);
    mark.addEventListener('click', handleClick);

    // Store cleanup function for this mark
    cleanupFunctions.push(() => {
      mark.removeEventListener('mouseenter', handleMouseEnter);
      mark.removeEventListener('mousemove', handleMouseMove);
      mark.removeEventListener('mouseleave', handleMouseLeave);
      mark.removeEventListener('click', handleClick);
      clearAnyHighlight();
    });
  });
  
  // Add global fallback handlers to prevent stuck tooltips
  const handleDocumentMouseLeave = (e: MouseEvent) => {
    // Don't dismiss pinned tooltips on mouse movement
    if (pinnedRef?.current) return;
    // If mouse leaves the plot container, hide tooltip
    const rect = plot.getBoundingClientRect();
    const isOutside = (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    );
    
    if (isOutside) {
      clearAnyHighlight();
      hideTooltip();
    }
  };
  
  const handleDocumentClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const clickedTooltipClose = target?.closest('.custom-tooltip__close');

    if (clickedTooltipClose) {
      clearAnyHighlight();
    }

    // If pinned, only unpin when clicking outside the tooltip
    if (pinnedRef?.current) {
      const insideTooltip = target?.closest('.custom-tooltip--pinned');
      if (!insideTooltip) {
        clearAnyHighlight();
        unpinTooltip?.();
      }
      return;
    }
    // Otherwise hide tooltip on any click
    clearAnyHighlight();
    hideTooltip();
  };
  
  const handleScroll = () => {
    // Unpin & hide on scroll — position becomes invalid
    if (pinnedRef?.current) {
      clearAnyHighlight();
      unpinTooltip?.();
      return;
    }
    clearAnyHighlight();
    hideTooltip();
  };
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Unpin if pinned, otherwise just hide
      if (pinnedRef?.current) {
        clearAnyHighlight();
        unpinTooltip?.();
      } else {
        clearAnyHighlight();
        hideTooltip();
      }
    }
  };
  
  const handleWindowBlur = () => {
    // Hide / unpin tooltip when window loses focus
    if (pinnedRef?.current) {
      clearAnyHighlight();
      unpinTooltip?.();
      return;
    }
    clearAnyHighlight();
    hideTooltip();
  };
  
  // Add global listeners
  document.addEventListener('mousemove', handleDocumentMouseLeave);
  document.addEventListener('click', handleDocumentClick);
  document.addEventListener('scroll', handleScroll, true); // useCapture for all scrolls
  document.addEventListener('keydown', handleKeyDown);
  window.addEventListener('blur', handleWindowBlur);
  
  // Add plot container leave handler as additional safety
  const handlePlotMouseLeave = () => {
    if (pinnedRef?.current) return;
    clearAnyHighlight();
    hideTooltip();
  };
  plot.addEventListener('mouseleave', handlePlotMouseLeave);
  
  // Return cleanup function that removes all listeners
  return () => {
    // Cancel any pending position-update frame
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    // Clean up mark listeners
    cleanupFunctions.forEach(cleanup => cleanup());
    
    // Clean up global listeners
    document.removeEventListener('mousemove', handleDocumentMouseLeave);
    document.removeEventListener('click', handleDocumentClick);
    document.removeEventListener('scroll', handleScroll, true);
    document.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('blur', handleWindowBlur);
    plot.removeEventListener('mouseleave', handlePlotMouseLeave);
    
    // Final safety: hide tooltip on cleanup
    clearAnyHighlight();
    hideTooltip();
  };
}
