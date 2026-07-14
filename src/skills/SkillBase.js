// スキルの基底クラス。クールダウン管理と、JSON からのレベル別パラメータ取得を共通化する。
// 各スキルは fire(ctx) を実装する。ダメージは scene.combat 経由で数値計算し、
// 見た目は scene.effects 経由で描画する（判定と演出を分離）。

import { DataManager } from '../systems/DataManager.js';
import { EffectManager } from '../systems/EffectManager.js';

export class SkillBase {
  constructor(scene, id, level = 1) {
    this.scene = scene;
    this.id = id;
    this.level = level;
    this._cd = 0;
    this._initCd = true; // 初回は少し撃てるように 0 開始
  }

  get def() { return DataManager.getSkill(this.id); }
  get name() { return this.def?.name || this.id; }
  get maxLevel() { return this.def?.maxLevel || 8; }
  get stats() { return DataManager.getSkillLevel(this.id, this.level); }

  setLevel(level) { this.level = Math.max(1, Math.min(this.maxLevel, level)); this.onLevelChanged(); }
  onLevelChanged() {}

  visualScale() { return EffectManager.scaleForVisual(this.stats?.visual); }

  update(dt, ctx) {
    this._cd -= dt;
    if (this._cd > 0) return;
    if (!this.canFire(ctx)) return;
    this._cd = this.stats?.cooldown ?? 1000;
    this.scene.skills.recordCast(this.id);
    this.fire(ctx);
  }

  // 既定では画面内に敵がいるときだけ発動。常時発動系は override する。
  canFire(ctx) { return ctx.hasEnemies; }

  // 各スキルで実装
  fire(ctx) {}

  // 永続的な見た目（周回する炎など）の破棄フック
  destroy() {}
}
