import ProcessingPriorityQueue from "./ProcessingPriorityQueue";

const DEFAULT_QUEUE_NAME = "default";
const DEFAULT_CONCURRENCY_LIMIT = 1;

interface PTaskOptions<T, R> {
  priority: number;
  delay?: number; // ms
  args: T;
  onRun: (args: T, execInfo?: ExecInfo) => Promise<R>;
  /**
   * Will be called when the execution of onRun is stopped based on a pause signal.
   * Used to update the arguments of the task, so that when execution resumes, the new arguments are used.
   * @param args The arguments
   * @param resSoFar The result so far returned from the execution of onRun. Null if the task hasn't yet started.
   */
  onPause?: (args: T, resSoFar: R | null) => T;
  onResume?: (args: T, resSoFar: R | null) => T;
  onCancel?: () => void;
  resultsMerge?: (resSoFar: R | null, newResult: R) => R;
  queueName?: string;
}

type ExecutionStatus =
  | "pending"
  | "running"
  | "paused"
  | "canceled"
  | "completed";

export interface ExecInfo {
  getStatus: () => ExecutionStatus;
}

export class PTask<T, R> {
  private static count = 0;

  private static pTaskLists = new Map<string, Array<PTask<any, any>>>();

  private _key: number = PTask.count++;

  private _priority: number;

  private delay: number;

  private _onRun: (args: T, execInfo?: ExecInfo) => Promise<R>;

  private onPause: (args: T, resSoFar: R | null) => T;

  private onResume: (args: T, resSoFar: R | null) => T;

  private onCancel: () => void;

  private resultsMerge?: (resSoFar: R | null, newResult: R) => R;

  private queueName: string;

  private _args: any;

  private resSoFar: R | null = null;

  private _status: ExecutionStatus = "pending";

  public execInfo: ExecInfo = {
    getStatus: () => this.status,
  };

  constructor(options: PTaskOptions<T, R>) {
    this._priority = options.priority;
    this.delay = options.delay || 0;
    this._args = options.args;
    this._onRun = options.onRun;
    this.onPause = options.onPause || ((arg: T) => arg);
    this.onResume = options.onResume || ((arg: T) => arg);
    this.onCancel = options.onCancel || (() => {});
    this.resultsMerge =
      options.resultsMerge || ((resSoFar: R | null, newResult: R) => newResult);
    this.queueName = options.queueName || DEFAULT_QUEUE_NAME;

    // Add this task to the list of tasks for this queue
    if (!PTask.pTaskLists.has(this.queueName)) {
      PTask.pTaskLists.set(this.queueName, []);
    }

    PTask.pTaskLists.get(this.queueName).push(this);
  }

  public async run(): Promise<R> {
    const newRes = await ProcessingPriorityQueue.getInstance(
      this.queueName
    ).enqueue(this);
    const result = this.resultsMerge(this.resSoFar, newRes);
    this.removeSelfFromQueue();
    this._status = "completed";
    return result;
  }

  public async pause(): Promise<void> {
    if (this.status === "paused") return;

    this._status = "paused";
    const newRes = await ProcessingPriorityQueue.getInstance(
      this.queueName
    ).pause(this);
    this.resSoFar = this.resultsMerge(this.resSoFar, newRes);
    this._args = this.onPause(this.args, this.resSoFar);
  }

  public resume(): void {
    if (this.status !== "paused") return;

    this._status = "pending";
    this._args = this.onResume(this.args, this.resSoFar);
    ProcessingPriorityQueue.getInstance(this.queueName).resume(this);
  }

  public async cancel(
    { abort }: { abort: boolean } = { abort: false }
  ): Promise<[boolean, string]> {
    if (this.status === "canceled") return [true, "Already canceled"];

    const prevStatus = this._status;
    this._status = "canceled";
    let result = true;
    let message = "Successfully canceled";

    if (abort) {
      try {
        await ProcessingPriorityQueue.getInstance(this.queueName).cancel(this);
      } catch (err) {
        try {
          await ProcessingPriorityQueue.getInstance(this.queueName).abort(this);
        } catch {
          result = false;
          message = `${err.message}`;
        }
      }
    } else {
      try {
        await ProcessingPriorityQueue.getInstance(this.queueName).cancel(this);
      } catch (err) {
        result = false;
        message = `${err.message}`;
      }
    }

    if (result) {
      this.onCancel();
    } else {
      this._status = prevStatus;
    }
    return [result, message];
  }

  public set priority(p: number) {
    this._priority = p;
    ProcessingPriorityQueue.getInstance(this.queueName).updatePriority(this);
  }

  public get priority(): number {
    return this._priority;
  }

  public get key(): number {
    return this._key;
  }

  public get args(): T {
    return this._args;
  }

  public get onRun(): (args: T, execInfo?: ExecInfo) => Promise<R> {
    return (args: T, execInfo?: ExecInfo) => {
      this._status = "running";
      return this._onRun(args, execInfo);
    };
  }

  public get status(): ExecutionStatus {
    return this._status;
  }

  private removeSelfFromQueue(): void {
    PTask.pTaskLists
      .get(this.queueName)
      .splice(PTask.pTaskLists.get(this.queueName).indexOf(this), 1);
  }

  public static setConcurrencyLimit(limit: number, queueName: string = DEFAULT_QUEUE_NAME): void {
    ProcessingPriorityQueue.getInstance(queueName).setConcurrencyLimit(limit);
  }

  public static getAllPTasks(queueName?: string): Array<PTask<any, any>> {
    if (!queueName) {
      return PTask.pTaskLists.get(DEFAULT_QUEUE_NAME)
        ? [...PTask.pTaskLists.get(DEFAULT_QUEUE_NAME)]
        : []
    }

    return PTask.pTaskLists.get(queueName) ? [...PTask.pTaskLists.get(queueName)] : [];
  }
}
