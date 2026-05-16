// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * DateTime Module
 * 
 * Centralized exports for all datetime-related functionality.
 * 
 * Directory structure:
 * - datetimeSemantics.ts: Core datetime part/mode definitions and SQL mappings
 * - dateTimeValueModel.ts: Value detection and band scale normalization
 * - datetimeUtils.ts: Field-level datetime utilities
 * - datetimePresets.ts: Filter presets (Last 7 Days, etc.)
 * - datetimeFormatUtils.ts: Parsing and formatting utilities
 * - utcWarnings.ts: Non-UTC timezone detection
 */

// Core semantics and SQL generation
export * from './datetimeSemantics';

// Value detection and normalization
export * from './dateTimeValueModel';

// Field-level utilities
// Note: DATETIME_PARTS and DATETIME_MODES are already exported from datetimeSemantics
export {
  isDateTimeField,
  hasDateTimePart,
  getDateTimePartDisplayName,
  getFieldDisplayNameWithDateTime,
  getDateTimePartTooltip,
  getResultColumnNameForDateTime,
  isValidDateTimeConfiguration,
  clearDateTimePart,
  setDateTimePart,
  canHaveDateTimePart,
  getDateTimeModeDescription,
  formatDateForDisplay,
  extractDatePart,
  areDateTimeConfigsEqual,
} from './datetimeUtils';

// Filter presets
export * from './datetimePresets';

// Parsing and formatting
export * from './datetimeFormatUtils';

// UTC warnings (optional, for dev)
export * from './utcWarnings';
