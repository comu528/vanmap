// 永劫氷鎖（frost_chain の進化・M7-C）: 最初の連鎖が複数方向へ分岐し、各分岐は同一敵へ再命中しない（全分岐で visited 共有）。
// 高冷気の敵を決定論的に優先し、一定 hop ごとに小範囲の氷鎖 burst を起こす。frozen 対象への（唯一の）命中で粉砕する（1対象1回・ボスは氷砕ゲージ・再帰なし）。
// cooldown・custom echo/clone（分岐数を抑える）。main cast 時のみ recordCast。Job Lv80 対象外。runtimeState: cdLeft のみ。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class EternalFrostChainSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._segs = []; this._reduced = false; }

  fire() {
    const p = this.scene.player; const ch = this.evoDef.chain || {}; const dmgD = this.evoDef.damage || {};
    const range = ch.range || 150;
    const start = this.scene.combat.densestPoint(range, 0) || { x: p.x, y: p.y };
    const first = this.scene.combat.nearestEnemy(start.x, start.y, 100000); if (!first) return;
    const branches = this._reduced ? 1 : Math.min(ch.branches || 3, this.cap('maxBranches', 4));
    const maxPerBranch = this._reduced ? Math.ceil((ch.count || 8) / 2) : (ch.count || 8);
    const falloff = dmgD.falloff || 0.9;
    const everyHops = (this.evoDef.burst || {}).everyHops || 3;
    const visited = new Set(); let totalHops = 0; const hopCap = this.cap('maxHops', 40);
    const hg = this.scene.nextHitGroupId();
    visited.add(first); totalHops++;
    this._drawSeg(p.x, p.y, first.x, first.y); this._hit(first, dmgD.base || 26, hg);
    for (let br = 0; br < branches; br++) {
      let px = first.x, py = first.y; let cur = this._nextHop(px, py, range, visited); let dmg = (dmgD.base || 26) * falloff; let hb = 0;
      while (cur && totalHops < hopCap && hb < maxPerBranch) {
        visited.add(cur); totalHops++; hb++;
        this._drawSeg(px, py, cur.x, cur.y); this._hit(cur, dmg, hg);
        if (hb % everyHops === 0) this._burst(cur.x, cur.y);
        px = cur.x; py = cur.y; cur = this._nextHop(px, py, range, visited); dmg *= falloff;
      }
    }
    this.scene.skills.recordExtra(this.id, 'chainsCast', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'totalHops', totalHops, 'add');
  }

  _hit(e, dmg, hg) {
    const wasFrozen = this.scene.combat.isFrozen(e);
    if (wasFrozen) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: (this.evoDef.shatter || {}).multiplier || 1.5, skillPower: dmg });
    let dd = dmg; if (wasFrozen) dd *= (1 + ((this.evoDef.damage || {}).frozenBonus || 0));
    this.scene.combat.dealDamage(e, dd, this.id, {
      element: 'ice', chillAmount: (this.evoDef.chill || {}).amount || 14, baseFreezeChance: 0,
      procCoefficient: this.evoDef.procCoefficient ?? 0.40, hitGroupId: hg, quiet: true, color: 0x80d8ff,
    });
  }

  _burst(x, y) {
    if (!this.scene.combat.frameBudget('eternalChainBurst', 'maxEternalFrostChainSegmentsPerFrame')) return;
    const b = this.evoDef.burst || {}; const hg = this.scene.nextHitGroupId();
    this.scene.combat.damageArea(x, y, b.radius || 60, b.damage || 16, this.id, {
      element: 'ice', chillAmount: (this.evoDef.chill || {}).burst || 10, baseFreezeChance: 0,
      procCoefficient: this.evoDef.procCoefficient ?? 0.40, hitGroupId: hg, quiet: true, color: 0xbde8ff,
    });
  }

  _nextHop(x, y, range, visited) {
    const cand = [];
    for (const e of this.scene.combat.enemiesInRadius(x, y, range)) {
      if (!e.alive || visited.has(e)) continue;
      const d2 = (e.x - x) * (e.x - x) + (e.y - y) * (e.y - y);
      cand.push({ e, score: d2 * (1 - 0.4 * this.scene.combat.chillRatio(e)) });
    }
    cand.sort((a, b) => a.score - b.score || (a.e._seq ?? 0) - (b.e._seq ?? 0) || a.e.x - b.e.x || a.e.y - b.e.y);
    return cand.length ? cand[0].e : null;
  }

  _drawSeg(x1, y1, x2, y2) {
    const g = this.scene.add.graphics().setDepth(8);
    g.lineStyle(2, 0xbde8ff, 0.85); g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
    this._segs.push({ gfx: g, life: 180, max: 180 });
  }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()
    for (let i = this._segs.length - 1; i >= 0; i--) {
      const g = this._segs[i]; g.life -= dt;
      if (g.gfx) g.gfx.setAlpha(Math.max(0, g.life / g.max) * 0.85);
      if (g.life <= 0) { if (g.gfx) g.gfx.destroy(); this._segs.splice(i, 1); }
    }
  }

  // 残響/複製（custom）: 分岐を抑えた連鎖（再帰なし）。
  echoCast() { this._reduced = true; try { this.fire(); } finally { this._reduced = false; } }
  cloneCast() { this.echoCast(); }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { for (const g of this._segs) if (g.gfx) g.gfx.destroy(); this._segs = []; }
}
