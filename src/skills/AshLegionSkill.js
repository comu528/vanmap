// 灰燼軍勢（灰燼分身の進化・M6-D）: 灰燼分身と火の精霊の混成軍勢を召喚。分身は直近の攻撃を時間差で複製、
// 一部は専用火弾を発射。時間オフセットで同フレーム集中を避け、毎フレーム予算で有限化。軍勢の攻撃は残響/追加分身を発生させない（scene 側で保証）。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

export class AshLegionSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.units = [];
    this._angle = 0;
  }
  canFire() { return false; } // 常時 update で管理

  _ensure() {
    const cap = this.cap('maxAshLegionUnits', 8);
    const want = Math.min(this.evoDef.projectileCount?.units || 6, cap);
    const d = this.evoDef;
    while (this.units.length < want) {
      const i = this.units.length;
      const type = (i % 2 === 0) ? 'clone' : 'bolt';
      const tint = type === 'clone' ? 0xb0bec5 : 0xffca28;
      const spr = this.scene.add.image(0, 0, type === 'clone' ? TEX.PLAYER : TEX.FIREBALL)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(50).setAlpha(0.5).setScale(type === 'clone' ? 0.8 : 0.7).setTint(tint);
      const interval = type === 'clone' ? (d.projectileCount?.copyIntervalMs || 900) : (d.projectileCount?.boltInterval || 1100);
      // M8-A: 途中再開の直後だけ、保存しておいた発動タイマーを引き継ぐ（無料の一斉発動を作らない）。
      const restored = this._pendingTimers && this._pendingTimers.length ? this._pendingTimers.shift() : null;
      this.units.push({ sprite: spr, type, interval, timer: typeof restored === 'number' ? restored : this.scene.rng() * interval });
    }
    if (this._pendingTimers && !this._pendingTimers.length) this._pendingTimers = null;
    while (this.units.length > want) { const u = this.units.pop(); if (u.sprite) u.sprite.destroy(); }
  }

  update(dt) {
    const p = this.scene.player; const d = this.evoDef;
    this._ensure();
    this._angle += dt * 0.0015;
    const n = this.units.length;
    if (n) this.scene.skills.recordExtra(this.id, 'highestConcurrentObjects', n, 'max');
    for (let i = 0; i < n; i++) {
      const u = this.units[i];
      const a = this._angle + (Math.PI * 2 * i) / n;
      const ox = p.x + Math.cos(a) * 34, oy = p.y + Math.sin(a) * 34; // 隊列（プレイヤーと重ならず分散）
      if (u.sprite) u.sprite.setPosition(ox, oy);
      u.timer -= dt;
      if (u.timer > 0) continue;
      u.timer = u.interval;
      if (!this.scene.combat.frameBudget('legionCast', 'maxAshLegionCastsPerFrame')) { u.timer = 120; continue; }
      if (u.type === 'clone') {
        // performClone は内部で cloneCast 予算/再帰ガードを持つ（世代管理は scene 側）。
        if (this.scene.combat.performClone(d.damage?.copyPower || 0.5)) this.scene.skills.recordExtra(this.id, 'cloneCasts', 1, 'add');
      } else {
        const t = this.scene.combat.nearestEnemy(ox, oy, 100000);
        if (t && this.scene.projPool.activeCount < this.scene.projPool.maxSize) {
          const ang = Math.atan2(t.y - oy, t.x - ox);
          this.scene.combat.spawnPlayerProjectile(ox, oy, ang, 320, {
            skillId: this.id, damage: d.damage?.boltDamage || 18, pierce: 0, scale: 0.6, lifeMs: 1100, tint: 0xffca28, element: 'fire',
          });
        } else { u.timer = 120; }
      }
    }
  }

  destroy() { for (const u of this.units) if (u.sprite) u.sprite.destroy(); this.units = []; }

  // M8-A: 隊列の位相と各ユニットの発動タイマーを保存する（ユニット本体は _ensure() が作り直すため二重生成しない）。
  // 以前は空オブジェクトを返すだけで restoreState も無く、再開直後に全ユニットが無料で一斉発動していた。
  serializeState() { return { angle: this._angle, timers: this.units.map((u) => u.timer) }; }
  restoreState(s) {
    if (!s) return;
    if (typeof s.angle === 'number') this._angle = s.angle;
    if (Array.isArray(s.timers)) this._pendingTimers = s.timers.slice(0, 16);
  }
}
