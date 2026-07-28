// M8-B.1 3/6: version gating（無駄な再計算をしない / 取りこぼさない）。Node.js 標準機能のみ。
// - passives.version が同じフレームでは再構築しない（毎フレーム無条件の再計算は禁止）
// - version が変わったときだけ「1 回だけ」再構築する
// - active / evolution の取得だけでは再構築しない
// - PassiveManager インスタンスが差し替わったら（F8 検証周回）必ず再構築する
// 実行: node tests/status-passive-version-gating.mjs

import { DATA, statusPassiveIds, bootRuntime, makeSceneStub, statusMods, runner, readSrc } from './status-passive-common.mjs';

const T = runner('status passive version gating（M8-B.1）');
const { ok, section, info } = T;

const mods = await bootRuntime();
const build = (opts = {}) => makeSceneStub(mods, { jobId: 'frost_mage', ...opts });
const STATUS_ID = statusPassiveIds()[0];

// ===== 1. PassiveManager が version を持ち、level 変更で増える =====
section('1. PassiveManager.version が単一トリガーとして使える');
{
  const s = build();
  const v0 = s.passives.version;
  ok(typeof v0 === 'number', `version が数値（${v0}）`);
  s.passives.acquireOrLevel(STATUS_ID);
  ok(s.passives.version > v0, `passive 取得で version が増える（${v0} → ${s.passives.version}）`);
  const v1 = s.passives.version;
  s.passives.setLevel(STATUS_ID, 3);
  ok(s.passives.version > v1, `setLevel でも version が増える（${v1} → ${s.passives.version}）`);
  const v2 = s.passives.version;
  s.passives.acquireOrLevel('__does_not_exist__');
  ok(s.passives.version === v2, '未知 id では version が増えない');
}

// ===== 2. 未変更フレームでは再構築しない（ケース6・14）=====
section('2. passive 未変更のフレームでは再構築しない');
{
  const s = build();
  s._refreshStatusPassivesIfNeeded(true);
  const base = s.__rebuilds;
  for (let i = 0; i < 600; i++) {
    const applied = s._refreshStatusPassivesIfNeeded();
    if (applied) { ok(false, `フレーム ${i} で不要な再構築が起きた`); break; }
  }
  ok(s.__rebuilds === base, `600 フレーム回しても再構築 0 回（${base} のまま）`);
  info('毎フレーム無条件の再集計をしていない');
}

// ===== 3. version 変更時だけ 1 回だけ再構築（ケース15）=====
section('3. version が変わったときだけ 1 回だけ再構築する');
{
  const s = build();
  s._refreshStatusPassivesIfNeeded(true);
  const base = s.__rebuilds;
  // 1 回 passive を強化 → その後 100 フレーム回す。
  s.passives.acquireOrLevel(STATUS_ID);
  let applied = 0;
  for (let i = 0; i < 100; i++) if (s._refreshStatusPassivesIfNeeded()) applied += 1;
  ok(applied === 1, `100 フレーム中で再構築は 1 回だけ（実際 ${applied}）`);
  ok(s.__rebuilds === base + 1, `再構築の総数が +1（${base} → ${s.__rebuilds}）`);
  // 5 回強化 → 5 回だけ再構築。
  const before = s.__rebuilds;
  let n = 0;
  for (let k = 0; k < 5; k++) {
    s.passives.acquireOrLevel(STATUS_ID);
    for (let i = 0; i < 20; i++) if (s._refreshStatusPassivesIfNeeded()) n += 1;
  }
  ok(n === 5, `5 段の強化に対して再構築は 5 回（実際 ${n}）`);
  ok(s.__rebuilds === before + 5, '再構築の総数も 5 増える');
}

// ===== 4. active / evolution の取得だけでは再構築しない（ケース7・8）=====
section('4. active skill / evolution の取得だけでは再構築しない');
{
  const { SkillManager } = mods;
  // SkillManager を動かすための最小 scene（passive とは無関係）。
  const sceneForSkills = {
    time: { now: 0, delayedCall: () => ({}) },
    add: new Proxy({}, { get: () => () => ({}) }),
    tweens: { add: () => ({}) }, effects: new Proxy({}, { get: () => () => {} }),
    player: { x: 0, y: 0, alive: true, hp: 100, maxHp: 100 },
    passives: null, jobMods: null, combat: new Proxy({}, { get: () => () => 0 }),
    gameOver: false, _m: { suppressed: 0 },
  };
  const s = build();
  sceneForSkills.passives = s.passives;
  const sm = new SkillManager(sceneForSkills);
  sceneForSkills.skills = sm;
  s._refreshStatusPassivesIfNeeded(true);
  const base = s.__rebuilds;
  const vBefore = s.passives.version;

  // active を取得・レベルアップ・進化させる（氷術師のスキル）。
  sm.acquireOrLevel('frost_shard');
  sm.setLevel('frost_shard', 8);
  sm.acquireOrLevel('frost_nova');
  ok(s.passives.version === vBefore, 'active の取得・強化では passives.version が変わらない');
  let applied = 0;
  for (let i = 0; i < 50; i++) if (s._refreshStatusPassivesIfNeeded()) applied += 1;
  ok(applied === 0, `active 取得のみでは再構築が走らない（${applied} 回）`);

  // 進化（補助 passive を取らずに直接進化させる＝進化そのものの影響を見る）。
  const evoId = sm.evolve('frost_shard');
  ok(!!evoId, `進化が成立する（${evoId}）`);
  ok(s.passives.version === vBefore, '進化でも passives.version が変わらない');
  for (let i = 0; i < 50; i++) if (s._refreshStatusPassivesIfNeeded()) applied += 1;
  ok(applied === 0, '進化取得のみでも再構築が走らない');
  ok(s.__rebuilds === base, `再構築の総数が変わらない（${base}）`);
}

// ===== 5. force は version に関わらず必ず再構築する =====
section('5. force=true は version に関わらず必ず再構築する');
{
  const s = build();
  s._refreshStatusPassivesIfNeeded(true);
  const base = s.__rebuilds;
  for (let i = 0; i < 5; i++) ok(s._refreshStatusPassivesIfNeeded(true) === true, `force ${i + 1} 回目で再構築される`);
  ok(s.__rebuilds === base + 5, '5 回の force で 5 回再構築される');
  // それでも値は同じ（完全再構築なので二重適用にならない）。
  const m = statusMods(s.statusFx);
  ok(m.chillDecayMult === 1 && m.iceStatusDurationMult === 1, '未取得なら force を繰り返しても恒等値のまま');
}

// ===== 6. PassiveManager 差し替え時の取りこぼし防止（F8 検証周回）=====
section('6. PassiveManager を作り直しても取りこぼさない');
{
  const s = build();
  s.passives.setLevel(STATUS_ID, 5);
  s._refreshStatusPassivesIfNeeded(true);
  ok(statusMods(s.statusFx).iceStatusDurationMult > 1, '強化済みの乗率が入っている');
  const oldVersion = s.passives.version;
  // F8「検証開始」と同じく PassiveManager を作り直す（passive は未取得へ戻る）。
  const fresh = new mods.PassiveManager(null);
  fresh.setDefs(DATA.passives, DATA.skillConfig);
  // version がたまたま一致するケースを作る（取りこぼしの再現条件）。
  fresh.version = oldVersion;
  s.passives = fresh;
  const applied = s._refreshStatusPassivesIfNeeded();
  ok(applied === true, 'インスタンスが変わったので version が同じでも再構築する');
  const m = statusMods(s.statusFx);
  ok(m.chillDecayMult === 1 && m.iceStatusDurationMult === 1, '新しい PassiveManager の状態（未取得）が反映される');
}

// ===== 7. 呼び出し箇所の監査（gate 済みで呼ばれているか）=====
section('7. 呼び出し箇所が gate 済み経路に揃っている');
{
  const src = readSrc('src/scenes/BattleScene.js');
  // 直接呼び（_refreshStatusPassives()）はメソッド定義と gate 内部だけ。
  const direct = [...src.matchAll(/this\._refreshStatusPassives\(\)/g)].length;
  ok(direct === 1, `_refreshStatusPassives() の直接呼び出しは gate 内部の 1 か所だけ（実際 ${direct}）`);
  const gated = [...src.matchAll(/_refreshStatusPassivesIfNeeded\(/g)].length;
  ok(gated >= 6, `gate 経由の呼び出しが ${gated} か所ある`);
  // 周回開始 / 検証周回開始 / F9 は force。
  ok(/_refreshStatusPassivesIfNeeded\(true\)/.test(src), 'force 付きの呼び出しがある（周回開始・復元・検証周回）');
  info(`直接呼び ${direct} / gate 経由 ${gated}`);
}

T.finish();
