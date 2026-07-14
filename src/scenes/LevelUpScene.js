// レベルアップ時に表示する3択（将来は魂炎で4択に拡張）。
// 数字キー 1〜3 とマウスクリックで選択できる。BattleScene をポーズして重ねる。

import { GAME_WIDTH, GAME_HEIGHT } from '../config/game-config.js';

export class LevelUpScene extends Phaser.Scene {
  constructor() {
    super('LevelUpScene');
  }

  init(data) {
    this.choices = data.choices || [];
    this.onPick = data.onPick || (() => {});
  }

  create() {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.72);
    this.add.text(GAME_WIDTH / 2, 40, 'レベルアップ！', { fontSize: '20px', color: '#ffab40', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 66, '強化を1つ選択（1〜3キー / クリック）', { fontSize: '10px', color: '#ffe0b2' }).setOrigin(0.5);

    const cardW = 170, cardH = 150, gap = 16;
    const totalW = this.choices.length * cardW + (this.choices.length - 1) * gap;
    let x = (GAME_WIDTH - totalW) / 2 + cardW / 2;
    const y = GAME_HEIGHT / 2 + 20;

    this.choices.forEach((choice, i) => {
      this.makeCard(x, y, cardW, cardH, choice, i + 1);
      x += cardW + gap;
    });

    for (let i = 1; i <= this.choices.length; i++) {
      this.input.keyboard.on(`keydown-${['ONE', 'TWO', 'THREE', 'FOUR'][i - 1]}`, () => this.pick(i - 1));
    }
  }

  makeCard(cx, cy, w, h, choice, num) {
    const bg = this.add.rectangle(cx, cy, w, h, 0x2a1e2e).setStrokeStyle(2, 0xff7043);
    bg.setInteractive({ useHandCursor: true });

    if (choice.icon && this.textures.exists(choice.icon)) {
      this.add.image(cx, cy - 42, choice.icon).setScale(2.5);
    }
    this.add.text(cx, cy - 8, `${num}. ${choice.title}`, { fontSize: '12px', color: '#ffe0b2', fontStyle: 'bold', align: 'center', wordWrap: { width: w - 16 } }).setOrigin(0.5);
    this.add.text(cx, cy + 30, choice.description, { fontSize: '9px', color: '#bcaaa4', align: 'center', wordWrap: { width: w - 20 } }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setStrokeStyle(3, 0xffab40));
    bg.on('pointerout', () => bg.setStrokeStyle(2, 0xff7043));
    bg.on('pointerdown', () => this.pick(num - 1));
  }

  pick(index) {
    const choice = this.choices[index];
    if (!choice) return;
    this.input.keyboard.removeAllListeners();
    this.onPick(choice);
    this.scene.stop();
  }
}
