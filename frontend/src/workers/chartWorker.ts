/* eslint-disable no-restricted-globals */
import { generateVegaLiteSpec } from '../spec-generator/specGenerator';
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

        const specResult = generateVegaLiteSpec({
          xFields: payload.xFields,
          yFields: payload.yFields,
          // Removed signal as it's not part of SpecGeneratorArgs
        });
        
        if (!abortController.signal.aborted) {
          clearTimeout(timeoutId);
          self.postMessage({ type: 'SPEC_GENERATED', id, payload: { spec: specResult.spec, chartInfo: specResult.chartInfo } });
        }
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          self.postMessage({ type: 'CANCELLED', id });
        } else {
          self.postMessage({ type: 'ERROR', id, payload: { error: error.message || 'Unknown error' } });
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
  // The currentTaskId logic is removed, so we can't track the task ID here directly.
  // If a task was in progress, we might want to send a cancellation message.
  // For now, we'll just log the error.
}; 