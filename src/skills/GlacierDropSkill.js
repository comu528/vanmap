// 氷河墜落（frost_mage・M7-B・legendary）: 敵密集地点へ巨大な氷塊を落下。明確な予告のあと大範囲へ氷ダメージと高い冷気、高確率で凍結。
// 通常敵・エリートへ高めの凍結、frozen 敵を1対象1回粉砕。ボスへ大きな氷砕ゲージ。衝突後に短時間の凍結床を残す（低ダメージ・低 proc・画面を白くしない）。
// cooldown: recordCast は主発動（落下予約）時に1回。runtimeState: cdLeft / pendingImpactLeft / pendingImpactX / pendingImpactY（落下中の二重発生を防ぐ）。

import { SkillBase } from './SkillBase.js';

export class GlacierDropSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._pending = null; this.fields = []; }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    if (this._pending) return; // 落下待機中は多重予約しない
    const s = this.stats; const p = this.scene.player;
    const cap = this.scene.combat.skillCap('maxGlacierDrops', 2);
    if (this.fields.length >= cap) this._removeField(0);
    const spot = this.scene.combat.densestPoint(s.radius || 90, 0) || { x: p.x, y: p.y };
    this._startPending(spot.x, spot.y, s.delay || 800, s.radius || 90);
    this.scene.skills.recordExtra(this.id, 'glaciersDropped', 1, 'add');
  }

  _startPending(x, y, left, radius) {
    this.scene.effects.telegraph(x, y, radius, left, 0x4fc3f7);
    this._pending = { left, x, y, radius };
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（落下を予約）
    const now = this.scene.time.now;
    const s = this.stats;
    // 落下待機の解決。
    if (this._pending) {
      this._pending.left -= dt;
      if (this._pending.left <= 0) { const pd = this._pending; this._pending = null; this._impact(pd.x, pd.y, s); }
    }
    // 凍結床の tick。
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.until -= dt; f.tickLeft -= dt;
      if (f.gfx) f.gfx.setAlpha(0.12 * Math.max(0, f.until) / (f.maxDur || 1) + 0.03);
      if (f.tickLeft <= 0 && f.until > 0) {
        f.tickLeft = s.afterFieldTickRate || 360;
        this.scene.combat.damageArea(f.x, f.y, f.radius, s.afterFieldDamage || 6, this.id, {
          element: 'ice', tag: 'dot', chillAmount: (s.chillAmount || 30) * 0.15, procCoefficient: this.def?.config?.afterFieldProc ?? 0.15,
          hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80deea,
        });
      }
      if (f.until <= 0) this._removeField(i);
    }
  }

  _impact(x, y, s) {
    if (!this.scene.combat.frameBudget('glacierImpact', 'maxGlacierImpactsPerFrame')) { this._startPending(x, y, 80, s.radius || 90); return; }
    this.scene.effects.explosion(x, y, s.radius || 90, 0x9fe8ff);
    const hg = this.scene.nextHitGroupId();
    // 凍結中の敵を先に粉砕（1対象1回・ボス対象外・再帰なし）。
    for (const e of this.scene.combat.enemiesInRadius(x, y, s.radius || 90)) {
      if (this.scene.combat.isFrozen(e)) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: s.shatterMultiplier || 1.5, skillPower: s.impactDamage });
    }
    this.scene.combat.damageArea(x, y, s.radius || 90, s.impactDamage, this.id, {
      element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: s.baseFreezeChance,
      procCoefficient: this.def?.procCoefficient ?? 0.95, hitGroupId: hg, isExplosion: true, knockback: 30, color: 0x9fe8ff,
    });
    // 凍結床（残留・低 proc・地形として閉じ込めない）。
    const gfx = this.scene.add.circle(x, y, (s.radius || 90) * 0.7, 0x4fc3f7, 0.12).setDepth(5).setStrokeStyle(1, 0x80deea, 0.35);
    this.fields.push({ x, y, radius: (s.radius || 90) * 0.7, until: s.afterFieldDuration || 1500, maxDur: s.afterFieldDuration || 1500, tickLeft: 0, gfx });
    this.scene.skills.recordExtra(this.id, 'pendingImpactsCompleted', 1, 'add');
  }

  _removeField(i) { const f = this.fields[i]; if (f && f.gfx) f.gfx.destroy(); this.fields.splice(i, 1); }

  // 残響/複製（standard 既定）: fire() を再実行（追加の氷塊を落下・落下中は多重予約しないガードあり）。

  // 途中再開: クールダウン＋落下待機を保存し、無料再発動・二重落下を防ぐ。氷塊/床の位置は落下座標のみ保存。
  serializeState() {
    const st = { cdLeft: this._cd };
    if (this._pending) { st.pendingImpactLeft = this._pending.left; st.pendingImpactX = this._pending.x; st.pendingImpactY = this._pending.y; st.pendingImpactRadius = this._pending.radius; }
    return st;
  }
  restoreState(s) {
    if (!s) return;
    if (typeof s.cdLeft === 'number') this._cd = s.cdLeft;
    if (typeof s.pendingImpactLeft === 'number' && s.pendingImpactLeft > 0) {
      // 予告を安全に再構築（再開後の無料再発動・二重落下を防ぐ）。
      this._startPending(s.pendingImpactX || this.scene.player.x, s.pendingImpactY || this.scene.player.y, s.pendingImpactLeft, s.pendingImpactRadius || (this.stats.radius || 90));
    }
  }

  destroy() { for (const f of this.fields) if (f.gfx) f.gfx.destroy(); this.fields = []; this._pending = null; }
}
