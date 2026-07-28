// M8-B.1 5/6: ジョブ分離（M8-B.1 §job分離）。Node.js 標準機能のみ。
// - status passive は氷術師の周回でだけ適用される（火の魔女 / 戦士では恒等値）
// - 火 / 戦士の passive が氷術師の status 乗率へ混ざらない
// - ジョブを切り替えても前ジョブの modifier が残らない
// - 周回中のジョブは run 開始時に固定される（active_run の jobId が正）
// 実行: node tests/status-passive-job-isolation.mjs

import { DATA, statusPassiveIds, FROST_PASSIVES, bootRuntime, makeSceneStub, statusMods, expectedStatusMods, runner, readSrc } from './status-passive-common.mjs';

const T = runner('status passive ジョブ分離（M8-B.1）');
const { ok, section, info } = T;

const mods = await bootRuntime();
const build = (jobId) => makeSceneStub(mods, { jobId });
const STATUS_ID = statusPassiveIds()[0];
const JOB_IDS = DATA.jobs.map((j) => j.id);

// ===== 1. データ上のジョブ分離（前提の確認）=====
section('1. status passive は氷術師専用の passive である');
{
  for (const id of statusPassiveIds()) {
    const p = DATA.passives.find((x) => x.id === id);
    ok(Array.isArray(p.jobs) && p.jobs.length === 1 && p.jobs[0] === 'frost_mage', `${id}: jobs=["frost_mage"]`);
    ok(p.isCommon === false, `${id}: 共通 passive ではない`);
  }
  info(`ジョブ: ${JOB_IDS.join(', ')}`);
}

// ===== 2. 氷術師では適用される =====
section('2. 氷術師の周回では status 乗率が適用される');
{
  const s = build('frost_mage');
  s.passives.setLevel(STATUS_ID, 5);
  s._refreshStatusPassivesIfNeeded(true);
  const m = statusMods(s.statusFx);
  const exp = expectedStatusMods({ [STATUS_ID]: 5 });
  ok(Math.abs(m.chillDecayMult - exp.chillDecayMult) < 1e-12, `chillDecayMult ${m.chillDecayMult} = 期待 ${exp.chillDecayMult}`);
  ok(Math.abs(m.iceStatusDurationMult - exp.iceStatusDurationMult) < 1e-12, `iceStatusDurationMult ${m.iceStatusDurationMult} = 期待 ${exp.iceStatusDurationMult}`);
}

// ===== 3. 火の魔女 / 戦士では適用されない（ケース11・12）=====
section('3. 火の魔女 / 戦士の周回では status 乗率が適用されない');
for (const jobId of ['flame_witch', 'warrior']) {
  const s = build(jobId);
  // 通常の抽選では起こらないが、万一 frost passive を持っていても効かないことを確認する。
  s.passives.setLevel(STATUS_ID, 5);
  s._refreshStatusPassivesIfNeeded(true);
  const m = statusMods(s.statusFx);
  ok(m.chillDecayMult === 1, `${jobId}: chillDecayMult = 1（frost passive が効かない）`);
  ok(m.iceStatusDurationMult === 1, `${jobId}: iceStatusDurationMult = 1`);
  ok(s.passives.getLevel(STATUS_ID) === 5, `${jobId}: PassiveManager の level 自体は保持される（適用側だけ遮断）`);
}

// ===== 4. 氷術師の周回で火 / 戦士 passive が status 乗率へ混ざらない =====
section('4. 氷術師の周回で火 / 戦士 passive が status 乗率へ混ざらない');
{
  const flame = DATA.jobs.find((j) => j.id === 'flame_witch').passiveSkillPool;
  const warrior = DATA.jobs.find((j) => j.id === 'warrior').passiveSkillPool;
  const s = build('frost_mage');
  for (const id of [...flame, ...warrior]) s.passives.setLevel(id, 4);
  s._refreshStatusPassivesIfNeeded(true);
  const m = statusMods(s.statusFx);
  ok(m.chillDecayMult === 1 && m.iceStatusDurationMult === 1, `火 ${flame.length} 種 + 戦士 ${warrior.length} 種を持っても status 乗率は恒等（${JSON.stringify(m)}）`);
  // 氷の status passive を足すと、その分だけが乗る。
  s.passives.setLevel(STATUS_ID, 2);
  s._refreshStatusPassivesIfNeeded();
  const exp = expectedStatusMods({ [STATUS_ID]: 2 });
  ok(Math.abs(statusMods(s.statusFx).chillDecayMult - exp.chillDecayMult) < 1e-12, '氷 passive のぶんだけが正しく乗る');
}

// ===== 5. ジョブ切替で前ジョブの modifier が残らない（ケース11・12）=====
section('5. ジョブ切替（周回終了 → タイトル → 別ジョブ）で前ジョブの乗率が残らない');
for (const nextJob of ['flame_witch', 'warrior']) {
  // 氷術師で status passive を最大まで取った周回。
  const frost = build('frost_mage');
  frost.passives.setLevel(STATUS_ID, 5);
  frost._refreshStatusPassivesIfNeeded(true);
  const frostMods = statusMods(frost.statusFx);
  ok(frostMods.iceStatusDurationMult > 1, `氷術師の周回で乗率が入っている（${frostMods.iceStatusDurationMult}）`);

  // 周回終了 → タイトル → 別ジョブで新しい周回（Scene も StatusEffectManager も作り直される）。
  const next = build(nextJob);
  next._refreshStatusPassivesIfNeeded(true);
  const m = statusMods(next.statusFx);
  ok(m.chillDecayMult === 1 && m.iceStatusDurationMult === 1, `frost → ${nextJob}: 前ジョブの乗率が残らない（${JSON.stringify(m)}）`);
  // 万一 profile 側に氷 passive が残っていても効かない。
  next.passives.setLevel(STATUS_ID, 5);
  next._refreshStatusPassivesIfNeeded();
  const m2 = statusMods(next.statusFx);
  ok(m2.chillDecayMult === 1 && m2.iceStatusDurationMult === 1, `frost → ${nextJob}: 氷 passive を持ち込んでも効かない`);
}

// ===== 6. 逆方向（火/戦士 → 氷術師）=====
section('6. 火 / 戦士 → 氷術師 の切替でも正しく適用が始まる');
for (const prevJob of ['flame_witch', 'warrior']) {
  const prev = build(prevJob);
  prev.passives.setLevel(STATUS_ID, 3);
  prev._refreshStatusPassivesIfNeeded(true);
  ok(statusMods(prev.statusFx).iceStatusDurationMult === 1, `${prevJob}: 適用されない`);
  const frost = build('frost_mage');
  frost.passives.setLevel(STATUS_ID, 3);
  frost._refreshStatusPassivesIfNeeded(true);
  const exp = expectedStatusMods({ [STATUS_ID]: 3 });
  ok(Math.abs(statusMods(frost.statusFx).iceStatusDurationMult - exp.iceStatusDurationMult) < 1e-12,
    `${prevJob} → frost_mage: 氷術師の周回では適用される`);
}

// ===== 7. 周回中のジョブは run 開始時に固定（active_run が正）=====
section('7. 周回中のジョブは run 開始時に固定される（active_run.jobId が正）');
{
  const src = readSrc('src/scenes/BattleScene.js');
  ok(/const runJobId = this\.resumeData\?\.jobId;/.test(src), 'active_run の jobId を優先する（既存仕様）');
  ok(/this\.jobId = this\.job\.id/.test(src), 'this.jobId が周回のジョブとして固定される');
  // status passive の適用判定が this.jobId（周回固定値）を見る。
  const fn = src.slice(src.indexOf('  _refreshStatusPassives() {'), src.indexOf('  _refreshStatusPassivesIfNeeded('));
  ok(/this\.jobId === 'frost_mage'/.test(fn), '適用判定に周回固定の jobId を使う');
  ok(!/selectedJobId/.test(fn), 'profile.selectedJobId を直接読まない（周回中の変更を持ち込まない）');
  ok(/chillDecayMult:\s*1,\s*iceStatusDurationMult:\s*1/.test(fn), '非氷術師では明示的に恒等値を書き込む');

  // 途中再開の jobId で判定が切り替わることを実際に確認する。
  const resumedAsFrost = build('frost_mage');
  const resumedAsFlame = build('flame_witch');
  for (const s of [resumedAsFrost, resumedAsFlame]) { s.passives.setLevel(STATUS_ID, 4); s._refreshStatusPassivesIfNeeded(true); }
  ok(statusMods(resumedAsFrost.statusFx).iceStatusDurationMult > 1, 'active_run.jobId=frost_mage なら適用される');
  ok(statusMods(resumedAsFlame.statusFx).iceStatusDurationMult === 1, 'active_run.jobId=flame_witch なら適用されない');
}

// ===== 8. 全ジョブ総当たり =====
section('8. 全ジョブ × 全 passive の総当たりで適用範囲が一貫している');
{
  const allPassives = DATA.passives.map((p) => p.id);
  for (const jobId of JOB_IDS) {
    const s = build(jobId);
    for (const id of allPassives) s.passives.setLevel(id, 5);
    s._refreshStatusPassivesIfNeeded(true);
    const m = statusMods(s.statusFx);
    if (jobId === 'frost_mage') {
      const levels = {}; for (const id of FROST_PASSIVES) levels[id] = 5;
      const exp = expectedStatusMods(levels);
      ok(Math.abs(m.chillDecayMult - exp.chillDecayMult) < 1e-12, `${jobId}: 氷 passive ぶんだけが乗る（${m.chillDecayMult}）`);
    } else {
      ok(m.chillDecayMult === 1 && m.iceStatusDurationMult === 1, `${jobId}: 全 passive を持っても恒等（${JSON.stringify(m)}）`);
    }
  }
}

T.finish();
