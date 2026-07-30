// 戦士 完成監査 7/23: cooldown 保存の重点監査 全 48 件（M8-F §10）。Node.js 標準機能のみ。
// 火 M8-A で 21 件の保存漏れが出た欠陥クラスを戦士 48 件で潰す。
//   - 0 / 中間 / 最大付近の CD が往復する
//   - 攻撃速度 / 修羅の構え / 闘気解放で CD が変わっても保存が壊れない
//   - 一時停止・可変 dt・保存 → 復元 → 続行で無料 cast が出ない
//   - 改ざん値（負数 / NaN / Infinity / 文字列 / 桁外れ）で `_cd` が壊れない
//   - 進化置換の前後で CD が混ざらない
// 実行: node tests/warrior-completion-cooldown-save.mjs

import { DATA, WARRIOR, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, readSrc, runner } from './warrior-common.mjs';
import { MAX_RESTORED_CD_MS } from '../src/skills/WarriorSkillBase.js';

const T = runner('戦士 cooldown 保存 全 48 件（M8-F）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ALL = [...WARRIOR.activeSkillPool, ...WARRIOR.evolutionPool];
const build = (o = {}) => {
  const enemies = makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, boss: makeBoss({ x: 470, y: 300, hp: 1e9 }), now: 10000, quality: 'high', enemyBullets: [] });
  const w = makeWarrior(WarriorCombatSystem, scene, o);
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (c, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) { c.sm.update(step, { hasEnemies: true }); c.w.update(step); c.scene.advance(step); }
};

// ===== 1. 0 / 中間 / 最大付近 =====
section('1. 0 / 中間 / 最大付近の CD が往復する');
for (const id of ALL) {
  const c = build(); c.sm.acquireOrLevel(id);
  const sk = c.sm.skills.get(id);
  const cd = (sk.stats && sk.stats.cooldown) || 1000;
  for (const v of [0, Math.round(cd / 2), cd, cd - 1]) {
    sk._cd = v;
    const s = sk.serializeState();
    ok(s.cdLeft === v, `${id}: cdLeft=${v} を保存する`);
    const c2 = build(); c2.sm.acquireOrLevel(id);
    const sk2 = c2.sm.skills.get(id);
    sk2.restoreState(s);
    ok(sk2._cd === v, `${id}: cdLeft=${v} を復元する`);
  }
}

// ===== 2. 復元直後に無料発動しない =====
section('2. 復元直後に無料 cast が出ない（CD が残っていれば撃たない）');
for (const id of ALL) {
  const c = build(); c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  const sk = c.sm.skills.get(id);
  const cd = (sk.stats && sk.stats.cooldown) || 1000;
  sk.restoreState({ cdLeft: cd });
  const before = (c.sm.statsList().find((x) => x.id === id) || {}).casts || 0;
  // CD の 8 割ぶんだけ進める（まだ撃てない）。
  run(c, Math.max(32, Math.floor(cd * 0.8)));
  const after = (c.sm.statsList().find((x) => x.id === id) || {}).casts || 0;
  ok(after === before, `${id}: CD 中は 1 度も撃たない（${before} → ${after}）`);
  // CD を越えれば撃つ。
  run(c, cd + 200);
  const later = (c.sm.statsList().find((x) => x.id === id) || {}).casts || 0;
  ok(later > after, `${id}: CD 後は撃てる（${later}）`);
}

// ===== 3. 攻撃速度 / 構え / 解放で CD が変わっても壊れない =====
section('3. 攻撃速度 / 修羅の構え / 闘気解放でも保存 / 復元が壊れない');
for (const id of ALL) {
  for (const mode of ['trance', 'release', 'combo']) {
    const c = build();
    c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
    if (mode === 'trance') c.w.beginBattleTrance('t', { durationMs: 9000, attackSpeedBonus: DATA.balance.warrior.trance.maxAttackSpeedBonus });
    if (mode === 'release') { for (let i = 0; i < 40; i++) { c.w.addFury(1e9); c.scene.advance(1100); c.w.update(1100); } }
    if (mode === 'combo') for (let i = 0; i < 200; i++) c.w.addCombo(1);
    run(c, 4000);
    const sk = c.sm.skills.get(id);
    const s = sk.serializeState();
    ok(Number.isFinite(s.cdLeft), `${id}/${mode}: cdLeft が有限（${s.cdLeft.toFixed(1)}）`);
    sk.restoreState(s);
    ok(Number.isFinite(sk._cd), `${id}/${mode}: 復元後も有限`);
  }
}

// ===== 4. 改ざん耐性 =====
section('4. 改ざん / 破損した保存値で `_cd` が壊れない');
for (const id of ALL) {
  const c = build(); c.sm.acquireOrLevel(id);
  const sk = c.sm.skills.get(id);
  for (const v of [NaN, Infinity, -Infinity, 'x', null, undefined, {}, [], true]) {
    sk._cd = 500;
    sk.restoreState({ cdLeft: v });
    ok(sk._cd === 500, `${id}: cdLeft=${String(v)} は採用されない（_cd=${sk._cd}）`);
  }
  for (const [v, want] of [[1e12, MAX_RESTORED_CD_MS], [-1e12, -MAX_RESTORED_CD_MS]]) {
    sk.restoreState({ cdLeft: v });
    ok(sk._cd === want, `${id}: cdLeft=${v} は ${want} へクランプ`);
  }
  // 通常の負数（発動できないフレームで少しだけ負になる）はそのまま往復する。
  sk.restoreState({ cdLeft: -32 });
  ok(sk._cd === -32, `${id}: 通常の負数はそのまま往復する`);
}

// ===== 5. 保存キーの欠落 / 未知キー =====
section('5. 保存キーの欠落 / 未知キーで例外にならない');
for (const id of ALL) {
  const c = build(); c.sm.acquireOrLevel(id);
  const sk = c.sm.skills.get(id);
  for (const bad of [null, undefined, {}, { unknown: 1 }, { cdLeft: 100, unknown: 'x' }]) {
    let threw = false;
    try { sk.restoreState(bad); } catch (e) { threw = true; info(`${id}: restoreState(${JSON.stringify(bad)}) で例外 ${e.message}`); }
    ok(!threw, `${id}: restoreState(${JSON.stringify(bad)}) が例外にならない`);
    ok(Number.isFinite(sk._cd), `${id}: _cd が有限のまま`);
  }
}

// ===== 6. 進化置換の前後で CD が混ざらない =====
section('6. 進化置換の前後で CD が混ざらない');
{
  const recipes = DATA.evolutions.filter((e) => WARRIOR.evolutionPool.includes(e.id));
  for (const e of recipes) {
    const c = build();
    c.sm.acquireOrLevel(e.baseSkillId); c.sm.setLevel(e.baseSkillId, 8);
    run(c, 3000);
    const baseCd = c.sm.skills.get(e.baseSkillId)._cd;
    c.sm.evolve(e.baseSkillId);
    const evo = c.sm.skills.get(e.id);
    ok(!!evo, `${e.id}: 置換後のスキルがある`);
    ok(evo._cd !== baseCd || baseCd === 0, `${e.id}: base の CD をそのまま引き継がない（base ${baseCd.toFixed(0)} / evo ${evo._cd.toFixed(0)}）`);
    ok(Number.isFinite(evo._cd) && evo._cd >= 0, `${e.id}: 置換直後の CD が有限で非負（${evo._cd.toFixed(0)}）`);
  }
}

// ===== 7. 一時停止 / 可変 dt =====
section('7. 一時停止（dt=0）と可変 dt で CD が壊れない');
for (const id of ALL) {
  const c = build(); c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  for (let i = 0; i < 50; i++) { c.sm.update(0, { hasEnemies: true }); c.w.update(0); }
  const sk = c.sm.skills.get(id);
  ok(Number.isFinite(sk._cd), `${id}: dt=0 で CD が壊れない（${sk._cd}）`);
  for (const dt of [1, 7, 16, 33, 100, 250]) { c.sm.update(dt, { hasEnemies: true }); c.w.update(dt); c.scene.advance(dt); }
  ok(Number.isFinite(sk._cd), `${id}: 可変 dt でも CD が有限`);
}

// ===== 8. 共通経路にまとまっている =====
section('8. 保存値のクランプが 1 か所に集約されている');
{
  const wb = readSrc('src/skills/WarriorSkillBase.js');
  ok(/restoreCd\s*\(value\)/.test(wb), 'WarriorSkillBase に restoreCd がある');
  ok(/MAX_RESTORED_CD_MS/.test(wb), '上限が定数で定義されている');
  ok(MAX_RESTORED_CD_MS > 20000, `上限 ${MAX_RESTORED_CD_MS}ms が最長 cooldown より十分大きい`);
  // 戦士 48 件のどれも生の代入をしていない。
  const map = (await import('./warrior-common.mjs')).registryMap();
  const seen = new Set();
  for (const id of ALL) {
    const f = `src/skills/${map[id]}.js`;
    if (seen.has(f)) continue; seen.add(f);
    const src = readSrc(f);
    if (!src.includes('cdLeft')) continue;
    ok(!/this\._cd = (?:st|s)\.cdLeft/.test(src), `${map[id]}: 生の cdLeft 代入をしていない（restoreCd 経由）`);
  }
  info(`cdLeft を保存する戦士スキルファイル: ${seen.size} 件`);
}

T.finish();
