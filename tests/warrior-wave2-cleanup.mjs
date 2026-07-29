// 戦士 Wave2 19/21: 後始末・リーク防止（M8-D §cleanup）。Node.js 標準機能のみ。
//   - 15 スキルすべてが destroy を実装し、破棄後に何も動かない
//   - 敵のプール返却で参照が残らない（打ち上げ・掴み・投げ・斧の対象を保持しない）
//   - Enemy.reset() が Wave2 で増えたフィールドを全部戻す
//   - 長時間プレイでも内部 Map / Set が伸び続けない
//   - 前面防御・戦旗の陣・掴みが必ず時間で終わる
// 実行: node tests/warrior-wave2-cleanup.mjs

import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner, readSrc, registryMap, skillSource, skillSourceDeep } from './warrior-common.mjs';

const T = runner('戦士 Wave2 後始末・リーク防止（M8-D）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const WAVE2 = [...EXPECTED.wave2Actives, ...EXPECTED.wave2Evolutions];

const build = (opts = {}) => {
  const enemies = opts.enemies !== undefined ? opts.enemies : makeEnemies(12, { x: 340, y: 300, dy: 3, hp: opts.hp || 1e9 });
  const scene = makeScene({ enemies, boss: opts.boss || null, now: 10000 });
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
  }
};

// ===== 1. destroy と破棄ガード =====
section('1. Wave2 の 15 スキルすべてが destroy と破棄ガードを持つ');
{
  const map = registryMap();
  for (const id of WAVE2) {
    const src = skillSourceDeep(id, map) || '';
    ok(/destroy\s*\(\s*\)\s*\{/.test(src), `${id}: destroy を実装する`);
    ok(/_dead\s*=\s*true/.test(src), `${id}: 破棄フラグ _dead を立てる`);
    ok(/this\._dead\s*\|\|/.test(src) || /if \(this\._dead\) return/.test(src), `${id}: 破棄ガードがある`);
  }
}

// ===== 2. 破棄後に何も動かない =====
section('2. 破棄後に打撃・移動・遅延処理が一切動かない');
for (const id of WAVE2) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  try { ctx.sm.setLevel(id, 8); } catch (e) { void e; }
  run(ctx, 6000);
  const sk = ctx.sm.skills.get(id);
  sk.destroy();
  const calls = ctx.scene.calls.length;
  const px = ctx.scene.player.x, py = ctx.scene.player.y;
  for (let i = 0; i < 300; i++) { sk.update(16, { hasEnemies: true }); ctx.scene.advance(16); }
  ok(ctx.scene.calls.length === calls, `${id}: 破棄後に打撃が増えない（${calls}）`);
  ok(ctx.scene.player.x === px && ctx.scene.player.y === py, `${id}: 破棄後にプレイヤーが動かない`);
}

// ===== 3. 敵参照を保持しない =====
section('3. 敵オブジェクトを保持しない（安定 runtime id 経由）');
{
  const map = registryMap();
  for (const id of WAVE2) {
    const src = skillSource(id, map) || '';
    // 進行中の状態オブジェクトへ敵そのものを入れない。
    ok(!/(_throw|_axe|_rush|_move|_charge|_combo|_guard|_step)\.\s*(target|enemy)\b/.test(src),
      `${id}: 進行中の状態に敵オブジェクトを持たない`);
  }
  const w = readSrc('src/systems/WarriorCombatSystem.js');
  ok(!/this\._grab\s*=\s*\{[^}]*target/.test(w), 'WarriorCombatSystem も掴み対象のオブジェクトを持たない');
  ok(/_grab\s*=\s*\{\s*source,\s*seq/.test(w), '掴みは _seq だけを保持する');
}

// ===== 4. プール返却で残留が消える =====
section('4. 敵のプール返却で Wave2 の残留が全部消える');
{
  const ctx = build();
  for (const id of EXPECTED.wave2Actives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 12000);
  for (const e of ctx.enemies) {
    e._airborneUntil = 99999; e._launchImmuneUntil = 99999; e._launchHeight = 40; e._grabbed = true;
    ctx.w.onEnemyRemoved(e);
    ok(e._airborneUntil === 0, '打ち上げ状態が消える');
    ok(e._launchImmuneUntil === 0, '打ち上げ免疫が消える');
    ok(e._launchHeight === 0, '打ち上げ高さが消える');
    ok(e._grabbed === false, '掴みフラグが消える');
  }
  ok(!ctx.w.grabbing, '掴み中の敵が消えたら掴みも解除される');
}

// ===== 5. Enemy.reset() が Wave2 のフィールドを戻す =====
section('5. Enemy.reset() が Wave2 で増えたフィールドを全部戻す');
{
  const src = readSrc('src/entities/Enemy.js');
  const FIELDS = ['_airborneUntil', '_launchImmuneUntil', '_launchHeight', '_grabbed'];
  const resetIdx = src.indexOf('reset(');
  ok(resetIdx > 0, 'Enemy.reset() がある');
  const reset = src.slice(resetIdx);
  for (const f of FIELDS) {
    ok(src.includes(f), `Enemy.js が ${f} を持つ`);
    ok(reset.includes(f), `Enemy.reset() が ${f} を戻す`);
  }
  // 打ち上げ・掴み中は移動が止まる（残留すると敵が固まる）。
  ok(/_grabbed\s*\|\|\s*now\s*<\s*this\._airborneUntil/.test(src) || /_airborneUntil/.test(src),
    '打ち上げ / 掴み中は移動を止めている');
}

// ===== 6. 内部 Map / Set が伸び続けない =====
section('6. 長時間プレイでも内部の Map / Set が伸び続けない');
{
  const ctx = build({ hp: 30 });
  for (const id of EXPECTED.wave2Actives) { ctx.sm.acquireOrLevel(id); ctx.sm.setLevel(id, 8); }
  run(ctx, 60000);
  const sizeOf = (v) => (v && typeof v.size === 'number' ? v.size : 0);
  for (const id of EXPECTED.wave2Actives) {
    const sk = ctx.sm.skills.get(id);
    for (const [k, v] of Object.entries(sk)) {
      if (v instanceof Map || v instanceof Set) ok(sizeOf(v) < 200, `${id}.${k}: ${sizeOf(v)} 件（伸び続けない）`);
      if (v && typeof v === 'object' && !(v instanceof Map) && !(v instanceof Set)) {
        for (const [k2, v2] of Object.entries(v)) {
          if (v2 instanceof Map || v2 instanceof Set) ok(sizeOf(v2) < 200, `${id}.${k}.${k2}: ${sizeOf(v2)} 件`);
        }
      }
    }
  }
  ok(ctx.w.counterWindows.size < 20, `反撃の構えが伸びない（${ctx.w.counterWindows.size}）`);
  info(`60 秒プレイ後: 打撃 ${ctx.scene.calls.length} 件`);
}

// ===== 7. 時限効果は必ず終わる =====
section('7. 前面防御・戦旗の陣・掴みは必ず時間で終わる');
{
  const ctx = build();
  const w = ctx.w;
  w.beginFrontGuard('a', { durationMs: 500, mitigation: 0.3, frontArc: 1.4, facing: 0 });
  w.placeRallyField('b', { x: 300, y: 300, durationMs: 800, radius: 100, meleeArea: 0.1 });
  w.beginGrab('c', 3);
  for (let i = 0; i < 200; i++) w.update(16);
  ok(!w.frontGuardActive, '前面防御が時間で終わる');
  ok(!w.rallyActive, '戦旗の陣が時間で終わる');
  ok(!w.grabbing, `掴みが時間で終わる（上限 ${DATA.balance.warrior.grab.maxThrowMs}ms）`);
}

// ===== 8. ゲームオーバー / シーン破棄で残らない =====
section('8. ゲームオーバー後に発動しない');
for (const id of WAVE2) {
  const ctx = build();
  ctx.sm.acquireOrLevel(id);
  try { ctx.sm.setLevel(id, 8); } catch (e) { void e; }
  ctx.scene.gameOver = true;
  const before = ctx.scene.calls.length;
  run(ctx, 8000);
  ok(ctx.scene.calls.length === before, `${id}: ゲームオーバー中は打撃を出さない`);
}

T.finish();
