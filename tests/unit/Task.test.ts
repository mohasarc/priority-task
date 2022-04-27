/* eslint-disable no-undef */
import Task from '../../lib/Task';

describe('PriorityTask', () => {
  it('should be instantiatable', () => {
    const task = new Task<number, number>({
      priority: 1,
      delay: 1000,
      args: 5,
      procedure: (a: number) => a + 4,
      pauseAction: () => {},
      resumeAction: () => {},
      cancelAction: () => {},
    });

    expect(task).toBeInstanceOf(Task);
  });
});
