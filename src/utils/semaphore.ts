export class Semaphore {
  private queue: Array<() => void> = [];
  private active = 0;
  constructor(private readonly max: number) {}
  async acquire(): Promise<() => void> {
    return new Promise(resolve => {
      const tryAcquire = () => {
        if (this.active < this.max) {
          this.active++;
          resolve(() => this.release());
        } else {
          this.queue.push(tryAcquire);
        }
      };
      tryAcquire();
    });
  }
  private release() {
    this.active--;
    const next = this.queue.shift();
    if (next) next();
  }
}
