import React from 'react';
import styles from './DataSourcePanel.module.css';

interface DataSourcePanelProps {
  children: React.ReactNode;
}

const DataSourcePanel: React.FC<DataSourcePanelProps> = ({ children }) => {
  return (
    <div className={styles.panel}>
      {children}
    </div>
  );
};

export default DataSourcePanel; 