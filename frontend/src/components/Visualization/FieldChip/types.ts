import { Field } from '../../../types';

export type DragSource = 'AVAILABLE_FIELDS' | 'X_AXIS' | 'Y_AXIS';

export interface FieldChipProps {
  field: Field;
  source: DragSource;
  onUpdate: (fields: Field | Field[]) => void; // Accepts single field or array
  index?: number;
  isInvalidOnAxis?: boolean;
  allFields?: Field[]; // For range selection
}
