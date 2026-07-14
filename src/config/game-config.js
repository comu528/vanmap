// ゲーム全体の定数と Phaser 設定。
// 論理解像度 640x360、pixelArt、拡大時はアスペクト比維持。

export const GAME_WIDTH = 640;
export const GAME_HEIGHT = 360;
export const GAME_VERSION = '0.1.0-m1';

// テクスチャ生成用のキー一覧（BootScene で Graphics から生成）。
export const TEX = {
  PLAYER: 'player',
  GROUND: 'ground',
  GEM: 'gem',
  FIREBALL: 'fireball',
  ENEMY_SLIME: 'enemy_slime',
  ENEMY_BAT: 'enemy_bat',
  ENEMY_SKELETON: 'enemy_skeleton',
  ENEMY_GOLEM: 'enemy_golem',
  BOSS_FLAME_LORD: 'boss_flame_lord',
  PARTICLE: 'particle',
};

// Phaser のシーン登録は main.js 側で行う（循環 import 回避のため）。
export function buildPhaserConfig(scenes, parent) {
  return {
    type: Phaser.AUTO, // WebGL 優先、Canvas フォールバック
    parent,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: '#141018',
    scale: {
      mode: Phaser.Scale.FIT,           // アスペクト比を維持して拡大
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: scenes,
  };
}
