// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Unit tests for Optimization Hint Generator (Field-Level)
 */

import {
    generateOptimizationHints,
    generateOptimizationHintsFromFields,
    describeOptimizationHints
} from './optimizationHintGenerator';
import { Dimension, Measure, Field, OptimizationHints } from '../types';

describe('optimizationHintGenerator - Field-Level Hints', () => {
    describe('generateOptimizationHints', () => {
        test('should generate field hints for continuous dimensions (raw data)', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous' },
                { field: 'quantity', flavour: 'continuous' }
            ];
            const measures: Measure[] = [];
            
            const hints = generateOptimizationHints({ dimensions, measures });
            
            expect(hints.field_hints).toBeDefined();
            expect(hints.field_hints?.length).toBe(2);
            expect(hints.field_hints?.[0].field).toBe('price');
            expect(hints.field_hints?.[0].enable_rounding).toBe(true);
            expect(hints.field_hints?.[1].field).toBe('quantity');
            expect(hints.field_hints?.[1].enable_rounding).toBe(true);
            expect(hints.enable_global_distinct).toBe(true); // Raw data
            expect(hints.optimization_level).toBe('balanced');
        });
        
        test('should not generate field hints for discrete dimensions', () => {
            const dimensions: Dimension[] = [
                { field: 'category', flavour: 'discrete' },
                { field: 'region', flavour: 'discrete' }
            ];
            const measures: Measure[] = [];
            
            const hints = generateOptimizationHints({ dimensions, measures });
            
            expect(hints.field_hints).toBeDefined();
            expect(hints.field_hints?.length).toBe(0); // No continuous dimensions
            expect(hints.enable_global_distinct).toBe(true); // Raw data
        });
        
        test('should disable global distinct for aggregated queries', () => {
            const dimensions: Dimension[] = [
                { field: 'category', flavour: 'discrete' }
            ];
            const measures: Measure[] = [
                { field: 'sales', aggregation: 'sum', alias: 'total_sales' }
            ];
            
            const hints = generateOptimizationHints({ dimensions, measures });
            
            expect(hints.enable_global_distinct).toBe(false); // Aggregated query
            expect(hints.optimization_level).toBe('light');
        });
        
        test('should generate hints for timeline dimensions', () => {
            const dimensions: Dimension[] = [
                { field: 'timestamp', flavour: 'continuous', date_mode: 'timeline' }
            ];
            const measures: Measure[] = [];
            
            const hints = generateOptimizationHints({ dimensions, measures });
            
            expect(hints.field_hints).toBeDefined();
            expect(hints.field_hints?.length).toBe(1);
            expect(hints.field_hints?.[0].field).toBe('timestamp');
            expect(hints.field_hints?.[0].enable_rounding).toBe(true);
            expect(hints.field_hints?.[0].reason).toBe('datetime_timeline');
        });
        
        test('should recommend aggressive level for 4+ fields with continuous dims', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous' },
                { field: 'quantity', flavour: 'continuous' },
                { field: 'discount', flavour: 'continuous' },
                { field: 'weight', flavour: 'continuous' }
            ];
            const measures: Measure[] = [];
            
            const hints = generateOptimizationHints({ dimensions, measures });
            
            expect(hints.optimization_level).toBe('aggressive');
            expect(hints.field_hints?.length).toBe(4);
        });
        
        test('should respect user preference "none"', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous' },
                { field: 'quantity', flavour: 'continuous' }
            ];
            const measures: Measure[] = [];
            
            const hints = generateOptimizationHints({
                dimensions,
                measures,
                userPreference: 'none'
            });
            
            expect(hints.field_hints?.length).toBe(0);
            expect(hints.enable_global_distinct).toBe(false);
            expect(hints.optimization_level).toBe('none');
            expect(hints.purpose).toBe('user_disabled');
        });
        
        test('should respect user preference "aggressive"', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous' }
            ];
            const measures: Measure[] = [];
            
            const hints = generateOptimizationHints({
                dimensions,
                measures,
                userPreference: 'aggressive'
            });
            
            expect(hints.optimization_level).toBe('aggressive');
            expect(hints.field_hints?.[0].rounding_threshold).toBe(200); // aggressive threshold
        });
        
        test('should use different thresholds based on optimization level', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous' }
            ];
            const measures: Measure[] = [];
            
            const lightHints = generateOptimizationHints({
                dimensions,
                measures,
                userPreference: 'light'
            });
            
            const balancedHints = generateOptimizationHints({
                dimensions,
                measures,
                userPreference: 'balanced'
            });
            
            const aggressiveHints = generateOptimizationHints({
                dimensions,
                measures,
                userPreference: 'aggressive'
            });
            
            expect(lightHints.field_hints?.[0].rounding_threshold).toBe(1000);
            expect(balancedHints.field_hints?.[0].rounding_threshold).toBe(500);
            expect(aggressiveHints.field_hints?.[0].rounding_threshold).toBe(200);
        });
        
        test('should handle empty dimensions and measures', () => {
            const hints = generateOptimizationHints({
                dimensions: [],
                measures: []
            });
            
            expect(hints.field_hints?.length).toBe(0);
            expect(hints.enable_global_distinct).toBe(true); // No measures = raw data
            expect(hints.optimization_level).not.toBe('none');
            expect(hints.purpose).toBe('field_based_optimization');
        });
    });
    
    describe('generateOptimizationHintsFromFields', () => {
        test('should generate field hints from Field objects (continuous dims)', () => {
            const xAxisFields: Field[] = [
                {
                    id: '1',
                    columnName: 'price',
                    type: 'dimension',
                    flavour: 'continuous',
                    dataType: 'float',
                    axis: 'x'
                }
            ];
            
            const yAxisFields: Field[] = [
                {
                    id: '2',
                    columnName: 'quantity',
                    type: 'dimension',
                    flavour: 'continuous',
                    dataType: 'integer',
                    axis: 'y'
                }
            ];
            
            const hints = generateOptimizationHintsFromFields({
                xAxisFields,
                yAxisFields
            });
            
            expect(hints.field_hints).toBeDefined();
            expect(hints.field_hints?.length).toBe(2);
            expect(hints.enable_global_distinct).toBe(true); // Raw data
            expect(hints.purpose).toBe('field_based_optimization');
        });
        
        test('should handle measure fields and disable global distinct', () => {
            const xAxisFields: Field[] = [
                {
                    id: '1',
                    columnName: 'category',
                    type: 'dimension',
                    flavour: 'discrete',
                    dataType: 'string',
                    axis: 'x'
                }
            ];
            
            const yAxisFields: Field[] = [
                {
                    id: '2',
                    columnName: 'sales',
                    type: 'measure',
                    aggregation: 'sum',
                    flavour: 'continuous',
                    dataType: 'float',
                    axis: 'y'
                }
            ];
            
            const hints = generateOptimizationHintsFromFields({
                xAxisFields,
                yAxisFields
            });
            
            expect(hints.enable_global_distinct).toBe(false); // Aggregated query
            expect(hints.purpose).toBe('field_based_optimization');
        });
        
        test('should include color field in analysis', () => {
            const xAxisFields: Field[] = [
                {
                    id: '1',
                    columnName: 'price',
                    type: 'dimension',
                    flavour: 'continuous',
                    dataType: 'float',
                    axis: 'x'
                }
            ];
            
            const yAxisFields: Field[] = [
                {
                    id: '2',
                    columnName: 'quantity',
                    type: 'dimension',
                    flavour: 'continuous',
                    dataType: 'integer',
                    axis: 'y'
                }
            ];
            
            const colorField: Field = {
                id: '3',
                columnName: 'category',
                type: 'dimension',
                flavour: 'discrete',
                dataType: 'string'
            };
            
            const hints = generateOptimizationHintsFromFields({
                xAxisFields,
                yAxisFields,
                colorField
            });
            
            // Color field is discrete, so doesn't generate field hint
            expect(hints.field_hints?.length).toBe(2); // Only continuous dims
            expect(hints.optimization_level).toBe('balanced');
        });
        
        test('should deduplicate fields across axes', () => {
            const xAxisFields: Field[] = [
                {
                    id: '1',
                    columnName: 'price',
                    type: 'dimension',
                    flavour: 'continuous',
                    dataType: 'float',
                    axis: 'x'
                }
            ];
            
            const yAxisFields: Field[] = [
                {
                    id: '2',
                    columnName: 'price', // Same field as X
                    type: 'dimension',
                    flavour: 'continuous',
                    dataType: 'float',
                    axis: 'y'
                }
            ];
            
            const hints = generateOptimizationHintsFromFields({
                xAxisFields,
                yAxisFields
            });
            
            // Should only have one hint for 'price'
            expect(hints.field_hints?.length).toBe(1);
            expect(hints.field_hints?.[0].field).toBe('price');
        });
        
        test('should include size field as measure and disable global distinct', () => {
            const xAxisFields: Field[] = [
                {
                    id: '1',
                    columnName: 'price',
                    type: 'dimension',
                    flavour: 'continuous',
                    dataType: 'float',
                    axis: 'x'
                }
            ];
            
            const yAxisFields: Field[] = [
                {
                    id: '2',
                    columnName: 'quantity',
                    type: 'dimension',
                    flavour: 'continuous',
                    dataType: 'integer',
                    axis: 'y'
                }
            ];
            
            const sizeField: Field = {
                id: '4',
                columnName: 'total',
                type: 'measure',
                aggregation: 'sum',
                flavour: 'continuous',
                dataType: 'float'
            };
            
            const hints = generateOptimizationHintsFromFields({
                xAxisFields,
                yAxisFields,
                sizeField
            });
            
            // Has measure, so should disable global distinct
            expect(hints.enable_global_distinct).toBe(false);
            // Still has field hints for continuous dimensions
            expect(hints.field_hints?.length).toBeGreaterThan(0);
        });
        
        test('should handle datetime timeline fields', () => {
            const xAxisFields: Field[] = [
                {
                    id: '1',
                    columnName: 'timestamp',
                    type: 'dimension',
                    flavour: 'continuous',
                    dataType: 'datetime',
                    axis: 'x',
                    dateTimeMode: 'timeline'
                }
            ];
            
            const yAxisFields: Field[] = [];
            
            const hints = generateOptimizationHintsFromFields({
                xAxisFields,
                yAxisFields
            });
            
            expect(hints.field_hints).toBeDefined();
            expect(hints.field_hints?.length).toBe(1);
            expect(hints.field_hints?.[0].reason).toBe('datetime_timeline');
        });
    });
    
    describe('describeOptimizationHints', () => {
        test('should describe field-level hints with rounding', () => {
            const hints: OptimizationHints = {
                field_hints: [
                    { field: 'price', enable_rounding: true, enable_sampling: false, reason: 'continuous_dimension' },
                    { field: 'quantity', enable_rounding: true, enable_sampling: false, reason: 'continuous_dimension' }
                ],
                enable_global_distinct: true,
                optimization_level: 'balanced',
                purpose: 'field_based_optimization'
            };
            
            const description = describeOptimizationHints(hints);
            expect(description).toContain('DISTINCT');
            expect(description).toContain('Rounding');
            expect(description).toContain('2 fields');
            expect(description).toContain('balanced');
        });
        
        test('should describe hints with no optimizations', () => {
            const hints: OptimizationHints = {
                field_hints: [],
                enable_global_distinct: false,
                optimization_level: 'light',
                purpose: 'test'
            };
            
            const description = describeOptimizationHints(hints);
            expect(description).toContain('No optimizations');
            expect(description).toContain('light');
        });
        
        test('should describe field hints with sampling', () => {
            const hints: OptimizationHints = {
                field_hints: [
                    { field: 'price', enable_rounding: false, enable_sampling: true, reason: 'high_cardinality', sampling_rate: 0.1 }
                ],
                enable_global_distinct: false,
                optimization_level: 'aggressive',
                purpose: 'test'
            };
            
            const description = describeOptimizationHints(hints);
            expect(description).toContain('Sampling');
            expect(description).toContain('1 field');
        });
        
        test('should handle backward compatibility with legacy hints', () => {
            const hints: OptimizationHints = {
                enable_distinct: true,
                enable_rounding: true,
                optimization_level: 'balanced',
                purpose: 'test'
            };
            
            const description = describeOptimizationHints(hints);
            expect(description).toContain('DISTINCT');
            expect(description).toContain('Rounding');
            expect(description).toContain('legacy');
        });
        
        test('should prioritize field hints over legacy hints', () => {
            const hints: OptimizationHints = {
                field_hints: [
                    { field: 'price', enable_rounding: true, enable_sampling: false, reason: 'continuous_dimension' }
                ],
                enable_global_distinct: true,
                enable_distinct: true, // legacy, should be ignored
                enable_rounding: true, // legacy, should be ignored
                optimization_level: 'balanced',
                purpose: 'test'
            };
            
            const description = describeOptimizationHints(hints);
            expect(description).toContain('Rounding (1 field)');
            expect(description).not.toContain('legacy');
        });
    });
});
