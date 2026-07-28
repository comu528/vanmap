// 終焉連鎖（起爆刻印の進化・M6-B）: より多くの敵へ終焉刻印を付与。刻印敵の起爆/死亡で周囲の刻印を連鎖起爆し、
// 未刻印の敵へ拡散。一定連鎖で最終爆発（1連鎖1回）。連鎖/拡散/深度は BattleScene.chainDetonate が visited集合と
// 上限で明示制限し、起爆ダメージ自身は再起爆を生まない（isMarkDetonation）。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class ApocalypseChainSkill extends EvolvedSkillBase {
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const d = this.evoDef;
    const cap = this.scene.combat.skillCap('maxMarks', 40);
    let budget = Math.min(d.projectileCount?.markCount || 8, Math.max(0, cap - this.scene.combat.markedCount()));
    if (budget <= 0) return;
    const areaMul = this.passiveAreaMult(), durMul = this.passiveDurationMult();
    const now = this.scene.time.now;
    const markDur = (d.projectileCount?.markDuration || 6000) * durMul;
    for (const e of this.scene.combat.randomEnemies(budget * 3)) {
      if (budget <= 0) break;
      if (e.isBoss) continue;
      if (e._mark && now < e._mark.until) { e._mark.until = now + markDur; continue; }
      e._mark = {
        skillId: this.id, hits: 0, hitsNeeded: d.projectileCount?.hitsNeeded || 2, until: now + markDur,
        detonateDamage: d.damage?.detonate || 70, detonateRadius: (d.area?.detonateRadius || 70) * areaMul, deathDamage: d.damage?.death || 40,
        // chain.spreadOnChain=0 なら連鎖時に未刻印へ拡散しない。spreadCount は1回の連鎖起爆で拡散する上限。
        chain: true, spreadOnChain: (d.chain?.spreadOnChain ?? 1) > 0,
        spreadPerDetonation: Math.max(1, d.projectileCount?.spreadCount || 3),
        chainRadius: (d.area?.chainRadius || 90) * areaMul, maxDepth: this.cap('maxChainDepth', 8), maxSpread: this.cap('maxSpreadPerChain', 6),
        finalBlast: d.damage?.finalBlast || 180, finalRadius: (d.area?.finalRadius || 120) * areaMul, markDuration: markDur,
      };
      budget--;
    }
  }

  // M8-A: クールダウンを保存（刻印は敵側の状態のため保存しない＝再開後に無料起爆しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
}
