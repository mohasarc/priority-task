import FastPriorityQueue from "fastpriorityqueue";
import { PTask } from "./PTask";
import SubscribableQueueItem from "./SubscribableQueueItem";

/**
 * Singleton class that manages a queue of tasks.
 */
export default class ProcessingPriorityQueue {
  /**
   * A map of all the instances of the queue.
   */
  private static instances = new Map<string, ProcessingPriorityQueue>();

  /**
   * This map is used to keep track of the tasks waiting for execution.
   */
  private existingRequestsMap = new Map<number, boolean>();

  /**
   * This map is used to keep track of the paused tasks.
   */
  private isPaused = new Map<number, boolean>();

  /**
   * Hols the currently paused tasks.
   */
  private paused = new Array<SubscribableQueueItem>();
  
  /**
   * Holds a queue of tasks waiting for execution.
   */
  private priorityQueue: FastPriorityQueue<SubscribableQueueItem>;

  /**
   * Holds the currently running tasks.
   */
  private currentlyRunning = new Array<SubscribableQueueItem>();

  private constructor(private concurrencyCount: number = 1) {
    this.priorityQueue = new FastPriorityQueue((a, b) => {
      const aPriotiy =
        typeof a.task.priority === "function"
          ? a.task.priority()
          : a.task.priority;
      const bPriotiy =
        typeof b.task.priority === "function"
          ? b.task.priority()
          : b.task.priority;

      return aPriotiy > bPriotiy;
    });
  }

  public async enqueue(ptask: PTask<any, any>): Promise<any> {
    let subscribableItem = this.getItem(ptask.key);

    if (!subscribableItem) {
      subscribableItem = new SubscribableQueueItem(ptask);
      this.existingRequestsMap.set(ptask.key, true);
      this.priorityQueue.add(subscribableItem);
    }

    const promise = subscribableItem.createPromise();
    setImmediate(() => {
      this.process();
    });

    return promise;
  }

  private existInQueue(key: number): boolean {
    return (
      this.existingRequestsMap.has(key) && this.existingRequestsMap.get(key)
    );
  }

  private getItem(key: number): SubscribableQueueItem {
    if (!this.existInQueue(key)) return null;

    const item = this.priorityQueue.removeOne(
      (subscribableQueueItem: SubscribableQueueItem) => {
        return subscribableQueueItem.task.key === key;
      }
    );

    this.priorityQueue.add(item);
    return item;
  }

  private popItem(): SubscribableQueueItem {
    const item = this.priorityQueue.poll();
    this.existingRequestsMap.set(item.task.key, false);

    return item;
  }

  public updatePriority(ptask: PTask<any, any>): void {
    const comparisonFunction = (item: SubscribableQueueItem) =>
      item.task.key === ptask.key;
    const queueItemTemp = this.priorityQueue.removeOne(comparisonFunction);
    if (queueItemTemp) this.priorityQueue.add(queueItemTemp);
  }

  public async cancel(ptask: PTask<any, any>): Promise<boolean> {
    const item = this.priorityQueue.removeOne((item) => item.task === ptask);
    if (!item) throw new Error('Task not found');

    this.existingRequestsMap.set(item.task.key, false);
    item.rejectCallback(new Error('Task canceled'), 'eventual');
    return true;
  }

  public async abort(ptask: PTask<any, any>): Promise<any> {
    // get the item and remove it from currently running
    const currentlyRunningItem = this.currentlyRunning.find(item => item.task === ptask);
    if (currentlyRunningItem) return this.abortRunning(currentlyRunningItem);
    
    // check if task is paused
    const pausedItem = this.paused.find(item => item.task === ptask);
    if (pausedItem) return this.abortPaused(pausedItem);

    throw new Error("Cannot abort a task that is not running");
  }

  private async abortPaused(queueItem: SubscribableQueueItem): Promise<any> {
    this.paused.splice(this.paused.indexOf(queueItem), 1);
    this.isPaused.set(queueItem.task.key, false);
    queueItem.rejectCallback(new Error('Paused task aborted'), 'eventual');

    return true;
  }

  private async abortRunning(queueItem: SubscribableQueueItem): Promise<any> {
    this.currentlyRunning.splice(this.currentlyRunning.indexOf(queueItem), 1);
    try {
      await queueItem.createPromise('immediate');
    } catch {}
    finally {
      queueItem.rejectCallback(new Error('Running task aborted'), 'eventual');
    }
  }

  public async pause(ptask: PTask<any, any>): Promise<any> {
    /**
     * Check if the task is currently running
     */
    const currentlyRunningItem = this.currentlyRunning.find(
      (item) => item.task === ptask
    );

    if (currentlyRunningItem) {
      this.paused.push(currentlyRunningItem);
      this.isPaused.set(currentlyRunningItem.task.key, true);

      const result = await currentlyRunningItem.createPromise("immediate");
      this.process();
      return result;
    }

    /**
     * Check if the task hasn't started yet
     */
    const queueItem = this.priorityQueue.removeOne(
      (item: SubscribableQueueItem) => item.task === ptask
    );

    if (queueItem) {
      this.existingRequestsMap.set(queueItem.task.key, false);
      this.paused.push(queueItem);
      this.isPaused.set(queueItem.task.key, true);

      return null;
    }

    throw new Error("Cannot pause a task that is not running");
  }

  public async resume(ptask: PTask<any, any>): Promise<any> {
    // find the task in the paused queue
    const pausedItem = this.paused.find((item) => item.task === ptask);

    // if the task is not paused, return null
    if (!pausedItem) return null;

    // remove the task from the paused queue
    this.paused = this.paused.filter((item) => item !== pausedItem);
    this.isPaused.set(pausedItem.task.key, false);

    // add the task to the priority queue
    this.priorityQueue.add(pausedItem);
    this.existingRequestsMap.set(pausedItem.task.key, true);

    // resume the task
    setImmediate(() => this.process());
  }

  private async process(): Promise<void> {
    if (this.concurrencyCount > 0 && this.priorityQueue.size > 0) {
      this.concurrencyCount--;

      const item = this.popItem();
      this.currentlyRunning.push(item);
      /* Process the item with the given procedure */
      item.task
        .onRun(item.task.args, item.task.execInfo)
        .then((result) => {
          item.resolveCallback(result, item.task.execInfo.isCanceled() || item.task.execInfo.isPaused() ? 'immediate' : 'eventual');
        })
        .catch((error) => {
          item.rejectCallback(error, item.task.execInfo.isCanceled() || item.task.execInfo.isPaused() ? 'immediate' : 'eventual');
        })
        .finally(async () => {
          // remove from currently running
          this.currentlyRunning = this.currentlyRunning.filter(
            (item) => item !== item
          );

          this.concurrencyCount++;
          this.process();
        });
    }
  }

  static getInstance(queueName: string): ProcessingPriorityQueue {
    if (!ProcessingPriorityQueue.instances.has(queueName)) {
      ProcessingPriorityQueue.instances.set(queueName, new ProcessingPriorityQueue(1));
    }

    return ProcessingPriorityQueue.instances.get(queueName);
  }
}
