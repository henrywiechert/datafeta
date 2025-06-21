import React from 'react';
import styles from './DropZones.module.css';

interface DropZonesProps {
  children: React.ReactNode;
}

const DropZones: React.FC<DropZonesProps> = ({ children }) => {
  return (
    <div className={styles.container}>
      {children}
    </div>
  );
};

export default DropZones; 