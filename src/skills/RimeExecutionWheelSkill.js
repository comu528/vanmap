// 冥氷処刑輪（rime_boomerang の進化・M7-C）: 複数の巨大氷輪を扇状に射出し、遠方で短時間停止した後プレイヤーへ収束帰還する。
// 往路・停止中の回転・復路でヒット間隔を分離（各 leg で別 hitSet）し、無制限多段を防ぐ。復路は高威力で、凍結中の敵を1回だけ強化粉砕する（ボスは氷砕ゲージ・再帰なし）。
// cooldown・standard echo/clone。main cast 時のみ recordCast（EvolvedSkillBase.update）。Job Lv80 対象外。runtimeState: cdLeft のみ（飛行中位置は保存しない）。

import { EvolvedSkillBase } from './EvolvedSkillBase.js';

export class RimeExecutionWheelSkill extends EvolvedSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.wheels = []; }

  fire() {
    const p = this.scene.player; const w = this.evoDef.wheel || {};
    const spot = this.scene.combat.densestPoint(120, 0) || this.scene.combat.nearestEnemy(p.x, p.y, 100000) || { x: p.x + 100, y: p.y };
    const baseAng = Math.atan2(spot.y - p.y, spot.x - p.x);
    const n = Math.min(w.count || 4, this.cap('maxWheels', 6));
    const spread = w.spreadAngle || 0.5;
    for (let i = 0; i < n; i++) {
      const ang = baseAng + (n > 1 ? (i - (n - 1) / 2) * spread : 0);
      const gfx = this.scene.add.image(p.x, p.y, 'icon_rime_execution_wheel').setDepth(45).setScale(1.1).setAlpha(0.9).setTint(0xbde8ff);
      this.wheels.push({ x: p.x, y: p.y, dx: Math.cos(ang), dy: Math.sin(ang), traveled: 0, maxTravel: w.range || 210, leg: 'out', holdLeft: w.holdMs || 400, hitSet: new Set(), gfx, spin: 0 });
    }
    this.scene.skills.recordExtra(this.id, 'wheelsLaunched', n, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx); // evoDef.cooldown で fire()
    if (!this.wheels.length) return;
    const p = this.scene.player; const w = this.evoDef.wheel || {}; const d = this.evoDef.damage || {};
    const step = (w.speed || 260) * dt / 1000;
    let hits = 0; const hitCap = this.scene.combat.skillCap('maxRimeExecutionWheelHitsPerFrame', 72);
    for (let b = this.wheels.length - 1; b >= 0; b--) {
      const wl = this.wheels[b]; wl.spin += dt * 0.03;
      if (wl.leg === 'out') { wl.x += wl.dx * step; wl.y += wl.dy * step; wl.traveled += step; if (wl.traveled >= wl.maxTravel) { wl.leg = 'hold'; wl.hitSet = new Set(); } }
      else if (wl.leg === 'hold') { wl.holdLeft -= dt; if (wl.holdLeft <= 0) { wl.leg = 'return'; wl.hitSet = new Set(); } }
      else { const rx = p.x - wl.x, ry = p.y - wl.y; const dist = Math.hypot(rx, ry) || 1; wl.x += rx / dist * step; wl.y += ry / dist * step; if (dist <= step + 12) { if (wl.gfx) wl.gfx.destroy(); this.wheels.splice(b, 1); continue; } }
      if (wl.gfx) wl.gfx.setPosition(wl.x, wl.y).setRotation(wl.spin);
      const isReturn = wl.leg === 'return';
      const proc = isReturn ? (this.evoDef.returnProc ?? 0.58) : (this.evoDef.outboundProc ?? 0.42);
      const base = (d.outbound || 26) * (isReturn ? (d.returnMult || 1.5) : 1);
      const hg = this.scene.nextHitGroupId();
      for (const e of this.scene.combat.enemiesInRadius(wl.x, wl.y, 20)) {
        if (!e.alive || wl.hitSet.has(e)) continue;
        if (hits >= hitCap) { if (this.scene._m) this.scene._m.suppressed++; break; }
        hits++; wl.hitSet.add(e);
        const wasFrozen = this.scene.combat.isFrozen(e);
        if (isReturn && wasFrozen) this.scene.combat.shatterEnemy(e, { skillId: this.id, multiplier: (this.evoDef.shatter || {}).multiplier || 1.6, skillPower: base });
        let dd = base; if (wasFrozen) dd *= (1 + (d.frozenBonus || 0));
        this.scene.combat.dealDamage(e, dd, this.id, {
          element: 'ice', chillAmount: (this.evoDef.chill || {}).amount || 13, baseFreezeChance: 0,
          procCoefficient: proc, hitGroupId: hg, quiet: true, color: 0xbde8ff,
        });
      }
    }
  }

  // 残響/複製（standard 既定）: fire() を再実行（追加の氷輪・再帰なし）。

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) { if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft; }
  destroy() { for (const w of this.wheels) if (w.gfx) w.gfx.destroy(); this.wheels = []; }
}
