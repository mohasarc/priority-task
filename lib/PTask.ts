import ProcessingPriorityQueue from "./ProcessingPriorityQueue";

interface PTaskOptions<T, R> {
  priority: number | (() => number);
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

export interface ExecInfo {
  isPaused: () => boolean;
  isCanceled: () => boolean;
}

export class PTask<T, R> {
  private static count = 0;

  private _key: number = PTask.count++;

  private _priority: number | (() => number);

  private delay: number;

  private _onRun: (args: T, execInfo?: ExecInfo) => Promise<R>;

  private onPause: (args: T, resSoFar: R | null) => T;

  private onResume: (args: T, resSoFar: R | null) => T;
  
  private onCancel: () => void;
  
  private resultsMerge?: (resSoFar: R | null, newResult: R) => R;
  
  private queueName: string;
  
  private _args: any;
  
  private resSoFar: R | null = null;
  
  private paused = false;
  
  private canceled = false;

  execInfo: ExecInfo = {
    isPaused : () => this.paused,
    isCanceled : () => this.canceled
  };

  constructor(options: PTaskOptions<T, R>) {
    this._priority = options.priority;
    this.delay = options.delay || 0;
    this._args = options.args;
    this._onRun = options.onRun;
    this.onPause = options.onPause || ((arg: T) => arg);
    this.onResume = options.onResume || ((arg: T) => arg);
    this.onCancel = options.onCancel || (() => {});
    this.resultsMerge = options.resultsMerge || ((resSoFar: R | null, newResult: R) => newResult);
    this.queueName = options.queueName || 'default';
  }

  public async run(): Promise<R> {
    const newRes = await ProcessingPriorityQueue.getInstance(this.queueName).enqueue(this);
    return this.resultsMerge(this.resSoFar, newRes);
  }

  public async pause(): Promise<void> {
    if (this.paused) return;

    this.paused = true;
    const newRes = await ProcessingPriorityQueue.getInstance(this.queueName).pause(this);
    this.resSoFar = this.resultsMerge(this.resSoFar, newRes);
    this._args = this.onPause(this.args, this.resSoFar);
  }

  public resume(): void {
    if (!this.paused) return;
  
    this._args = this.onResume(this.args, this.resSoFar);
    this.paused = false;
    ProcessingPriorityQueue.getInstance(this.queueName).resume(this);
  }

  public async cancel({abort}: {abort: boolean} = {abort: false}): Promise<[boolean, string]> {
    if (this.canceled) return [true, 'Already canceled'];

    this.canceled = true;
    let result = true;
    let message = 'Successfully canceled';

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
  
    if (result) this.onCancel();
    return [result, message];
  }

  public set priority(p: number | (() => number)){
    this._priority = p;
    ProcessingPriorityQueue.getInstance(this.queueName).updatePriority(this);
  }

  public get priority(): number | (() => number) {
    return this._priority;
  }

  public get key(): number {
    return this._key;
  }

  public get args(): T {
    return this._args;
  }

  public get onRun(): (args: T, execInfo?: ExecInfo) => Promise<R> {
    return this._onRun;
  }
}
