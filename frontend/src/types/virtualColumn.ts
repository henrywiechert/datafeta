// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Virtual Column Types
 * Calculated columns and binning definitions
 */

/**
 * Binned field configuration.
 * Stores the original binning parameters so the field can be edited later.
 */
export interface BinnedFieldDefinition {
  name: string;              // Field name (e.g., "Revenue (bin)")
  sourceField: string;       // Original field being binned (e.g., "Revenue")
  binWidth: number;          // Bin width (e.g., 100)
}

/**
 * Virtual column (calculated column) definition.
 * Allows users to create new columns based on SQL expressions.
 */
export interface VirtualColumnDefinition {
  name: string;                    // Column name (identifier format)
  expression: string;              // SQL expression (e.g., "(revenue - cost) / revenue * 100")
  output_type?: 'numeric' | 'text' | 'datetime';  // Output data type
  description?: string;            // User-friendly description
  binConfig?: BinnedFieldDefinition; // Present if this is a binned field (for edit/display)
  /**
   * Presentation-only: when true the column's value is treated as a URL and
   * rendered as a clickable link in pinned tooltips.
   *
   * Deliberately NOT part of the SQL expression or the query fingerprint —
   * toggling it re-renders rather than refetches. The URL itself is built in
   * `expression` (e.g. CONCAT('https://host/x/', id)), so it is a real grouped
   * column value like any other.
   */
  link?: boolean;
}
