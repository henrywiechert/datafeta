import { Field, QueryResult } from '../types';
import { FieldClassification } from '../spec-generator/types';

export type VegaSpec = object;

export interface ChartContext {
  xFields: Field[];
  yFields: Field[];
  classification: FieldClassification;
  queryResult?: QueryResult;
} 