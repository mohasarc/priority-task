/* eslint-disable no-undef */
import Task from '../../lib/PTask';

describe('PriorityTask', () => {
  it('should be instantiatable', () => {
    const task = new Task<number, number>({
      priority: 1,
      args: 5,
      onRun: async (a: number) => a + 4,
    });

    expect(task).toBeInstanceOf(Task);
  });

  it('should run the task', () => {
    const task = new Task<number, number>({
      priority: 1,
      args: 5,
      onRun: async (a: number) => a + 4,
    });

    task.run().then(val => {
      expect(val).toEqual(9);
    });
  });

  it('should run the tasks in order of priority', () => {
    // Prepare tasks
    const task1 = new Task<number, number>({
      priority: 1,
      args: 1,
      onRun: async (a: number) => a,
    });

    const task2 = new Task<number, number>({
      priority: 2,
      args: 2,
      onRun: async (a: number) => a,
    });

    const task3 = new Task<number, number>({
      priority: 3,
      args: 3,
      onRun: async (a: number) => a,
    });

    const res = [];
    const storeRes = (index: number) => res.push(index);

    const p2 = task2.run().then((val) => storeRes(val));
    const p1 = task1.run().then((val) => storeRes(val));
    const p3 = task3.run().then((val) => storeRes(val));

    Promise.all([p1, p2, p3]).then(() => {
      expect(res).toEqual([3, 2, 1]);
    });
  });
});
