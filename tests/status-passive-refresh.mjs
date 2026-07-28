// M8-B.1 1/6: status passive の即時反映（新規取得）。Node.js 標準機能のみ。
// production の BattleScene.prototype._refreshStatusPassivesIfNeeded() をそのまま呼ぶ。
//
// 対象バグ: 通常のレベルアップで status passive（余寒残留）を取得しても
// `_refreshStatusPassives()` が呼ばれず、StatusEffectManager の乗率が周回中に更新されなかった。
// 実行: node tests/status-passive-refresh.mjs

import { DATA, FROST_PASSIVES, statusPassiveIds, bootRuntime, makeSceneStub, statusMods, expectedStatusMods, runner, readSrc } from './status-passive-common.mjs';

const T = runner('status passive 即時反映（M8-B.1）');
const { ok, section, info } = T;

const mods = await bootRuntime();
const build = (opts = {}) => makeSceneStub(mods, { jobId: 'frost_mage', ...opts });

// ===== 1. 対象 passive の特定（データ由来）=====
section('1. status passive（StatusEffectManager へ乗率を渡す passive）をデータから特定する');
{
  const ids = statusPassiveIds();
  ok(ids.length > 0, `status passive が ${ids.length} 件ある（${ids.join(',')}）`);
  for (const id of ids) ok(FROST_PASSIVES.includes(id), `${id}: 氷術師の passive プールに属する`);
  info(`氷 passive 4 種: ${FROST_PASSIVES.join(', ')}`);
  info(`うち status 乗率を持つもの: ${ids.join(', ')}`);
}

// ===== 2. 未取得（ケース1）=====
section('2. status passive 未取得では恒等値（1, 1）');
{
  const s = build();
  s._refreshStatusPassivesIfNeeded(true);
  const m = statusMods(s.statusFx);
  ok(m.chillDecayMult === 1, `chillDecayMult = 1（実際 ${m.chillDecayMult}）`);
  ok(m.iceStatusDurationMult === 1, `iceStatusDurationMult = 1（実際 ${m.iceStatusDurationMult}）`);
}

// ===== 3. Lv1 取得直後に即反映（ケース2）=====
section('3. status passive Lv1 取得直後に即反映される');
for (const id of statusPassiveIds()) {
  const s = build();
  s._refreshStatusPassivesIfNeeded(true);
  const before = statusMods(s.statusFx);
  // 通常のレベルアップと同じ経路（PassiveManager.acquireOrLevel）。
  s.passives.acquireOrLevel(id);
  const applied = s._refreshStatusPassivesIfNeeded();
  const after = statusMods(s.statusFx);
  const exp = expectedStatusMods({ [id]: 1 });
  ok(applied === true, `${id}: version が変わったので再構築が走る`);
  ok(Math.abs(after.chillDecayMult - exp.chillDecayMult) < 1e-12, `${id} Lv1: chillDecayMult ${before.chillDecayMult} → ${after.chillDecayMult}（期待 ${exp.chillDecayMult}）`);
  ok(Math.abs(after.iceStatusDurationMult - exp.iceStatusDurationMult) < 1e-12, `${id} Lv1: iceStatusDurationMult ${before.iceStatusDurationMult} → ${after.iceStatusDurationMult}（期待 ${exp.iceStatusDurationMult}）`);
  ok(after.chillDecayMult !== before.chillDecayMult || after.iceStatusDurationMult !== before.iceStatusDurationMult,
    `${id}: 取得前と取得後で値が実際に変わる（バグの再発検知）`);
}

// ===== 4. 氷 passive 4 種すべてが取得直後に例外なく処理される =====
section('4. 氷 passive 4 種すべてを取得しても壊れない（status 乗率を持たないものは恒等）');
for (const id of FROST_PASSIVES) {
  const s = build();
  s._refreshStatusPassivesIfNeeded(true);
  s.passives.acquireOrLevel(id);
  s._refreshStatusPassivesIfNeeded();
  const m = statusMods(s.statusFx);
  const exp = expectedStatusMods({ [id]: 1 });
  ok(Math.abs(m.chillDecayMult - exp.chillDecayMult) < 1e-12 && Math.abs(m.iceStatusDurationMult - exp.iceStatusDurationMult) < 1e-12,
    `${id}: 乗率が data の宣言どおり（${JSON.stringify(m)}）`);
  ok(Number.isFinite(m.chillDecayMult) && Number.isFinite(m.iceStatusDurationMult), `${id}: 乗率が有限値`);
}

// ===== 5. 実際の減衰率へ効く（乗率が飾りでないこと）=====
section('5. 反映された乗率が StatusEffectManager の実挙動へ効く');
{
  const s = build();
  s._refreshStatusPassivesIfNeeded(true);
  // 冷気を持つ敵を 1 体作り、1 秒ぶん減衰させる。
  const mkEnemy = () => ({ alive: true, isBoss: false, isElite: false, _chill: 100, _chillSlow: 0, _chillDecayGraceUntil: 0, _frozenUntil: 0, _freezeImmuneUntil: 0 });
  const decayOver = (scene, ms) => {
    const e = mkEnemy();
    scene.statusFx.register('chill', e);
    scene.statusFx.update(ms);
    return e._chill;
  };
  const baseline = decayOver(s, 1000);
  const s2 = build();
  s2.passives.acquireOrLevel('lingering_cold');
  s2.passives.setLevel('lingering_cold', 4);
  s2._refreshStatusPassivesIfNeeded(true);
  const withPassive = decayOver(s2, 1000);
  ok(withPassive > baseline, `余寒残留 Lv4 で冷気が残りやすくなる（${baseline.toFixed(2)} → ${withPassive.toFixed(2)}）`);
  info(`1 秒後の冷気: 未取得 ${baseline.toFixed(2)} / Lv4 ${withPassive.toFixed(2)}`);
}

// ===== 6. 実装がバグの原因箇所を直しているか（構造チェック）=====
section('6. 実装が passives.version を単一トリガーにしている');
{
  const src = readSrc('src/scenes/BattleScene.js');
  ok(/_refreshStatusPassivesIfNeeded\s*\(/.test(src), '_refreshStatusPassivesIfNeeded が実装されている');
  ok(/this\._statusPassiveVersion/.test(src), '最後に反映した version を保持している');
  ok(/this\.passives\.version/.test(src), 'passives.version を参照している');
  // メインループから gate 済みで呼ばれる（無条件の毎フレーム再計算ではない）。
  const upd = src.slice(src.indexOf('  update(time, delta) {'), src.indexOf('  hasTargets()'));
  ok(/_refreshStatusPassivesIfNeeded\(\)/.test(upd), 'メインループから gate 付きで呼ばれる');
  ok(!/_refreshStatusPassives\(\)\s*;/.test(upd), 'メインループから無条件の再構築は呼ばれない');
  // レベルアップ（ドラフト確定）でも即時に呼ばれる。
  const ac = src.slice(src.indexOf('  applyCandidate(c) {'), src.indexOf('  markDebugRun()'));
  ok(/passives\.acquireOrLevel\(c\.id\)/.test(ac), 'applyCandidate が passive を取得する');
  ok(/_refreshStatusPassivesIfNeeded\(\)/.test(ac), 'applyCandidate が status passive を即時反映する');
}

void DATA;
T.finish();
