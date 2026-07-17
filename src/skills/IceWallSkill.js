// 氷壁結界（frost_mage・防御）: プレイヤー付近か敵の進行方向へ氷壁を生成。複数の壁セグメントで構成し、
// 通常敵は壁に沿って滑る（線分外への押し出し＝正式な経路探索は追加しない）。エリートは阻害が軽い。ボスは通過可能。
// 吸収可能な敵弾を受け止め、接触で耐久が減り、破壊時に小規模な氷爆発＋冷気付与。壁はプレイヤーを閉じ込めない。
// echo/clone は壁の多重生成を避け、破壊爆発部分または短命の補助壁1枚のみを再現する。

import { SkillBase } from './SkillBase.js';

const SEG_HALF_LEN = 10;   // セグメント（矩形）の半長
const SEG_THICK = 7;       // セグメントの厚み（押し出し半径の基準）

export class IceWallSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.walls = []; // { segs:[{x,y,dur,gfx,hitCd:Map}], until }
  }

  canFire(ctx) { return true; } // 常時（敵がいなくても防御的に設置可）

  fire(ctx) {
    const s = this.stats;
    const wallCap = this.scene.combat.skillCap('maxIceWalls', 3);
    const segCap = this.scene.combat.skillCap('maxIceWallSegments', 18);
    while (this.walls.length >= wallCap) this._removeWall(0);
    const p = this.scene.player;
    const target = this.scene.combat.nearestEnemy(p.x, p.y, 400);
    const ang = target ? Math.atan2(target.y - p.y, target.x - p.x) : 0;
    // 壁はプレイヤーの少し前方に、進行方向へ垂直な線分として並べる。
    const cx = p.x + Math.cos(ang) * 42, cy = p.y + Math.sin(ang) * 42;
    const perp = ang + Math.PI / 2;
    const n = Math.min(s.segmentCount || 3, Math.max(1, segCap - this._segCount()));
    const step = (s.wallLength || 90) / Math.max(1, n - 1 || 1);
    const segs = [];
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * step;
      const sx = cx + Math.cos(perp) * off, sy = cy + Math.sin(perp) * off;
      const gfx = this.scene.add.rectangle(sx, sy, SEG_HALF_LEN * 2, SEG_THICK * 2, 0x9fe8ff, 0.55).setDepth(8).setRotation(perp);
      gfx.setStrokeStyle(1, 0xe1f5fe, 0.8);
      segs.push({ x: sx, y: sy, dur: s.durability || 4, gfx, hitCd: new Map() });
    }
    this.walls.push({ segs, until: this.scene.time.now + (s.duration || 5000) });
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()
    const now = this.scene.time.now;
    const s = this.stats;
    let collisions = 0;
    const colCap = this.scene.combat.skillCap('maxIceWallCollisionsPerFrame', 70);
    const pushR = SEG_THICK + 8;
    for (let w = this.walls.length - 1; w >= 0; w--) {
      const wall = this.walls[w];
      if (now >= wall.until) { this._breakWall(w, s); continue; }
      for (let si = wall.segs.length - 1; si >= 0; si--) {
        const seg = wall.segs[si];
        // 敵弾の吸収（受け止め）。
        const absorbed = this.scene.combat.absorbBossBullets ? this.scene.combat.absorbBossBullets(seg.x, seg.y, pushR + 4, 2) : 0;
        if (absorbed > 0) { seg.dur -= absorbed; }
        // 敵の押し出し（通常敵＝ブロック / エリート＝減速のみ / ボス＝通過）。
        this.scene.combat.forEachEnemyInRadius(seg.x, seg.y, pushR + 12, (e) => {
          if (!e.alive || e.isBoss) return;
          if (collisions >= colCap) { if (this.scene._m) this.scene._m.suppressed++; return; }
          const dx = e.x - seg.x, dy = e.y - seg.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d >= pushR + 6) return;
          collisions++;
          if (e.isElite) {
            // エリート: 阻害を軽減（ブロックせず強めの減速のみ）。
            if (e.applySlow) e.applySlow(0.45, 200);
          } else {
            // 通常敵: 線分外へ押し出し＝壁に沿って滑る。
            const nx = dx / d, ny = dy / d;
            e.x = seg.x + nx * (pushR + 6);
            e.y = seg.y + ny * (pushR + 6);
            if (e.body) e.setVelocity(e.body.velocity.x * 0.2, e.body.velocity.y * 0.2);
          }
          // 接触で耐久減（同一敵は短時間クールダウン）。
          const cd = seg.hitCd.get(e) || 0;
          if (now >= cd) { seg.hitCd.set(e, now + 260); seg.dur -= 1; }
        });
        if (seg.dur <= 0) { this._breakSeg(seg, s); wall.segs.splice(si, 1); }
      }
      if (wall.segs.length === 0) this.walls.splice(w, 1);
    }
  }

  // 破壊: 小規模な氷爆発＋冷気付与（isShatter ではない・通常の氷ダメージ）。
  _breakSeg(seg, s) {
    if (seg.gfx) seg.gfx.destroy();
    this.scene.effects.explosion(seg.x, seg.y, s.breakRadius || 40, 0x9fe8ff);
    this.scene.combat.damageArea(seg.x, seg.y, s.breakRadius || 40, s.breakDamage || 20, this.id, {
      element: 'ice', chillAmount: s.chillOnBreak || 25, baseFreezeChance: 0.05,
      procCoefficient: this.def?.procCoefficient ?? 0.5, hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x9fe8ff,
    });
  }
  _breakWall(i, s) { const wall = this.walls[i]; if (!wall) return; for (const seg of wall.segs) this._breakSeg(seg, s); this.walls.splice(i, 1); }
  _removeWall(i) { const wall = this.walls[i]; if (!wall) return; for (const seg of wall.segs) if (seg.gfx) seg.gfx.destroy(); this.walls.splice(i, 1); }
  _segCount() { let n = 0; for (const w of this.walls) n += w.segs.length; return n; }

  // 残響（custom・canTriggerEcho=false のため実際には呼ばれないが安全に）: 破壊爆発部分のみを再現（壁は生成しない）。
  echoCast() {
    const s = this.stats; const p = this.scene.player;
    this.scene.combat.damageArea(p.x, p.y, s.breakRadius || 40, s.breakDamage || 20, this.id, {
      element: 'ice', chillAmount: s.chillOnBreak || 25, procCoefficient: 0.5, hitGroupId: this.scene.nextHitGroupId(), quiet: true, color: 0x9fe8ff,
    });
  }
  // 複製（custom）: 破壊爆発部分のみ（壁の多重生成をしない＝危険な回避不能地形を作らない）。
  cloneCast() { this.echoCast(); }

  // 途中再開でクールダウンのみ維持（氷壁の位置は保存せず再開後に安全再構築＝二重生成しない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }

  destroy() { for (const w of this.walls) for (const seg of w.segs) if (seg.gfx) seg.gfx.destroy(); this.walls = []; }
}
