// 山岳投擲（M8-D・豪腕投げの進化 / 補助: 大地砕き Lv6）:
// 掴んだ通常敵を遠くへ放り、着地点に巨大な衝撃を作る。
// - 補助の ground_slam は**置換されない**。CD も一切触らない（別スキルとして併存する）。
// - エリートはその場で叩きつけ、少し遅れて二撃目が入る。ボスは掴まず、重い一撃＋体勢削りへ置換。
// - 投げた敵が着地しても、そこから投げが連鎖することはない（衝撃は 1 発動 1 回）。
// - 死亡イベントは共通経路（dealDamage）が 1 回だけ出す。二重に出さない。
import { BattlefieldThrowSkill } from './BattlefieldThrowSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class MountainHurlSkill extends BattlefieldThrowSkill {
  throwParams() {
    const d = this.evoDef;
    return {
      damage: d.damage?.thrown || 0,
      grabRange: d.area?.grabRange || 0,
      throwDistance: d.throw?.distance || 0,
      impactRadius: d.area?.impactRadius || 0,
      impactDamage: d.damage?.impact || 0,
      eliteSlam: d.damage?.eliteSlam || 0,
      bossPoise: d.poiseDamage?.bossStrike || 0,
      knockback: d.knockback?.impact || 0,
      poiseDamage: d.poiseDamage?.impact || 0,
      comboGain: d.comboGain?.perImpact, furyGain: d.furyGain?.perImpact,
      secondaryRadius: d.area?.secondaryRadius || 0,
      secondaryDamage: d.damage?.eliteSecondary || 0,
      bossStrike: d.damage?.bossStrike || 0,
      grabDurationMs: 220,
      throwSpeed: d.throw?.speed ?? 700,
      maxThrowMs: d.throw?.maxThrowMs ?? 640,
      worldMargin: 24,
    };
  }

  // 1 発動 = 1 castKey。闘気 / コンボの加算上限をその場で結び付ける。
  newCastKey() {
    const key = super.newCastKey();
    const d = this.evoDef;
    if (this.warrior) {
      this.warrior.setCastLimits(key, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
    return key;
  }

  // 1 発動で掴めるのは maxGrabPerCast まで（0 なら掴まず代替へ落ちる）。
  maxGrabPerCast() {
    return Math.min(this.cap('maxGrabPerCast', 1), this.warrior ? this.warrior.maxGrabPerCast() : 1);
  }

  // 着地衝撃（通常敵）。範囲・威力ともに base より大きい。
  _land(T, P, e) {
    if (this._throw !== T) return;
    this._throw = null;
    const lx = e.x, ly = e.y;
    this.scene.combat.releaseGrab(false);
    if (this.warrior) this.warrior.noteThrowImpact(T.moved);
    this.scene.combat.meleeStrike({
      x: lx, y: ly, radius: this.meleeRadius(P.impactRadius), arc: Math.PI * 2, facing: 0,
      damage: P.impactDamage, skillId: this.id, castKey: T.castKey,
      knockback: P.knockback, poiseDamage: P.poiseDamage, poiseOnceSet: new Set(),
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: this.cap('maxTargetsPerImpact', 24),
      tags: ['melee', 'blunt', 'area', 'throw'], color: 0x8d6e63, visualIndex: 0, debris: true,
      visualCap: 'maxThrowArcs',
    });
    this.scene.skills.recordExtra(this.id, 'throws', 1, 'add');
  }

  // エリート叩きつけの二撃目（同じ castKey ＝ 追加 recordCast なし）。
  _secondary(castKey, P, x, y) {
    const d = this.evoDef;
    const impacts = Math.min(this.cap('maxImpactsPerCast', 2), this.scene.combat.skillCap('maxThrowImpacts', 2));
    if (impacts < 2) return;
    const delay = d.secondaryImpact?.delayMs || 260;
    this.scene.time.delayedCall(delay, () => {
      if (this._dead || this.scene.gameOver) return;
      this.scene.combat.meleeStrike({
        x, y, radius: this.meleeRadius(P.secondaryRadius), arc: Math.PI * 2, facing: 0,
        damage: P.secondaryDamage, skillId: this.id, castKey,
        knockback: d.knockback?.secondary || 0,
        poiseDamage: d.poiseDamage?.eliteSlam || 0, poiseOnceSet: new Set(),
        comboGain: P.comboGain, furyGain: P.furyGain,
        maxTargets: this.cap('maxTargetsPerImpact', 24),
        tags: ['melee', 'blunt', 'area'], color: 0x6d4c41, visualIndex: 1, debris: true,
        visualCap: 'maxThrowArcs',
      });
      this.scene.skills.recordExtra(this.id, 'secondaries', 1, 'add');
    });
  }
}
applyEvolvedSemantics(MountainHurlSkill);
