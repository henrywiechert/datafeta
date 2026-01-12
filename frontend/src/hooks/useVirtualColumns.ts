import { useCallback, useMemo } from 'react';
import { Field, DataType, VirtualColumnDefinition } from '../types';

interface UseVirtualColumnsParams {
    availableFields: Field[];
    virtualColumns: VirtualColumnDefinition[];
    virtualColumnFieldPreferences: Record<string, { type?: 'dimension' | 'measure'; flavour?: 'discrete' | 'continuous'; aggregation?: string }>;
    dispatch: React.Dispatch<any>;
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
    dispatch
}: UseVirtualColumnsParams): UseVirtualColumnsReturn {
    
    // --- Merge virtual columns into available fields ---
    const availableFieldsWithVirtual = useMemo(() => {
        const virtualFields: Field[] = virtualColumns.map((vc, index) => {
            // Map output type to data type
            let dataType: DataType;
            if (vc.output_type === 'numeric') {
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
            
            if (preferences) {
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
        dispatch({ type: 'ADD_VIRTUAL_COLUMN', payload: column });
    }, [dispatch]);

    const handleUpdateVirtualColumn = useCallback((index: number, column: VirtualColumnDefinition) => {
        dispatch({ type: 'UPDATE_VIRTUAL_COLUMN', payload: { index, column } });
    }, [dispatch]);

    const handleRemoveVirtualColumn = useCallback((index: number) => {
        dispatch({ type: 'REMOVE_VIRTUAL_COLUMN', payload: index });
    }, [dispatch]);

    return {
        availableFieldsWithVirtual,
        handleAddVirtualColumn,
        handleUpdateVirtualColumn,
        handleRemoveVirtualColumn,
    };
}

