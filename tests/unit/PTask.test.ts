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

  it("should through the same error the task throws", (done) => {
    const task = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async () => {
        throw new Error("test error");
      },
    });

    task.run().catch((err) => {
      expect(err.message).toBe("test error");
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

    const res: number[] = [];
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
      args: undefined,
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

  it("should resume the execution of other tasks when one task is paused", (done) => {
    const runWithDelay = async () => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      return 1;
    };

    const task1 = new PTask<void, number>({
      args: undefined,
      priority: 2,
      onRun: runWithDelay,
    });

    const task2 = new PTask<void, number>({
      args: undefined,
      priority: 1,
      onRun: runWithDelay,
    });

    task1.run();
    task2.run().then((res) => {
      expect(res).toBe(1);
      done();
    });
    task1.pause();
  });

  it("should run onPause when task is paused", (done) => {
    const calculateSquares = async (nums: number[], execInfo?: ExecInfo) => {
      const squares: number[] = [];
      const iter = async (i: number, num: number) => {
        if (i === nums.length) return;

        squares.push(num * num);
        await new Promise((r) => setTimeout(r, 1000));
        if (execInfo?.getStatus() !== "paused") await iter(++i, nums[i]);
      };

      await iter(0, nums[0]);
      return squares;
    };

    const task = new PTask<number[], number[]>({
      args: [1, 2, 3, 4, 5],
      priority: 1,
      onRun: calculateSquares,
      onPause: (args: number[], resSoFar: number[] | null) => {
        // run will not return until resume or cancel // modifies the args for next run
        expect(resSoFar).toEqual([1, 4, 9]);
        done();
        return args.slice(resSoFar?.length);
      },
    });

    task.run();
    setTimeout(async () => {
      task.pause();
    }, 2500);
  });

  it("should pause the task even if it hasn't yet started", (done) => {
    const task1 = new PTask<void, void>({
      args: undefined,
      priority: 100,
      onRun: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      },
    });

    const task2 = new PTask<void, void>({
      args: undefined,
      priority: 200,
      onRun: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      },
    });

    let finished = false;
    task1.run().then(() => (finished = true)); // will run second
    task2.run(); // will run first

    task1.pause();
    setTimeout(() => {
      expect(finished).toBe(false);
      done();
    }, 2000);
  });

  it("should run onPause when item that hasn't yet started is pause", (done) => {
    const calculateSquares = async (nums: number[], execInfo?: ExecInfo) => {
      const squares: number[] = [];
      const iter = async (i: number, num: number) => {
        if (i === nums.length) return;

        squares.push(num * num);
        await new Promise((r) => setTimeout(r, 1000));
        if (execInfo?.getStatus() !== "paused") await iter(++i, nums[i]);
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
      },
    });

    const task2 = new PTask<void, void>({
      args: undefined,
      priority: 200,
      onRun: async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
      },
    });

    task1.run();
    task2.run();
    task1.pause();
  });

  it("should be able to resume paused task", (done) => {
    const calculateSquares = async (nums: number[], execInfo?: ExecInfo) => {
      const squares: number[] = [];
      const iter = async (i: number, num: number) => {
        if (i === nums.length) return;

        squares.push(num * num);
        await new Promise((r) => setTimeout(r, 20));
        if (execInfo?.getStatus() !== "paused") await iter(++i, nums[i]);
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
      },
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
      args: undefined,
      priority: 1,
      onRun: async () =>
        await new Promise((resolve) => setTimeout(resolve, 500)),
    });

    task.run().catch((err) => {
      expect(err.message).toBe("Task canceled");
      done();
    });

    task.cancel({ abort: true });
  });

  it('should be able to cancel the task and throw "Task canceled" error without abort option', (done) => {
    const task = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async () =>
        await new Promise((resolve) => setTimeout(resolve, 500)),
    });

    task.run().catch((err) => {
      expect(err.message).toBe("Task canceled");
      done();
    });

    task.cancel();
  });

  it('should be able to abort a running task and throw "Running task aborted" error', (done) => {
    const task = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async (args, execInfo) => {
        const iter = async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (execInfo?.getStatus() !== "canceled") {
            await iter();
          }
        };

        await iter();
      },
    });

    task.run().catch((err) => {
      expect(err.message).toBe("Running task aborted");
      done();
    });

    setTimeout(() => {
      task.cancel({ abort: true });
    }, 200);
  });

  it('should be able to cancel a paused task and throw "Paused task aborted" error', (done) => {
    const task = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async () =>
        await new Promise((resolve) => setTimeout(resolve, 500)),
    });

    task.run().catch((err) => {
      expect(err.message).toBe("Paused task aborted");
      done();
    });

    task.pause();
    task.cancel({ abort: true });
  });

  it("should resolve all the waiting promises after calling run multiple times for the same task", (done) => {
    const ptask = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async () =>
        await new Promise((resolve) => setTimeout(resolve, 500)),
    });

    const res: number[] = [];
    const p1 = ptask.run().then(() => res.push(1));
    const p2 = ptask.run().then(() => res.push(2));
    const p3 = ptask.run().then(() => res.push(3));

    Promise.all([p1, p2, p3]).then((res) => {
      expect(res).toEqual([1, 2, 3]);
      done();
    });
  });

  it("should update the priority of a task", (done) => {
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

    const res: number[] = [];
    const p2 = task2.run().then((val) => res.push(val));
    const p1 = task1.run().then((val) => res.push(val));
    const p3 = task3.run().then((val) => res.push(val));

    task2.priority = 6;
    task1.priority = 5;

    Promise.all([p1, p2, p3]).then(() => {
      expect(res).toEqual([2, 1, 3]);
      done();
    });
  });

  it("should update priority after tasks started running", (done) => {
    const priorityMap = new Map<number, number>();

    const delayedOnRun = async (a: number) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return a;
    };

    // Prepare tasks
    const task1 = new PTask<number, number>({
      priority: 1,
      args: 1,
      onRun: delayedOnRun,
    });

    const task2 = new PTask<number, number>({
      priority: 2,
      args: 2,
      onRun: delayedOnRun,
    });

    const task3 = new PTask<number, number>({
      priority: 3,
      args: 3,
      onRun: delayedOnRun,
    });

    const task4 = new PTask<number, number>({
      priority: 4,
      args: 4,
      onRun: delayedOnRun,
    });

    const res: number[] = [];
    const p2 = task2.run().then((val) => res.push(val));
    const p1 = task1.run().then((val) => res.push(val));
    const p3 = task3.run().then((val) => res.push(val));
    const p4 = task4.run().then((val) => res.push(val));

    task1.priority = 4;
    task2.priority = 3;
    task3.priority = 2;
    task4.priority = 1;

    Promise.all([p1, p2, p3, p4]).then(() => {
      expect(res).toEqual([1, 2, 3, 4]);
      done();
    });
  });

  it("should run onCancel callback after a task is canceled", (done) => {
    const task = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async () =>
        await new Promise((resolve) => setTimeout(resolve, 500)),
      onCancel: () => {
        expect(true).toBe(true);
        done();
      },
    });

    task.run().catch((err) => null);
    task.cancel({ abort: true });
  });

  // TODO pause multiple times
  it("should not call onPause multiple times if pause was executed multiple times", async () => {
    let pauseCallCount = 0;
    const task = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async () =>
        await new Promise((resolve) => setTimeout(resolve, 500)),
      onPause: () => {
        pauseCallCount++;
      },
    });

    task.run();
    await task.pause();
    await task.pause();
    await task.pause();
    expect(pauseCallCount).toBe(1);
  });

  it("should allow accessing isCanceled in onRun", (done) => {
    let p1RunCount = 0;
    let p2RunCount = 0;

    const ptask1 = new PTask<void, void>({
      args: undefined,
      priority: 2,
      onRun: async (args, execInfo) => {
        const iter = async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (execInfo?.getStatus() !== "canceled") {
            p1RunCount++;
            await iter();
          }
        };

        await iter();
      },
    });

    const ptask2 = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async (args, execInfo) => {
        const iter = async () => {
          await new Promise((resolve) => setTimeout(resolve, 100));
          if (execInfo?.getStatus() !== "canceled") {
            p2RunCount++;
            await iter();
          }
        };

        await iter();
      },
    });

    ptask1.run().catch((err) => null);
    ptask2.run().catch((err) => null);
    setTimeout(() => {
      ptask1.cancel({ abort: true });
    }, 1000);

    setTimeout(() => {
      Promise.all([
        expect(p1RunCount).toBeLessThan(10),
        expect(p2RunCount).toBeGreaterThan(10),
      ]).then(() => {
        ptask2.cancel({ abort: true }); // so that the test worker can exit
        done();
      });
    }, 3000);
  });

  it("should throw an error when trying to pause a task that is not running", (done) => {
    const ptask = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async () =>
        await new Promise((resolve) => setTimeout(resolve, 500)),
    });

    ptask.pause().catch((err) => {
      expect(err.message).toBe("Cannot pause a task that is not running");
      done();
    });
  });

  it("should throw an error when trying to cancel a task that is not running with abort option", (done) => {
    const ptask = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async () =>
        await new Promise((resolve) => setTimeout(resolve, 500)),
    });

    ptask.cancel({ abort: true }).then((result) => {
      Promise.all([
        expect(result[0]).toBe(false),
        expect(result[1]).toBe("Task not found"),
      ]).finally(() => done());
    });
  });

  it("should throw an error when trying to cancel a task that is not running without abort option", (done) => {
    const ptask = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async () =>
        await new Promise((resolve) => setTimeout(resolve, 500)),
    });

    ptask.cancel().then((result) => {
      Promise.all([
        expect(result[0]).toBe(false),
        expect(result[1]).toBe("Task not found"),
      ]).finally(() => done());
    });
  });

  it("should not crash if run is called after pausing", (done) => {
    const ptask = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async () =>
        await new Promise((resolve) => setTimeout(resolve, 500)),
    });

    ptask.run();
    ptask.pause();
    ptask.run().then(() => done());
    ptask.resume();
  });

  it("should provide the current status of the task", (done) => {
    const calculateSquares = async (nums: number[], execInfo?: ExecInfo) => {
      const squares: number[] = [];
      const iter = async (i: number, num: number) => {
        if (i === nums.length) return;

        squares.push(num * num);
        await new Promise((r) => setTimeout(r, 1000));
        if (
          execInfo?.getStatus() !== "paused" &&
          execInfo?.getStatus() !== "canceled"
        )
          await iter(++i, nums[i]);
      };

      await iter(0, nums[0]);
      return squares;
    };

    const ptask = new PTask<number[], number[]>({
      args: [1, 2, 3, 4],
      priority: 1,
      onRun: (args: number[], execInfo?: ExecInfo) => {
        expect(ptask.status).toBe("running");
        return calculateSquares(args, execInfo);
      },
    });

    expect(ptask.status).toBe("pending");
    ptask.run().catch(() => null);
    setTimeout(() => {
      ptask.pause().then(() => {
        expect(ptask.status).toBe("paused");

        ptask.resume();
        expect(ptask.status).toBe("pending");

        setTimeout(() => {
          expect(ptask.status).toBe("running");

          ptask.cancel({ abort: true }).then(() => {
            expect(ptask.status).toBe("canceled");
            done();
          });
        }, 200);
      });
    }, 400);
  });

  it("should provide the list of all tasks in a queue", (done) => {
    // Prepare tasks
    const rickTask1 = new PTask<number, number>({
      priority: 1,
      args: 1,
      onRun: async (a: number) => a,
      queueName: "rick",
    });

    const mortyTask1 = new PTask<number, number>({
      priority: 2,
      args: 2,
      onRun: async (a: number) => a,
      queueName: "morty",
    });

    const rickTask2 = new PTask<number, number>({
      priority: 3,
      args: 3,
      onRun: async (a: number) => a,
      queueName: "rick",
    });

    const p2 = rickTask1.run();
    const p1 = rickTask2.run();
    const p3 = mortyTask1.run();

    const rickTasks = PTask.getAllPTasks("rick");
    const mortyTasks = PTask.getAllPTasks("morty");

    expect(rickTasks.sort()).toEqual([rickTask1, rickTask2].sort());
    expect(mortyTasks).toEqual([mortyTask1]);

    Promise.all([p1, p2, p3]).then(() => {
      done();
    });
  });

  it("should be removed from the queue when complete", (done) => {
    const ptask = new PTask<void, void>({
      args: undefined,
      priority: 1,
      onRun: async () =>
        await new Promise((resolve) => setTimeout(resolve, 500)),
      queueName: "krombopulos",
    });

    ptask.run().then(() => {
      expect(PTask.getAllPTasks("krombopulos").length).toBe(0);
      done();
    });
    expect(PTask.getAllPTasks("krombopulos").length).toBe(1);
  });
});
