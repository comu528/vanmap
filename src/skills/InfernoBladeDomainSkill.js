// 炎帝剣域（炎月斬の進化・M6-D）: 巨大な三日月刃を複数展開。通常は回転防御、発動時は広範囲斬撃。
// 炎の障壁が被弾を防ぐたびに追加の反撃斬撃（障壁1防御につき1回・無限反撃なし）。刃は回転のみでボスを押さない。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

export class InfernoBladeDomainSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.blades = [];
    this._angle = 0;
    this._lastBlocks = 0;
  }

  _ensureBlades() {
    const cap = this.cap('maxInfernoBlades', 8);
    const want = Math.min(this.evoDef.projectileCount?.blades || 4, cap);
    while (this.blades.length < want) {
      const b = this.scene.add.image(0, 0, TEX.PARTICLE).setTint(0xffab40).setBlendMode(Phaser.BlendModes.ADD).setDepth(47).setScale(3, 1.1).setAlpha(0.6);
      this.blades.push(b);
    }
    while (this.blades.length > want) { const b = this.blades.pop(); if (b) b.destroy(); }
  }

  // 発動時の広範囲斬撃。arc≈全周のため半径内の敵を上限つきで薙ぐ。ボスはノックバックしない。
  fire() {
    const d = this.evoDef; const p = this.scene.player;
    const r = (d.area?.radius || 78) * this.passiveAreaMult();
    const slash = d.damage?.slash || 52;
    const cap = this.cap('maxSimultaneousHits', 40);
    let hits = 0;
    this.scene.effects.explosion(p.x, p.y, r, 0xffab40);
    for (const e of this.scene.combat.enemiesInRadius(p.x, p.y, r)) {
      if (hits >= cap) break;
      this.scene.combat.dealDamage(e, slash, this.id, { color: 0xffab40, knockback: e.isBoss ? 0 : 40, from: { x: p.x, y: p.y } });
      this.scene.skills.recordExtra(this.id, 'slashDamage', slash, 'add');
      hits++;
    }
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()＝広範囲斬撃
    const p = this.scene.player;
    this._ensureBlades();
    this._angle += dt * 0.004;
    const n = this.blades.length;
    const orbit = (this.evoDef.area?.radius || 78) * 0.5 * this.passiveAreaMult();
    for (let i = 0; i < n; i++) {
      const a = this._angle + (Math.PI * 2 * i) / Math.max(1, n);
      const b = this.blades[i];
      if (b) { b.setPosition(p.x + Math.cos(a) * orbit, p.y + Math.sin(a) * orbit); b.setRotation(a + Math.PI / 2); }
    }
    // 反撃: 障壁の blocks 増加分だけ反撃斬撃（障壁を直接フックできないため状態を監視）。
    const bar = p._barrier;
    const blocks = bar ? (bar.blocks || 0) : 0;
    if (blocks > this._lastBlocks) {
      const delta = blocks - this._lastBlocks;
      const perBlock = Math.max(0, this.cap('maxRetaliationsPerHit', 1));
      for (let k = 0; k < delta; k++) for (let j = 0; j < perBlock; j++) this._retaliate();
    }
    this._lastBlocks = blocks;
  }

  _retaliate() {
    const p = this.scene.player; const d = this.evoDef;
    const r = (d.area?.radius || 78) * this.passiveAreaMult();
    const dmg = d.damage?.retaliate || 40;
    const cap = this.cap('maxSimultaneousHits', 40);
    let hits = 0;
    this.scene.effects.explosion(p.x, p.y, r, 0xff5252);
    for (const e of this.scene.combat.enemiesInRadius(p.x, p.y, r)) {
      if (hits >= cap) break;
      this.scene.combat.dealDamage(e, dmg, this.id, { color: 0xff5252, knockback: e.isBoss ? 0 : 30, from: { x: p.x, y: p.y } });
      this.scene.skills.recordExtra(this.id, 'retaliateDamage', dmg, 'add');
      hits++;
    }
  }

  echoCast(ctx) { this.fire(ctx); }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s) this._cd = s.cdLeft || 0; }
  destroy() { for (const b of this.blades) if (b) b.destroy(); this.blades = []; }
}
