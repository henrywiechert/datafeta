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
      console.log('🔧 Initializing chart worker...');
      
      // Create worker from the chartWorker.ts file
      this.worker = new Worker(new URL('../workers/chartWorker.ts', import.meta.url));
      
      console.log('✅ Chart worker ready');
      
      // Handle messages from worker
      this.worker.onmessage = (event: MessageEvent<ChartWorkerResponse>) => {
        this.handleWorkerMessage(event.data);
      };

      // Handle worker errors
      this.worker.onerror = (error) => {
        console.error('❌ Chart worker error:', error);
        this.rejectAllPendingTasks({
          message: 'Worker error occurred',
          code: 'WORKER_ERROR'
        });
      };

      // Handle worker termination
      this.worker.onmessageerror = (error) => {
        console.error('❌ Chart worker message error:', error);
        this.rejectAllPendingTasks({
          message: 'Worker communication error',
          code: 'WORKER_ERROR'
        });
      };

    } catch (error) {
      console.error('❌ Failed to initialize chart worker:', error);
      this.worker = null;
    }
  }

  private handleWorkerMessage(response: ChartWorkerResponse) {
    const { type, id, payload } = response;
    const pendingTask = this.pendingTasks.get(id);

    if (!pendingTask) {
      console.warn('Received response for unknown task:', id);
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
        if (payload?.spec && payload?.chartInfo) {
          pendingTask.resolve({
            spec: payload.spec,
            chartInfo: payload.chartInfo
          });
        } else {
          pendingTask.reject({
            message: 'Invalid response from worker',
            code: 'WORKER_ERROR'
          });
        }
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
          message: 'Unknown response type',
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
    console.log(`🎯 Starting chart generation via worker (fields: ${xFields.length + yFields.length})`);
    
    return new Promise((resolve, reject) => {
      // Check if worker is available
      if (!this.worker) {
        console.log('❌ Worker not available for chart generation');
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
          const duration = Date.now() - startTime;
          console.log(`✅ Chart generation completed in ${duration}ms`);
          resolve(result);
        },
        reject: (error) => {
          const duration = Date.now() - startTime;
          console.log(`❌ Chart generation failed after ${duration}ms: ${error.message}`);
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

      // Set up abort signal handler
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          this.pendingTasks.delete(taskId);
          this.cancelTask(taskId);
          reject({
            message: 'Task was aborted',
            code: 'CANCELLED'
          });
        });
      }

      // Store pending task
      this.pendingTasks.set(taskId, pendingTask);

      // Send message to worker
      const message: ChartWorkerMessage = {
        type: 'GENERATE_SPEC',
        id: taskId,
        payload: {
          xFields,
          yFields
        }
      };

      this.worker.postMessage(message);
    });
  }

  /**
   * Cancel a specific task
   */
  private cancelTask(taskId: string) {
    if (this.worker) {
      const message: ChartWorkerMessage = {
        type: 'CANCEL',
        id: taskId
      };
      this.worker.postMessage(message);
    }
  }

  /**
   * Cancel all pending tasks
   */
  cancelAllTasks() {
    this.pendingTasks.forEach((task, taskId) => {
      if (task.timeout) {
        clearTimeout(task.timeout);
      }
      this.cancelTask(taskId);
    });
    
    this.rejectAllPendingTasks({
      message: 'All tasks were cancelled',
      code: 'CANCELLED'
    });
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