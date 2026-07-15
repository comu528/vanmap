// 進化演出（Milestone 4）。進化処理（スキル置換）は BattleScene 側で完了済みで、
// このシーンは演出のみを担当する（演出を無効にしても置換は正常に完了している）。
// ゲームは BattleScene 側でポーズ済み。クリック / Enter で戦闘再開。

import { GAME_WIDTH, GAME_HEIGHT, TEX } from '../config/game-config.js';

export class EvolutionScene extends Phaser.Scene {
  constructor() {
    super('EvolutionScene');
  }

  init(data) {
    this.evo = data.evo || {};
    this.baseName = data.baseName || '';
    this.lowFx = !!data.lowFx;
    this.onDone = data.onDone || (() => {});
  }

  create() {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    // 画面を暗くする
    this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.82);

    // 最低限の表示（低エフェクトでも維持）
    this.add.text(cx, 44, 'スキル進化！', { fontSize: '22px', color: '#ffd54f', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(cx, cy - 34, `${this.baseName}`, { fontSize: '13px', color: '#bcaaa4' }).setOrigin(0.5);
    this.add.text(cx, cy - 16, '▼', { fontSize: '12px', color: '#ff7043' }).setOrigin(0.5);
    this.add.text(cx, cy + 6, `${this.evo.displayName || ''}`, { fontSize: '18px', color: '#ffab40', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(cx, cy + 44, this.evo.description || '', { fontSize: '9px', color: '#ffe0b2', align: 'center', wordWrap: { width: 420 } }).setOrigin(0.5);
    this.add.text(cx, GAME_HEIGHT - 24, 'クリック / Enter で戦闘再開', { fontSize: '10px', color: '#8d6e63' }).setOrigin(0.5);

    // アイコン
    const iconKey = this.evo.icon && this.textures.exists(this.evo.icon) ? this.evo.icon : TEX.FIREBALL;
    const icon = this.add.image(cx, cy - 70, iconKey).setScale(3).setTint(0xffe082);

    if (!this.lowFx) {
      // 炎の粒子を中央へ集める + 一瞬の白フラッシュ
      for (let i = 0; i < 20; i++) {
        const ang = (Math.PI * 2 * i) / 20;
        const r = 140;
        const g = this.add.image(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, TEX.PARTICLE)
          .setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setScale(1.5);
        this.tweens.add({ targets: g, x: cx, y: cy - 70, alpha: 0.2, scale: 0.4, duration: 420, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
      }
      this.time.delayedCall(430, () => this.cameras.main.flash(160, 255, 255, 255));
      this.tweens.add({ targets: icon, scale: 4.2, yoyo: true, duration: 220, delay: 430 });
    }

    const done = () => { this.input.keyboard.removeAllListeners(); this.onDone(); this.scene.stop(); };
    this.input.on('pointerdown', done);
    this.input.keyboard.on('keydown-ENTER', done);
    this.input.keyboard.on('keydown-SPACE', done);
  }
}
