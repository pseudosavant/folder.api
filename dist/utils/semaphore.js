export class Semaphore {
    constructor(max) {
        this.max = max;
        this.queue = [];
        this.active = 0;
    }
    async acquire() {
        return new Promise(resolve => {
            const tryAcquire = () => {
                if (this.active < this.max) {
                    this.active++;
                    resolve(() => this.release());
                }
                else {
                    this.queue.push(tryAcquire);
                }
            };
            tryAcquire();
        });
    }
    release() {
        this.active--;
        const next = this.queue.shift();
        if (next)
            next();
    }
}
