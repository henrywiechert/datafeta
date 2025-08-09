/* eslint-disable no-restricted-globals */
import { generateVegaLiteSpec, getChartInfo } from '../spec-generator/specGenerator';
import { VegaLiteSpec } from '../spec-generator/types';
import { Field } from '../types';

// Define message types for communication
export type ChartWorkerMessage =
  | { type: 'GENERATE_SPEC'; id: string; payload: { xFields: Field[]; yFields: Field[]; timeout: number; } }
  | { type: 'CANCEL_TASK'; id: string };

export type ChartWorkerResponse =
  | { type: 'SPEC_GENERATED'; id: string; payload: { spec: VegaLiteSpec; chartInfo: any; } }
  | { type: 'ERROR'; id: string; payload: { error: string } }
  | { type: 'CANCELLED'; id: string };

// In-memory store for abort controllers for each task
const taskAbortControllers: Map<string, AbortController> = new Map();

// Handle messages from the main thread
self.onmessage = async (event: MessageEvent<ChartWorkerMessage>) => {
  const { type, id } = event.data;

  switch (type) {
    case 'GENERATE_SPEC':
      // Extract payload specifically for GENERATE_SPEC type
      const { payload } = event.data as { type: 'GENERATE_SPEC'; id: string; payload: { xFields: Field[]; yFields: Field[]; timeout: number; } };

      // Create a new AbortController for this task
      const abortController = new AbortController();
      taskAbortControllers.set(id, abortController);

      // Set up a timeout to cancel the operation if it takes too long
      const timeoutId = setTimeout(() => {
        if (taskAbortControllers.has(id)) {
          abortController.abort();
          self.postMessage({ type: 'ERROR', id, payload: { error: 'Operation timed out' } });
          taskAbortControllers.delete(id);
        }
      }, payload.timeout);

      try {
        // Check if aborted before starting work
        if (abortController.signal.aborted) {
          clearTimeout(timeoutId);
          self.postMessage({ type: 'CANCELLED', id });
          return;
        }

        // Generate chart specification
        const specResult = generateVegaLiteSpec({
          xFields: payload.xFields,
          yFields: payload.yFields,
        });
        
        // Debug: Log what we got from the spec generator
        console.log('Chart worker received from specGenerator:', 
          { hasResult: !!specResult, hasSpec: !!(specResult?.spec), hasChartInfo: !!(specResult?.chartInfo) }
        );
        
        if (!specResult || !specResult.spec) {
          throw new Error('Spec generator returned null or invalid specification');
        }
        
        // Ensure chartInfo is always generated, even if spec generation doesn't include it
        const chartInfo = specResult.chartInfo || getChartInfo({
          xFields: payload.xFields,
          yFields: payload.yFields,
        });
        
        // Prepare the response with guaranteed spec object
        const workerResponse = { 
          type: 'SPEC_GENERATED' as const, 
          id, 
          payload: { 
            spec: specResult.spec || { 
              "description": "Fallback specification." 
            }, 
            chartInfo: chartInfo || {} 
          } 
        };
        
        // Debug: Log what we're sending back
        console.log('Chart worker sending response:', 
          { hasSpec: !!(workerResponse.payload?.spec), hasChartInfo: !!(workerResponse.payload?.chartInfo) }
        );
        
        if (!abortController.signal.aborted) {
          clearTimeout(timeoutId);
          self.postMessage(workerResponse);
        }
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          self.postMessage({ type: 'CANCELLED', id });
        } else {
          console.error('Chart generation error:', error);
          self.postMessage({ 
            type: 'ERROR', 
            id, 
            payload: { 
              error: `Error generating chart: ${error.message || 'Unknown error'}` 
            } 
          });
        }
      } finally {
        taskAbortControllers.delete(id);
      }
      break;

    case 'CANCEL_TASK':
      const controllerToCancel = taskAbortControllers.get(id);
      if (controllerToCancel) {
        controllerToCancel.abort();
        // The catch block in GENERATE_SPEC will handle the postMessage({ type: 'CANCELLED' })
      }
      break;

    default:
      // @ts-ignore
  }
};

// Handle worker errors
self.onerror = (error) => {
  console.error('Worker global error:', error);
};