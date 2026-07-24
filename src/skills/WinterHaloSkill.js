// 冬冠結界（frost_mage・M7-C・uncommon・防御）: プレイヤー周囲へ複数の氷冠片を展開し、吸収可能な通常敵弾を受け止める。
// 吸収で耐久を消費し、小範囲へ低ダメージと冷気の反撃パルスを放つ。mirror_ice（反射弾中心）と異なり複数耐久片＋近距離冷気 pulse で差別化する。
// ボスの回避不能攻撃・床・接触・ビームは無効化しない（既存 Projectile の吸収可否メタを再利用）。耐久0または時間切れで終了。
// defensive・echo/clone forbidden（防御耐久を無料生成しない）。recordCast は発動時に1回。runtimeState: cdLeft/activeLeft/durabilityLeft。

import { SkillBase } from './SkillBase.js';

export class WinterHaloSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._state = { active: false, activeLeft: 0, cdLeft: 0, durabilityLeft: 0, absorbed: 0, counters: 0, defensiveValue: 0 };
    this.shards = [];
    this._angle = 0;
  }
  canFire() { return false; }
  get isDefensive() { return true; }

  _shardVisualCount(dur) { return Math.min(Math.max(0, Math.ceil(dur)), this.scene.combat.skillCap('maxWinterHaloVisualShards', 8)); }
  _ensureShards(count) {
    while (this.shards.length < count) {
      const spr = this.scene.add.image(0, 0, 'icon_winter_halo').setBlendMode(Phaser.BlendModes.ADD).setDepth(49).setScale(0.5).setAlpha(0.6).setTint(0xb3e5fc);
      this.shards.push(spr);
    }
    while (this.shards.length > count) { const m = this.shards.pop(); if (m) m.destroy(); }
  }

  update(dt) {
    const s = this.stats; const st = this._state; const p = this.scene.player;
    if (st.active) {
      st.activeLeft -= dt; this._angle += dt * 0.0025;
      this._ensureShards(this._shardVisualCount(st.durabilityLeft));
      const n = this.shards.length;
      const rad = (s.pulseRadius || 50) * 0.7;
      for (let i = 0; i < n; i++) { const a = this._angle + (Math.PI * 2 * i) / Math.max(1, n); if (this.shards[i]) this.shards[i].setPosition(p.x + Math.cos(a) * rad, p.y + Math.sin(a) * rad).setRotation(a); }
      // 吸収（残耐久ぶんまで・毎フレーム上限＝データ maxAbsorbsPerFrame と品質別上限の小さい方）。
      const perFrame = Math.min(s.maxAbsorbsPerFrame || 2, this.scene.combat.skillCap('maxWinterHaloInterceptsPerFrame', 8));
      const maxAbsorb = Math.min(Math.ceil(st.durabilityLeft), perFrame);
      if (maxAbsorb > 0) {
        const res = this.scene.combat.absorbBossBullets(p.x, p.y, s.pulseRadius || 50, maxAbsorb);
        const absorbed = res && res.absorbed || 0;
        if (absorbed > 0) { st.durabilityLeft -= absorbed; st.absorbed += absorbed; st.defensiveValue += (res.value || absorbed); this._counter(s); }
      }
      if (st.activeLeft <= 0 || st.durabilityLeft <= 0) { st.active = false; st.cdLeft = s.cooldown; this._ensureShards(0); }
    } else {
      st.cdLeft -= dt;
      if (st.cdLeft <= 0) {
        st.active = true; st.activeLeft = s.activeDuration || 3000; st.durabilityLeft = s.shardDurabilityCount || 3;
        this._ensureShards(this._shardVisualCount(st.durabilityLeft));
        this.scene.skills.recordCast(this.id); // 発動時に1回だけ（forbidden/defensive のため残響・複製は起きない）
        this.scene.skills.recordExtra(this.id, 'halosCast', 1, 'add');
      }
    }
    this.scene.skills.recordExtra(this.id, 'projectilesAbsorbed', st.absorbed, 'max');
    this.scene.skills.recordExtra(this.id, 'defensiveValue', Math.round(st.defensiveValue), 'max');
    this.scene.skills.recordExtra(this.id, 'counterHits', st.counters, 'max');
  }

  _counter(s) {
    const p = this.scene.player; const hg = this.scene.nextHitGroupId();
    this.scene.combat.damageArea(p.x, p.y, s.pulseRadius || 50, s.pulseDamage, this.id, {
      element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: 0, procCoefficient: this.def?.procCoefficient ?? 0.32,
      hitGroupId: hg, quiet: true, color: 0xb3e5fc,
    });
    this._state.counters++;
  }

  // echo/clone forbidden（防御耐久を無料生成しない）。

  serializeState() { const s = this._state; return { cdLeft: s.cdLeft, activeLeft: s.activeLeft, durabilityLeft: s.durabilityLeft, active: s.active, absorbed: s.absorbed, counters: s.counters, defensiveValue: s.defensiveValue }; }
  restoreState(st) {
    if (!st) return;
    Object.assign(this._state, {
      active: !!st.active, activeLeft: st.activeLeft || 0, cdLeft: st.cdLeft || 0, durabilityLeft: st.durabilityLeft || 0,
      absorbed: st.absorbed || 0, counters: st.counters || 0, defensiveValue: st.defensiveValue || 0,
    });
  }

  destroy() { for (const m of this.shards) if (m) m.destroy(); this.shards = []; }
}
