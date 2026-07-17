// 氷牢封印（frost_mage・M7-B・rare）: 冷気の高い敵/密集中心の敵を氷牢で封じる。大きな冷気を付与し、冷気が要求比率以上なら短時間凍結、
// 不足なら確定凍結せず大幅減速＋冷気。周囲へ小範囲氷ダメージを与え、終了時に小爆発。既に凍結中なら終了時に1回だけ粉砕できる。
// ボスは凍結不可・大きな氷砕ゲージへ変換（行動中断は既存 frostbreak 経路のみ）。freeze_immunity 中は強制凍結しない。
// cooldown: recordCast は氷牢生成時に1回。凍結は共通経路（freezeEnemy）を使い独自タイマーを持たない。

import { SkillBase } from './SkillBase.js';

export class IcePrisonSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.prisons = []; } // { x, y, endAt, target, gfx }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    const spot = this.scene.combat.densestPoint(s.radius || 70, 0) || { x: p.x, y: p.y };
    // 対象選定: 密集中心付近の敵を冷気比率の高い順に targetCount 体（決定論的ソート）。
    const cap = this.scene.combat.skillCap('maxIcePrisonTargetsPerFrame', 16);
    const cand = this.scene.combat.enemiesInRadius(spot.x, spot.y, (s.radius || 70) + 40).filter((e) => e.alive);
    cand.sort((a, b) => {
      const ca = this.scene.combat.chillRatio(a), cb = this.scene.combat.chillRatio(b);
      if (cb !== ca) return cb - ca;
      const da = (a.x - spot.x) ** 2 + (a.y - spot.y) ** 2, db = (b.x - spot.x) ** 2 + (b.y - spot.y) ** 2;
      return da - db;
    });
    const targets = cand.slice(0, Math.min(s.targetCount || 1, cap));
    let imprisoned = 0;
    const now = this.scene.time.now;
    const hg = this.scene.nextHitGroupId();
    for (const t of targets) {
      if (t.isBoss) {
        // ボス: 凍結せず氷砕ゲージを大きく付与。
        this.scene.combat.addBossGaugeTo(t, (s.chillAmount || 40) * 1.5);
      } else {
        this.scene.combat.applyChill(t, s.chillAmount);
        const ratio = this.scene.combat.chillRatio(t);
        if (ratio >= (s.requiredChillRatio || 0.6)) {
          if (!this.scene.combat.freezeEnemy(t) && t.applySlow) t.applySlow(0.6, s.prisonDuration || 1000);
        } else if (t.applySlow) {
          t.applySlow(0.6, s.prisonDuration || 1000); // 冷気不足: 確定凍結せず大幅減速
        }
      }
      // 主対象への氷ダメージ（高 proc）。
      this.scene.combat.dealDamage(t, s.damage, this.id, {
        element: 'ice', chillAmount: 0, procCoefficient: this.def?.procCoefficient ?? 0.95,
        hitGroupId: hg, color: 0x80d8ff,
      });
      const gfx = this.scene.add.circle(t.x, t.y, 18, 0x80deea, 0.18).setDepth(7).setStrokeStyle(1, 0xe1f5fe, 0.6);
      this.prisons.push({ x: t.x, y: t.y, endAt: now + (s.prisonDuration || 1000), target: t, gfx });
      imprisoned++;
    }
    // 周囲へ小範囲氷ダメージ（低め proc）。
    this.scene.combat.damageArea(spot.x, spot.y, s.radius || 70, s.surroundDamage || 8, this.id, {
      element: 'ice', chillAmount: (s.chillAmount || 40) * 0.3, procCoefficient: this.def?.config?.surroundProc ?? 0.45,
      hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80deea, exclude: null,
    });
    if (imprisoned) { this.scene.skills.recordExtra(this.id, 'prisonsCreated', 1, 'add'); this.scene.skills.recordExtra(this.id, 'targetsImprisoned', imprisoned, 'add'); }
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const now = this.scene.time.now;
    const s = this.stats;
    for (let i = this.prisons.length - 1; i >= 0; i--) {
      const pr = this.prisons[i];
      if (pr.target && pr.target.alive && pr.gfx) pr.gfx.setPosition(pr.target.x, pr.target.y);
      if (now < pr.endAt) continue;
      // 終了時の小爆発。既に凍結中なら1回だけ粉砕。
      const ex = pr.target && pr.target.alive ? pr.target.x : pr.x, ey = pr.target && pr.target.alive ? pr.target.y : pr.y;
      if (pr.target && pr.target.alive && this.scene.combat.isFrozen(pr.target)) {
        this.scene.combat.shatterEnemy(pr.target, { skillId: this.id, multiplier: s.shatterMultiplier || 1.2, skillPower: s.damage });
      }
      this.scene.effects.explosion(ex, ey, 34, 0x9fe8ff);
      this.scene.combat.damageArea(ex, ey, 34, s.endExplosionDamage || 30, this.id, {
        element: 'ice', chillAmount: (s.chillAmount || 40) * 0.2, procCoefficient: this.def?.procCoefficient ?? 0.95,
        hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x9fe8ff,
      });
      if (pr.gfx) pr.gfx.destroy();
      this.prisons.splice(i, 1);
    }
  }

  // 残響/複製（custom）: 周囲へ封印パルスを1回ぶん（氷牢は多重生成しない）。
  echoCast() {
    const s = this.stats; const p = this.scene.player;
    this.scene.combat.damageArea(p.x, p.y, s.radius || 70, s.damage * 0.5, this.id, {
      element: 'ice', chillAmount: s.chillAmount, procCoefficient: this.def?.config?.surroundProc ?? 0.45,
      hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x80deea,
    });
  }
  cloneCast() { this.echoCast(); }

  // 途中再開でクールダウンのみ維持（対象/氷牢の位置は保存せず＝無料再発動しない・二重生成しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }

  destroy() { for (const pr of this.prisons) if (pr.gfx) pr.gfx.destroy(); this.prisons = []; }
}
