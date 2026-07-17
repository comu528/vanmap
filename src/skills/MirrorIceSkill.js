// 氷鏡結界（frost_mage・M7-B・rare・防御）: プレイヤー周囲へ氷鏡を展開し、吸収可能な通常敵弾を受け止める。吸収で耐久を消費し、
// 攻撃元/最寄り敵へ小型の氷反撃弾（少量の冷気）を放つ。ボスの回避不能攻撃・予告は無効化しない（既存 Projectile の吸収可否メタを再利用）。
// 同一敵弾を複数回吸収しない（bossBulletPool の consumedByAbility）。終了後にクールダウン。防御値をテレメトリへ記録。
// defensive: 残響カウンタを進めず（isDefensive）、複製もしない（clonePolicy forbidden）。runtimeState: cdLeft/activeLeft/durabilityLeft。

import { SkillBase } from './SkillBase.js';

export class MirrorIceSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._state = { active: false, activeLeft: 0, cdLeft: 0, durabilityLeft: 0, blocked: 0, counters: 0, defensiveValue: 0 };
    this.mirrors = [];
    this._angle = 0;
  }
  canFire() { return false; }
  get isDefensive() { return true; }

  _mirrorCount() { return Math.min(this.stats.mirrorCount || 2, this.scene.combat.skillCap('maxMirrorIceBarriers', 4)); }

  _ensureMirrors(active) {
    const want = active ? this._mirrorCount() : 0;
    while (this.mirrors.length < want) {
      const spr = this.scene.add.image(0, 0, 'icon_ice_wall').setBlendMode(Phaser.BlendModes.ADD).setDepth(49).setScale(0.6).setAlpha(0.5).setTint(0xb3e5fc);
      this.mirrors.push(spr);
    }
    while (this.mirrors.length > want) { const m = this.mirrors.pop(); if (m) m.destroy(); }
  }

  update(dt) {
    const s = this.stats; const st = this._state; const p = this.scene.player;
    if (st.active) {
      st.activeLeft -= dt;
      this._angle += dt * 0.0022;
      this._ensureMirrors(true);
      const n = this.mirrors.length;
      const rad = (s.absorptionRadius || 40) * 0.7;
      for (let i = 0; i < n; i++) {
        const a = this._angle + (Math.PI * 2 * i) / n;
        if (this.mirrors[i]) this.mirrors[i].setPosition(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad).setRotation(a);
      }
      // 吸収（残耐久ぶんまで・毎フレーム予算内）。
      const interceptCap = this.scene.combat.skillCap('maxMirrorIceInterceptsPerFrame', 14);
      const maxAbsorb = Math.min(Math.ceil(st.durabilityLeft), interceptCap);
      if (maxAbsorb > 0) {
        const res = this.scene.combat.absorbBossBullets(p.x, p.y, s.absorptionRadius || 40, maxAbsorb);
        const absorbed = res && res.absorbed || 0;
        if (absorbed > 0) {
          st.durabilityLeft -= absorbed; st.blocked += absorbed; st.defensiveValue += (res.value || absorbed);
          this._counter(absorbed, s);
        }
      }
      if (st.activeLeft <= 0 || st.durabilityLeft <= 0) { st.active = false; st.cdLeft = s.cooldown; this._ensureMirrors(false); }
    } else {
      st.cdLeft -= dt;
      if (st.cdLeft <= 0) { st.active = true; st.activeLeft = s.duration || 3000; st.durabilityLeft = s.durability || 4; this._ensureMirrors(true); }
    }
    this.scene.skills.recordExtra(this.id, 'projectilesBlocked', st.blocked, 'max');
    this.scene.skills.recordExtra(this.id, 'counterShots', st.counters, 'max');
    this.scene.skills.recordExtra(this.id, 'defensiveValue', Math.round(st.defensiveValue), 'max');
  }

  _counter(count, s) {
    const st = this._state; const p = this.scene.player;
    const shots = Math.min(count, this.scene.combat.skillCap('maxMirrorIceCounterProjectiles', 20));
    const t = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    if (!t) return;
    const hg = this.scene.nextHitGroupId();
    for (let i = 0; i < shots; i++) {
      const ang = Math.atan2(t.y - p.y, t.x - p.x) + (i - (shots - 1) / 2) * 0.14;
      this.scene.combat.spawnPlayerProjectile(p.x, p.y, ang, s.counterProjectileSpeed || 340, {
        skillId: this.id, element: 'ice', damage: s.counterDamage, pierce: 0,
        chillAmount: s.counterChill, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.3,
        hitGroupId: hg, scale: 0.5, lifeMs: 900, tint: 0xbde8ff,
      });
      st.counters++;
    }
  }

  // 残響（custom・isDefensive のため実際には呼ばれないが安全に）: 反撃弾のみ1回（耐久/鏡は再生成しない）。
  echoCast() { if (this._state.active) this._counter(1, this.stats); }
  // 複製は行わない（防御耐久を無料増殖しないため）。

  serializeState() { const s = this._state; return { cdLeft: s.cdLeft, activeLeft: s.activeLeft, durabilityLeft: s.durabilityLeft, active: s.active, blocked: s.blocked, counters: s.counters, defensiveValue: s.defensiveValue }; }
  restoreState(s) {
    if (!s) return;
    Object.assign(this._state, {
      active: !!s.active, activeLeft: s.activeLeft || 0, cdLeft: s.cdLeft || 0, durabilityLeft: s.durabilityLeft || 0,
      blocked: s.blocked || 0, counters: s.counters || 0, defensiveValue: s.defensiveValue || 0,
    });
  }

  destroy() { for (const m of this.mirrors) if (m) m.destroy(); this.mirrors = []; }
}
