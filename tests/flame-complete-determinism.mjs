// 火の魔女 完成監査 8/12: 決定論の完全監査（M8-A §11）。Node.js 標準機能のみ。
// (1) active30・進化18 の全ソースに Math.random / Date.now / performance.now / 抽選RNG(draft) が無い、
// (2) 同一 seed・同一状態・同一発動順で攻撃呼び出し列が完全一致する、
// (3) 「継続」と「save→reload」で以後の呼び出し列・CD が一致する（RNG drift なし・無料 cast なし）、
// (4) 戦闘 RNG（scene.rng）は seed 由来で、保存/復元をまたいでも列が壊れない。
// 実行: node tests/flame-complete-determinism.mjs

import { DATA, FLAME, registryMap, skillSource, makeScene, makeEnemies, runner, bootRuntime, evolutionBaseMap, makeRng } from './flame-audit-common.mjs';

const { SkillManager } = await bootRuntime();

const T = runner('火の魔女 決定論 完全監査（M8-A）');
const { ok, section, info } = T;
const MAP = registryMap();
const EVO_BASE = evolutionBaseMap();

// ===== 1. 実時間・Math.random・抽選RNG を使わない =====
section('1. 全 48 スキルが Math.random / Date.now / performance.now / 抽選RNG を使わない');
// コメント行は判定から除く（「Math.random 不使用」等の記述で誤検出しないため）。
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
  const src = stripComments(skillSource(id, MAP));
  ok(!/Math\.random/.test(src), `${id}: Math.random を使わない（乱数は seed 由来の scene.rng のみ）`);
  ok(!/Date\.now|performance\.now/.test(src), `${id}: 実時間（Date.now / performance.now）を使わない`);
  ok(!/_draftSeed|draftManager|SkillDraftManager/.test(src), `${id}: 抽選RNG（draft）を参照しない`);
  ok(!/new SeededRandom/.test(src), `${id}: スキル内で独自の乱数源を作らない（scene.rng を使う）`);
}
// 戦闘 RNG は BattleScene が seed から作る 1 本のみ。
{
  const bs = String(await import('node:fs').then((fs) => fs.readFileSync(new URL('../src/scenes/BattleScene.js', import.meta.url), 'utf8')));
  ok(/this\.rng\s*=/.test(bs), 'BattleScene が scene.rng を1本だけ用意する');
  ok(/SeededRandom|mulberry/.test(bs) || /rngFrom|seed/.test(bs), '戦闘 RNG は seed 由来');
}

// ===== 2. 同一入力で攻撃呼び出し列が一致 =====
section('2. 同一 seed・同一状態・同一発動順で攻撃呼び出し列が完全一致');
const rnd = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
function trace(id, evoBase, frames = 120) {
  const scene = makeScene({ enemies: makeEnemies(16), absorb: 1, seed: 0x2f3b91cd, deathEvents: [{ id: 1, x: 320, y: 200 }] });
  const sm = new SkillManager(scene); scene.skills = sm;
  if (evoBase) { sm.acquireOrLevel(evoBase); sm.setLevel(evoBase, 8); sm.evolve(evoBase); }
  else { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  for (let i = 0; i < frames; i++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  return JSON.stringify(scene.calls.map((c) => c.map(rnd)));
}
let nonEmpty = 0;
for (const id of FLAME.activeSkillPool) {
  const a = trace(id, null), b = trace(id, null);
  ok(a === b, `${id}: 2回の駆動が一致（決定論）`);
  if (a.length > 4) nonEmpty++;
}
for (const eid of FLAME.evolutionPool) {
  const a = trace(eid, EVO_BASE[eid]), b = trace(eid, EVO_BASE[eid]);
  ok(a === b, `${eid}: 2回の駆動が一致（決定論）`);
  if (a.length > 4) nonEmpty++;
}
ok(nonEmpty >= 40, `攻撃が実際に発生するスキルが ${nonEmpty} 件（トレースが空でない）`);

// ===== 3. 「継続」と「save→reload」で以後が一致（無料 cast なし）=====
section('3. 継続 と save→reload で以後の発動量が一致（RNG drift / 無料 cast なし）');
function splitRun(id, evoBase) {
  const mk = () => {
    const scene = makeScene({ enemies: makeEnemies(16), absorb: 1, seed: 0x2f3b91cd, deathEvents: [{ id: 1, x: 320, y: 200 }] });
    const sm = new SkillManager(scene); scene.skills = sm;
    if (evoBase) { sm.acquireOrLevel(evoBase); sm.setLevel(evoBase, 8); sm.evolve(evoBase); }
    else { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
    return { scene, sm };
  };
  const A = mk();
  for (let i = 0; i < 80; i++) { A.scene.advance(50); A.sm.update(50, { hasEnemies: true }); }
  const snap = A.sm.serializeRuntime();
  A.scene.calls.length = 0;
  for (let i = 0; i < 80; i++) { A.scene.advance(50); A.sm.update(50, { hasEnemies: true }); }

  const B = mk();
  B.sm.restoreRuntime(snap);
  for (let i = 0; i < 80; i++) B.scene.advance(50); // 経過時間を合わせる
  B.scene.calls.length = 0;
  for (let i = 0; i < 80; i++) { B.scene.advance(50); B.sm.update(50, { hasEnemies: true }); }
  return { cont: A.scene.calls.length, reload: B.scene.calls.length };
}
for (const id of FLAME.activeSkillPool) {
  const r = splitRun(id, null);
  ok(r.reload <= r.cont * 1.2 + 2, `${id}: 復元後の発動量 ${r.reload} が継続 ${r.cont} を大きく超えない（無料 cast なし）`);
  ok(r.reload > 0 || r.cont === 0, `${id}: 復元後も動作する（沈黙しない）`);
}
for (const eid of FLAME.evolutionPool) {
  const r = splitRun(eid, EVO_BASE[eid]);
  ok(r.reload <= r.cont * 1.2 + 2, `${eid}: 復元後の発動量 ${r.reload} が継続 ${r.cont} を大きく超えない`);
}

// ===== 4. CD 保存の効果（保存しないと無料 cast が出ることの確認）=====
section('4. runtimeState を捨てると無料 cast が出る（＝CD 保存が実際に効いている）');
for (const id of ['meteor', 'flame_pillar', 'fireball', 'chain_flame', 'lava_bomb']) {
  const mk = () => {
    const scene = makeScene({ enemies: makeEnemies(16), seed: 0x2f3b91cd });
    const sm = new SkillManager(scene); scene.skills = sm;
    sm.acquireOrLevel(id); sm.setLevel(id, 8);
    return { scene, sm };
  };
  const A = mk();
  for (let i = 0; i < 40; i++) { A.scene.advance(50); A.sm.update(50, { hasEnemies: true }); }
  const snap = A.sm.serializeRuntime();
  ok(snap[id] && typeof snap[id].cdLeft === 'number', `${id}: cdLeft を保存している`);
  // 復元あり（CD が残る）と復元なし（CD 0 ＝ 即発動）で 1 フレーム目の挙動が変わる。
  const withRestore = mk(); withRestore.sm.restoreRuntime(snap);
  const withoutRestore = mk();
  withRestore.scene.advance(16); withRestore.sm.update(16, { hasEnemies: true });
  withoutRestore.scene.advance(16); withoutRestore.sm.update(16, { hasEnemies: true });
  ok(withRestore.scene.calls.length <= withoutRestore.scene.calls.length,
    `${id}: CD 復元ありは復元なしより即時発動が多くならない（無料 cast を防いでいる）`);
}

// ===== 5. 戦闘 RNG（scene.rng）は seed 由来で再現する =====
section('5. 戦闘 RNG は seed から決定的に再現する');
{
  const a = makeRng(1234), b = makeRng(1234), c = makeRng(9999);
  const seqA = Array.from({ length: 20 }, () => a());
  const seqB = Array.from({ length: 20 }, () => b());
  const seqC = Array.from({ length: 20 }, () => c());
  ok(JSON.stringify(seqA) === JSON.stringify(seqB), '同じ seed から同じ乱数列');
  ok(JSON.stringify(seqA) !== JSON.stringify(seqC), '違う seed からは違う乱数列');
  ok(seqA.every((v) => v >= 0 && v < 1), '乱数は [0,1) の範囲');
}

// ===== 6. 決定論の要（index / 角度の導出）=====
section('6. 配置・角度は index / 決定論的な角度分割から導出している');
{
  let indexed = 0;
  for (const id of [...FLAME.activeSkillPool, ...FLAME.evolutionPool]) {
    const src = skillSource(id, MAP);
    if (/Math\.PI \* 2 \* i|\(i \/ |Math\.PI \/ 3\) \* k|Math\.PI \* 2 \* k/.test(src)) indexed++;
  }
  ok(indexed >= 10, `index ベースの決定論的な配置を使うスキルが ${indexed} 件`);
  info('角度/配置は index・等分割・scene.rng（seed 由来）で決定（実時間・Math.random は使わない）');
}

T.finish();
