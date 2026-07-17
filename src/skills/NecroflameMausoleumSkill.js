// 冥炎大霊廟（火葬の墓標の進化・M6-E）: 直近死亡（エリート/ボス優先）を糧に大霊廟を建立。
// 霊廟は周期的に小爆発を起こしつつ導火線を溜め、時間経過で大爆発＋炎柱（savedDeaths ぶん）＋炎上ゾーンを残す。
// 不死鳥の致死回避が起きた瞬間、最古の霊廟の導火線を1回だけ短縮（不死鳥は消費/再発動しない）。
// 死亡イベントは placement 用に必ず consume。生成物は cap で上限、毎フレーム起爆は frameBudget で制限。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

export class NecroflameMausoleumSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.mausoleums = [];
    this.zones = [];
    this._lastPhoenix = 0;
    this.scene.combat.retainDeathEvents();
  }

  canFire() { return false; } // 常時 update で管理

  update(dt, ctx) {
    // 主発動＝建立（cooldown 経過かつ敵在時に1体）。base と同じ骨子だが自前で管理。
    this._cd -= dt;
    if (this._cd <= 0 && ctx && ctx.hasEnemies) {
      this._cd = (this.evoDef.cooldown ?? 4000) * this.passiveCooldownMult();
      this.scene.skills.recordCast(this.id);
      this._deployOne();
    }
    this._updateMausoleums(dt);
    this._updateZones(dt);
    this._updatePhoenix();
  }

  // 霊廟を1体建立（echo/clone でも使う純粋な設置。recordCast はしない）。
  _deployOne() {
    const combat = this.scene.combat;
    const cap = this.cap('maxMausoleums', 3);
    if (this.mausoleums.length >= cap) return;
    const maxAge = this.evoDef.timing?.deathMaxAgeMs || 4000;
    const events = combat.recentDeathEvents(maxAge, 8);
    let px = null, py = null, chosen = null;
    // エリート/ボスの死亡を優先して確保。
    for (const ev of events) {
      if ((ev.isElite || ev.isBoss) && combat.consumeDeathEvent(ev.id)) { chosen = ev; break; }
    }
    if (!chosen) { for (const ev of events) { if (combat.consumeDeathEvent(ev.id)) { chosen = ev; break; } } }
    if (chosen) { px = chosen.x; py = chosen.y; }
    else {
      const dp = combat.densestPoint(140, 0);
      if (dp) { px = dp.x; py = dp.y; }
      else { const p = this.scene.player; px = p.x; py = p.y; }
    }
    const wb = combat.worldBounds();
    px = Math.max(0, Math.min(wb.w, px));
    py = Math.max(0, Math.min(wb.h, py));
    const sprite = this.scene.add.image(px, py, TEX.PARTICLE)
      .setTint(0x7e57c2).setBlendMode(Phaser.BlendModes.ADD).setDepth(43).setScale(1.1).setAlpha(0.5);
    this.mausoleums.push({
      x: px, y: py, bigFuseLeft: this.evoDef.timing?.bigFuseMs || 5000,
      smallAcc: 0, savedDeaths: 0, sprite,
    });
    this.scene.skills.recordExtra(this.id, 'mausoleumsCreated', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'highestConcurrentObjects', this.mausoleums.length, 'max');
  }

  _updateMausoleums(dt) {
    const combat = this.scene.combat;
    const smallMs = this.evoDef.timing?.smallEruptionMs || 900;
    const areaMul = this.passiveAreaMult();
    for (let i = this.mausoleums.length - 1; i >= 0; i--) {
      const m = this.mausoleums[i];
      m.bigFuseLeft -= dt;
      m.smallAcc += dt;
      if (m.sprite) m.sprite.setAlpha(0.35 + 0.35 * Math.abs(Math.sin(this.scene.time.now * 0.006)));
      // 周期的な小爆発（主発動ではないので recordCast しない）。
      if (m.smallAcc >= smallMs) {
        m.smallAcc -= smallMs;
        const sr = (this.evoDef.area?.smallRadius || 60) * areaMul;
        this.scene.effects.explosion(m.x, m.y, sr, 0xba68c8);
        combat.damageArea(m.x, m.y, sr, this.evoDef.damage?.smallEruption || 20, this.id, { isExplosion: true, from: { x: m.x, y: m.y } });
        m.savedDeaths = Math.min(m.savedDeaths + 1, 50); // 炎柱の元手（上限つき）
      }
      // 大爆発（毎フレーム上限つき）。
      if (m.bigFuseLeft <= 0) {
        if (!combat.frameBudget('pyreExpl', 'maxPyreEruptionsPerFrame')) continue; // 繰り越し
        this._bigErupt(m);
        this.mausoleums.splice(i, 1);
      }
    }
  }

  _bigErupt(m) {
    const combat = this.scene.combat; const areaMul = this.passiveAreaMult();
    const bigR = (this.evoDef.area?.bigRadius || 110) * areaMul;
    this.scene.effects.explosion(m.x, m.y, bigR, 0xff7043);
    combat.damageArea(m.x, m.y, bigR, this.evoDef.damage?.bigEruption || 80, this.id, { isExplosion: true, knockback: 40, from: { x: m.x, y: m.y } });
    // 炎柱: min(savedDeaths, pillarsPerBigEruption) 本を周囲へ。
    const pc = Math.min(m.savedDeaths, this.evoDef.projectileCount?.pillarsPerBigEruption || 4);
    const pillarR = (this.evoDef.area?.smallRadius || 60) * 0.6 * areaMul;
    let spawned = 0;
    for (let k = 0; k < pc; k++) {
      const ang = (Math.PI * 2 * k) / (pc || 1) + this.scene.rng() * 0.5;
      const ox = m.x + Math.cos(ang) * bigR * 0.7, oy = m.y + Math.sin(ang) * bigR * 0.7;
      this.scene.effects.explosion(ox, oy, pillarR, 0xffca28);
      combat.damageArea(ox, oy, pillarR, this.evoDef.damage?.pillar || 30, this.id, { isExplosion: true, from: { x: ox, y: oy } });
      spawned++;
    }
    if (spawned) this.scene.skills.recordExtra(this.id, 'pillarsSpawned', spawned, 'add');
    // 炎上ゾーンを残す（上限つき）。
    const zcap = this.cap('maxMausoleums', 3) * 2;
    if (this.zones.length < zcap) {
      this.zones.push({
        x: m.x, y: m.y, r: (this.evoDef.area?.burnRadius || 70) * areaMul,
        dmg: this.evoDef.damage?.burn || 10, left: this.evoDef.timing?.burnDurationMs || 2500, tickAcc: 0,
      });
    }
    if (m.sprite) { m.sprite.destroy(); m.sprite = null; }
    this.scene.skills.recordExtra(this.id, 'bigEruptions', 1, 'add');
  }

  _updateZones(dt) {
    const combat = this.scene.combat;
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.left -= dt;
      z.tickAcc += dt;
      while (z.tickAcc >= 250 && z.left > -250) {
        z.tickAcc -= 250;
        combat.damageArea(z.x, z.y, z.r, z.dmg, this.id, { isDoT: true, tag: 'dot', quiet: true });
      }
      if (z.left <= 0) this.zones.splice(i, 1);
    }
  }

  // 不死鳥リンク: 致死回避（triggers 増加）の瞬間、最古の霊廟の導火線を1回だけ短縮。不死鳥は触らない。
  _updatePhoenix() {
    const ph = this.scene.player._phoenix;
    const trig = ph ? (ph.triggers || 0) : 0;
    if (trig > this._lastPhoenix) {
      if (this.mausoleums.length) this.mausoleums[0].bigFuseLeft -= this.evoDef.timing?.phoenixShortenMs || 1500;
    }
    this._lastPhoenix = trig;
  }

  // 残響/複製: 霊廟を1体建立するだけ（cap で上限）。recordCast しない。
  echoCast() { this._deployOne(); }
  cloneCast() { this.echoCast(); }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }

  destroy() {
    for (const m of this.mausoleums) if (m.sprite) m.sprite.destroy();
    this.mausoleums = [];
    this.zones = [];
    this.scene.combat.releaseDeathEvents();
  }
}
