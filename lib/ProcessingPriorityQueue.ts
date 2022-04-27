import FastPriorityQueue from "fastpriorityqueue";
import PTask from "./PTask";
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
    const comparisonFunction = (
      actionableQueueItem: SubscribableQueueItem
    ) => actionableQueueItem.task.key === key;
    const queueItemTemp = this.priorityQueue.removeOne(comparisonFunction);

    if (queueItemTemp) {
      queueItemTemp.task.priority = priority;
      this.priorityQueue.add(queueItemTemp);
    }
  }

  public cancel(key: number): void {
    const comparisonFunction = <P>(
      actionableQueueItem: SubscribableQueueItem
    ) => actionableQueueItem.task.key === key;
    const queueItemTemp = this.priorityQueue.removeOne(comparisonFunction);

    if (queueItemTemp) {
      this.existingRequestsMap.set(key, false);
    }
  }

  private async process(): Promise<void> {
    if (this.concurrencyCount > 0 && this.priorityQueue.size > 0) {
      this.concurrencyCount--;

      const item = this.popItem();
      /* Process the item with the given procedure */
      item.task
        .onRun(item.task.args)
        .then((result) => {
          item.resolveCallback(result);
        })
        .catch((error) => {
          item.rejectCallback(error);
        })
        .finally(async () => {
          this.concurrencyCount++;
          this.process();
        });
    }
  }

  static getInstance(): ProcessingPriorityQueue {
    return this.instance;
  }
}
