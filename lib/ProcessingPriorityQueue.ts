import FastPriorityQueue from "fastpriorityqueue";
import { PTask } from "./PTask";
import SubscribableQueueItem from "./SubscribableQueueItem";

interface PriorityQueueItem<T> {
  value: T;
  valid: boolean;
}

/**
 * Singleton class that manages a queue of tasks.
 */
export default class ProcessingPriorityQueue {
  /**
   * A map of all the instances of the queue.
   */
  private static instances = new Map<string, ProcessingPriorityQueue>();

  /**
   * This map is used to keep track of the paused tasks.
   */
  private pausedTasks = new Map<number, SubscribableQueueItem>();

  /**
   * Holds the currently running tasks.
   */
  private currentlyRunning = new Map<number, SubscribableQueueItem>();

  /**
   * This map is used to keep track of the tasks waiting for execution.
   */
  private pendingTasks = new Map<number, PriorityQueueItem<SubscribableQueueItem>>();

  /**
   * Holds a prioritized heap of the pending tasks.
   */
  private priorityQueue: FastPriorityQueue<PriorityQueueItem<SubscribableQueueItem>>;

  private currentConcurrencyCount = 0;

  private constructor(private concurrencyLimit: number = 1) {
    this.priorityQueue = new FastPriorityQueue((
      a: PriorityQueueItem<SubscribableQueueItem>,
      b: PriorityQueueItem<SubscribableQueueItem>
    ) => a.value.task.priority > b.value.task.priority);
  }

  public setConcurrencyLimit(concurrencyLimit: number): void {
    this.concurrencyLimit = concurrencyLimit;
  }

  public async enqueue(ptask: PTask<any, any>): Promise<any> {
    if (!this.pendingTasks.has(ptask.key)) {
      const subscribableItem = new SubscribableQueueItem(ptask);
      const qItem = { value: subscribableItem, valid: true };
      this.pendingTasks.set(ptask.key, qItem);
      this.priorityQueue.add(qItem);
    }

    const promise = this.pendingTasks.get(ptask.key).value.createPromise();
    setImmediate(() => {
      this.process();
    });

    return promise;
  }

  private poll(): PriorityQueueItem<SubscribableQueueItem> {
    const item = this.priorityQueue.poll() as PriorityQueueItem<SubscribableQueueItem>;
    this.pendingTasks.delete(item.value.task.key);

    return item;
  }

  public updatePriority(ptask: PTask<any, any>): void {
    if(!this.pendingTasks.has(ptask.key)) return;

    const qItem = this.pendingTasks.get(ptask.key);
    qItem.valid = false;
    
    const newQItem = { value: qItem.value, valid: true }
    this.pendingTasks.set(ptask.key, newQItem);
    this.priorityQueue.add(newQItem);
  }

  public async cancel(ptask: PTask<any, any>): Promise<boolean> {
    if (!this.pendingTasks.has(ptask.key)) throw new Error("Task not found");

    const qItem = this.pendingTasks.get(ptask.key);
    qItem.valid = false;
    qItem.value.rejectCallback(new Error("Task canceled"), "eventual");
    return true;
  }

  public async abort(ptask: PTask<any, any>): Promise<any> {
    // get the item and remove it from currently running
    if (this.currentlyRunning.has(ptask.key))
      return this.abortRunning(this.currentlyRunning.get(ptask.key));

    // check if task is paused
    if (this.pausedTasks.has(ptask.key))
      return this.abortPaused(this.pausedTasks.get(ptask.key));

    throw new Error("Cannot abort a task that is not running");
  }

  private async abortPaused(queueItem: SubscribableQueueItem): Promise<any> {
    this.pausedTasks.delete(queueItem.task.key);
    queueItem.rejectCallback(new Error("Paused task aborted"), "eventual");

    return true;
  }

  private async abortRunning(queueItem: SubscribableQueueItem): Promise<any> {
    this.currentlyRunning.delete(queueItem.task.key);
    try {
      await queueItem.createPromise("immediate");
    } catch {
    } finally {
      queueItem.rejectCallback(new Error("Running task aborted"), "eventual");
    }
  }

  public async pause(ptask: PTask<any, any>): Promise<any> {
    /**
     * Check if the task is currently running
     */
    if (this.currentlyRunning.has(ptask.key)) {
      // TODO: THIS PROBABLY DON'T WORK - Actually might work but cause a memory leak
      const currentlyRunningTask = this.currentlyRunning.get(ptask.key);
      this.pausedTasks.set(currentlyRunningTask.task.key, currentlyRunningTask);

      const result = await currentlyRunningTask.createPromise("immediate");
      this.process();
      return result;
    }

    /**
     * Check if the task hasn't started yet
     */
    if (this.pendingTasks.has(ptask.key)) {
      const qItem = this.pendingTasks.get(ptask.key);
      qItem.valid = false;
      this.pausedTasks.set(ptask.key, this.pendingTasks.get(ptask.key).value);
      this.pendingTasks.delete(ptask.key);

      return null;
    }

    throw new Error("Cannot pause a task that is not running");
  }

  public async resume(ptask: PTask<any, any>): Promise<any> {
    if (!this.pausedTasks.has(ptask.key)) return null;
    
    const pausedItem = this.pausedTasks.get(ptask.key);
    this.pausedTasks.delete(pausedItem.task.key);

    // Add the task to the priority queue
    const qItem = { value: pausedItem, valid: true };
    this.pendingTasks.set(pausedItem.task.key, qItem);
    this.priorityQueue.add(qItem);

    // resume the task
    setImmediate(() => this.process());
  }

  private async process(): Promise<void> {
    const proceedWithNextItem = (curTask: SubscribableQueueItem) => {
      // remove from currently running
      this.currentlyRunning.delete(curTask.task.key);

      this.currentConcurrencyCount--;
      this.process();
    }

    if (this.currentConcurrencyCount <= this.concurrencyLimit && this.priorityQueue.size > 0) {
      this.currentConcurrencyCount++;

      const {value: sqItem, valid} = this.poll();
      this.currentlyRunning.set(sqItem.task.key, sqItem);

      if (!valid) {
        proceedWithNextItem(sqItem);
        return;
      }

      /* Process the item with the given procedure */
      sqItem.task
        .onRun(sqItem.task.args, sqItem.task.execInfo)
        .then((result) => {
          sqItem.resolveCallback(
            result,
            sqItem.task.execInfo.getStatus() === "canceled" ||
              sqItem.task.execInfo.getStatus() === "paused"
              ? "immediate"
              : "eventual"
          );
        })
        .catch((error) => {
          sqItem.rejectCallback(
            error,
            sqItem.task.execInfo.getStatus() === "canceled" ||
              sqItem.task.execInfo.getStatus() === "paused"
              ? "immediate"
              : "eventual"
          );
        })
        .finally(async () => {
          proceedWithNextItem(sqItem);
        });
    }
  }

  static getInstance(queueName: string): ProcessingPriorityQueue {
    if (!ProcessingPriorityQueue.instances.has(queueName)) {
      ProcessingPriorityQueue.instances.set(
        queueName,
        new ProcessingPriorityQueue()
      );
    }

    return ProcessingPriorityQueue.instances.get(queueName);
  }
}
