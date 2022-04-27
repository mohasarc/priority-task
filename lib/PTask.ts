import ProcessingPriorityQueue from "./ProcessingPriorityQueue";

interface PTaskOptions<T, R> {
  priority: number | (() => number);
  delay?: number; // ms
  args: T;
  onRun: (args: T) => Promise<R>;
  onPause?: () => void;
  onResume?: () => void;
  onCancel?: () => void;
}

export default class PTask<T, R> {
  private static count = 0;

  key: number = PTask.count++;

  priority: number | (() => number);

  delay: number;

  args: any;

  onRun: (args: T) => Promise<R>;

  onPause: () => void;

  onResume: () => void;

  onCancel: () => void;

  constructor(options: PTaskOptions<T, R>) {
    this.priority = options.priority;
    this.delay = options.delay || 0;
    this.args = options.args;
    this.onRun = options.onRun;
    this.onPause = options.onPause || (() => {});
    this.onResume = options.onResume || (() => {});
    this.onCancel = options.onCancel || (() => {});
  }

  run(): Promise<R> {
    return ProcessingPriorityQueue.getInstance().enqueue(this);
  }
}
