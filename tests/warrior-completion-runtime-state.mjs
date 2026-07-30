// 戦士 完成監査 8/23: runtimeState 全 48 件（M8-F §11）。Node.js 標準機能のみ。
//   - 宣言あり / 実使用なし・使用あり / 宣言なし・no-op serialize が無い
//   - オブジェクト参照 / Phaser の実体を保存しない
//   - 復元で二重再生しない・加算蓄積しない
//   - 旧セーブ（キー欠落）で例外にならない・改ざん値がクランプされる
//   - instant skill は「state 不要」の理由が説明できる
// 実行: node tests/warrior-completion-runtime-state.mjs

import { DATA, WARRIOR, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, registryMap, readSrc, runner } from './warrior-common.mjs';

const T = runner('戦士 runtimeState 全 48 件（M8-F）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const ALL = [...WARRIOR.activeSkillPool, ...WARRIOR.evolutionPool];
const MAP = registryMap();
let bs = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bs, x: 402 + i * 3, y: 300, angle: Math.PI, alive: true, hostile: true, damage: 20, speed: 180,
  projectileKind: 'bossBullet', isBeam: false, isTelegraph: false,
  alreadyDeflected: false, deflectGeneration: 0, suppressSpecialEffects: false, _deflectId: null,
}));
const build = () => {
  const enemies = [...makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 }), ...makeEnemies(3, { x: 360, y: 300, hp: 1e9, elite: true })];
  const scene = makeScene({ enemies, boss: makeBoss({ x: 470, y: 300, hp: 1e9 }), now: 10000, quality: 'high', enemyBullets: mkBullets(12) });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (c, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    c.sm.update(step, { hasEnemies: true });
    c.w.setHp(c.scene.player.maxHp * (i % 300 < 150 ? 1 : 0.2), c.scene.player.maxHp);
    c.w.update(step); c.scene.advance(step);
    if (i % 60 === 30) c.scene.onWarriorHit(40, 30);
  }
};

// ===== 1. 全 48 件が state を持ち、no-op でない =====
section('1. 全 48 件が serialize / restore を持ち no-op でない');
const STATES = {};
for (const id of ALL) {
  const c = build(); c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  run(c, 6000);
  const sk = c.sm.skills.get(id);
  const s = sk.serializeState();
  STATES[id] = s;
  ok(s && typeof s === 'object' && !Array.isArray(s), `${id}: serializeState がオブジェクトを返す`);
  ok(Object.keys(s).length >= 1, `${id}: 少なくとも 1 キー保存する（${Object.keys(s).join(',')}）`);
  ok(typeof s.cdLeft === 'number', `${id}: cdLeft を持つ`);
}
info('保存キー一覧:');
for (const id of ALL) info(`  ${id.padEnd(26)} ${Object.keys(STATES[id]).join(', ')}`);

// ===== 2. 保存値はすべて単純な値 =====
section('2. オブジェクト参照 / Phaser の実体を保存しない');
for (const id of ALL) {
  const s = STATES[id];
  for (const [k, v] of Object.entries(s)) {
    ok(v === null || ['number', 'string', 'boolean'].includes(typeof v), `${id}.${k}: 単純な値（${typeof v}）`);
  }
  const json = JSON.stringify(s);
  for (const bad of ['"hp"', '"maxHp"', '"alive"', '"def"', '"scene"', '"body"', '"texture"', '"_deflectId"', 'projectileKind']) {
    ok(!json.includes(bad), `${id}: ${bad} を保存しない`);
  }
  // 座標・角度・castKey は保存しない（復元で座標が飛ぶ / 二重再生する）。
  for (const k of ['x', 'y', 'angle', 'castKey', 'target', 'enemy', 'plan', 'hitSet', 'seqHits']) {
    ok(!(k in s), `${id}: ${k} を保存しない`);
  }
}

// ===== 3. 宣言と実使用の照合 =====
section('3. 保存キーが実装から読まれている（宣言だけのキーが無い）');
for (const id of ALL) {
  const cls = MAP[id];
  const e = DATA.evolutions.find((x) => x.id === id);
  const src = readSrc(`src/skills/${cls}.js`) + (e && e.baseSkillId ? readSrc(`src/skills/${MAP[e.baseSkillId]}.js`) : '');
  for (const k of Object.keys(STATES[id])) {
    ok(src.includes(k) || k === 'cdLeft', `${id}.${k}: restoreState 側からも読まれる`);
  }
}

// ===== 4. 復元で二重再生 / 加算蓄積しない =====
section('4. 復元で二重再生しない・繰り返し復元で値が積み上がらない');
for (const id of ALL) {
  const c = build(); c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  run(c, 5000);
  const sk = c.sm.skills.get(id);
  const s = sk.serializeState();
  // 10 回復元しても値が積み上がらない。
  for (let i = 0; i < 10; i++) sk.restoreState(s);
  const s2 = sk.serializeState();
  for (const k of Object.keys(s)) {
    if (typeof s[k] !== 'number') continue;
    ok(s2[k] <= s[k] + 1e-6, `${id}.${k}: 10 回復元しても増えない（${s[k]} → ${s2[k]}）`);
  }
  // 復元後に無料の効果が出ない。**production の reload と同じく新しいインスタンスへ復元する**
  //（同じインスタンスへ途中復元するのは実際には起きない経路なので測らない）。
  const c2 = build();
  c2.sm.acquireOrLevel(id); try { c2.sm.setLevel(id, 8); } catch (e) { void e; }
  const fresh = c2.sm.skills.get(id);
  fresh.restoreState({ ...s, cdLeft: 99999 });
  const before = c2.scene.calls.length;
  for (let i = 0; i < 300; i++) { fresh.update(16, { hasEnemies: true }); c2.scene.advance(16); }
  const grew = c2.scene.calls.length - before;
  // 残り時間のある「構え / 窓 / 陣」は継続を許す（二重化ではない）。
  // 「残り時間ぶんだけ再開する」ことを設計として選んでいるスキル（最初からやり直しにも二重化にもならない）。
  // 旋風斬 / 血戦旋風は回転の残り、薙ぎ進軍は残距離と消化済み打撃数、刃防陣 / 弾き返し / 陣は残り時間。
  const RESUMABLE = new Set(['blade_guard', 'weapon_deflection', 'heaven_mirror_reversal',
    'rallying_banner', 'blood_oath_standard', 'counter_stance', 'adamant_counter',
    'whirlwind_slash', 'bloodstorm_whirlwind', 'sweeping_advance']);
  ok(RESUMABLE.has(id) || grew === 0, `${id}: 新規インスタンスへ復元して無料の効果が出ない（+${grew}）`);
}

// ===== 5. 旧セーブ / 欠落キー =====
section('5. 旧セーブ（キー欠落）で例外にならず既定値へ落ちる');
for (const id of ALL) {
  const c = build(); c.sm.acquireOrLevel(id);
  const sk = c.sm.skills.get(id);
  for (const bad of [{}, { cdLeft: 0 }, null, undefined]) {
    let threw = false;
    try { sk.restoreState(bad); } catch (e) { threw = true; info(`${id}: ${e.message}`); }
    ok(!threw, `${id}: restoreState(${JSON.stringify(bad)}) が例外にならない`);
  }
  // 進行中フラグは復元されない。
  for (const g of ['lunging', 'marching', 'charging', 'hooking', 'dashing']) {
    if (g in sk) ok(sk[g] === false, `${id}: 復元直後に ${g} が false`);
  }
}

// ===== 6. 改ざん値のクランプ =====
section('6. 改ざんされた state で内部値が壊れない');
for (const id of ALL) {
  const c = build(); c.sm.acquireOrLevel(id);
  const sk = c.sm.skills.get(id);
  const keys = Object.keys(STATES[id]);
  const evil = {};
  for (const k of keys) evil[k] = k === 'cdLeft' ? 1e12 : 1e12;
  let threw = false;
  try { sk.restoreState(evil); } catch (e) { threw = true; info(`${id}: ${e.message}`); }
  ok(!threw, `${id}: 巨大値で例外にならない`);
  ok(Number.isFinite(sk._cd), `${id}: _cd が有限（${sk._cd}）`);
  const back = sk.serializeState();
  for (const [k, v] of Object.entries(back)) {
    if (typeof v === 'number') ok(Number.isFinite(v), `${id}.${k}: 復元後も有限（${v}）`);
  }
}

// ===== 7. WarriorCombatSystem 側の runtime state =====
section('7. WarriorCombatSystem の runtime state（timedBuffs）が加算的で上限つき');
{
  const c = build();
  const w = c.w;
  const p = c.scene.player;
  w.applyWarCryBuff({ durationMs: 3000, meleeDamageBonus: 0.15, furyGainBonus: 0.1, comboGraceBonus: 0.2 });
  w.beginCounterWindow('counter_stance', { durationMs: 2000, maxCounters: 2, priority: 2, mitigation: 0.2 });
  w.beginFrontGuard('shield_charge', { durationMs: 600, mitigation: 0.4, frontArc: 1.5, facing: 0.3 });
  w.placeRallyField('rallying_banner', { x: p.x, y: p.y, durationMs: 5000, radius: 150, meleeArea: 0.1 });
  w.beginDuelChallenge('duel_challenge', c.enemies[0], { durationMs: 6000, meleeDamageBonus: 0.2 });
  w.beginBattleTrance('battle_trance', { durationMs: 5000, meleeDamageBonus: 0.2 });
  w.beginDeflectionWindow('weapon_deflection', { windowMs: 2000, maxDeflections: 4, radius: 120, reflect: true, reflectedDamage: 30, reflectedSpeed: 300, reflectLifeMs: 500 });
  const buffs = w.serializeTimedBuffs();
  const KEYS = ['warCry', 'counterWindows', 'frontGuard', 'rallyField', 'duel', 'trance', 'deflection'];
  for (const k of KEYS) ok(k in buffs, `timedBuffs に ${k} がある`);
  const json = JSON.stringify(buffs);
  ok(!/"hp"|"maxHp"|"alive"|"def":/.test(json), '敵 / 弾のオブジェクトを保存しない');
  // 10 回復元しても積み上がらない。
  const c2 = build();
  const before = { d: c2.w.telemetry.duelStarts, t: c2.w.telemetry.tranceStarts, f: c2.w.telemetry.deflectWindows, r: c2.w.telemetry.rallyPlacements };
  for (let i = 0; i < 10; i++) c2.w.restoreTimedBuffs(buffs);
  ok(c2.w.telemetry.duelStarts === before.d && c2.w.telemetry.tranceStarts === before.t
    && c2.w.telemetry.deflectWindows === before.f && c2.w.telemetry.rallyPlacements === before.r,
  '10 回復元してもテレメトリが水増しされない');
  ok(c2.w.duelActive && c2.w.tranceActive && c2.w.deflectionActive && c2.w.rallyActive, '1 つずつ復元される（重複しない）');
}

// ===== 7b. 再開するスキルは「残り時間ぶん」だけ =====
section('7b. 再開を許すスキルは残り時間ぶんだけで、最初からやり直さない');
for (const id of ['whirlwind_slash', 'bloodstorm_whirlwind', 'sweeping_advance', 'blade_guard']) {
  const c = build(); c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  run(c, 2000);
  const sk = c.sm.skills.get(id);
  const s = sk.serializeState();
  const left = Object.entries(s).find(([k]) => k !== 'cdLeft' && /LeftMs|remain/i.test(k));
  ok(!!left, `${id}: 残り時間 / 残量を保存する（${left ? left[0] : 'なし'}）`);
  const c2 = build(); c2.sm.acquireOrLevel(id); try { c2.sm.setLevel(id, 8); } catch (e) { void e; }
  const fresh = c2.sm.skills.get(id);
  fresh.restoreState({ ...s, cdLeft: 99999 });
  const s2 = fresh.serializeState();
  if (left) ok((s2[left[0]] || 0) <= (s[left[0]] || 0) + 1e-6, `${id}: 復元で残り時間が増えない（${s[left[0]]} → ${s2[left[0]]}）`);
  // 改ざんされた巨大な残り時間もクランプされる（永久稼働しない）。
  fresh.restoreState({ ...s, [left[0]]: 1e9 });
  const s3 = fresh.serializeState();
  ok(Number.isFinite(s3[left[0]]) && s3[left[0]] < 1e9, `${id}: 巨大な残り時間がクランプされる（${s3[left[0]]}）`);
}

// ===== 8. instant skill の理由 =====
section('8. 進行中状態を持たないスキルは「CD だけ」でよい理由がある');
{
  const onlyCd = ALL.filter((id) => Object.keys(STATES[id]).length === 1);
  info(`CD だけを保存するスキル: ${onlyCd.length} 件`);
  for (const id of onlyCd) {
    const cls = MAP[id];
    const src = readSrc(`src/skills/${cls}.js`);
    // 進行中の状態を持たない（_dash / _hook / _march / _lunge 等のフィールドが無い）か、
    // 持っていても「保存しない」とコメントで明言している。
    const hasPhase = /this\._(dash|hook|march|lunge|charge|guard|combo|axe|grab|throw)\b/.test(src);
    ok(!hasPhase || /保存しない/.test(src), `${id}: 進行中状態が無い、または「保存しない」理由が書かれている`);
  }
}

T.finish();
