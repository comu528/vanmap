// 灼熱共鳴（M6-E・希少/状態スケール）: 一定間隔で範囲内の炎上中の敵数を数え、共鳴段階（tier）に応じて
// プレイヤー/密集点を中心にパルス攻撃。炎上敵が多いほど威力・半径・追加爆発・炎上延長が強化される。
// 炎上0でも最小限のパルスは出す。tier は burningCount のみで決まり、範囲パッシブは半径のみに効く（tier は増やさない）。
// echo/clone は「攻撃パルスのみ」を再現（熱量/チャージ等の状態を持たないため fire の再実行で足りる）。
// 追加爆発・炎上延長・各対象ヒットでは recordCast しない（主発動 resonancePulse のみ base.update が記録）。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class ScorchingResonanceSkill extends SkillBase {
  // canFire は既定（ctx.hasEnemies）。cooldown / recordCast / fire は base.update が管理する。

  // 炎上数 → tier（threshold 以上の最大 index）を maxTier でクランプ。
  _tierFor(burning) {
    const th = (this.def.config && this.def.config.tierThresholds) || [0, 5, 15, 30, 60];
    let tier = 0;
    for (let t = 0; t < th.length; t++) { if (burning >= th[t]) tier = t; }
    const maxTier = (this.stats && this.stats.maxTier != null) ? this.stats.maxTier : 2;
    return Math.min(tier, maxTier);
  }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const combat = this.scene.combat; const p = this.scene.player;

    const burning = combat.burningCount();
    const tier = this._tierFor(burning);
    const power = (s.baseDamage || 12) * (1 + (s.resonanceMult || 0) * tier);
    // tier は炎上数のみで決定。半径はパッシブ火範囲を1回だけ乗算する。
    const pulseRadius = (s.radius || 60) * (1 + 0.08 * tier) * this.passiveAreaMult();
    const countRadius = (this.def.config && this.def.config.countRadius) || 260;

    // 中心 = 敵密集点（なければプレイヤー）。
    const dense = combat.densestPoint(countRadius, 0);
    const cx = dense ? dense.x : p.x;
    const cy = dense ? dense.y : p.y;

    // 主パルス: 範囲内の全敵へ1回ずつダメージ（非炎上敵にも当たる）。
    const igniteMs = s.igniteExtendMs || 0;
    const igniteCap = s.hitCapPerPulse || 3; // 炎上延長を与える敵数の上限（判定爆発ではなく延長の負荷制限）。
    const targets = combat.enemiesInRadius(cx, cy, pulseRadius);
    let igniteApplied = 0;
    for (const e of targets) {
      combat.dealDamage(e, power, this.id, { isExplosion: false, element: 'fire' });
      // 炎上中の敵は炎上時間を延長（tier 相当のご褒美）。上限までのみ。
      if (igniteMs > 0 && e.ignited && igniteApplied < igniteCap) {
        combat.ignite(e, igniteMs, 0);
        igniteApplied++;
      }
    }

    // 追加小爆発: tier でスケールし、min(extraBlasts, skillCap) で上限化。爆発は炎上敵位置（なければ中心周り）。
    const blastCap = Math.min(s.extraBlasts || 0, combat.skillCap('maxResonanceExplosions', 3));
    const nBlasts = Math.min(blastCap, tier);
    if (nBlasts > 0) {
      const list = combat.burningEnemies(60);
      const blastR = (s.radius || 60) * 0.5 * this.passiveAreaMult() * this.explosionAreaMult();
      for (let i = 0; i < nBlasts; i++) {
        let bx, by;
        if (list.length > 0) { const b = list[i % list.length]; bx = b.x; by = b.y; }
        else { const a = this.scene.rng() * Math.PI * 2; bx = cx + Math.cos(a) * pulseRadius * 0.6; by = cy + Math.sin(a) * pulseRadius * 0.6; }
        combat.damageArea(bx, by, blastR, power * 0.6, this.id, { isExplosion: true, element: 'fire' });
        this.scene.effects.explosion(bx, by, blastR, 0xff7043);
      }
      this.scene.skills.recordExtra(this.id, 'resonanceExplosions', nBlasts, 'add');
    }

    // 演出（パルス本体）。
    this.scene.effects.explosion(cx, cy, pulseRadius, 0xffab40);
    this.scene.effects.sparks(cx, cy, 6, 0xffca28);

    // 統計（recordCast は base.update が担当。ここでは付随統計のみ）。
    this.scene.skills.recordExtra(this.id, 'resonancePulses', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'maxResonanceLevel', tier, 'max');
    this.scene.skills.recordExtra(this.id, 'burningEnemiesCounted', burning, 'add');
  }

  // 残響/複製: 攻撃パルスのみ再現（状態を持たないため fire と同じ挙動でよい。tier は炎上数で再計算）。
  echoCast() { this.fire(); }
  cloneCast() { this.echoCast(); }

  // tier は復元時に炎上数から再計算するため保存不要。CD のみ保存する（リロードで有利化しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (!st) return; this._cd = st.cdLeft || 0; }

  destroy() {}
}
