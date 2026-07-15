// オブジェクトプール。敵・弾・経験値・ダメージ数字を再利用し、
// 大量生成時の GC 負荷を抑える。Phaser の Group をラップする薄い層。
//
// M5-A: 空間グリッド連携用の onSpawn/onRelease フックと、
// 新規生成/再利用/破棄（プール返却）の計測カウンタを追加。
// プールへ戻す処理（非表示・body 無効化・velocity 停止・グリッド登録解除）を release に集約する。

export class Pool {
  // scene: Phaser.Scene, factory: () => GameObject, resetFn: (obj, ...args) => void
  // opts: { onSpawn(obj), onRelease(obj) } — グリッド登録/解除などの共通処理フック。
  constructor(scene, factory, resetFn, maxSize = 1000, opts = {}) {
    this.scene = scene;
    this.factory = factory;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
    this.active = new Set();
    this.free = [];
    this._onSpawn = opts.onSpawn || null;
    this._onRelease = opts.onRelease || null;
    // 計測カウンタ（?debug=1 のデバッグ表示用）。
    this.createdCount = 0;   // factory による新規生成の累計
    this.reusedCount = 0;    // free からの再利用の累計
    this.releasedCount = 0;  // プールへ返却した累計
  }

  spawn(...args) {
    if (this.active.size >= this.maxSize) return null; // 安全上限
    let obj = this.free.pop();
    if (!obj) { obj = this.factory(); this.createdCount++; }
    else { this.reusedCount++; }
    this.active.add(obj);
    this.resetFn(obj, ...args);       // 各エンティティの reset() が古い状態を完全初期化する
    if (this._onSpawn) this._onSpawn(obj);
    return obj;
  }

  release(obj) {
    if (!this.active.has(obj)) return;
    this.active.delete(obj);
    this.free.push(obj);
    this.releasedCount++;
    if (this._onRelease) this._onRelease(obj); // グリッド登録解除など
    if (obj.setActive) obj.setActive(false);
    if (obj.setVisible) obj.setVisible(false);
    if (obj.body) {
      obj.body.enable = false;
      if (obj.body.stop) obj.body.stop();      // velocity 残留の防止
    }
  }

  releaseAll() {
    for (const obj of Array.from(this.active)) this.release(obj);
  }

  get activeCount() { return this.active.size; }
  get freeCount() { return this.free.length; }
  get totalCount() { return this.active.size + this.free.length; }

  forEachActive(fn) {
    for (const obj of this.active) fn(obj);
  }

  setMax(n) { this.maxSize = n; }
}
