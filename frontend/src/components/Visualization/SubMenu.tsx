// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import React, { useRef, useState } from 'react';
import styles from './ContextMenu.module.css';
import { useFlyoutPosition } from './useFlyoutPosition';

interface SubMenuProps {
  label: string;
  children: React.ReactNode;
  isActive?: boolean;
}

const SubMenu: React.FC<SubMenuProps> = ({ label, children, isActive }) => {
  const [isOpen, setIsOpen] = useState(false);
  const subMenuRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { openToLeft, openUpward, maxHeight } = useFlyoutPosition(
    containerRef,
    subMenuRef,
    isOpen,
  );

  return (
    <div 
      ref={containerRef}
      className={styles.subMenuContainer}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <div className={`${styles.menuItem} ${styles.subMenuItem}`}>
        {label} {isActive && '✔'} →
      </div>
      {isOpen && (
        <div 
          ref={subMenuRef}
          className={[
            styles.subMenu,
            openToLeft ? styles.subMenuLeft : '',
            openUpward ? styles.subMenuUp : '',
          ].filter(Boolean).join(' ')}
          style={maxHeight ? { maxHeight, overflowY: 'auto' } : undefined}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default SubMenu; 