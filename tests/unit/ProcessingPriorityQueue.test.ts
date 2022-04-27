import ProcessingPriorityQueue from '../../lib/ProcessingPriorityQueue';

describe('ProcessingPriorityQueue', () => {
    it('should be singleton', () => {
        const queue = ProcessingPriorityQueue.getInstance();
        expect(queue).toBeInstanceOf(ProcessingPriorityQueue);
    });
});