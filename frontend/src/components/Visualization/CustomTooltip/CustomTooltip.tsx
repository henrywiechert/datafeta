import React, { useEffect, useRef, useState } from 'react';
import { TooltipField, TooltipFilterAction, PinnedTooltipComparison } from '../../../types';
import './CustomTooltip.css';

// Re-export for backward compatibility
export type { TooltipField } from '../../../types';

interface CustomTooltipProps {
  x: number;
  y: number;
  fields: TooltipField[];
  visible: boolean;
  colorHex?: string; // Optional color mark representing the hovered chart element color
  pinnedComparison?: PinnedTooltipComparison;
  pinned?: boolean;
  onUnpin?: () => void;
  onFilterAction?: (action: TooltipFilterAction, field: TooltipField) => void;
}

function formatPercentDifference(value: number | undefined): string | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  const rounded = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
  return `${value > 0 ? '+' : ''}${rounded}%`;
}

/** Inline SVG icon for "keep only" filter (funnel) – 14×14 */
const KeepIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
  </svg>
);

/** Inline SVG icon for "exclude" filter (circle-slash) – 14×14 */
const ExcludeIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.902 7.902 0 014 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.902 7.902 0 0120 12c0 4.42-3.58 8-8 8z" />
  </svg>
);

/** Inline SVG icon for "filter visible" (funnel with list) – 14×14 */
const FilterVisibleIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z" />
    <rect x="17" y="14" width="5" height="1.5" rx="0.5" />
    <rect x="17" y="17" width="5" height="1.5" rx="0.5" />
    <rect x="17" y="20" width="5" height="1.5" rx="0.5" />
  </svg>
);

/** Inline SVG close icon – 16×16 */
const CloseIconSvg: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
  </svg>
);

/**
 * Custom HTML tooltip component with full CSS control.
 * Replaces Observable Plot's built-in SVG tooltips for better formatting.
 * Supports both normal and fullscreen modes.
 * When pinned, displays inline "keep only" / "exclude" filter action icons
 * for discrete fields.
 */
export const CustomTooltip: React.FC<CustomTooltipProps> = ({ 
  x, 
  y, 
  fields, 
  visible,
  colorHex,
  pinnedComparison,
  pinned = false,
  onUnpin,
  onFilterAction,
}) => {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [comparisonExpanded, setComparisonExpanded] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number; anchor: string }>({ 
    x, 
    y, 
    anchor: 'right' 
  });

  // Smart positioning to prevent tooltip from going off-screen
  useEffect(() => {
    if (!visible || !tooltipRef.current) return;
    // Skip repositioning while pinned — keep the tooltip where it was pinned
    if (pinned) return;

    const tooltip = tooltipRef.current;
    const rect = tooltip.getBoundingClientRect();
    
    // Check if we're in fullscreen mode
    const fullscreenElement = (
      document.fullscreenElement ||
      (document as any).webkitFullscreenElement ||
      (document as any).mozFullScreenElement ||
      (document as any).msFullscreenElement
    ) as HTMLElement | null;

    // If in fullscreen, calculate bounds relative to fullscreen element
    // Otherwise, use viewport bounds
    const bounds = fullscreenElement 
      ? fullscreenElement.getBoundingClientRect()
      : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };

    const viewportWidth = bounds.width;
    const viewportHeight = bounds.height;
    
    let newX = x;
    let newY = y;
    let anchor = 'right';

    // Adjust coordinates if in fullscreen to be relative to fullscreen element
    if (fullscreenElement) {
      newX = x - bounds.left;
      newY = y - bounds.top;
    }

    // Check horizontal overflow
    if (newX + rect.width + 15 > viewportWidth) {
      // Position to left of cursor
      anchor = 'left';
    }

    // Check vertical overflow
    if (newY + rect.height / 2 > viewportHeight) {
      // Move up
      newY = viewportHeight - rect.height / 2 - 10;
    } else if (newY - rect.height / 2 < 0) {
      // Move down
      newY = rect.height / 2 + 10;
    }

    setPosition({ x: newX, y: newY, anchor });
  }, [x, y, visible, pinned]);

  useEffect(() => {
    setComparisonExpanded(false);
  }, [visible, pinned, pinnedComparison]);

  if (!visible || fields.length === 0) {
    return null;
  }

  /** Whether a field row should show filter action buttons */
  const isFilterable = (field: TooltipField) =>
    pinned && onFilterAction && field.sourceField?.flavour === 'discrete' && field.rawValue != null;

  return (
    <div 
      ref={tooltipRef}
      className={`custom-tooltip custom-tooltip--${position.anchor}${pinned ? ' custom-tooltip--pinned' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        display: 'block',
        visibility: 'visible',
        opacity: 1,
        // Vertical color bar on the left when colorHex is provided
        ...(colorHex ? { borderLeft: `8px solid ${colorHex}`, paddingLeft: 12 } : {})
      }}
    >
      {/* Close button for pinned tooltip */}
      {pinned && onUnpin && (
        <button
          className="custom-tooltip__close"
          onClick={onUnpin}
          aria-label="Close tooltip"
        >
          <CloseIconSvg />
        </button>
      )}

      {fields.map((field, idx) => (
        <div key={idx} className="custom-tooltip__row">
          <span className="custom-tooltip__label">{field.label}:</span>
          <span className="custom-tooltip__value">
            {field.formattedValue !== undefined ? field.formattedValue : field.value}
          </span>
          {/* Inline filter action icons for discrete fields when pinned */}
          {isFilterable(field) && (
            <span className="custom-tooltip__actions">
              <button
                className="custom-tooltip__action-btn custom-tooltip__action-btn--keep"
                title="Keep only"
                onClick={() => onFilterAction!('keep', field)}
              >
                <KeepIcon />
              </button>
              <button
                className="custom-tooltip__action-btn custom-tooltip__action-btn--exclude"
                title="Exclude"
                onClick={() => onFilterAction!('exclude', field)}
              >
                <ExcludeIcon />
              </button>
              <button
                className="custom-tooltip__action-btn custom-tooltip__action-btn--filter-visible"
                title="Filter to all visible values"
                onClick={() => onFilterAction!('filter-visible', field)}
              >
                <FilterVisibleIcon />
              </button>
            </span>
          )}
        </div>
      ))}

      {pinned && pinnedComparison && (
        <div className="custom-tooltip__comparison">
          <button
            className="custom-tooltip__comparison-toggle"
            onClick={() => setComparisonExpanded((current) => !current)}
            type="button"
          >
            {comparisonExpanded ? 'Hide All Values At X' : 'All Values At X'}
          </button>

          {comparisonExpanded && (
            <div className="custom-tooltip__comparison-panel">
              <div className="custom-tooltip__comparison-title">{pinnedComparison.title}</div>
              <div className="custom-tooltip__comparison-subtitle">
                {pinnedComparison.xLabel}: {pinnedComparison.xFormattedValue}
              </div>
              <div className="custom-tooltip__comparison-list">
                {pinnedComparison.items.map((item) => {
                  const formattedDelta = formatPercentDifference(item.percentDifference);
                  return (
                    <div
                      key={`${item.seriesKey}-${item.formattedValue}`}
                      className={`custom-tooltip__comparison-item${item.isSelected ? ' custom-tooltip__comparison-item--selected' : ''}`}
                    >
                      <span
                        className="custom-tooltip__comparison-swatch"
                        style={item.colorHex ? { backgroundColor: item.colorHex } : undefined}
                      />
                      <span className="custom-tooltip__comparison-series">{item.seriesLabel}</span>
                      <span className="custom-tooltip__comparison-value">{item.formattedValue ?? item.value}</span>
                      {formattedDelta && (
                        <span className="custom-tooltip__comparison-delta">{formattedDelta}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

