import React, { useEffect, useRef } from 'react';
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

  return (
    <div
      ref={menuRef}
      className={styles.menu}
      style={{ 
        top: position.y,
        left: position.x
      }}
    >
      {children}
    </div>
  );
};

export default ContextMenu; 