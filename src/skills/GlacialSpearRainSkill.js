// 氷槍豪雨（frost_mage・M7-D・common）: 敵密集地点へ予告付きの氷槍を螺旋・円形に連続落下させる範囲制圧（periodic barrage）。
// 配置は castIndex/spearIndex から決定論（黄金角）。各槍は着弾で小範囲ダメージ＋冷気、一定本数ごとの大型槍のみ凍結中の敵を粉砕する。ボスは氷砕ゲージへ接続。
// Job Lv80 は追加槍本数。recordCast は barrage 開始時に1回（槍/予告/着弾/粉砕では記録しない）。runtimeState: cdLeft＋未落下分の barrage 状態。

import { SkillBase } from './SkillBase.js';

const GOLDEN = 2.399963229728653; // 決定論的な角度分散（黄金角・RNG不使用）

export class GlacialSpearRainSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._barrage = null; this.spears = []; }
  // 予告（telegraph）付き barrage は同時1本（構造的制限）＋品質別上限 maxGlacialSpearTelegraphs（M7-E: 宣言済みの上限を実参照）。
  canFire(ctx) { return ctx.hasEnemies && this._activeTelegraphs() < this.scene.combat.skillCap('maxGlacialSpearTelegraphs', 6); }
  _activeTelegraphs() { return (this._barrage && this._barrage.active && this._barrage.telegraphLeft > 0) ? 1 : 0; }

  fire() {
    const s = this.stats;
    const spot = this.scene.combat.densestPoint(s.impactRadius || 40, 0) || { x: this.scene.player.x, y: this.scene.player.y };
    // Lv80: 追加槍本数（品質別上限でクランプ）。
    const count = Math.min(this.fireProjectileCount(s.spearCount || 6), this.scene.combat.skillCap('maxGlacialSpearProjectiles', 48));
    this._barrage = { active: true, remaining: count, nextLeft: 0, index: 0, cx: spot.x, cy: spot.y, telegraphLeft: s.telegraphTime || 400 };
    this.scene.skills.recordExtra(this.id, 'barragesCast', 1, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（barrage 予約）
    const s = this.stats; const b = this._barrage;
    if (b && b.active) {
      if (b.telegraphLeft > 0) b.telegraphLeft -= dt;
      b.nextLeft -= dt;
      if (b.telegraphLeft <= 0 && b.nextLeft <= 0 && b.remaining > 0) {
        this._launchSpear(b.index, b.cx, b.cy, s); b.remaining--; b.index++; b.nextLeft = s.dropInterval || 110;
        if (b.remaining <= 0) b.active = false;
      }
    }
    for (let i = this.spears.length - 1; i >= 0; i--) {
      const sp = this.spears[i]; sp.arriveLeft -= dt;
      const t = 1 - Math.max(0, sp.arriveLeft) / sp.arriveMax;
      if (sp.gfx) sp.gfx.setPosition(sp.sx + (sp.tx - sp.sx) * t, sp.sy + (sp.ty - sp.sy) * t);
      if (sp.arriveLeft <= 0) { this._impact(sp, s); if (sp.gfx) sp.gfx.destroy(); this.spears.splice(i, 1); }
    }
  }

  _launchSpear(index, cx, cy, s) {
    const large = (index % Math.max(1, Math.round(s.largeSpearEvery || 4))) === 0;
    const ang = index * GOLDEN; const r = 8 + (index % 6) * 12; // 螺旋（黄金角＋半径・決定論）
    const tx = cx + Math.cos(ang) * r, ty = cy + Math.sin(ang) * r;
    const sx = tx, sy = ty - 240; // 上方（world 外）から落下
    const gfx = this.scene.add.image(sx, sy, 'icon_glacial_spear_rain').setDepth(46).setScale(large ? 1.1 : 0.7).setAlpha(0.9).setTint(0xbde8ff).setRotation(Math.PI / 2);
    this.spears.push({ sx, sy, tx, ty, arriveLeft: 380, arriveMax: 380, large, gfx });
    this.scene.skills.recordExtra(this.id, large ? 'largeSpearsDropped' : 'spearsDropped', 1, 'add');
  }

  _impact(sp, s) {
    if (!this.scene.combat.frameBudget('glacialSpearImpact', 'maxGlacialSpearImpactsPerFrame')) return;
    const radius = (s.impactRadius || 40) * (sp.large ? 1.4 : 1);
    const dmg = s.damage * (sp.large ? (s.largeSpearDamageMult || 1.8) : 1);
    this.scene.effects.explosion(sp.tx, sp.ty, radius, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    // 大型槍のみ凍結中の敵を粉砕（通常槍は粉砕しない・ボスは氷砕ゲージ）。
    if (sp.large) for (const e of this.scene.combat.enemiesInRadius(sp.tx, sp.ty, radius)) {
      if (this.scene.combat.isFrozen(e)) { this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: this.def?.config?.shatterMultiplier || 1.5, skillPower: dmg }); this.scene.skills.recordExtra(this.id, 'shatters', 1, 'add'); }
    }
    this.scene.combat.damageArea(sp.tx, sp.ty, radius, dmg, this.id, {
      element: 'ice', chillAmount: sp.large ? (s.largeSpearChill || 20) : s.chillAmount, baseFreezeChance: 0,
      procCoefficient: sp.large ? (this.def?.config?.largeSpearProc ?? 0.80) : (this.def?.procCoefficient ?? 0.42),
      hitGroupId: hg, isExplosion: sp.large, color: 0x9fe8ff,
    });
    this.scene.skills.recordExtra(this.id, 'impactHits', 1, 'add');
  }

  // 残響/複製（custom）: 本数を抑えた短縮豪雨（同時 barrage を増やさない・再帰なし）。
  echoCast() { const s = this.stats; const spot = this.scene.combat.densestPoint(s.impactRadius || 40, 0) || { x: this.scene.player.x, y: this.scene.player.y }; for (let i = 0; i < 3; i++) this._launchSpear(i, spot.x, spot.y, s); }
  cloneCast() { this.echoCast(); }

  serializeState() {
    const st = { cdLeft: this._cd };
    if (this._barrage && this._barrage.active) { st.barrageActive = true; st.spearsRemaining = this._barrage.remaining; st.nextSpearLeft = this._barrage.nextLeft; st.barrageIndex = this._barrage.index; st.targetCenterX = this._barrage.cx; st.targetCenterY = this._barrage.cy; st.telegraphLeft = this._barrage.telegraphLeft; }
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    if (st.barrageActive && st.spearsRemaining > 0) {
      this._barrage = { active: true, remaining: st.spearsRemaining, nextLeft: st.nextSpearLeft || 0, index: st.barrageIndex || 0, cx: st.targetCenterX != null ? st.targetCenterX : this.scene.player.x, cy: st.targetCenterY != null ? st.targetCenterY : this.scene.player.y, telegraphLeft: st.telegraphLeft || 0 };
    }
  }

  destroy() { for (const sp of this.spears) if (sp.gfx) sp.gfx.destroy(); this.spears = []; this._barrage = null; }
}
