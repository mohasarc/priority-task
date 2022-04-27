interface PTaskOptions<T, R> {
    priority: number | (() => number);
    delay: number; // ms
    args: T;
    procedure: (args: T) => R;
    pauseAction: () => void;
    resumeAction: () => void;
    cancelAction: () => void;
}

export default class PTask <T, R> {
  priority: number | (() => number);

  delay: number;

  args: any;

  procedure: (args: T) => R;

  pauseAction: () => void;

  resumeAction: () => void;

  cancelAction: () => void;

  constructor(options: PTaskOptions<T, R>) {
    this.priority = options.priority;
    this.delay = options.delay;
    this.args = options.args;
    this.procedure = options.procedure;
    this.pauseAction = options.pauseAction;
    this.resumeAction = options.resumeAction;
    this.cancelAction = options.cancelAction;
  }
}
