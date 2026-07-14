// オブジェクトプール。敵・弾・経験値・ダメージ数字を再利用し、
// 大量生成時の GC 負荷を抑える。Phaser の Group をラップする薄い層。

export class Pool {
  // scene: Phaser.Scene, factory: () => GameObject, resetFn: (obj, ...args) => void
  constructor(scene, factory, resetFn, maxSize = 1000) {
    this.scene = scene;
    this.factory = factory;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
    this.active = new Set();
    this.free = [];
  }

  spawn(...args) {
    if (this.active.size >= this.maxSize) return null; // 安全上限
    let obj = this.free.pop();
    if (!obj) obj = this.factory();
    this.active.add(obj);
    this.resetFn(obj, ...args);
    return obj;
  }

  release(obj) {
    if (!this.active.has(obj)) return;
    this.active.delete(obj);
    this.free.push(obj);
    if (obj.setActive) obj.setActive(false);
    if (obj.setVisible) obj.setVisible(false);
    if (obj.body) {
      obj.body.enable = false;
      if (obj.body.stop) obj.body.stop();
    }
  }

  releaseAll() {
    for (const obj of Array.from(this.active)) this.release(obj);
  }

  get activeCount() { return this.active.size; }
  get totalCount() { return this.active.size + this.free.length; }

  forEachActive(fn) {
    for (const obj of this.active) fn(obj);
  }

  setMax(n) { this.maxSize = n; }
}
