import { Worker, isMainThread, parentPort, workerData } from "worker_threads";
import { cpus } from "os";
import { Logger } from "../logger";

export interface WorkerTask {
  id: string;
  filePath: string;
  tsconfigPath: string;
}

export interface WorkerResult {
  id: string;
  success: boolean;
  contents: any[];
  error?: string;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private taskQueue: WorkerTask[] = [];
  private activeWorkers = new Set<Worker>();
  private results = new Map<string, WorkerResult>();
  private logger: Logger;
  private maxWorkers: number;

  constructor(logger: Logger, maxWorkers?: number) {
    this.logger = logger;
    this.maxWorkers = maxWorkers || Math.min(cpus().length, 8); // Cap at 8 workers
  }

  async processFiles(tasks: WorkerTask[]): Promise<WorkerResult[]> {
    this.taskQueue = [...tasks];
    this.results.clear();

    this.logger.info(
      `🚀 Starting parallel processing with ${this.maxWorkers} workers`
    );
    this.logger.verbose_log(`Processing ${tasks.length} tasks in parallel`);

    // Create workers
    const workerPromises: Promise<void>[] = [];
    const workersToCreate = Math.min(this.maxWorkers, tasks.length);

    // Determine the correct worker script path
    const workerScriptPath = __filename.endsWith(".ts")
      ? __filename.replace(".ts", ".js").replace("/src/", "/dist/")
      : __filename;

    for (let i = 0; i < workersToCreate; i++) {
      const worker = new Worker(workerScriptPath);
      this.workers.push(worker);
      workerPromises.push(this.setupWorker(worker));
    }

    // Wait for all workers to complete
    await Promise.all(workerPromises);

    // Cleanup workers
    await this.cleanup();

    // Return results in original order
    return tasks.map((task) => this.results.get(task.id)!);
  }

  private async setupWorker(worker: Worker): Promise<void> {
    return new Promise((resolve, reject) => {
      worker.on("message", (result: WorkerResult) => {
        this.results.set(result.id, result);

        if (result.success) {
          this.logger.verbose_log(`✅ Worker completed task ${result.id}`);
        } else {
          this.logger.error(
            `❌ Worker failed task ${result.id}: ${result.error}`
          );
        }

        // Assign next task or finish
        this.assignNextTask(worker, resolve);
      });

      worker.on("error", (error) => {
        this.logger.error(`Worker error: ${error.message}`);
        reject(error);
      });

      worker.on("exit", (code) => {
        if (code !== 0 && this.activeWorkers.has(worker)) {
          this.logger.error(`Worker exited with code ${code}`);
        }
        this.activeWorkers.delete(worker);
      });

      // Start with first task
      this.assignNextTask(worker, resolve);
    });
  }

  private assignNextTask(worker: Worker, resolve: () => void): void {
    const task = this.taskQueue.shift();

    if (task) {
      this.activeWorkers.add(worker);
      worker.postMessage(task);
    } else {
      // No more tasks, resolve this worker
      this.activeWorkers.delete(worker);
      resolve();
    }
  }

  private async cleanup(): Promise<void> {
    const terminationPromises = this.workers.map((worker) =>
      worker
        .terminate()
        .catch((err) =>
          this.logger.warn(`Error terminating worker: ${err.message}`)
        )
    );

    await Promise.all(terminationPromises);
    this.workers = [];
  }
}

// Worker thread implementation
if (!isMainThread && parentPort) {
  // Import required modules in worker context
  const { processFileInWorker } = require("./worker-file-processor");

  parentPort.on("message", async (task: WorkerTask) => {
    try {
      const contents = await processFileInWorker(
        task.filePath,
        task.tsconfigPath
      );

      const result: WorkerResult = {
        id: task.id,
        success: true,
        contents,
      };

      parentPort!.postMessage(result);
    } catch (error) {
      const result: WorkerResult = {
        id: task.id,
        success: false,
        contents: [],
        error: error instanceof Error ? error.message : "Unknown error",
      };

      parentPort!.postMessage(result);
    }
  });
}
