// 戦士 完成監査 13/23: 移動 / 位置の安全性（M8-F §15）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-movement.mjs
import { DATA, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, registryMap, readSrc, runner } from './warrior-common.mjs';
const T = runner('戦士 移動 / 位置安全性 完成監査（M8-F）');
const { ok, section, info } = T;
const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const MOVERS = ['charge_slash', 'leap_smash', 'sweeping_advance', 'chain_hook', 'shield_charge', 'backstep_riposte',
  'battlefield_throw', 'berserker_rush', 'breaker_knee', 'piercing_lunge', 'earthshaker_march',
  'heaven_crushing_descent', 'fortress_rampage', 'shadow_swallow_riposte', 'mountain_hurl',
  'godspeed_impaler', 'continental_quake_march'];
const MAP = registryMap();
const mk = (o = {}) => {
  const enemies = o.enemies || makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, boss: o.boss || null, now: 10000, quality: o.quality || 'high' });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (c, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) { c.sm.update(step, { hasEnemies: true }); c.w.update(step); c.scene.advance(step); }
};
const inBounds = (c) => c.scene.player.x >= 0 && c.scene.player.x <= c.scene.worldW
  && c.scene.player.y >= 0 && c.scene.player.y <= c.scene.worldH;

ok(MOVERS.length === 17, `移動を伴うスキル ${MOVERS.length} 件`);

// ===== 1. 壁際 / 隅 =====
section('1. 壁際・隅でも world bounds の内側に留まり NaN にならない');
const CORNERS = [['右下', (c) => { c.scene.player.x = c.scene.worldW - 4; c.scene.player.y = c.scene.worldH - 4; }],
  ['左上', (c) => { c.scene.player.x = 2; c.scene.player.y = 2; }],
  ['右上', (c) => { c.scene.player.x = c.scene.worldW - 2; c.scene.player.y = 3; }]];
for (const id of MOVERS) {
  for (const [name, setup] of CORNERS) {
    const c = mk(); setup(c);
    c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
    let threw = false;
    try { run(c, 12000); } catch (e) { threw = true; info(`${id}/${name}: ${e.message}`); }
    ok(!threw, `${id}/${name}: 例外にならない`);
    ok(Number.isFinite(c.scene.player.x) && Number.isFinite(c.scene.player.y), `${id}/${name}: 座標が有限`);
    ok(inBounds(c), `${id}/${name}: 画面内（${c.scene.player.x.toFixed(0)},${c.scene.player.y.toFixed(0)}）`);
  }
}

// ===== 2. 対象の死亡 / 消失 =====
section('2. 対象の死亡・プール返却・消失でも安全に続く');
for (const id of MOVERS) {
  const c = mk();
  c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  run(c, 2500);
  for (const e of c.enemies) { e.alive = false; c.w.onEnemyRemoved(e); }
  let threw = false;
  try { run(c, 8000); } catch (e) { threw = true; info(`${id}: ${e.message}`); }
  ok(!threw, `${id}: 対象消失で例外にならない`);
  ok(Number.isFinite(c.scene.player.x) && inBounds(c), `${id}: 座標が壊れない`);
}

// ===== 3. ボス予兆 =====
section('3. ボスの予告 / 突進中は無謀に踏み込まない');
for (const id of MOVERS) {
  const c = mk({ enemies: makeEnemies(6, { x: 360, y: 300, dx: 8, hp: 1e9 }), boss: makeBoss({ x: 700, y: 300, hp: 1e9 }) });
  c.scene.boss.state = 'telegraph';
  c.scene.bossTelegraphing = () => true;
  c.scene.combat.bossTelegraphing = () => true;
  c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  const x0 = c.scene.player.x;
  run(c, 10000);
  const moved = Math.abs(c.scene.player.x - x0);
  // 「まったく動かない」ことは求めない（後退や側面移動はある）。ボスの方向へ大きく踏み込まないことを見る。
  ok(c.scene.player.x <= 700 - 20 || moved < 200, `${id}: 予兆中のボスへ大きく踏み込まない（x ${c.scene.player.x.toFixed(0)}）`);
  ok(inBounds(c), `${id}: 画面内`);
}

// ===== 4. テレポートしない =====
section('4. 1 フレームの移動量が上限内（テレポート化しない）');
for (const id of MOVERS) {
  const c = mk();
  c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  let worst = 0;
  for (let i = 0; i < 800; i++) {
    const px = c.scene.player.x; const py = c.scene.player.y;
    c.sm.update(16, { hasEnemies: true }); c.w.update(16); c.scene.advance(16);
    worst = Math.max(worst, Math.hypot(c.scene.player.x - px, c.scene.player.y - py));
  }
  // 1 フレーム 16ms で 200px 以上跳べばテレポート。
  ok(worst < 200, `${id}: 1 フレーム最大移動 ${worst.toFixed(1)}px < 200px`);
}

// ===== 5. 可変 dt / 2 倍速 / 品質 =====
section('5. 可変 dt・2 倍速・全品質で挙動が壊れない');
for (const id of MOVERS) {
  for (const q of ['low', 'ultra']) {
    const c = mk({ quality: q });
    c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
    let threw = false;
    try { for (const dt of [1, 7, 16, 33, 64, 120, 250]) { for (let i = 0; i < 60; i++) { c.sm.update(dt, { hasEnemies: true }); c.w.update(dt); c.scene.advance(dt); } } }
    catch (e) { threw = true; info(`${id}/${q}: ${e.message}`); }
    ok(!threw, `${id}/${q}: 可変 dt で例外にならない`);
    ok(Number.isFinite(c.scene.player.x) && inBounds(c), `${id}/${q}: 座標が壊れない`);
  }
  // 品質でゲーム的な移動距離が変わらない（演出だけが変わる）。
  const lo = mk({ quality: 'low' }); lo.sm.acquireOrLevel(id); try { lo.sm.setLevel(id, 8); } catch (e) { void e; }
  const hi = mk({ quality: 'ultra' }); hi.sm.acquireOrLevel(id); try { hi.sm.setLevel(id, 8); } catch (e) { void e; }
  run(lo, 8000); run(hi, 8000);
  const dl = (lo.sm.statsList().find((s) => s.id === id) || {}).casts || 0;
  const dh = (hi.sm.statsList().find((s) => s.id === id) || {}).casts || 0;
  ok(dl === dh, `${id}: 発動回数が品質で変わらない（${dl} / ${dh}）`);
}

// ===== 6. SpatialGrid の更新 =====
section('6. 移動した敵 / プレイヤーで SpatialGrid が更新される');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/enemyGrid/.test(bs) && /enemyGrid\.(insert|update|move|remove)/.test(bs),
    'BattleScene が SpatialGrid（enemyGrid）を保守する経路を持つ');
  // 引き寄せ / 投げは共通経路を通り、スキルは grid を直接触らない。
  for (const id of MOVERS) {
    const src = readSrc(`src/skills/${MAP[id]}.js`)
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
    ok(!/enemyGrid|SpatialGrid/.test(src), `${id}: SpatialGrid を直接触らない（共通経路が更新する）`);
  }
}

// ===== 7. 復元で二重移動しない =====
section('7. save / reload で二重に移動しない');
for (const id of MOVERS) {
  const c = mk();
  c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  run(c, 3000);
  const sk = c.sm.skills.get(id);
  const s = sk.serializeState();
  for (const k of ['x', 'y', 'angle', 'moved', 'traveled']) ok(!(k in s), `${id}: ${k} を保存しない`);
  const c2 = mk();
  c2.sm.acquireOrLevel(id); try { c2.sm.setLevel(id, 8); } catch (e) { void e; }
  const fresh = c2.sm.skills.get(id);
  const before = { x: c2.scene.player.x, y: c2.scene.player.y };
  fresh.restoreState({ ...s, cdLeft: 99999 });
  ok(c2.scene.player.x === before.x && c2.scene.player.y === before.y, `${id}: 復元だけで座標が動かない`);
}

// ===== 8. movePlayerTowards が共通経路 =====
section('8. プレイヤーの移動は共通経路（クランプ / NaN ガードつき）を通る');
{
  const c = mk();
  const wb = c.scene.worldW;
  // 過大な移動要求でも壁の内側へクランプされる。
  const moved = c.scene.combat.movePlayerTowards(1e9, 1e9, 1e9);
  ok(Number.isFinite(moved) && moved >= 0, `移動量が有限（${moved.toFixed(1)}）`);
  ok(inBounds(c), `クランプされる（${c.scene.player.x.toFixed(0)},${c.scene.player.y.toFixed(0)}）`);
  // NaN 要求では動かない。
  const p0 = { x: c.scene.player.x, y: c.scene.player.y };
  const m2 = c.scene.combat.movePlayerTowards(NaN, NaN, 100);
  ok(m2 === 0 && c.scene.player.x === p0.x && c.scene.player.y === p0.y, 'NaN 要求では動かない');
  void wb;
}

T.finish();
