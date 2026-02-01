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
}
