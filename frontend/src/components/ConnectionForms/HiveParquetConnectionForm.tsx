/**
 * HiveParquetConnectionForm - Folder picker for Hive-partitioned Parquet datasets.
 * Uses HTML5 webkitdirectory attribute for folder selection.
 */

import React, { ChangeEvent, useMemo } from 'react';
import { HiveParquetFormState } from './types';
import styles from '../../pages/DataSourceSelectionPage.module.css';

interface HiveParquetConnectionFormProps {
  state: HiveParquetFormState;
  onUpdate: (updates: Partial<HiveParquetFormState>) => void;
  onFolderSelect: (files: File[] | null) => void;
  disabled: boolean;
  isConnecting?: boolean;
  isConnected?: boolean;
}

export function HiveParquetConnectionForm({
  state,
  onUpdate,
  onFolderSelect,
  disabled,
  isConnecting = false,
  isConnected = false,
}: HiveParquetConnectionFormProps) {
  
  const handleFolderChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files.length > 0) {
      const files = Array.from(event.target.files);
      
      // Filter to only parquet files
      const parquetFiles = files.filter(f => 
        f.name.toLowerCase().endsWith('.parquet')
      );
      
      if (parquetFiles.length === 0) {
        onUpdate({ error: 'No parquet files found in the selected folder' });
        onFolderSelect(null);
        return;
      }
      
      // Extract relative paths for backend
      const fileStructure = parquetFiles.map(f => f.webkitRelativePath);
      
      // Group files by partition
      const partitionFiles = new Map<string, File[]>();
      const partitionPattern = /^[^/]+\/([^=]+)=([^/]+)\//;
      
      for (const file of parquetFiles) {
        const match = file.webkitRelativePath.match(partitionPattern);
        if (match) {
          const partitionValue = match[2];
          if (!partitionFiles.has(partitionValue)) {
            partitionFiles.set(partitionValue, []);
          }
          partitionFiles.get(partitionValue)!.push(file);
        }
      }
      
      onUpdate({
        selectedFolder: files,
        fileStructure,
        partitionFiles,
        error: null,
      });
      
      onFolderSelect(parquetFiles);
    } else {
      onFolderSelect(null);
    }
  };

  // Summary of detected partitions
  const partitionSummary = useMemo(() => {
    if (state.fileStructure.length === 0) return null;
    
    const partitionCount = state.partitionFiles.size;
    const fileCount = state.fileStructure.length;
    
    if (partitionCount > 0) {
      return `${fileCount} parquet file(s) in ${partitionCount} partition(s)`;
    }
    
    return `${fileCount} parquet file(s) found`;
  }, [state.fileStructure, state.partitionFiles]);

  // Get folder name from first file's relative path
  const folderName = useMemo(() => {
    if (state.fileStructure.length === 0) return null;
    const path = state.fileStructure[0];
    const parts = path.split('/');
    return parts[0];
  }, [state.fileStructure]);

  return (
    <div className={styles.formGroup}>
      <div className={styles.fileUpload}>
        <label className={styles.label}>Dataset Folder</label>
        <p className={styles.helpText}>
          Select a folder containing Hive-partitioned Parquet files.
          <br />
          Expected structure: <code>folder/column=value/*.parquet</code>
        </p>
        <input
          type="file"
          /* @ts-expect-error - webkitdirectory is not in React's HTMLInputElement type */
          webkitdirectory=""
          directory=""
          onChange={handleFolderChange}
          disabled={disabled || isConnecting || isConnected}
          className={styles.input}
        />
        
        {state.error && (
          <div className={styles.errorMessage}>{state.error}</div>
        )}
        
        {folderName && !state.error && (
          <div className={styles.selectedFile}>
            Selected folder: <strong>{folderName}</strong>
          </div>
        )}
        
        {partitionSummary && !state.error && (
          <div className={styles.fileInfo}>
            {partitionSummary}
          </div>
        )}
        
        {state.partitionColumn && (
          <div className={styles.partitionInfo}>
            Partition column: <strong>{state.partitionColumn}</strong>
          </div>
        )}
        
        {state.availablePartitions.length > 0 && (
          <div className={styles.partitionList}>
            <div className={styles.partitionListHeader}>
              Available partitions ({state.availablePartitions.length}):
            </div>
            <div className={styles.partitionListItems}>
              {state.availablePartitions.slice(0, 10).map((partition, idx) => (
                <span key={idx} className={styles.partitionTag}>
                  {partition}
                </span>
              ))}
              {state.availablePartitions.length > 10 && (
                <span className={styles.partitionMore}>
                  +{state.availablePartitions.length - 10} more
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
