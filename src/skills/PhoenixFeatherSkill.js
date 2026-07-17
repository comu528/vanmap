// 不死鳥の羽（M6-B）: 自動発動の致死防御。使用可能状態で致死ダメージを受けると死亡を一度防ぎ、
// HP回復＋大規模な炎爆発（BattleScene.onPhoenixRevive）＋一時無敵。発動後は長いクールダウン。
// 状態(_state)は Player と共有し、Player.takeDamage が致死時に ready=false/cdLeft=cooldownMs を設定する。
// ページ再読み込みでクールダウンが不正回復しないよう serializeState/restoreState で保存する。
import { SkillBase } from './SkillBase.js';

export class PhoenixFeatherSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._state = { ready: true, cdLeft: 0, cooldownMs: 60000, triggers: 0, healedTotal: 0 };
  }
  canFire() { return false; } // update で管理

  update(dt) {
    const s = this.stats; const st = this._state;
    if (!st.ready) { st.cdLeft -= dt; if (st.cdLeft <= 0) { st.ready = true; st.cdLeft = 0; } }
    // データ項目を最新のレベル値へ更新（ready/cdLeft は保持）。
    st.cooldownMs = s.cooldown; st.healPercent = s.healPercent;
    st.explosionDamage = s.explosionDamage; st.explosionRadius = (s.explosionRadius || 100) * this.passiveAreaMult();
    st.invulnMs = s.invulnMs;
    this.scene.player._phoenix = st; // Player.takeDamage が同じオブジェクトを参照
    // 統計（防いだ死亡回数・回復量）を最大値で反映。
    this.scene.skills.recordExtra(this.id, 'phoenixTriggers', st.triggers || 0, 'max');
    this.scene.skills.recordExtra(this.id, 'phoenixHealed', Math.round(st.healedTotal || 0), 'max');
  }

  serializeState() { const s = this._state; return { ready: s.ready, cdLeft: s.cdLeft, triggers: s.triggers, healedTotal: s.healedTotal }; }
  restoreState(s) { if (!s) return; this._state.ready = !!s.ready; this._state.cdLeft = s.cdLeft || 0; this._state.triggers = s.triggers || 0; this._state.healedTotal = s.healedTotal || 0; }
  destroy() { if (this.scene.player && this.scene.player._phoenix === this._state) this.scene.player._phoenix = null; }
}
