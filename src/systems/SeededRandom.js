// SeededRandom（Milestone 6-A）: 決定論的な擬似乱数（mulberry32）。
// スキル候補抽選に Math.random を使わず、seed と cursor（進行状態）を保存/復元できるようにする。
// 同じ seed・同じ cursor からは常に同じ乱数列が得られる（再読み込みで候補が変わらない基盤）。
// DOM 非依存の純 JS（Node からテスト可能）。

export class SeededRandom {
  constructor(seed = 1, cursor = 0) {
    this.seed = seed >>> 0;
    this.cursor = cursor >>> 0;
    this._state = (this.seed + Math.imul(this.cursor, 0x9e3779b1)) >>> 0;
  }

  next() {
    this._state = (this._state + 0x6d2b79f5) | 0;
    let t = Math.imul(this._state ^ (this._state >>> 15), 1 | this._state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    this.cursor = (this.cursor + 1) >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(n) { return Math.floor(this.next() * n); }

  serialize() { return { seed: this.seed, cursor: this.cursor, state: this._state >>> 0 }; }

  static restore(s) {
    const r = new SeededRandom((s && s.seed) || 1, (s && s.cursor) || 0);
    if (s && typeof s.state === 'number') r._state = s.state >>> 0;
    return r;
  }

  // seed と任意個の整数から決定論的な派生 seed を作る（ドラフト単位の独立した乱数列に使う）。
  static derive(seed, ...parts) {
    let h = (seed >>> 0) || 1;
    for (const p of parts) {
      h ^= (p >>> 0);
      h = Math.imul(h, 0x01000193) >>> 0;
      h ^= h >>> 13;
    }
    return (h >>> 0) || 1;
  }
}
