// 灰燼分身（M6-D）: 灰の分身を生成し、直近に発動した「複製可能な通常攻撃」を遅延・低威力で再現する。
// 分身は敵の攻撃対象にならない（当たり判定なし・見た目＋タイマーのみ）。同じ位置に密集しない（角度を分散）。
// 複製は scene.combat.performClone に委譲（再帰安全・世代管理は scene 側）。防御/反応/移動/資源消費/残響は複製されない
// （scene の canCloneCopy が除外する）。echoPolicy/clonePolicy は data で forbidden のため echoCast 上書きは不要。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class AshDoppelgangerSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.clones = [];      // { sprite, offsetAngle, copyTimer }
    this._angleBase = 0;
  }
  canFire() { return false; } // 常時 update で管理

  _targetCount() {
    // 分身数はレベル値 cloneCount を skillCaps(maxClones) で上限クランプ（発射数系ではないので fireProjectileCount は使わない）。
    return Math.min(this.stats.cloneCount || 1, this.scene.combat.skillCap('maxClones', 4));
  }

  update(dt) {
    const s = this.stats; const p = this.scene.player;
    const want = this._targetCount();
    // 目標数に合わせて生成/破棄。
    while (this.clones.length < want) {
      const spr = this.scene.add.image(p.x, p.y, TEX.FIREBALL)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(50).setScale(0.85).setTint(0x9e9e9e).setAlpha(0.7);
      // コピー開始位相をずらして同時多発を避ける。
      this.clones.push({ sprite: spr, offsetAngle: 0, copyTimer: (s.copyIntervalMs || 1000) * (0.3 + 0.7 * this.scene.rng()) });
    }
    while (this.clones.length > want) { const c = this.clones.pop(); if (c.sprite) c.sprite.destroy(); }

    const n = this.clones.length;
    this._angleBase += dt * 0.0008;
    const dist = s.followDist || 34;
    const k = Math.min(1, dt * 0.006); // スロットへ緩く追従（プレイヤー座標そのものにはしない）
    for (let i = 0; i < n; i++) {
      const c = this.clones[i];
      const a = this._angleBase + (Math.PI * 2 * i) / n; // 明確に異なる角度＝重ならない
      c.offsetAngle = a;
      const tx = p.x + Math.cos(a) * dist;
      const ty = p.y + Math.sin(a) * dist;
      if (c.sprite) {
        c.sprite.x += (tx - c.sprite.x) * k;
        c.sprite.y += (ty - c.sprite.y) * k;
      }
      c.copyTimer -= dt;
      if (c.copyTimer <= 0) {
        c.copyTimer = s.copyIntervalMs || 1000;
        // 直近の複製可能な通常キャストを低威力で再実行（再帰・世代・除外は scene が保証）。
        const ok = this.scene.combat.performClone(s.copyPower || 0.35);
        if (ok) this.scene.skills.recordExtra(this.id, 'cloneCasts', 1, 'add');
      }
    }
    if (n) this.scene.skills.recordExtra(this.id, 'highestConcurrentObjects', n, 'max');
  }

  // 分身数はレベル値から update で再構築するため、個数のみ保存すれば十分。
  serializeState() { return { spawned: this.clones.length }; }
  restoreState(/* s */) { /* 個数は update() が stats.cloneCount から再構築する */ }

  destroy() { for (const c of this.clones) if (c.sprite) c.sprite.destroy(); this.clones = []; }
}
