import { Field } from '../types';
import { FieldClassification } from './types';

/**
 * Analyzes and classifies fields based on their type and flavour.
 * This centralizes the field filtering logic that was duplicated across chart types.
 */
export class FieldClassifier {
  static classifyFields(xFields: Field[], yFields: Field[]): FieldClassification {
    // Debug: Log input fields
    console.log('FieldClassifier input:', { xFields, yFields });
    
    const allFields = [...xFields, ...yFields];
    
    // Unified semantic + data type classification
    const continuousMeasures = allFields.filter((f) => f.type === 'measure' && f.flavour === 'continuous');
    const discreteMeasures = allFields.filter((f) => f.type === 'measure' && f.flavour === 'discrete');
    const continuousDimensions = allFields.filter((f) => f.type === 'dimension' && f.flavour === 'continuous');
    const discreteDimensions = allFields.filter((f) => f.type === 'dimension' && f.flavour === 'discrete');
    
    // Debug: Log what we're classifying
    console.log('FieldClassifier debug:', {
      allFields,
      continuousMeasures,
      discreteMeasures,
      continuousDimensions,
      discreteDimensions
    });
    
    return {
      // Legacy axis-specific fields (for backwards compatibility)
      xContinuous: xFields.filter((f) => f.flavour === 'continuous'),
      yContinuous: yFields.filter((f) => f.flavour === 'continuous'),
      xDiscrete: xFields.filter((f) => f.flavour === 'discrete'),
      yDiscrete: yFields.filter((f) => f.flavour === 'discrete'),
      
      xMeasures: xFields.filter((f) => f.type === 'measure'),
      yMeasures: yFields.filter((f) => f.type === 'measure'),
      xDimensions: xFields.filter((f) => f.type === 'dimension'),
      yDimensions: yFields.filter((f) => f.type === 'dimension'),
      
      // Unified semantic + data type classification
      continuousMeasures,
      discreteMeasures,
      continuousDimensions,
      discreteDimensions,
      
      // Helper methods
      hasMeasures: () => continuousMeasures.length > 0 || discreteMeasures.length > 0,
      hasDimensions: () => continuousDimensions.length > 0 || discreteDimensions.length > 0,
      hasDiscreteDimensions: () => discreteDimensions.length > 0,
      hasContinuousDimensions: () => continuousDimensions.length > 0,
    };
  }

  /**
   * Analyzes field distribution to provide insights about the data structure.
   */
  static analyzeFields(classification: FieldClassification) {
    const {
      xContinuous, yContinuous, xDiscrete, yDiscrete,
      xMeasures, yMeasures, xDimensions, yDimensions
    } = classification;

    return {
      // Field counts
      totalXFields: xContinuous.length + xDiscrete.length,
      totalYFields: yContinuous.length + yDiscrete.length,
      totalMeasures: xMeasures.length + yMeasures.length,
      totalDimensions: xDimensions.length + yDimensions.length,
      
      // Field patterns
      hasContinuousData: xContinuous.length > 0 || yContinuous.length > 0,
      hasDiscreteData: xDiscrete.length > 0 || yDiscrete.length > 0,
      hasMeasures: xMeasures.length > 0 || yMeasures.length > 0,
      hasDimensions: xDimensions.length > 0 || yDimensions.length > 0,
      
      // Axis patterns
      xIsAllContinuous: xContinuous.length > 0 && xDiscrete.length === 0,
      yIsAllContinuous: yContinuous.length > 0 && yDiscrete.length === 0,
      xIsAllDiscrete: xDiscrete.length > 0 && xContinuous.length === 0,
      yIsAllDiscrete: yDiscrete.length > 0 && yContinuous.length === 0,
      
      // Measure/dimension patterns
      xIsAllMeasures: xMeasures.length > 0 && xDimensions.length === 0,
      yIsAllMeasures: yMeasures.length > 0 && yDimensions.length === 0,
      xIsAllDimensions: xDimensions.length > 0 && xMeasures.length === 0,
      yIsAllDimensions: yDimensions.length > 0 && yMeasures.length === 0,
    };
  }
} 