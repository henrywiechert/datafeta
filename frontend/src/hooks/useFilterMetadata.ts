// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
import { useCallback, useEffect, useRef } from 'react';
import { Field, FilterConfig, FilterMetadata, VirtualColumnDefinition, VirtualTableDefinition } from '../types';
import { getResultColumnName } from '../utils/fieldUtils';
import { apiService } from '../apiService';
import { isMeasureNamesField } from '../utils/syntheticFields';
import { buildCascadingFiltersForField } from '../utils/cascadingFilters';
import { convertFilterConfigsToFilters } from '../queryBuilder/queryBuilder';

interface ConnectionDetails {
    type: 'clickhouse' | 'csv' | 'kaggle' | 'huggingface' | 'hive_parquet';
}

/** Above this many distinct values the picker samples instead of listing them all. */
const MAX_LISTABLE_DISTINCT_VALUES = 5000;
const SAMPLE_SIZE = 100;

interface DiscreteValueListResult {
    /** Distinct count under the same regex and sibling constraints as `values`. */
    count: number;
    values: any[];
    /** True when `values` is a random sample rather than the complete list. */
    sampled: boolean;
    /** True when sibling filters narrowed the list (Relevant mode). */
    constrained: boolean;
}

export interface FilterValueListFetchOptions {
    /**
     * Sibling configs constraining the distinct list (Relevant mode), supplied by
     * `useRelevantValueLists`. Omitted or empty means the full, unconstrained list —
     * which is also what a cold start fetches, so `totalAvailableCount` is always
     * derived from the true column cardinality.
     */
    siblingConfigurations?: Record<string, FilterConfig>;
    /**
     * When true, rewrite the draft discrete selection from the fetch result
     * (select-all matching / clear). Used by Query Regex; default false so
     * All/Relevant list refreshes never mutate selections.
     */
    applySelectionFromResult?: boolean;
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
    fetchFilterMetadata: (field: Field, options?: FilterValueListFetchOptions) => Promise<void>;
    refetchFilterValues: (
        fieldId: string,
        regexPattern?: string,
        options?: FilterValueListFetchOptions,
    ) => Promise<void>;
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

    // Relevant-mode refetches run in the background (debounced on sibling edits), so a
    // field can be removed while its request is in flight. Guard dispatches against that.
    const liveFieldIdsRef = useRef<Set<string>>(new Set());
    liveFieldIdsRef.current = new Set(filterFields.map(f => f.id));
    const isFieldLive = useCallback((fieldId: string) => liveFieldIdsRef.current.has(fieldId), []);

    // Single conversion site: both /distinct-count and /query receive the same Filter[],
    // so the sampling decision and the value list are always constrained identically.
    const resolveSiblingApiFilters = useCallback((
        fieldId: string,
        options?: FilterValueListFetchOptions,
    ) => {
        const cascadingConfigs = buildCascadingFiltersForField(
            fieldId,
            options?.siblingConfigurations ?? {},
        );
        return convertFilterConfigsToFilters(cascadingConfigs);
    }, []);

    /**
     * Count the distinct values of a discrete field and load them, sampling instead of
     * listing when the column is too large. Shared by the cold-start fetch and every
     * refetch (Query Regex, All/Relevant) so both apply the same threshold, the same
     * sibling constraints, and the same in-flight liveness checks.
     *
     * Returns null when the field was removed while the requests were in flight; the
     * caller should then drop its abort controller and dispatch nothing.
     */
    const fetchDiscreteValueList = useCallback(async (
        field: Field,
        regexPattern: string | undefined,
        options: FilterValueListFetchOptions | undefined,
        signal: AbortSignal,
    ): Promise<DiscreteValueListResult | null> => {
        const dbParam = connectionDetails?.type === 'clickhouse' ? selectedDatabase : undefined;
        const siblingFilters = resolveSiblingApiFilters(field.id, options);

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
            signal,
            field.sourceTable,  // Pass source table for multi-table support
            siblingFilters,  // Constrain the count the same way as the value list
        );

        if (!isFieldLive(field.id)) return null;

        // Too many values to enumerate — show a random sample and let the user narrow
        // the list with a pattern instead.
        const sampled = count > MAX_LISTABLE_DISTINCT_VALUES;
        const values = await apiService.getDistinctValues(
            field.columnName,
            selectedTable,
            dbParam,
            field.dateTimePart,
            field.dateTimeMode,
            regexPattern,
            sampled ? SAMPLE_SIZE : undefined,
            sampled ? true : undefined,  // use random sampling
            unionTablesForApi,  // Pass union tables
            virtualColumns,  // Pass virtual columns
            virtualTable,  // Pass virtual table for JOIN support
            signal,
            siblingFilters,  // Constrain to values relevant under other filters
        );

        if (!isFieldLive(field.id)) return null;

        return { count, values, sampled, constrained: siblingFilters.length > 0 };
    }, [
        selectedTable,
        selectedDatabase,
        connectionDetails?.type,
        unionTablesForApi,
        virtualColumns,
        virtualTable,
        resolveSiblingApiFilters,
        isFieldLive,
    ]);

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
    const fetchFilterMetadata = useCallback(async (
        field: Field,
        options?: FilterValueListFetchOptions,
    ) => {
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
                const result = await fetchDiscreteValueList(
                    field,
                    undefined, // no regex filter initially
                    options,
                    abortController.signal,
                );
                if (!result) {
                    filterMetadataAbortControllers.current.delete(field.id);
                    return;
                }
                const { count, values, sampled, constrained } = result;

                const metadata: FilterMetadata = {
                    fieldId: field.id,
                    columnName: field.columnName,
                    type: 'discrete',
                    loading: false,
                    availableValues: values,
                    totalCount: count,
                    originalTotalCount: count, // Store the original count for later reference
                    isPartial: sampled,
                    warningMessage: sampled
                        ? `This field has ${count.toLocaleString()} unique values. Showing ${SAMPLE_SIZE} random samples. Use Query Regex to filter.`
                        : undefined,
                    constrainedByOtherFilters: constrained,
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
                                // A sibling-constrained list is not the full cardinality.
                                totalAvailableCount: sampled || constrained
                                    ? undefined
                                    : values.length,
                                dateTimePart: field.dateTimePart,
                                dateTimeMode: field.dateTimeMode,
                                valueListMode: existing?.type === 'discrete'
                                    ? existing.valueListMode
                                    : undefined,
                            }
                        }
                    });
                } else {
                    // Reconcile pure-exclusion configs: when selectedValues is empty
                    // but excludedValues is set (e.g. from table context menu "Exclude"),
                    // compute selectedValues = allAvailable - excluded now that metadata arrived.
                    // Only valid against the full value list, never a Relevant-constrained one.
                    if (
                        existing.type === 'discrete'
                        && !constrained
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

            if (!isFieldLive(field.id)) return;

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
    }, [selectedTable, selectedDatabase, connectionDetails?.type, dispatch, virtualColumns, filterConfigurations, unionTablesForApi, filterFields, fetchDiscreteValueList, isFieldLive]);

    // Refetch filter values with a regex pattern (for large discrete filters)
    // or with changed sibling constraints (Relevant mode).
    const refetchFilterValues = useCallback(async (
        fieldId: string,
        regexPattern?: string,
        options?: FilterValueListFetchOptions,
    ) => {
        const field = filterFields.find(f => f.id === fieldId);
        if (!field || !selectedTable) return;
        
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
        if (currentMetadata && currentMetadata.type === 'discrete' && isFieldLive(fieldId)) {
            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: {
                    fieldId,
                    metadata: { ...currentMetadata, loading: true }
                }
            });
        }
        
        try {
            const result = await fetchDiscreteValueList(
                field,
                regexPattern,
                options,
                abortController.signal,
            );
            if (!result) {
                filterMetadataAbortControllers.current.delete(fieldId);
                return;
            }
            const { count, values, sampled, constrained } = result;

            // Preserve the original total count (without regex filter) to determine if field is inherently large
            const originalTotalCount = currentMetadata && currentMetadata.type === 'discrete' 
                ? (currentMetadata.originalTotalCount || currentMetadata.totalCount)
                : count;

            let warningMessage: string | undefined;
            if (sampled) {
                warningMessage = `Query matches ${count.toLocaleString()} values (still too many). Showing ${SAMPLE_SIZE} random samples matching your pattern. Refine further to see all values.`;
            } else if (regexPattern) {
                warningMessage = count === 0
                    ? `No values match your query pattern. Try a different pattern.`
                    : `Filtered to ${count.toLocaleString()} values matching your query.`;
            }

            const metadata: FilterMetadata = {
                fieldId: field.id,
                columnName: field.columnName,
                type: 'discrete',
                loading: false,
                availableValues: values,
                totalCount: count,
                originalTotalCount, // Preserve the original total
                // Keep isPartial=true if this field originally had more values than we can
                // list, so the Query Regex field stays visible even when the pattern
                // narrows the result to a listable size.
                isPartial: sampled || (originalTotalCount || 0) > MAX_LISTABLE_DISTINCT_VALUES,
                warningMessage,
                appliedRegexQuery: regexPattern,
                constrainedByOtherFilters: constrained,
            };
            
            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: { fieldId, metadata }
            });

            // Update selected values: select everything the pattern matched, or clear the
            // selection when nothing matched. A sampled result leaves the existing
            // selection alone, since the values shown are only a sample of the matches.
            // Only Query Regex asks for this. An All/Relevant list refresh must leave
            // the selection untouched — it changes which values are visible, not which
            // ones are picked.
            if (options?.applySelectionFromResult === true) {
                const currentConfig = filterConfigurations[fieldId];
                const preservePatternMode = currentConfig
                    && currentConfig.type === 'discrete'
                    && currentConfig.matchMode === 'pattern';

                if (preservePatternMode) {
                    // Previewing sampled values for a pattern filter should not rewrite the
                    // persisted filter config into a selection list.
                } else if (!sampled) {
                    // Select all matching values (an empty result clears the selection).
                    // valueListMode is the picker's view state and survives the rewrite.
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
                                valueListMode: currentConfig?.type === 'discrete'
                                    ? currentConfig.valueListMode
                                    : undefined,
                            }
                        }
                    });
                }
            }
            
            // Clean up the abort controller after successful refetch
            filterMetadataAbortControllers.current.delete(fieldId);
        } catch (err: any) {
            // Clean up the abort controller
            filterMetadataAbortControllers.current.delete(fieldId);
            
            // Don't set error state if the request was aborted (this is intentional cancellation)
            if (err.message === 'Request was cancelled') {
                return;
            }

            if (!isFieldLive(fieldId)) return;

            // Set error state for actual errors. Keep the values we already have so a
            // failed background refresh does not blank out a usable picker list.
            const errorMetadata: FilterMetadata = {
                fieldId: field.id,
                columnName: field.columnName,
                type: 'discrete',
                loading: false,
                error: err.message,
                availableValues: currentMetadata?.type === 'discrete'
                    ? currentMetadata.availableValues
                    : [],
                // Keep the flag describing the values we are still showing, not the
                // constraints of the fetch that just failed.
                constrainedByOtherFilters: currentMetadata?.type === 'discrete'
                    ? currentMetadata.constrainedByOtherFilters
                    : undefined,
            };
            
            dispatch({
                type: 'SET_FILTER_METADATA',
                payload: { fieldId, metadata: errorMetadata }
            });
        }
    }, [filterFields, filterMetadata, filterConfigurations, selectedTable, dispatch, fetchDiscreteValueList, isFieldLive]);

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
        // REASON: filterFields / filterMetadata identities change as soon as we dispatch into them — including them would cause an infinite refetch.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [unionTables, fetchFilterMetadata]);

    return {
        fetchFilterMetadata,
        refetchFilterValues,
    };
}

