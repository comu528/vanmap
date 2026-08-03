// M9-A.2 5/12: save / reload / resume の実ブラウザ確認。Node.js 標準機能のみ。
// 途中保存 → リロード →「つづきから」で状態が一致し、無料 cast / CD 全回復 / 二重報酬が無いことを検証する。
// 実行: node tests/browser-resume-plan.mjs
import { results, runner, JOB_IDS } from './browser-results-common.mjs';

const T = runner('save / reload / resume（M9-A.2）');
const { ok, section, info } = T;
const R = results();

section('1. 3 ジョブとも途中保存 → reload → 再開に成功している');
for (const j of JOB_IDS) {
  const r = R.resume.find((x) => x.job === j);
  ok(!!r, `${j}: resume 記録がある`);
  if (!r) continue;
  ok(r.savedMidRun === true, `${j}: 周回途中で active_run を保存した`);
  ok(r.hasActiveRunAfterReload === true, `${j}: reload 後も active_run が残る`);
  ok(r.resumed === true, `${j}: 「つづきから」で戦闘へ復帰`);
  ok(r.beforeTimeSec >= 60, `${j}: 十分に進めてから保存した（${r.beforeTimeSec} ゲーム秒）`);
}

section('2. 復元される値が一致する');
const KEYS = [
  ['jobId', 'jobId'], ['level', 'レベル'], ['hp', 'HP'], ['maxHp', '最大HP'],
  ['activeLevels', 'active スキルと Lv'], ['passives', 'passive'], ['evolved', '進化'],
  ['runtime', 'runtime / cooldown'], ['statusRngCursor', 'RNG cursor'], ['status', '状態異常カウンタ'],
  ['kills', '撃破数'], ['bossSpawned', 'boss state'], ['draft', 'draft（reroll / banish / skip / stall）'],
  ['resource', '資源（闘気 / コンボ）'],
];
for (const r of R.resume) {
  for (const [k, label] of KEYS) {
    if (!(k in (r.matched || {}))) { ok(false, `${r.job}: ${label} の一致判定が記録されていない`); continue; }
    ok(r.matched[k] === true, `${r.job}: ${label} が復元一致`);
  }
}

section('2.5 XP は保存時刻ぶんだけずれる（レベルは一致する）');
for (const r of R.resume) {
  // ★ before スナップショットと autoSave() の間に 1〜2 ゲーム秒進むため、XP はその間の獲得ぶん動く。
  //   進行状態として意味があるのは**レベル**で、そちらは完全一致している（§2）。
  ok(r.matched.level === true, `${r.job}: レベルが一致（XP のズレは保存時刻の差）`);
  ok(typeof r.xpBefore === 'number' && typeof r.xpAfter === 'number',
    `${r.job}: XP の実測が記録されている（${r.xpBefore} → ${r.xpAfter}）`);
  ok(Math.abs(r.xpAfter - r.xpBefore) <= 30,
    `${r.job}: XP のズレが小さい（${Math.abs(r.xpAfter - r.xpBefore)} ≤ 30・レベルアップ 1 回未満）`);
}

section('3. 再開直後の悪用が無い（無料 cast / CD 全回復 / pending 二重）');
for (const r of R.resume) {
  ok(r.freeCastBurst === false, `${r.job}: 再開直後の一斉発動なし（3 秒で cast +${r.castsIn3s}）`);
  ok(r.cooldownFullyReset === false, `${r.job}: cooldown が全回復していない（cdLeft 合計 ${r.cdSumAfter}）`);
  ok(r.pendingDuplicated === false, `${r.job}: pending（draft / 遅延 / 場）の二重なし`);
  ok(r.rewardDuplicated === false, `${r.job}: 報酬の二重なし`);
  ok(r.statusDuplicated === false, `${r.job}: 状態 / ボスゲージの二重なし`);
}

section('4. selectedJobId を変えても active_run.jobId が変わらない');
for (const r of R.resume) {
  ok(r.jobIdGuard && r.jobIdGuard.activeRunJobId === r.job,
    `${r.job}: selectedJobId を ${r.jobIdGuard?.changedTo} にしても active_run.jobId = ${r.jobIdGuard?.activeRunJobId}`);
}

section('5. save_version v6・folder save（export/import）往復');
for (const r of R.resume) {
  ok(r.saveVersion === 6, `${r.job}: active_run の save_version 6`);
  ok(r.folder && r.folder.roundTripOk === true, `${r.job}: export → import 往復が成立`);
  ok(r.folder.saveVersion === 6, `${r.job}: バンドルの save_version 6`);
  ok(r.folder.matchesBrowserSave === true, `${r.job}: folder save と browser save の内容が一致`);
}

section('6. ジョブ固有の runtime が復元される');
{
  const fire = R.resume.find((x) => x.job === 'flame_witch');
  const frost = R.resume.find((x) => x.job === 'frost_mage');
  const war = R.resume.find((x) => x.job === 'warrior');
  if (fire) for (const k of ['burning', 'delayed', 'field', 'echoClone']) ok(fire.jobSpecific[k] === true, `火: ${k} の復元確認`);
  if (frost) for (const k of ['chill', 'frozen', 'immunity', 'bossGauge', 'frostbreak']) ok(frost.jobSpecific[k] === true, `氷: ${k} の復元確認`);
  if (war) for (const k of ['fury', 'combo', 'counter', 'deflection', 'duel', 'trance', 'rally', 'poise']) ok(war.jobSpecific[k] === true, `戦士: ${k} の復元確認`);
}

T.finish();
