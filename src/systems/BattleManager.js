// BattleManager: 周回の開始/終了/経過時間/勝敗/リザルト生成/途中セーブを担う。
// BattleScene から責務分離（M3）。残り火・統計・熟練度・難易度解放は ProgressionManager へ委譲する。

import { SaveManager } from './SaveManager.js';
import { applyRun as applyTelemetryRun } from './RunBalanceSummary.js';
import { ProgressionManager } from './ProgressionManager.js';
import { JobProgressionManager } from './JobProgressionManager.js';

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
      skills: s.skills.serialize(), evolvedBase: s.skills.evolvedBaseIds, kills: s.kills, eliteKills: s.eliteKills || 0,
      bossActive: !!(s.boss && s.boss.alive), bossHp: s.boss?.alive ? s.boss.hp : 0,
      rngSeed: s.rngSeed, pendingCurrency: 0, bonus: s.bonus,
      cycleNumber: s.cycleNumber || 0,   // 転生をまたいだ再開防止
      // --- Milestone 6-A: ジョブ・所持枠・パッシブ・ドラフト状態 ---
      jobId: s.job?.id || 'flame_witch',
      activeSkillSlots: s.activeSlotsMax,
      passiveSkillSlots: s.passiveSlotsMax,
      passiveSkills: s.passives ? s.passives.serialize() : {},
      draftState: s.draft ? s.draft.serialize() : null,
      // M6-B: スキル固有 runtimeState（不死鳥CD・障壁再使用 等）。再読込での不正回復を防ぐ。
      skillRuntime: s.skills ? s.skills.serializeRuntime() : {},
      // M6-C: 周回開始時に凍結したジョブレベル補正（途中で profile 側レベルが変わっても持ち込まない）。jobId は上で保存済み。
      jobLevelAtStart: s.jobLevelAtStart || 1,
      jobTotalXpAtStart: s.jobTotalXpAtStart || 0,
      resolvedJobModifiers: s.resolvedJobModifiers || null,
      jobProgressionVersion: s.jobProgressionVersion || 1,
      jobRuntime: s.jobMods ? s.jobMods.serialize() : null, // 残響カウンター
      jobElement: s.jobElement || null,
      // M7-A: 状態異常専用 RNG の cursor（再読込で凍結判定を引き直せないようにする）。
      statusRng: s.statusFx ? s.statusFx.serialize().rng : null,
      // M7-A: ボス氷砕状態（ゲージ/break回数/脆弱残り時間）。再読込でのゲージ初期化・脆弱延長の悪用を防ぐ。
      bossFrost: (s.boss && s.boss.alive) ? {
        gauge: s.boss._frostGauge || 0,
        breaks: s.boss._frostBreaks || 0,
        vulnRemainMs: Math.max(0, (s.boss._frostbreakVulnUntil || 0) - s.time.now),
      } : null,
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
      win, timeSec: s.timeSec, kills: s.kills, eliteKills: s.eliteKills || 0, bossKills: s.bossKills,
      maxHit: s.maxHit, difficultyId: s.difficultyId, battleLevel: s.player.level,
      skills: s.skills.statsList(), evolvedBaseIds: s.skills.evolvedBaseIds,
      passives: s.passives ? s.passives.statsList() : [], jobId: s.jobId || 'flame_witch',
      resultId: this._resultId(win),
    };
  }

  // ジョブ経験値（M6-C）: リザルト確定時にまとめて付与する（勝敗両方・二重獲得防止・SaveCoordinator 経由で保存）。
  // 戦闘中には付与しない。runId=resultId で再表示/戻る/保存失敗復帰による二重獲得を防ぐ。
  _awardJobXp(result) {
    const jobId = this.scene.jobId || 'flame_witch';
    const profile = SaveManager.loadProfile();
    const jobResult = {
      win: result.win, timeSec: result.timeSec,
      normalKills: Math.max(0, (result.kills || 0) - (result.eliteKills || 0)),
      eliteKills: result.eliteKills || 0, bossKills: result.bossKills || 0,
      difficultyId: result.difficultyId, battleLevel: result.battleLevel || 0,
      evolutions: (result.evolvedBaseIds || []).length, runId: result.resultId,
    };
    const out = JobProgressionManager.awardRun(profile, jobId, jobResult, { nowIso: new Date().toISOString(), maxAwardedRunIds: 40 });
    if (out.awarded) SaveManager.saveProfile(profile, 'job_xp_award');
    return { jobId, displayName: this.scene.job?.displayName || jobId, ...out };
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
    // ジョブ経験値付与（M6-C・二重獲得防止は awardRun 側の runId ガード）。UIアニメを待たず即付与・保存する。
    const jobOutcome = this._awardJobXp(result);

    // ローカル戦闘テレメトリの確定・保存（M6-F）。主要セーブより低優先度・失敗しても進行/保存を壊さない。
    // Balance Playtest / F4〜F8 のデバッグ補正を使った周回は debugRun として通常統計と分離する。
    let balanceSummary = null;
    try {
      balanceSummary = s.finalizeTelemetry ? s.finalizeTelemetry({ ...result, resultId: result.resultId }) : null;
      if (balanceSummary) {
        if (balanceSummary.run) balanceSummary.run.runId = result.resultId;
        const profile = SaveManager.loadProfile();
        profile.balanceTelemetry = applyTelemetryRun(profile.balanceTelemetry, balanceSummary);
        SaveManager.saveProfile(profile, 'balance_telemetry');
      }
    } catch (e) {
      if (window.RFS_DEBUG) console.warn('[telemetry] 集計/保存に失敗（無視して続行）:', e);
    }

    const payload = {
      ...result,
      ember: outcome.breakdown,
      embersTotal: outcome.profile.embers,
      newlyUnlocked: outcome.newlyUnlocked,
      awarded: outcome.awarded,
      job: jobOutcome, // { jobId, displayName, awarded, xpGain, before, after, xp, milestonesUnlocked }
      balanceSummary,  // M6-F: ResultScene の Balance Summary 表示用（debugRun 判定含む）
    };
    s.time.delayedCall(600, () => s.scene.start('ResultScene', payload));
  }
}
