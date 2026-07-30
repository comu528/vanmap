// 戦士 Wave1 16/19: 品質別上限（M8-C §19）。Node.js 標準機能のみ。
// M8-C で追加した 20 件の skillCaps を対象に、次を機械的に固定する。
//   - 4 品質すべてで定義され、正の整数で、low ≤ medium ≤ high ≤ ultra
//   - すべて実装から参照される（未参照 cap の禁止）
//   - 演出上限とダメージ / イベント上限が別物である
//   - low 品質でも戦闘ロジック（ダメージ・闘気・コンボ・処刑・反撃）が止まらない
//   - 品質を下げても上げても壊れない（例外・NaN・無限ループなし）
// 実行: node tests/warrior-wave1-quality-cap.mjs

import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, allSrc, capFor } from './warrior-common.mjs';
import { capTiers } from './cap-shape.mjs';

const T = runner('戦士 Wave1 品質別上限（M8-C）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const QUALITIES = ['low', 'medium', 'high', 'ultra'];
const SKILL = (id) => DATA.skills.find((x) => x.id === id);
const WAVE1 = [...EXPECTED.wave1Actives, ...EXPECTED.wave1Evolutions];

// M8-C で追加した cap。ダメージ / イベント系（実挙動を抑える）と演出系（見た目だけ）を分けて宣言する。
const DAMAGE_CAPS = [
  'maxOverheadStrikes', 'maxTwinFangStrikes', 'maxExecutesPerCast', 'maxLeapImpacts',
  'maxSweepStrikesPerFrame', 'maxCounterWindows', 'maxChainPullsPerCast',
  'maxRelentlessStrikes', 'maxRelentlessRetargets',
];
const VISUAL_CAPS = [
  'maxOverheadSlashVisuals', 'maxTwinSlashVisuals', 'maxExecuteMarkers', 'maxLeapTrails',
  'maxLandingDebris', 'maxSweepTrails', 'maxCounterFlashes', 'maxWarCryRings',
  'maxChainHookLines', 'maxStompDebris', 'maxRelentlessSparks',
];
const NEW_CAPS = [...DAMAGE_CAPS, ...VISUAL_CAPS];

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(24, { x: 320, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000, quality: opts.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, opts);
  const sm = new SkillManager(scene);
  scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (ctx, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    ctx.sm.update(step, { hasEnemies: true });
    ctx.w.setHp(ctx.scene.player.hp, ctx.scene.player.maxHp);
    ctx.w.update(step);
    ctx.scene.advance(step);
    if (i % 25 === 12) ctx.scene.onWarriorHit(60, 40);
  }
};

// ===== 1. 定義の健全性 =====
section(`1. M8-C の ${NEW_CAPS.length} 件の cap が 4 品質で定義され、単調・正の整数である`);
for (const name of NEW_CAPS) {
  const c = DATA.balance.skillCaps[name];
  ok(!!c, `${name}: balance.json に定義がある`);
  if (!c) continue;
  const t4 = capTiers(c);  // M9-A: gameplay / safety は単一値、visual は 4 段階
  for (const q of QUALITIES) {
    ok(Number.isFinite(t4[q]), `${name}.${q} が数値`);
    ok(t4[q] > 0, `${name}.${q} = ${t4[q]} > 0`);
    ok(Number.isInteger(t4[q]), `${name}.${q} が整数`);
  }
  ok(t4.low <= t4.medium && t4.medium <= t4.high && t4.high <= t4.ultra,
    `${name}: low(${t4.low}) ≤ medium(${t4.medium}) ≤ high(${t4.high}) ≤ ultra(${t4.ultra})`);
}

// ===== 2. 未参照 cap の禁止 =====
section('2. 追加した cap がすべて実装から参照される（死に cap なし）');
{
  const src = allSrc();
  for (const name of NEW_CAPS) {
    ok(src.includes(`'${name}'`) || src.includes(`"${name}"`), `${name}: 実装から参照されている`);
  }
  // 逆に、balance.json 全体でも未参照の cap を作っていないこと。
  const unused = Object.keys(DATA.balance.skillCaps)
    .filter((n) => !src.includes(`'${n}'`) && !src.includes(`"${n}"`));
  ok(unused.length === 0, `未参照 cap が 0 件（${unused.join(',') || 'なし'}）`);
  info(`skillCaps 総数 ${Object.keys(DATA.balance.skillCaps).length} 件 / M8-C 追加 ${NEW_CAPS.length} 件`);
}

// ===== 3. 全 cap の単調性（非回帰）=====
section('3. 火 / 氷を含む全 cap の単調性を壊していない');
{
  const names = Object.keys(DATA.balance.skillCaps);
  ok(names.length >= 185, `skillCaps 総数 ${names.length} ≥ 185`);
  let bad = 0, nonPositive = 0;
  for (const name of names) {
    const c = capTiers(DATA.balance.skillCaps[name]);
    if (!(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra)) bad++;
    if (QUALITIES.some((q) => !(c[q] > 0))) nonPositive++;
  }
  ok(bad === 0, `全 ${names.length} cap が単調（違反 ${bad} 件）`);
  ok(nonPositive === 0, `全 cap が正（違反 ${nonPositive} 件）`);
}

// ===== 4. 演出 cap とダメージ cap が別物 =====
section('4. 演出上限とダメージ / イベント上限が別の名前で分かれている');
{
  for (const v of VISUAL_CAPS) ok(!DAMAGE_CAPS.includes(v), `${v}: 演出専用（ダメージ cap と混同していない）`);
  // 演出 cap を 1 に落としてもダメージ・命中は変わらない（演出だけ削れる）。
  const measure = (patch) => {
    const ctx = build({ quality: 'high' });
    const origCap = ctx.scene.combat.skillCap;
    ctx.scene.combat.skillCap = (n, f) => (patch.includes(n) ? 1 : origCap(n, f));
    for (const id of EXPECTED.wave1Actives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
    run(ctx, 12000);
    const s = ctx.sm.statsList();
    return { hits: s.reduce((a, x) => a + (x.hits || 0), 0), dmg: s.reduce((a, x) => a + (x.damage || 0), 0) };
  };
  const base = measure([]);
  const noVisual = measure(VISUAL_CAPS);
  ok(noVisual.hits === base.hits, `演出 cap を 1 にしても命中数が変わらない（${base.hits}）`);
  ok(Math.abs(noVisual.dmg - base.dmg) < 1e-6, `演出 cap を 1 にしてもダメージが変わらない（${Math.round(base.dmg)}）`);
  info(`演出 cap の影響なし: 命中 ${base.hits} / ダメージ ${Math.round(base.dmg)}`);
}

// ===== 5. low 品質でもロジックが止まらない =====
section('5. low 品質でもダメージ・闘気・コンボが発生する');
for (const id of WAVE1) {
  const ctx = build({ quality: 'low', mods: { killHealMult: 1 } });
  ctx.sm.acquireOrLevel(id);
  if (SKILL(id)) ctx.sm.setLevel(id, 8);
  run(ctx, 12000);
  const s = ctx.sm.statsList().find((x) => x.id === id) || {};
  ok((s.casts || 0) > 0, `${id}: low でも発動する（${s.casts}）`);
  // 構え系は被弾で反撃するので、命中は反撃経由で発生する。
  ok((s.hits || 0) > 0, `${id}: low でも命中する（${s.hits}）`);
  ok((s.damage || 0) > 0, `${id}: low でもダメージが出る（${Math.round(s.damage)}）`);
  // 闘気獲得が data 上 0 のスキル（金剛迎撃の反撃など）は対象外。
  const grantsFury = ctx.scene._warriorSkillStats[id] && (ctx.scene._warriorSkillStats[id].furyGain || 0) > 0;
  if (grantsFury) ok(ctx.w.telemetry.furyGained > 0, `${id}: low でも闘気が溜まる`);
  else ok(true, `${id}: 闘気獲得を持たない設計（data 上 0）`);
}

// ===== 6. 4 品質すべてで例外・NaN が出ない =====
section('6. 4 品質すべてで例外・NaN・座標崩壊が起きない');
for (const q of QUALITIES) {
  let threw = null;
  const ctx = build({ quality: q, boss: makeBoss({ hp: 1e9 }), mods: { killHealMult: 1 } });
  try {
    for (const id of WAVE1) { ctx.sm.acquireOrLevel(id); if (SKILL(id)) ctx.sm.setLevel(id, 8); }
    run(ctx, 20000);
  } catch (e) { threw = e; }
  ok(!threw, `${q}: 例外なし（${threw ? threw.message : 'ok'}）`);
  ok(Number.isFinite(ctx.scene.player.x) && Number.isFinite(ctx.scene.player.y), `${q}: プレイヤー座標が有限`);
  ok(ctx.enemies.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.hp)), `${q}: 敵の座標・HP が有限`);
  ok(Number.isFinite(ctx.w.fury) && Number.isFinite(ctx.w.combo), `${q}: 闘気・コンボが有限`);
  const s = ctx.sm.statsList();
  ok(s.every((x) => Number.isFinite(x.damage || 0)), `${q}: 全スキルのダメージが有限`);
}

// ===== 7. ダメージ cap が実際に打撃数を抑える =====
section('7. ダメージ / イベント cap が実際に上限として効く');
{
  const cases = [
    { id: 'armor_breaker', cap: 'maxOverheadStrikes', key: 'strikes' },
    { id: 'twin_fang_slash', cap: 'maxTwinFangStrikes', key: 'strikes' },
    { id: 'relentless_combo', cap: 'maxRelentlessStrikes', key: 'plannedStrikes' },
  ];
  for (const c of cases) {
    for (const q of QUALITIES) {
      const cap = capFor(c.cap, q, 99);
      const ctx = build({ quality: q });
      ctx.sm.acquireOrLevel(c.id); ctx.sm.setLevel(c.id, 8);
      const sk = ctx.sm.skills.get(c.id);
      sk.strikeCount = () => 999; // cap を無視しようとしても止まる
      run(ctx, 12000);
      const s = ctx.sm.statsList().find((x) => x.id === c.id) || {};
      ok((s.extra?.[c.key] || 0) <= (s.casts || 0) * cap,
        `${c.id}/${q}: ${c.key} ${s.extra?.[c.key]} ≤ cap${cap} × cast${s.casts}`);
    }
  }
}

// ===== 8. 反撃・引き寄せの cap =====
section('8. 反撃・引き寄せの cap も 4 品質で効く');
for (const q of QUALITIES) {
  const counterCap = capFor('maxCounterWindows', q, 3);
  const pullCap = capFor('maxChainPullsPerCast', q, 1);
  ok(counterCap >= 1 && pullCap >= 1, `${q}: 反撃 ${counterCap} / 引き寄せ ${pullCap} が正`);
  const ctx = build({ quality: q });
  ctx.sm.acquireOrLevel('counter_stance'); ctx.sm.setLevel('counter_stance', 8);
  ctx.sm.acquireOrLevel('chain_hook'); ctx.sm.setLevel('chain_hook', 8);
  run(ctx, 20000);
  const cs = ctx.sm.statsList().find((x) => x.id === 'counter_stance') || {};
  const lv8 = SKILL('counter_stance').levels[7];
  ok((cs.extra?.counters || 0) <= (cs.extra?.stances || 0) * lv8.maxCounters,
    `${q}: 反撃 ${cs.extra?.counters || 0} ≤ 構え${cs.extra?.stances} × ${lv8.maxCounters}`);
  const ch = ctx.sm.statsList().find((x) => x.id === 'chain_hook') || {};
  ok((ch.extra?.pullDistance || 0) <= (ch.extra?.hooks || 0) * SKILL('chain_hook').levels[7].pullDistanceNormal * pullCap + 2,
    `${q}: 引き寄せ距離が上限内（${Math.round(ch.extra?.pullDistance || 0)}px）`);
}

// ===== 9. 火 / 氷の cap 値を変えていない =====
section('9. 火 / 氷が使う既存 cap の値を 1 件も変えていない');
{
  // M9-A 以降の期待値。これら 4 件は gameplay cap なので **品質に依存しない単一値**で、
  // canonical value は M8-F までの high の値（＝出荷既定品質の値）と一致していなければならない。
  const FROZEN = {
    maxMeleeTargetsPerHit: 24,
    maxFrozenEnemies: 100,
    maxShatterProjectiles: 40,
    maxFurnaceProjectiles: 90,
  };
  for (const [name, want] of Object.entries(FROZEN)) {
    const c = DATA.balance.skillCaps[name];
    ok(!!c, `${name}: 定義が残っている`);
    if (!c) continue;
    ok(c.value === want, `${name}: canonical value = ${want}（実際 ${c.value}）`);
    ok(QUALITIES.every((q) => capFor(name, q, -1) === want), `${name}: 4 品質すべてで ${want}（品質非依存）`);
  }
  // M8-C の追加 cap は既存の名前と衝突していない。
  const before = Object.keys(DATA.balance.skillCaps).length - NEW_CAPS.length;
  ok(before >= 165, `M8-C 追加前の cap 数 ${before} ≥ 165（既存を潰していない）`);
}

T.finish();
