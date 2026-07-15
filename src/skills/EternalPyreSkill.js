// 永劫火界（燃える軌跡の進化）: プレイヤー周囲に常時炎の領域。領域内の敵へ継続ダメージ、
// 炎上が近くの敵へ感染、炎上中の敵の死亡で小爆発。ダメージ間隔と感染世代に安全上限。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

export class EternalPyreSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._auraTick = 0;
    this._infectTick = 0;
    this.aura = this.scene.add.image(0, 0, TEX.PARTICLE)
      .setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setDepth(43).setAlpha(0.28);
  }

  canFire() { return false; } // 常時発動（update で処理）

  update(dt, ctx) {
    const d = this.evoDef;
    const p = this.scene.player;
    const auraR = d.area?.auraRadius || 72;
    // 見た目（低エフェクトでも最低限は残す）
    if (this.aura) { this.aura.setPosition(p.x, p.y).setScale(auraR / 2); }

    const tickMs = this.cap('infectTickMs', d.tickMs || 300);
    this._auraTick -= dt;
    this._infectTick -= dt;

    // 領域内の敵へ継続ダメージ + 炎上付与（毎フレームではなく tick 間隔）。
    if (this._auraTick <= 0) {
      this._auraTick = d.tickMs || 300;
      const igniteMs = d.infect?.durationMs || 1600;
      let ignitedCount = this.scene.ignitedCount ? this.scene.ignitedCount() : 0;
      const maxIgnited = this.cap('maxIgnited', 220);
      this.scene.combat.forEachEnemyInRadius(p.x, p.y, auraR, (e) => {
        this.scene.combat.dealDamage(e, d.damage?.aura || 12, this.id, { quiet: true, color: 0xff7043 });
        if (!e.isBoss && e.ignite && ignitedCount < maxIgnited) {
          if (!e.ignited) ignitedCount++;
          e.ignite(igniteMs, 0);
        }
      });
    }

    // 感染: 炎上中の敵から近くの敵へ広げる（世代・間隔・数に安全上限）。
    if (this._infectTick <= 0) {
      this._infectTick = tickMs;
      const bonusInterval = this.evolvedBonus().infectIntervalMult || 0;
      if (bonusInterval) this._infectTick *= (1 + bonusInterval);
      this.spreadInfection();
    }
  }

  spreadInfection() {
    const d = this.evoDef;
    const maxGen = Math.min(this.cap('maxInfectGenerations', 2), (d.infect?.generations || 1) + this.chainBonus);
    const infectR = d.area?.infectRadius || 40;
    const igniteMs = d.infect?.durationMs || 1600;
    const maxIgnited = this.cap('maxIgnited', 220);

    const sources = [];
    this.scene.enemyPool.forEachActive((e) => { if (e.alive && e.ignited && (e._igniteGen || 0) < maxGen) sources.push(e); });
    let ignitedCount = this.scene.ignitedCount ? this.scene.ignitedCount() : 0;
    for (const src of sources) {
      this.scene.combat.forEachEnemyInRadius(src.x, src.y, infectR, (e) => {
        if (e === src || e.isBoss || !e.ignite) return;
        if (!e.ignited && ignitedCount < maxIgnited) {
          e.ignite(igniteMs, (src._igniteGen || 0) + 1);
          ignitedCount++;
        }
      });
    }
  }

  destroy() { if (this.aura) { this.aura.destroy(); this.aura = null; } }
}
