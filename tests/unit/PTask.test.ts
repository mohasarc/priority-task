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

  it('should through the same error the task throws', (done) => {
    const task = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async () => {
        throw new Error('test error');
      },
    });

    task.run().catch((err) => {
      expect(err.message).toBe('test error');
      done();
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
        if (!execInfo.isPaused()) await iter(++i, nums[i]);
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
        if (!execInfo.isPaused()) await iter(++i, nums[i]);
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
        if (!execInfo.isPaused()) await iter(++i, nums[i]);
      };

      await iter(0, nums[0]);
      return squares;
    };

    const task = new PTask<number[], number[]>({
      args: [1, 2, 3, 4, 5, 6],
      priority: 100,
      onRun: calculateSquares,
      onPause: (args, resSoFar) => {
        if (!resSoFar) return args;
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
    }, 20);
  });

  it('should be able to cancel the task and throw "Task canceled" error with abort option', (done) => {
    const task = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async () => await new Promise((resolve) => setTimeout(resolve, 500))
    });
    
    task.run().catch((err) => {
      expect(err.message).toBe('Task canceled');
      done();
    });

    task.cancel(true);
  });

  it('should be able to cancel the task and throw "Task canceled" error without abort option', (done) => {
    const task = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async () => await new Promise((resolve) => setTimeout(resolve, 500))
    });
    
    task.run().catch((err) => {
      expect(err.message).toBe('Task canceled');
      done();
    });

    task.cancel();
  });

  it('should be able to abort a running task and throw "Running task aborted" error', (done) => {
    const task = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async (args, execInfo) => {
        const iter = async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (!execInfo.isCanceled()) {
            await iter();
          }
        }
  
        await iter();
      },
    });
    
    task.run().catch((err) => {
      expect(err.message).toBe('Running task aborted');
      done();
    });

    setTimeout(() => {
      task.cancel(true);
    }, 200);
  });

  it('should be able to cancel a paused task and throw "Paused task aborted" error', (done) => {
    const task = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async () => await new Promise((resolve) => setTimeout(resolve, 500))
    });
    
    task.run().catch((err) => {
      expect(err.message).toBe('Paused task aborted');
      done();
    });

    task.pause();
    task.cancel(true);
  });

  it('should resolve all the waiting promises after calling run multiple times for the same task', (done) =>{
    const ptask = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async () => await new Promise((resolve) => setTimeout(resolve, 500))
    });

    const res = [];
    const p1 = ptask.run().then(() => res.push(1));
    const p2 = ptask.run().then(() => res.push(2));
    const p3 = ptask.run().then(() => res.push(3));

    Promise.all([p1, p2, p3]).then((res) => {
      expect(res).toEqual([1, 2, 3]);
      done();
    });
  });

  it('should update the priority of a task', (done) => {
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

    task2.setPriority(6);
    task1.setPriority(5);

    Promise.all([p1, p2, p3]).then(() => {
      expect(res).toEqual([2, 1, 3]);
      done();
    });
  });

  it('should accept a function for priority', (done) => {
    // Prepare tasks
    const task1 = new PTask<number, number>({
      priority: () => 1,
      args: 1,
      onRun: async (a: number) => a,
    });

    const task2 = new PTask<number, number>({
      priority: () => 2,
      args: 2,
      onRun: async (a: number) => a,
    });

    const task3 = new PTask<number, number>({
      priority: () => 3,
      args: 3,
      onRun: async (a: number) => a,
    });

    const res = [];
    const p2 = task2.run().then((val) => res.push(val));
    const p1 = task1.run().then((val) => res.push(val));
    const p3 = task3.run().then((val) => res.push(val));

    Promise.all([p1, p2, p3]).then(() => {
      expect(res).toEqual([3, 2, 1]);
      done();
    });
  });

  it('should run onCancel callback after a task is canceled', (done) => {
    const task = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async () => await new Promise((resolve) => setTimeout(resolve, 500)),
      onCancel: () => {
        expect(true).toBe(true);
        done();
      }
    });
    
    task.run().catch((err) => null);
    task.cancel(true);
  });

  // TODO pause multiple times
  it('should not call onPause multiple times if pause was executed multiple times', async () => {
    let pauseCallCount = 0;
    const task = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async () => await new Promise((resolve) => setTimeout(resolve, 500)),
      onPause: () => {pauseCallCount++},
    });

    task.run();
    await task.pause();
    await task.pause();
    await task.pause();
    expect(pauseCallCount).toBe(1);
  });

  it('should allow accessing isCanceled in onRun', (done) => {
    let p1RunCount = 0;
    let p2RunCount = 0;

    const ptask1 = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async (args, execInfo) => {
        const iter = async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (!execInfo.isCanceled()) {
            p1RunCount++;
            await iter();
          }
        }
  
        await iter();
      },
    });

    const ptask2 = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async (args, execInfo) => {
        const iter = async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (!execInfo.isCanceled()) {
            p2RunCount++;
            await iter();
          }
        }
  
        await iter();
      },
    });
    
    ptask1.run().catch((err) => null);
    ptask2.run().catch((err) => null);
    setTimeout(() => {
      ptask1.cancel(true);
    }, 1000);

    setTimeout(() => {
      Promise.all([
        expect(p1RunCount).toBeLessThan(10),
        expect(p2RunCount).toBeGreaterThan(10),
      ]).then(() => {
        ptask2.cancel(true); // so that the test worker can exit
        done()
      });
    }, 3000);
  });

  it('should throw an error when trying to pause a task that is not running', (done) => {
    const ptask = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async () => await new Promise((resolve) => setTimeout(resolve, 500)),
    });

    ptask.pause().catch((err) => {
      expect(err.message).toBe('Cannot pause a task that is not running');
      done();
    });
  });

  it('should throw an error when trying to cancel a task that is not running with abort option', (done) => {
    const ptask = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async () => await new Promise((resolve) => setTimeout(resolve, 500)),
    });

    ptask.cancel(true).then((result) => {
      Promise.all([
        expect(result[0]).toBe(false),
        expect(result[1]).toBe('Task not found'),
      ]).finally(() => done());
    });
  });

  it('should throw an error when trying to cancel a task that is not running without abort option', (done) => {
    const ptask = new PTask<void, void>({
      args: null,
      priority: 1,
      onRun: async () => await new Promise((resolve) => setTimeout(resolve, 500)),
    });

    ptask.cancel().then((result) => {
      Promise.all([
        expect(result[0]).toBe(false),
        expect(result[1]).toBe('Task not found'),
      ]).finally(() => done());
    });
  });
});
