// 金剛迎撃（M8-C・迎撃の構えの進化 / 補助: 重装 Lv4）:
// 構えが長く続き、1 度の構えで受け流せる回数がわずかに増える。反撃が決まると短時間だけ守りが固くなる。
// - 反撃の調停では**最も高い優先度**を持つ（1 被弾イベントで反撃するのは 1 系統だけ）。
//   不落の城壁（unyielding_fortress）と同時に持てるが、同じ被弾で両方が反撃することはない。
// - counter → counter の再帰は起きない（反撃中は被弾フックを再入させない）。
import { CounterStanceSkill } from './CounterStanceSkill.js';
import { applyEvolvedSemantics } from './WarriorSkillBase.js';

export class AdamantCounterSkill extends CounterStanceSkill {
  constructor(scene, id, level) { super(scene, id, level); this._counterMitigationLeft = 0; }

  // 進化の evoDef で構えのパラメータを完全に置き換える。
  stanceParams() {
    const d = this.evoDef;
    const cw = d.counterWindow || {};
    return {
      durationMs: cw.durationMs || 0,
      maxCounters: Math.min(cw.maxCountersPerWindow || 1, this.cap('maxCounterPerWindow', 3)),
      mitigation: d.mitigation?.value || 0,
      priority: cw.priority,
      counterCooldownMs: cw.counterCooldownMs,
      counterDamage: d.damage?.counter || 0,
      counterArea: d.area?.counterRadius || 0,
      knockback: d.knockback?.counter || 0,
      poiseDamage: d.poiseDamage?.counter || 0,
      comboGain: d.comboGain?.perCounter,
      furyGain: d.furyGain?.perCounter,
    };
  }

  update(dt, ctx) {
    if (this._counterMitigationLeft > 0) this._counterMitigationLeft = Math.max(0, this._counterMitigationLeft - dt);
    super.update(dt, ctx);
  }

  // 反撃の対象数上限は進化の safetyCaps を使う。
  counterMaxTargets() { return this.cap('maxTargetsPerStrike', 20); }

  // 構えを取るたびに、この cast のコンボ/闘気上限を data から適用する（反撃で過剰獲得しない）。
  fire() {
    super.fire();
    const d = this.evoDef;
    if (this.warrior) {
      this.warrior.setCastLimits(`${this.id}#counter1`, { combo: d.comboGain?.maxPerCast, fury: d.furyGain?.maxPerCast });
    }
  }

  // 構え中の軽減に加え、反撃成功直後の短い軽減も返す（合計は 70% で必ずクランプされる）。
  activeMitigation() {
    const base = super.activeMitigation();
    const onc = this.evoDef.onCounter || {};
    const extra = this._counterMitigationLeft > 0 ? (onc.mitigationValue || 0) : 0;
    return Math.max(base, extra);
  }

  // 反撃が決まった直後だけ短時間の追加軽減を得る。
  onCounterPerformed() {
    const onc = this.evoDef.onCounter || {};
    this._counterMitigationLeft = Math.min(onc.mitigationMs || 0, this.cap('maxCounterMitigationMs', 2000));
  }

  serializeState() {
    const st = super.serializeState();
    st.counterMitigationLeft = this._counterMitigationLeft;
    return st;
  }
  restoreState(st) {
    super.restoreState(st);
    this._counterMitigationLeft = Math.max(0, (st && st.counterMitigationLeft) || 0);
  }
  destroy() { super.destroy(); this._counterMitigationLeft = 0; }
}

// 基礎クラスのロジックを再利用しつつ、data の読み先を進化定義（evoDef）へ差し替える。
applyEvolvedSemantics(AdamantCounterSkill);
