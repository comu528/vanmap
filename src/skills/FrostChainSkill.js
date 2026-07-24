// 氷鎖連閃（frost_mage・M7-C・uncommon）: プレイヤーに近い密集地点の敵から始まり、範囲内の未命中の敵へ順番に連鎖する瞬間攻撃。
// 各 hop でダメージ（後半ほど減衰）と冷気を与え、高冷気の敵を決定論的に優先する。同一 cast で同じ敵へ再連鎖しない。ボスへも連鎖し、氷砕ゲージへ接続。
// cooldown。recordCast は連鎖開始時に1回（各 hop では記録しない）。runtimeState: cdLeft のみ（連鎖の対象列・線は保存しない）。

import { SkillBase } from './SkillBase.js';

export class FrostChainSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._segs = []; } // 短命の連鎖線（表示のみ）
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats; const p = this.scene.player;
    const range = s.chainRange || 120;
    const start = this.scene.combat.densestPoint(range, 0) || { x: p.x, y: p.y };
    let cur = this.scene.combat.nearestEnemy(start.x, start.y, 100000);
    if (!cur) return;
    const chainCount = s.chainCount || 3;
    const falloff = s.damageFalloff || 0.88;
    const visited = new Set();
    let dmg = s.damage; let px = p.x, py = p.y;
    let hops = 0; const segCap = this.scene.combat.skillCap('maxFrostChainSegmentsPerFrame', 48);
    const hg = this.scene.nextHitGroupId();
    for (let i = 0; i < chainCount; i++) {
      if (!cur || visited.has(cur) || !cur.alive) break;
      if (hops >= segCap) { if (this.scene._m) this.scene._m.suppressed++; break; }
      visited.add(cur); hops++;
      this._drawSeg(px, py, cur.x, cur.y);
      this.scene.combat.dealDamage(cur, dmg, this.id, {
        element: 'ice', chillAmount: s.chillAmount, baseFreezeChance: 0,
        procCoefficient: this.def?.procCoefficient ?? 0.38, hitGroupId: hg, quiet: true, color: 0x80d8ff,
      });
      px = cur.x; py = cur.y;
      cur = this._nextHop(px, py, range, visited);
      dmg *= falloff;
    }
    this.scene.skills.recordExtra(this.id, 'chainsCast', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'totalHops', hops, 'add');
    this.scene.skills.recordExtra(this.id, 'uniqueTargets', visited.size, 'max');
  }

  // 未命中の最寄り敵（高冷気を優先）を決定論的に選ぶ。同点は entity 順（_seq→x→y）で安定決定。
  _nextHop(x, y, range, visited) {
    const cand = [];
    for (const e of this.scene.combat.enemiesInRadius(x, y, range)) {
      if (!e.alive || visited.has(e)) continue;
      const d2 = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      const chillR = this.scene.combat.chillRatio(e);
      cand.push({ e, score: d2 * (1 - 0.4 * chillR) });
    }
    cand.sort((a, b) => a.score - b.score || (a.e._seq ?? 0) - (b.e._seq ?? 0) || a.e.x - b.e.x || a.e.y - b.e.y);
    return cand.length ? cand[0].e : null;
  }

  _drawSeg(x1, y1, x2, y2) {
    const g = this.scene.add.graphics().setDepth(8);
    g.lineStyle(2, 0xbde8ff, 0.8); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
    this._segs.push({ gfx: g, life: 160, max: 160 });
  }

  update(dt, ctx) {
    super.update(dt, ctx); // クールダウンで fire()（連鎖）
    for (let i = this._segs.length - 1; i >= 0; i--) {
      const g = this._segs[i]; g.life -= dt;
      if (g.gfx) g.gfx.setAlpha(Math.max(0, g.life / g.max) * 0.8);
      if (g.life <= 0) { if (g.gfx) g.gfx.destroy(); this._segs.splice(i, 1); }
    }
  }

  // 残響/複製（standard 既定）: fire() を再実行（別 castId/hitGroupId の連鎖・再帰なし）。

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { for (const g of this._segs) if (g.gfx) g.gfx.destroy(); this._segs = []; }
}
