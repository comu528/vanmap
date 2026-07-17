// 炉心暴走（M6-E・伝説/エスカレート/高リスク）: 一定間隔で火弾を放ち、発動のたび熱量が上昇。
// 熱量が高いほど発動間隔が短く・弾数増・威力増・弾速増。最大熱量でオーバーヒート（一時停止）→ reset 熱量へ落として再開。
// 未発動時は徐々に冷却。熱量は「通常発動のみ」で上昇し、echo/clone は攻撃弾のみ再現して熱量を変えない。
// オーバーヒート開始/終了は recordCast しない（主発動 fire のみ recordCast）。リロードで熱量/オーバーヒートを有利に初期化しない。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class CoreOverdriveSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._heat = 0;
    this._overheatLeft = 0;
    this._cd = 0;
    this._idle = 0;
  }

  canFire() { return false; } // 常時 update で管理

  update(dt) {
    if (this.scene.gameOver) return; // 一時停止/ゲームオーバー中は熱量/冷却/オーバーヒートを進めない。
    const s = this.stats; if (!s) return;
    const cfg = this.def.config || {};
    const maxHeat = s.maxHeat || 100;
    const coolRate = s.cooldownRate || 12;

    // オーバーヒート中: 攻撃停止。終了時に熱量を reset 値へ落とし、小爆発（recordCast しない）。
    if (this._overheatLeft > 0) {
      this._overheatLeft -= dt;
      this.scene.skills.recordExtra(this.id, 'timeAtHighHeat', dt, 'add'); // 熱量最大＝高熱状態。
      if (this._overheatLeft <= 0) {
        this._overheatLeft = 0;
        this._heat = (cfg.overheatResetHeat != null) ? cfg.overheatResetHeat : 30;
        const p = this.scene.player;
        const r = 60 * this.passiveAreaMult() * this.explosionAreaMult();
        this.scene.combat.damageArea(p.x, p.y, r, s.overheatBlastDamage || 40, this.id, { isExplosion: true, element: 'fire' });
        this.scene.effects.explosion(p.x, p.y, r, 0xff5722);
      }
      return;
    }

    this._cd -= dt;
    const heatFrac = maxHeat > 0 ? this._heat / maxHeat : 0;
    if (heatFrac > 0.75) this.scene.skills.recordExtra(this.id, 'timeAtHighHeat', dt, 'add');

    if (this._cd > 0) { // 待機中は冷却。
      this._heat = Math.max(0, this._heat - coolRate * dt / 1000);
      return;
    }

    // 発動可能タイミング。敵がいなければ撃たず、冷却しながら待つ。
    const p = this.scene.player;
    const target = this.scene.combat.nearestEnemy(p.x, p.y, 100000);
    if (!target) { this._heat = Math.max(0, this._heat - coolRate * dt / 1000); return; }

    // 実効CD: 熱量で短縮するが minCooldownMs を下回らせない。
    const eff = Math.max(s.minCooldownMs || 140, (s.cooldown || 900) * (1 - (s.heatAccelPct || 0) * heatFrac)) * this.passiveCooldownMult();
    this._cd = eff;

    this.scene.skills.recordCast(this.id); // 主発動（熱量は通常発動のみで上昇）。
    this._heat += (cfg.heatPerCast != null ? cfg.heatPerCast : 8);
    if (this._heat >= maxHeat) { // 最大 → オーバーヒート開始（recordCast はしない）。
      this._heat = maxHeat;
      this._overheatLeft = s.overheatMs || 2600;
      this.scene.skills.recordExtra(this.id, 'overheats', 1, 'add');
    }
    this.scene.skills.recordExtra(this.id, 'overdriveCasts', 1, 'add');
    this.scene.skills.recordExtra(this.id, 'maxHeatReached', this._heat, 'max');
    this._fireVolley();
  }

  // 共有攻撃部分（通常発動・残響・分身で共通）。熱量には触れない。
  _fireVolley() {
    if (this.scene.gameOver) return;
    const s = this.stats; if (!s) return;
    const combat = this.scene.combat; const p = this.scene.player;
    // 毎フレームの発射「回（volley）」上限。
    if (!combat.frameBudget('overdriveCast', 'maxOverdriveCastsPerFrame')) return;
    const maxHeat = s.maxHeat || 100;
    const heatFrac = maxHeat > 0 ? this._heat / maxHeat : 0;
    const base = s.baseProjectiles || 1;
    // 高熱ほど弾数増。Lv80+1・パッシブ弾数加算は fireProjectileCount 経由。
    let count = this.fireProjectileCount(base + Math.floor(heatFrac * base));
    const cap = combat.skillCap('maxOverdriveProjectiles', 64);
    if (count > cap) count = cap;
    const dmg = (s.baseDamage || 14) * (1 + (s.heatDamageMult || 0) * heatFrac);
    const speed = 300 * (1 + (s.heatSpeedMult || 0) * heatFrac);
    const target = combat.nearestEnemy(p.x, p.y, 100000);
    const baseAng = target ? Math.atan2(target.y - p.y, target.x - p.x) : 0;
    const spread = 0.26;
    for (let i = 0; i < count; i++) {
      if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) break;
      const off = count > 1 ? (i - (count - 1) / 2) * spread : 0;
      combat.spawnPlayerProjectile(p.x, p.y, baseAng + off, speed, {
        skillId: this.id, damage: dmg, pierce: 0, scale: 0.7, lifeMs: 1100, tint: 0xff7043, element: 'fire',
      });
    }
  }

  // 残響/複製: 攻撃弾のみ。熱量・オーバーヒート・CD を変更しない、recordCast しない。
  echoCast() { this._fireVolley(); }
  cloneCast() { this._fireVolley(); }

  serializeState() { return { heat: this._heat, overheatLeft: this._overheatLeft, cdLeft: this._cd }; }
  restoreState(st) {
    if (!st) return;
    const maxHeat = (this.stats && this.stats.maxHeat) || 100;
    this._heat = Math.max(0, Math.min(maxHeat, st.heat || 0));       // 熱量は再付与でなく復元（有利化しない）。
    this._overheatLeft = Math.max(0, st.overheatLeft || 0);          // オーバーヒートも解除せず復元。
    this._cd = st.cdLeft || 0;
  }

  destroy() {}
}
