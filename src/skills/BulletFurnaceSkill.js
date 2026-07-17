// 弾喰い炉（M6-D・伝説/防御/反応）: 周囲に炉領域を展開し、侵入した吸収可能なボス弾を一定レートで吸収してチャージ。
// 最大チャージ or 再展開タイマー経過で炎弾幕を放出。吸収は攻撃扱いにしない（recordCast/echo を発生させない）。
// 永続無敵にならないよう吸収レート（accumulator＋毎秒上限）・同時吸収数・最大チャージを厳格に上限化する。
// echoCast/cloneCast は「放出弾幕のみ」を再現し、チャージを消費/変更しない。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class BulletFurnaceSkill extends SkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this._charge = 0;
    this._absorbBudget = 0;   // 吸収レートのアキュムレータ（毎フレーム share）
    this._redeployLeft = (this.rawStats?.redeployMs) || 1400;
    this.ring = null;
  }
  canFire() { return false; } // 常時 update で管理

  _maxCharge() { return Math.min(this.stats.maxCharge || 8, this.scene.combat.skillCap('maxFurnaceCharge', 14)); }

  update(dt) {
    const s = this.stats; const p = this.scene.player; const combat = this.scene.combat;
    if (!this.ring) {
      this.ring = this.scene.add.image(p.x, p.y, TEX.PARTICLE)
        .setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setDepth(41).setAlpha(0.2);
    }
    const radius = (s.absorbRadius || 54) * this.passiveAreaMult();
    const maxC = this._maxCharge();

    // 吸収レート = min(データ absorbPerSec, 品質別の毎秒上限)。アキュムレータで毎フレーム share を消化。
    const perSecCap = combat.skillCap('maxAbsorbedBulletsPerSecond', 16);
    const rate = Math.min(s.absorbPerSec || 6, perSecCap);
    this._absorbBudget += rate * dt / 1000;
    const concurrent = s.maxAbsorbConcurrent || 3;
    if (this._absorbBudget > concurrent + 2) this._absorbBudget = concurrent + 2; // 溜め込み防止

    let guard = 8; // 無限ループ保護
    while (this._absorbBudget >= 1 && this._charge < maxC && guard-- > 0) {
      const want = Math.min(Math.floor(this._absorbBudget), concurrent, maxC - this._charge);
      if (want < 1) break;
      const res = combat.absorbBossBullets(p.x, p.y, radius, want);
      if (!res || res.absorbed <= 0) break; // 吸収できる弾がない → 予算はそのまま次フレームへ
      this._charge += res.absorbed;
      this._absorbBudget -= res.absorbed;
      this.scene.skills.recordExtra(this.id, 'bulletsAbsorbed', res.absorbed, 'add');
      // 防いだ被弾量の概算（吸収弾value × 想定被害係数）。
      this.scene.skills.recordExtra(this.id, 'preventedProjectileDamageEstimate', (res.value || res.absorbed) * 6, 'add');
    }
    if (this._charge > maxC) this._charge = maxC;
    this.scene.skills.recordExtra(this.id, 'maxChargeReached', this._charge, 'max');

    // 放出条件: 満タン、または再展開タイマー経過でチャージがあれば放出。
    this._redeployLeft -= dt;
    if (this._charge >= maxC) {
      this._release();
    } else if (this._redeployLeft <= 0) {
      if (this._charge > 0) this._release();
      else this._redeployLeft = s.redeployMs || 1400; // 空撃ちせずタイマーだけ再設定
    }

    // 見た目（炉リング。チャージ量で明るさを変える）。
    this.ring.setPosition(p.x, p.y).setScale(radius / 4).setAlpha(0.12 + 0.28 * (maxC ? this._charge / maxC : 0));
  }

  // 放出弾幕（全方向）。room/projPool を厳守して上限化。
  _fireBarrage(projCount, dmgPerBullet) {
    const combat = this.scene.combat; const p = this.scene.player;
    const cap = combat.skillCap('maxFurnaceProjectiles', 90);
    const room = Math.max(0, cap - this.scene.countProjBySkill(this.id));
    const n = Math.min(projCount, room);
    for (let i = 0; i < n; i++) {
      if (this.scene.projPool.activeCount >= this.scene.projPool.maxSize) break;
      const ang = (Math.PI * 2 * i) / (n || 1);
      combat.spawnPlayerProjectile(p.x, p.y, ang, 300, {
        skillId: this.id, damage: dmgPerBullet, pierce: 0, explosionRadius: 6, scale: 0.6, lifeMs: 1000, tint: 0xff7043, element: 'fire',
      });
    }
  }

  // 実放出: チャージ量で弾数・威力をスケールし、放出後にチャージをリセット。
  _release() {
    if (this.scene.gameOver) return;
    const s = this.stats; const maxC = this._maxCharge();
    const frac = maxC > 0 ? this._charge / maxC : 0;
    const cap = this.scene.combat.skillCap('maxFurnaceProjectiles', 90);
    const projCount = Math.min(Math.max(1, Math.round((s.releaseProjectiles || 8) * frac)), cap);
    const dmg = (s.releaseDamage || 14) * (0.6 + 0.4 * frac);
    this._fireBarrage(projCount, dmg);
    this.scene.effects.explosion(this.scene.player.x, this.scene.player.y, (s.absorbRadius || 54) * this.passiveAreaMult(), 0xffab40);
    this.scene.skills.recordExtra(this.id, 'furnaceReleases', 1, 'add');
    this._charge = 0;
    this._redeployLeft = s.redeployMs || 1400;
  }

  // 残響/複製: 放出弾幕のみ再現。チャージは消費・変更しない（威力は dealDamage 側で自動スケール）。
  echoCast() {
    if (this.scene.gameOver) return;
    const s = this.stats;
    const cap = this.scene.combat.skillCap('maxFurnaceProjectiles', 90);
    this._fireBarrage(Math.min(s.releaseProjectiles || 8, cap), s.releaseDamage || 14);
  }
  cloneCast() { this.echoCast(); }

  // リロードでチャージ複製されないよう、保存値をそのまま復元する（再付与しない）。
  serializeState() { return { charge: this._charge, releaseCd: this._redeployLeft }; }
  restoreState(st) { if (!st) return; this._charge = st.charge || 0; this._redeployLeft = (st.releaseCd != null) ? st.releaseCd : (this.rawStats?.redeployMs || 1400); }

  destroy() { if (this.ring) { this.ring.destroy(); this.ring = null; } }
}
