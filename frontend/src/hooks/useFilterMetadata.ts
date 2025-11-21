import { useCallback, useEffect, useRef } from 'react';
import { Field, FilterMetadata, VirtualColumnDefinition } from '../types';
import { apiService } from '../apiService';

interface ConnectionDetails {
    type: 'clickhouse' | 'csv';
}

interface UseFilterMetadataParams {
    filterFields: Field[];
    filterMetadata: Record<string, FilterMetadata>;
    filterConfigurations: Record<string, any>;
    virtualColumns: VirtualColumnDefinition[];
    selectedTable: string;
    selectedDatabase: string;
    unionTables: string[];
    connectionDetails: ConnectionDetails | null;
    dispatch: React.Dispatch<any>;
}

export interface UseFilterMetadataReturn {
    fetchFilterMetadata: (field: Field) => Promise<void>;
    refetchFilterValues: (fieldId: string, regexPattern?: string) => Promise<void>;
}

export function useFilterMetadata({
    filterFields,
    filterMetadata,
    filterConfigurations,
    virtualColumns,
    selectedTable,
    selectedDatabase,
    unionTables,
    connectionDetails,
    dispatch
}: UseFilterMetadataParams): UseFilterMetadataReturn {

    // Store abort controllers for filter metadata fetches, keyed by fieldId
    // This allows each field's metadata fetch to be independently cancellable
    const filterMetadataAbortControllers = useRef<Map<string, AbortController>>(new Map());

    // Cleanup: abort all pending filter metadata fetches on unmount
    useEffect(() => {
        // Capture current controllers map reference to avoid eslint warning about ref changing
        const controllers = filterMetadataAbortControllers.current;
        return () => {
            controllers.forEach(controller => {
                controller.abort();
            });
            controllers.clear();
        };
    }, []);

    // Fetch filter metadata for a field
    const fetchFilterMetadata = useCallback(async (field: Field) => {
        if (!selectedTable) return;
        const dbParam = connectionDetails?.type === 'clickhouse' ? selectedDatabase : undefined;

        // Cancel any existing fetch for this field
        const existingController = filterMetadataAbortControllers.current.get(field.id);
        if (existingController) {
            existingController.abort();
        }

        // Create a new abort controller for this field's fetch
        const abortController = new AbortController();
        filterMetadataAbortControllers.current.set(field.id, abortController);

        // Determine filter type based on field characteristics
        const getFilterType = (): 'discrete' | 'continuous' | 'datetime' => {
            if (field.dataType === 'datetime') {
                // Distinct datetime parts → discrete filter (e.g., select hours 8, 9, 14, 15)
                if (field.dateTimePart && field.dateTimeMode === 'distinct') {
                    return 'discrete';
                }
                // Full datetime OR timeline parts → datetime range filter
                // Timeline parts use range filtering because they can have thousands of values
                return 'datetime';
            }
            return field.flavour === 'discrete' ? 'discrete' : 'continuous';
        };

        const filterType = getFilterType();

        // Set loading state
        const loadingMetadata: FilterMetadata = {
            fieldId: field.id,
            columnName: field.columnName,
            type: filterType,
            loading: true,
            ...(filterType === 'discrete' ? { availableValues: [] } :
                filterType === 'continuous' ? { min: 0, max: 0 } :
                { min: '', max: '' })
        } as FilterMetadata;

        dispatch({
            type: 'SET_FILTER_METADATA',
            payload: { fieldId: field.id, metadata: loadingMetadata }
        });

        try {
            if (filterType === 'discrete') {
                // First, get the count of distinct values
                const count = await apiService.getDistinctValuesCount(
                    field.columnName,
                    selectedTable,
                    dbParam,
                    undefined, // no regex filter initially
                    field.dateTimePart,
                    field.dateTimeMode,
                    unionTables,  // Pass union tables for _source_table handling
                    virtualColumns,  // Pass virtual columns for expression support
                    abortController.signal  // Pass the abort signal
                );
                
                let values: any[];
                let isPartial = false;
                let warningMessage: string | undefined;
                
                if (count <= 5000) {
                    // Fetch all values
                    values = await apiService.getDistinctValues(
                        field.columnName,
                        selectedTable,
                        dbParam,
                        field.dateTimePart,
                        field.dateTimeMode,
                        undefined, // no regex filter
                        undefined, // no limit
                        undefined, // no random sampling
                        unionTables,  // Pass union tables
                        virtualColumns,  // Pass virtual columns
                        abortController.signal  // Pass the abort signal
                    );
                } else {
                    // Too many values - fetch only 100 random samples
                    values = await apiService.getDistinctValues(
                        field.columnName,
                        selectedTable,
                        dbParam,
                        field.dateTimePart,
                        field.dateTimeMode,
                        undefined, // no regex filter
                        100, // limit to 100
                        true, // use random sampling
                        unionTables,  // Pass union tables
                        virtualColumns,  // Pass virtual columns
                        abortController.signal  // Pass the abort signal
                    );
                    isPartial = true;
                    warningMessage = `This field has ${count.toLocaleString()} unique values. Showing 100 random samples. Use Query Regex to filter.`;
                }
                
                const metadata: FilterMetadata = {
                    fieldId: field.id,
                    columnName: field.columnName,
                    type: 'discrete',
                    loading: false,
                    availableValues: values,
                    totalCount: count,
                    originalTotalCount: count, // Store the original count for later reference
                    isPartial,
                    warningMessage,
                };

                dispatch({
                    type: 'SET_FILTER_METADATA',
                    payload: { fieldId: field.id, metadata }
                });

                // Initialize filter configuration with all fetched values selected
                // BUT only if a configuration doesn't already exist (e.g., from loaded JSON)
                if (!filterConfigurations[field.id]) {
                    dispatch({
                        type: 'SET_FILTER_CONFIGURATION',
                        payload: {
                            fieldId: field.id,
                            config: {
                                fieldId: field.id,
                                columnName: field.columnName,
                                type: 'discrete',
                                selectedValues: values,
                                dateTimePart: field.dateTimePart,
                                dateTimeMode: field.dateTimeMode,
                            }
                        }
                    });
                }
            } else if (filterType === 'continuous') {
                const range = await apiService.getFieldRange(
                    field.columnName,
                    selectedTable,
                    dbParam,
                    virtualColumns,
                    abortController.signal
                );
                
                const metadata: FilterMetadata = {
                    fieldId: field.id,
                    columnName: field.columnName,
                    type: 'continuous',
                    loading: false,
                    min: range.min,
                    max: range.max,
                };

                dispatch({
                    type: 'SET_FILTER_METADATA',
                    payload: { fieldId: field.id, metadata }
                });

                // Initialize filter configuration with full range
                // BUT only if a configuration doesn't already exist (e.g., from loaded JSON)
                if (!filterConfigurations[field.id]) {
                    dispatch({
                        type: 'SET_FILTER_CONFIGURATION',
                        payload: {
                            fieldId: field.id,
                            config: {
                                fieldId: field.id,
                                columnName: field.columnName,
                                type: 'continuous',
                                min: range.min,
                                max: range.max,
                            }
                        }
                    });
                }
            } else if (filterType === 'datetime') {
                const range = await apiService.getDateTimeRange(
                    field.columnName,
                    selectedTable,
                    dbParam,
                    virtualColumns,
                    abortController.signal
                );
                
                const metadata: FilterMetadata = {
                    fieldId: field.id,
                    columnName: field.columnName,
                    type: 'datetime',
                    loading: false,
                    min: range.min,
                    max: range.max,
                };

                dispatch({
                    type: 'SET_FILTER_METADATA',
                    payload: { fieldId: field.id, metadata }
                });

                // Initialize filter configuration with full range
                // BUT only if a configuration doesn't already exist (e.g., from loaded JSON)
                if (!filterConfigurations[field.id]) {
                    dispatch({
                        type: 'SET_FILTER_CONFIGURATION',
                        payload: {
                            fieldId: field.id,
                            config: {
                                fieldId: field.id,
                                columnName: field.columnName,
                                type: 'datetime',
                                startDate: range.min,
                                endDate: range.max,
                            }
                        }
                    });
                }
            }
            
            // Clean up the abort controller after successful fetch
            filterMetadataAbortControllers.current.delete(field.id);
        } catch (err: any) {
            // Clean up the abort controller
            filterMetadataAbortControllers.current.delete(field.id);
            
            // Don't set error state if the request was aborted (this is intentional cancellation)
            if (err.message === 'Request was cancelled') {
                return;
            }
            
            // Set error state for actual errors
            const errorMetadata: FilterMetadata = {
                fieldId: field.id,
                columnName: field.columnName,
                type: filterType,
                loading: false,
                error: err.message,
                ...(filterType === 'discrete' ? { availableValues: [] } :
                    filterType === 'continuous' ? { min: 0, max: 0 } :
                    { min: '', max: '' })
            } as FilterMetadata;

            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: { fieldId: field.id, metadata: errorMetadata }
            });
        }
    }, [selectedTable, selectedDatabase, unionTables, connectionDetails?.type, dispatch, virtualColumns, filterConfigurations]);

    // Refetch filter values with a regex pattern (for large discrete filters)
    const refetchFilterValues = useCallback(async (fieldId: string, regexPattern?: string) => {
        const field = filterFields.find(f => f.id === fieldId);
        if (!field || !selectedTable) return;
        
        const dbParam = connectionDetails?.type === 'clickhouse' ? selectedDatabase : undefined;
        
        // Cancel any existing fetch for this field
        const existingController = filterMetadataAbortControllers.current.get(fieldId);
        if (existingController) {
            existingController.abort();
        }

        // Create a new abort controller for this field's refetch
        const abortController = new AbortController();
        filterMetadataAbortControllers.current.set(fieldId, abortController);
        
        // Set loading state
        const currentMetadata = filterMetadata[fieldId];
        if (currentMetadata && currentMetadata.type === 'discrete') {
            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: {
                    fieldId,
                    metadata: { ...currentMetadata, loading: true }
                }
            });
        }
        
        try {
            // Get count with regex filter
            const count = await apiService.getDistinctValuesCount(
                field.columnName,
                selectedTable,
                dbParam,
                regexPattern,
                field.dateTimePart,
                field.dateTimeMode,
                unionTables,  // Pass union tables for _source_table handling
                virtualColumns,  // Pass virtual columns for expression support
                abortController.signal  // Pass the abort signal
            );
            
            let values: any[];
            let isPartial = false;
            let warningMessage: string | undefined;
            let appliedRegexQuery: string | undefined = regexPattern;
            
            // Preserve the original total count (without regex filter) to determine if field is inherently large
            const originalTotalCount = currentMetadata && currentMetadata.type === 'discrete' 
                ? (currentMetadata.originalTotalCount || currentMetadata.totalCount)
                : count;
            
            if (count <= 5000) {
                // Fetch all values with the regex filter
                values = await apiService.getDistinctValues(
                    field.columnName,
                    selectedTable,
                    dbParam,
                    field.dateTimePart,
                    field.dateTimeMode,
                    regexPattern,
                    undefined, // no limit
                    undefined, // no random sampling
                    unionTables,  // Pass union tables
                    virtualColumns,  // Pass virtual columns
                    abortController.signal  // Pass the abort signal
                );
                
                // Keep isPartial=true if this field originally had >5000 values
                // This ensures the Query Regex field stays visible even if filter returns 0-5000 results
                isPartial = (originalTotalCount || 0) > 5000;
                
                if (regexPattern) {
                    if (count === 0) {
                        warningMessage = `No values match your query pattern. Try a different pattern.`;
                    } else {
                        warningMessage = `Filtered to ${count.toLocaleString()} values matching your query.`;
                    }
                }
            } else {
                // Still too many - fetch 100 random values matching the regex query
                values = await apiService.getDistinctValues(
                    field.columnName,
                    selectedTable,
                    dbParam,
                    field.dateTimePart,
                    field.dateTimeMode,
                    regexPattern,
                    100, // Limit to 100 random samples
                    true, // use random sampling
                    unionTables,  // Pass union tables
                    virtualColumns,  // Pass virtual columns
                    abortController.signal  // Pass the abort signal
                );
                isPartial = true;
                warningMessage = `Query matches ${count.toLocaleString()} values (still too many). Showing 100 random samples matching your pattern. Refine further to see all values.`;
            }
            
            const metadata: FilterMetadata = {
                fieldId: field.id,
                columnName: field.columnName,
                type: 'discrete',
                loading: false,
                availableValues: values,
                totalCount: count,
                originalTotalCount, // Preserve the original total
                isPartial,
                warningMessage,
                appliedRegexQuery,
            };
            
            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: { fieldId, metadata }
            });
            
            // Update selected values:
            // - If count is 0: clear selections
            // - If count <=5000 (and >0): select all new values
            // - If count >5000: keep existing selections (partial results)
            if (count === 0) {
                // Clear selections when no results
                dispatch({
                    type: 'SET_FILTER_CONFIGURATION',
                    payload: {
                        fieldId,
                        config: {
                            fieldId: field.id,
                            columnName: field.columnName,
                            type: 'discrete',
                            selectedValues: [],
                            dateTimePart: field.dateTimePart,
                            dateTimeMode: field.dateTimeMode,
                        }
                    }
                });
            } else if (count <= 5000) {
                // Select all matching values when we have a manageable number
                dispatch({
                    type: 'SET_FILTER_CONFIGURATION',
                    payload: {
                        fieldId,
                        config: {
                            fieldId: field.id,
                            columnName: field.columnName,
                            type: 'discrete',
                            selectedValues: values,
                            dateTimePart: field.dateTimePart,
                            dateTimeMode: field.dateTimeMode,
                        }
                    }
                });
            }
            // If count > 5000, don't update selectedValues (keep existing 100 selected)
            
            // Clean up the abort controller after successful refetch
            filterMetadataAbortControllers.current.delete(fieldId);
        } catch (err: any) {
            // Clean up the abort controller
            filterMetadataAbortControllers.current.delete(fieldId);
            
            // Don't set error state if the request was aborted (this is intentional cancellation)
            if (err.message === 'Request was cancelled') {
                return;
            }
            
            // Set error state for actual errors
            const errorMetadata: FilterMetadata = {
                fieldId: field.id,
                columnName: field.columnName,
                type: 'discrete',
                loading: false,
                error: err.message,
                availableValues: [],
            };
            
            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: { fieldId, metadata: errorMetadata }
            });
        }
    }, [filterFields, filterMetadata, selectedTable, selectedDatabase, unionTables, connectionDetails?.type, dispatch, virtualColumns]);

    // Fetch filter metadata when new filter fields are added
    // Also re-fetch when the selected table/database changes to handle config loading scenarios
    useEffect(() => {
        filterFields.forEach(field => {
            // Only fetch if metadata doesn't exist for this field
            if (!filterMetadata[field.id]) {
                fetchFilterMetadata(field);
            }
        });
    }, [
        filterFields, 
        filterMetadata, 
        fetchFilterMetadata,
        selectedTable,      // Re-run when table changes (e.g., after config load)
        selectedDatabase    // Re-run when database changes (ClickHouse)
    ]);

    return {
        fetchFilterMetadata,
        refetchFilterValues,
    };
}

