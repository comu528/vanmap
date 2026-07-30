// 血断処刑（M8-C・処刑斬の進化 / 補助: 血気 Lv4）:
// 通常敵の処刑閾値が大きく上がり、仕留めた瞬間に血気の回復が強まる。
// - エリート / ボスは**処刑できない**（失った HP に応じた追加ダメージのみ）。
// - 撃破の連鎖は 1 世代だけ（処刑から生まれた処刑がさらに連鎖しない）。
// - 死亡イベントは共通の dealDamage 経路が 1 回だけ発行する（二重処理しない）。
import { WarriorEvolvedBase } from './WarriorSkillBase.js';

export class CrimsonExecutionSkill extends WarriorEvolvedBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; this._chainGen = 0; }
  canFire(ctx) { return !!ctx.hasEnemies; }

  executeParams() {
    const d = this.evoDef;
    const x = d.execute || {};
    return {
      thresholdNormal: x.thresholdNormal || 0,
      missingHpBonusElite: x.missingHpBonusElite || 0,
      missingHpBonusBoss: x.missingHpBonusBoss || 0,
      bossMissingHpCap: x.bossMissingHpCap,
    };
  }

  fire() {
    if (this.scene.gameOver) return;
    const d = this.evoDef;
    const castKey = this.newCastKey();
    const p = this.scene.player;
    const range = this.meleeRadius(d.area?.range);
    const target = this.scene.combat.preferredMeleeTarget(p.x, p.y, range, 'lowHp');
    const ang = target ? Math.atan2(target.y - p.y, target.x - p.x) : this.facing(range);
    if (this.warrior) {
      this.warrior.setCastLimits(castKey, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
    this._chainGen = 0;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: range, arc: d.area?.arc, facing: ang,
      damage: d.damage?.strike, skillId: this.id, castKey,
      knockback: d.knockback?.strike, poiseDamage: d.poiseDamage?.strike, poiseOnceSet: new Set(),
      comboGain: d.comboGain?.perStrike, furyGain: d.furyGain?.perStrike,
      execute: this.executeParams(),
      maxExecutes: Math.min(this.cap('maxExecutesPerCast', 3), this.scene.combat.skillCap('maxExecutesPerCast', 3)),
      maxTargets: this.cap('maxTargetsPerStrike', 10),
      tags: ['melee', 'slash', 'execute'], color: 0xd32f2f, visualIndex: 0,
      visualCap: 'maxExecuteMarkers',
    });
    this.scene.skills.recordExtra(this.id, 'swings', 1, 'add');
  }

  // 撃破フック（SkillManager.dispatchKill）。処刑で倒したときだけ、1 世代だけ追撃処刑を行う。
  // 追撃から更に追撃は生まれない（maxGenerations=1）。recordCast もしない。
  onEnemyKilled(enemy, skillId) {
    if (skillId !== this.id || this._dead || this.scene.gameOver) return;
    const d = this.evoDef;
    const kc = d.killChain || {};
    // 仕留めた瞬間の血気回復の上乗せ（血気 passive を持っているときだけ効く。毎秒上限は共有）。
    if (this.warrior && kc.killHealBonus) this.warrior.noteKillHealBonus(enemy, kc.killHealBonus);
    const maxGen = Math.min(this.cap('maxKillChainGenerations', 1), kc.maxGenerations || 1);
    if (this._chainGen >= maxGen) return;
    this._chainGen += 1;
    const p = this.scene.player;
    const extra = Math.max(0, kc.extraKills || 0);
    if (extra <= 0) return;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(d.area?.range), arc: Math.PI * 2, facing: 0,
      damage: d.damage?.strike, skillId: this.id, castKey: `${this.id}#chain${this._chainGen}`,
      knockback: 0, poiseDamage: 0,
      comboGain: 0, furyGain: 0,
      execute: this.executeParams(),
      maxExecutes: extra,
      maxTargets: extra,
      tags: ['melee', 'slash', 'execute'], color: 0xb71c1c, visualIndex: 1,
      visualCap: 'maxExecuteMarkers',
    });
    this.scene.skills.recordExtra(this.id, 'killChains', 1, 'add');
    void enemy;
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st) this.restoreCd(st.cdLeft); this._chainGen = 0; }
  destroy() { this._dead = true; }
}