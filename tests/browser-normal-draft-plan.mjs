// M9-A.2 2/12: 通常 draft 通し run の計画と実測。Node.js 標準機能のみ。
// production の SkillDraftManager / LevelUpScene を通した run であること（固定完成 build の代用でないこと）を検証する。
// 実行: node tests/browser-normal-draft-plan.mjs
import { results, readDoc, runner, JOB_IDS } from './browser-results-common.mjs';

const T = runner('通常 draft 通し run（M9-A.2）');
const { ok, section, info } = T;
const R = results();
const runs = R.draftRuns;

section('1. 最低 9 run・3 ジョブ × 3 strategy・seed が区別されている');
{
  ok(runs.length >= 9, `run 数 ${runs.length} ≥ 9`);
  for (const j of JOB_IDS) {
    const rs = runs.filter((x) => x.job === j);
    ok(rs.length >= 3, `${j}: ${rs.length} run ≥ 3`);
    const strats = new Set(rs.map((x) => x.strategy));
    ok(strats.size >= 3, `${j}: strategy ${strats.size} 種（${[...strats].join(',')}）`);
  }
  const strategies = new Set(runs.map((x) => x.strategy));
  for (const s of ['evolution-first', 'balanced', 'random-valid']) ok(strategies.has(s), `strategy ${s} が実施されている`);
  const seeds = new Set(runs.map((x) => x.seed));
  ok(seeds.size >= 3, `seed ${seeds.size} 種`);
  ok(runs.every((x) => Number.isInteger(x.seed) && x.seed > 0), 'すべての run に整数 seed が記録されている');
}

section('2. production の draft を通っている（固定 build の代用でない）');
for (const r of runs) {
  const tag = `${r.job}/${r.strategy}`;
  ok(r.levelUpSceneSeen > 0, `${tag}: LevelUpScene が実際に起動した（${r.levelUpSceneSeen} 回観測）`);
  ok(r.picks > 0, `${tag}: production の draftPick で ${r.picks} 件取得`);
  ok(r.picks <= r.levelUpSceneSeen, `${tag}: 取得数 ≤ LevelUpScene 観測数（UI を経由している）`);
  ok(Array.isArray(r.pickOrder) && r.pickOrder.length === r.picks, `${tag}: 取得順が記録されている`);
  ok(r.pickOrder.every((p) => typeof p.id === 'string' && typeof p.kind === 'string' && Number.isInteger(p.atSec)),
    `${tag}: 取得順に id / kind / 時刻がある`);
}

section('3. reroll / banish / skip を実仕様で使っている');
{
  const totals = runs.reduce((a, r) => ({ reroll: a.reroll + r.rerolls, banish: a.banish + r.banishes, skip: a.skip + r.skips }), { reroll: 0, banish: 0, skip: 0 });
  info(`reroll ${totals.reroll} / banish ${totals.banish} / skip ${totals.skip}`);
  ok(totals.reroll > 0, 'reroll を実仕様で使用した');
  ok(totals.banish > 0, 'banish を実仕様で使用した');
  ok(totals.skip > 0, 'skip を実仕様で使用した');
  ok(runs.filter((r) => r.rerolls > 0).length >= 3, `reroll を使った run が 3 件以上（${runs.filter((r) => r.rerolls > 0).length}）`);
}

section('4. 全 run の条件が同一（difficulty / 恒久強化 / Job Lv / 倍速）');
for (const r of runs) {
  const tag = `${r.job}/${r.strategy}`;
  ok(r.difficulty === 1, `${tag}: difficulty 1`);
  ok(r.speed === 2, `${tag}: 2 倍速`);
  ok(r.permanentUpgrades === 'none', `${tag}: 恒久強化なし`);
  ok(r.jobLevel === 1, `${tag}: Job Lv 1`);
  ok(r.autoMove === true, `${tag}: オート移動（全 run 同一）`);
  ok(r.debugRun === true, `${tag}: debugRun 分離`);
}

section('5. 長時間の実測である（20 秒確認の代用でない）');
{
  const shortRuns = runs.filter((r) => r.durationGameSec < 60);
  ok(shortRuns.length === 0, `60 ゲーム秒未満の run が無い（${shortRuns.length}）`);
  const med = [...runs.map((r) => r.durationGameSec)].sort((a, b) => a - b)[Math.floor(runs.length / 2)];
  ok(med >= 120, `run 時間の中央値 ${med} ゲーム秒 ≥ 120`);
  const total = runs.reduce((a, r) => a + r.durationGameSec, 0);
  info(`通し run の合計 ${total} ゲーム秒（実時間 ${Math.round(runs.reduce((a, r) => a + r.wallSec, 0))} 秒）`);
  ok(total >= 1200, `合計 ${total} ゲーム秒 ≥ 1200（20 分相当）`);
}

section('6. FPS が gameplay を歪めていない（直列実行の確認）');
for (const r of runs) {
  const tag = `${r.job}/${r.strategy}`;
  ok(r.fps.avg >= 45, `${tag}: 平均 ${r.fps.avg} fps ≥ 45（2 倍速の論理 dt ≒ 33ms を保つ）`);
  ok(r.fps.freezes500ms === 0, `${tag}: 500ms 超のフリーズ 0（${r.fps.freezes500ms}）`);
}

section('7. 記録項目が計画どおり揃っている');
for (const r of runs) {
  const tag = `${r.job}/${r.strategy}`;
  for (const k of ['level', 'kills', 'damage', 'damageTaken', 'topSkill', 'topShare', 'evolutions',
    'bossReached', 'win', 'resultAwarded', 'baseReached', 'rerunOk']) {
    ok(k in r, `${tag}: ${k} が記録されている`);
  }
  ok(typeof r.topSkill === 'string' && r.topSkill.length > 0, `${tag}: top skill = ${r.topSkill}`);
  ok(r.damage > 0 && r.kills > 0, `${tag}: ダメージ ${r.damage} / 撃破 ${r.kills}`);
}

section('8. 計画 docs と実測 strategy / seed が一致している');
{
  const plan = readDoc('docs/browser-longrun-playtest.md');
  for (const s of new Set(runs.map((r) => r.strategy))) ok(plan.includes(s), `計画に strategy ${s} の記載`);
  for (const s of new Set(runs.map((r) => r.seed))) ok(plan.includes(String(s)), `計画に seed ${s} の記載`);
}

T.finish();
