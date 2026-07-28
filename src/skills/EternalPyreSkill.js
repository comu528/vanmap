// 永劫火界（燃える軌跡の進化）: プレイヤー周囲に常時炎の領域。領域内の敵へ継続ダメージ、
// 炎上が近くの敵へ感染、炎上中の敵の死亡で小爆発。ダメージ間隔と感染世代に安全上限。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

const CAST_PULSE_SAFE = 500; // 安全用 fallback（正は data/skill-evolutions.json eternal_pyre.config.castPulseMs）。

export class EternalPyreSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._auraTick = 0;
    this._infectTick = 0;
    this._castPulse = 0;   // M8-A: 主発動イベント（emitStart）のスロットル
    this.aura = this.scene.add.image(0, 0, TEX.PARTICLE)
      .setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setDepth(43).setAlpha(0.28);
  }

  canFire() { return false; } // 常時発動（update で処理）

  update(dt, ctx) {
    const d = this.evoDef;
    const p = this.scene.player;
    const auraR = (d.area?.auraRadius || 72) * this.passiveAreaMult(); // パッシブ「焦熱拡張」
    // 見た目（低エフェクトでも最低限は残す）
    if (this.aura) { this.aura.setPosition(p.x, p.y).setScale(auraR / 2); }

    const tickMs = this.cap('infectTickMs', d.tickMs || 300);
    this._auraTick -= dt;
    this._infectTick -= dt;
    if (this._castPulse > 0) this._castPulse -= dt;

    // 領域内の敵へ継続ダメージ + 炎上付与（毎フレームではなく tick 間隔）。
    if (this._auraTick <= 0) {
      this._auraTick = d.tickMs || 300;
      // M8-A: 常設型のため基底 update を使わず、主発動（emitStart）を一定間隔でスロットルして1回だけ記録する。
      // これが無いと、data で宣言している残響/分身が一度も発生しなかった（進化元 burning_trail では発生する）。
      if (this._castPulse <= 0) {
        this._castPulse = (d.config && d.config.castPulseMs) || CAST_PULSE_SAFE;
        this.scene.skills.recordCast(this.id);
      }
      const igniteMs = (d.infect?.durationMs || 1600) * this.passiveDurationMult(); // パッシブ「残火持続」
      let ignitedCount = this.scene.ignitedCount ? this.scene.ignitedCount() : 0;
      const maxIgnited = this.cap('maxIgnited', 220);
      this.scene.combat.forEachEnemyInRadius(p.x, p.y, auraR, (e) => {
        this.scene.combat.dealDamage(e, d.damage?.aura || 12, this.id, { quiet: true, color: 0xff7043, tag: 'dot' });
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
    const infectR = (d.area?.infectRadius || 40) * this.passiveAreaMult();
    const igniteMs = (d.infect?.durationMs || 1600) * this.passiveDurationMult();
    const maxIgnited = this.cap('maxIgnited', 220);

    // M8-A: 炎上索引（burningEnemies）から感染元を取る。以前は enemyPool を毎回全走査していた
    //（M6-E で索引を用意した目的＝全敵総当たりの回避に反していた）。対象集合は「生存かつ炎上中」で同じ。
    const sources = this.scene.combat.burningEnemies(maxIgnited)
      .filter((e) => e && e.alive && e.ignited && !e.isBoss && (e._igniteGen || 0) < maxGen);
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

  // M8-A（残響/分身・custom）: 攻撃サイクルの再現＝炎の領域を1回ぶん追加パルスする（領域/感染は増やさない）。
  echoCast() {
    const d = this.evoDef; const p = this.scene.player;
    const auraR = (d.area?.auraRadius || 72) * this.passiveAreaMult();
    this.scene.combat.damageArea(p.x, p.y, auraR, d.damage?.aura || 12, this.id, { quiet: true, color: 0xff7043, tag: 'dot' });
  }
  cloneCast() { this.echoCast(); }

  // M8-A: 常設型のため CD は無いが、オーラ tick と感染 tick・主発動スロットルを保存して再開直後の無料 tick を防ぐ。
  serializeState() { return { auraTick: this._auraTick, infectTick: this._infectTick, castPulse: this._castPulse }; }
  restoreState(s) {
    if (!s) return;
    if (typeof s.auraTick === 'number') this._auraTick = s.auraTick;
    if (typeof s.infectTick === 'number') this._infectTick = s.infectTick;
    if (typeof s.castPulse === 'number') this._castPulse = s.castPulse;
  }
}
