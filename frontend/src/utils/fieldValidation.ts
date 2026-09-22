// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { Field, VirtualColumnDefinition } from '../types';

/**
 * Build a set of valid column names from real columns and virtual columns.
 * Used to validate axis fields against the current schema.
 */
export function buildValidColumnNames(
    realColumns: Field[],
    virtualColumns: VirtualColumnDefinition[]
): Set<string> {
    const names = new Set<string>();
    
    // Add real column names
    realColumns.forEach(f => names.add(f.columnName));
    
    // Add virtual column names
    virtualColumns.forEach(vc => names.add(vc.name));
    
    return names;
}

/**
 * Mark each field valid or invalid against the current schema.
 *
 * A field is invalid when its columnName is absent from `validNames`. Virtual
 * fields are covered because buildValidColumnNames includes virtual column
 * names.
 */
export function validateFields<T extends Field>(fields: T[], validNames: Set<string>): T[] {
    return fields.map(f => ({ ...f, isInvalid: !validNames.has(f.columnName) }));
}

/** validateFields for the single-field slots (colour, size, shape, background). */
export function validateOptionalField<T extends Field>(
    field: T | null | undefined,
    validNames: Set<string>,
): T | null {
    if (!field) return null;
    return { ...field, isInvalid: !validNames.has(field.columnName) };
}

/** Flag every field, for when there is no schema left to check against. */
export function markFieldsInvalid<T extends Field>(fields: T[]): T[] {
    return fields.map(f => ({ ...f, isInvalid: true }));
}

/** markFieldsInvalid for the single-field slots. */
export function markOptionalFieldInvalid<T extends Field>(field: T | null | undefined): T | null {
    return field ? { ...field, isInvalid: true } : null;
}

/**
 * Validate the two axis collections in one call.
 *
 * A convenience over validateFields, kept because the axes are patched
 * together at every call site.
 */
export function validateAxisFields(
    xAxisFields: Field[],
    yAxisFields: Field[],
    validNames: Set<string>
): { patchedX: Field[]; patchedY: Field[] } {
    return {
        patchedX: validateFields(xAxisFields, validNames),
        patchedY: validateFields(yAxisFields, validNames),
    };
}

/**
 * Mark all axis fields as invalid (used when table is cleared).
 */
export function markAllAxisFieldsInvalid(
    xAxisFields: Field[],
    yAxisFields: Field[]
): { patchedX: Field[]; patchedY: Field[] } {
    return {
        patchedX: markFieldsInvalid(xAxisFields),
        patchedY: markFieldsInvalid(yAxisFields),
    };
}
