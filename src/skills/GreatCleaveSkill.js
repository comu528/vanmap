// 大薙ぎ（M8-B・戦士の基本 active）: 前方へ扇状に薙ぎ払う近接斬撃。
// 敵の密集方向（無ければ最寄り敵 → 移動方向）を向き、arc 内の敵を strikes 回叩く。
// 遠距離へ飛ぶ斬撃波は出さない（近接 arc 判定のみ）。Job Lv80 で打撃数 +1（追加打撃で recordCast は増やさない）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class GreatCleaveSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._pending = []; }
  canFire(ctx) { return !!ctx.hasEnemies; }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const castKey = this.newCastKey();
    const strikes = this.strikeCount(s.strikes || 1);
    const gap = (this.def?.config?.strikeIntervalMs ?? 110);
    const ang = this.facing(this.meleeRadius(s.radius));
    // 1 打撃目は即時。2 打撃目以降は等間隔（破棄ガードつきの遅延）。
    this._strike(ang, castKey, 0);
    for (let k = 1; k < strikes; k++) {
      this.scene.time.delayedCall(k * gap, () => {
        if (this._dead || this.scene.gameOver) return;
        this._strike(ang, castKey, k);
      });
    }
    this.scene.skills.recordExtra(this.id, 'strikes', strikes, 'add');
  }

  _strike(ang, castKey, index) {
    const s = this.stats; const p = this.scene.player;
    this.scene.combat.meleeStrike({
      x: p.x, y: p.y, radius: this.meleeRadius(s.radius), arc: s.arc, facing: ang,
      damage: s.damage, skillId: this.id, castKey,
      knockback: s.knockback, poiseDamage: s.poiseDamage,
      comboGain: s.comboGain, furyGain: s.furyGain,
      tags: ['melee', 'slash'], color: 0xffd54f, visualIndex: index,
    });
  }

  // M8-B: クールダウンを保存し、再開直後の無料発動を防ぐ。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st) this.restoreCd(st.cdLeft); }
  destroy() { this._dead = true; this._pending = []; }
}
