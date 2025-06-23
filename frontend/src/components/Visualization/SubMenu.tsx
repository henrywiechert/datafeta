import React, { useState } from 'react';
import styles from './ContextMenu.module.css';

interface SubMenuProps {
  label: string;
  children: React.ReactNode;
  isActive?: boolean;
}

const SubMenu: React.FC<SubMenuProps> = ({ label, children, isActive }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [openToLeft, setOpenToLeft] = useState(false);
  const subMenuRef = React.useRef<HTMLDivElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      // Estimate submenu width based on content
      // Use a more generous estimate to account for longer text
      const estimatedSubMenuWidth = 160;
      
      // If submenu would go off right edge, open to left
      if (containerRect.right + estimatedSubMenuWidth > viewportWidth - 20) { // 20px margin
        setOpenToLeft(true);
      } else {
        setOpenToLeft(false);
      }
    }
    
    setIsOpen(true);
  };

  // Fine-tune position after submenu is rendered
  React.useEffect(() => {
    if (isOpen && containerRef.current && subMenuRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect();
      const subMenuRect = subMenuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      // Double-check with actual dimensions
      if (containerRect.right + subMenuRect.width > viewportWidth - 10) {
        if (!openToLeft) {
          setOpenToLeft(true);
        }
      }
    }
  }, [isOpen, openToLeft]);

  return (
    <div 
      ref={containerRef}
      className={styles.subMenuContainer}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsOpen(false)}
    >
      <div className={`${styles.menuItem} ${styles.subMenuItem}`}>
        {label} {isActive && '✔'} →
      </div>
      {isOpen && (
        <div 
          ref={subMenuRef}
          className={`${styles.subMenu} ${openToLeft ? styles.subMenuLeft : ''}`}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export default SubMenu; 