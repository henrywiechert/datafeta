/**
 * Unit tests for Optimization Hint Generator
 */

import {
    generateOptimizationHints,
    generateOptimizationHintsFromFields,
    inferChartType,
    getRecommendedOptimizationLevel,
    describeOptimizationHints,
    ChartType
} from './optimizationHintGenerator';
import { Dimension, Measure, Field, OptimizationHints } from '../types';

describe('optimizationHintGenerator', () => {
    describe('inferChartType', () => {
        test('should infer scatter plot from 2 continuous dimensions, no measures', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous', axis: 'x' },
                { field: 'quantity', flavour: 'continuous', axis: 'y' }
            ];
            const measures: Measure[] = [];
            
            expect(inferChartType(dimensions, measures)).toBe('scatter');
        });
        
        test('should infer bar chart from discrete dimension + measure', () => {
            const dimensions: Dimension[] = [
                { field: 'category', flavour: 'discrete', axis: 'x' }
            ];
            const measures: Measure[] = [
                { field: 'sales', aggregation: 'sum', alias: 'total_sales' }
            ];
            
            expect(inferChartType(dimensions, measures)).toBe('bar');
        });
        
        test('should infer heatmap from 2 discrete dimensions + measure', () => {
            const dimensions: Dimension[] = [
                { field: 'category', flavour: 'discrete', axis: 'x' },
                { field: 'region', flavour: 'discrete', axis: 'y' }
            ];
            const measures: Measure[] = [
                { field: 'sales', aggregation: 'sum', alias: 'total_sales' }
            ];
            
            expect(inferChartType(dimensions, measures)).toBe('heatmap');
        });
        
        test('should infer histogram from 1 continuous dimension + measure', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous', axis: 'x' }
            ];
            const measures: Measure[] = [
                { field: 'price', aggregation: 'count', alias: 'count' }
            ];
            
            expect(inferChartType(dimensions, measures)).toBe('histogram');
        });
        
        test('should infer table from raw data query', () => {
            const dimensions: Dimension[] = [
                { field: 'id', flavour: 'discrete' }
            ];
            const measures: Measure[] = [];
            
            expect(inferChartType(dimensions, measures)).toBe('table');
        });
        
        test('should use explicit chart type when provided', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous', axis: 'x' },
                { field: 'quantity', flavour: 'continuous', axis: 'y' }
            ];
            const measures: Measure[] = [];
            
            expect(inferChartType(dimensions, measures, 'line')).toBe('line');
        });

        test('should infer tickstrip from 1 continuous + 1 discrete dimension, no measures', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous', axis: 'x' },
                { field: 'category', flavour: 'discrete', axis: 'y' }
            ];
            const measures: Measure[] = [];

            expect(inferChartType(dimensions, measures)).toBe('tickstrip');
        });
    });
    
    describe('getRecommendedOptimizationLevel', () => {
        test('should recommend aggressive for scatter with 4+ fields', () => {
            expect(getRecommendedOptimizationLevel('scatter', 4)).toBe('aggressive');
        });
        
        test('should recommend balanced for scatter with 2-3 fields', () => {
            expect(getRecommendedOptimizationLevel('scatter', 2)).toBe('balanced');
            expect(getRecommendedOptimizationLevel('scatter', 3)).toBe('balanced');
        });
        
        test('should recommend light for scatter with 1 field', () => {
            expect(getRecommendedOptimizationLevel('scatter', 1)).toBe('light');
        });
        
        test('should recommend balanced for heatmap', () => {
            expect(getRecommendedOptimizationLevel('heatmap', 3)).toBe('balanced');
        });
        
        test('should recommend light for aggregated charts', () => {
            expect(getRecommendedOptimizationLevel('bar', 2)).toBe('light');
            expect(getRecommendedOptimizationLevel('line', 2)).toBe('light');
            expect(getRecommendedOptimizationLevel('histogram', 2)).toBe('light');
        });
    });
    
    describe('generateOptimizationHints', () => {
        test('should generate hints for scatter plot', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous', axis: 'x' },
                { field: 'quantity', flavour: 'continuous', axis: 'y' }
            ];
            const measures: Measure[] = [];
            
            const hints = generateOptimizationHints({ dimensions, measures });
            
            expect(hints.enable_distinct).toBe(true);
            expect(hints.enable_rounding).toBe(true);
            expect(hints.enable_sampling).toBe(false);
            expect(hints.enable_binning).toBe(false);
            expect(hints.optimization_level).toBe('balanced');
            expect(hints.purpose).toContain('scatter');
        });
        
        test('should generate hints for bar chart', () => {
            const dimensions: Dimension[] = [
                { field: 'category', flavour: 'discrete', axis: 'x' }
            ];
            const measures: Measure[] = [
                { field: 'sales', aggregation: 'sum', alias: 'total_sales' }
            ];
            
            const hints = generateOptimizationHints({ dimensions, measures });
            
            expect(hints.enable_distinct).toBe(false); // Aggregated query
            expect(hints.enable_rounding).toBe(false);
            expect(hints.optimization_level).toBe('light');
            expect(hints.purpose).toContain('bar');
        });
        
        test('should generate hints for complex scatter (4 fields)', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous', axis: 'x' },
                { field: 'quantity', flavour: 'continuous', axis: 'y' },
                { field: 'category', flavour: 'discrete' }, // color
                { field: 'region', flavour: 'discrete' }    // additional dimension
            ];
            const measures: Measure[] = [];
            
            const hints = generateOptimizationHints({ dimensions, measures });
            
            expect(hints.enable_distinct).toBe(true);
            expect(hints.enable_rounding).toBe(true);
            expect(hints.optimization_level).toBe('aggressive'); // 4 fields
        });
        
        test('should respect user preference "none"', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous', axis: 'x' },
                { field: 'quantity', flavour: 'continuous', axis: 'y' }
            ];
            const measures: Measure[] = [];
            
            const hints = generateOptimizationHints({
                dimensions,
                measures,
                userPreference: 'none'
            });
            
            expect(hints.enable_distinct).toBe(false);
            expect(hints.enable_rounding).toBe(false);
            expect(hints.optimization_level).toBe('none');
            expect(hints.purpose).toBe('user_disabled');
        });
        
        test('should respect user preference "aggressive"', () => {
            const dimensions: Dimension[] = [
                { field: 'category', flavour: 'discrete', axis: 'x' }
            ];
            const measures: Measure[] = [
                { field: 'sales', aggregation: 'sum', alias: 'total_sales' }
            ];
            
            const hints = generateOptimizationHints({
                dimensions,
                measures,
                userPreference: 'aggressive'
            });
            
            expect(hints.optimization_level).toBe('aggressive');
        });
        
        test('should include custom rounding threshold', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous', axis: 'x' },
                { field: 'quantity', flavour: 'continuous', axis: 'y' }
            ];
            const measures: Measure[] = [];
            
            const hints = generateOptimizationHints({
                dimensions,
                measures,
                customRoundingThreshold: 50000
            });
            
            expect(hints.rounding_threshold).toBe(50000);
        });

        test('should generate hints for tickstrip (rounding + distinct enabled)', () => {
            const dimensions: Dimension[] = [
                { field: 'price', flavour: 'continuous', axis: 'x' },
                { field: 'category', flavour: 'discrete', axis: 'y' }
            ];
            const measures: Measure[] = [];

            const hints = generateOptimizationHints({ dimensions, measures });

            expect(hints.enable_distinct).toBe(true);
            expect(hints.enable_rounding).toBe(true);
            expect(hints.optimization_level).toBe('balanced');
            expect(hints.purpose).toContain('tickstrip');
        });
        
        test('should handle empty dimensions and measures', () => {
            const hints = generateOptimizationHints({
                dimensions: [],
                measures: []
            });
            
            expect(hints.optimization_level).not.toBe('none');
            expect(hints.purpose).toBeDefined();
        });
    });
    
    describe('generateOptimizationHintsFromFields', () => {
        test('should generate hints from Field objects', () => {
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
            
            expect(hints.enable_distinct).toBe(true);
            expect(hints.enable_rounding).toBe(true);
            expect(hints.purpose).toContain('scatter');
        });
        
        test('should handle measure fields', () => {
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
            
            expect(hints.enable_distinct).toBe(false); // Aggregated query
            expect(hints.purpose).toContain('bar');
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
            
            // 3 fields total: should still be balanced
            expect(hints.optimization_level).toBe('balanced');
        });
        
        test('should include size field as measure', () => {
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
            
            // Has measure, so should disable distinct
            expect(hints.enable_distinct).toBe(false);
        });
    });
    
    describe('describeOptimizationHints', () => {
        test('should describe hints with multiple optimizations', () => {
            const hints: OptimizationHints = {
                enable_distinct: true,
                enable_rounding: true,
                enable_sampling: false,
                enable_binning: false,
                optimization_level: 'balanced',
                purpose: 'test'
            };
            
            const description = describeOptimizationHints(hints);
            expect(description).toContain('DISTINCT');
            expect(description).toContain('Rounding');
            expect(description).toContain('balanced');
        });
        
        test('should describe hints with no optimizations', () => {
            const hints: OptimizationHints = {
                enable_distinct: false,
                enable_rounding: false,
                enable_sampling: false,
                enable_binning: false,
                optimization_level: 'light',
                purpose: 'test'
            };
            
            const description = describeOptimizationHints(hints);
            expect(description).toContain('No optimizations');
            expect(description).toContain('light');
        });
        
        test('should describe all optimization types', () => {
            const hints: OptimizationHints = {
                enable_distinct: true,
                enable_rounding: true,
                enable_sampling: true,
                enable_binning: true,
                optimization_level: 'aggressive',
                purpose: 'test'
            };
            
            const description = describeOptimizationHints(hints);
            expect(description).toContain('DISTINCT');
            expect(description).toContain('Rounding');
            expect(description).toContain('Sampling');
            expect(description).toContain('Binning');
        });
    });
});
