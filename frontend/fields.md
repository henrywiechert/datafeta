# Field Classification System

The field classification system is central to the data analysis platform, providing intelligent categorization of data fields that drives chart selection, aggregation options, and visualization behavior.

## Field Attributes

Every field in the system has two key attributes that determine its behavior:

### Type (Semantic Meaning)
- **Dimension**: Fields that cannot be aggregated (categorical data, identifiers)
- **Measure**: Fields that must be aggregated (numeric values, metrics)

### Flavour (Data Characteristics)
- **Discrete**: Categorical or distinct values (categories, boolean, distinct numbers)
- **Continuous**: Numerical data series (measurements, quantities, ratios)

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
  - `countd` - Count of distinct values
  - `min` - Minimum value (alphabetical for strings)
  - `max` - Maximum value (alphabetical for strings)
- **Behavior**:
  - Must be aggregated before visualization
  - Limited aggregation functions
  - Often used for counting and distinct value analysis

### Continuous Measures
- **Examples**: Revenue, Temperature, Distance, Percentage
- **Aggregation Options**:
  - All discrete measure aggregations plus:
  - `avg` - Average/mean value
  - `median` - Median value  
  - `sum` - Sum of all values
- **Behavior**:
  - Must be aggregated before visualization
  - Full range of mathematical aggregations available
  - Used for quantitative analysis

## Field Classifier Implementation

### FieldClassifier Class

The `FieldClassifier` centralizes field filtering logic that was previously duplicated across chart types:

```typescript
export class FieldClassifier {
  static classifyFields(xFields: Field[], yFields: Field[]): FieldClassification
}
```

### Classification Result Structure

```typescript
interface FieldClassification {
  // Legacy axis-specific (backwards compatibility)
  xContinuous: Field[];
  yContinuous: Field[];
  xDiscrete: Field[];
  yDiscrete: Field[];
  xMeasures: Field[];
  yMeasures: Field[];
  xDimensions: Field[];
  yDimensions: Field[];
  
  // Unified semantic + data type
  continuousMeasures: Field[];
  discreteMeasures: Field[];
  continuousDimensions: Field[];
  discreteDimensions: Field[];
  
  // Unified flavour-based
  continuousFields: Field[];
  discreteFields: Field[];

  // Helper methods
  hasContinuousData(): boolean;
  hasDiscreteData(): boolean;
  isEmpty(): boolean;
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
All measures must be aggregated before visualization. The available aggregations depend on the measure's flavour:

#### Discrete Measure Aggregations
```sql
-- Basic counting operations
COUNT(*) as count
COUNT(DISTINCT field) as countd
MIN(field) as min  -- Alphabetical for strings
MAX(field) as max  -- Alphabetical for strings
```

#### Continuous Measure Aggregations
```sql
-- All discrete aggregations plus mathematical operations
AVG(field) as avg
MEDIAN(field) as median
SUM(field) as sum
```

### Dimension Grouping
Dimensions are used for `GROUP BY` operations but are never aggregated themselves:

```sql
SELECT dimension1, dimension2, AGG(measure1)
FROM table
GROUP BY dimension1, dimension2
```

## Field Type Detection

### Automatic Classification
The system automatically detects field types based on:

1. **Data type analysis**: Examining the underlying data type (string, number, date)
2. **Value distribution**: Analyzing the uniqueness and range of values
3. **Semantic hints**: Using field names and metadata when available
4. **Statistical analysis**: Examining value patterns and distributions

### Override Capabilities
Users can manually override automatic classifications when needed:

- **Continuous to Discrete**: Treat numerical data as categories
- **Measure to Dimension**: Use normally aggregated fields as grouping variables
- **Dimension to Measure**: Apply aggregations to categorical fields (e.g., counting categories)

## Faceting Integration

Field classification directly influences faceting behavior:

### Faceting Triggers
- **Discrete dimensions** on axes trigger faceting
- **Position determines direction**: X-axis → horizontal, Y-axis → vertical
- **Multiple discrete dimensions** create hierarchical faceting

### Faceting Exclusions
- **Continuous dimensions** do not trigger traditional faceting
- **Measures** require aggregation before faceting considerations
- **Mixed scenarios** follow complex precedence rules

## Table View Logic

When only discrete dimensions are present:

### Axis-Based Layouts
- **Y-axis only**: Vertical column of unique values
- **X-axis only**: Horizontal row of unique values
- **Both axes**: Grid layout with combination indicators

### Hierarchical Display
- **Multiple dimensions per axis**: Hierarchical grouping
- **Leftmost dimension**: Outer grouping level
- **Visual hierarchy**: Clear grouping structure

## Data Type Constraints

### String Type Limitations
- **Continuous dimensions cannot be strings**: Logical constraint for continuous data
- **String measures**: Limited to discrete aggregations only
- **String dimensions**: Always treated as discrete

### Numeric Type Flexibility
- **Numbers as discrete**: Treating each unique number as a category
- **Numbers as continuous**: Mathematical operations and ranges
- **Context-dependent**: Same numeric field can be either depending on use case

## Performance Implications

### Classification Impact
- **Cardinality considerations**: High-cardinality discrete fields impact performance
- **Aggregation complexity**: More complex aggregations for continuous measures
- **Index optimization**: Different index strategies for different field types

### Query Generation
Field classification directly influences SQL query generation:

```python
# Discrete dimensions with measures
SELECT dim1, dim2, AGG(measure1) FROM table GROUP BY dim1, dim2

# Continuous dimensions (no measures)
SELECT DISTINCT dim1 FROM table ORDER BY dim1

# Complex mixed scenarios
SELECT dim1, AGG(measure1), percentile(cont_dim, 0.5) 
FROM table GROUP BY dim1
```

## Future Enhancements

### Planned Improvements
- **Machine learning classification**: Automated semantic field type detection
- **User feedback integration**: Learning from user classification overrides
- **Advanced data profiling**: More sophisticated statistical analysis
- **Custom field types**: User-defined field categories and behaviors
- **Temporal field handling**: Specialized support for time-series data
- **Geospatial field support**: Geographic data type classification