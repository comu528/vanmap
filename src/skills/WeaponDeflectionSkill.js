// 刃返し（M8-E・戦士 最終Wave）: 短い間だけ敵弾を弾き返す。
// - 弾けるのは**通常の敵弾だけ**。予兆 / 光条 / 地形ハザード / DoT は弾かない。
//   可否は WarriorCombatSystem.canDeflectProjectile()（allowlist + denylist）に一元化してある。
// - **完全無効化ではない**。window ごとに弾ける数に上限があり、超えた弾はそのまま通る。
// - 弾いた弾は必ず消え、必要なら短命の物理反射弾へ変わる。**反射弾から再反射しない。**
// - 近接反撃（counter arbitration）とは別経路。1 つの被弾 / 弾イベントに応じるのは最大 1 系統。
// - recordCast は window 開始時の 1 回だけ。弾ごとには数えない。
import { WarriorSkillBase } from './WarriorSkillBase.js';

export class WeaponDeflectionSkill extends WarriorSkillBase {
  constructor(scene, id, level) { super(scene, id, level); this._dead = false; }
  canFire() { return true; } // 防御なので敵弾が無くても構えられる（空振りで終わる）

  // 進化（天鏡返し）が上書きするパラメータ。
  deflectParams() {
    const s = this.stats || {};
    const cfg = this.def?.config || {};
    return {
      windowDuration: s.windowDuration || 0, maxDeflections: s.maxDeflections || 1,
      deflectRadius: s.deflectRadius || 0,
      reflectedDamage: s.reflectedDamage || 0, reflectedSpeed: s.reflectedSpeed || 0,
      poiseDamage: s.poiseDamage || 0, visualIntensity: s.visualIntensity || 0,
      comboGain: s.comboGain, furyGain: s.furyGain,
      maxWindowMs: cfg.maxWindowMs ?? 3000,
      reflectEnabled: cfg.reflectEnabled !== false,
      reflectLifeMs: cfg.maxReflectLifeMs ?? 900,
      // 進化のみ: 近接反撃との併走（counter_stance は置換せず CD にも触らない）。
      mirrorCounter: false,
    };
  }

  fire() {
    if (this._dead || this.scene.gameOver) return;
    const P = this.deflectParams();
    if (!(P.windowDuration > 0)) return;
    const w = this.warrior;
    if (!w) return;
    const castKey = this.newCastKey();
    const cap = this.scene.combat.skillCap('maxDeflectionsPerWindow', 8);
    const r = w.beginDeflectionWindow(this.id, {
      windowMs: Math.min(P.windowDuration, P.maxWindowMs),
      maxDeflections: Math.min(P.maxDeflections, cap),
      radius: this.meleeRadius(P.deflectRadius),
      reflect: P.reflectEnabled,
      reflectedDamage: P.reflectedDamage, reflectedSpeed: P.reflectedSpeed,
      reflectLifeMs: P.reflectLifeMs, poiseDamage: P.poiseDamage,
    });
    if (!r) return;
    // 被弾経路（敵弾 vs プレイヤー）から弾き返しを呼べるようにする。window が閉じたら必ず外す。
    this.scene.combat.setDeflectOptions({ skillId: this.id, knockback: 0, castKey });
    this.scene.skills.recordExtra(this.id, 'windows', 1, 'add');
  }

  update(dt, ctx) {
    if (this._dead) return;
    super.update(dt, ctx);
    const w = this.warrior;
    if (!w) return;
    if (!w.deflectionState(this.id)) {
      // window が閉じた（時間切れ / 使い切り / 破棄）→ 被弾経路のフックを必ず外す。
      if (this.scene.combat.setDeflectOptions) this.scene.combat.setDeflectOptions(null);
      return;
    }
    this.scene.skills.recordExtra(this.id, 'windowMs', dt, 'add');
    // 接触前に届く弾も弾く（半径内へ入った弾を先に処理する）。上限は共通経路が守る。
    // 枠を使い切っていても窓が開いている間は共通経路へ渡す（上限到達を正しく数えるため）。
    if (!w.deflectionWindowOpen) return;
    const st = w.deflectionState(this.id);
    const P = this.deflectParams();
    const p = this.scene.player;
    const list = this.scene.combat.deflectableProjectiles(p.x, p.y, st.radius);
    for (const b of list) {
      if (!w.deflectionWindowOpen) break;
      const res = this.scene.combat.tryDeflectProjectile(b, {
        skillId: this.id, knockback: 0,
        // 演出の上限（弾き返しの成否そのものには影響しない）。
        visualCap: 'maxDeflectSparkVisuals', visualIntensity: P.visualIntensity,
      });
      if (res.deflected) this.scene.skills.recordExtra(this.id, 'deflected', 1, 'add');
    }
  }

  get windowActive() { return !!(this.warrior && this.warrior.deflectionActive); }

  // window そのものは WarriorCombatSystem.serializeTimedBuffs() が保存する（二重に保存しない）。
  // 弾いた弾の id 集合や弾オブジェクトは保存しない（reload 後に過去の弾を復活させない）。
  serializeState() { return { cdLeft: this._cd }; }
  restoreState(st) {
    if (st && typeof st.cdLeft === 'number') this._cd = st.cdLeft;
    // 復元直後は被弾フックを張り直す（window 自体が残っていれば update が使う）。
    if (this.warrior && this.warrior.deflectionState(this.id) && this.scene.combat.setDeflectOptions) {
      this.scene.combat.setDeflectOptions({ skillId: this.id, knockback: 0 });
    }
  }
  destroy() {
    this._dead = true;
    if (this.warrior) this.warrior.endDeflectionWindow(this.id);
    if (this.scene.combat && this.scene.combat.setDeflectOptions) this.scene.combat.setDeflectOptions(null);
  }
}
