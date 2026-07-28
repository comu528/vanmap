// 煉獄大火輪（火炎渦の進化・M6-B）: 移動する複数の火炎竜巻。画面内を移動して敵を吸引、通過地点へ燃焼地帯を残し、
// 範囲内の炎上を感染。持続終了時に全竜巻が同時爆発。感染/吸引/同時爆発に明示上限。竜巻の移動目標は分散。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

export class InfernalVortexWheelSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.vortices = []; this.patches = []; }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const d = this.evoDef;
    const cap = this.scene.combat.skillCap('maxActiveVortices', 4);
    if (this.vortices.length >= cap) return;
    const areaMul = this.passiveAreaMult(), durMul = this.passiveDurationMult();
    const n = Math.min(d.projectileCount?.vortices || 3, cap - this.vortices.length);
    const p = this.scene.player;
    for (let i = 0; i < n; i++) {
      const ang = (i / Math.max(1, n)) * Math.PI * 2 + this.scene.rng();
      const spr = this.scene.add.image(p.x, p.y, TEX.PARTICLE).setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setDepth(43).setAlpha(0.34).setScale((d.area?.radius || 74) / 2);
      this.vortices.push({
        x: p.x, y: p.y, radius: (d.area?.radius || 74) * areaMul, tickDmg: d.damage?.tick || 16, pull: d.projectileCount?.pull || 66,
        tick: 0, tickRate: d.projectileCount?.tickRate || 250, drop: 0, expire: (d.projectileCount?.duration || 4000) * durMul,
        endBurst: d.damage?.endBurst || 90, moveSpeed: d.area?.moveSpeed || 45, tx: p.x, ty: p.y, retarget: 0, sprite: spr,
        infectR: (d.area?.infectRadius || 44) * areaMul,
      });
    }
    this.scene.skills.recordExtra(this.id, 'maxConcurrent', this.vortices.length, 'max');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    let infectBudget = this.cap('maxInfectPerFrame', 6);
    for (let i = this.vortices.length - 1; i >= 0; i--) {
      const v = this.vortices[i];
      v.expire -= dt; v.tick -= dt; v.drop -= dt; v.retarget -= dt;
      // 移動目標を分散（一定間隔で密集地点/ランダムへ）。
      if (v.retarget <= 0) {
        v.retarget = 900;
        const spot = this.scene.combat.densestPoint(v.radius, i % 3);
        v.tx = spot ? spot.x : (v.x + (this.scene.rng() - 0.5) * 200);
        v.ty = spot ? spot.y : (v.y + (this.scene.rng() - 0.5) * 200);
      }
      const a = Math.atan2(v.ty - v.y, v.tx - v.x);
      v.x += Math.cos(a) * v.moveSpeed * dt / 1000;
      v.y += Math.sin(a) * v.moveSpeed * dt / 1000;
      if (v.sprite) { v.sprite.setPosition(v.x, v.y); v.sprite.setRotation((v.sprite.rotation || 0) + dt * 0.012); }
      // 通過地点に燃焼地帯を残す
      if (v.drop <= 0) { v.drop = 260; this._dropBurn(v.x, v.y, (this.evoDef.area?.burnGroundRadius || 30)); }
      if (v.tick <= 0) {
        v.tick = v.tickRate;
        this.scene.combat.forEachEnemyInRadius(v.x, v.y, v.radius, (e) => {
          this.scene.combat.dealDamage(e, v.tickDmg, this.id, { quiet: true, color: 0xff7043, tag: 'dot' });
          if (e.applyKnockback) e.applyKnockback(2 * v.x - e.x, 2 * v.y - e.y, e.isBoss ? v.pull * 0.15 : v.pull * 0.3);
          // 炎上感染（上限内・ボス除外）
          if (infectBudget > 0 && e.ignited && !e.isBoss) {
            infectBudget -= 1;
            // chain.infect = 感染の世代番号（BattleScene の maxInfectGenerations が上限を持つ）。
            const gen = this.evoDef.chain?.infect ?? 1;
            this.scene.combat.forEachEnemyInRadius(e.x, e.y, v.infectR, (o) => { if (!o.isBoss && o.ignite && !o.ignited) o.ignite(1200, gen); });
          }
        });
      }
      if (v.expire <= 0) {
        // 同時爆発（上限内）
        if (this.scene._explosionBudget > 0) { this.scene._explosionBudget -= 1; this.scene.effects.meteorImpact(v.x, v.y, v.radius); this.scene.aoe(v.x, v.y, v.radius, v.endBurst, this.id, { crit: true }); }
        if (v.sprite) v.sprite.destroy();
        this.vortices.splice(i, 1);
      }
    }
    // 燃焼地帯 tick
    for (let i = this.patches.length - 1; i >= 0; i--) {
      const patch = this.patches[i]; patch.expire -= dt; patch.tick -= dt;
      if (patch.sprite) patch.sprite.setAlpha(0.4 * Math.max(0, patch.expire) / (patch.maxDuration || 1));
      if (patch.tick <= 0) { patch.tick = 260; this.scene.combat.forEachEnemyInRadius(patch.x, patch.y, patch.radius, (e) => this.scene.combat.dealDamage(e, this.evoDef.damage?.burnGround || 8, this.id, { quiet: true, color: 0xff5722, tag: 'dot' })); }
      if (patch.expire <= 0) { if (patch.sprite) patch.sprite.destroy(); this.patches.splice(i, 1); }
    }
  }

  _dropBurn(x, y, radius) {
    const dur = (this.evoDef.area?.burnGroundDuration || 900) * this.passiveDurationMult();
    const sprite = this.scene.add.image(x, y, TEX.PARTICLE).setTint(0xff5722).setBlendMode(Phaser.BlendModes.ADD).setDepth(42).setScale(radius / 4).setAlpha(0.4);
    this.patches.push({ x, y, radius: radius * this.passiveAreaMult(), expire: dur, maxDuration: dur, tick: 0, sprite });
  }

  destroy() {
    for (const v of this.vortices) if (v.sprite) v.sprite.destroy();
    for (const p of this.patches) if (p.sprite) p.sprite.destroy();
    this.vortices = []; this.patches = [];
  }

  // M8-A: クールダウンを保存（竜巻/燃焼地帯は寿命つきのため保存せず二重生成しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
}
