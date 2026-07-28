// 太陽滅却陣（灼熱光線の進化・M6-D）: 主光線を高頻度で照射しつつ、周囲の鏡（光点）から補助光線を別の敵へ照射。
// 一定間隔で全光線が密集地点へ集中し大爆発。ビーム/tick/同時爆発に明示上限。画面を白飛びさせない（中庸なα・ADD）。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

const BIG = 100000;
const CAST_PULSE_SAFE = 600; // 安全用 fallback（正は data/skill-evolutions.json solar_annihilation_array.config.castPulseMs）。

export class SolarAnnihilationArraySkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.beams = [];       // ビーム画像プール（index0=主光線）
    this._mirrorAngle = 0;
    this._tick = 0;
    this._focus = this.evoDef.projectileCount?.focusIntervalMs || 2600;
    this._focusWindow = 0;
    this._focusSpot = null;
    this._castPulse = 0;   // M8-A: 主発動イベント（beamStart）のスロットル
  }
  canFire() { return false; } // 常時 update で管理

  _beamSprite(i, tint) {
    let b = this.beams[i];
    if (!b) {
      b = this.scene.add.image(0, 0, TEX.PARTICLE).setBlendMode(Phaser.BlendModes.ADD).setDepth(45).setOrigin(0.5, 0.5);
      this.beams[i] = b;
    }
    b.setTint(tint);
    return b;
  }

  _drawBeam(sprite, x1, y1, x2, y2, width, alpha) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    sprite.setPosition((x1 + x2) / 2, (y1 + y2) / 2);
    sprite.setRotation(Math.atan2(dy, dx));
    sprite.setScale(len / 4, Math.max(1, width) / 4); // PARTICLE は 4px 四方
    sprite.setAlpha(alpha);
    sprite.setVisible(true);
  }

  // 点(px,py)から線分(x1,y1)-(x2,y2)への最短距離の二乗。
  _segDist2(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    const ex = px - cx, ey = py - cy;
    return ex * ex + ey * ey;
  }

  update(dt) {
    const p = this.scene.player; const d = this.evoDef;
    // M8-A: 常設型のため基底 update を使わず、主発動（beamStart）を一定間隔でスロットルして1回だけ記録する。
    // これが無いと、実装済みの echoCast/cloneCast（custom）が一度も呼ばれなかった。
    if (this._castPulse > 0) this._castPulse -= dt;
    if (this._castPulse <= 0) {
      this._castPulse = (d.config && d.config.castPulseMs) || CAST_PULSE_SAFE;
      this.scene.skills.recordCast(this.id);
    }
    this._focus -= dt;
    if (this._focusWindow > 0) this._focusWindow -= dt;
    if (this._focus <= 0) { this._focus = (d.projectileCount?.focusIntervalMs || 2600); this._doFocus(); }

    const focusing = this._focusWindow > 0 && this._focusSpot;
    const beamCap = Math.max(0, this.scene.combat.skillCap('maxActiveBeams', 10) - 1);
    // 補助光線は「鏡の数」と「auxBeams（data の補助光線本数）」の小さい方まで。
    const mirrorCap = Math.min(d.projectileCount?.mirrors || 4, d.projectileCount?.auxBeams ?? 4, this.cap('maxSolarMirrors', 6), beamCap);
    this._mirrorAngle += dt * 0.0018;

    const beams = [];
    const mainT = focusing ? this._focusSpot : this.scene.combat.nearestEnemy(p.x, p.y, BIG);
    if (mainT) beams.push({ x1: p.x, y1: p.y, x2: mainT.x, y2: mainT.y, width: (d.area?.mainWidth || 16), dmg: d.damage?.mainTick || 22, tint: 0xffee58, alpha: 0.5 });
    const exclude = new Set();
    if (mainT && mainT.alive) exclude.add(mainT);
    for (let i = 0; i < mirrorCap; i++) {
      const a = this._mirrorAngle + (Math.PI * 2 * i) / Math.max(1, mirrorCap);
      const mx = p.x + Math.cos(a) * 46, my = p.y + Math.sin(a) * 46;
      const t = focusing ? this._focusSpot : this.scene.combat.nearestEnemyExcept(mx, my, BIG, exclude);
      if (t) {
        if (!focusing && t.alive) exclude.add(t);
        beams.push({ x1: mx, y1: my, x2: t.x, y2: t.y, width: (d.area?.auxWidth || 9), dmg: d.damage?.auxTick || 9, tint: 0xffb74d, alpha: 0.32 });
      }
    }

    this._draw(beams);
    this._tick -= dt;
    if (this._tick <= 0) { this._tick = (d.projectileCount?.tickRate || 160); this._tickDamage(beams); }
  }

  _draw(beams) {
    for (let i = 0; i < beams.length; i++) {
      const b = beams[i];
      this._drawBeam(this._beamSprite(i, b.tint), b.x1, b.y1, b.x2, b.y2, b.width, b.alpha);
    }
    for (let i = beams.length; i < this.beams.length; i++) if (this.beams[i]) this.beams[i].setVisible(false);
  }

  _tickDamage(beams) {
    const ticked = new Set(); // 同一tickで同じ敵へ二重ダメージしない
    for (const b of beams) {
      if (!this.scene.combat.frameBudget('beamTick', 'maxBeamTicksPerFrame')) break;
      const midx = (b.x1 + b.x2) / 2, midy = (b.y1 + b.y2) / 2;
      const half = Math.hypot(b.x2 - b.x1, b.y2 - b.y1) / 2;
      const hitR = b.width;
      for (const e of this.scene.combat.enemiesInRadius(midx, midy, half + hitR)) {
        if (ticked.has(e)) continue;
        if (this._segDist2(e.x, e.y, b.x1, b.y1, b.x2, b.y2) <= hitR * hitR) {
          ticked.add(e);
          this.scene.combat.dealDamage(e, b.dmg, this.id, { quiet: true, color: b.tint, tag: 'dot' });
        }
      }
    }
  }

  _doFocus() {
    const d = this.evoDef;
    const spot = this.scene.combat.densestPoint((d.area?.focusRadius || 120), 0);
    if (!spot) return;
    this._focusSpot = spot; this._focusWindow = 300;
    const fr = (d.area?.focusRadius || 120) * this.passiveAreaMult();
    // 同時爆発の予算内でのみ大爆発（maxSimultaneousExplosions 由来）。
    if (this.scene._explosionBudget > 0) {
      this.scene._explosionBudget -= 1;
      this.scene.effects.explosion(spot.x, spot.y, fr, 0xfff59d);
      this.scene.effects.meteorImpact(spot.x, spot.y, fr);
      this.scene.combat.damageArea(spot.x, spot.y, fr, d.damage?.focusBlast || 160, this.id, { isExplosion: true, color: 0xfff59d });
    }
  }

  // 残響: 主光線の追加バーストのみ（安全・再帰しない）。
  echoCast() {
    const p = this.scene.player; const d = this.evoDef;
    const t = this.scene.combat.nearestEnemy(p.x, p.y, BIG);
    if (!t) return;
    if (!this.scene.combat.frameBudget('beamTick', 'maxBeamTicksPerFrame')) return;
    const width = d.area?.mainWidth || 16;
    const midx = (p.x + t.x) / 2, midy = (p.y + t.y) / 2;
    const half = Math.hypot(t.x - p.x, t.y - p.y) / 2;
    for (const e of this.scene.combat.enemiesInRadius(midx, midy, half + width)) {
      if (this._segDist2(e.x, e.y, p.x, p.y, t.x, t.y) <= width * width) this.scene.combat.dealDamage(e, d.damage?.mainTick || 22, this.id, { quiet: true, color: 0xffee58, tag: 'dot' });
    }
  }
  cloneCast() { this.echoCast(); }

  // M8-A: 集束ビーム（focusIntervalMs）と tick の残り時間・鏡の位相を保存する。
  // 以前は空オブジェクトを返すだけで restoreState も無く、再開直後に集束爆発が無料で発生していた。
  serializeState() { return { focusLeft: this._focus, tickLeft: this._tick, mirrorAngle: this._mirrorAngle, castPulse: this._castPulse }; }
  restoreState(s) {
    if (!s) return;
    if (typeof s.focusLeft === 'number') this._focus = s.focusLeft;
    if (typeof s.tickLeft === 'number') this._tick = s.tickLeft;
    if (typeof s.mirrorAngle === 'number') this._mirrorAngle = s.mirrorAngle;
    if (typeof s.castPulse === 'number') this._castPulse = s.castPulse;
  }
  destroy() { for (const b of this.beams) if (b) b.destroy(); this.beams = []; this._focusSpot = null; }
}
