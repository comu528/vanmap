// EffectManager: すべての「見た目」を集約する。戦闘判定（ダメージ）は一切行わない。
// 各メソッドは品質設定に応じて描画量を減らす／無効化するが、呼び出し元の
// ダメージ計算とは独立しているため、エフェクトを切っても戦闘結果は変わらない。
//
// 設計上の約束:
//   - ダメージ・命中・撃破の判定は BattleScene / Skill 側が数値計算で行う。
//   - EffectManager はパーティクル/数字/フラッシュ/画面揺れ/ヒットストップ等の
//     演出のみを担い、いつ無効化されても gameplay に影響しない。

import { TEX } from '../config/game-config.js';

const VISUAL_SCALE = { small: 0.9, medium: 1.1, large: 1.4, huge: 1.7 };

export class EffectManager {
  constructor(scene) {
    this.scene = scene;
    // 既定は「高」。setSettings で上書きされる。
    this.settings = {
      quality: 'high', particleScale: 1, damageNumbers: true,
      screenShake: true, whiteFlash: true, hitStop: true,
    };
    this._dmgPool = []; // ダメージ数字テキストの簡易プール
    // 品質別の安全上限（毎フレーム beginFrame でリセット）。既定は無制限。
    this._dmgNumBudget = Infinity;
    this._particleBudget = Infinity;
    this._particleUsed = 0;
  }

  setSettings(s) { this.settings = { ...this.settings, ...s }; }

  static scaleForVisual(v) { return VISUAL_SCALE[v] || 1; }

  // 毎フレーム、ダメージ数字とパーティクルの安全上限をリセットする（判定には影響しない）。
  beginFrame(maxDamageNumbers, particleBudget) {
    this._dmgNumBudget = maxDamageNumbers ?? Infinity;
    this._particleBudget = particleBudget ?? Infinity;
    this._particleUsed = 0;
  }

  _canParticle(n = 1) {
    if (this.settings.particleScale <= 0) return false;
    if (this._particleUsed + n > this._particleBudget) return false;
    this._particleUsed += n;
    return true;
  }

  // ---- 基本演出 ----
  hitBurst(x, y, color = 0xffe082) {
    if (!this._canParticle(1)) return;
    const g = this.scene.add.image(x, y, TEX.PARTICLE).setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(60);
    this.scene.tweens.add({ targets: g, scale: 2.5 * this.settings.particleScale, alpha: 0, duration: 160, onComplete: () => g.destroy() });
  }

  // 火の粉
  sparks(x, y, count = 4, color = 0xff7043) {
    const n = Math.round(count * this.settings.particleScale);
    if (!this._canParticle(n)) return;
    for (let i = 0; i < n; i++) {
      const ang = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const g = this.scene.add.image(x, y, TEX.PARTICLE).setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD).setDepth(60);
      this.scene.tweens.add({
        targets: g, x: x + Math.cos(ang) * 18, y: y + Math.sin(ang) * 18,
        alpha: 0, scale: 0.4, duration: 240, onComplete: () => g.destroy(),
      });
    }
  }

  // 敵死亡演出（破片）
  deathBurst(x, y, color = 0xff7043) {
    this.sparks(x, y, 6, color);
    if (this.settings.particleScale <= 0) return;
    const ring = this.scene.add.image(x, y, TEX.PARTICLE).setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(60).setScale(0.5);
    this.scene.tweens.add({ targets: ring, scale: 3, alpha: 0, duration: 220, onComplete: () => ring.destroy() });
  }

  // 敵被弾フラッシュ（白）
  enemyFlash(enemy) {
    if (!enemy || !enemy.setTintFill) return;
    enemy.setTintFill(0xffffff);
    this.scene.time.delayedCall(55, () => { if (enemy.active) enemy.clearTint(); });
  }

  // ダメージ数字（クリティカルは大きく）。毎フレーム上限で暴走を防ぐ。
  damageNumber(x, y, amount, crit = false) {
    if (!this.settings.damageNumbers) return;
    if (this._dmgNumBudget <= 0) return;
    this._dmgNumBudget--;
    const txt = this.scene.add.text(x, y - 6, String(amount), {
      fontSize: crit ? '16px' : '10px',
      color: crit ? '#fff176' : '#ffe0b2',
      fontStyle: crit ? 'bold' : 'normal',
      stroke: '#3e1a00', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(80);
    this.scene.tweens.add({
      targets: txt, y: y - (crit ? 34 : 22), alpha: 0,
      duration: crit ? 700 : 500, onComplete: () => txt.destroy(),
    });
  }

  explosion(x, y, radius, color = 0xff9800) {
    this.hitBurst(x, y, color);
    if (this.settings.particleScale <= 0) return;
    const g = this.scene.add.image(x, y, TEX.FIREBALL).setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(58).setScale(0.4);
    this.scene.tweens.add({ targets: g, scale: radius / 12, alpha: 0, duration: 240, onComplete: () => g.destroy() });
    this.sparks(x, y, 4, color);
  }

  // 火球の軌跡パフ
  trailPuff(x, y, scale = 1, color = 0xff7043) {
    if (this.settings.particleScale <= 0.3) return;
    const g = this.scene.add.image(x, y, TEX.PARTICLE).setTint(color)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(55).setScale(scale);
    this.scene.tweens.add({ targets: g, alpha: 0, scale: scale * 0.3, duration: 220, onComplete: () => g.destroy() });
  }

  // 予告リング（火柱/隕石）。gameplay とは独立した警告表示。
  telegraph(x, y, radius, ms, color = 0xff5252) {
    const g = this.scene.add.graphics().setDepth(40);
    const draw = (a) => { g.clear(); g.lineStyle(2, color, a); g.strokeCircle(x, y, radius); g.fillStyle(color, a * 0.15); g.fillCircle(x, y, radius); };
    draw(0.8);
    this.scene.tweens.addCounter({
      from: 0, to: 1, duration: ms,
      onUpdate: (tw) => draw(0.3 + 0.6 * Math.abs(Math.sin(tw.getValue() * Math.PI * 3))),
      onComplete: () => g.destroy(),
    });
    return g;
  }

  pillarBurst(x, y, radius) {
    const g = this.scene.add.image(x, y, TEX.FIREBALL).setTint(0xff9800)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(58).setScale(0.3);
    this.scene.tweens.add({ targets: g, scaleX: radius / 10, scaleY: radius / 6, alpha: 0, duration: 320, onComplete: () => g.destroy() });
    this.sparks(x, y, 6, 0xffca28);
  }

  meteorImpact(x, y, radius) {
    // 落下する隕石
    const rock = this.scene.add.image(x, y - 200, TEX.FIREBALL).setTint(0xd84315)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(70).setScale(3);
    this.scene.tweens.add({
      targets: rock, y, duration: 220, ease: 'Quad.easeIn',
      onComplete: () => {
        rock.destroy();
        this.explosion(x, y, radius, 0xff7043);
        this.sparks(x, y, 10, 0xffca28);
      },
    });
  }

  screenShake(duration = 120, intensity = 0.005) {
    if (!this.settings.screenShake) return;
    this.scene.cameras.main.shake(duration, intensity);
  }

  whiteFlash(alpha = 0.4) {
    if (!this.settings.whiteFlash) return;
    this.scene.cameras.main.flash(120, 255, 255, 255, false);
  }

  // 強攻撃のみ短いヒットストップ。演出扱いで、無効時は何もしない
  // （ダメージは既に適用済みのため結果は不変）。
  hitStop(ms = 50) {
    if (!this.settings.hitStop) return;
    if (this.scene.requestHitStop) this.scene.requestHitStop(ms);
  }
}
