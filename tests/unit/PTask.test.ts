/* eslint-disable no-undef */
import { PTask, ExecInfo } from "../../lib";

describe("PriorityTask", () => {
  it("should be instantiatable", () => {
    const task = new PTask<number, number>({
      priority: 1,
      args: 5,
      onRun: async (a: number) => a + 4,
    });

    expect(task).toBeInstanceOf(PTask);
  });

  it("should run the task", () => {
    const task = new PTask<number, number>({
      priority: 1,
      args: 5,
      onRun: async (a: number) => a + 4,
    });

    task.run().then((val) => {
      expect(val).toEqual(9);
    });
  });

  it("should run the tasks in order of priority", () => {
    // Prepare tasks
    const task1 = new PTask<number, number>({
      priority: 1,
      args: 1,
      onRun: async (a: number) => a,
    });

    const task2 = new PTask<number, number>({
      priority: 2,
      args: 2,
      onRun: async (a: number) => a,
    });

    const task3 = new PTask<number, number>({
      priority: 3,
      args: 3,
      onRun: async (a: number) => a,
    });

    const res = [];
    const p2 = task2.run().then((val) => res.push(val));
    const p1 = task1.run().then((val) => res.push(val));
    const p3 = task3.run().then((val) => res.push(val));

    Promise.all([p1, p2, p3]).then(() => {
      expect(res).toEqual([3, 2, 1]);
    });
  });

  it("should pause the task", (done) => {
    const runWithDelay = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return 1;
    };

    const task = new PTask<void, number>({
      args: null,
      priority: 1,
      onRun: runWithDelay,
    });

    let finished = false;
    task.run().then(() => (finished = true));
    task.pause();
    setTimeout(() => {
      expect(finished).toBe(false);
      done();
    }, 2000);
  });

  it("should run onPause when task is paused", (done) => {
    const calculateSquares = async (nums: number[], execInfo: ExecInfo) => {
      const squares = [];
      const iter = async (i: number, num: number) => {
        if (i === nums.length) return;

        squares.push(num * num);
        await new Promise(r => setTimeout(r, 1000));
        if (!execInfo.paused) await iter(++i, nums[i]);
      };

      await iter(0, nums[0]);
      return squares;
    };

    const task = new PTask<number[], number[]>({
      args: [1, 2, 3, 4, 5],
      priority: 1,
      onRun: calculateSquares,
      onPause: (args: number[], resSoFar: number[]) => {
        // run will not return until resume or cancel // modifies the args for next run
        expect(resSoFar).toEqual([1, 4, 9]);
        done();
        return args.slice(resSoFar.length);
      },
    });

    task.run();
    setTimeout(async () => {
      task.pause();
    }, 2500);
  });

  it('should pause the task even if it hasn\'t yet started', (done) => {
    const task1 = new PTask<void, void>({
      args: null,
      priority: 100,
      onRun: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      },
    });

    const task2 = new PTask<void, void>({
      args: null,
      priority: 200,
      onRun: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      },
    });

    let finished = false;
    task1.run().then(() => finished = true); // will run second
    task2.run(); // will run first

    task1.pause();
    setTimeout(() => {
      expect(finished).toBe(false);
      done();
    }, 2000);
  });

  it('should run onPause when item that hasn\'t yet started is pause', (done) => {
    const calculateSquares = async (nums: number[], execInfo: ExecInfo) => {
      const squares = [];
      const iter = async (i: number, num: number) => {
        if (i === nums.length) return;

        squares.push(num * num);
        await new Promise(r => setTimeout(r, 1000));
        if (!execInfo.paused) await iter(++i, nums[i]);
      };

      await iter(0, nums[0]);
      return squares;
    };

    const task1 = new PTask<number[], number[]>({
      args: [1, 2, 3, 4, 5, 6],
      priority: 100,
      onRun: calculateSquares,
      onPause: (args, resSoFar) => {
        expect(resSoFar).toEqual(null);
        done();
        return args;
      }
    });

    const task2 = new PTask<void, void>({
      args: null,
      priority: 200,
      onRun: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      },
    });

    task1.run();
    task2.run();
    task1.pause();
  });

  it('should be able to resume paused task', (done) => {
    const calculateSquares = async (nums: number[], execInfo: ExecInfo) => {
      const squares = [];
      const iter = async (i: number, num: number) => {
        if (i === nums.length) return;

        squares.push(num * num);
        await new Promise(r => setTimeout(r, 20));
        if (!execInfo.paused) await iter(++i, nums[i]);
      };

      await iter(0, nums[0]);
      return squares;
    };

    const task = new PTask<number[], number[]>({
      args: [1, 2, 3, 4, 5, 6],
      priority: 100,
      onRun: calculateSquares,
      onPause: (args, resSoFar) => {
        return args.slice(resSoFar.length);
      },
      resultsMerge: (resSoFar, newRes) => {
        if (!resSoFar) return newRes;
        return resSoFar.concat(newRes);
      }
    });

    task.run().then((res) => {
      expect(res).toEqual([1, 4, 9, 16, 25, 36]);
      done();
    });
    
    setTimeout(async () => {
      await task.pause();
      task.resume();
    }, 600);
  });
});
