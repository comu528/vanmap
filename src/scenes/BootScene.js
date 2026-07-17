// BootScene: データ読み込みと、外部画像を使わない仮素材（テクスチャ）生成を行う。
// すべての見た目は Phaser の Graphics から generateTexture で作る。

import { TEX } from '../config/game-config.js';
import { DataManager } from '../systems/DataManager.js';
import { SaveManager } from '../systems/SaveManager.js';
import { SaveService } from '../storage/SaveService.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  async create() {
    this.generateTextures();

    let loadError = null;
    try {
      await DataManager.loadAll();
    } catch (e) {
      loadError = e;
      console.error('[BootScene] データ読み込み失敗:', e);
    }

    const fallback = document.getElementById('boot-fallback');
    if (fallback) fallback.classList.add('hidden');

    if (loadError || !DataManager.isValid()) {
      this.add.text(320, 180, 'データ読み込みに失敗しました。\nコンソールを確認してください。', {
        fontSize: '12px', color: '#ff8a80', align: 'center',
      }).setOrigin(0.5);
      return;
    }

    // セーブの版数を注入（移行/初期化判定に使用）。
    SaveManager.init(DataManager.balance.saveVersion, DataManager.balance.gameVersion);
    // 保存レイヤー（ブラウザ保存＋フォルダ保存/バックアップ/競合）を初期化する。
    // 失敗してもゲームは localStorage で完全動作するため、例外は握りつぶして続行する。
    try {
      await SaveService.init(DataManager.balance.saveVersion, DataManager.balance.gameVersion, DataManager.saveConfig);
    } catch (e) {
      console.warn('[BootScene] 保存レイヤーの初期化に失敗（ブラウザ保存で続行）:', e);
    }

    this.scene.start('TitleScene');
  }

  // ---- 仮素材（ドット絵）生成 ----
  generateTextures() {
    this.makePlayer();
    this.makeSlime();
    this.makeBat();
    this.makeSkeleton();
    this.makeGolem();
    this.makeBoss();
    this.makeFireball();
    this.makeGem();
    this.makeParticle();
    this.makeGround();
    this.makeSkillIcons();
    this.makeNewSkillIcons();
  }

  // ピクセルグリッド（文字列配列）からテクスチャを生成するヘルパー。
  // 各文字が palette のキーに対応。' ' は透明。
  drawGrid(key, rows, palette, px = 1) {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const c = row[x];
        if (c === ' ' || !palette[c]) continue;
        g.fillStyle(palette[c], 1);
        g.fillRect(x * px, y * px, px, px);
      }
    }
    const w = (rows[0]?.length || 1) * px;
    const h = rows.length * px;
    g.generateTexture(key, w, h);
    g.destroy();
  }

  makePlayer() {
    // 火属性の魔女。三角帽子 + ローブ + 炎。
    const pal = { H: 0x5e35b1, h: 0x7e57c2, S: 0xffcc80, R: 0xc62828, r: 0xe53935, F: 0xff9800, f: 0xffe082, E: 0x000000 };
    const rows = [
      '   HHH   ',
      '  HHHHH  ',
      ' HHHHHHH ',
      '  hSSSh  ',
      '  SESES  ',
      '  SSSSS  ',
      '  RRRRR  ',
      ' RRrRrRR ',
      ' RRrRrRR ',
      '  RfRfR  ',
      '  F f F  ',
    ];
    this.drawGrid(TEX.PLAYER, rows, pal, 2);
  }

  makeSlime() {
    const pal = { G: 0x43a047, g: 0x66bb6a, E: 0x1b5e20, w: 0xa5d6a7 };
    const rows = [
      '        ',
      '  gggg  ',
      ' gggggg ',
      'gwGGGGwg',
      'gGEGGEGg',
      'gGGGGGGg',
      'gGGGGGGg',
      ' GGGGGG ',
    ];
    this.drawGrid(TEX.ENEMY_SLIME, rows, pal, 2);
  }

  makeBat() {
    const pal = { P: 0x6a1b9a, p: 0x8e24aa, E: 0xff5252, w: 0xab47bc };
    const rows = [
      'w      w',
      'ww    ww',
      'wpp pp w',
      ' pPPPPp ',
      ' PEPPEP ',
      ' pPPPPp ',
      '  p  p  ',
    ];
    this.drawGrid(TEX.ENEMY_BAT, rows, pal, 2);
  }

  makeSkeleton() {
    const pal = { W: 0xeeeeee, w: 0xbdbdbd, E: 0x263238 };
    const rows = [
      '  WWWW  ',
      ' WWWWWW ',
      ' WEWWEW ',
      ' WWWWWW ',
      '  wWWw  ',
      ' W wWw W',
      ' WwWWwW ',
      ' w    w ',
    ];
    this.drawGrid(TEX.ENEMY_SKELETON, rows, pal, 2);
  }

  makeGolem() {
    const pal = { B: 0x8d5524, b: 0xa1663a, E: 0xff7043, k: 0x5d4037 };
    const rows = [
      ' kBBBBk ',
      'kBbbbbBk',
      'BbEbbEbB',
      'BbbbbbbB',
      'BbkbbkbB',
      'kBbbbbBk',
      ' BB  BB ',
      ' kk  kk ',
    ];
    this.drawGrid(TEX.ENEMY_GOLEM, rows, pal, 3);
  }

  makeBoss() {
    const pal = { R: 0xbf360c, r: 0xff5722, o: 0xff8a65, E: 0xfff176, k: 0x3e2723 };
    const rows = [
      '  k rr r k  ',
      ' kRRRRRRRRk ',
      ' RRrrrrrrRR ',
      'RRrEroorErRR',
      'RRrrooorrRRR',
      'RRrroooorRRR',
      'RRRrrrrrRRRR',
      ' RRRoooRRRR ',
      ' kRR    RRk ',
      '  kk    kk  ',
    ];
    this.drawGrid(TEX.BOSS_FLAME_LORD, rows, pal, 4);
  }

  makeFireball() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffe082, 1); g.fillCircle(8, 8, 8);
    g.fillStyle(0xff9800, 1); g.fillCircle(8, 8, 6);
    g.fillStyle(0xff5722, 1); g.fillCircle(8, 8, 3);
    g.generateTexture(TEX.FIREBALL, 16, 16);
    g.destroy();
  }

  makeGem() {
    const pal = { C: 0x26c6da, c: 0x80deea, W: 0xe0f7fa };
    const rows = [
      '  W  ',
      ' WcW ',
      'WcCcW',
      ' CcC ',
      '  C  ',
    ];
    this.drawGrid(TEX.GEM, rows, pal, 2);
  }

  makeParticle() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture(TEX.PARTICLE, 4, 4);
    g.destroy();
  }

  makeGround() {
    // 64x64 の暗いタイル。市松模様でスクロールを分かりやすく。
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0x1a1420, 1);
    g.fillRect(0, 0, 64, 64);
    g.fillStyle(0x211a28, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillRect(32, 32, 32, 32);
    g.lineStyle(1, 0x2a2233, 1);
    g.strokeRect(0, 0, 64, 64);
    g.generateTexture(TEX.GROUND, 64, 64);
    g.destroy();
  }

  makeSkillIcons() {
    // スキルアイコン（16x16）を色違いの炎マークで簡易生成。
    const icons = [
      ['icon_fireball', 0xff5722],
      ['icon_flame_pillar', 0xff9800],
      ['icon_burning_trail', 0xffca28],
      ['icon_orbiting_flame', 0xff7043],
      ['icon_meteor', 0xd84315],
    ];
    for (const [key, color] of icons) {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x1a1420, 1); g.fillRect(0, 0, 16, 16);
      g.fillStyle(color, 1); g.fillCircle(8, 9, 5);
      g.fillStyle(0xffe082, 1); g.fillCircle(8, 8, 2);
      g.lineStyle(1, 0xffe0b2, 0.6); g.strokeRect(0, 0, 16, 16);
      g.generateTexture(key, 16, 16);
      g.destroy();
    }
  }

  // M6-B: 新スキル10種の仮アイコン。色＋形（記号）で区別する（正式画像は使わない）。
  makeNewSkillIcons() {
    const base = (color) => {
      const g = this.make.graphics({ x: 0, y: 0, add: false });
      g.fillStyle(0x1a1420, 1); g.fillRect(0, 0, 16, 16);
      g.lineStyle(1, 0xffe0b2, 0.6); g.strokeRect(0, 0, 16, 16);
      g.fillStyle(color, 1);
      return g;
    };
    const done = (g, key) => { g.generateTexture(key, 16, 16); g.destroy(); };

    let g = base(0xffab40); g.fillRect(7, 2, 2, 12); g.fillTriangle(8, 1, 6, 4, 10, 4); done(g, 'icon_flame_lance');          // 炎槍: 縦の槍
    g = base(0xff7043); g.fillCircle(4, 11, 2); g.fillCircle(8, 8, 2); g.fillCircle(12, 11, 2); done(g, 'icon_scatter_flame'); // 拡散: 3点扇
    g = base(0xffd54f); g.fillCircle(9, 8, 3); g.fillStyle(0xffd54f, 0.6); g.fillCircle(4, 11, 1.5); done(g, 'icon_homing_wisp'); // 追尾: 鬼火＋尾
    g = base(0xffee58); g.fillRect(3, 5, 4, 2); g.fillRect(7, 8, 4, 2); g.fillRect(11, 5, 3, 2); done(g, 'icon_chain_flame');   // 連鎖: 稲妻
    g = base(0xff5722); g.fillCircle(8, 9, 5); g.fillStyle(0xffca28, 1); g.fillCircle(8, 9, 2); done(g, 'icon_lava_bomb');      // 溶岩: 塊
    g = base(0xff9800); g.lineStyle(2, 0xff9800, 1); g.strokeCircle(8, 8, 5); g.strokeCircle(8, 8, 2); done(g, 'icon_flame_vortex'); // 渦: 同心円
    g = base(0xffca28); g.fillRect(7, 2, 2, 12); g.fillRect(2, 7, 12, 2); done(g, 'icon_fire_spirit');                          // 精霊: 十字星
    g = base(0xffd54f); g.fillTriangle(8, 2, 2, 13, 14, 13); done(g, 'icon_phoenix_feather');                                   // 不死鳥: 上三角
    g = base(0x80d8ff); g.lineStyle(2, 0x80d8ff, 1); g.strokeCircle(8, 8, 5); done(g, 'icon_flame_barrier');                    // 障壁: 環
    g = base(0xff5252); g.lineStyle(2, 0xff5252, 1); g.lineBetween(4, 4, 12, 12); g.lineBetween(12, 4, 4, 12); done(g, 'icon_detonation_mark'); // 刻印: X
  }
}
