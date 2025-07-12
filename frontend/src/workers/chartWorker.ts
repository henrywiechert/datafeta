import { Field } from '../types';
import { VegaLiteSpec } from '../spec-generator/types';
import { SpecGenerator } from '../spec-generator/specGeneratorV2';

// Message types for communication between main thread and worker
export interface ChartWorkerMessage {
  type: 'GENERATE_SPEC' | 'CANCEL';
  id: string;
  payload?: {
    xFields: Field[];
    yFields: Field[];
  };
}

export interface ChartWorkerResponse {
  type: 'SPEC_GENERATED' | 'ERROR' | 'CANCELLED';
  id: string;
  payload?: {
    spec?: VegaLiteSpec;
    chartInfo?: any;
    error?: string;
  };
}

// Create a singleton spec generator instance
const specGenerator = new SpecGenerator();

// Track current processing task
let currentTaskId: string | null = null;

// Worker message handler
self.onmessage = (event: MessageEvent<ChartWorkerMessage>) => {
  const { type, id, payload } = event.data;

  switch (type) {
    case 'GENERATE_SPEC':
      handleGenerateSpec(id, payload);
      break;
    case 'CANCEL':
      handleCancel(id);
      break;
    default:
      console.warn('Unknown message type:', type);
  }
};

async function handleGenerateSpec(
  id: string,
  payload: { xFields: Field[]; yFields: Field[] } | undefined
) {
  if (!payload) {
    postMessage({
      type: 'ERROR',
      id,
      payload: { error: 'Invalid payload for spec generation' }
    } as ChartWorkerResponse);
    return;
  }

  try {
    // Set current task
    currentTaskId = id;

    const { xFields, yFields } = payload;

    // Check if cancelled before processing
    if (currentTaskId !== id) {
      postMessage({
        type: 'CANCELLED',
        id,
      } as ChartWorkerResponse);
      return;
    }

    // Generate the spec (this is the heavy computation)
    const spec = specGenerator.generateSpec({ xFields, yFields });

    // Check if cancelled after processing
    if (currentTaskId !== id) {
      postMessage({
        type: 'CANCELLED',
        id,
      } as ChartWorkerResponse);
      return;
    }

    // Get chart info for debugging
    const chartInfo = specGenerator.getChartInfo({ xFields, yFields });

    // Send the result back to main thread
    postMessage({
      type: 'SPEC_GENERATED',
      id,
      payload: {
        spec,
        chartInfo
      }
    } as ChartWorkerResponse);

  } catch (error) {
    console.error('Error generating chart spec:', error);
    
    postMessage({
      type: 'ERROR',
      id,
      payload: { 
        error: error instanceof Error ? error.message : 'Unknown error occurred' 
      }
    } as ChartWorkerResponse);
  } finally {
    // Clear current task
    if (currentTaskId === id) {
      currentTaskId = null;
    }
  }
}

function handleCancel(id: string) {
  if (currentTaskId === id) {
    currentTaskId = null;
    postMessage({
      type: 'CANCELLED',
      id,
    } as ChartWorkerResponse);
  }
}

// Handle worker errors
self.onerror = (error) => {
  console.error('Worker error:', error);
  if (currentTaskId) {
    postMessage({
      type: 'ERROR',
      id: currentTaskId,
      payload: { error: 'Worker error occurred' }
    } as ChartWorkerResponse);
  }
};

export {}; // Make this a module 