// 火の精霊（M6-B）: プレイヤーに追従する精霊を召喚し、近くの敵へ自動射撃。
// 精霊は敵の攻撃対象にならない（当たり判定なし・見た目のみ）。同じ位置に密集しない（角度を分散）。
// Scene終了・スキル削除・進化時に destroy で確実に破棄。同時存在数に安全上限。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

const SUMMON_PULSE_MS = 900; // M6-E: 召喚の主発動イベント(recordCast)スロットル。個々の通常射撃では記録しない。

export class FireSpiritSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.spirits = []; this._angle = 0; this._castPulse = 0; }
  canFire() { return false; } // 常時 update で管理（クールダウン発火は使わない）

  _targetCount() {
    const s = this.stats;
    return Math.min(s.count || 1, this.scene.combat.skillCap('maxSummons', 8));
  }

  _ensure() {
    const want = this._targetCount();
    while (this.spirits.length < want) {
      const spr = this.scene.add.image(0, 0, TEX.FIREBALL).setBlendMode(Phaser.BlendModes.ADD).setDepth(51).setScale(0.7).setTint(0xffca28);
      this.spirits.push({ sprite: spr, shotTimer: this.scene.rng() * 400 });
    }
    while (this.spirits.length > want) { const sp = this.spirits.pop(); if (sp.sprite) sp.sprite.destroy(); }
    if (this.spirits.length) this.scene.skills.recordExtra(this.id, 'maxConcurrent', this.spirits.length, 'max');
  }

  update(dt) {
    const s = this.stats; const p = this.scene.player;
    this._ensure();
    this._angle += dt * 0.0016;
    if (this._castPulse > 0) this._castPulse -= dt;
    const n = this.spirits.length;
    let firedThisFrame = false;
    for (let i = 0; i < n; i++) {
      const sp = this.spirits[i];
      const a = this._angle + (Math.PI * 2 * i) / n;
      const ox = p.x + Math.cos(a) * 26, oy = p.y + Math.sin(a) * 26; // プレイヤーと重ならず周囲を移動
      if (sp.sprite) sp.sprite.setPosition(ox, oy);
      sp.shotTimer -= dt;
      if (sp.shotTimer <= 0) {
        const t = this.scene.combat.nearestEnemy(ox, oy, s.range || 200);
        if (t && t.alive) {
          sp.shotTimer = s.shotInterval || 800;
          if (this._shoot(ox, oy, t)) firedThisFrame = true;
        } else { sp.shotTimer = 120; }
      }
    }
    // 主発動イベント: 召喚の一斉射撃サイクル単位で記録する（個々の通常射撃では記録しない＝残響カウンタを乱発しない）。
    if (firedThisFrame && this._castPulse <= 0) { this.scene.skills.recordCast(this.id); this._castPulse = SUMMON_PULSE_MS; }
  }

  // 精霊1体の通常射撃（実発動・echo/clone 再現で共有）。発射できたら true。
  _shoot(ox, oy, t) {
    const s = this.stats;
    if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) return false;
    if (this.scene.countProjBySkill(this.id) >= this.scene.combat.skillCap('maxSummonProjectiles', 70)) return false;
    const ang = Math.atan2(t.y - oy, t.x - ox);
    this.scene.combat.spawnPlayerProjectile(ox, oy, ang, s.shotSpeed || 340, {
      skillId: this.id, damage: s.shotDamage, pierce: s.pierce || 0, scale: 0.55, lifeMs: 1000, tint: 0xffca28, element: 'fire',
    });
    return true;
  }

  // 残響/複製（M6-E・custom）: 召喚済みの各精霊が最寄り敵へ追加の一斉射撃を行う（精霊を増やさない・召喚状態を変えない）。
  echoCast() {
    const s = this.stats; const p = this.scene.player; const n = this.spirits.length;
    for (let i = 0; i < n; i++) {
      const a = this._angle + (Math.PI * 2 * i) / n;
      const ox = p.x + Math.cos(a) * 26, oy = p.y + Math.sin(a) * 26;
      const t = this.scene.combat.nearestEnemy(ox, oy, s.range || 200);
      if (t && t.alive) this._shoot(ox, oy, t);
    }
  }
  cloneCast() { this.echoCast(); }

  onLevelChanged() { /* 個数は update の _ensure で追従 */ }
  destroy() { for (const sp of this.spirits) if (sp.sprite) sp.sprite.destroy(); this.spirits = []; }
}
