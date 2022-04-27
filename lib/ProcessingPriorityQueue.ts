import FastPriorityQueue from "fastpriorityqueue";
import { PTask } from "./PTask";
import SubscribableQueueItem from "./SubscribableQueueItem";

/**
 * Singleton class that manages a queue of tasks.
 */
export default class ProcessingPriorityQueue {
  /**
   * TODO add comments
   */
  private static instance = new ProcessingPriorityQueue();

  /**
   * TODO add comments
   */
  private existingRequestsMap: Map<number, boolean>;

  /**
   * TODO add comments
   */
  private priorityQueue: FastPriorityQueue<SubscribableQueueItem>;

  private currentlyRunning = new Array<SubscribableQueueItem>();

  private paused = new Array<SubscribableQueueItem>();

  private constructor(private concurrencyCount: number = 1) {
    this.existingRequestsMap = new Map<number, boolean>();

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

  public async prioritize(key: number, priority: number): Promise<void> {
    const comparisonFunction = (item: SubscribableQueueItem) =>
      item.task.key === key;
    const queueItemTemp = this.priorityQueue.removeOne(comparisonFunction);

    if (queueItemTemp) {
      queueItemTemp.task.priority = priority;
      this.priorityQueue.add(queueItemTemp);
    }
  }

  public cancel(key: number): void {
    const comparisonFunction = <P>(item: SubscribableQueueItem) =>
      item.task.key === key;
    const queueItemTemp = this.priorityQueue.removeOne(comparisonFunction);

    if (queueItemTemp) {
      this.existingRequestsMap.set(key, false);
    }
  }

  public async pause(ptask: PTask<any, any>): Promise<any> {
    /**
     * Check if the task was already paused
     */
    if (this.paused.find((item) => item.task === ptask)) {
      return null;
    }

    /**
     * Check if the task is currently running
     */
    const currentlyRunningItem = this.currentlyRunning.find(
      (item) => item.task === ptask
    );

    if (currentlyRunningItem) {
      currentlyRunningItem.paused = true;
      this.paused.push(currentlyRunningItem);
      return currentlyRunningItem.createPromise('immediate');
    }

    /**
     * Check if the task hasn't started yet
     */
    const queueItem = this.priorityQueue.removeOne(
      (item: SubscribableQueueItem) => item.task === ptask
    );

    if (queueItem) {
      queueItem.paused = true;
      this.paused.push(queueItem);
      return null;
    }
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
          item.resolveCallback(result);
        })
        .catch((error) => {
          item.rejectCallback(error);
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

  static getInstance(): ProcessingPriorityQueue {
    return this.instance;
  }
}
