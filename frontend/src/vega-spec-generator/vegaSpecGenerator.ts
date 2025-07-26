import { Field } from '../types';
import { ChartContext, VegaSpec } from './types';
import { FieldClassifier } from '../spec-generator/fieldClassifier';
import { BarChart } from './chartTypes/barChart';
import { VegaChartStrategy } from './chartTypes/baseChart';

interface SpecGeneratorArgs {
  xFields: Field[];
  yFields: Field[];
  queryResult?: any;
}

export class VegaSpecGenerator {
  private strategies: VegaChartStrategy[];

  constructor() {
    this.strategies = [
      new BarChart(),
    ];
  }

  public generateSpec(args: SpecGeneratorArgs): VegaSpec {
    const { xFields, yFields, queryResult } = args;
    const classification = FieldClassifier.classifyFields(xFields, yFields);

    const context: ChartContext = {
      xFields,
      yFields,
      classification,
      queryResult
    };

    const strategy = this.findStrategy(context);

    if (strategy) {
      return strategy.generateSpec(context);
    }

    return this.createFallbackSpec();
  }

  private findStrategy(context: ChartContext): VegaChartStrategy | null {
    return this.strategies.find(strategy => strategy.canHandle(context)) || null;
  }

  private createFallbackSpec(): VegaSpec {
    return {
      "$schema": "https://vega.github.io/schema/vega/v5.json",
      "description": "Drag fields to the axes to create a chart. (Vega)",
    };
  }
}

const vegaSpecGenerator = new VegaSpecGenerator();

export { vegaSpecGenerator }; 