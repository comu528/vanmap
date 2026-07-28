// M8-B.1 4/6: save / reload と pause / resume（M8-B.1 §save）。Node.js 標準機能のみ。
// - passive levels が保存され、reload 後に「1 回だけ」反映される
// - 継続時と reload 後で乗率が一致する（倍率が二重にならない）
// - pause → resume で二重適用されない
// - 旧セーブ（passiveSkills なし / 未知 id 混じり）でも壊れない
// - save_version は v6 のまま・保存キーが増えていない
// 実行: node tests/status-passive-save-reload.mjs

import { DATA, statusPassiveIds, FROST_PASSIVES, bootRuntime, makeSceneStub, statusMods, expectedStatusMods, runner, readSrc } from './status-passive-common.mjs';

const T = runner('status passive save / reload（M8-B.1）');
const { ok, section, info } = T;

const mods = await bootRuntime();
const build = (opts = {}) => makeSceneStub(mods, { jobId: 'frost_mage', ...opts });
const STATUS_ID = statusPassiveIds()[0];

// ===== 1. passive levels の保存（ケース9）=====
section('1. passive levels が serialize / loadFrom で往復する');
{
  const s = build();
  for (const id of FROST_PASSIVES) s.passives.setLevel(id, 3);
  s.passives.setLevel(STATUS_ID, 5);
  const snap = JSON.parse(JSON.stringify(s.passives.serialize()));
  ok(Object.keys(snap).length === FROST_PASSIVES.length, `${FROST_PASSIVES.length} 件が保存される`);
  ok(snap[STATUS_ID] === 5, `${STATUS_ID} の level が保存される（${snap[STATUS_ID]}）`);

  const t = build();
  t.passives.loadFrom(snap);
  for (const id of FROST_PASSIVES) ok(t.passives.getLevel(id) === snap[id], `${id}: level ${snap[id]} が復元される`);
  info(`保存内容: ${JSON.stringify(snap)}`);
}

// ===== 2. reload 直後に 1 回だけ反映（ケース9）=====
section('2. reload 直後に 1 回だけ反映される');
{
  const s = build();
  s.passives.setLevel(STATUS_ID, 4);
  s._refreshStatusPassivesIfNeeded(true);
  const live = statusMods(s.statusFx);
  const snap = JSON.parse(JSON.stringify(s.passives.serialize()));

  // 新しい Scene（reload）。復元 → 周回開始時の force 反映（BattleScene.create と同じ順）。
  const t = build();
  t.passives.loadFrom(snap);
  const before = t.__rebuilds;
  t._refreshStatusPassivesIfNeeded(true);
  ok(t.__rebuilds === before + 1, `復元時の反映は 1 回だけ（${before} → ${t.__rebuilds}）`);
  const restored = statusMods(t.statusFx);
  ok(restored.chillDecayMult === live.chillDecayMult, `chillDecayMult が継続時と一致（${live.chillDecayMult} / ${restored.chillDecayMult}）`);
  ok(restored.iceStatusDurationMult === live.iceStatusDurationMult, `iceStatusDurationMult が継続時と一致（${live.iceStatusDurationMult} / ${restored.iceStatusDurationMult}）`);
  const exp = expectedStatusMods({ [STATUS_ID]: 4 });
  ok(Math.abs(restored.chillDecayMult - exp.chillDecayMult) < 1e-12, 'data 由来の期待値とも一致');

  // 復元直後にメインループが回っても再構築されない（version 据え置き）。
  let extra = 0;
  for (let i = 0; i < 100; i++) if (t._refreshStatusPassivesIfNeeded()) extra += 1;
  ok(extra === 0, `復元後の 100 フレームで追加の再構築なし（${extra}）`);
}

// ===== 3. 二重適用なし（保存 → 復元 → 保存 → 復元）=====
section('3. 保存 / 復元を繰り返しても倍率が累積しない');
{
  let snap = null;
  let last = null;
  for (let round = 0; round < 5; round++) {
    const s = build();
    if (snap) s.passives.loadFrom(snap);
    else s.passives.setLevel(STATUS_ID, 3);
    s._refreshStatusPassivesIfNeeded(true);
    const m = statusMods(s.statusFx);
    if (last) {
      ok(m.chillDecayMult === last.chillDecayMult && m.iceStatusDurationMult === last.iceStatusDurationMult,
        `${round + 1} 回目の復元でも乗率が同じ（${JSON.stringify(m)}）`);
    }
    last = m;
    snap = JSON.parse(JSON.stringify(s.passives.serialize()));
  }
  const exp = expectedStatusMods({ [STATUS_ID]: 3 });
  ok(Math.abs(last.chillDecayMult - exp.chillDecayMult) < 1e-12, '5 回往復しても Lv3 相当のまま（累積なし）');
}

// ===== 4. pause / resume（ケース10）=====
section('4. pause → resume で二重適用されない');
{
  const s = build();
  s.passives.setLevel(STATUS_ID, 2);
  s._refreshStatusPassivesIfNeeded(true);
  const before = statusMods(s.statusFx);
  const rebuildsBefore = s.__rebuilds;
  // pause 中は BattleScene.update が早期 return する＝ gate 呼び出しが起きない。
  // resume 後にメインループが回っても、passive が変わっていなければ再構築されない。
  for (let i = 0; i < 200; i++) s._refreshStatusPassivesIfNeeded();
  const after = statusMods(s.statusFx);
  ok(s.__rebuilds === rebuildsBefore, `resume 後も再構築 0 回（${rebuildsBefore}）`);
  ok(before.chillDecayMult === after.chillDecayMult && before.iceStatusDurationMult === after.iceStatusDurationMult,
    '乗率が変わらない（二重適用なし）');
  // pause 中に passive を取得したケース（レベルアップ画面）→ resume 後の最初のフレームで 1 回だけ反映。
  s.passives.acquireOrLevel(STATUS_ID);
  let applied = 0;
  for (let i = 0; i < 50; i++) if (s._refreshStatusPassivesIfNeeded()) applied += 1;
  ok(applied === 1, `一時停止中の取得は resume 後の 1 フレームで 1 回だけ反映（${applied}）`);
  const exp = expectedStatusMods({ [STATUS_ID]: 3 });
  ok(Math.abs(statusMods(s.statusFx).chillDecayMult - exp.chillDecayMult) < 1e-12, 'Lv3 相当が反映される');
}

// ===== 5. 旧セーブ / 壊れたセーブ（ケース13）=====
section('5. 旧セーブ・未知 id・不正値でも壊れない');
{
  const cases = [
    ['passiveSkills なし（旧セーブ）', null],
    ['空オブジェクト', {}],
    ['未知 id', { __unknown_passive__: 3 }],
    ['他ジョブの passive', { power_amp: 4, brute_force: 2 }],
    ['不正な level', { [STATUS_ID]: 'x' }],
    ['負の level', { [STATUS_ID]: -5 }],
    ['巨大な level', { [STATUS_ID]: 9999 }],
  ];
  for (const [label, snap] of cases) {
    let threw = null;
    const s = build();
    try {
      s.passives.loadFrom(snap);
      s._refreshStatusPassivesIfNeeded(true);
    } catch (e) { threw = e; }
    ok(!threw, `${label}: 例外を出さない（${threw ? threw.message : 'ok'}）`);
    const m = statusMods(s.statusFx);
    ok(Number.isFinite(m.chillDecayMult) && Number.isFinite(m.iceStatusDurationMult), `${label}: 乗率が有限値（${JSON.stringify(m)}）`);
    ok(m.chillDecayMult >= 0.5, `${label}: 下限クランプが効く`);
  }
  // 未知 id は無視され、既知 id だけが復元される。
  const s = build();
  s.passives.loadFrom({ __unknown__: 3, [STATUS_ID]: 2 });
  s._refreshStatusPassivesIfNeeded(true);
  ok(s.passives.getLevel(STATUS_ID) === 2, '既知 id は復元される');
  ok(s.passives.getLevel('__unknown__') === 0, '未知 id は無視される');
  const exp = expectedStatusMods({ [STATUS_ID]: 2 });
  ok(Math.abs(statusMods(s.statusFx).chillDecayMult - exp.chillDecayMult) < 1e-12, '未知 id が混ざっても乗率は正しい');
}

// ===== 6. save_version / 保存キーが増えていない =====
section('6. save_version は v6 のまま・保存キーを増やしていない');
{
  const src = readSrc('src/systems/BattleManager.js');
  const start = src.indexOf('buildRunSnapshot() {');
  const body = src.slice(start, src.indexOf('\n  }', start));
  ok(/passiveSkills:\s*s\.passives\s*\?\s*s\.passives\.serialize\(\)/.test(body), 'passive levels は従来どおり passiveSkills へ保存される');
  ok(!/statusPassiveVersion|_statusPassive/.test(body), 'M8-B.1 で保存キーを追加していない（version は復元時に再生成する）');
  ok(!/saveVersion\s*:\s*7|save_version:\s*7/.test(src), 'save_version を 7 へ上げていない');
  const bal = DATA.balance;
  ok(bal.saveVersion === 6, `balance.json の saveVersion が 6（実際 ${bal.saveVersion}）`);
  info('version は保存せず、復元時に PassiveManager から再生成する（旧セーブ互換）');
}

// ===== 7. RNG を消費しない =====
section('7. status passive の再構築が RNG を消費しない');
{
  const s = build();
  const rngBefore = s.statusFx.rng.serialize();
  for (let i = 0; i < 20; i++) {
    s.passives.acquireOrLevel(STATUS_ID);
    s._refreshStatusPassivesIfNeeded();
  }
  s._refreshStatusPassivesIfNeeded(true);
  const rngAfter = s.statusFx.rng.serialize();
  ok(rngBefore.cursor === rngAfter.cursor, `status RNG cursor が変わらない（${rngBefore.cursor} → ${rngAfter.cursor}）`);
  ok(rngBefore.seed === rngAfter.seed, 'status RNG seed が変わらない');
}

T.finish();
