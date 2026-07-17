// 大地灼断（炎脈走破の進化・M6-E）: 複数の大型地割れを別方向へ走らせ、
// 別の脈同士の分節が交差した点で追加噴出（1詠唱につき各交差1回のみ）。
// さらにプレイヤーの移動軌跡に沿って短い小地割れを残す（~200ms サンプリング）。
// 半透明で弾/プレイヤーを覆い隠さない。交差判定は cap と frameBudget で上限化。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
// 線分 (p1,p2) と (p3,p4) が交差するかの向き判定。
function ccw(ax, ay, bx, by, cx, cy) { return (cy - ay) * (bx - ax) - (by - ay) * (cx - ax); }
function segIntersect(a, b, c, d) {
  const d1 = ccw(c.x, c.y, d.x, d.y, a.x, a.y);
  const d2 = ccw(c.x, c.y, d.x, d.y, b.x, b.y);
  const d3 = ccw(a.x, a.y, b.x, b.y, c.x, c.y);
  const d4 = ccw(a.x, a.y, b.x, b.y, d.x, d.y);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

export class WorldScorchingRiftSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.fissures = []; // { fid, segs:[{id,a,b,x,y,angle,left,tickAcc,w,gfx}] }
    this.trail = [];    // { x, y, angle, left, tickAcc, w, gfx }
    this._segId = 0;
    this._eruptedPairs = new Set(); // 1詠唱内で交差済みの分節ペア
    this._interCount = 0;           // 1詠唱内の交差噴出数
    this._trailAcc = 0;
    this._lastTrail = null;
  }

  _mkSeg(fid, sx, sy, heading, segLength, width, life) {
    const nx = sx + Math.cos(heading) * segLength;
    const ny = sy + Math.sin(heading) * segLength;
    const cx = (sx + nx) / 2, cy = (sy + ny) / 2;
    const gfx = this.scene.add.rectangle(cx, cy, segLength, width, 0xff5722, 0.4).setDepth(40).setRotation(heading);
    const seg = { id: this._segId++, a: { x: sx, y: sy }, b: { x: nx, y: ny }, x: cx, y: cy, angle: heading, left: life, tickAcc: 0, w: width, gfx };
    return { seg, ex: nx, ey: ny };
  }

  // クールダウンで多脈パターンを展開。
  deploy() {
    const d = this.evoDef; const p = this.scene.player; const combat = this.scene.combat;
    const veinCap = this.cap('maxMagmaVeins', 4);
    const segCap = this.cap('maxMagmaSegments', 48);
    const wantVeins = Math.min((d.projectileCount && d.projectileCount.veins) || 3, veinCap);
    const segsPer = Math.max(1, (d.projectileCount && d.projectileCount.segments) || 8);
    const width = ((d.area && d.area.width) || 22) * this.passiveAreaMult();
    const segLength = (d.area && d.area.segLength) || 34;
    const life = (d.timing && d.timing.segLifetime) || 2000;
    // 詠唱ごとに交差記録をリセット（過去詠唱の交差と混同しない）。
    this._eruptedPairs.clear(); this._interCount = 0;

    const dense = combat.densestPoint((d.area && d.area.width ? d.area.width * 4 : 120), 0);
    const cx0 = dense ? dense.x : p.x, cy0 = dense ? dense.y : p.y;
    let totalSegs = 0;
    for (const f of this.fissures) totalSegs += f.segs.length;

    let veinsMade = 0;
    for (let v = 0; v < wantVeins; v++) {
      if (totalSegs >= segCap) break;
      // 各脈は別方向（中心を貫くように配置）。
      const heading0 = (Math.PI * 2 * v) / Math.max(1, wantVeins) + (dense ? Math.atan2(dense.y - p.y, dense.x - p.x) : 0);
      // 中心から手前側へ引いた点を起点にし、中心を横断させる。
      let x = cx0 - Math.cos(heading0) * segLength * segsPer * 0.5;
      let y = cy0 - Math.sin(heading0) * segLength * segsPer * 0.5;
      const fis = { fid: v, segs: [] };
      let heading = heading0;
      for (let i = 0; i < segsPer; i++) {
        if (totalSegs >= segCap) break;
        // 大型脈は概ね直進（僅かな決定論的うねり）。
        heading = heading0 + Math.sin(i * 0.9) * 0.18;
        const r = this._mkSeg(fis.fid, x, y, heading, segLength, width, life);
        fis.segs.push(r.seg); x = r.ex; y = r.ey; totalSegs++;
      }
      if (fis.segs.length) { this.fissures.push(fis); veinsMade++; }
    }
    if (veinsMade) this.scene.skills.recordExtra(this.id, 'veinsCreated', veinsMade, 'add');
  }

  update(dt, ctx) {
    const d = this.evoDef; const combat = this.scene.combat; const p = this.scene.player;
    this._cd -= dt;
    if (this._cd <= 0 && ctx.hasEnemies) {
      this._cd = (d.cooldown || 5000) * this.passiveCooldownMult();
      this.scene.skills.recordCast(this.id);
      this.deploy();
    }

    // プレイヤー軌跡の小地割れ（~200ms サンプリング）。
    this._trailAcc += dt;
    if (this._trailAcc >= 200) {
      this._trailAcc = 0;
      const segCap = this.cap('maxMagmaSegments', 48);
      let totalSegs = this.trail.length;
      for (const f of this.fissures) totalSegs += f.segs.length;
      if (totalSegs < segCap) {
        const prev = this._lastTrail || { x: p.x, y: p.y };
        const ang = Math.atan2(p.y - prev.y, p.x - prev.x);
        const len = Math.min(28, Math.max(10, Math.hypot(p.x - prev.x, p.y - prev.y)));
        const w = (d.area && d.area.width ? d.area.width * 0.5 : 12);
        const gfx = this.scene.add.rectangle(p.x, p.y, len, w, 0xff7043, 0.35).setDepth(39).setRotation(ang);
        this.trail.push({ x: p.x, y: p.y, angle: ang, left: (d.timing && d.timing.trailLifetime) || 900, tickAcc: 0, w, gfx });
      }
      this._lastTrail = { x: p.x, y: p.y };
    }

    const tickMs = (d.timing && d.timing.tickMs) || 220;
    // 大型地割れの tick とライフ管理。
    for (let fi = this.fissures.length - 1; fi >= 0; fi--) {
      const f = this.fissures[fi];
      for (let i = f.segs.length - 1; i >= 0; i--) {
        const seg = f.segs[i];
        seg.left -= dt; seg.tickAcc += dt;
        if (seg.tickAcc >= tickMs) {
          seg.tickAcc -= tickMs;
          combat.damageArea(seg.x, seg.y, Math.max(seg.w, 12), (d.damage && d.damage.fissure) || 18, this.id, { isDoT: true, tag: 'dot', quiet: true, color: 0xff5722 });
        }
        if (seg.left <= 0) { if (seg.gfx) seg.gfx.destroy(); f.segs.splice(i, 1); }
      }
      if (f.segs.length === 0) this.fissures.splice(fi, 1);
    }

    // 軌跡小地割れの tick。
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const t = this.trail[i];
      t.left -= dt; t.tickAcc += dt;
      if (t.tickAcc >= tickMs) {
        t.tickAcc -= tickMs;
        combat.damageArea(t.x, t.y, Math.max(t.w, 10), (d.damage && d.damage.trail) || 8, this.id, { isDoT: true, tag: 'dot', quiet: true, color: 0xff7043 });
      }
      if (t.left <= 0) { if (t.gfx) t.gfx.destroy(); this.trail.splice(i, 1); }
    }

    this._detectIntersections();

    let total = this.trail.length;
    for (const f of this.fissures) total += f.segs.length;
    this.scene.skills.recordExtra(this.id, 'highestConcurrentObjects', total, 'max');
  }

  _detectIntersections() {
    const d = this.evoDef; const combat = this.scene.combat;
    const maxInter = this.cap('maxMagmaIntersections', 12);
    if (this._interCount >= maxInter) return;
    const ir = (d.area && d.area.intersectionRadius) || 40;
    const idmg = (d.damage && d.damage.intersection) || 30;
    for (let ai = 0; ai < this.fissures.length; ai++) {
      for (let bi = ai + 1; bi < this.fissures.length; bi++) {
        const fa = this.fissures[ai], fb = this.fissures[bi];
        for (const sa of fa.segs) {
          for (const sb of fb.segs) {
            const key = sa.id < sb.id ? (sa.id + '_' + sb.id) : (sb.id + '_' + sa.id);
            if (this._eruptedPairs.has(key)) continue;
            if (!segIntersect(sa.a, sa.b, sb.a, sb.b)) continue;
            if (!combat.frameBudget('riftInter', 'maxArrayTicksPerFrame')) return; // 予算切れ→繰り越し
            this._eruptedPairs.add(key);
            const ix = (sa.x + sb.x) / 2, iy = (sa.y + sb.y) / 2;
            combat.damageArea(ix, iy, ir, idmg, this.id, { isExplosion: true, color: 0xffab40 });
            if (this.scene.effects && this.scene.effects.explosion) this.scene.effects.explosion(ix, iy, ir, 0xffab40);
            this._interCount++;
            this.scene.skills.recordExtra(this.id, 'intersections', 1, 'add');
            if (this._interCount >= maxInter) return;
          }
        }
      }
    }
  }

  // 残響/分身: 削減した1脈のみを安全に再展開（消費・状態変更なし）。
  echoCast() {
    const d = this.evoDef; const p = this.scene.player; const combat = this.scene.combat;
    const segCap = this.cap('maxMagmaSegments', 48);
    let totalSegs = this.trail.length;
    for (const f of this.fissures) totalSegs += f.segs.length;
    if (totalSegs >= segCap) return;
    const dense = combat.densestPoint(120, 0);
    const cx0 = dense ? dense.x : p.x, cy0 = dense ? dense.y : p.y;
    const segsPer = Math.max(1, Math.floor(((d.projectileCount && d.projectileCount.segments) || 8) * 0.5));
    const width = ((d.area && d.area.width) || 22) * this.passiveAreaMult();
    const segLength = (d.area && d.area.segLength) || 34;
    const life = ((d.timing && d.timing.segLifetime) || 2000) * 0.6;
    const heading0 = dense ? Math.atan2(dense.y - p.y, dense.x - p.x) : 0;
    let x = cx0 - Math.cos(heading0) * segLength * segsPer * 0.5;
    let y = cy0 - Math.sin(heading0) * segLength * segsPer * 0.5;
    const fis = { fid: 90 + this.fissures.length, segs: [] };
    for (let i = 0; i < segsPer; i++) {
      if (totalSegs >= segCap) break;
      const r = this._mkSeg(fis.fid, x, y, heading0 + Math.sin(i * 0.9) * 0.18, segLength, width, life);
      fis.segs.push(r.seg); x = r.ex; y = r.ey; totalSegs++;
    }
    if (fis.segs.length) this.fissures.push(fis);
  }
  cloneCast() { this.echoCast(); }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() {
    for (const f of this.fissures) for (const seg of f.segs) if (seg.gfx) seg.gfx.destroy();
    for (const t of this.trail) if (t.gfx) t.gfx.destroy();
    this.fissures = []; this.trail = []; this._eruptedPairs.clear();
  }
}
