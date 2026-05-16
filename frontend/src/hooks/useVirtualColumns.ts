// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useMemo } from 'react';
import { Field, DataType, VirtualColumnDefinition } from '../types';
import { isBinnedField } from '../utils/binningUtils';

interface UseVirtualColumnsParams {
    availableFields: Field[];
    virtualColumns: VirtualColumnDefinition[];
    virtualColumnFieldPreferences: Record<string, { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string }>;
    addVirtualColumn: (column: VirtualColumnDefinition) => void;
    updateVirtualColumn: (index: number, column: VirtualColumnDefinition) => void;
    removeVirtualColumn: (index: number) => void;
}

export interface UseVirtualColumnsReturn {
    availableFieldsWithVirtual: Field[];
    handleAddVirtualColumn: (column: VirtualColumnDefinition) => void;
    handleUpdateVirtualColumn: (index: number, column: VirtualColumnDefinition) => void;
    handleRemoveVirtualColumn: (index: number) => void;
}

export function useVirtualColumns({
    availableFields,
    virtualColumns,
    virtualColumnFieldPreferences,
    addVirtualColumn,
    updateVirtualColumn,
    removeVirtualColumn,
}: UseVirtualColumnsParams): UseVirtualColumnsReturn {
    
    // --- Merge virtual columns into available fields ---
    const availableFieldsWithVirtual = useMemo(() => {
        const virtualFields: Field[] = virtualColumns.map((vc, index) => {
            // Check if this is a binned field
            const isBinned = isBinnedField(vc);
            
            // Map output type to data type
            let dataType: DataType;
            if (isBinned) {
                // Binned fields are always numeric (result of FLOOR arithmetic)
                dataType = 'float';
            } else if (vc.output_type === 'numeric') {
                dataType = 'float'; // Use float for numeric virtual columns
            } else if (vc.output_type === 'datetime') {
                dataType = 'datetime';
            } else {
                dataType = 'string'; // Default to string for text
            }
            
            // Check if there are stored preferences for this virtual column
            const preferences = virtualColumnFieldPreferences[vc.name];
            
            // Default type and flavour based on output type (same logic as regular fields)
            let type: 'dimension' | 'measure';
            let flavour: 'discrete' | 'continuous';
            let aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct' | undefined;
            
            if (isBinned) {
                // Binned fields are ALWAYS discrete dimensions (this is the core histogram concept)
                type = 'dimension';
                flavour = 'discrete';
                aggregation = undefined;
            } else if (preferences) {
                // Use stored preferences if available
                type = preferences.type || 'dimension';
                flavour = preferences.flavour || 'discrete';
                aggregation = preferences.aggregation as any;
            } else if (vc.output_type === 'text' || vc.output_type === 'datetime') {
                type = 'dimension';
                flavour = 'discrete';
                aggregation = undefined;
            } else if (vc.output_type === 'numeric') {
                // Default numeric virtual columns to dimension (can be changed to measure in UI)
                type = 'dimension';
                flavour = 'discrete';
                aggregation = undefined;
            } else {
                type = 'dimension';
                flavour = 'discrete';
                aggregation = undefined;
            }
            
            return {
                id: `virtual_${vc.name}_${index}`,
                columnName: vc.name,
                type: type,
                flavour: flavour,
                dataType: dataType,
                aggregation: aggregation,
                // Add a marker that this is a virtual column
                // @ts-ignore - We'll add is_virtual to Field type if needed
                is_virtual: true,
            };
        });
        
        return [...availableFields, ...virtualFields];
    }, [availableFields, virtualColumns, virtualColumnFieldPreferences]);

    // --- Virtual Column Handlers ---
    
    const handleAddVirtualColumn = useCallback((column: VirtualColumnDefinition) => {
        addVirtualColumn(column);
    }, [addVirtualColumn]);

    const handleUpdateVirtualColumn = useCallback((index: number, column: VirtualColumnDefinition) => {
        updateVirtualColumn(index, column);
    }, [updateVirtualColumn]);

    const handleRemoveVirtualColumn = useCallback((index: number) => {
        removeVirtualColumn(index);
    }, [removeVirtualColumn]);

    return {
        availableFieldsWithVirtual,
        handleAddVirtualColumn,
        handleUpdateVirtualColumn,
        handleRemoveVirtualColumn,
    };
}

