// 炎の障壁（M6-B）: 一定間隔で炎の障壁を展開。被弾を軽減/無効化し、防いだ際に周囲へ反撃爆発（1被弾1回）。
// 状態(_state)は Player と共有し、Player.takeDamage が障壁ヒットを処理（onBarrierBlock で反撃）。
// 永続無敵にならないよう duration/hits/cooldown で管理。障壁の有無は視覚化する。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class FlameBarrierSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._state = { active: false, hitsLeft: 0, durLeft: 0, cdLeft: 0, blockedTotal: 0, blocks: 0, retaliations: 0 };
    this.ring = this.scene.add.image(0, 0, TEX.PARTICLE).setTint(0x80d8ff).setBlendMode(Phaser.BlendModes.ADD).setDepth(49).setAlpha(0).setScale(6);
  }
  canFire() { return false; }
  get isDefensive() { return true; }  // 残響詠唱の対象外（防御型）

  update(dt) {
    const s = this.stats; const st = this._state;
    if (st.active) {
      st.durLeft -= dt;
      if (st.durLeft <= 0 || st.hitsLeft <= 0) { st.active = false; st.cdLeft = s.cooldown; }
    } else {
      st.cdLeft -= dt;
      if (st.cdLeft <= 0) { // 展開
        st.active = true; st.durLeft = s.duration; st.hitsLeft = s.hits || 1;
        st.reduction = s.reduction || 0.5; st.retaliateDamage = s.retaliateDamage || 0;
        st.retaliateRadius = (s.retaliateRadius || 40) * this.passiveAreaMult();
      }
    }
    this.scene.player._barrier = st; // Player.takeDamage が参照
    // 見た目（障壁の有無を視覚化）。
    if (this.ring) {
      this.ring.setPosition(this.scene.player.x, this.scene.player.y);
      this.ring.setAlpha(st.active ? 0.35 : 0);
    }
    this.scene.skills.recordExtra(this.id, 'barrierBlocks', st.blocks || 0, 'max');
    this.scene.skills.recordExtra(this.id, 'barrierBlocked', Math.round(st.blockedTotal || 0), 'max');
    this.scene.skills.recordExtra(this.id, 'barrierRetaliations', st.retaliations || 0, 'max');
  }

  serializeState() { const s = this._state; return { active: s.active, hitsLeft: s.hitsLeft, durLeft: s.durLeft, cdLeft: s.cdLeft, blockedTotal: s.blockedTotal, blocks: s.blocks, retaliations: s.retaliations }; }
  restoreState(s) { if (!s) return; Object.assign(this._state, { active: !!s.active, hitsLeft: s.hitsLeft || 0, durLeft: s.durLeft || 0, cdLeft: s.cdLeft || 0, blockedTotal: s.blockedTotal || 0, blocks: s.blocks || 0, retaliations: s.retaliations || 0 }); }
  destroy() { if (this.ring) { this.ring.destroy(); this.ring = null; } if (this.scene.player && this.scene.player._barrier === this._state) this.scene.player._barrier = null; }
}
