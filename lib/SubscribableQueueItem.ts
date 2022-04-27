import PTask from "./PTask";

/**
 * A queue item that can be processed by a processing queue.
 * It keeps a list of callbacks that can be called when the item is processed.
 */
export default class SubscribableQueueItem {
  private rejectCallbacks = new Array<Function>();

  private resolveCallbacks = new Array<Function>();

  constructor(public task: PTask<any, any>) {}

  public resolveCallback(result: any) {
    this.resolveCallbacks.forEach((resolveCB) => {
      resolveCB(result);
    });
  }

  public rejectCallback(error: any) {
    this.rejectCallbacks.forEach((rejectCB) => {
      rejectCB(error);
    });
  }

  public createPromise() {
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
    this.subscribe("resolve", resolveCallback);
    this.subscribe("reject", rejectCallback);

    return promise;
  }

  /**
   * Set the callback functions called when the request item gets resolved or rejected
   * @param eventType The type of action to set callback for
   * @param callback The callback fot the action type
   */
  private subscribe(eventType: "resolve" | "reject", callback: Function) {
    switch (eventType) {
      case "resolve":
        this.resolveCallbacks.push(callback);
        break;

      case "reject":
        this.rejectCallbacks.push(callback);
        break;

      default:
        throw new Error(
          "EventType should be one of the following: resolve or reject"
        );
    }
  }
}
