// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * useAdditionalFields – extracts per-field-override colour, size and label
 * fields so they can be forwarded to the query layer.
 */

import { useMemo } from 'react';

export function useAdditionalFields(fieldOverrides: Record<string, any> | undefined) {
  const additionalColorFields = useMemo(() => {
    const fields: any[] = [];
    Object.values(fieldOverrides || {}).forEach((override: any) => {
      if (override.colorField && !fields.some((f: any) => f.id === override.colorField.id)) {
        fields.push(override.colorField);
      }
    });
    return fields;
  }, [fieldOverrides]);

  const additionalSizeFields = useMemo(() => {
    const fields: any[] = [];
    Object.values(fieldOverrides || {}).forEach((override: any) => {
      if (override.sizeField && !fields.some((f: any) => f.id === override.sizeField.id)) {
        fields.push(override.sizeField);
      }
    });
    return fields;
  }, [fieldOverrides]);

  const additionalLabelFields = useMemo(() => {
    const fields: any[] = [];
    Object.values(fieldOverrides || {}).forEach((override: any) => {
      if (override.labelFields) {
        override.labelFields.forEach((labelField: any) => {
          if (!fields.some((f: any) => f.id === labelField.id)) {
            fields.push(labelField);
          }
        });
      }
    });
    return fields;
  }, [fieldOverrides]);

  return { additionalColorFields, additionalSizeFields, additionalLabelFields };
}
