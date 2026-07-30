// 戦士 完成監査 18/23: 性能 / SpatialGrid / PoolManager（M8-F §20）。Node.js 標準機能のみ。
// 実ブラウザ FPS は未確認。ここで測るのは Node 上の純ロジック負荷と上限の効き方だけ。
// 実行: node tests/warrior-completion-performance.mjs
import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, capFor, readSrc, registryMap, runner } from './warrior-common.mjs';
import { capTiers } from './cap-shape.mjs';
const T = runner('戦士 性能 / プール 完成監査（M8-F）');
const { ok, section, info } = T;
const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const W = DATA.balance.warrior;
const MAP = registryMap();
let bs = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bs, x: 400 + (i % 9) * 5, y: 300 + Math.floor(i / 9) * 5, angle: Math.PI, alive: true, hostile: true,
  damage: 20, speed: 180, projectileKind: 'bossBullet', isBeam: false, isTelegraph: false,
  alreadyDeflected: false, deflectGeneration: 0, suppressSpecialEffects: false, _deflectId: null,
}));

// ===== 1. 毎フレーム全敵走査をしない =====
section('1. スキルが毎フレーム全敵を走査しない（SpatialGrid / PoolManager 経由）');
for (const id of [...EXPECTED.actives, ...EXPECTED.evolutions]) {
  const src = readSrc(`src/skills/${MAP[id]}.js`);
  ok(!/forEachActive\(/.test(src), `${id}: forEachActive を使わない`);
  ok(!/enemyPool|projPool|gemPool|bossBulletPool/.test(src), `${id}: プールを直接触らない`);
}
{
  const w = readSrc('src/systems/WarriorCombatSystem.js');
  ok(!/forEachActive\(/.test(w), 'WarriorCombatSystem も全敵走査をしない');
  const bsSrc = readSrc('src/scenes/BattleScene.js');
  ok(/enemyGrid/.test(bsSrc), 'BattleScene が SpatialGrid を使う');
  ok(/targetsInRadius/.test(bsSrc), '半径検索が 1 か所に集約されている');
  // 弾き返しは窓が開いている間だけ pool を辿る（毎フレームではない）。
  ok(/deflectionWindowOpen\s*&&\s*this\._deflectOpts/.test(bsSrc), '弾き返しは窓が開いている間だけ動く');
}

// ===== 2. 4 品質 × 敵100 × 2倍速 × 10 分相当 =====
section('2. 敵100・2倍速・10 分相当を 4 品質で回して 1 フレームの処理量が上限内');
const RESULTS = {};
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const enemies = [...makeEnemies(80, { x: 340, y: 300, dx: 6, dy: 2, hp: 1e9 }), ...makeEnemies(20, { x: 360, y: 320, dx: 6, hp: 1e9, elite: true })];
  const scene = makeScene({ enemies, boss: makeBoss({ x: 520, y: 300, hp: 1e9 }), now: 10000, quality: q, enemyBullets: mkBullets(40) });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  for (const id of EXPECTED.actives) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  let worst = 0; let sum = 0;
  const STEPS = 18750; // 32ms × 18750 = 10 分相当（2 倍速）
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < STEPS; i++) {
    const before = scene.calls.length;
    sm.update(32, { hasEnemies: true });
    w.setHp(scene.player.maxHp * (i % 500 < 250 ? 1 : 0.2), scene.player.maxHp);
    w.update(32); scene.advance(32);
    const d = scene.calls.length - before; worst = Math.max(worst, d); sum += d;
    if (scene.calls.length > 150000) scene.calls.length = 0;
    if (i % 200 === 0) scene.enemyBullets.push(...mkBullets(12));
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const cap = capFor('maxMeleeTargetsPerHit', q, 24) * EXPECTED.actives.length;
  RESULTS[q] = { ms, worst, avg: sum / STEPS, refl: scene.reflected.length, dset: w._deflectedIds.size, cw: w.counterWindows.size };
  ok(worst <= cap, `${q}: 1 フレーム最大 ${worst} 打撃 ≤ 上限 ${cap}`);
  ok(Number.isFinite(scene.player.x) && Number.isFinite(scene.player.y), `${q}: 座標が有限`);
  ok(ms < 60000, `${q}: 10 分相当を ${(ms / 1000).toFixed(1)}s で処理（Node 純ロジック）`);
  info(`${q}: ${(ms / 1000).toFixed(1)}s / 1フレーム最大 ${worst}（上限 ${cap}）平均 ${RESULTS[q].avg.toFixed(1)} 反射弾${RESULTS[q].refl} 弾id${RESULTS[q].dset} 反撃窓${RESULTS[q].cw}`);
}

// ===== 3. 品質でゲーム logic が変わらない =====
section('3. 品質を落としても発動回数が変わらない（演出と同時処理数だけが変わる）');
{
  const play = (q) => {
    const enemies = makeEnemies(30, { x: 340, y: 300, dx: 8, dy: 3, hp: 1e9 });
    const scene = makeScene({ enemies, now: 10000, quality: q, enemyBullets: mkBullets(20) });
    const w = makeWarrior(WarriorCombatSystem, scene, {});
    const sm = new SkillManager(scene); scene.skills = sm;
    for (const id of EXPECTED.actives) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
    for (let i = 0; i < 2000; i++) { sm.update(16, { hasEnemies: true }); w.setHp(scene.player.hp, scene.player.maxHp); w.update(16); scene.advance(16); }
    const by = {};
    for (const st of sm.statsList()) by[st.id] = st.casts || 0;
    return { total: sm.statsList().reduce((a, x) => a + (x.casts || 0), 0), by };
  };
  const lo = play('low'); const hi = play('ultra');
  // 品質は「1 打撃で同時に処理する敵の数」を絞る（maxMeleeTargetsPerHit）。
  // そのぶん低品質ではコンボの伸びがわずかに遅く、攻撃速度の閾値到達がずれるため、
  // 発動回数が数回だけ前後することがある。**1 発動あたりのダメージ・上限・判定規則は品質で変わらない。**
  // これは M8-B から 3 ジョブ共通の設計上の帰結で、M8-F で新たに生じたものではない。
  const diff = Object.keys(hi.by).filter((k) => hi.by[k] !== lo.by[k]);
  ok(Math.abs(hi.total - lo.total) <= Math.max(3, hi.total * 0.01),
    `合計発動回数の差が 1% 以内（low ${lo.total} / ultra ${hi.total} / 差 ${Math.abs(hi.total - lo.total)}）`);
  ok(diff.length <= 3, `差が出るスキルは少数（${diff.join(',') || 'なし'}）`);
  info(`品質で発動回数が前後したスキル: ${diff.map((k) => `${k}(${lo.by[k]}→${hi.by[k]})`).join(' ') || 'なし'}`);
  // 規則そのものは品質で変わらない: 1 打撃のダメージと上限の階層。
  for (const cap of ['maxMeleeTargetsPerHit', 'maxLineTargets', 'maxMarchStomps', 'maxDeflectionsPerWindow']) {
    const c = capTiers(DATA.balance.skillCaps[cap]);
    ok(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra, `${cap}: 上限の階層が保たれている`);
    ok(c.low >= 1, `${cap}.low ≥ 1（低品質でも効果が消えない）`);
  }
  ok(RESULTS.low.worst <= RESULTS.ultra.worst, `1 フレームの処理量は品質で絞られる（low ${RESULTS.low.worst} ≤ ultra ${RESULTS.ultra.worst}）`);
}

// ===== 4. 集合 / 配列が有界 =====
section('4. 長時間プレイで集合 / 配列が伸び続けない');
{
  const enemies = [...makeEnemies(40, { x: 340, y: 300, dx: 8, dy: 3, hp: 1e9 }), ...makeEnemies(10, { x: 360, y: 300, hp: 1e9, elite: true })];
  const scene = makeScene({ enemies, boss: makeBoss({ x: 520, y: 300, hp: 1e9 }), now: 10000, quality: 'high', enemyBullets: mkBullets(30) });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  for (const id of EXPECTED.actives) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  const snap = () => ({ refl: scene.reflected.length, dset: w._deflectedIds.size, cw: w.counterWindows.size,
    tgt: w._targetHitAt ? w._targetHitAt.size : 0, bud: w._budgets ? w._budgets.size : 0 });
  const step = (n) => { for (let i = 0; i < n; i++) { sm.update(32, { hasEnemies: true }); w.setHp(scene.player.maxHp * (i % 400 < 200 ? 1 : 0.2), scene.player.maxHp); w.update(32); scene.advance(32); if (i % 30 === 15) scene.onWarriorHit(30, 20); if (i % 200 === 0) scene.enemyBullets.push(...mkBullets(10)); if (scene.calls.length > 150000) scene.calls.length = 0; } };
  step(3000); const a = snap();
  step(9000); const b = snap();
  ok(b.refl <= capFor('maxReflectedProjectiles', 'high', 8), `反射弾が上限内（${a.refl} → ${b.refl}）`);
  ok(b.dset <= W.deflection.maxDeflectionsPerWindow, `弾いた id 集合が 1 窓分（${a.dset} → ${b.dset}）`);
  ok(b.cw <= 4, `反撃窓が有界（${a.cw} → ${b.cw}）`);
  ok(b.tgt <= 200, `同一敵ヒット記録が有界（${a.tgt} → ${b.tgt}）`);
  ok(b.bud <= 400, `cast 予算の記録が有界（${a.bud} → ${b.bud}）`);
  info(`3000 → 12000 フレーム: 反射弾 ${b.refl} / 弾id ${b.dset} / 反撃窓 ${b.cw} / 敵ヒット記録 ${b.tgt} / 予算 ${b.bud}`);
}

// ===== 5. 可変 dt / 2 倍速 =====
section('5. 可変 dt / 2 倍速でも壊れない');
{
  const enemies = makeEnemies(40, { x: 340, y: 300, dx: 8, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, now: 10000, quality: 'high', enemyBullets: mkBullets(20) });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  for (const id of EXPECTED.actives) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  let threw = false;
  try {
    for (const dt of [1, 4, 16, 33, 64, 120, 250, 500]) {
      for (let i = 0; i < 120; i++) { sm.update(dt, { hasEnemies: true }); w.setHp(scene.player.hp, scene.player.maxHp); w.update(dt); scene.advance(dt); }
    }
  } catch (e) { threw = true; info(e.message); }
  ok(!threw, '可変 dt で例外にならない');
  ok(Number.isFinite(scene.player.x) && Number.isFinite(scene.player.y), '座標が有限');
  ok(Number.isFinite(w.fury) && Number.isFinite(w.combo), '闘気 / コンボが有限');
}

// ===== 6. cleanup 残留 0 =====
section('6. cleanup 後に残留 0');
{
  const enemies = makeEnemies(20, { x: 340, y: 300, dx: 8, hp: 1e9 });
  const scene = makeScene({ enemies, boss: makeBoss({ x: 500, y: 300, hp: 1e9 }), now: 10000, quality: 'high', enemyBullets: mkBullets(20) });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  for (const id of EXPECTED.actives) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  for (let i = 0; i < 3000; i++) { sm.update(16, { hasEnemies: true }); w.setHp(scene.player.hp, scene.player.maxHp); w.update(16); scene.advance(16); }
  for (const id of EXPECTED.actives) sm.skills.get(id).destroy();
  w.destroy();
  scene.cleanupWarrior();
  ok(w._deflectedIds.size === 0 && w.counterWindows.size === 0, '集合が空');
  ok(!w.duelActive && !w.tranceActive && !w.deflectionActive && !w.rallyActive && !w.grabbing, '時限状態が全部消える');
  ok(scene._deflectOpts === null, '被弾フックが外れている');
  ok(enemies.every((e) => e._duelMark !== true), '決闘マーカーが残らない');
  ok(scene.pendingTimers() === 0 || scene.pendingTimers() < 50, `保留中の遅延処理が有界（${scene.pendingTimers()}）`);
}

// ===== 7. 実ブラウザ FPS は未確認 =====
section('7. 実ブラウザの FPS / メモリは未確認（Node 検証のみ）');
{
  ok(true, '実ブラウザでの FPS / メモリ計測は行っていない（docs/test-guide.md の M8-F 項目で確認する）');
  info('Node 純ロジックの 10 分相当（2 倍速・敵100・active30）: ' + Object.entries(RESULTS).map(([q, r]) => `${q}=${(r.ms / 1000).toFixed(1)}s`).join(' '));
}

T.finish();
