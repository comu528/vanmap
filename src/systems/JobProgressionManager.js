// JobProgressionManager（Milestone 6-C）: ジョブ経験値・ジョブレベル・周回報酬・二重獲得防止を統括する。
// 戦闘レベル（battleLevel: 周回ごとにLv1から・経験値ジェムで上昇・周回終了でリセット）とは完全に別体系。
// ジョブレベル（jobLevel）は profile.jobProgress[jobId].totalXp を唯一の正として算出し、周回・転生をまたいで維持する。
//
// データ（曲線・報酬・レベル上限・到達報酬）は data/job-progression.json に集約し、コードへ数値を散在させない。
// DOM / Phaser 非依存の純粋ロジック（Node からも import してテストできる）。

// 累計必要経験値: totalXpForLevel(L) = quad*(L-1)^2 + lin*(L-1)。単調増加・Lv1=0。
function totalXpForLevel(level, curve) {
  const q = num(curve?.quad, 25);
  const l = num(curve?.lin, 75);
  const n = Math.max(0, level - 1);
  return q * n * n + l * n;
}

function num(v, d = 0) { return (typeof v === 'number' && Number.isFinite(v)) ? v : d; }
// 不正値（負数・NaN・Infinity）を安全な有限非負へ丸める。
function safeXp(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0;
  return v;
}

export class JobProgressionManagerClass {
  constructor() { this._cfg = null; }

  // data/job-progression.json（{ version, jobs: { jobId: {...} } }）を注入する。
  setConfig(cfg) { this._cfg = cfg || null; }

  jobConfig(jobId) { return (this._cfg && this._cfg.jobs && this._cfg.jobs[jobId]) || null; }
  levelCap(jobId) { return num(this.jobConfig(jobId)?.levelCap, 100); }

  // totalXp から表示ジョブレベル（1..levelCap）を算出する。totalXp が唯一の正。
  // Lv100 以降の totalXp は保持するが、表示レベルと効果は levelCap で頭打ち（loop は levelCap で停止＝フリーズしない）。
  levelForTotalXp(jobId, totalXp) {
    const cfg = this.jobConfig(jobId);
    const cap = num(cfg?.levelCap, 100);
    const curve = cfg?.xpCurve;
    const xp = safeXp(totalXp);
    let level = 1;
    for (let L = 2; L <= cap; L++) {
      if (xp >= totalXpForLevel(L, curve)) level = L; else break;
    }
    return level;
  }

  totalXpForLevel(jobId, level) { return totalXpForLevel(level, this.jobConfig(jobId)?.xpCurve); }

  // 表示・UI 用の進行情報（保存値ではなく totalXp から都度算出する）。
  progress(jobId, totalXp) {
    const cfg = this.jobConfig(jobId);
    const cap = num(cfg?.levelCap, 100);
    const curve = cfg?.xpCurve;
    const xp = safeXp(totalXp);
    const level = this.levelForTotalXp(jobId, xp);
    const curBase = totalXpForLevel(level, curve);
    const atCap = level >= cap;
    const nextBase = atCap ? curBase : totalXpForLevel(level + 1, curve);
    const need = atCap ? 0 : (nextBase - curBase);
    const into = xp - curBase;
    return {
      jobId, level, cap, atCap, totalXp: xp,
      levelBaseXp: curBase, nextLevelXp: nextBase,
      xpIntoLevel: into, xpForNext: need,
      xpToNext: atCap ? 0 : Math.max(0, nextBase - xp),
      ratio: need > 0 ? Math.max(0, Math.min(1, into / need)) : 1,
    };
  }

  // 周回終了時のジョブ経験値（戦闘中には付与せず、リザルト確定時にまとめて算出する）。
  // result: { win, timeSec, normalKills, eliteKills, bossKills, difficultyId }
  computeRunXp(jobId, result) {
    const cfg = this.jobConfig(jobId);
    const rw = cfg?.xpReward || {};
    const survival = Math.max(0, num(result.timeSec, 0)) * num(rw.perSurvivalSecond, 1.2);
    const cap = num(rw.normalKillCap, 2000);
    const normals = Math.min(Math.max(0, num(result.normalKills, 0)), cap) * num(rw.perNormalKill, 0.08);
    const elites = Math.max(0, num(result.eliteKills, 0)) * num(rw.perEliteKill, 4);
    const bosses = Math.max(0, num(result.bossKills, 0)) * num(rw.perBossKill, 60);
    const victory = result.win ? num(rw.victoryBonus, 200) : 0;
    const base = survival + normals + elites + bosses + victory;
    const dmap = rw.difficultyMult || {};
    const dmult = num(dmap[String(result.difficultyId)] ?? dmap[result.difficultyId], 1);
    const total = Math.max(0, Math.floor(base * dmult));
    return {
      survival: Math.floor(survival), normals: Math.floor(normals), elites: Math.floor(elites),
      bosses: Math.floor(bosses), victory, base: Math.floor(base), difficultyMult: dmult, total,
    };
  }

  // 空の jobProgress エントリ（旧セーブ・未プレイジョブ用）。
  emptyEntry() {
    return {
      totalXp: 0, runs: 0, wins: 0, losses: 0,
      totalSurvivalSeconds: 0, totalKills: 0, eliteKills: 0, bossKills: 0,
      highestBattleLevel: 0, highestDifficultyPlayed: 0, highestDifficultyCleared: 0,
      totalEvolutions: 0, lastPlayedAt: null, lastXpGain: 0, lastAwardedRunId: null,
      awardedRunIds: [],
    };
  }

  // profile.jobProgress[jobId] を安全に取得（無ければ空で初期化して返す）。破損キャッシュは totalXp から再計算する前提。
  entry(profile, jobId) {
    if (!profile.jobProgress || typeof profile.jobProgress !== 'object') profile.jobProgress = {};
    const cur = profile.jobProgress[jobId];
    if (!cur || typeof cur !== 'object') {
      profile.jobProgress[jobId] = this.emptyEntry();
    } else {
      // 欠落フィールドを補完（加算的拡張・旧構造の安全化）。
      profile.jobProgress[jobId] = { ...this.emptyEntry(), ...cur };
      if (!Array.isArray(profile.jobProgress[jobId].awardedRunIds)) profile.jobProgress[jobId].awardedRunIds = [];
      profile.jobProgress[jobId].totalXp = safeXp(profile.jobProgress[jobId].totalXp);
    }
    return profile.jobProgress[jobId];
  }

  // 周回結果からジョブ経験値を profile へ加算する（二重獲得防止）。
  // runId で同一結果からの再獲得を防ぐ。awardedRunIds は上限件数だけ保持する。
  // 統計（runs/wins/kills 等）も同時に更新する。呼び出し側で SaveManager を通して保存する。
  awardRun(profile, jobId, result, opts = {}) {
    const e = this.entry(profile, jobId);
    const runId = result.runId != null ? String(result.runId) : null;
    const before = this.progress(jobId, e.totalXp);
    const alreadyAwarded = runId != null && (e.lastAwardedRunId === runId || e.awardedRunIds.includes(runId));
    const xp = this.computeRunXp(jobId, result);

    if (alreadyAwarded) {
      const after = this.progress(jobId, e.totalXp);
      return { awarded: false, xpGain: 0, before, after, xp, milestonesUnlocked: [], entry: e };
    }

    e.totalXp = safeXp(e.totalXp + xp.total);
    e.lastXpGain = xp.total;
    e.runs += 1;
    if (result.win) e.wins += 1; else e.losses += 1;
    e.totalSurvivalSeconds += Math.max(0, num(result.timeSec, 0));
    e.totalKills += Math.max(0, num(result.normalKills, 0)) + Math.max(0, num(result.eliteKills, 0));
    e.eliteKills += Math.max(0, num(result.eliteKills, 0));
    e.bossKills += Math.max(0, num(result.bossKills, 0));
    e.totalEvolutions += Math.max(0, num(result.evolutions, 0));
    e.highestBattleLevel = Math.max(num(e.highestBattleLevel, 0), num(result.battleLevel, 0));
    e.highestDifficultyPlayed = Math.max(num(e.highestDifficultyPlayed, 0), num(result.difficultyId, 0));
    if (result.win) e.highestDifficultyCleared = Math.max(num(e.highestDifficultyCleared, 0), num(result.difficultyId, 0));
    e.lastPlayedAt = opts.nowIso || e.lastPlayedAt;
    if (runId != null) {
      e.lastAwardedRunId = runId;
      e.awardedRunIds.push(runId);
      const keep = num(opts.maxAwardedRunIds, 40);
      if (e.awardedRunIds.length > keep) e.awardedRunIds = e.awardedRunIds.slice(-keep);
    }

    const after = this.progress(jobId, e.totalXp);
    const milestonesUnlocked = this.milestonesBetween(jobId, before.level, after.level);
    return { awarded: true, xpGain: xp.total, before, after, xp, milestonesUnlocked, entry: e };
  }

  // 到達報酬（milestone）一覧。
  milestones(jobId) { return (this.jobConfig(jobId)?.milestones || []).slice(); }

  // fromLevel（含まず）〜 toLevel（含む）の間に解放された到達報酬（複数レベルアップ対応）。
  milestonesBetween(jobId, fromLevel, toLevel) {
    return this.milestones(jobId).filter((m) => m.level > fromLevel && m.level <= toLevel);
  }

  // toLevel 時点で解放済みの到達報酬。
  unlockedMilestones(jobId, level) { return this.milestones(jobId).filter((m) => level >= m.level); }

  // 次に解放される到達報酬（無ければ null）。
  nextMilestone(jobId, level) {
    for (const m of this.milestones(jobId)) if (m.level > level) return m;
    return null;
  }
}

export const JobProgressionManager = new JobProgressionManagerClass();
