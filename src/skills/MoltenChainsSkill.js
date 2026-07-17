// 熔火鎖（M6-D）: 近くの敵同士を炎の鎖で接続し継続ダメージ。通常敵は緩く互いへ引き寄せ（ボス除く）、
// 接続敵の死亡時は残回数の範囲で近くの敵へ再接続する。鎖1本につき line 画像は1枚を使い回す（毎フレーム再生成しない）。
// 同時鎖数は skillCaps(maxTethers)、再接続は frameBudget(maxTetherRetargetsPerFrame) で上限化。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class MoltenChainsSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.chains = []; // { a, b, timeLeft, tickLeft, retargetsLeft, line }
  }

  fire() {
    const s = this.stats; const p = this.scene.player; const combat = this.scene.combat;
    const range = s.range || 120;
    const near = combat.enemiesInRadius(p.x, p.y, range * 2);
    if (!near || near.length < 2) return;
    const cap = combat.skillCap('maxTethers', 16);
    const room = Math.max(0, cap - this.chains.length);
    const maxNew = Math.min(s.tethers || 2, room);
    const used = new Set(); // 1回の発動で同じ敵を二重に接続しない
    let made = 0;
    for (let i = 0; i < near.length && made < maxNew; i++) {
      const a = near[i];
      if (!a || !a.alive || used.has(a)) continue;
      // range 内の未使用の最寄り相手を選ぶ。
      let b = null, bd = Infinity;
      for (let j = 0; j < near.length; j++) {
        const c = near[j];
        if (c === a || !c || !c.alive || used.has(c)) continue;
        const d = Math.hypot(c.x - a.x, c.y - a.y);
        if (d <= range && d < bd) { bd = d; b = c; }
      }
      if (!b) continue;
      used.add(a); used.add(b);
      const line = this.scene.add.image(0, 0, TEX.PARTICLE)
        .setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setDepth(43).setAlpha(0.6);
      this.chains.push({ a, b, timeLeft: s.duration || 2600, tickLeft: s.tickRate || 300, retargetsLeft: s.retargets || 0, line });
      made++;
    }
    if (made) this.scene.skills.recordExtra(this.id, 'tethersCreated', made, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウン発火（fire）
    const s = this.stats; const range = s.range || 120;
    const pull = (s.pull || 0) * 0.3;
    for (let i = this.chains.length - 1; i >= 0; i--) {
      const ch = this.chains[i];
      ch.timeLeft -= dt;
      // 死亡端点は再接続を試みる（回数・毎フレーム予算を尊重）。
      if (!ch.a || !ch.a.alive) ch.a = this._retarget(ch, ch.b);
      if (!ch.b || !ch.b.alive) ch.b = this._retarget(ch, ch.a);
      if (!ch.a || !ch.b || ch.a === ch.b || ch.timeLeft <= 0) { this._dropChain(i); continue; }
      const dist = Math.hypot(ch.b.x - ch.a.x, ch.b.y - ch.a.y);
      if (dist > range * 1.6) { this._dropChain(i); continue; } // 離れすぎたら切れる
      // DoT tick。
      ch.tickLeft -= dt;
      if (ch.tickLeft <= 0) {
        ch.tickLeft = s.tickRate || 300;
        this.scene.combat.dealDamage(ch.a, s.dotDamage, this.id, { tag: 'dot', quiet: true, color: 0xff7043 });
        this.scene.combat.dealDamage(ch.b, s.dotDamage, this.id, { tag: 'dot', quiet: true, color: 0xff7043 });
      }
      // 通常敵のみ緩く相手方向へ引き寄せ（ボスは無効・ワープさせない）。
      if (pull > 0) {
        if (!ch.a.isBoss && ch.a.applyKnockback) ch.a.applyKnockback(2 * ch.a.x - ch.b.x, 2 * ch.a.y - ch.b.y, pull);
        if (!ch.b.isBoss && ch.b.applyKnockback) ch.b.applyKnockback(2 * ch.b.x - ch.a.x, 2 * ch.b.y - ch.a.y, pull);
      }
      this._drawLine(ch);
    }
    this.scene.skills.recordExtra(this.id, 'maxSimultaneousTethers', this.chains.length, 'max');
  }

  _retarget(ch, other) {
    if (ch.retargetsLeft <= 0 || !other || !other.alive) return null;
    if (!this.scene.combat.frameBudget('tetherRetarget', 'maxTetherRetargetsPerFrame')) return null; // 予算切れ → 今フレームは再接続しない
    const t = this.scene.combat.nearestEnemyExcept(other.x, other.y, this.stats.range || 120, new Set([other]));
    if (t) { ch.retargetsLeft--; this.scene.skills.recordExtra(this.id, 'retargets', 1, 'add'); return t; }
    return null;
  }

  _drawLine(ch) {
    if (!ch.line) return;
    const mx = (ch.a.x + ch.b.x) / 2, my = (ch.a.y + ch.b.y) / 2;
    const ang = Math.atan2(ch.b.y - ch.a.y, ch.b.x - ch.a.x);
    const len = Math.hypot(ch.b.x - ch.a.x, ch.b.y - ch.a.y);
    ch.line.setPosition(mx, my).setRotation(ang).setScale(Math.max(0.1, len / 8), 0.4);
  }

  _dropChain(i) {
    const ch = this.chains[i];
    if (ch.line) ch.line.destroy();
    ch.a = null; ch.b = null; ch.line = null;
    this.chains.splice(i, 1);
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st) this._cd = st.cdLeft || 0; }

  destroy() {
    for (const ch of this.chains) { if (ch.line) ch.line.destroy(); ch.a = null; ch.b = null; }
    this.chains = [];
  }
}
