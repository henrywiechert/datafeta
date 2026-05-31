// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ContextMenu.module.css';

interface MenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: MenuPosition;
  onClose: () => void;
  children: React.ReactNode;
  /** Accessible name for the popup (e.g. "Field actions"). */
  ariaLabel?: string;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ position, onClose, children, ariaLabel = 'Context menu' }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);
  // Element focused before the menu opened (e.g. the field chip that fired
  // Shift+F10). Restored on close so keyboard focus isn't dropped to <body>.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Collect the interactive menu items currently in the DOM. Items are plain
  // <div className={styles.menuItem}> elements rendered by callers; the hashed
  // CSS-module class still contains the literal "menuItem" substring. Disabled
  // items are skipped so roving focus only lands on actionable entries.
  const getItems = useCallback((): HTMLElement[] => {
    const root = menuRef.current;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>('[class*="menuItem"]'),
    ).filter((el) => !el.className.includes('disabled'));
  }, []);

  useLayoutEffect(() => {
    if (menuRef.current) {
      const menuRect = menuRef.current.getBoundingClientRect();
      const { innerWidth: viewportWidth, innerHeight: viewportHeight } = window;

      let newY = position.y;
      if (position.y + menuRect.height > viewportHeight) {
        newY = position.y - menuRect.height;
      }
      if (newY < 0) {
        newY = viewportHeight - menuRect.height;
      }
      newY = Math.max(5, newY); // Add a small buffer from the top edge

      let newX = position.x;
      if (position.x + menuRect.width > viewportWidth) {
        newX = position.x - menuRect.width;
      }
      if (newX < 0) {
        newX = viewportWidth - menuRect.width;
      }
      newX = Math.max(5, newX); // Add a small buffer from the left edge

      setAdjustedPosition({ y: newY, x: newX });
    }
  }, [position]);

  // Add a listener to close the menu if the user clicks outside of it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Keyboard support: when opened (incl. via Shift+F10 / ContextMenu key on a
  // field chip), move focus into the menu, tag items with menu roles, and
  // restore focus to the trigger on close.
  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    const items = getItems();
    items.forEach((el) => {
      el.setAttribute('role', 'menuitem');
      el.setAttribute('tabindex', '-1');
    });
    (items[0] ?? menuRef.current)?.focus();
    return () => {
      // Optional chaining guards against the trigger having been unmounted.
      previouslyFocusedRef.current?.focus?.();
    };
    // Open-once focus setup; children are present synchronously on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const items = getItems();
      const activeIndex = items.indexOf(document.activeElement as HTMLElement);

      switch (event.key) {
        case 'Escape':
          event.preventDefault();
          event.stopPropagation();
          onClose();
          break;
        case 'ArrowDown':
          if (items.length === 0) break;
          event.preventDefault();
          items[activeIndex < 0 ? 0 : (activeIndex + 1) % items.length].focus();
          break;
        case 'ArrowUp':
          if (items.length === 0) break;
          event.preventDefault();
          items[activeIndex < 0 ? items.length - 1 : (activeIndex - 1 + items.length) % items.length].focus();
          break;
        case 'Home':
          if (items.length === 0) break;
          event.preventDefault();
          items[0].focus();
          break;
        case 'End':
          if (items.length === 0) break;
          event.preventDefault();
          items[items.length - 1].focus();
          break;
        case 'Enter':
        case ' ': {
          const active = document.activeElement as HTMLElement | null;
          if (active && items.includes(active)) {
            event.preventDefault();
            active.click();
          }
          break;
        }
        default:
          break;
      }
    },
    [getItems, onClose],
  );

  // Render as portal to avoid parent CSS containment and z-index issues
  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
      role="menu"
      aria-label={ariaLabel}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      style={{ 
        top: adjustedPosition.y,
        left: adjustedPosition.x,
        backgroundColor: '#ffffff',
        opacity: 1,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
};

export default ContextMenu; 