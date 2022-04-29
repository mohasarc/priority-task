import ProcessingPriorityQueue from '../../lib/ProcessingPriorityQueue';

describe('ProcessingPriorityQueue', () => {
    it('should create a new queue when requested for the first time', () => {
        const queue = ProcessingPriorityQueue.getInstance('test');
        expect(queue).toBeInstanceOf(ProcessingPriorityQueue);
    });

    it('should not create a new queue when requested the second time', (done) => {
        const queue1 = ProcessingPriorityQueue.getInstance('test');
        const queue2 = ProcessingPriorityQueue.getInstance('test');
        const queue3 = ProcessingPriorityQueue.getInstance('another-test');

        Promise.all([
            expect(queue1).toBe(queue2),
            expect(queue1).not.toBe(queue3),
        ]).then(() => {
            done();
        });
    });
});