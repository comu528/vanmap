// M8-B.1 2/6: status passive の Lv2〜Lv4 強化が即反映されること。Node.js 標準機能のみ。
// - Lv1→Lv2→Lv3→Lv4 の各段で乗率が data どおりに更新される
// - 「現在値への加算」ではなく「現在の passive 所持状態からの完全再構築」であること
//   （同じ level で何度呼んでも値が動かない＝二重適用しない）
// 実行: node tests/status-passive-levelup-refresh.mjs

import { DATA, statusPassiveIds, FROST_PASSIVES, bootRuntime, makeSceneStub, statusMods, expectedStatusMods, runner } from './status-passive-common.mjs';

const T = runner('status passive レベルアップ即時反映（M8-B.1）');
const { ok, section, info } = T;

const mods = await bootRuntime();
const build = () => makeSceneStub(mods, { jobId: 'frost_mage' });
const STATUS_IDS = statusPassiveIds();

// ===== 1. Lv1 → Lv4 の各段で即反映（ケース3・4・5）=====
section('1. Lv1 → Lv2 → Lv3 → Lv4 の各段で乗率が更新される');
for (const id of STATUS_IDS) {
  const def = DATA.passives.find((p) => p.id === id);
  const s = build();
  s._refreshStatusPassivesIfNeeded(true);
  const seen = [];
  for (let lv = 1; lv <= def.maxLevel; lv++) {
    // 通常のレベルアップと同じ経路（acquireOrLevel を 1 段ずつ）。
    const got = s.passives.acquireOrLevel(id);
    ok(got === lv, `${id}: acquireOrLevel で Lv${lv} になる`);
    const applied = s._refreshStatusPassivesIfNeeded();
    ok(applied === true, `${id} Lv${lv}: 強化のたびに再構築が走る`);
    const m = statusMods(s.statusFx);
    const exp = expectedStatusMods({ [id]: lv });
    ok(Math.abs(m.chillDecayMult - exp.chillDecayMult) < 1e-12, `${id} Lv${lv}: chillDecayMult ${m.chillDecayMult.toFixed(4)} = 期待 ${exp.chillDecayMult.toFixed(4)}`);
    ok(Math.abs(m.iceStatusDurationMult - exp.iceStatusDurationMult) < 1e-12, `${id} Lv${lv}: iceStatusDurationMult ${m.iceStatusDurationMult.toFixed(4)} = 期待 ${exp.iceStatusDurationMult.toFixed(4)}`);
    seen.push(`${m.chillDecayMult.toFixed(3)}/${m.iceStatusDurationMult.toFixed(3)}`);
  }
  // 単調に強くなる（減衰は下がる・持続は伸びる）。
  let mono = true;
  for (let lv = 2; lv <= def.maxLevel; lv++) {
    const a = expectedStatusMods({ [id]: lv - 1 });
    const b = expectedStatusMods({ [id]: lv });
    if (b.chillDecayMult > a.chillDecayMult || b.iceStatusDurationMult < a.iceStatusDurationMult) mono = false;
  }
  ok(mono, `${id}: Lv が上がって弱くなる段が無い`);
  info(`${id}: ${seen.join(' → ')}（chillDecay/iceStatusDuration）`);
}

// ===== 2. maxLevel を超えて上がらない =====
section('2. maxLevel を超えて強化されない');
for (const id of STATUS_IDS) {
  const def = DATA.passives.find((p) => p.id === id);
  const s = build();
  for (let i = 0; i < def.maxLevel + 5; i++) s.passives.acquireOrLevel(id);
  s._refreshStatusPassivesIfNeeded(true);
  ok(s.passives.getLevel(id) === def.maxLevel, `${id}: Lv${def.maxLevel} で頭打ち`);
  const m = statusMods(s.statusFx);
  const exp = expectedStatusMods({ [id]: def.maxLevel });
  ok(Math.abs(m.chillDecayMult - exp.chillDecayMult) < 1e-12, `${id}: 上限でも乗率が Lv${def.maxLevel} 相当`);
}

// ===== 3. 完全再構築（現在値への加算ではない）＝二重適用なし（ケース17）=====
section('3. 何回呼んでも値が動かない（現在値への加算ではなく完全再構築）');
for (const id of STATUS_IDS) {
  const s = build();
  s.passives.setLevel(id, 3);
  s._refreshStatusPassivesIfNeeded(true);
  const first = statusMods(s.statusFx);
  // force で 10 回連続して再構築しても値は同じ。
  for (let i = 0; i < 10; i++) s._refreshStatusPassivesIfNeeded(true);
  const after = statusMods(s.statusFx);
  ok(first.chillDecayMult === after.chillDecayMult, `${id}: 10 回 force しても chillDecayMult が変わらない（${after.chillDecayMult}）`);
  ok(first.iceStatusDurationMult === after.iceStatusDurationMult, `${id}: 10 回 force しても iceStatusDurationMult が変わらない`);
  const exp = expectedStatusMods({ [id]: 3 });
  ok(Math.abs(after.chillDecayMult - exp.chillDecayMult) < 1e-12, `${id}: 期待値と一致（累積していない）`);
}

// ===== 4. レベルを下げても正しく戻る（完全再構築の証明）=====
section('4. level を下げると乗率も下がる（差分加算ではない証明）');
for (const id of STATUS_IDS) {
  const s = build();
  s.passives.setLevel(id, 4);
  s._refreshStatusPassivesIfNeeded(true);
  const high = statusMods(s.statusFx);
  s.passives.setLevel(id, 1);
  s._refreshStatusPassivesIfNeeded();
  const low = statusMods(s.statusFx);
  const exp = expectedStatusMods({ [id]: 1 });
  ok(Math.abs(low.chillDecayMult - exp.chillDecayMult) < 1e-12, `${id}: Lv4 → Lv1 で Lv1 相当へ戻る（${high.chillDecayMult.toFixed(3)} → ${low.chillDecayMult.toFixed(3)}）`);
  s.passives.setLevel(id, 0);
  s._refreshStatusPassivesIfNeeded();
  const zero = statusMods(s.statusFx);
  ok(zero.chillDecayMult === 1 && zero.iceStatusDurationMult === 1, `${id}: Lv0 で恒等値へ戻る`);
}

// ===== 5. 他 passive を混ぜても取り違えない =====
section('5. 氷 passive 4 種を同時に持っても status 乗率が正しい');
{
  const s = build();
  const levels = {};
  for (const id of FROST_PASSIVES) { s.passives.setLevel(id, 4); levels[id] = 4; }
  s._refreshStatusPassivesIfNeeded(true);
  const m = statusMods(s.statusFx);
  const exp = expectedStatusMods(levels);
  ok(Math.abs(m.chillDecayMult - exp.chillDecayMult) < 1e-12, `4 種同時: chillDecayMult ${m.chillDecayMult.toFixed(4)} = 期待 ${exp.chillDecayMult.toFixed(4)}`);
  ok(Math.abs(m.iceStatusDurationMult - exp.iceStatusDurationMult) < 1e-12, `4 種同時: iceStatusDurationMult ${m.iceStatusDurationMult.toFixed(4)} = 期待 ${exp.iceStatusDurationMult.toFixed(4)}`);
  info(`氷 passive 全 Lv4: ${JSON.stringify(m)}`);
}

// ===== 6. 下限クランプ（PassiveManager 側の既存仕様が維持されている）=====
section('6. chillDecay の下限クランプ（0.5）が維持されている');
{
  const s = build();
  for (const id of FROST_PASSIVES) s.passives.setLevel(id, 4);
  s._refreshStatusPassivesIfNeeded(true);
  ok(statusMods(s.statusFx).chillDecayMult >= 0.5, 'chillDecayMult が 0.5 以上');
  ok(s.passives.getChillDecayMultiplier() >= 0.5, 'PassiveManager 側の下限も維持');
}

T.finish();
