// 終末炉心（M6-E・炉心暴走の進化）: 熱量で攻撃形態が段階変化する。
//   低=高速弾 / 中=多方向弾＋小爆発 / 高=連続爆発＋貫通弾 / 最大=終末状態（濃密弾幕＋周期爆発）。
// 終末終了で強制オーバーヒート。低HP時は終末威力がわずかに上昇（lowHpBonusMax でクランプ・HPは自動消費しない）。
// 熱量は通常発動のみで上昇。終末弾幕/終末爆発/オーバーヒートでは recordCast しない。
// echo/clone は「現在段階の攻撃のみ」を再現し、熱量/終末/オーバーヒートを変えない。リロードで有利化しない。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

// 以下は安全用 fallback（ゲームバランス値は data/skill-evolutions.json の doomsday_core が唯一の正）。
// JSON が欠落・破損した場合に NaN/undefined を避けるための既定値であり、通常はJSON側の値が使われる。
const HEAT_ACCEL_SAFE = 0.5;  // overheat.heatAccelPct 欠落時の安全既定（CD短縮率）。
const DOOM_FIRE_SAFE = 130;   // config.doomFireMs 欠落時の安全既定（終末弾幕の内部発射間隔）。
const DOOM_BLAST_SAFE = 420;  // config.doomBlastMs 欠落時の安全既定（終末爆発の周期）。

export class DoomsdayCoreSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._heat = 0;
    this._overheatLeft = 0;
    this._doomLeft = 0;
    this._cd = 0;
    this._doomTick = 0;
    this._doomBlastTick = 0;
  }

  canFire() { return false; } // 常時 update で管理

  _stageFor(frac) { if (frac < 0.33) return 'low'; if (frac < 0.66) return 'mid'; return 'high'; }
  _currentStage() {
    if (this._doomLeft > 0) return 'doom';
    const maxHeat = (this.evoDef.overheat && this.evoDef.overheat.maxHeat) || 150;
    const frac = maxHeat > 0 ? this._heat / maxHeat : 0;
    return this._stageFor(frac);
  }

  update(dt) {
    if (this.scene.gameOver) return; // 一時停止/ゲームオーバー中は状態を進めない。
    const d = this.evoDef; const cfg = d.config || {}; const oh = d.overheat || {};
    const maxHeat = oh.maxHeat || 150;
    const resetHeat = (cfg.overheatResetHeat != null) ? cfg.overheatResetHeat : 30;

    // 終末状態: 濃密弾幕＋周期爆発を内部レートで発射。終了で強制オーバーヒート。
    if (this._doomLeft > 0) {
      this._doomLeft -= dt;
      this._doomTick -= dt;
      this._doomBlastTick -= dt;
      this.scene.skills.recordExtra(this.id, 'timeAtHighHeat', dt, 'add');
      if (this._doomTick <= 0) { this._doomTick = (cfg.doomFireMs != null ? cfg.doomFireMs : DOOM_FIRE_SAFE); this._doomVolley(); }
      if (this._doomBlastTick <= 0) { this._doomBlastTick = (cfg.doomBlastMs != null ? cfg.doomBlastMs : DOOM_BLAST_SAFE); this._doomBlast(); }
      if (this._doomLeft <= 0) {
        this._doomLeft = 0;
        this._overheatLeft = oh.forcedOverheatMs || 2400; // 強制オーバーヒート。
        this._heat = resetHeat;
        this.scene.skills.recordExtra(this.id, 'overheats', 1, 'add');
      }
      return;
    }

    // オーバーヒート中: 停止。終了で reset 熱量＋小爆発（recordCast しない）。
    if (this._overheatLeft > 0) {
      this._overheatLeft -= dt;
      this.scene.skills.recordExtra(this.id, 'timeAtHighHeat', dt, 'add');
      if (this._overheatLeft <= 0) {
        this._overheatLeft = 0;
        this._heat = resetHeat;
        const p = this.scene.player;
        const r = 60 * this.passiveAreaMult() * this.explosionAreaMult();
        this.scene.combat.damageArea(p.x, p.y, r, (d.damage && d.damage.overheatBlast) || 100, this.id, { isExplosion: true, element: 'fire' });
        this.scene.effects.explosion(p.x, p.y, r, 0xff5722);
      }
      return;
    }

    // 通常（非終末・非オーバーヒート）: CD で発動。
    this._cd -= dt;
    const heatFrac = maxHeat > 0 ? this._heat / maxHeat : 0;
    if (heatFrac > 0.75) this.scene.skills.recordExtra(this.id, 'timeAtHighHeat', dt, 'add');
    const coolRate = oh.cooldownRate || 18;
    if (this._cd > 0) { this._heat = Math.max(0, this._heat - coolRate * dt / 1000); return; }

    const p = this.scene.player;
    const target = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    if (!target) { this._heat = Math.max(0, this._heat - coolRate * dt / 1000); return; }

    const eff = Math.max(oh.minCooldownMs || 120, (d.cooldown || 650) * (1 - (oh.heatAccelPct != null ? oh.heatAccelPct : HEAT_ACCEL_SAFE) * heatFrac)) * this.passiveCooldownMult();
    this._cd = eff;

    this.scene.skills.recordCast(this.id); // 主発動（熱量は通常発動のみで上昇）。
    this._heat += (cfg.heatPerCast != null ? cfg.heatPerCast : 8);
    this.scene.skills.recordExtra(this.id, 'overdriveCasts', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'maxHeatReached', this._heat, 'max');

    if (this._heat >= maxHeat) { // 最大 → 終末状態へ（1フレーム1回のみ・update は毎フレーム1回なので自然に担保）。
      this._heat = maxHeat;
      this._doomLeft = oh.doomMs || 2200;
      this._doomTick = 0; this._doomBlastTick = 0; // 直後から弾幕開始。
      this.scene.skills.recordExtra(this.id, 'doomsdayStates', 1, 'add');
      return;
    }

    this._fireStage(this._stageFor(heatFrac));
  }

  // 低HPボーナス（終末威力のみ・上限クランプ・HPは消費しない）。
  _doomBonus() {
    const cfg = this.evoDef.config || {}; const p = this.scene.player;
    const hpFrac = p.maxHp ? p.hp / p.maxHp : 1;
    const bonusMax = cfg.lowHpBonusMax || 0.25;
    return Math.min(bonusMax, bonusMax * (1 - hpFrac));
  }

  // 段階別の通常攻撃。recordCast/recordExtra はしない（呼び出し元の主発動のみが記録する）。
  _fireStage(stage) {
    if (this.scene.gameOver) return;
    const d = this.evoDef; const combat = this.scene.combat; const p = this.scene.player;
    const pc = d.projectileCount || {}; const dmg = d.damage || {};
    const projCap = this.cap('maxDoomsdayProjectiles', 60);
    if (!combat.frameBudget('overdriveCast', 'maxOverdriveCastsPerFrame')) return;
    const target = combat.nearestEnemy(p.x, p.y, 100000);
    const baseAng = target ? Math.atan2(target.y - p.y, target.x - p.x) : 0;

    // 進化は単一形態のため Job Lv80「発射数+1」は適用しない（既存18進化と統一・fireProjectileCount を使わない）。
    if (stage === 'low') { // 高速弾（対象方向へ密集）。
      const n = Math.min(pc.baseProjectiles || 3, projCap);
      for (let i = 0; i < n; i++) {
        if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) break;
        const off = n > 1 ? (i - (n - 1) / 2) * 0.18 : 0;
        combat.spawnPlayerProjectile(p.x, p.y, baseAng + off, 460, { skillId: this.id, damage: dmg.low || 26, pierce: 0, scale: 0.6, lifeMs: 1000, tint: 0xffca28, element: 'fire' });
      }
    } else if (stage === 'mid') { // 多方向弾＋小爆発。
      const n = Math.min(pc.midProjectiles || 6, projCap);
      for (let i = 0; i < n; i++) {
        if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) break;
        const ang = baseAng + (Math.PI * 2 * i) / (n || 1);
        combat.spawnPlayerProjectile(p.x, p.y, ang, 360, { skillId: this.id, damage: dmg.mid || 22, pierce: 0, explosionRadius: 8, scale: 0.6, lifeMs: 950, tint: 0xff9800, element: 'fire' });
      }
      if (target && combat.frameBudget('doomBlast', 'maxDoomsdayExplosions')) {
        const r = 40 * this.passiveAreaMult() * this.explosionAreaMult();
        combat.damageArea(target.x, target.y, r, (dmg.mid || 22) * 0.6, this.id, { isExplosion: true, element: 'fire' });
        this.scene.effects.explosion(target.x, target.y, r, 0xff9800);
      }
    } else { // high: 連続爆発＋貫通弾。
      const n = Math.min((pc.baseProjectiles || 3) + 1, projCap);
      for (let i = 0; i < n; i++) {
        if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) break;
        const off = n > 1 ? (i - (n - 1) / 2) * 0.16 : 0;
        combat.spawnPlayerProjectile(p.x, p.y, baseAng + off, 420, { skillId: this.id, damage: dmg.high || 30, pierce: 2, scale: 0.7, lifeMs: 1100, tint: 0xff5722, element: 'fire' });
      }
      if (combat.frameBudget('doomBlast', 'maxDoomsdayExplosions')) {
        const dp = combat.densestPoint(120, 0) || (target ? { x: target.x, y: target.y } : { x: p.x, y: p.y });
        const r = 50 * this.passiveAreaMult() * this.explosionAreaMult();
        combat.damageArea(dp.x, dp.y, r, (dmg.high || 30) * 0.7, this.id, { isExplosion: true, element: 'fire' });
        this.scene.effects.explosion(dp.x, dp.y, r, 0xff7043);
      }
    }
  }

  // 終末弾幕（濃密・全方向）。低HPで威力上昇。recordCast/recordExtra はしない。
  _doomVolley() {
    if (this.scene.gameOver) return;
    const d = this.evoDef; const combat = this.scene.combat; const p = this.scene.player;
    const pc = d.projectileCount || {}; const dmg = d.damage || {};
    if (!combat.frameBudget('overdriveCast', 'maxOverdriveCastsPerFrame')) return;
    const projCap = this.cap('maxDoomsdayProjectiles', 60);
    const power = (dmg.doom || 20) * (1 + this._doomBonus());
    const n = Math.min(pc.doomProjectiles || 24, projCap);
    for (let i = 0; i < n; i++) {
      if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) break;
      const ang = (Math.PI * 2 * i) / (n || 1) + this.scene.rng() * 0.2;
      combat.spawnPlayerProjectile(p.x, p.y, ang, 400, { skillId: this.id, damage: power, pierce: 1, scale: 0.7, lifeMs: 1000, tint: 0xff1744, element: 'fire' });
    }
  }

  // 終末周期爆発。
  _doomBlast() {
    if (this.scene.gameOver) return;
    const d = this.evoDef; const combat = this.scene.combat; const p = this.scene.player; const dmg = d.damage || {};
    if (!combat.frameBudget('doomBlast', 'maxDoomsdayExplosions')) return;
    const dp = combat.densestPoint(140, 0) || { x: p.x, y: p.y };
    const r = 70 * this.passiveAreaMult() * this.explosionAreaMult();
    combat.damageArea(dp.x, dp.y, r, (dmg.doomBlast || 60) * (1 + this._doomBonus()), this.id, { isExplosion: true, element: 'fire' });
    this.scene.effects.explosion(dp.x, dp.y, r, 0xff1744);
  }

  // 残響/複製: 現在段階の攻撃のみ再現（熱量/終末/オーバーヒート不変・recordCast なし）。
  echoCast() {
    if (this.scene.gameOver) return;
    if (this._currentStage() === 'doom') this._doomVolley();
    else this._fireStage(this._currentStage());
  }
  cloneCast() { this.echoCast(); }

  serializeState() { return { heat: this._heat, overheatLeft: this._overheatLeft, doomLeft: this._doomLeft, cdLeft: this._cd }; }
  restoreState(st) {
    if (!st) return;
    const maxHeat = (this.evoDef.overheat && this.evoDef.overheat.maxHeat) || 150;
    this._heat = Math.max(0, Math.min(maxHeat, st.heat || 0));   // 熱量は復元（有利化しない）。
    this._overheatLeft = Math.max(0, st.overheatLeft || 0);
    this._doomLeft = Math.max(0, st.doomLeft || 0);              // 終末は再スタートせず残りをそのまま復元。
    this._cd = st.cdLeft || 0;
    this._doomTick = 0; this._doomBlastTick = 0;
  }

  destroy() {}
}
