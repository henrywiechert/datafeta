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
 * Validate axis fields against valid column names.
 * Returns new arrays with isInvalid flag set appropriately.
 * 
 * A field is considered invalid if:
 * - Its columnName is not in the validNames set AND
 * - It's not a virtual field (is_virtual !== true)
 * 
 * Virtual fields are validated by their presence in virtualColumns,
 * which is handled by including virtual column names in validNames.
 */
export function validateAxisFields(
    xAxisFields: Field[],
    yAxisFields: Field[],
    validNames: Set<string>
): { patchedX: Field[]; patchedY: Field[] } {
    const patchedX = xAxisFields.map(f => ({
        ...f,
        isInvalid: !validNames.has(f.columnName)
    }));
    
    const patchedY = yAxisFields.map(f => ({
        ...f,
        isInvalid: !validNames.has(f.columnName)
    }));
    
    return { patchedX, patchedY };
}

/**
 * Mark all axis fields as invalid (used when table is cleared).
 */
export function markAllAxisFieldsInvalid(
    xAxisFields: Field[],
    yAxisFields: Field[]
): { patchedX: Field[]; patchedY: Field[] } {
    const patchedX = xAxisFields.map(f => ({ ...f, isInvalid: true }));
    const patchedY = yAxisFields.map(f => ({ ...f, isInvalid: true }));
    return { patchedX, patchedY };
}
