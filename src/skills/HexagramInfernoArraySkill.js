// 六芒煉獄陣（三角焔陣の進化・M6-E）: 2枚の三角形を重ねた六芒星陣を展開。
// 外周リング・三角内部・中央コアで異なるダメージ。コアは敵を中心へ引き込む（ボスは免疫/軽減）。
// 頂点は周期的に中心へビーム/波を放ち、陣の終了時に全体が爆発する。半透明ストロークで画面を覆わない。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

function pointInTriangle(px, py, a, b, c) {
  const d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
  const d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
  const d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}
function pointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

const OUTER_W = 10; // 外周辺の判定幅
const BEAM_W = 12;  // ビームの判定幅

export class HexagramInfernoArraySkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.arrays = []; // { center, verts:[6], t1:[3], t2:[3], left, tickAcc, beamAcc, gfx }
    this.beamFx = []; // { gfx, left } 一時的なビーム演出
  }

  _makeHexagram(center, spread) {
    const r = spread * 0.5;
    const verts = [];
    for (let k = 0; k < 6; k++) {
      const ang = (Math.PI / 3) * k; // 60°刻み
      verts.push({ x: center.x + Math.cos(ang) * r, y: center.y + Math.sin(ang) * r });
    }
    // 2枚の三角形（偶数頂点・奇数頂点）。
    const t1 = [verts[0], verts[2], verts[4]];
    const t2 = [verts[1], verts[3], verts[5]];
    return { verts, t1, t2 };
  }

  deploy() {
    const d = this.evoDef; const combat = this.scene.combat; const p = this.scene.player;
    const cap = this.cap('maxHexagramArrays', 2);
    if (this.arrays.length >= cap) return;
    const spread = ((d.area && d.area.spread) || 140) * this.passiveAreaMult();
    const dense = combat.densestPoint(spread * 0.6, 0) || combat.nearestEnemy(p.x, p.y, 9999);
    const center = dense ? { x: dense.x, y: dense.y } : { x: p.x, y: p.y };
    const hex = this._makeHexagram(center, spread);

    const gfx = this.scene.add.graphics().setDepth(40);
    gfx.lineStyle(3, 0xff5722, 0.4);
    this._strokeTri(gfx, hex.t1);
    this._strokeTri(gfx, hex.t2);

    this.arrays.push({
      center, verts: hex.verts, t1: hex.t1, t2: hex.t2,
      left: (d.timing && d.timing.durationMs) || 4000, tickAcc: 0, beamAcc: 0, gfx,
    });
    this.scene.skills.recordExtra(this.id, 'arraysCreated', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'highestConcurrentObjects', this.arrays.length, 'max');
  }

  _strokeTri(gfx, t) {
    gfx.beginPath();
    gfx.moveTo(t[0].x, t[0].y);
    gfx.lineTo(t[1].x, t[1].y);
    gfx.lineTo(t[2].x, t[2].y);
    gfx.closePath();
    gfx.strokePath();
  }

  update(dt, ctx) {
    const d = this.evoDef; const combat = this.scene.combat;
    this._cd -= dt;
    if (this._cd <= 0 && ctx.hasEnemies) {
      this._cd = (d.cooldown || 6000) * this.passiveCooldownMult();
      this.scene.skills.recordCast(this.id);
      this.deploy();
    }

    const spread = ((d.area && d.area.spread) || 140) * this.passiveAreaMult();
    const tickMs = (d.timing && d.timing.tickMs) || 260;
    const beamMs = (d.timing && d.timing.beamMs) || 700;

    for (let ai = this.arrays.length - 1; ai >= 0; ai--) {
      const arr = this.arrays[ai];
      arr.left -= dt;
      arr.tickAcc += dt;
      arr.beamAcc += dt;
      if (arr.tickAcc >= tickMs) { arr.tickAcc -= tickMs; this._tick(arr, spread); }
      if (arr.beamAcc >= beamMs) { arr.beamAcc -= beamMs; this._fireBeams(arr); }
      if (arr.left <= 0) {
        // 終了時の全体爆発。
        const fr = spread * 0.6;
        combat.damageArea(arr.center.x, arr.center.y, fr, (d.damage && d.damage.finalBlast) || 80, this.id, { isExplosion: true, color: 0xffab40 });
        if (this.scene.effects && this.scene.effects.explosion) this.scene.effects.explosion(arr.center.x, arr.center.y, fr, 0xffab40);
        this._dropArray(ai);
      }
    }

    // ビーム演出のフェード。
    for (let i = this.beamFx.length - 1; i >= 0; i--) {
      const b = this.beamFx[i];
      b.left -= dt;
      if (b.gfx) b.gfx.setAlpha(Math.max(0, 0.5 * (b.left / 160)));
      if (b.left <= 0) { if (b.gfx) b.gfx.destroy(); this.beamFx.splice(i, 1); }
    }
  }

  _tick(arr, spread) {
    const d = this.evoDef; const combat = this.scene.combat;
    const coreR = (d.area && d.area.coreRadius) || 30;
    const pull = (d.area && d.area.corePull) || 24;
    const cand = combat.enemiesInRadius(arr.center.x, arr.center.y, spread);
    for (const e of cand) {
      if (!e || !e.alive) continue;
      if (!combat.frameBudget('hexTick', 'maxArrayTicksPerFrame')) break;
      const dc = Math.hypot(e.x - arr.center.x, e.y - arr.center.y);
      if (dc <= coreR) {
        combat.dealDamage(e, (d.damage && d.damage.core) || 40, this.id, { isDoT: true, tag: 'dot', quiet: true, color: 0xffab40 });
        // コア引き込み（中心の反対側を起点にノックバック＝中心方向へ）。ボスは免除。
        if (!e.isBoss && e.applyKnockback) e.applyKnockback(2 * e.x - arr.center.x, 2 * e.y - arr.center.y, pull);
        this.scene.skills.recordExtra(this.id, 'coreHits', 1, 'add');
        continue;
      }
      if (pointInTriangle(e.x, e.y, arr.t1[0], arr.t1[1], arr.t1[2]) ||
          pointInTriangle(e.x, e.y, arr.t2[0], arr.t2[1], arr.t2[2])) {
        combat.dealDamage(e, (d.damage && d.damage.inner) || 26, this.id, { isDoT: true, tag: 'dot', quiet: true, color: 0xff7043 });
        continue;
      }
      // 外周（隣接頂点をつなぐ6辺）への近接。
      let od = Infinity;
      for (let k = 0; k < 6; k++) {
        const v1 = arr.verts[k], v2 = arr.verts[(k + 1) % 6];
        const dd = pointToSegment(e.x, e.y, v1.x, v1.y, v2.x, v2.y);
        if (dd < od) od = dd;
      }
      if (od <= OUTER_W) combat.dealDamage(e, (d.damage && d.damage.outer) || 20, this.id, { tag: 'dot', quiet: true, color: 0xff5722 });
    }
  }

  _fireBeams(arr) {
    const d = this.evoDef; const combat = this.scene.combat;
    const beamCap = this.cap('maxHexagramBeams', 6);
    const wantBeams = Math.min((d.projectileCount && d.projectileCount.beams) || 6, beamCap);
    const bdmg = (d.damage && d.damage.beam) || 30;
    let fired = 0;
    for (let k = 0; k < arr.verts.length && fired < wantBeams; k++) {
      const v = arr.verts[k];
      // 頂点→中心のビーム線に沿ってダメージ。
      const midx = (v.x + arr.center.x) / 2, midy = (v.y + arr.center.y) / 2;
      const len = Math.hypot(arr.center.x - v.x, arr.center.y - v.y);
      const cand = combat.enemiesInRadius(midx, midy, len / 2 + BEAM_W);
      for (const e of cand) {
        if (!e || !e.alive) continue;
        if (pointToSegment(e.x, e.y, v.x, v.y, arr.center.x, arr.center.y) <= BEAM_W) {
          combat.dealDamage(e, bdmg, this.id, { tag: 'beam', color: 0xffab40, knockback: e.isBoss ? 0 : 10, from: { x: v.x, y: v.y } });
        }
      }
      // ビーム演出（短命の矩形）。
      const gfx = this.scene.add.rectangle(midx, midy, len, 3, 0xffab40, 0.5)
        .setDepth(41).setRotation(Math.atan2(arr.center.y - v.y, arr.center.x - v.x));
      this.beamFx.push({ gfx, left: 160 });
      fired++;
    }
    if (fired) this.scene.skills.recordExtra(this.id, 'beamsFired', fired, 'add');
  }

  // 残響/分身: 攻撃のみ。既存陣があれば頂点ビームを1周期追加、無ければ中心の短い爆発。
  echoCast() {
    if (this.arrays.length > 0) { this._fireBeams(this.arrays[0]); return; }
    const d = this.evoDef; const p = this.scene.player; const combat = this.scene.combat;
    const dense = combat.densestPoint(80, 0);
    const cx = dense ? dense.x : p.x, cy = dense ? dense.y : p.y;
    const r = (((d.area && d.area.spread) || 140) * this.passiveAreaMult()) * 0.35;
    combat.damageArea(cx, cy, r, (d.damage && d.damage.beam) || 30, this.id, { isExplosion: true, color: 0xffab40 });
    if (this.scene.effects && this.scene.effects.explosion) this.scene.effects.explosion(cx, cy, r, 0xffab40);
  }
  cloneCast() { this.echoCast(); }

  _dropArray(i) {
    const arr = this.arrays[i];
    if (arr.gfx) arr.gfx.destroy();
    this.arrays.splice(i, 1);
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() {
    for (const arr of this.arrays) if (arr.gfx) arr.gfx.destroy();
    for (const b of this.beamFx) if (b.gfx) b.gfx.destroy();
    this.arrays = []; this.beamFx = [];
  }
}
