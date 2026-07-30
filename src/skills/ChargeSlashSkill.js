// 突進斬り（M8-B・戦士）: 敵の密集地点へ短距離ダッシュしながら斬り抜ける。
// - 突進中は被ダメージ軽減（WarriorCombatSystem の charge ウィンドウ）。
// - 経路上の敵へ 1 体 1 回だけ命中（hitOncePerTarget）。
// - 対象消失・壁外・NaN・無限ダッシュを起こさない（距離と時間の両方で必ず終了する）。
// - dash 開始で 1 回だけ recordCast する（通過した敵ごとには記録しない）。
// - ボス予告中は突進先をボスから離す（完全無視して突っ込まない）。
import { WarriorSkillBase } from './WarriorSkillBase.js';

const SAFE_MARGIN = 24;

export class ChargeSlashSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._dash = null; }
  canFire(ctx) { return !!ctx.hasEnemies && !this._dash; }

  fire() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const p = this.scene.player;
    const cfg = this.def?.config || {};
    const dist = Math.max(cfg.minDistance ?? 40, s.distance);
    let ang = this.facing(dist);
    // ボスが予告/突進中なら、その方向へは踏み込まない（真逆へ 90 度ずらす）。
    const boss = this.scene.boss;
    if (boss && boss.alive && (boss.state === 'telegraph' || boss.state === 'charge')) {
      const toBoss = Math.atan2(boss.y - p.y, boss.x - p.x);
      let diff = ang - toBoss;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) < 0.8) ang = toBoss + (diff >= 0 ? 1.2 : -1.2);
    }
    const wb = this.scene.combat.worldBounds ? this.scene.combat.worldBounds() : { w: 1600, h: 1200 };
    // 目的地をワールド内へクランプ（壁外・NaN を作らない）。
    let tx = p.x + Math.cos(ang) * dist;
    let ty = p.y + Math.sin(ang) * dist;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) { tx = p.x; ty = p.y; }
    tx = Math.max(SAFE_MARGIN, Math.min(wb.w - SAFE_MARGIN, tx));
    ty = Math.max(SAFE_MARGIN, Math.min(wb.h - SAFE_MARGIN, ty));
    const travel = Math.hypot(tx - p.x, ty - p.y);
    const speed = Math.max(60, cfg.dashSpeed ?? 520);
    const durMs = Math.min(600, (travel / speed) * 1000);
    this._dash = {
      castKey: this.newCastKey(), leftMs: durMs, totalMs: Math.max(1, durMs),
      // hitOncePerTarget（data）: 経路上の敵へ 1 体 1 回だけ命中させる。
      // false を宣言した場合は毎フレーム当たり判定を通す（現在の data は true）。
      angle: ang, speed, traveled: 0, maxTravel: travel,
      hitSet: cfg.hitOncePerTarget === false ? null : new Set(),
    };
    if (this.warrior) this.warrior.setChargeWindow(durMs);
    this.scene.skills.recordExtra(this.id, 'charges', 1, 'add');
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    this._updateDash(dt);
  }

  _updateDash(dt) {
    const d = this._dash; if (!d) return;
    const s = this.stats; if (!s) { this._dash = null; return; }
    const p = this.scene.player;
    d.leftMs -= dt;
    const step = Math.min(d.speed * (dt / 1000), Math.max(0, d.maxTravel - d.traveled));
    if (step > 0) {
      const nx = p.x + Math.cos(d.angle) * step;
      const ny = p.y + Math.sin(d.angle) * step;
      if (Number.isFinite(nx) && Number.isFinite(ny)) { p.x = nx; p.y = ny; }
      d.traveled += step;
      this.scene.skills.recordExtra(this.id, 'dashDistance', step, 'add');
    }
    // 経路上の敵を斬る（1 体 1 回・上限つき）。
    const cap = this.scene.combat.skillCap('maxChargeHits', 14);
    const used = d.hitSet ? d.hitSet.size : 0;
    if (used < cap) {
      this.scene.combat.meleeStrike({
        x: p.x, y: p.y, radius: this.meleeRadius(s.width), arc: Math.PI * 2, facing: 0,
        damage: s.damage, skillId: this.id, castKey: d.castKey,
        knockback: s.knockback, poiseDamage: s.poiseDamage,
        comboGain: s.comboGain, furyGain: s.furyGain,
        tags: ['melee', 'slash', 'charge'], color: 0xff8a65,
        hitSet: d.hitSet || undefined, maxTargets: cap - used,
      });
    }
    if (d.leftMs <= 0 || d.traveled >= d.maxTravel) this._dash = null;
  }

  get charging() { return !!this._dash; }
  chargeMitigation() { return this._dash ? (this.stats?.mitigationValue || 0) : 0; }

  serializeState() {
    return { cdLeft: this._cd, dashLeftMs: this._dash ? this._dash.leftMs : 0 };
  }
  restoreState(st) {
    if (!st) return;
    this.restoreCd(st.cdLeft);
    // 突進の途中状態は復元しない（無料の再ダッシュ・座標の飛びを防ぐ）。CD だけを戻す。
    this._dash = null;
  }
  destroy() { this._dead = true; this._dash = null; }
}
