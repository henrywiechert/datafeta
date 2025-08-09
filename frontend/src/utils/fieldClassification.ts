import { Field } from '../types';

// Core field analysis types
export interface FieldClassification {
  // Legacy axis-specific fields (for backwards compatibility)
  xContinuous: Field[];
  yContinuous: Field[];
  xDiscrete: Field[];
  yDiscrete: Field[];
  xMeasures: Field[];
  yMeasures: Field[];
  xDimensions: Field[];
  yDimensions: Field[];
  
  // Unified semantic + data type classification
  continuousMeasures: Field[];     // Continuous + Aggregated
  discreteMeasures: Field[];       // Discrete + Aggregated  
  continuousDimensions: Field[];   // Continuous + Grouping
  discreteDimensions: Field[];     // Discrete + Grouping
  
  // New unified flavour-based classification
  continuousFields: Field[];       // All continuous fields (dimensions + measures)
  discreteFields: Field[];         // All discrete fields (dimensions + measures)

  // Helper methods
  hasContinuousData(): boolean;
  hasDiscreteData(): boolean;
  isEmpty(): boolean;
}

/**
 * Analyzes and classifies fields based on their type and flavour.
 * This centralizes the field filtering logic that was duplicated across chart types.
 */
export class FieldClassifier {
  static classifyFields(xFields: Field[], yFields: Field[]): FieldClassification {
    const allFields = [...xFields, ...yFields];
    
    // Unified semantic + data type classification
    const continuousMeasures = allFields.filter((f) => f.type === 'measure' && f.flavour === 'continuous');
    const discreteMeasures = allFields.filter((f) => f.type === 'measure' && f.flavour === 'discrete');
    const continuousDimensions = allFields.filter((f) => f.type === 'dimension' && f.flavour === 'continuous');
    const discreteDimensions = allFields.filter((f) => f.type === 'dimension' && f.flavour === 'discrete');
    
    // New unified flavour-based classification
    const continuousFields = allFields.filter((f) => f.flavour === 'continuous');
    const discreteFields = allFields.filter((f) => f.flavour === 'discrete');

    // Legacy axis-specific fields (for backwards compatibility)
    const xContinuous = xFields.filter((f) => f.flavour === 'continuous');
    const yContinuous = yFields.filter((f) => f.flavour === 'continuous');
    const xDiscrete = xFields.filter((f) => f.flavour === 'discrete');
    const yDiscrete = yFields.filter((f) => f.flavour === 'discrete');
    const xMeasures = xFields.filter((f) => f.type === 'measure');
    const yMeasures = yFields.filter((f) => f.type === 'measure');
    const xDimensions = xFields.filter((f) => f.type === 'dimension');
    const yDimensions = yFields.filter((f) => f.type === 'dimension');

    const classification: FieldClassification = {
      // Legacy axis-specific
      xContinuous,
      yContinuous,
      xDiscrete,
      yDiscrete,
      xMeasures,
      yMeasures,
      xDimensions,
      yDimensions,
      
      // Unified semantic + data type
      continuousMeasures,
      discreteMeasures,
      continuousDimensions,
      discreteDimensions,
      
      // Unified flavour-based
      continuousFields,
      discreteFields,

      // Helper methods
      hasContinuousData(): boolean {
        return continuousFields.length > 0;
      },
      
      hasDiscreteData(): boolean {
        return discreteFields.length > 0;
      },
      
      isEmpty(): boolean {
        return allFields.length === 0;
      }
    };

    return classification;
  }
}
