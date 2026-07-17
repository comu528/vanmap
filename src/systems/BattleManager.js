// BattleManager: 周回の開始/終了/経過時間/勝敗/リザルト生成/途中セーブを担う。
// BattleScene から責務分離（M3）。残り火・統計・熟練度・難易度解放は ProgressionManager へ委譲する。

import { SaveManager } from './SaveManager.js';
import { ProgressionManager } from './ProgressionManager.js';

export class BattleManager {
  constructor(scene) {
    this.scene = scene;
  }

  // 途中セーブ用スナップショット（敵個体は保存しない）。
  buildRunSnapshot() {
    const s = this.scene;
    return {
      inProgress: true, save_version: s.saveVersion, game_version: s.gameVersion,
      difficulty: s.difficultyId, elapsedSec: s.timeSec,
      playerHp: s.player.hp, maxHp: s.player.maxHp,
      playerLevel: s.player.level, xp: s.player.xp, xpToNext: s.player.xpToNext,
      skills: s.skills.serialize(), evolvedBase: s.skills.evolvedBaseIds, kills: s.kills,
      bossActive: !!(s.boss && s.boss.alive), bossHp: s.boss?.alive ? s.boss.hp : 0,
      rngSeed: s.rngSeed, pendingCurrency: 0, bonus: s.bonus,
      cycleNumber: s.cycleNumber || 0,   // 転生をまたいだ再開防止
      // --- Milestone 6-A: ジョブ・所持枠・パッシブ・ドラフト状態 ---
      jobId: s.job?.id || 'flame_witch',
      activeSkillSlots: s.activeSlotsMax,
      passiveSkillSlots: s.passiveSlotsMax,
      passiveSkills: s.passives ? s.passives.serialize() : {},
      draftState: s.draft ? s.draft.serialize() : null,
      updated_at: new Date().toISOString(),
    };
  }

  autoSave() {
    if (this.scene.gameOver) return;
    SaveManager.saveActiveRun(this.buildRunSnapshot());
  }

  // 同一周回を一意に識別する ID（残り火の二重加算防止に使用）。
  _resultId(win) {
    const s = this.scene;
    return `${s.rngSeed}-${Math.round(s.timeSec * 1000)}-${s.kills}-${s.bossKills}-${win ? 'W' : 'L'}`;
  }

  buildResult(win) {
    const s = this.scene;
    return {
      win, timeSec: s.timeSec, kills: s.kills, bossKills: s.bossKills,
      maxHit: s.maxHit, difficultyId: s.difficultyId,
      skills: s.skills.statsList(), evolvedBaseIds: s.skills.evolvedBaseIds,
      passives: s.passives ? s.passives.statsList() : [], jobId: s.job?.id || 'flame_witch',
      resultId: this._resultId(win),
    };
  }

  // 勝敗確定。恒久成長へ反映し、リザルトへ遷移する。
  finishRun(win) {
    const s = this.scene;
    if (s.gameOver) return;
    s.gameOver = true;

    SaveManager.clearActiveRun(); // 途中セーブ削除（勝敗確定）
    s.physics.world.resume();
    s.time.paused = false;
    s.tweens.resumeAll();
    if (s._resetTimeScales) s._resetTimeScales(); // 倍速をリセットしてから遷移

    const result = this.buildResult(win);
    // 残り火加算・統計・熟練度・難易度解放（二重加算は lastResultId で防止）
    const outcome = ProgressionManager.completeRun(result);

    const payload = {
      ...result,
      ember: outcome.breakdown,
      embersTotal: outcome.profile.embers,
      newlyUnlocked: outcome.newlyUnlocked,
      awarded: outcome.awarded,
    };
    s.time.delayedCall(600, () => s.scene.start('ResultScene', payload));
  }
}
