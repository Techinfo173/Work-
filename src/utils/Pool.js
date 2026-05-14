/**
 * Generic mesh pool. Pre-warms with a factory and recycles instead of allocating.
 */
export class Pool {
  constructor(factory, initialSize = 0) {
    this.factory = factory;
    this.free = [];
    this.active = [];
    for (let i = 0; i < initialSize; i++) {
      const obj = factory();
      obj.visible = false;
      this.free.push(obj);
    }
  }

  acquire() {
    const obj = this.free.length > 0 ? this.free.pop() : this.factory();
    obj.visible = true;
    this.active.push(obj);
    return obj;
  }

  release(obj) {
    obj.visible = false;
    const idx = this.active.indexOf(obj);
    if (idx >= 0) this.active.splice(idx, 1);
    this.free.push(obj);
  }

  forEach(fn) {
    for (let i = this.active.length - 1; i >= 0; i--) fn(this.active[i], i);
  }
}
