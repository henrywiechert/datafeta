// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field } from '../../../types';

/**
 * Creates a custom drag image with a badge showing the count of items being dragged
 */
export const createDragImageWithBadge = (
  chipElement: HTMLElement,
  count: number
): HTMLElement => {
  // Find the actual chip element (it has the 'field-chip' class)
  const actualChip = chipElement.querySelector('.field-chip') || chipElement;
  const dragImage = actualChip.cloneNode(true) as HTMLElement;
  
  // Create a wrapper for proper positioning
  const wrapper = document.createElement('div');
  wrapper.style.position = 'absolute';
  wrapper.style.top = '-1000px';
  wrapper.style.left = '-1000px';
  wrapper.style.display = 'inline-block';
  
  // Style the drag image
  dragImage.style.opacity = '1';
  dragImage.style.position = 'relative';
  dragImage.style.display = 'inline-block';
  
  wrapper.appendChild(dragImage);
  
  // Add badge for multi-field drag
  if (count > 1) {
    const badge = document.createElement('div');
    badge.textContent = count.toString();
    badge.style.position = 'absolute';
    badge.style.top = '-8px';
    badge.style.right = '-8px';
    badge.style.backgroundColor = '#1976d2';
    badge.style.color = 'white';
    badge.style.borderRadius = '50%';
    badge.style.width = '20px';
    badge.style.height = '20px';
    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.justifyContent = 'center';
    badge.style.fontSize = '11px';
    badge.style.fontWeight = 'bold';
    badge.style.zIndex = '1000';
    badge.style.pointerEvents = 'none';
    wrapper.appendChild(badge);
  }
  
  return wrapper;
};

/**
 * Sets the drag image and cleans it up after the drag starts
 */
export const setDragImage = (
  e: React.DragEvent,
  dragImageWrapper: HTMLElement,
  offsetX: number = 10,
  offsetY: number = 10
): void => {
  document.body.appendChild(dragImageWrapper);
  e.dataTransfer.setDragImage(dragImageWrapper, offsetX, offsetY);
  setTimeout(() => document.body.removeChild(dragImageWrapper), 0);
};

/**
 * Creates the drag data payload for field chips
 */
export const createDragPayload = (
  fields: Field[],
  source: string,
  indices: number[]
) => {
  return JSON.stringify({
    fields,
    source,
    indices,
  });
};
