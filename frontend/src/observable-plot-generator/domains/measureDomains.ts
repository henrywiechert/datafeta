import { getResultColumnName } from '../../utils/fieldUtils';
import { DOMAIN_PAD_RATIO } from '../../config/chartLayoutConfig';

/**
 * Compute shared numeric domains for all measures used across a grid.
 * Always start at 0 and pad the max by +5%.
 * 
 * For stacked charts with color fields, computes the domain based on stacked totals,
 * not individual segment values. When faceting is present, computes per-facet stacked
 * totals to avoid inflating the domain with data from other facets.
 */
export function computeSharedMeasureDomains(
  data: any[],
  xCandidates: any[],
  yCandidates: any[],
  colorField?: any,
  categoryField?: any,
  facetFields?: any[]
): Record<string, [number, number]> {
  const measures: string[] = [];

  const addMeasure = (field: any) => {
    if (field?.type === 'measure') {
      const name = getResultColumnName({ ...field, aggregation: field.aggregation || 'sum' } as any);
      if (!measures.includes(name)) measures.push(name);
    }
  };

  xCandidates.forEach(addMeasure);
  yCandidates.forEach(addMeasure);

  const domains: Record<string, [number, number]> = {};
  measures.forEach((measureName) => {
    let max = 0;
    
    // If we have both a color field and category field, we need to compute stacked totals
    if (colorField && categoryField) {
      const categoryColumnName = getResultColumnName(categoryField);
      
      // If we have facet fields, compute stacked totals per facet combination, then take the max
      if (facetFields && facetFields.length > 0) {
        const facetColumnNames = facetFields.map((f: any) => getResultColumnName(f));
        
        // Group by facet combination, then by category within each facet
        const facetGroups = data.reduce((acc: any, row: any) => {
          // Create a key for this facet combination
          const facetKey = facetColumnNames.map((col: string) => row[col]).join('|');
          if (!acc[facetKey]) acc[facetKey] = {};
          
          const category = row[categoryColumnName];
          const value = row[measureName];
          if (typeof value === 'number' && !Number.isNaN(value)) {
            if (!acc[facetKey][category]) acc[facetKey][category] = 0;
            acc[facetKey][category] += value;
          }
          return acc;
        }, {});
        
        // Find the max stacked total across all facets
        for (const facetKey in facetGroups) {
          const categoryTotals = Object.values(facetGroups[facetKey]) as number[];
          if (categoryTotals.length > 0) {
            const facetMax = Math.max(...categoryTotals);
            if (facetMax > max) max = facetMax;
          }
        }
      } else {
        // No faceting - group by category and sum the measure values
        const categoryTotals = data.reduce((acc: any, row: any) => {
          const category = row[categoryColumnName];
          const value = row[measureName];
          if (typeof value === 'number' && !Number.isNaN(value)) {
            acc[category] = (acc[category] || 0) + value;
          }
          return acc;
        }, {});
        
        // Find the max stacked total
        const totals = Object.values(categoryTotals) as number[];
        if (totals.length > 0) {
          max = Math.max(0, ...totals);
        }
      }
    } else if (colorField && !categoryField) {
      // Color field without category field: compute the total of all values (stacked in single bar)
      const total = data
        .map((row) => row[measureName])
        .filter((v) => typeof v === 'number' && !Number.isNaN(v))
        .reduce((sum, v) => sum + v, 0);
      max = Math.max(0, total);
    } else {
      // No stacking - just find the max individual value
      const values = data
        .map((row) => row[measureName])
        .filter((v) => typeof v === 'number' && !Number.isNaN(v));
      if (values.length > 0) {
        max = Math.max(0, ...values);
      }
    }
    
    const upper = max === 0 ? 1 : max * (1 + DOMAIN_PAD_RATIO);
    domains[measureName] = [0, upper];
  });

  return domains;
}


