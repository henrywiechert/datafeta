import { Field } from '../../types';
import { getResultColumnName } from '../../utils/fieldUtils';

/**
 * Maps field values to size scale
 */
export interface SizeScale {
  getSizeForValue: (value: any) => number;
  getDefaultSize: () => number;
}

/**
 * Creates a size scale for mapping field values to sizes
 */
export function createSizeScale(
  data: any[],
  field: Field | null,
  sizeRange: [number, number],
  manualSize: number
): SizeScale {
  if (!field) {
    return {
      getSizeForValue: () => manualSize,
      getDefaultSize: () => manualSize,
    };
  }

  // Determine the column name present in the result set.
  // If this is a measure without an explicit aggregation (user dropped a raw measure as size)
  // and the query was aggregated due to other measures, the backend will have applied a default
  // aggregation (we inject SUM in the query layer). In that case, the actual column in the
  // result rows is the aggregated alias (e.g., SUM(col)).
  let columnName = getResultColumnName(field);
  if (field.type === 'measure' && !field.aggregation) {
    const sumAlias = `SUM(${field.columnName})`;
    if (Array.isArray(data) && data.length > 0 && Object.prototype.hasOwnProperty.call(data[0], sumAlias)) {
      columnName = sumAlias; // Use aggregated alias actually returned
    }
  }
  const [minSize, maxSize] = sizeRange;

  if (field.flavour === 'discrete') {
    // Get unique values and sort alphabetically
    const uniqueValues = Array.from(new Set(data.map(row => row[columnName])))
      .filter(val => val !== null && val !== undefined)
      .sort((a, b) => String(a).localeCompare(String(b)));

    if (uniqueValues.length === 0) {
      return {
        getSizeForValue: () => manualSize,
        getDefaultSize: () => manualSize,
      };
    }

    if (uniqueValues.length === 1) {
      return {
        getSizeForValue: () => (minSize + maxSize) / 2,
        getDefaultSize: () => (minSize + maxSize) / 2,
      };
    }

    // Create mapping where values are equally distributed across the size range
    const sizeStep = (maxSize - minSize) / (uniqueValues.length - 1);
    const valueToSize = new Map<any, number>();
    
    uniqueValues.forEach((value, index) => {
      valueToSize.set(value, minSize + (index * sizeStep));
    });

    return {
      getSizeForValue: (value: any) => valueToSize.get(value) ?? manualSize,
      getDefaultSize: () => manualSize,
    };
  } else {
    // Continuous field - linear mapping
    const values = data
      .map(row => row[columnName])
      .filter(val => typeof val === 'number' && isFinite(val));

    if (values.length === 0) {
      return {
        getSizeForValue: () => manualSize,
        getDefaultSize: () => manualSize,
      };
    }

    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    if (minValue === maxValue) {
      return {
        getSizeForValue: () => (minSize + maxSize) / 2,
        getDefaultSize: () => (minSize + maxSize) / 2,
      };
    }

    const scale = (maxSize - minSize) / (maxValue - minValue);

    return {
      getSizeForValue: (value: any) => {
        if (typeof value !== 'number' || !isFinite(value)) {
          return manualSize;
        }
        return minSize + ((value - minValue) * scale);
      },
      getDefaultSize: () => manualSize,
    };
  }
}
