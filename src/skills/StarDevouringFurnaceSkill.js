// 星喰い炉（弾喰い炉の進化・M6-D）: 周囲へ吸収核を展開し、吸収した敵弾を共有チャージへ変換。最大で全方向弾幕＋大爆発＋短時間防御。
// 不死鳥の致死回避時にチャージを最大化し自動放出（同一致死1回・不死鳥は消費/再発動しない）。吸収は恒久無敵化しない（有限）。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

export class StarDevouringFurnaceSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.cores = [];
    this._charge = 0;
    this._releaseCd = 0;
    this._absorbAllow = 0;   // 毎秒吸収レートのバケツ
    this._lastPhoenix = 0;
    this._coreAngle = 0;
  }
  canFire() { return false; } // 常時 update で管理

  _maxCharge() { return Math.min(this.cap('maxFurnaceCharge', 14), this.evoDef.projectileCount?.maxCharge || 14); }

  _ensure() {
    const cap = this.cap('maxStarFurnaceCores', 6);
    const want = Math.min(this.evoDef.projectileCount?.cores || 4, cap);
    while (this.cores.length < want) {
      const spr = this.scene.add.image(0, 0, TEX.PARTICLE).setTint(0xffd54f).setBlendMode(Phaser.BlendModes.ADD).setDepth(48).setScale(1.6).setAlpha(0.6);
      this.cores.push({ sprite: spr });
    }
    while (this.cores.length > want) { const c = this.cores.pop(); if (c.sprite) c.sprite.destroy(); }
  }

  update(dt) {
    const p = this.scene.player; const d = this.evoDef;
    this._ensure();
    this._coreAngle += dt * 0.002;
    const n = this.cores.length;
    const orbit = (d.area?.absorbRadius || 64) * 0.6;
    const rate = this.cap('maxAbsorbedBulletsPerSecond', 16);
    this._absorbAllow = Math.min(rate, this._absorbAllow + rate * dt / 1000);
    if (this._releaseCd > 0) this._releaseCd -= dt;
    const maxC = this._maxCharge();
    const absorbR = (d.area?.absorbRadius || 64) * this.passiveAreaMult();
    for (let i = 0; i < n; i++) {
      const c = this.cores[i];
      const a = this._coreAngle + (Math.PI * 2 * i) / n;
      const cx = p.x + Math.cos(a) * orbit, cy = p.y + Math.sin(a) * orbit;
      if (c.sprite) { c.sprite.setPosition(cx, cy); c.sprite.setAlpha(0.4 + 0.5 * (this._charge / Math.max(1, maxC))); }
      const room = Math.min(Math.floor(this._absorbAllow), maxC - this._charge);
      if (room > 0) {
        const res = this.scene.combat.absorbBossBullets(cx, cy, absorbR, room);
        if (res.absorbed > 0) { this._charge += res.absorbed; this._absorbAllow -= res.absorbed; this.scene.skills.recordExtra(this.id, 'bulletsAbsorbed', res.absorbed, 'add'); }
      }
    }
    // 最大チャージで放出。
    if (this._charge >= maxC && this._releaseCd <= 0) this._burst();
    // 不死鳥リンク: 致死回避（triggers 増加）を検知したらチャージ最大化＋1回だけ自動放出。不死鳥の状態は触らない。
    const ph = p._phoenix; const trig = ph ? (ph.triggers || 0) : 0;
    if (trig > this._lastPhoenix) { this._charge = maxC; this._burst(); }
    this._lastPhoenix = trig;
  }

  _burst() {
    this._fireBarrage();
    this._charge = 0;
    this._releaseCd = 600;
    const p = this.scene.player; const now = this.scene.time.now;
    p._invulnUntil = Math.max(p._invulnUntil || 0, now + 250); // 短い防御窓（有限・恒久無敵化しない）
    this.scene.skills.recordExtra(this.id, 'furnaceReleases', 1, 'add');
  }

  // 全方向の星炎弾幕＋大爆発（状態を変えない純粋な攻撃部分）。
  _fireBarrage() {
    const p = this.scene.player; const d = this.evoDef;
    const count = Math.min(d.projectileCount?.releaseProjectiles || 22, this.cap('maxStarFurnaceProjectiles', 160));
    const room = Math.max(0, this.scene.projPool.maxSize - this.scene.projPool.activeCount);
    const nn = Math.min(count, room);
    for (let i = 0; i < nn; i++) {
      const ang = (i / Math.max(1, nn)) * Math.PI * 2;
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, ang, 300, {
        skillId: this.id, damage: d.damage?.release || 16, pierce: 1, scale: 0.7, lifeMs: 1200, tint: 0xffd54f, element: 'fire',
      });
    }
    const br = (d.area?.burstRadius || 110) * this.passiveAreaMult();
    this.scene.effects.explosion(p.x, p.y, br, 0xffe082);
    this.scene.combat.damageArea(p.x, p.y, br, d.damage?.burstBlast || 120, this.id, { isExplosion: true, color: 0xffe082 });
  }

  // 残響/複製: 弾幕の再放出のみ（チャージ変化なし）。
  echoCast() { this._fireBarrage(); }
  cloneCast() { this._fireBarrage(); }

  serializeState() { return { charge: this._charge, releaseCd: this._releaseCd }; }
  restoreState(s) { if (!s) return; this._charge = Math.min(s.charge || 0, this._maxCharge()); this._releaseCd = s.releaseCd || 0; }
  destroy() { for (const c of this.cores) if (c.sprite) c.sprite.destroy(); this.cores = []; }
}
