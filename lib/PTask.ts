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
}

export interface ExecInfo {
  isPaused: () => boolean;
  isCanceled: () => boolean;
}

export class PTask<T, R> {
  private static count = 0;

  key: number = PTask.count++;

  priority: number | (() => number);

  delay: number;

  args: any;

  private resSoFar: R | null = null;

  onRun: (args: T, execInfo?: ExecInfo) => Promise<R>;

  onPause: (args: T, resSoFar: R | null) => T;

  onResume: (args: T, resSoFar: R | null) => T;

  onCancel: () => void;

  resultsMerge?: (resSoFar: R | null, newResult: R) => R;

  paused = false;

  canceled = false;

  execInfo: ExecInfo = {
    isPaused : () => this.paused,
    isCanceled : () => this.canceled
  };

  constructor(options: PTaskOptions<T, R>) {
    this.priority = options.priority;
    this.delay = options.delay || 0;
    this.args = options.args;
    this.onRun = options.onRun;
    this.onPause = options.onPause || ((arg: T) => arg);
    this.onResume = options.onResume || ((arg: T) => arg);
    this.onCancel = options.onCancel || (() => {});
    this.resultsMerge = options.resultsMerge || ((resSoFar: R | null, newResult: R) => newResult);
  }

  public async run(): Promise<R> {
    const newRes = await ProcessingPriorityQueue.getInstance().enqueue(this);
    return this.resultsMerge(this.resSoFar, newRes);
  }

  public async pause(): Promise<void> {
    if (this.paused) return;

    this.paused = true;
    const newRes = await ProcessingPriorityQueue.getInstance().pause(this);
    this.resSoFar = this.resultsMerge(this.resSoFar, newRes);
    this.args = this.onPause(this.args, this.resSoFar);
  }

  public resume(): void {
    if (!this.paused) return;
  
    this.args = this.onResume(this.args, this.resSoFar);
    this.paused = false;
    ProcessingPriorityQueue.getInstance().resume(this);
  }

  public async cancel({abort}: {abort: boolean} = {abort: false}): Promise<[boolean, string]> {
    if (this.canceled) return [true, 'Already canceled'];

    this.canceled = true;
    let result = true;
    let message = 'Successfully canceled';

    if (abort) {
      try {
        await ProcessingPriorityQueue.getInstance().cancel(this);
      } catch (err) {
        try {
          await ProcessingPriorityQueue.getInstance().abort(this);
        } catch {
          result = false;
          message = `${err.message}`;
        }
      }
    } else {
      try {
        await ProcessingPriorityQueue.getInstance().cancel(this);
      } catch (err) {
        result = false;
        message = `${err.message}`;
      }
    }
  
    if (result) this.onCancel();
    return [result, message];
  }

  public setPriority(p: number | (() => number)){
    this.priority = p;
    ProcessingPriorityQueue.getInstance().updatePriority(this);
  }
}
