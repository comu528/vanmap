// 火葬の墓標（M6-E）: 直近の敵死亡地点に墓標を設置。導火線が尽きると起爆して範囲ダメージ＋炎上ゾーンを残す。
// 死亡イベントは placement 用に consume して同じ死亡を複数墓標へ使わない。近くの新たな死亡は導火線を短縮する（消費はしない）。
// 同時墓標数（skillCap）と毎フレーム起爆数（frameBudget）を厳守。装飾スプライトは起爆/破棄で確実に destroy。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class FuneralPyresSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.pyres = [];
    this.zones = [];
    this._lastDeathId = 0; // 導火線短縮の二重計上防止（消費はしない）
    this.scene.combat.retainDeathEvents(); // 所持中だけ死亡履歴を記録
  }

  canFire(ctx) { return ctx.hasEnemies; }

  // 主発動＝設置。死亡地点を優先し、無ければ密集地点/最寄り敵/プレイヤー近傍へ設置。
  fire() {
    const s = this.stats; const p = this.scene.player; const combat = this.scene.combat;
    const cap = combat.skillCap('maxFuneralPyres', 8);
    const want = s.pyreCount || 3;
    const maxAge = this.def.config?.deathMaxAgeMs || 4000;
    const wb = combat.worldBounds();
    let placed = 0;
    for (let i = 0; i < want; i++) {
      if (this.pyres.length >= cap) break;
      let px = null, py = null;
      // 未消費の死亡イベントを1つ確保（consume 成功時のみ使用）。
      const events = combat.recentDeathEvents(maxAge, 8);
      for (const ev of events) {
        if (combat.consumeDeathEvent(ev.id)) { px = ev.x; py = ev.y; break; }
      }
      if (px === null) {
        const dp = combat.densestPoint(120, 0);
        if (dp) { px = dp.x; py = dp.y; }
        else {
          const e = combat.nearestEnemy(p.x, p.y, 240);
          if (e) { px = e.x; py = e.y; }
          else { px = p.x + (this.scene.rng() * 2 - 1) * 40; py = p.y + (this.scene.rng() * 2 - 1) * 40; }
        }
      }
      // ワールド外へ置かない。
      px = Math.max(0, Math.min(wb.w, px));
      py = Math.max(0, Math.min(wb.h, py));
      const grave = this.scene.add.image(px, py, TEX.PARTICLE)
        .setTint(0x9e9e9e).setDepth(41).setScale(0.55).setAlpha(0.5);
      const flame = this.scene.add.image(px, py - 4, TEX.PARTICLE)
        .setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setDepth(42).setScale(0.32).setAlpha(0.5);
      this.pyres.push({
        x: px, y: py, fuseLeft: s.fuseMs || 1400,
        damage: s.damage, explosionRadius: s.explosionRadius || 60,
        burnDamage: s.burnDamage, burnDuration: s.burnDuration || 2500,
        erupted: false, sprite: grave, flame,
      });
      placed++;
    }
    if (placed) this.scene.skills.recordExtra(this.id, 'pyresCreated', placed, 'add');
    this.scene.skills.recordExtra(this.id, 'highestConcurrentObjects', this.pyres.length, 'max');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // cooldown 管理＋主発動（設置）
    const combat = this.scene.combat; const s = this.stats; const now = this.scene.time.now;

    // 近くの新しい死亡イベントで導火線を短縮（消費はしない・イベントごと1回・上限つき）。
    const shorten = s.deathShortenMs || 0;
    if (shorten > 0 && this.pyres.length) {
      const deaths = combat.recentDeathEvents(this.def.config?.deathMaxAgeMs || 4000, 8);
      let maxId = this._lastDeathId;
      for (const d of deaths) {
        if (d.id <= this._lastDeathId) continue;
        if (d.id > maxId) maxId = d.id;
        for (const pyre of this.pyres) {
          if (pyre.erupted) continue;
          const dx = d.x - pyre.x, dy = d.y - pyre.y;
          if (dx * dx + dy * dy <= pyre.explosionRadius * pyre.explosionRadius) pyre.fuseLeft -= shorten;
        }
      }
      this._lastDeathId = maxId;
    } else if (this.pyres.length === 0) {
      // 墓標が無い間も進めておき、後から旧イベントを再処理しない。
      const deaths = combat.recentDeathEvents(this.def.config?.deathMaxAgeMs || 4000, 1);
      if (deaths.length && deaths[0].id > this._lastDeathId) this._lastDeathId = deaths[0].id;
    }

    // 導火線を進め、尽きたら起爆（毎フレーム上限つき）。
    for (let i = this.pyres.length - 1; i >= 0; i--) {
      const pyre = this.pyres[i];
      pyre.fuseLeft -= dt;
      if (pyre.flame) pyre.flame.setAlpha(0.35 + 0.35 * Math.abs(Math.sin(now * 0.008)));
      if (pyre.fuseLeft <= 0 && !pyre.erupted) {
        if (!combat.frameBudget('pyreExpl', 'maxPyreEruptionsPerFrame')) continue; // 今フレームは繰り越し
        this._erupt(pyre);
        this.pyres.splice(i, 1);
      }
    }

    // 炎上ゾーン（約250msごとに DoT）。
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

  // 起爆は1回だけ（主発動ではないので recordCast しない）。爆発＋炎上ゾーン生成。
  _erupt(pyre) {
    if (pyre.erupted) return; pyre.erupted = true;
    const combat = this.scene.combat; const r = pyre.explosionRadius;
    this.scene.effects.explosion(pyre.x, pyre.y, r, 0xff7043);
    combat.damageArea(pyre.x, pyre.y, r, pyre.damage, this.id, { isExplosion: true, knockback: 30, from: { x: pyre.x, y: pyre.y } });
    const zoneCap = combat.skillCap('maxFuneralPyres', 8);
    if (this.zones.length < zoneCap) {
      this.zones.push({ x: pyre.x, y: pyre.y, r: r * 0.7, dmg: pyre.burnDamage, left: pyre.burnDuration, tickAcc: 0 });
    }
    if (pyre.sprite) { pyre.sprite.destroy(); pyre.sprite = null; }
    if (pyre.flame) { pyre.flame.destroy(); pyre.flame = null; }
    this.scene.skills.recordExtra(this.id, 'pyreEruptions', 1, 'add');
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }

  destroy() {
    for (const pyre of this.pyres) { if (pyre.sprite) pyre.sprite.destroy(); if (pyre.flame) pyre.flame.destroy(); }
    this.pyres = [];
    this.zones = [];
    this.scene.combat.releaseDeathEvents();
  }
}
