import { Field } from '../types';
import { VegaLiteSpec } from '../spec-generator/types';
import { ChartWorkerMessage, ChartWorkerResponse } from '../workers/chartWorker';
import { getTimeoutForOperation } from '../config/loadingConfig';

// Result interface for chart generation
export interface ChartGenerationResult {
  spec: VegaLiteSpec;
  chartInfo: any;
}

// Error interface
export interface ChartGenerationError {
  message: string;
  code: 'WORKER_ERROR' | 'CANCELLED' | 'TIMEOUT';
}

// Promise-based interface for worker communication
interface PendingTask {
  resolve: (result: ChartGenerationResult) => void;
  reject: (error: ChartGenerationError) => void;
  timeout?: NodeJS.Timeout;
}

class ChartWorkerService {
  private worker: Worker | null = null;
  private pendingTasks: Map<string, PendingTask> = new Map();
  private taskIdCounter = 0;

  constructor() {
    this.initializeWorker();
  }

  private initializeWorker() {
    try {
      // Create worker from the chartWorker.ts file
      this.worker = new Worker(new URL('../workers/chartWorker.ts', import.meta.url));
      
      // Handle messages from worker
      this.worker.onmessage = (event: MessageEvent<ChartWorkerResponse>) => {
        this.handleWorkerMessage(event.data);
      };

      // Handle worker errors
      this.worker.onerror = (error) => {
        console.error('Worker error event:', error);
        this.rejectAllPendingTasks({
          message: 'Worker error occurred: ' + (error.message || 'Unknown error'),
          code: 'WORKER_ERROR'
        });
      };

      // Handle worker termination
      this.worker.onmessageerror = (error) => {
        console.error('Worker message error:', error);
        this.rejectAllPendingTasks({
          message: 'Worker communication error',
          code: 'WORKER_ERROR'
        });
      };

    } catch (error) {
      console.error('Error initializing worker:', error);
      this.worker = null;
    }
  }

  private handleWorkerMessage(response: ChartWorkerResponse) {
    const { type, id } = response;
    // Conditionally destructure payload based on type
    const payload = (
      type === 'SPEC_GENERATED' || type === 'ERROR'
    ) ? (response as any).payload : undefined;

    const pendingTask = this.pendingTasks.get(id);

    if (!pendingTask) {
      console.warn(`Received worker response for unknown task ID: ${id}`);
      return;
    }

    // Clear timeout if it exists
    if (pendingTask.timeout) {
      clearTimeout(pendingTask.timeout);
    }

    // Remove from pending tasks
    this.pendingTasks.delete(id);

    switch (type) {
      case 'SPEC_GENERATED':
        // Better validation of the response payload
        if (!payload) {
          pendingTask.reject({
            message: 'Missing payload in worker response',
            code: 'WORKER_ERROR'
          });
          return;
        }

        if (!payload.spec) {
          pendingTask.reject({
            message: 'Missing chart specification in worker response',
            code: 'WORKER_ERROR'
          });
          return;
        }

        // Allow chartInfo to be empty or null - we'll handle it in the UI
        pendingTask.resolve({
          spec: payload.spec,
          chartInfo: payload.chartInfo || {} // Provide empty object as fallback
        });
        break;

      case 'ERROR':
        pendingTask.reject({
          message: payload?.error || 'Unknown worker error',
          code: 'WORKER_ERROR'
        });
        break;

      case 'CANCELLED':
        pendingTask.reject({
          message: 'Task was cancelled',
          code: 'CANCELLED'
        });
        break;

      default:
        pendingTask.reject({
          message: `Unknown response type: ${type}`,
          code: 'WORKER_ERROR'
        });
    }
  }

  private rejectAllPendingTasks(error: ChartGenerationError) {
    this.pendingTasks.forEach((task) => {
      if (task.timeout) {
        clearTimeout(task.timeout);
      }
      task.reject(error);
    });
    this.pendingTasks.clear();
  }

  private generateTaskId(): string {
    return `task_${++this.taskIdCounter}_${Date.now()}`;
  }

  /**
   * Generate chart specification using Web Worker
   */
  async generateChartSpec(
    xFields: Field[],
    yFields: Field[],
    options: {
      timeout?: number; // in milliseconds
      signal?: AbortSignal;
    } = {}
  ): Promise<ChartGenerationResult> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      // Check if worker is available
      if (!this.worker) {
        reject({
          message: 'Chart worker is not available',
          code: 'WORKER_ERROR'
        });
        return;
      }

      // Check if already aborted
      if (options.signal?.aborted) {
        reject({
          message: 'Task was aborted before starting',
          code: 'CANCELLED'
        });
        return;
      }

      const taskId = this.generateTaskId();
      const { timeout = getTimeoutForOperation('worker') } = options; // Default from config

      // Create pending task
      const pendingTask: PendingTask = {
        resolve: (result) => {
          resolve(result);
        },
        reject: (error) => {
          reject(error);
        },
      };

      // Set up timeout
      if (timeout > 0) {
        pendingTask.timeout = setTimeout(() => {
          this.pendingTasks.delete(taskId);
          this.cancelTask(taskId);
          reject({
            message: 'Chart generation timed out',
            code: 'TIMEOUT'
          });
        }, timeout);
      }

      // Post message to worker
      this.worker.postMessage({
        type: 'GENERATE_SPEC',
        id: taskId,
        payload: {
          xFields,
          yFields,
          timeout // Pass the timeout to the worker
        }
      });

      // Set up abortion handling
      options.signal?.addEventListener('abort', () => {
        console.log(`Aborting task ${taskId} from main thread.`);
        this.cancelTask(taskId); // Notify worker to cancel
        reject({
          message: 'Task was cancelled',
          code: 'CANCELLED'
        });
      }, { once: true });

      this.pendingTasks.set(taskId, pendingTask);
    });
  }

  /**
   * Cancels a specific task by its ID.
   * This sends a cancellation message to the worker.
   */
  private cancelTask(taskId: string) {
    if (this.worker) {
      const message: ChartWorkerMessage = {
        type: 'CANCEL_TASK', // Changed from 'CANCEL'
        id: taskId
      };
      this.worker.postMessage(message);
    }
  }

  /**
   * Cancels all currently pending tasks.
   */
  cancelAllTasks() {
    this.pendingTasks.forEach((_task, taskId) => {
      this.cancelTask(taskId);
    });
    this.pendingTasks.clear();
  }

  /**
   * Check if worker is available
   */
  isWorkerAvailable(): boolean {
    return this.worker !== null;
  }

  /**
   * Get number of pending tasks
   */
  getPendingTaskCount(): number {
    return this.pendingTasks.size;
  }

  /**
   * Terminate the worker and cleanup
   */
  terminate() {
    if (this.worker) {
      this.cancelAllTasks();
      this.worker.terminate();
      this.worker = null;
    }
  }
}

// Create singleton instance
export const chartWorkerService = new ChartWorkerService();

// Export for testing purposes
export { ChartWorkerService };