// 炎脈走破（M6-E）: 短い分節が蛇行しながら地を裂く地割れ。分節は使い回さず個別に生成し、
// 敵密集地へ向かってバイアスしつつ index ベースの決定論的メアンダで曲がる（Math.random 不使用）。
// 同時脈数・総分節数は skillCap で上限。各分節は寿命内で tickMs ごとに中心付近へ範囲DoT。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

// 角度差を [-PI, PI] に正規化。
function angDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

export class MagmaVeinSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.segments = []; // { x, y, angle, left, tickAcc, w, dmg, gfx }
  }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player; const combat = this.scene.combat;
    const veinCap = combat.skillCap('maxMagmaVeins', 4);
    const segCap = combat.skillCap('maxMagmaSegments', 36);
    const wantVeins = Math.min(s.veinCount || 2, veinCap);
    const segsPer = Math.max(1, s.segments || 6);
    const segLength = s.segLength || 26;
    const width = s.width || 14;
    const dmg = s.damage || 12;
    const segLifetime = s.segLifetime || 1600;
    const meander = s.meander || 0.5; // 1分節あたりの最大旋回量(rad)

    let veinsMade = 0, segsMade = 0;
    for (let v = 0; v < wantVeins; v++) {
      if (this.segments.length >= segCap) break;
      // 起点は密集地点、無ければプレイヤー近傍。
      const dense = combat.densestPoint((s.area || 90), 0);
      let sx = p.x, sy = p.y;
      if (dense) { sx = dense.x; sy = dense.y; }
      // 脈ごとに少し起点をずらす（決定論的）。
      const spread = (v - (wantVeins - 1) / 2) * segLength * 0.8;
      const perp = (Math.PI / 2);
      const baseTarget = combat.nearestEnemy(sx, sy, 9999) || dense || { x: p.x + 1, y: p.y };
      let heading = Math.atan2(baseTarget.y - sy, baseTarget.x - sx);
      sx += Math.cos(heading + perp) * spread;
      sy += Math.sin(heading + perp) * spread;

      let x = sx, y = sy, made = false;
      for (let i = 0; i < segsPer; i++) {
        if (this.segments.length >= segCap) break;
        // 敵方向へのバイアス（密集/最寄りを都度参照）。
        const tgt = combat.nearestEnemy(x, y, 9999) || baseTarget;
        let bias = 0;
        if (tgt) bias = clamp(angDiff(Math.atan2(tgt.y - y, tgt.x - x), heading), -meander, meander) * 0.5;
        // index パリティで符号を交互にする決定論的メアンダ＋敵方向バイアス。
        const sign = (i % 2 === 0) ? 1 : -1;
        let turn = sign * meander * 0.55 + bias;
        turn = clamp(turn, -meander, meander); // 鋭い反転を避ける
        heading += turn;
        const nx = x + Math.cos(heading) * segLength;
        const ny = y + Math.sin(heading) * segLength;
        const cx = (x + nx) / 2, cy = (y + ny) / 2; // 前分節の真上に重ならない
        const gfx = this.scene.add.rectangle(cx, cy, segLength, width, 0xff5722, 0.4).setDepth(40);
        gfx.setRotation(heading);
        this.segments.push({ x: cx, y: cy, angle: heading, left: segLifetime, tickAcc: 0, w: width, dmg, gfx });
        x = nx; y = ny; segsMade++; made = true;
      }
      if (made) veinsMade++;
    }
    if (veinsMade) this.scene.skills.recordExtra(this.id, 'veinsCreated', veinsMade, 'add');
    if (segsMade) this.scene.skills.recordExtra(this.id, 'segmentsCreated', segsMade, 'add');
    this.scene.skills.recordExtra(this.id, 'highestConcurrentObjects', this.segments.length, 'max');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウン管理＋発火
    const s = this.stats; const tickMs = (s && s.tickMs) || 220;
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const seg = this.segments[i];
      seg.left -= dt;
      seg.tickAcc += dt;
      if (seg.tickAcc >= tickMs) {
        seg.tickAcc -= tickMs;
        const r = Math.max(seg.w, 10);
        this.scene.combat.damageArea(seg.x, seg.y, r, seg.dmg, this.id, { isDoT: true, tag: 'dot', quiet: true, color: 0xff5722 });
        this.scene.skills.recordExtra(this.id, 'totalGroundDamage', seg.dmg, 'add');
      }
      if (seg.left <= 0) { if (seg.gfx) seg.gfx.destroy(); this.segments.splice(i, 1); }
    }
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { for (const seg of this.segments) if (seg.gfx) seg.gfx.destroy(); this.segments = []; }
}
