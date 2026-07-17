// 三角焔陣（M6-E）: 密集地付近に3つのアンカーで三角形を張る。三角形内部の敵は継続ダメージ、
// 辺に触れる敵は追加ダメージ＋軽い減速（ボスは減速を省略）。高Lvで内部に周期的な小爆発。
// SpatialGrid で候補を絞り、三角形内包/辺距離は厳密判定。tick/多重重なりは frameBudget と局所上限で制限。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

// 厳密な三角形内包判定（外積の符号の一致で判定。境界も内側扱い）。
function pointInTriangle(px, py, a, b, c) {
  const d1 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
  const d2 = (px - c.x) * (b.y - c.y) - (b.x - c.x) * (py - c.y);
  const d3 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
  return !(hasNeg && hasPos);
}
// 点と線分の最短距離（厳密）。
function pointToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = t < 0 ? 0 : (t > 1 ? 1 : t);
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}
function triArea(a, b, c) { return Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) * 0.5; }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

const EDGE_W = 8; // 辺ヒット判定幅

export class TriFlameArraySkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.arrays = []; // { a, b, c, center, left, tickAcc, blastAcc, anchors:[], gfx }
  }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const combat = this.scene.combat; const p = this.scene.player;
    const cap = combat.skillCap('maxTriArrays', 4);
    const want = Math.min(s.arrayCount || 1, Math.max(0, cap - this.arrays.length));
    const area = (s.area || 90) * this.passiveAreaMult();
    const wb = combat.worldBounds();
    let made = 0;
    for (let n = 0; n < want; n++) {
      const dense = combat.densestPoint(area, n) || combat.nearestEnemy(p.x, p.y, 9999);
      const center = dense ? { x: dense.x, y: dense.y } : { x: p.x, y: p.y };
      const rad = area * 0.5;
      const jitter = ((n % 2) === 0 ? 1 : -1) * 0.18; // 決定論的な微回転
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const ang = (Math.PI * 2 * k) / 3 + jitter;
        let x = clamp(center.x + Math.cos(ang) * rad, 8, wb.w - 8);
        let y = clamp(center.y + Math.sin(ang) * rad, 8, wb.h - 8);
        pts.push({ x, y });
      }
      // 退化三角形は棄却/是正。
      const minArea = (area * area) * 0.05;
      if (triArea(pts[0], pts[1], pts[2]) < minArea) {
        // 中心から押し広げて再判定。
        for (let k = 0; k < 3; k++) {
          const ang = (Math.PI * 2 * k) / 3;
          pts[k].x = clamp(center.x + Math.cos(ang) * rad * 1.4, 8, wb.w - 8);
          pts[k].y = clamp(center.y + Math.sin(ang) * rad * 1.4, 8, wb.h - 8);
        }
        if (triArea(pts[0], pts[1], pts[2]) < minArea) continue; // それでも退化ならスキップ
      }
      const anchors = [];
      for (let k = 0; k < 3; k++) {
        anchors.push(this.scene.add.image(pts[k].x, pts[k].y, TEX.PARTICLE)
          .setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setDepth(41).setScale(0.5).setAlpha(0.7));
      }
      const gfx = this.scene.add.graphics().setDepth(40);
      gfx.lineStyle(3, 0xff5722, 0.4);
      gfx.beginPath();
      gfx.moveTo(pts[0].x, pts[0].y);
      gfx.lineTo(pts[1].x, pts[1].y);
      gfx.lineTo(pts[2].x, pts[2].y);
      gfx.closePath();
      gfx.strokePath();
      this.arrays.push({
        a: pts[0], b: pts[1], c: pts[2], center,
        left: (s.duration || 3000), tickAcc: 0, blastAcc: 0, anchors, gfx,
      });
      made++;
    }
    if (made) this.scene.skills.recordExtra(this.id, 'arraysCreated', made, 'add');
    this.scene.skills.recordExtra(this.id, 'highestConcurrentObjects', this.arrays.length, 'max');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const s = this.stats; if (!s) return;
    const tickMs = s.tickMs || 260;
    const area = (s.area || 90) * this.passiveAreaMult();
    const perArrayCap = this.scene.combat.skillCap('maxResonanceTargets', 40);
    for (let ai = this.arrays.length - 1; ai >= 0; ai--) {
      const arr = this.arrays[ai];
      arr.left -= dt;
      arr.tickAcc += dt;
      if (arr.tickAcc >= tickMs) {
        arr.tickAcc -= tickMs;
        this._tick(arr, s, area, perArrayCap);
      }
      // 内部小爆発。
      if ((s.innerBlastDamage || 0) > 0 && (s.innerBlastMs || 0) > 0) {
        arr.blastAcc += dt;
        if (arr.blastAcc >= s.innerBlastMs) {
          arr.blastAcc -= s.innerBlastMs;
          const gx = (arr.a.x + arr.b.x + arr.c.x) / 3, gy = (arr.a.y + arr.b.y + arr.c.y) / 3;
          const br = Math.max(12, area * 0.22);
          this.scene.combat.damageArea(gx, gy, br, s.innerBlastDamage, this.id, { isExplosion: true, color: 0xffab40 });
          if (this.scene.effects && this.scene.effects.explosion) this.scene.effects.explosion(gx, gy, br, 0xffab40);
        }
      }
      if (arr.left <= 0) this._dropArray(ai);
    }
  }

  _tick(arr, s, area, perArrayCap) {
    const combat = this.scene.combat;
    const cand = combat.enemiesInRadius(arr.center.x, arr.center.y, area * 1.2);
    let inside = 0, edgeHits = 0, processed = 0;
    for (const e of cand) {
      if (!e || !e.alive) continue;
      if (processed >= perArrayCap) break;
      if (!combat.frameBudget('arrayTick', 'maxArrayTicksPerFrame')) break; // 毎フレーム多重上限
      processed++;
      const inTri = pointInTriangle(e.x, e.y, arr.a, arr.b, arr.c);
      // 辺への近接（3辺の最短距離）。
      const de = Math.min(
        pointToSegment(e.x, e.y, arr.a.x, arr.a.y, arr.b.x, arr.b.y),
        pointToSegment(e.x, e.y, arr.b.x, arr.b.y, arr.c.x, arr.c.y),
        pointToSegment(e.x, e.y, arr.c.x, arr.c.y, arr.a.x, arr.a.y),
      );
      if (de <= EDGE_W) {
        combat.dealDamage(e, s.edgeDamage, this.id, { tag: 'edge', color: 0xff5722 });
        if (!e.isBoss && e.applySlow) e.applySlow(s.edgeSlow || 0.5, 400);
        edgeHits++;
      } else if (inTri) {
        combat.dealDamage(e, s.insideDamage, this.id, { isDoT: true, tag: 'dot', quiet: true, color: 0xff7043 });
        inside++;
      }
    }
    if (inside) this.scene.skills.recordExtra(this.id, 'enemiesInside', inside, 'add');
    if (edgeHits) this.scene.skills.recordExtra(this.id, 'edgeHits', edgeHits, 'add');
    this.scene.skills.recordExtra(this.id, 'maxEnemiesInsideOneArray', inside, 'max');
  }

  _dropArray(i) {
    const arr = this.arrays[i];
    if (arr.gfx) arr.gfx.destroy();
    for (const an of arr.anchors) if (an) an.destroy();
    this.arrays.splice(i, 1);
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() {
    for (const arr of this.arrays) { if (arr.gfx) arr.gfx.destroy(); for (const an of arr.anchors) if (an) an.destroy(); }
    this.arrays = [];
  }
}
