// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * HuggingFace dataset search and split metadata types.
 */

export interface HuggingFaceDataset {
  ref: string;
  title: string;
  size_mb: number;
  num_rows: number;
}

export interface HuggingFaceSplit {
  table_name: string;
  config: string;
  split: string;
  size_mb: number;
  num_rows: number;
  is_too_large: boolean;
}

export interface HuggingFaceSearchResponse {
  datasets: HuggingFaceDataset[];
}

export interface HuggingFaceSplitsResponse {
  splits: HuggingFaceSplit[];
  partial?: boolean;
  warning?: string;
}
