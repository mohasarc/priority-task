import { PTask } from "./PTask";

type ListenerType = "eventual" | "immediate";

/**
 * A queue item that can be processed by a processing queue.
 * It keeps a list of callbacks that can be called when the item is processed.
 */
export default class SubscribableQueueItem {
  private rejectCallbacks = {
    eventual: new Array<Function>(),
    immediate: new Array<Function>(),
  };

  private resolveCallbacks = {
    eventual: new Array<Function>(),
    immediate: new Array<Function>(),
  };

  paused = false;

  constructor(public task: PTask<any, any>) {}

  public resolveCallback(result: any) {
    let listenerType = this.paused ? "immediate" : "eventual";
    this.resolveCallbacks[listenerType].forEach((resolveCB: Function) => {
      resolveCB(result);
    });
  }

  public rejectCallback(error: any) {
    let listenerType = this.paused ? "immediate" : "eventual";
    this.rejectCallbacks[listenerType].forEach((rejectCB: Function) => {
      rejectCB(error);
    });
  }

  public createPromise(type: ListenerType = "eventual"): Promise<any> {
    // Prepare the promise
    let resolveCallback: Function;
    let rejectCallback: Function;
    const promise = new Promise((resolve, reject) => {
      resolveCallback = async (result) => {
        resolve(result);
      };

      rejectCallback = (error: Error) => {
        reject(error);
      };
    });

    // Prepare queue item
    this.subscribe("resolve", type, resolveCallback);
    this.subscribe("reject", type, rejectCallback);

    return promise;
  }

  /**
   * Set the callback functions called when the request item gets resolved or rejected
   * @param eventType The type of action to set callback for
   * @param callback The callback fot the action type
   */
  private subscribe(eventType: "resolve" | "reject", listenerType: ListenerType, callback: Function) {
    switch (eventType) {
      case "resolve":
        this.resolveCallbacks[listenerType].push(callback);
        break;

      case "reject":
        this.rejectCallbacks[listenerType].push(callback);
        break;

      default:
        throw new Error(
          "EventType should be one of the following: resolve or reject"
        );
    }
  }
}
