// エントリポイント。Phaser を起動し、シーンを登録する。
// シーン: Boot / Title / Base(拠点) / Battle / LevelUp / Result。
// Reincarnation などは Milestone 4 以降で追加する（TODO.md 参照）。

import { buildPhaserConfig, GAME_VERSION } from './config/game-config.js';
import { BootScene } from './scenes/BootScene.js';
import { TitleScene } from './scenes/TitleScene.js';
import { BaseScene } from './scenes/BaseScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { LevelUpScene } from './scenes/LevelUpScene.js';
import { EvolutionScene } from './scenes/EvolutionScene.js';
import { ResultScene } from './scenes/ResultScene.js';
import { DataManager } from './systems/DataManager.js';
import { SaveManager } from './systems/SaveManager.js';
import { ProgressionManager } from './systems/ProgressionManager.js';
import { ReincarnationManager } from './systems/ReincarnationManager.js';
import { EvolutionManager } from './systems/EvolutionManager.js';

function boot() {
  const bootMsg = document.getElementById('boot-message');

  if (typeof Phaser === 'undefined') {
    if (bootMsg) bootMsg.textContent = 'Phaser の読み込みに失敗しました（CDN 接続を確認してください）。';
    return;
  }

  // ?debug=1 のときだけデバッグ機能を有効化（M5 で本実装）。
  const params = new URLSearchParams(window.location.search);
  window.RFS_DEBUG = params.get('debug') === '1';

  const scenes = [BootScene, TitleScene, BaseScene, BattleScene, LevelUpScene, EvolutionScene, ResultScene];
  const config = buildPhaserConfig(scenes, 'game-container');
  const game = new Phaser.Game(config);
  window.RFS_GAME = game;
  // ?debug=1 のときだけ、各マネージャを検査用に公開する（通常利用時は隠す）。
  if (window.RFS_DEBUG) window.RFS = { DataManager, SaveManager, ProgressionManager, ReincarnationManager, EvolutionManager };
  console.log(`Reincarnation Flame Survivor ${GAME_VERSION}${window.RFS_DEBUG ? ' [debug]' : ''}`);

  setupFullscreen(game);
}

function setupFullscreen(game) {
  const btn = document.getElementById('fullscreen-btn');
  const toggle = () => {
    if (game.scale.isFullscreen) game.scale.stopFullscreen();
    else game.scale.startFullscreen();
  };
  if (btn) btn.addEventListener('click', toggle);
  // F11 は既定でブラウザ全画面のため、代替として F キーでも切替可能にする。
  window.addEventListener('keydown', (e) => {
    if (e.key === 'F' && e.shiftKey) { e.preventDefault(); toggle(); }
  });
}

boot();
