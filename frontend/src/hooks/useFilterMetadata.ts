// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useRef } from 'react';
import { Field, FilterMetadata, VirtualColumnDefinition, VirtualTableDefinition } from '../types';
import { getResultColumnName } from '../utils/fieldUtils';
import { apiService } from '../apiService';
import { isMeasureNamesField } from '../utils/syntheticFields';

interface ConnectionDetails {
    type: 'clickhouse' | 'csv' | 'kaggle' | 'hive_parquet';
}

interface UseFilterMetadataParams {
    filterFields: Field[];
    filterMetadata: Record<string, FilterMetadata>;
    filterConfigurations: Record<string, any>;
    virtualColumns: VirtualColumnDefinition[];
    virtualTable?: VirtualTableDefinition;
    selectedTable: string;
    selectedDatabase: string;
    unionTables: Array<{database: string, table_name: string}>;
    connectionDetails: ConnectionDetails | null;
    dispatch: React.Dispatch<any>;
}

export interface UseFilterMetadataReturn {
    fetchFilterMetadata: (field: Field) => Promise<void>;
    refetchFilterValues: (fieldId: string, regexPattern?: string) => Promise<void>;
}

const resolveFilterType = (field: Field): 'discrete' | 'continuous' | 'datetime' | 'measure' => {
    // Measure fields (aggregated) → HAVING filter, no API metadata needed
    if (field.type === 'measure' && field.aggregation) {
        return 'measure';
    }
    if (field.dataType === 'datetime') {
        // Datetime parts with discrete flavour or distinct mode -> discrete filter
        if (field.dateTimePart &&
            (field.dateTimeMode === 'distinct' || field.flavour === 'discrete')) {
            return 'discrete';
        }
        // Full datetime OR continuous timeline parts -> datetime range filter
        return 'datetime';
    }
    return field.flavour === 'discrete' ? 'discrete' : 'continuous';
};

const getFilterFieldSignature = (field: Field): string => {
    return [
        field.columnName,
        field.dataType,
        field.flavour,
        field.dateTimePart || '',
        field.dateTimeMode || '',
    ].join('|');
};

export function useFilterMetadata({
    filterFields,
    filterMetadata,
    filterConfigurations,
    virtualColumns,
    virtualTable,
    selectedTable,
    selectedDatabase,
    unionTables,
    connectionDetails,
    dispatch
}: UseFilterMetadataParams): UseFilterMetadataReturn {
    // Convert new union table format to legacy format for API calls
    // API expects string[] that will be joined with commas
    // Use '/' separator instead of '.' to avoid conflicts with column names that contain dots
    const unionTablesForApi = unionTables.map(ut => `${ut.database}/${ut.table_name}`);

    // Store abort controllers for filter metadata fetches, keyed by fieldId
    // This allows each field's metadata fetch to be independently cancellable
    const filterMetadataAbortControllers = useRef<Map<string, AbortController>>(new Map());
    
    // Track previous union tables to detect actual changes (not just reference changes)
    const prevUnionTablesRef = useRef<string>('');
    // Track field signatures to refetch metadata when field semantics change in-place.
    const filterFieldSignaturesRef = useRef<Map<string, string>>(new Map());

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
        
        // MeasureNames is no longer used as a filter selector.
        if (isMeasureNamesField(field)) {
            dispatch({
                type: 'SET_FILTER_FIELDS',
                payload: filterFields.filter(f => f.id !== field.id)
            });
            dispatch({ type: 'REMOVE_FILTER_CONFIGURATION', payload: field.id });
            return;
        }
        
        const dbParam = connectionDetails?.type === 'clickhouse' ? selectedDatabase : undefined;

        // Cancel any existing fetch for this field
        const existingController = filterMetadataAbortControllers.current.get(field.id);
        if (existingController) {
            existingController.abort();
        }

        // Create a new abort controller for this field's fetch
        const abortController = new AbortController();
        filterMetadataAbortControllers.current.set(field.id, abortController);

        const filterType = resolveFilterType(field);

        // Measure filters need no API metadata — initialize immediately with unbounded config
        if (filterType === 'measure') {
            const existing = filterConfigurations[field.id];
            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: {
                    fieldId: field.id,
                    metadata: {
                        fieldId: field.id,
                        columnName: getResultColumnName(field),
                        type: 'measure',
                        loading: false,
                        min: 0,
                        max: 0,
                    } as FilterMetadata,
                },
            });
            if (!existing || existing.type !== 'measure') {
                dispatch({
                    type: 'SET_FILTER_CONFIGURATION',
                    payload: {
                        fieldId: field.id,
                        config: {
                            fieldId: field.id,
                            columnName: getResultColumnName(field),
                            type: 'measure',
                            min: null,
                            max: null,
                        },
                    },
                });
            }
            return;
        }

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
                    unionTablesForApi,  // Pass union tables for _source_table handling
                    virtualColumns,  // Pass virtual columns for expression support
                    virtualTable,  // Pass virtual table for JOIN support
                    abortController.signal,  // Pass the abort signal
                    field.sourceTable  // Pass source table for multi-table support
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
                        unionTablesForApi,  // Pass union tables
                        virtualColumns,  // Pass virtual columns
                        virtualTable,  // Pass virtual table for JOIN support
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
                        unionTablesForApi,  // Pass union tables
                        virtualColumns,  // Pass virtual columns
                        virtualTable,  // Pass virtual table for JOIN support
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

                // Initialize/reset configuration when missing or no longer compatible
                const existing = filterConfigurations[field.id];
                if (
                    !existing ||
                    existing.type !== 'discrete' ||
                    existing.dateTimePart !== field.dateTimePart ||
                    existing.dateTimeMode !== field.dateTimeMode
                ) {
                    dispatch({
                        type: 'SET_FILTER_CONFIGURATION',
                        payload: {
                            fieldId: field.id,
                            config: {
                                fieldId: field.id,
                                columnName: field.columnName,
                                type: 'discrete',
                                selectedValues: values,
                                // When the distinct list is complete, tag cardinality so query
                                // building can omit IN (...) when all values remain selected.
                                totalAvailableCount: isPartial ? undefined : values.length,
                                dateTimePart: field.dateTimePart,
                                dateTimeMode: field.dateTimeMode,
                            }
                        }
                    });
                } else {
                    // Reconcile pure-exclusion configs: when selectedValues is empty
                    // but excludedValues is set (e.g. from table context menu "Exclude"),
                    // compute selectedValues = allAvailable - excluded now that metadata arrived.
                    if (
                        existing.type === 'discrete'
                        && existing.selectedValues.length === 0
                        && existing.excludedValues
                        && existing.excludedValues.length > 0
                    ) {
                        const excludeSet = new Set(existing.excludedValues.map((v: any) => v === null || v === undefined ? '__NULL__' : String(v)));
                        const reconciledSelected = values.filter(
                            (v: any) => !excludeSet.has(v === null || v === undefined ? '__NULL__' : String(v))
                        );
                        dispatch({
                            type: 'SET_FILTER_CONFIGURATION',
                            payload: {
                                fieldId: field.id,
                                config: {
                                    ...existing,
                                    selectedValues: reconciledSelected,
                                    totalAvailableCount: values.length,
                                },
                            },
                        });
                        dispatch({ type: 'APPLY_FILTERS' });
                    }
                }
            } else if (filterType === 'continuous') {
                const range = await apiService.getFieldRange(
                    field.columnName,
                    selectedTable,
                    dbParam,
                    virtualColumns,
                    unionTablesForApi,
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

                // Initialize/reset configuration when missing or no longer compatible
                const existing = filterConfigurations[field.id];
                if (!existing || existing.type !== 'continuous') {
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
                    unionTablesForApi,
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

                // Initialize/reset configuration when missing or no longer compatible
                const existing = filterConfigurations[field.id];
                if (
                    !existing ||
                    existing.type !== 'datetime' ||
                    existing.dateTimePart !== field.dateTimePart ||
                    existing.dateTimeMode !== field.dateTimeMode
                ) {
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
                                dateTimePart: field.dateTimePart,
                                dateTimeMode: field.dateTimeMode,
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
    }, [selectedTable, selectedDatabase, connectionDetails?.type, dispatch, virtualColumns, filterConfigurations, unionTablesForApi, filterFields, virtualTable]);

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
                unionTablesForApi,  // Pass union tables for _source_table handling
                virtualColumns,  // Pass virtual columns for expression support
                virtualTable,  // Pass virtual table for JOIN support
                abortController.signal,  // Pass the abort signal
                field.sourceTable  // Pass source table for multi-table support
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
                    unionTablesForApi,  // Pass union tables
                    virtualColumns,  // Pass virtual columns
                    virtualTable,  // Pass virtual table for JOIN support
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
                    unionTablesForApi,  // Pass union tables
                    virtualColumns,  // Pass virtual columns
                    virtualTable,  // Pass virtual table for JOIN support
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

            const currentConfig = filterConfigurations[fieldId];
            const preservePatternMode = currentConfig
                && currentConfig.type === 'discrete'
                && currentConfig.matchMode === 'pattern';
            
            // Update selected values:
            // - If count is 0: clear selections
            // - If count <=5000 (and >0): select all new values
            // - If count >5000: keep existing selections (partial results)
            if (preservePatternMode) {
                // Previewing sampled values for a pattern filter should not rewrite the
                // persisted filter config into a selection list.
            } else if (count === 0) {
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
                            matchMode: 'selection',
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
                            matchMode: 'selection',
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
    }, [filterFields, filterMetadata, filterConfigurations, selectedTable, selectedDatabase, connectionDetails?.type, dispatch, virtualColumns, unionTablesForApi, virtualTable]);

    // Fetch filter metadata when new filter fields are added
    // Also re-fetch when the selected table/database changes to handle config loading scenarios
    useEffect(() => {
        const activeFieldIds = new Set(filterFields.map((f) => f.id));
        filterFieldSignaturesRef.current.forEach((_sig, fieldId) => {
            if (!activeFieldIds.has(fieldId)) {
                filterFieldSignaturesRef.current.delete(fieldId);
            }
        });

        filterFields.forEach(field => {
            const metadata = filterMetadata[field.id];
            const expectedType = resolveFilterType(field);
            const currentSignature = getFilterFieldSignature(field);
            const previousSignature = filterFieldSignaturesRef.current.get(field.id);

            const needsRefetch = (
                !metadata ||
                metadata.type !== expectedType ||
                // Measure filters use the aggregation alias (e.g. "AVG(col)") as their metadata
                // columnName, not the raw field.columnName. Skip this check for measures to avoid
                // a continuous dispatch loop.
                (expectedType !== 'measure' && metadata.columnName !== field.columnName) ||
                previousSignature !== currentSignature
            );

            if (needsRefetch) {
                filterFieldSignaturesRef.current.set(field.id, currentSignature);
                fetchFilterMetadata(field);
            }
        });
    }, [
        filterFields, 
        filterMetadata, 
        fetchFilterMetadata,
        selectedTable,      // Re-run when table changes (e.g., after config load)
        selectedDatabase,   // Re-run when database changes (ClickHouse)
        unionTablesForApi   // Re-run when union tables change (ensures new fields get correct range)
    ]);

    // Re-fetch filter metadata when union tables change
    // This ensures continuous field ranges and discrete value lists are updated to include all union tables
    useEffect(() => {
        // Serialize union tables to detect actual changes
        const currentUnionTablesStr = JSON.stringify(unionTables);
        
        // Only refetch if union tables actually changed (not just reference change)
        // AND it's not the initial mount (empty string check)
        if (prevUnionTablesRef.current !== currentUnionTablesStr && prevUnionTablesRef.current !== '') {
            // Re-fetch metadata for ALL filter fields (not just ones with existing metadata)
            // This ensures ranges are updated when union tables change, even if field was just added
            filterFields.forEach(field => {
                fetchFilterMetadata(field);
            });
        }
        prevUnionTablesRef.current = currentUnionTablesStr;
        // Include fetchFilterMetadata so it uses the latest closure with updated unionTablesForApi
        // filterFields and filterMetadata are intentionally excluded to prevent loops
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unionTables, fetchFilterMetadata]);

    return {
        fetchFilterMetadata,
        refetchFilterValues,
    };
}

