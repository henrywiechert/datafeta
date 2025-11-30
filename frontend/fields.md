# Field Classification System

The field classification system is central to the data analysis platform, providing intelligent categorization of data fields that drives chart selection, aggregation options, and visualization behavior.

**Last Updated**: November 30, 2025

## Field Attributes

Every field in the system has two key attributes that determine its behavior:

### Type (Semantic Meaning)
- **Dimension**: Fields that cannot be aggregated (categorical data, identifiers, temporal data)
- **Measure**: Fields that must be aggregated (numeric values, metrics)

### Flavour (Data Characteristics)
- **Discrete**: Categorical or distinct values (categories, boolean, distinct numbers)
- **Continuous**: Numerical data series (measurements, quantities, ratios)

### Additional Attributes
- **dataType**: Underlying data type ('string', 'integer', 'float', 'datetime', etc.)
- **axis**: Optional positioning hint ('x' or 'y')
- **date_part**: For datetime fields, which part to extract ('year', 'month', 'day', etc.)
- **date_mode**: How to handle datetime ('distinct' or 'timeline')
- **aggregation**: For measures, the aggregation function to apply

## Field Classification Matrix

| Type/Flavour | Discrete | Continuous |
|-------------|----------|------------|
| **Dimension** | Categories, IDs, discrete numbers | Raw numerical series, timestamps |
| **Measure** | Counts, boolean flags | Revenue, temperature, quantities |

## Dimension Fields

### Discrete Dimensions
- **Examples**: Country, Product Category, Status, Year (as category)
- **Behavior**: 
  - Each unique value treated as a separate category
  - Cannot be aggregated mathematically
  - Used for grouping and faceting
  - Triggers categorical chart types (bars, discrete axes)

### Continuous Dimensions
- **Examples**: Timestamp, Date, Sequential ID, Raw measurements
- **Behavior**:
  - Represents continuous sequences or ranges
  - Cannot be aggregated but can be binned
  - Used for continuous axes in charts
  - Cannot be of string data type
  - Triggers line charts and continuous axes

## Measure Fields

### Discrete Measures
- **Examples**: Count, Boolean flags, Ratings (1-5), Status codes
- **Aggregation Options**: 
  - `count` - Count of records
  - `count_distinct` - Count of distinct values
  - `min` - Minimum value
  - `max` - Maximum value
  - **Note**: Numerical discrete measures (integer/float dataType) also support continuous aggregations
- **Behavior**:
  - Must be aggregated before visualization
  - Aggregation functions depend on dataType
  - Often used for counting and distinct value analysis

### Continuous Measures
- **Examples**: Revenue, Temperature, Distance, Percentage
- **Aggregation Options**:
  - `sum` - Sum of all values
  - `avg` - Average/mean value
  - `min` - Minimum value
  - `max` - Maximum value
  - `count` - Count of records
  - `count_distinct` - Count of distinct values
- **Behavior**:
  - Must be aggregated before visualization
  - Full range of mathematical aggregations available
  - Used for quantitative analysis

### Aggregation Logic by DataType
```typescript
// Discrete measures with numerical dataType
if (field.flavour === 'discrete' && (field.dataType === 'integer' || field.dataType === 'float')) {
  // Can use ALL aggregations: sum, avg, min, max, count, count_distinct
}

// Discrete measures with non-numerical dataType
if (field.flavour === 'discrete' && field.dataType !== 'integer' && field.dataType !== 'float') {
  // Limited to: min, max, count, count_distinct
}

// Continuous measures (always numerical)
if (field.flavour === 'continuous') {
  // Can use ALL aggregations: sum, avg, min, max, count, count_distinct
}
```

## Field Classifier Implementation

### FieldClassifier Class

The `FieldClassifier` centralizes field filtering logic that was previously duplicated across chart types:

**Location**: `frontend/src/utils/fieldClassification.ts`

```typescript
export class FieldClassifier {
  static classifyFields(xFields: Field[], yFields: Field[]): FieldClassification
}
```

### Classification Result Structure

```typescript
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
  
  // Unified flavour-based classification
  continuousFields: Field[];       // All continuous fields (dimensions + measures)
  discreteFields: Field[];         // All discrete fields (dimensions + measures)

  // Helper methods
  hasContinuousData(): boolean;    // Returns true if any continuous fields exist
  hasDiscreteData(): boolean;      // Returns true if any discrete fields exist
  isEmpty(): boolean;              // Returns true if no fields at all
}
```

### Field Interface

**Location**: `frontend/src/types.ts`

```typescript
export type FieldType = 'dimension' | 'measure';
export type Flavour = 'discrete' | 'continuous';
export type Aggregation = 'sum' | 'avg' | 'min' | 'max' | 'count' | 'count_distinct';

export interface Field {
  name: string;
  columnName: string;
  type: FieldType;
  aggregation?: Aggregation;  // Optional, dimensions don't have it
  flavour: Flavour;
  dataType?: string;  // 'string', 'integer', 'float', 'datetime', etc.
  axis?: 'x' | 'y';
  
  // DateTime-specific fields
  date_part?: DateTimePart;
  date_mode?: DateTimeMode;
  
  // Virtual column fields
  expression?: string;
  isVirtual?: boolean;
}
```

## Chart Type Selection Rules

Field classifications directly drive chart type selection:

### Primary Rules
1. **Continuous dimension only** → Tick-strip chart (distribution visualization)
2. **Single measure + one axis** → Bar chart in appropriate direction
3. **Measure on both axes** → Scatter plot (aggregated point)
4. **Continuous dimension + measure** → Line chart
5. **Continuous dimensions on both axes** → Scatter plot

### Complex Scenarios
- **Multiple discrete dimensions** → Faceting system activation
- **Mixed field types** → Hierarchical chart selection
- **No measures or continuous dimensions** → Table view fallback

## Aggregation Logic

### Measure Aggregation Requirements
All measures must be aggregated before visualization. The available aggregations depend on the measure's flavour and dataType:

#### Discrete Measure Aggregations (Non-Numerical)
```sql
-- Basic counting and min/max operations
COUNT(*) as count
COUNT(DISTINCT field) as count_distinct
MIN(field) as min  -- Works for all types (alphabetical for strings)
MAX(field) as max  -- Works for all types (alphabetical for strings)
```

#### Discrete Measure Aggregations (Numerical)
```sql
-- All operations available for numerical discrete measures
COUNT(*) as count
COUNT(DISTINCT field) as count_distinct
MIN(field) as min
MAX(field) as max
AVG(field) as avg     -- Available due to numerical dataType
SUM(field) as sum     -- Available due to numerical dataType
```

#### Continuous Measure Aggregations
```sql
-- All mathematical operations available
AVG(field) as avg
SUM(field) as sum
MIN(field) as min
MAX(field) as max
COUNT(*) as count
COUNT(DISTINCT field) as count_distinct
```

### Dimension Grouping
Dimensions are used for `GROUP BY` operations but are never aggregated themselves:

```sql
SELECT dimension1, dimension2, AGG(measure1)
FROM table
GROUP BY dimension1, dimension2
```

### DateTime Dimension Handling
DateTime dimensions can extract specific parts for grouping:

```sql
-- Extract year from datetime dimension
SELECT EXTRACT(YEAR FROM date_field) as date_field_year_distinct, 
       SUM(revenue) as total_revenue
FROM table
GROUP BY EXTRACT(YEAR FROM date_field)
```

## Field Type Detection

### Automatic Classification
The system automatically detects field types based on:

1. **Data type analysis**: Examining the underlying data type (string, integer, float, datetime)
2. **Backend metadata**: Database column types and constraints
3. **User selection**: Users choose type (dimension/measure) and flavour (discrete/continuous) via UI
4. **Semantic hints**: Using field names and metadata when available

### Override Capabilities
Users have full control over field classification through the UI:

- **Type selection**: Choose between dimension and measure
- **Flavour selection**: Choose between discrete and continuous
- **Aggregation selection**: For measures, choose the aggregation function
- **DateTime part extraction**: For datetime fields, extract specific parts (year, month, day, etc.)
- **Virtual columns**: Create calculated fields with custom SQL expressions

### Field Utilities

**Location**: `frontend/src/utils/fieldUtils.ts`

```typescript
// Get available aggregations for a field
getAvailableAggregations(field: Field): Aggregation[]

// Type checking helpers
isDimension(field: Field): boolean
isMeasure(field: Field): boolean

// Get result column name (handles datetime parts and aliases)
getResultColumnName(field: Field): string

// Get display name with datetime part information
getFieldDisplayName(field: Field): string
```

## Faceting Integration

Field classification directly influences faceting behavior:

### Faceting Triggers
- **Discrete dimensions** on axes trigger faceting (see `faceting.md`)
- **Position determines direction**: X-axis → column facets, Y-axis → row facets
- **Multiple discrete dimensions** create hierarchical faceting with nested levels

### Faceting Exclusions
- **Continuous dimensions** do not trigger faceting (used for axes)
- **Measures** require aggregation and are typically used in the plot itself
- **Category encoding**: Chart generators may reserve one discrete dimension for category axis instead of faceting

### Facet Planning
The facet planner (`facetPlanner.ts`) uses field classification to determine faceting strategy:

```typescript
// Get discrete dimensions from each axis
const xDiscrete = xFields.filter(f => f.flavour === 'discrete');
const yDiscrete = yFields.filter(f => f.flavour === 'discrete');

// X discrete → column facets, Y discrete → row facets
const facetPlan = {
  rowFacetFields: yDiscrete,
  colFacetFields: xDiscrete
};
```

## Visualization Patterns

### Discrete Dimension Scenarios
When only discrete dimensions are present (no measures):

- **Scatter plots**: Used for categorical-only visualizations
- **Category axes**: Discrete dimensions can become categorical axes
- **Faceting**: Multiple discrete dimensions trigger faceting behavior

### Continuous Dimension Scenarios
Continuous dimensions without measures:

- **Tick strips**: Distribution visualization for single continuous dimension
- **Timeline axes**: DateTime continuous dimensions create timeline charts
- **Line charts**: When paired with measures

### Mixed Field Scenarios
Common patterns with mixed field types:

```typescript
// Continuous dimension + Continuous measure → Line chart
{ xFields: [datetime_dimension], yFields: [revenue_measure] }

// Discrete dimension + Continuous measure → Bar chart
{ xFields: [category_dimension], yFields: [revenue_measure] }

// Multiple discrete dimensions + Measure → Faceted bar charts
{ xFields: [region_dimension, product_dimension], yFields: [revenue_measure] }

// Continuous measure + Continuous measure → Scatter plot
{ xFields: [revenue_measure], yFields: [profit_measure] }
```

## Data Type Constraints

### String Type Limitations
- **Continuous dimensions cannot be strings**: Logical constraint - continuous implies numerical or temporal data
- **String measures**: Limited to discrete aggregations (min, max, count, count_distinct)
- **String dimensions**: Always treated as discrete

### Numeric Type Flexibility
- **Numbers as discrete**: Each unique number treated as a category (e.g., year as category)
- **Numbers as continuous**: Mathematical operations and ranges enabled
- **Context-dependent**: Same numeric field can be dimension or measure with different aggregations

### DateTime Type Handling
- **DateTime dimensions**: Can be continuous (timeline) or discrete (extracted parts)
- **Date part extraction**: Extract year, month, day, weekday, hour, etc.
- **Date modes**: 
  - `distinct`: Treat extracted parts as categories
  - `timeline`: Maintain temporal ordering

### Virtual Columns
- **Calculated fields**: SQL expressions defining new fields
- **Type inference**: Backend infers data type from expression
- **Aggregation support**: Virtual columns can be dimensions or measures

## Performance Implications

### Classification Impact
- **Cardinality considerations**: High-cardinality discrete fields (>1000 unique values) trigger performance optimizations
- **Aggregation complexity**: More complex aggregations for continuous measures
- **Index optimization**: Backend leverages database indexes based on field usage

### Query Generation
Field classification directly influences SQL query generation:

```python
# Discrete dimensions with measures
SELECT dim1, dim2, SUM(measure1) as total 
FROM table 
GROUP BY dim1, dim2

# Continuous dimensions (no aggregation)
SELECT DISTINCT dim1 
FROM table 
ORDER BY dim1

# DateTime part extraction
SELECT EXTRACT(YEAR FROM date_field) as year, SUM(revenue) as total
FROM table
GROUP BY EXTRACT(YEAR FROM date_field)

# Virtual columns
SELECT (revenue - cost) / revenue * 100 as profit_margin, region
FROM table
GROUP BY region
```

### Optimization Hints
The system generates field-level optimization hints based on classification:

```typescript
// Continuous dimensions trigger rounding optimization
if (field.type === 'dimension' && field.flavour === 'continuous') {
  optimization_hints.field_hints.push({
    field: field.name,
    enable_rounding: true,
    rounding_threshold: 100,
    reason: 'continuous_dimension'
  });
}
```

## Implementation Files

### Core Files
- **`frontend/src/types.ts`**: Field, Dimension, Measure, and Aggregation type definitions
- **`frontend/src/utils/fieldClassification.ts`**: FieldClassifier class and FieldClassification interface
- **`frontend/src/utils/fieldUtils.ts`**: Field utility functions (aggregations, column names, display names)
- **`frontend/src/utils/datetimeUtils.ts`**: DateTime-specific field handling

### Related Systems
- **Chart selection**: `frontend/src/observable-plot-generator/helpers/chartTypeResolver.ts`
- **Facet planning**: `frontend/src/observable-plot-generator/faceting/facetPlanner.ts`
- **Query building**: `frontend/src/hooks/useQueryBuilder.ts`

## Future Enhancements

### Planned Improvements
- **Smart field suggestions**: AI-based recommendations for field type and aggregation
- **Cardinality warnings**: Alert users to high-cardinality discrete fields
- **Advanced data profiling**: More sophisticated statistical analysis of field characteristics
- **Custom aggregations**: User-defined aggregation functions
- **Temporal field enhancements**: Advanced time-series operations and date math
- **Geospatial field support**: Geographic data type classification and spatial aggregations
- **Field groups**: Logical grouping of related fields for easier analysis
- **Field metadata**: Custom descriptions, units, and formatting rules