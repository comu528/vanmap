// 氷彗星群（frost_mage・M7-C・rare）: 短い予告のあと、画面外から複数の氷彗星を決定論的な軌道で順番に降らせる高火力弾幕。
// 軌道は wave index / projectile index から決定（黄金角で分散・完全に同じ地点へ重ねない）。着弾で範囲ダメージと冷気、一部の大彗星のみ凍結中の敵を粉砕する。
// ボスは氷砕ゲージへ接続。barrage 中の各彗星では recordCast しない（主 barrage 開始時に1回）。projectile/impact は品質別上限。乱数・抽選RNG は使わず index 決定論。
// periodic。runtimeState: cdLeft/barrageActive/cometsRemaining/nextCometLeft/barrageIndex/targetCenter/telegraphLeft（未発射の彗星のみ再開）。

import { SkillBase } from './SkillBase.js';

const GOLDEN_ANGLE = 2.399963229728653; // 決定論的な角度分散（黄金角・RNG不使用）

export class CometSleetSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._barrage = null; this.comets = []; } // comets: 飛行中（保存しない）
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats;
    const spot = this.scene.combat.densestPoint(s.impactRadius || 40, 0) || { x: this.scene.player.x, y: this.scene.player.y };
    const count = Math.min(s.cometCount || 5, this.scene.combat.skillCap('maxCometSleetProjectiles', 48));
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
        this._launchComet(b.index, b.cx, b.cy, s); b.remaining--; b.index++; b.nextLeft = s.barrageInterval || 120;
        if (b.remaining <= 0) b.active = false;
      }
    }
    for (let i = this.comets.length - 1; i >= 0; i--) {
      const c = this.comets[i]; c.arriveLeft -= dt;
      const t = 1 - Math.max(0, c.arriveLeft) / c.arriveMax;
      if (c.gfx) c.gfx.setPosition(c.sx + (c.tx - c.sx) * t, c.sy + (c.ty - c.sy) * t);
      if (c.arriveLeft <= 0) { this._impact(c, s); if (c.gfx) c.gfx.destroy(); this.comets.splice(i, 1); }
    }
  }

  _launchComet(index, cx, cy, s) {
    const large = (index % Math.max(1, Math.round(s.largeCometEvery || 4))) === 0;
    const ang = index * GOLDEN_ANGLE; const spread = (index % 5) * 8;
    const tx = cx + Math.cos(ang) * spread, ty = cy + Math.sin(ang) * spread;
    const sx = tx - 60, sy = ty - 260; // 画面上方（world 外）から
    const gfx = this.scene.add.circle(sx, sy, large ? 8 : 5, large ? 0x9fe8ff : 0xbde8ff, 0.9).setDepth(46);
    this.comets.push({ sx, sy, tx, ty, arriveLeft: 400, arriveMax: 400, large, gfx });
    this.scene.skills.recordExtra(this.id, 'cometsLaunched', 1, 'add');
  }

  _impact(c, s) {
    if (!this.scene.combat.frameBudget('cometImpact', 'maxCometImpactsPerFrame')) return;
    const radius = (s.impactRadius || 40) * (c.large ? 1.3 : 1);
    const dmg = s.impactDamage * (c.large ? (s.largeCometDamageMult || 1.6) : 1);
    this.scene.effects.explosion(c.tx, c.ty, radius, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    // 大彗星のみ凍結中の敵を粉砕（ボスは氷砕ゲージ・1対象1回・再帰なし）。
    if (c.large) for (const e of this.scene.combat.enemiesInRadius(c.tx, c.ty, radius)) {
      if (this.scene.combat.isFrozen(e)) { this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: this.def?.config?.shatterMultiplier || 1.5, skillPower: dmg }); this.scene.skills.recordExtra(this.id, 'largeCometShatters', 1, 'add'); }
    }
    this.scene.combat.damageArea(c.tx, c.ty, radius, dmg, this.id, {
      element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: 0,
      procCoefficient: c.large ? (this.def?.config?.largeProc ?? 0.80) : (this.def?.procCoefficient ?? 0.42),
      hitGroupId: hg, isExplosion: true, color: 0x9fe8ff,
    });
    this.scene.skills.recordExtra(this.id, 'impacts', 1, 'add');
  }

  // 残響/複製（custom）: 彗星数を抑えた短縮 barrage（同時 barrage を増やさない・再帰なし）。
  echoCast() { const s = this.stats; const spot = this.scene.combat.densestPoint(s.impactRadius || 40, 0) || { x: this.scene.player.x, y: this.scene.player.y }; for (let i = 0; i < 2; i++) this._launchComet(i, spot.x, spot.y, s); }
  cloneCast() { this.echoCast(); }

  // 途中再開: 未発射の彗星のみ再開（発射済みを再発射しない・同じ barrage を二重開始しない・飛行中は保存しない）。
  serializeState() {
    const st = { cdLeft: this._cd };
    if (this._barrage && this._barrage.active) {
      st.barrageActive = true; st.cometsRemaining = this._barrage.remaining; st.nextCometLeft = this._barrage.nextLeft;
      st.barrageIndex = this._barrage.index; st.targetCenterX = this._barrage.cx; st.targetCenterY = this._barrage.cy; st.telegraphLeft = this._barrage.telegraphLeft;
    }
    return st;
  }
  restoreState(st) {
    if (!st) return;
    if (typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    if (st.barrageActive && st.cometsRemaining > 0) {
      this._barrage = { active: true, remaining: st.cometsRemaining, nextLeft: st.nextCometLeft || 0, index: st.barrageIndex || 0, cx: st.targetCenterX != null ? st.targetCenterX : this.scene.player.x, cy: st.targetCenterY != null ? st.targetCenterY : this.scene.player.y, telegraphLeft: st.telegraphLeft || 0 };
    }
  }

  destroy() { for (const c of this.comets) if (c.gfx) c.gfx.destroy(); this.comets = []; this._barrage = null; }
}
