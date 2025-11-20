import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
}

const ContextMenu: React.FC<ContextMenuProps> = ({ position, onClose, children }) => {
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPosition, setAdjustedPosition] = useState(position);

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

  // Render as portal to avoid parent CSS containment and z-index issues
  return createPortal(
    <div
      ref={menuRef}
      className={styles.menu}
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