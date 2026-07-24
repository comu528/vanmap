// BootScene: データ読み込みと、外部画像を使わない仮素材（テクスチャ）生成を行う。
// すべての見た目は Phaser の Graphics から generateTexture で作る。

import { TEX } from '../config/game-config.js';
import { DataManager } from '../systems/DataManager.js';
import { SaveManager } from '../systems/SaveManager.js';
import { SaveService } from '../storage/SaveService.js';
import { JobProgressionManager } from '../systems/JobProgressionManager.js';

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
    // ジョブ育成の設定（曲線・報酬・到達報酬）を JobProgressionManager へ注入（M6-C）。
    JobProgressionManager.setConfig(DataManager.jobProgression);
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

    // --- M6-D: 新 active 10種 ---
    g = base(0xffee58); g.lineStyle(2, 0xffee58, 1); g.lineBetween(3, 8, 14, 8); g.fillTriangle(14, 5, 14, 11, 16, 8); done(g, 'icon_scorching_ray'); // 光線: 直線
    g = base(0xff7043); g.fillCircle(5, 6, 2); g.fillCircle(11, 6, 2); g.fillCircle(8, 11, 2); g.lineStyle(1, 0xffca28, 1); g.strokeCircle(8, 8, 6); done(g, 'icon_ember_minefield'); // 地雷: 円内の粒
    g = base(0xffd54f); g.lineStyle(2, 0xffd54f, 1); g.beginPath(); g.arc(8, 8, 6, -1.0, 1.0, false); g.strokePath(); done(g, 'icon_flame_crescent'); // 斬: 三日月
    g = base(0xff8a65); g.lineStyle(2, 0xff8a65, 1); g.strokePoints([{ x: 2, y: 12 }, { x: 6, y: 4 }, { x: 10, y: 12 }, { x: 14, y: 4 }], false); done(g, 'icon_ricochet_ember'); // 反射: 折れ線
    g = base(0xbcaaa4); g.fillRect(5, 3, 3, 10); g.fillStyle(0x8d6e63, 0.7); g.fillRect(9, 4, 3, 9); done(g, 'icon_ash_doppelganger'); // 分身: 二重人型
    g = base(0xff5252); g.fillTriangle(8, 3, 5, 9, 11, 9); g.fillStyle(0xffca28, 1); g.fillCircle(8, 12, 2); done(g, 'icon_bloodfire_pact'); // 血炎: 滴＋炎
    g = base(0xff9800); g.fillRect(3, 6, 10, 8); g.fillStyle(0x1a1420, 1); g.fillRect(6, 9, 4, 5); g.fillStyle(0xffca28, 1); g.fillCircle(8, 5, 2); done(g, 'icon_bullet_furnace'); // 炉: 口＋炎
    g = base(0xff7043); g.lineStyle(2, 0xff7043, 1); g.lineBetween(8, 2, 8, 6); g.lineBetween(8, 10, 8, 14); g.lineBetween(2, 8, 6, 8); g.lineBetween(10, 8, 14, 8); done(g, 'icon_four_sided_inferno'); // 四方: 十字矢印
    g = base(0xffab40); g.lineStyle(2, 0xffab40, 1); g.strokeCircle(5, 8, 2); g.strokeCircle(11, 8, 2); g.lineBetween(7, 8, 9, 8); done(g, 'icon_molten_chains'); // 鎖: 二輪
    g = base(0xffca28); g.fillCircle(5, 11, 2); g.fillCircle(10, 6, 2); g.fillStyle(0xff7043, 0.7); g.fillCircle(12, 3, 1.5); done(g, 'icon_blazing_step'); // 歩法: 足跡

    // --- M6-D: 新進化5種（二重輪郭で進化を示す） ---
    const evo = (color) => { const gg = base(color); gg.lineStyle(1, 0xffd54f, 0.9); gg.strokeRect(1, 1, 14, 14); return gg; };
    g = evo(0xffee58); g.fillCircle(8, 8, 3); g.lineStyle(1, 0xffee58, 1); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.lineBetween(8, 8, 8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6); } done(g, 'icon_solar_annihilation_array'); // 太陽＋光線
    g = evo(0xff7043); g.fillCircle(4, 5, 1.5); g.fillCircle(11, 5, 1.5); g.fillCircle(4, 11, 1.5); g.fillCircle(11, 11, 1.5); g.lineStyle(1, 0xffca28, 0.8); g.lineBetween(4, 5, 11, 11); g.lineBetween(11, 5, 4, 11); done(g, 'icon_hellfire_mine_network'); // 地雷網
    g = evo(0xffd54f); g.lineStyle(2, 0xffd54f, 1); g.beginPath(); g.arc(8, 8, 6, -1.2, 1.2, false); g.strokePath(); g.beginPath(); g.arc(8, 8, 4, 2.0, 4.2, false); g.strokePath(); done(g, 'icon_inferno_blade_domain'); // 複数刃
    g = evo(0xbcaaa4); g.fillRect(3, 4, 2, 9); g.fillRect(7, 3, 2, 10); g.fillRect(11, 4, 2, 9); done(g, 'icon_ash_legion'); // 複数人型
    g = evo(0xff9800); g.fillRect(4, 7, 8, 6); g.fillStyle(0xffee58, 1); g.fillTriangle(8, 2, 6, 6, 10, 6); g.fillTriangle(8, 6, 6, 2, 10, 2); done(g, 'icon_star_devouring_furnace'); // 星＋炉

    // --- M6-E: 新 active 5種 ---
    g = base(0x9e9e9e); g.fillRect(6, 5, 4, 9); g.fillRect(4, 5, 8, 2); g.fillStyle(0xff7043, 1); g.fillTriangle(8, 1, 6, 5, 10, 5); done(g, 'icon_funeral_pyres');      // 墓標＋炎
    g = base(0xff5722); g.lineStyle(2, 0xff5722, 1); g.strokePoints([{ x: 2, y: 11 }, { x: 5, y: 6 }, { x: 9, y: 10 }, { x: 12, y: 5 }, { x: 14, y: 9 }], false); done(g, 'icon_magma_vein'); // 蛇行亀裂
    g = base(0xffca28); g.lineStyle(2, 0xffca28, 1); g.strokeTriangle(8, 3, 3, 13, 13, 13); done(g, 'icon_tri_flame_array');                                            // 三角形
    g = base(0xffab40); g.lineStyle(2, 0xffab40, 1); g.strokeCircle(8, 8, 3); g.lineStyle(1, 0xffab40, 0.7); g.strokeCircle(8, 8, 6); done(g, 'icon_scorching_resonance'); // 波紋
    g = base(0xff5252); g.fillCircle(8, 8, 5); g.fillStyle(0x1a1420, 1); g.fillCircle(8, 8, 3); g.fillStyle(0xffee58, 1); g.fillRect(7, 3, 2, 4); done(g, 'icon_core_overdrive'); // 炉心メーター

    // --- M6-E: 新進化5種 ---
    g = evo(0x9e9e9e); g.fillRect(5, 4, 6, 10); g.fillRect(3, 4, 10, 2); g.fillStyle(0xff7043, 1); g.fillTriangle(8, 1, 5, 4, 11, 4); done(g, 'icon_necroflame_mausoleum'); // 大型墓標
    g = evo(0xff5722); g.lineStyle(2, 0xff5722, 1); g.strokePoints([{ x: 2, y: 10 }, { x: 7, y: 5 }, { x: 13, y: 11 }], false); g.strokePoints([{ x: 3, y: 4 }, { x: 8, y: 9 }, { x: 14, y: 5 }], false); done(g, 'icon_world_scorching_rift'); // 交差亀裂
    g = evo(0xffca28); g.lineStyle(2, 0xffca28, 1); g.strokeTriangle(8, 2, 3, 11, 13, 11); g.strokeTriangle(8, 14, 3, 5, 13, 5); done(g, 'icon_hexagram_inferno_array'); // 六芒星
    g = evo(0xffab40); g.lineStyle(1, 0xffab40, 1); g.strokeCircle(5, 8, 2); g.strokeCircle(11, 8, 2); g.strokeCircle(8, 8, 5); done(g, 'icon_universal_flame_resonance'); // 複数波紋
    g = evo(0xff5252); g.fillStyle(0xffee58, 1); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.fillTriangle(8, 8, 8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, 8 + Math.cos(a + 0.4) * 5, 8 + Math.sin(a + 0.4) * 5); } g.fillStyle(0x1a1420, 1); g.fillCircle(8, 8, 2); done(g, 'icon_doomsday_core'); // 破裂した炉心

    // --- M7-A: 氷術師 active5種（氷色・結晶/波/槍/床/壁） ---
    g = base(0x9fe8ff); g.fillTriangle(8, 2, 5, 8, 11, 8); g.fillTriangle(8, 14, 5, 8, 11, 8); done(g, 'icon_frost_shard');              // 氷晶: 上下三角
    g = base(0x4fc3f7); g.lineStyle(2, 0x4fc3f7, 1); g.strokeCircle(8, 8, 5); g.strokeCircle(8, 8, 2); done(g, 'icon_frost_nova');        // 氷輪: 同心円
    g = base(0x80d8ff); g.fillRect(7, 2, 2, 12); g.fillTriangle(8, 1, 5, 5, 11, 5); done(g, 'icon_glacial_lance');                       // 氷槍: 縦の槍
    g = base(0x4dd0e1); g.lineStyle(1, 0x4dd0e1, 1); g.strokeRect(2, 6, 12, 8); g.fillStyle(0x4dd0e1, 0.5); g.fillRect(4, 8, 3, 3); g.fillRect(9, 9, 3, 3); done(g, 'icon_permafrost_field'); // 凍土: 床＋霜
    g = base(0xb3e5fc); g.fillRect(3, 4, 3, 9); g.fillRect(7, 4, 3, 9); g.fillRect(11, 4, 2, 9); done(g, 'icon_ice_wall');                // 氷壁: 縦柱3本

    // --- M7-A: 氷術師 進化3種（二重輪郭で進化を示す） ---
    const evi = (color) => { const gg = base(color); gg.lineStyle(1, 0x80deea, 0.9); gg.strokeRect(1, 1, 14, 14); return gg; };
    g = evi(0x9fe8ff); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.3; g.fillTriangle(8, 8, 8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, 8 + Math.cos(a + 0.5) * 5, 8 + Math.sin(a + 0.5) * 5); } done(g, 'icon_diamond_blizzard'); // ブリザード: 放射結晶
    g = evi(0x4fc3f7); g.lineStyle(2, 0x4fc3f7, 1); g.strokeCircle(8, 8, 6); g.strokeCircle(8, 8, 3); g.fillStyle(0xe1f5fe, 1); g.fillCircle(8, 8, 1.5); done(g, 'icon_absolute_zero_domain'); // 絶対零度: 大領域
    g = evi(0x80d8ff); g.fillRect(7, 1, 2, 14); g.fillTriangle(8, 0, 4, 5, 12, 5); g.fillStyle(0xe1f5fe, 1); g.fillCircle(5, 11, 1.5); g.fillCircle(11, 12, 1.5); done(g, 'icon_heaven_piercing_glacier'); // 天穿: 巨大槍＋氷片

    // --- M7-B: 氷術師 active10種 ---
    g = base(0xbde8ff); g.fillRect(4, 3, 1.5, 10); g.fillRect(8, 2, 1.5, 11); g.fillRect(12, 4, 1.5, 9); done(g, 'icon_icicle_volley');       // 氷柱斉射: 細柱3本
    g = base(0x9fe8ff); g.lineStyle(1, 0x9fe8ff, 1); g.strokeCircle(8, 8, 6); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.fillStyle(0xe1f5fe, 1); g.fillCircle(8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, 1.6); } done(g, 'icon_frost_orbit'); // 氷晶環: 環＋氷晶
    g = base(0x80d8ff); g.fillRect(2, 7, 12, 2); g.fillTriangle(14, 8, 10, 5, 10, 11); done(g, 'icon_freezing_ray');                          // 凍結光線: 横ビーム
    g = base(0x4fc3f7); for (let i = 0; i < 5; i++) { const x = 3 + (i * 3) % 11; g.fillTriangle(x, 3 + (i % 2) * 2, x - 1.5, 7 + (i % 2) * 2, x + 1.5, 7 + (i % 2) * 2); } g.fillStyle(0x9fe8ff, 0.5); g.fillRect(2, 12, 12, 2); done(g, 'icon_hailstorm'); // 雹嵐: 降る粒＋地面
    g = base(0x80d8ff); g.lineStyle(1, 0x80d8ff, 1); g.strokeCircle(8, 8, 5); g.fillStyle(0xe1f5fe, 1); g.fillCircle(8, 8, 2); g.lineStyle(1, 0xe1f5fe, 0.6); g.strokeCircle(8, 8, 7); done(g, 'icon_cryo_mine'); // 氷結地雷: 起爆感知
    g = base(0xe1f5fe); g.fillCircle(8, 6, 3); g.fillTriangle(5, 8, 11, 8, 8, 14); g.fillStyle(0x80d8ff, 1); g.fillCircle(6, 5, 1); g.fillCircle(10, 5, 1); done(g, 'icon_frost_spirit'); // 雪精霊: 精霊
    g = base(0x4dd0e1); g.lineStyle(1.5, 0xe1f5fe, 1); g.strokeRect(4, 3, 8, 11); g.fillStyle(0x80deea, 0.4); g.fillRect(6, 6, 4, 6); done(g, 'icon_ice_prison'); // 氷牢封印: 檻
    g = base(0xb3e5fc); g.fillTriangle(2, 12, 8, 3, 14, 12); g.fillStyle(0xe1f5fe, 0.7); g.fillTriangle(5, 12, 8, 7, 11, 12); done(g, 'icon_avalanche'); // 雪崩奔流: 崩れ落ちる三角
    g = base(0x80d8ff); g.lineStyle(1.5, 0xe1f5fe, 1); g.strokeCircle(8, 8, 6); g.beginPath(); g.moveTo(4, 8); g.lineTo(12, 8); g.strokePath(); done(g, 'icon_mirror_ice'); // 氷鏡結界: 鏡面
    g = base(0x4fc3f7); g.fillStyle(0x80d8ff, 1); g.fillTriangle(8, 2, 3, 10, 13, 10); g.fillStyle(0xe1f5fe, 1); g.fillTriangle(8, 5, 5, 10, 11, 10); g.fillStyle(0x9fe8ff, 0.5); g.fillCircle(8, 13, 3); done(g, 'icon_glacier_drop'); // 氷河墜落: 落下氷塊＋予告

    // --- M7-B: 氷術師 進化5種（二重輪郭で進化を示す） ---
    g = evi(0xbde8ff); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.fillTriangle(8, 8, 8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, 8 + Math.cos(a + 0.3) * 5, 8 + Math.sin(a + 0.3) * 5); } done(g, 'icon_crystal_tempest'); // 天晶氷嵐: 放射結晶多数
    g = evi(0x80d8ff); g.fillRect(2, 7, 12, 2); g.fillTriangle(14, 8, 10, 5, 10, 11); g.fillStyle(0xe1f5fe, 1); g.fillRect(6, 3, 1, 3); g.fillRect(10, 10, 1, 3); done(g, 'icon_absolute_zero_ray'); // 絶対零光: ビーム＋分岐
    g = evi(0x4fc3f7); g.fillStyle(0xe1f5fe, 0.6); g.fillCircle(8, 8, 6); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.fillStyle(0x80d8ff, 1); g.fillCircle(8 + Math.cos(a) * 4, 8 + Math.sin(a) * 4, 1.4); } done(g, 'icon_whiteout_cataclysm'); // 白魔大氷災: 大吹雪
    g = evi(0xe1f5fe); g.lineStyle(1, 0x80deea, 1); g.strokeCircle(8, 8, 6); g.fillStyle(0xe1f5fe, 1); g.fillCircle(8, 5, 2); g.fillCircle(5, 10, 1.5); g.fillCircle(11, 10, 1.5); done(g, 'icon_frost_queen_court'); // 雪后氷霊陣: 陣＋霊
    g = evi(0xb3e5fc); g.fillTriangle(1, 13, 6, 3, 11, 13); g.fillTriangle(6, 13, 11, 4, 15, 13); done(g, 'icon_world_end_avalanche'); // 終末氷河奔流: 二重の巨大波

    // --- M7-C: 氷術師 active10種 ---
    g = base(0xbde8ff); g.lineStyle(1.5, 0xe1f5fe, 1); g.strokeCircle(8, 8, 6); g.beginPath(); g.moveTo(3, 8); g.lineTo(13, 8); g.strokePath(); g.fillStyle(0x80d8ff, 1); g.fillCircle(13, 8, 1.5); done(g, 'icon_rime_boomerang');    // 霜輪飛刃: 往復する氷輪
    g = base(0x80d8ff); g.lineStyle(1.5, 0xbde8ff, 1); g.beginPath(); g.moveTo(2, 4); g.lineTo(7, 9); g.lineTo(5, 13); g.lineTo(13, 6); g.strokePath(); done(g, 'icon_frost_chain');                                                        // 氷鎖連閃: 連鎖する稲妻
    g = base(0x9fe8ff); g.fillStyle(0xe1f5fe, 1); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.fillTriangle(8, 8, 8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, 8 + Math.cos(a + 0.4) * 4, 8 + Math.sin(a + 0.4) * 4); } g.fillStyle(0x4fc3f7, 1); g.fillCircle(8, 8, 2); done(g, 'icon_crystal_bloom'); // 氷晶開花: 開く氷晶
    g = base(0xe1f5fe); g.fillStyle(0xe1f5fe, 0.5); g.fillCircle(8, 8, 6); g.fillStyle(0xb3e5fc, 0.8); g.fillCircle(6, 7, 2); g.fillCircle(10, 9, 2); g.fillCircle(9, 6, 1.5); done(g, 'icon_snowblind_mist');                                  // 白霧氷界: もやの粒
    g = base(0x9fe8ff); g.fillStyle(0xe1f5fe, 1); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.fillTriangle(8, 8, 8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, 8 + Math.cos(a + 0.2) * 3, 8 + Math.sin(a + 0.2) * 3); } g.fillStyle(0x4fc3f7, 1); g.fillCircle(8, 8, 2.5); done(g, 'icon_polar_star'); // 極星氷弾: 大きな氷星
    g = base(0x4fc3f7); for (let i = 0; i < 4; i++) { const a = -0.6 + i * 0.4; g.lineStyle(1.5, 0xe1f5fe, 1); g.beginPath(); g.moveTo(3, 8); g.lineTo(3 + Math.cos(a) * 10, 8 + Math.sin(a) * 10); g.strokePath(); } done(g, 'icon_icebreaker_wave');           // 砕氷衝波: 扇状の波
    g = base(0xbde8ff); g.lineStyle(1.5, 0xe1f5fe, 1); g.strokeCircle(8, 8, 6); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.moveTo(8, 8); g.lineTo(8 + Math.cos(a) * 5, 8 + Math.sin(a) * 5); g.strokePath(); } g.fillStyle(0x4fc3f7, 1); g.fillCircle(8, 8, 1.5); done(g, 'icon_frozen_clock'); // 氷刻停止: 時計
    g = base(0x80d8ff); g.fillTriangle(8, 2, 4, 8, 12, 8); g.fillStyle(0xe1f5fe, 1); g.fillTriangle(8, 14, 5, 9, 11, 9); g.fillStyle(0xbde8ff, 1); g.fillCircle(8, 8, 1.5); done(g, 'icon_crystal_refraction');                                    // 氷晶屈折: 屈折する結晶
    g = base(0xb3e5fc); g.lineStyle(2, 0xe1f5fe, 1); g.strokeCircle(8, 8, 6); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.fillStyle(0x80d8ff, 1); g.fillCircle(8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, 1.4); } done(g, 'icon_winter_halo');                             // 冬冠結界: 氷冠の輪
    g = base(0x9fe8ff); for (let i = 0; i < 3; i++) { const x = 3 + i * 4; g.fillCircle(x, 4 + i, 2); g.lineStyle(1, 0xbde8ff, 0.7); g.beginPath(); g.moveTo(x, 4 + i); g.lineTo(x - 3, 13); g.strokePath(); } done(g, 'icon_comet_sleet');                     // 氷彗星群: 降る彗星＋尾

    // --- M7-C: 氷術師 進化5種（二重輪郭で進化を示す） ---
    g = evi(0xbde8ff); g.lineStyle(2, 0xe1f5fe, 1); g.strokeCircle(8, 8, 6); g.strokeCircle(8, 8, 3); g.fillStyle(0x4fc3f7, 1); g.fillCircle(13, 8, 2); g.fillCircle(3, 8, 2); done(g, 'icon_rime_execution_wheel');                              // 冥氷処刑輪: 巨大氷輪×複数
    g = evi(0x80d8ff); g.lineStyle(1.5, 0xbde8ff, 1); g.beginPath(); g.moveTo(2, 4); g.lineTo(6, 8); g.lineTo(4, 12); g.strokePath(); g.beginPath(); g.moveTo(6, 8); g.lineTo(11, 5); g.strokePath(); g.beginPath(); g.moveTo(6, 8); g.lineTo(12, 12); g.strokePath(); done(g, 'icon_eternal_frost_chain'); // 永劫氷鎖: 分岐する鎖
    g = evi(0xbde8ff); g.fillStyle(0x4dd0e1, 1); g.fillRect(7, 8, 2, 7); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2; g.fillStyle(0xe1f5fe, 1); g.fillTriangle(8, 7, 8 + Math.cos(a) * 6, 7 + Math.sin(a) * 5, 8 + Math.cos(a + 0.3) * 4, 7 + Math.sin(a + 0.3) * 4); } done(g, 'icon_crystal_world_tree'); // 世界氷晶樹: 氷の樹
    g = evi(0xe1f5fe); g.fillStyle(0xe1f5fe, 0.6); g.fillCircle(8, 8, 6); g.fillStyle(0xb3e5fc, 0.9); g.fillCircle(6, 6, 2); g.fillCircle(10, 8, 2); g.fillCircle(8, 11, 1.8); g.fillCircle(11, 5, 1.4); done(g, 'icon_everlasting_white_mist');    // 永久白霧: 濃い霧
    g = evi(0x4fc3f7); g.lineStyle(2, 0xe1f5fe, 1); g.strokeCircle(8, 8, 6); g.strokeCircle(8, 8, 3.5); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; g.beginPath(); g.moveTo(8, 8); g.lineTo(8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6); g.strokePath(); } g.fillStyle(0xbde8ff, 1); g.fillCircle(8, 8, 1.5); done(g, 'icon_zero_hour_world'); // 零刻世界: 巨大な時計世界
  }
}
