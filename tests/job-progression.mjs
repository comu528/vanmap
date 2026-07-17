// JobProgressionManager（M6-C）の経験値曲線・レベル算出・周回報酬・二重獲得防止・保存移行のテスト。
// Node.js 標準機能のみ。data/job-progression.json を実際に読み込んで検証する。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { JobProgressionManager } from '../src/systems/JobProgressionManager.js';
import { migrateProfile, defaultProfile } from '../src/systems/profileSchema.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const load = (n) => JSON.parse(readFileSync(join(dir, n), 'utf8'));
const cfg = load('job-progression.json');
JobProgressionManager.setConfig(cfg);
const JP = JobProgressionManager;
const JID = 'flame_witch';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const approx = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
const section = (t) => console.log(t);

// ===== 1. 経験値・レベル =====
section('1. 経験値曲線とジョブレベル算出');
{
  ok(JP.levelForTotalXp(JID, 0) === 1, 'totalXp=0 で Lv1');
  ok(JP.totalXpForLevel(JID, 1) === 0, 'Lv1 の累計必要XPは0');
  ok(JP.totalXpForLevel(JID, 2) === 100, 'Lv2 必要XP=100');
  ok(JP.totalXpForLevel(JID, 10) === 2700, 'Lv10 必要XP=2700');
  ok(JP.totalXpForLevel(JID, 50) === 63700, 'Lv50 必要XP=63700');
  ok(JP.totalXpForLevel(JID, 100) === 252450, 'Lv100 必要XP=252450');

  // ちょうど到達 / 直前
  ok(JP.levelForTotalXp(JID, 100) === 2, 'totalXp=100 でちょうど Lv2');
  ok(JP.levelForTotalXp(JID, 99) === 1, 'totalXp=99 ではまだ Lv1');
  ok(JP.levelForTotalXp(JID, 2700) === 10, 'totalXp=2700 で Lv10');
  ok(JP.levelForTotalXp(JID, 63700) === 50, 'totalXp=63700 で Lv50');

  // 単調増加（必要XPが減少しない）
  let mono = true, prev = -1;
  for (let L = 1; L <= 100; L++) { const t = JP.totalXpForLevel(JID, L); if (t < prev) mono = false; prev = t; }
  ok(mono, 'Lv1→Lv100 の累計必要XPが単調増加');

  // Lv100 を超えない・Lv100 以降も totalXp を失わない
  ok(JP.levelForTotalXp(JID, 252450) === 100, 'totalXp=252450 で Lv100');
  ok(JP.levelForTotalXp(JID, 999999999) === 100, '巨大XPでも Lv100 で頭打ち（フリーズしない）');
  const big = JP.progress(JID, 500000);
  ok(big.level === 100 && big.totalXp === 500000, 'Lv100 超過分の totalXp を保持');
  ok(big.atCap === true && big.xpToNext === 0, 'Lv100 は atCap・次まで0');

  // 不正値
  ok(JP.levelForTotalXp(JID, -100) === 1, '負のXPは Lv1（拒否）');
  ok(JP.levelForTotalXp(JID, NaN) === 1, 'NaN は Lv1（拒否）');
  ok(JP.levelForTotalXp(JID, Infinity) === 1, 'Infinity は不正値として拒否（0扱い→Lv1・フリーズしない）');

  // 次レベルまでのXP表示
  const p2 = JP.progress(JID, 150);
  ok(p2.level === 2 && p2.xpIntoLevel === 50 && p2.xpForNext === (JP.totalXpForLevel(JID, 3) - 100), 'Lv2 の現在レベル内XPと次必要XP');
  ok(p2.xpToNext === (JP.totalXpForLevel(JID, 3) - 150), '次レベルまでの残りXP');
}

// ===== 2. 周回報酬 =====
section('2. 周回終了時のジョブXP');
{
  // baseJobXp = survival*1.2 + min(normal,2000)*0.08 + elite*4 + boss*60 + victory; ×difficultyMult
  const r = { win: true, timeSec: 100, normalKills: 500, eliteKills: 3, bossKills: 1, difficultyId: 1 };
  const x = JP.computeRunXp(JID, r);
  const expectBase = 100 * 1.2 + 500 * 0.08 + 3 * 4 + 1 * 60 + 200; // 120+40+12+60+200=432
  ok(approx(x.base, Math.floor(expectBase)), `勝利のbaseXP=${Math.floor(expectBase)}`);
  ok(x.total === Math.floor(expectBase * 1.0), '難易度1倍率で total=base');

  // 難易度倍率
  const d3 = JP.computeRunXp(JID, { ...r, difficultyId: 3 });
  ok(d3.difficultyMult === 1.55 && d3.total === Math.floor(432 * 1.55), '難易度3倍率×1.55');
  const d5 = JP.computeRunXp(JID, { ...r, difficultyId: 5 });
  ok(d5.difficultyMult === 2.3, '難易度5倍率×2.30');

  // 勝利ボーナス / 敗北でもXP
  const lose = JP.computeRunXp(JID, { ...r, win: false });
  ok(lose.victory === 0, '敗北は勝利ボーナス0');
  ok(lose.total > 0, '敗北でもXPを獲得できる');
  ok(lose.total < x.total, '敗北は勝利よりXPが少ない');

  // 通常敵撃破数の上限
  const many = JP.computeRunXp(JID, { win: false, timeSec: 0, normalKills: 100000, eliteKills: 0, bossKills: 0, difficultyId: 1 });
  const capped = JP.computeRunXp(JID, { win: false, timeSec: 0, normalKills: 2000, eliteKills: 0, bossKills: 0, difficultyId: 1 });
  ok(many.total === capped.total, '通常敵撃破数は上限(2000)で頭打ち');
  ok(many.total > 0, 'それでも撃破周回は無意味にならない（XP>0）');
}

// ===== 3. 付与と二重獲得防止 =====
section('3. awardRun と二重獲得防止');
{
  const p = defaultProfile(6, '0.6.0');
  const res = { win: true, timeSec: 100, normalKills: 500, eliteKills: 3, bossKills: 1, difficultyId: 1, battleLevel: 12, evolutions: 1, runId: 'run-A' };
  const a1 = JP.awardRun(p, JID, res);
  ok(a1.awarded === true && a1.xpGain === 432, '初回付与でXP+432');
  ok(p.jobProgress[JID].totalXp === 432, 'profile.totalXp が加算される');
  ok(p.jobProgress[JID].runs === 1 && p.jobProgress[JID].wins === 1, 'runs/wins が更新される');
  ok(p.jobProgress[JID].eliteKills === 3 && p.jobProgress[JID].bossKills === 1, 'elite/boss 統計');
  ok(p.jobProgress[JID].totalKills === 503, 'totalKills=normal+elite');
  ok(p.jobProgress[JID].highestBattleLevel === 12, 'highestBattleLevel を記録');
  ok(p.jobProgress[JID].totalEvolutions === 1, 'totalEvolutions を記録');

  // 同じ runId では再獲得しない
  const a2 = JP.awardRun(p, JID, res);
  ok(a2.awarded === false && a2.xpGain === 0, '同 runId は二重獲得しない');
  ok(p.jobProgress[JID].totalXp === 432 && p.jobProgress[JID].runs === 1, 'totalXp/runs が変わらない');

  // 別 runId は加算
  const a3 = JP.awardRun(p, JID, { ...res, runId: 'run-B' });
  ok(a3.awarded === true && p.jobProgress[JID].totalXp === 864, '別 runId は加算される');

  // awardedRunIds が上限を超えて無制限に増えない
  const p2 = defaultProfile(6, '0.6.0');
  for (let i = 0; i < 100; i++) JP.awardRun(p2, JID, { win: false, timeSec: 1, normalKills: 0, eliteKills: 0, bossKills: 0, difficultyId: 1, runId: 'r' + i }, { maxAwardedRunIds: 40 });
  ok(p2.jobProgress[JID].awardedRunIds.length === 40, 'awardedRunIds は上限件数(40)で保持');
  ok(p2.jobProgress[JID].runs === 100, 'runs 自体は全周回ぶん増える');
}

// ===== 4. 複数レベルアップと到達報酬 =====
section('4. 一度に複数レベル上昇・到達報酬解放');
{
  const p = defaultProfile(6, '0.6.0');
  // Lv1(0) から一気に Lv10 相当(2700) を超えるXPを付与
  const res = { win: true, timeSec: 2500, normalKills: 0, eliteKills: 0, bossKills: 0, difficultyId: 1, runId: 'big' };
  const x = JP.computeRunXp(JID, res); // 2500*1.2 + 200 = 3200
  const a = JP.awardRun(p, JID, res);
  ok(a.before.level === 1 && a.after.level > 1, '1周で複数レベル上昇');
  ok(x.total === 3200 && a.after.level === JP.levelForTotalXp(JID, 3200), 'XP=3200 到達レベルが一致');
  // 途中の到達報酬（Lv5/Lv10）がすべて解放される
  const ms = a.milestonesUnlocked.map((m) => m.level);
  ok(ms.includes(5) && ms.includes(10), '途中の到達報酬(Lv5,Lv10)をすべて解放');
  ok(ms.every((l) => l <= a.after.level), '到達レベル超の報酬は解放しない');
}

// ===== 5. 保存・移行 =====
section('5. 保存・移行・転生維持');
{
  // 旧 profile（jobProgress 無し）→ 空で初期化
  const old = { save_version: 5, embers: 100 };
  const mig = migrateProfile(old, 6, '0.6.0');
  ok(mig.jobProgress && typeof mig.jobProgress === 'object', '旧 profile へ jobProgress を追加');
  ok(JP.levelForTotalXp(JID, (mig.jobProgress[JID]?.totalXp) || 0) === 1, 'jobProgress 無し → totalXp=0 → Lv1');

  // jobProgress を持つ profile の移行で保持
  const withJp = { save_version: 6, jobProgress: { flame_witch: { totalXp: 5000, runs: 3, wins: 2, awardedRunIds: ['a', 'b'] } } };
  const mig2 = migrateProfile(withJp, 6, '0.6.0');
  ok(mig2.jobProgress.flame_witch.totalXp === 5000, '移行で totalXp を保持');
  ok(mig2.jobProgress.flame_witch.runs === 3, '移行で runs を保持');
  ok(Array.isArray(mig2.jobProgress.flame_witch.awardedRunIds) && mig2.jobProgress.flame_witch.awardedRunIds.length === 2, '移行で awardedRunIds を保持');

  // プロトタイプ汚染キーを除外
  const eviljson = JSON.parse('{"save_version":6,"jobProgress":{"__proto__":{"totalXp":9},"flame_witch":{"totalXp":1}}}');
  const mig3 = migrateProfile(eviljson, 6, '0.6.0');
  ok(!Object.prototype.hasOwnProperty.call(mig3.jobProgress, '__proto__'), 'jobProgress のプロトタイプ汚染キーを除外');

  // 破損キャッシュ（totalXp 負数）を安全化
  const broken = migrateProfile({ save_version: 6, jobProgress: { flame_witch: { totalXp: -50 } } }, 6, '0.6.0');
  ok(broken.jobProgress.flame_witch.totalXp === 0, '負の totalXp を0へ安全化');
}

console.log('');
if (fail) { console.error(`✗ ジョブ育成テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ ジョブ育成テスト成功: ${pass} 件すべて通過`); process.exit(0); }
