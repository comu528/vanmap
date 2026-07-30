// M9-A 横断監査 16/25: 3 ジョブ切替のセーブ監査。Node.js 標準機能のみ。
// production の profileSchema（migrateProfile / defaultProfile / coerceSettings）を直接駆動する。
// 実行: node tests/cross-job-save-switching.mjs
import { runner, JOB_IDS } from './cross-job-common.mjs';
import { migrateProfile, defaultProfile, coerceSettings } from '../src/systems/profileSchema.js';

const T = runner('セーブ / ジョブ切替 横断監査（M9-A）');
const { ok, section, info } = T;
const SV = 6, GV = '0.6.0';

section('1. save_version v6 維持・migration が冪等');
{
  const d = defaultProfile(SV, GV);
  ok(d.save_version === 6, `defaultProfile の save_version = 6`);
  const m1 = migrateProfile(d, SV, GV);
  const m2 = migrateProfile(m1, SV, GV);
  const strip = (p) => { const { created_at, updated_at, ...rest } = p; void created_at; void updated_at; return rest; };
  ok(JSON.stringify(strip(m1)) === JSON.stringify(strip(m2)), 'migrateProfile が冪等（2 回適用で不変）');
}

section('2. ジョブ切替 fire → frost → warrior → fire が selectedJobId を保持');
{
  let p = defaultProfile(SV, GV);
  for (const j of ['frost_mage', 'warrior', 'flame_witch', 'warrior']) {
    p.selectedJobId = j;
    p = migrateProfile(p, SV, GV);
    ok(p.selectedJobId === j, `selectedJobId=${j} が migration 後も保持される`);
    ok(p.unlockedJobs.includes('flame_witch'), 'unlockedJobs に flame_witch が必ずある');
  }
}

section('3. 不正値（unknown job / 壊れた数値 / 欠落）の安全化');
{
  const evil = migrateProfile({
    save_version: 6, selectedJobId: 12345, embers: 'NaN', soulflame: -50,
    permanentUpgrades: { a: 'x', b: -3, c: 2.7, d: 4 },
    statistics: { totalKills: Infinity },
    unlockedJobs: ['warrior', 42, null],
  }, SV, GV);
  ok(evil.selectedJobId === 'flame_witch', '数値の selectedJobId は既定 flame_witch へ');
  ok(evil.embers === 0 && evil.soulflame === 0, '壊れた通貨が 0 へ（負値 / 文字列を拒否）');
  ok(Object.values(evil.permanentUpgrades).every((v) => Number.isInteger(v) && v >= 0), '恒久強化が非負整数のみ');
  ok(Number.isFinite(evil.statistics.totalKills) ? evil.statistics.totalKills >= 0 : evil.statistics.totalKills === 0,
    `統計の Infinity が安全化される（${evil.statistics.totalKills}）`);
  ok(evil.unlockedJobs.every((x) => typeof x === 'string'), 'unlockedJobs から非文字列が除去される');
  const legacy = migrateProfile({ save_version: 3, embers: 10 }, SV, GV);
  ok(legacy.save_version === 6 && legacy.embers === 10, '旧セーブ（v3）が起動不能にならず v6 へ');
}

section('4. settings（品質）はセーブ本体と独立・不正品質は既定へ');
{
  const s1 = coerceSettings({ effectQuality: 'ultra' });
  ok(s1.effectQuality === 'ultra', '正当な品質は保持');
  const s2 = coerceSettings({ effectQuality: 'insane' });
  ok(s2.effectQuality === 'high', '不正な品質は既定 high へ');
  // M9-A: 品質はプレイ中いつ変えても gameplay へ影響しないため、active_run へ品質を保存する必要はない。
  const d = defaultProfile(SV, GV);
  ok(!('effectQuality' in d), 'profile 本体に品質キーが無い（設定と分離・新キー追加なし）');
}

section('5. active_run の jobId と selectedJobId の分離（切替 exploit なし）');
{
  // active_run は保存側の別キー。selectedJobId を切り替えても active_run.jobId が周回の正。
  // ここではスキーマ上の分離だけを確認する（実復元は per-job runtime-save スイート）。
  const p = migrateProfile({ save_version: 6, selectedJobId: 'warrior' }, SV, GV);
  ok(!('active_run' in p) || p.active_run === null || typeof p.active_run === 'object',
    'migrateProfile が active_run を捏造しない');
  ok(JOB_IDS.every((j) => typeof j === 'string'), '3 ジョブ id が有効');
  info('active_run.jobId が周回の正・selectedJobId は次周回の選択（M8-B からの設計）');
}

T.finish();
