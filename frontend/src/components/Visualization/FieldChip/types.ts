import { Field } from '../../../types';

export type DragSource = 'AVAILABLE_FIELDS' | 'X_AXIS' | 'Y_AXIS';

export interface FieldChipProps {
  field: Field;
  source: DragSource;
  onUpdate: (field: Field) => void;
  index?: number;
  isInvalidOnAxis?: boolean;
  allFields?: Field[]; // For range selection
}
