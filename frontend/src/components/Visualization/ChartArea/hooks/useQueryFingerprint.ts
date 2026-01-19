import { useMemo } from 'react';
import { Field, VirtualColumnDefinition } from '../../../../types';

interface FingerprintParams {
  selectedTable: string | null;
  selectedDatabase: string | null;
  xAxisFields: Field[];
  yAxisFields: Field[];
  colorField: Field | null;
  sizeField: Field | null | undefined;
  labelFields: Field[];
  filterConfigurations: Record<string, any>;
  virtualTablePrimary?: string | null;
  virtualColumns: VirtualColumnDefinition[];
  additionalColorFields: Field[];
  additionalSizeFields: Field[];
  additionalLabelFields: Field[];
}

// Produce a stable, normalized fingerprint string representing all query-relevant inputs.
// Order-independent lists are sorted to prevent spurious changes due to reordering.
export function useQueryFingerprint({
  selectedTable,
  selectedDatabase,
  xAxisFields,
  yAxisFields,
  colorField,
  sizeField,
  labelFields,
  filterConfigurations,
  virtualTablePrimary,
  virtualColumns,
  additionalColorFields,
  additionalSizeFields,
  additionalLabelFields,
}: FingerprintParams): string {
  return useMemo(() => {
    const fieldSig = (f: Field) => [f.id, f.columnName, f.type, f.aggregation || '', f.dateTimePart || '', f.dateTimeMode || ''].join('|');

    // Axis fields: order matters for query builder, keep original order
    const xSig = xAxisFields.map(fieldSig).join(',');
    const ySig = yAxisFields.map(fieldSig).join(',');

    // Fields whose order is not semantically important: sort by id for stability
    const labelSig = labelFields.map(fieldSig).sort().join(',');
    const addColorSig = additionalColorFields.map(fieldSig).sort().join(',');
    const addSizeSig = additionalSizeFields.map(fieldSig).sort().join(',');
    const addLabelSig = additionalLabelFields.map(fieldSig).sort().join(',');

    const colorSig = colorField ? fieldSig(colorField) : '';
    const sizeSig = sizeField ? fieldSig(sizeField) : '';

    // Filter configs: key + minimal descriptor of config (type + aggregation of field if present)
    const filterKeys = Object.keys(filterConfigurations).sort();
    const filtersSig = filterKeys.map(k => {
      const cfg = filterConfigurations[k];
      if (!cfg) return `${k}:null`;
      // Only include properties that change query result (range/selected values/date boundaries)
      if (cfg.type === 'discrete') {
        return `${k}:discrete:${(cfg.selectedValues || []).length}`; // length enough; values change implies length change mostly; refine if necessary
      } else if (cfg.type === 'continuous') {
        return `${k}:continuous:${cfg.min ?? ''}:${cfg.max ?? ''}`;
      } else if (cfg.type === 'datetime') {
        return `${k}:datetime:${cfg.startDate ?? ''}:${cfg.endDate ?? ''}`;
      }
      return `${k}:unknown`;
    }).join(',');

    const virtualColsSig = virtualColumns
      .map(vc => `${vc.name}|${vc.expression}`)
      .sort()
      .join(',');

    const parts = [
      selectedDatabase || '',
      selectedTable || '',
      virtualTablePrimary || '',
      xSig,
      ySig,
      colorSig,
      sizeSig,
      labelSig,
      addColorSig,
      addSizeSig,
      addLabelSig,
      filtersSig,
      virtualColsSig,
    ];

    return parts.join('||');
  }, [
    selectedDatabase,
    selectedTable,
    virtualTablePrimary,
    xAxisFields,
    yAxisFields,
    colorField,
    sizeField,
    labelFields,
    filterConfigurations,
    virtualColumns,
    additionalColorFields,
    additionalSizeFields,
    additionalLabelFields,
  ]);
}
