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
  onResume?: () => void;
  onCancel?: () => void;
}

export interface ExecInfo {
  paused: boolean;
}

export class PTask<T, R> {
  private static count = 0;

  key: number = PTask.count++;

  priority: number | (() => number);

  delay: number;

  args: any;

  onRun: (args: T, execInfo?: ExecInfo) => Promise<R>;

  onPause: (args: T, resSoFar: R | null) => T;

  onResume: () => void;

  onCancel: () => void;

  execInfo = {
    paused: false,
  };

  constructor(options: PTaskOptions<T, R>) {
    this.priority = options.priority;
    this.delay = options.delay || 0;
    this.args = options.args;
    this.onRun = options.onRun;
    this.onPause = options.onPause || ((arg: T) => arg);
    this.onResume = options.onResume || (() => {});
    this.onCancel = options.onCancel || (() => {});
  }

  public run(): Promise<R> {
    return ProcessingPriorityQueue.getInstance().enqueue(this);
  }

  public pause(): void {
    ProcessingPriorityQueue.getInstance().pause(this).then((resSoFar) => {
      this.args = this.onPause(this.args, resSoFar);
    });
    this.execInfo.paused = true;
  }
}
