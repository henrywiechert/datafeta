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

import { TooltipField, CustomTooltipConfig } from '../../../types';

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

/** Check whether a CSS colour string represents a visible (non-transparent) value. */
function isVisibleColor(val: string | null): boolean {
  if (!val) return false;
  const v = val.trim().toLowerCase();
  return v !== 'none' && v !== 'transparent' && 
         v !== 'rgba(0, 0, 0, 0)' && v !== 'rgba(0,0,0,0)';
}

/**
 * Resolve the rendered colour of an SVG mark element.
 *
 * Reads fill/stroke from both DOM attributes and computed styles.
 * For transparent hover-dots (tick strips) it searches sibling circles at
 * the same position to find the visually rendered colour.
 */
function resolveColorFromElement(el: Element): string | undefined {
  const cs = getComputedStyle(el);
  const resolveColor = (val: string | null): string | undefined => {
    if (!val) return undefined;
    const v = val.trim();
    if (v === 'none' || v === 'transparent' || v === 'rgba(0, 0, 0, 0)' || v === 'rgba(0,0,0,0)') return undefined;
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
  
  // If this element is transparent (like hover dots), look for a visible sibling at the same position
  if (el.tagName.toLowerCase() === 'circle') {
    const cx = el.getAttribute('cx');
    const cy = el.getAttribute('cy');
    
    // Look for another circle at the same position with visible color
    if (cx && cy) {
      const parent = el.parentElement;
      if (parent) {
        // Search in parent's parent (the SVG or a higher group) for circles at same position
        const svgRoot = el.closest('svg');
        if (svgRoot) {
          const allCircles = Array.from(svgRoot.querySelectorAll('circle'));
          for (const sibling of allCircles) {
            if (sibling === el) continue;
            if (sibling.getAttribute('cx') === cx && sibling.getAttribute('cy') === cy) {
              const sibFill = sibling.getAttribute('fill');
              const sibStroke = sibling.getAttribute('stroke');
              if (isVisibleColor(sibFill)) {
                color = sibFill!;
                break;
              }
              if (isVisibleColor(sibStroke)) {
                color = sibStroke!;
                break;
              }
              // Also try computed style
              const sibCs = getComputedStyle(sibling);
              const sibCsFill = sibCs.getPropertyValue('fill');
              const sibCsStroke = sibCs.getPropertyValue('stroke');
              if (isVisibleColor(sibCsFill)) {
                color = sibCsFill;
                break;
              }
              if (isVisibleColor(sibCsStroke)) {
                color = sibCsStroke;
                break;
              }
            }
          }
        }
      }
    }
  }
  
  return color;
}

// ---------------------------------------------------------------------------
// Tick-strip line matching
// ---------------------------------------------------------------------------

/**
 * For transparent hover-dot circles (tick strips), find the corresponding
 * visible line element that passes through the same point.
 */
function findCorrespondingLine(circle: Element): Element | null {
  const cx = circle.getAttribute('cx');
  const cy = circle.getAttribute('cy');
  if (!cx || !cy) return null;
  
  const svgRoot = circle.closest('svg');
  if (!svgRoot) return null;
  
  // Find a line element that passes through the circle's center point
  const lines = Array.from(svgRoot.querySelectorAll('line'));
  for (const line of lines) {
    const x1 = line.getAttribute('x1');
    const y1 = line.getAttribute('y1');
    const x2 = line.getAttribute('x2');
    const y2 = line.getAttribute('y2');
    
    // Check if circle center is on or very near the line
    // For tick marks, either x1===x2 (vertical) or y1===y2 (horizontal)
    const isOnLine = (
      // Vertical line: check if cx matches and cy is between y1 and y2
      (x1 === x2 && x1 === cx) ||
      // Horizontal line: check if cy matches and cx is between x1 and x2
      (y1 === y2 && y1 === cy)
    );
    
    if (isOnLine) {
      // Also check that the line has a visible stroke (it's the actual tick, not another invisible element)
      const stroke = line.getAttribute('stroke');
      if (stroke && stroke !== 'transparent' && stroke !== 'none') {
        return line;
      }
    }
  }
  return null;
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
  showTooltip: (x: number, y: number, fields: TooltipField[], colorHex?: string) => void,
  hideTooltip: () => void,
  updatePosition: (x: number, y: number) => void,
  pinTooltip?: () => void,
  unpinTooltip?: () => void,
  pinnedRef?: React.MutableRefObject<boolean>
): () => void {
  // Find all interactive marks (circles, rects, paths with fill, lines)
  // Observable Plot typically uses these elements for data visualization
  // 
  // IMPORTANT: We must exclude grid lines and axis tick marks which don't represent data.
  // Observable Plot uses aria-label attributes on group elements:
  // - Grid lines are inside groups with aria-label containing "grid" (e.g., "x-grid", "y-grid")
  // - Axis tick marks are inside groups with aria-label containing "axis" (e.g., "y-axis tick")
  const allElements = plot.querySelectorAll('circle, rect, path[fill]:not([fill="none"]), line');
  
  // Filter out elements that are part of grid, axis decorations, or overlay marks
  const marks = Array.from(allElements).filter(el => {
    // Walk up the DOM tree to check parent group aria-labels and classes
    let parent = el.parentElement;
    while (parent && parent !== plot) {
      // Exclude overlay marks (linear regression, moving average) — they have no data
      if (parent.classList.contains('overlay-no-tooltip')) {
        return false;
      }
      const ariaLabel = parent.getAttribute('aria-label');
      if (ariaLabel) {
        const labelLower = ariaLabel.toLowerCase();
        // Exclude grid lines and axis tick marks
        if (labelLower.includes('grid') || labelLower.includes('axis')) {
          return false;
        }
      }
      parent = parent.parentElement;
    }
    return true;
  });
  const cleanupFunctions: Array<() => void> = [];
  
  // Track which element is actually highlighted (may differ from hovered element)
  let highlightedElement: Element | null = null;

  marks.forEach((mark, index) => {
    // Observable Plot stores data on elements via __data__ property
    const element = mark as any;
    
    /**
     * Extract data from a mark, show tooltip, and highlight the element.
     * Shared between mouseenter and click handlers to avoid duplication.
     */
    const showMarkTooltip = (mouseEvent: MouseEvent) => {
      // Try multiple ways to get data:
      // 1. From __data__ property (D3 style)
      // 2. From our data array if provided
      let data = element.__data__;
      
      if (!data && config.data && config.data.length > 0) {
        if (index < config.data.length) {
          data = config.data[index];
        }
      }
      
      if (typeof data === 'number' && config.data && data < config.data.length) {
        data = config.data[data];
      }
      
      if (!data) {
        console.warn('[CustomTooltip] No data found for mark:', { index, element, available: config.data?.length });
        return;
      }
      
      try {
        const fields = config.getFields(data);
        
        // PRIMARY: Read color directly from the SVG element - this is what's actually rendered
        // and is always correct. Do this BEFORE adding highlight class.
        let colorHex: string | undefined = undefined;
        if (mark instanceof Element) {
          colorHex = resolveColorFromElement(mark);
        }
        
        showTooltip(mouseEvent.clientX, mouseEvent.clientY, fields, colorHex);
        
        // Determine which element to highlight
        // If this is a transparent circle (hover dot for tick strips), highlight the line instead
        let elementToHighlight: Element = mark;
        if (mark.tagName.toLowerCase() === 'circle') {
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
      } catch (error) {
        console.warn('[CustomTooltip] Error generating tooltip fields:', error);
      }
    };

    /** Remove highlight from the currently highlighted element. */
    const clearHighlight = () => {
      if (highlightedElement) {
        highlightedElement.classList.remove('chart-mark--highlighted');
        highlightedElement = null;
      }
      mark.classList.remove('chart-mark--highlighted');
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
      updatePosition(mouseEvent.clientX, mouseEvent.clientY);
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
      mark.classList.remove('chart-mark--highlighted');
      // Also clean up any separately highlighted element (like lines for tick strips)
      if (highlightedElement) {
        highlightedElement.classList.remove('chart-mark--highlighted');
        highlightedElement = null;
      }
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
      hideTooltip();
    }
  };
  
  const handleDocumentClick = (e: MouseEvent) => {
    // If pinned, only unpin when clicking outside the tooltip
    if (pinnedRef?.current) {
      const target = e.target as HTMLElement | null;
      const insideTooltip = target?.closest('.custom-tooltip--pinned');
      if (!insideTooltip) {
        unpinTooltip?.();
      }
      return;
    }
    // Otherwise hide tooltip on any click
    hideTooltip();
  };
  
  const handleScroll = () => {
    // Unpin & hide on scroll — position becomes invalid
    if (pinnedRef?.current) {
      unpinTooltip?.();
      return;
    }
    hideTooltip();
  };
  
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      // Unpin if pinned, otherwise just hide
      if (pinnedRef?.current) {
        unpinTooltip?.();
      } else {
        hideTooltip();
      }
    }
  };
  
  const handleWindowBlur = () => {
    // Hide / unpin tooltip when window loses focus
    if (pinnedRef?.current) {
      unpinTooltip?.();
      return;
    }
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
    hideTooltip();
  };
  plot.addEventListener('mouseleave', handlePlotMouseLeave);
  
  // Return cleanup function that removes all listeners
  return () => {
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
    hideTooltip();
  };
}
