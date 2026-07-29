// 昇竜斬（M8-D・戦士 Wave2）: 前方の狭い縦斬り。
// - 通常敵だけを短く打ち上げる。エリート / ボスは打ち上げず、その分を体勢削りへ変換する。
//   可否の判断は WarriorCombatSystem.launchPolicy() に一元化してある（スキル側で isBoss を見ない）。
// - 同一敵は 1 発動につき 1 回しか打ち上げない。さらに免疫時間があるので無限に浮かせ続けられない。
// - 打ち上げの残留は Enemy.reset / onEnemyRemoved が必ず落とす。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class RisingSlashSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire(ctx) { return !!ctx.hasEnemies; }

  // 進化（天衝断空）が上書きするパラメータ。
  risingParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      damage: s.damage || 0, range: s.range || 0, width: s.width || 0,
      launchDuration: s.launchDuration || 0, launchHeight: cfg.launchHeight || 0,
      poiseDamage: s.poiseDamage || 0, knockback: s.knockback || 0,
      maxTargets: s.maxTargets || 1, comboGain: s.comboGain, furyGain: s.furyGain,
      // 1 発動につき同一敵を浮かせられる回数（data 由来）と、その後の打ち上げ免疫。
      launchPerTarget: cfg.launchOncePerTargetPerCast === false ? 2 : 1,
      launchImmuneMs: cfg.launchImmuneMs ?? 0,
    };
  }

  update(dt, ctx) { if (this._dead) return; super.update(dt, ctx); }

  fire() {
    if (this._dead || this.scene.gameOver) return;
    const P = this.risingParams();
    if (!P.range) return;
    const castKey = this.newCastKey();
    const radius = this.meleeRadius(P.range);
    const cfg = this.def?.config || {};
    // 密集地点を向く（共通経路・全敵総当たりなし）。
    const ang = cfg.preferCluster === false ? this.facing(radius) : this.facing(radius);
    // 1 発動につき同一敵を打ち上げられる回数を数える（Map: 敵の安定 runtime id → 回数）。
    this._slash(ang, castKey, P, 0, new Map());
    this.scene.skills.recordExtra(this.id, 'slashes', 1, 'add');
  }

  _slash(ang, castKey, P, index, launched) {
    const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(P.range), arc: P.width, facing: ang,
      damage: P.damage, skillId: this.id, castKey,
      knockback: P.knockback, poiseDamage: P.poiseDamage, poiseOnceSet: new Set(),
      comboGain: P.comboGain, furyGain: P.furyGain,
      maxTargets: Math.min(P.maxTargets, this.scene.combat.skillCap('maxLaunchTargets', 6)),
      launch: { durationMs: P.launchDuration, height: P.launchHeight, counts: launched, maxPerTarget: P.launchPerTarget, immuneMs: P.launchImmuneMs },
      tags: ['melee', 'slash', 'launch'], color: 0xfff59d, visualIndex: index,
      visualCap: 'maxLaunchVisuals',
    });
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { this._dead = true; }
}
