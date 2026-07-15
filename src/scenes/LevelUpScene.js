// レベルアップ時に表示する候補（3択、魂炎強化で4択）。
// 数字キー 1〜4 とマウスクリックで選択できる。BattleScene をポーズして重ねる。
// 進化候補は専用の色・枠・名称で通常の強化と明確に区別する。

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
    this.add.text(GAME_WIDTH / 2, 34, 'レベルアップ！', { fontSize: '20px', color: '#ffab40', fontStyle: 'bold' }).setOrigin(0.5);
    this.add.text(GAME_WIDTH / 2, 58, '強化を1つ選択（数字キー / クリック）', { fontSize: '10px', color: '#ffe0b2' }).setOrigin(0.5);

    const n = this.choices.length;
    const gap = 12;
    const cardW = Math.min(160, Math.floor((GAME_WIDTH - (n + 1) * gap) / n));
    const cardH = 150;
    const totalW = n * cardW + (n - 1) * gap;
    let x = (GAME_WIDTH - totalW) / 2 + cardW / 2;
    const y = GAME_HEIGHT / 2 + 24;

    this.choices.forEach((choice, i) => {
      this.makeCard(x, y, cardW, cardH, choice, i + 1);
      x += cardW + gap;
    });

    const keys = ['ONE', 'TWO', 'THREE', 'FOUR'];
    for (let i = 1; i <= Math.min(n, 4); i++) {
      this.input.keyboard.on(`keydown-${keys[i - 1]}`, () => this.pick(i - 1));
    }
  }

  makeCard(cx, cy, w, h, choice, num) {
    const evo = !!choice.evolution;
    const bgColor = evo ? 0x3a1420 : 0x2a1e2e;
    const stroke = evo ? 0xffd54f : 0xff7043;
    const bg = this.add.rectangle(cx, cy, w, h, bgColor).setStrokeStyle(evo ? 3 : 2, stroke);
    bg.setInteractive({ useHandCursor: true });

    if (evo) this.add.text(cx, cy - h / 2 + 8, '★ 進化', { fontSize: '10px', color: '#ffd54f', fontStyle: 'bold' }).setOrigin(0.5);
    if (choice.icon && this.textures.exists(choice.icon)) {
      this.add.image(cx, cy - 40, choice.icon).setScale(evo ? 3 : 2.5).setTint(evo ? 0xffe082 : 0xffffff);
    }
    this.add.text(cx, cy - 6, `${num}. ${choice.title}`, {
      fontSize: '11px', color: evo ? '#ffd54f' : '#ffe0b2', fontStyle: 'bold',
      align: 'center', wordWrap: { width: w - 12 },
    }).setOrigin(0.5);
    this.add.text(cx, cy + 34, choice.description, {
      fontSize: '8px', color: '#bcaaa4', align: 'center', wordWrap: { width: w - 14 },
    }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setStrokeStyle(evo ? 4 : 3, 0xffab40));
    bg.on('pointerout', () => bg.setStrokeStyle(evo ? 3 : 2, stroke));
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
