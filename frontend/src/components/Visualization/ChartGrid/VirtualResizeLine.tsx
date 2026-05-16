// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React from 'react';
import { RESIZE_HANDLE_HOVER_COLOR } from '../../../config/chartLayoutConfig';

interface VirtualResizeLineProps {
  orientation: 'horizontal' | 'vertical';
  position: number; // px position from top (horizontal) or left (vertical)
  isVisible: boolean;
  // Optional: display current size
  displaySize?: number;
}

/**
 * VirtualResizeLine - Ghost line shown during drag to preview new grid position
 * 
 * Appears when user drags a resize handle. Shows where the gridline will be
 * when the user releases the mouse.
 */
const VirtualResizeLine: React.FC<VirtualResizeLineProps> = ({
  orientation,
  position,
  isVisible,
  displaySize,
}) => {
  if (!isVisible) return null;

  const isHorizontal = orientation === 'horizontal';

  return (
    <>
      {/* Virtual line */}
      <div
        style={{
          position: 'absolute',
          ...(isHorizontal
            ? {
                top: `${position}px`,
                left: 0,
                width: '100%',
                height: '1px',
              }
            : {
                left: `${position}px`,
                top: 0,
                height: '100%',
                width: '1px',
              }),
          backgroundColor: RESIZE_HANDLE_HOVER_COLOR,
          opacity: 0.8,
          pointerEvents: 'none',
          zIndex: 200, // Above resize overlay
          boxShadow: '0 0 4px rgba(0,0,0,0.3)',
        }}
      />

      {/* Size tooltip (optional) */}
      {displaySize !== undefined && (
        <div
          style={{
            position: 'absolute',
            ...(isHorizontal
              ? {
                  top: `${position + 8}px`,
                  left: '50%',
                  transform: 'translateX(-50%)',
                }
              : {
                  left: `${position + 8}px`,
                  top: '50%',
                  transform: 'translateY(-50%)',
                }),
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '4px 8px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 'bold',
            pointerEvents: 'none',
            zIndex: 201,
            whiteSpace: 'nowrap',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
          }}
        >
          {Math.round(displaySize)}px
        </div>
      )}
    </>
  );
};

export default VirtualResizeLine;

