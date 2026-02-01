/**
 * Kaggle-Specific Types
 * Types for Kaggle dataset search and file listing
 */

export interface KaggleDataset {
  ref: string;                    // Dataset reference (owner/dataset-name)
  title: string;                  // Dataset title
  size_mb: number;                // Size in megabytes
  csv_file_count: number;         // Number of CSV files
  last_updated: string | null;    // Last update timestamp
}

export interface KaggleFile {
  name: string;                   // File name
  size_mb: number;                // Size in megabytes
}

export interface KaggleSearchResponse {
  datasets: KaggleDataset[];
}

export interface KaggleFilesResponse {
  files: KaggleFile[];
}
