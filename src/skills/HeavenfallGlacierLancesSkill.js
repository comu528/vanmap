// 天墜氷槍葬（glacial_spear_rain の進化・M7-D）: 複数 wave の大規模氷槍雨を wave ごとに異なる螺旋・六角配置で降らせる。
// 一定本数ごとの巨大槍のみ広範囲ダメージ＋冷気＋凍結中の敵へ強化粉砕（通常槍は粉砕なし）。ボスは氷砕ゲージ、巨大槍のみ bossGaugeMult。画面を白くしない。
// periodic・custom echo/clone（1wave 短縮版）。main cast 時のみ recordCast。Job Lv80 対象外。runtimeState: cdLeft＋未落下の barrage 状態（発生済み槍を再発生しない）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

const GOLDEN = 2.399963229728653;

export class HeavenfallGlacierLancesSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._barrage = null; this.spears = []; }

  fire() {
    const b = this.evoDef.barrage || {};
    const spot = this.scene.combat.densestPoint(this.evoDef.impactRadius || 40, 0) || { x: this.scene.player.x, y: this.scene.player.y };
    this._barrage = { active: true, waveRemaining: Math.min(b.waves || 3, this.cap('maxWaves', 3)), waveIndex: 0, spearsRemaining: 0, nextLeft: 0, cx: spot.x, cy: spot.y, telegraphLeft: b.telegraphTime || 360, spearIndex: 0 };
    this.scene.skills.recordExtra(this.id, 'barragesCast', 1, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()
    const b = this.evoDef.barrage || {}; const bg = this._barrage;
    if (bg && bg.active) {
      if (bg.telegraphLeft > 0) bg.telegraphLeft -= dt;
      bg.nextLeft -= dt;
      if (bg.telegraphLeft <= 0 && bg.nextLeft <= 0) {
        if (bg.spearsRemaining <= 0) {
          if (bg.waveRemaining <= 0) bg.active = false;
          else { bg.spearsRemaining = b.spearsPerWave || 10; bg.waveIndex++; bg.waveRemaining--; bg.nextLeft = b.waveDelayMs || 400; }
        }
        if (bg.active && bg.spearsRemaining > 0 && bg.nextLeft <= 0) { this._launch(bg.waveIndex, bg.spearIndex, bg.cx, bg.cy); bg.spearsRemaining--; bg.spearIndex++; bg.nextLeft = b.dropInterval || 90; }
      }
    }
    for (let i = this.spears.length - 1; i >= 0; i--) {
      const sp = this.spears[i]; sp.arriveLeft -= dt; const t = 1 - Math.max(0, sp.arriveLeft) / sp.arriveMax;
      if (sp.gfx) sp.gfx.setPosition(sp.sx + (sp.tx - sp.sx) * t, sp.sy + (sp.ty - sp.sy) * t);
      if (sp.arriveLeft <= 0) { this._impact(sp); if (sp.gfx) sp.gfx.destroy(); this.spears.splice(i, 1); }
    }
  }

  _launch(waveIndex, spearIndex, cx, cy) {
    const lg = this.evoDef.large || {};
    const large = (spearIndex % Math.max(1, lg.every || 4)) === 0;
    const ang = spearIndex * GOLDEN + waveIndex * 0.7; const r = 8 + (spearIndex % 6) * 12; // wave ごとに配置を回す（決定論）
    const tx = cx + Math.cos(ang) * r, ty = cy + Math.sin(ang) * r;
    const gfx = this.scene.add.image(tx, ty - 240, 'icon_heavenfall_glacier_lances').setDepth(46).setScale(large ? 1.2 : 0.8).setAlpha(0.9).setTint(0xbde8ff).setRotation(Math.PI / 2);
    this.spears.push({ sx: tx, sy: ty - 240, tx, ty, arriveLeft: 380, arriveMax: 380, large, gfx });
    this.scene.skills.recordExtra(this.id, large ? 'largeSpearsDropped' : 'spearsDropped', 1, 'add');
  }

  _impact(sp) {
    if (!this.scene.combat.frameBudget('heavenfallImpact', 'maxHeavenfallImpactsPerFrame')) return;
    const lg = this.evoDef.large || {}; const dmgD = this.evoDef.damage || {}; const chillD = this.evoDef.chill || {};
    const radius = sp.large ? (lg.radius || 70) : (this.evoDef.impactRadius || 40);
    const dmg = (dmgD.spear || 24) * (sp.large ? (lg.damageMult || 2.2) : 1);
    this.scene.effects.explosion(sp.tx, sp.ty, radius, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    if (sp.large) for (const e of this.scene.combat.enemiesInRadius(sp.tx, sp.ty, radius)) { if (this.scene.combat.isFrozen(e)) { this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: (this.evoDef.shatter || {}).multiplier || 1.6, skillPower: dmg }); this.scene.skills.recordExtra(this.id, 'shatters', 1, 'add'); } }
    this.scene.combat.damageArea(sp.tx, sp.ty, radius, dmg, this.id, {
      element: 'ice', chillAmount: sp.large ? (chillD.large || 26) : (chillD.spear || 12), baseFreezeChance: 0,
      procCoefficient: sp.large ? (this.evoDef.largeProc ?? 0.80) : (this.evoDef.procCoefficient ?? 0.42),
      hitGroupId: hg, isExplosion: sp.large, color: 0x9fe8ff, bossGaugeMult: sp.large ? (this.evoDef.bossGaugeMult || 1) : 1,
    });
    this.scene.skills.recordExtra(this.id, 'impactHits', 1, 'add');
  }

  echoCast() { const b = this.evoDef.barrage || {}; const spot = this.scene.combat.densestPoint(40, 0) || { x: this.scene.player.x, y: this.scene.player.y }; for (let i = 0; i < Math.min(4, b.spearsPerWave || 6); i++) this._launch(0, i, spot.x, spot.y); }
  cloneCast() { this.echoCast(); }

  serializeState() {
    const st = { cdLeft: this._cd };
    if (this._barrage && this._barrage.active) { st.barrageActive = true; st.waveRemaining = this._barrage.waveRemaining; st.spearsRemaining = this._barrage.spearsRemaining; st.nextLeft = this._barrage.nextLeft; st.waveIndex = this._barrage.waveIndex; st.spearIndex = this._barrage.spearIndex; st.targetCenterX = this._barrage.cx; st.targetCenterY = this._barrage.cy; st.telegraphLeft = this._barrage.telegraphLeft; }
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    if (st.barrageActive) this._barrage = { active: true, waveRemaining: st.waveRemaining || 0, spearsRemaining: st.spearsRemaining || 0, nextLeft: st.nextLeft || 0, waveIndex: st.waveIndex || 0, spearIndex: st.spearIndex || 0, cx: st.targetCenterX != null ? st.targetCenterX : this.scene.player.x, cy: st.targetCenterY != null ? st.targetCenterY : this.scene.player.y, telegraphLeft: st.telegraphLeft || 0 };
  }

  destroy() { for (const sp of this.spears) if (sp.gfx) sp.gfx.destroy(); this.spears = []; this._barrage = null; }
}
