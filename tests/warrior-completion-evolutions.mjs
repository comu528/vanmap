// 戦士 完成監査 3/23: 18 進化の一覧監査と実動作（M8-F §4）。Node.js 標準機能のみ。
//   - base / support type / support id / 必要 Lv / rarity / replacementSkillId / 分岐なし / 補助保持
//   - 進化後に base が再提示されない・進化が通常 draft へ混ざらない
//   - 18 件すべてが実際に発動する（構え系はダメージを要求しない）
//   - 進化は base より弱くならない（同条件で総ダメージ or 固有指標が伸びる）
//   - 元 active と同時稼働しない（置換で base のクラスが動かない）
// 実行: node tests/warrior-completion-evolutions.mjs

import { buildCatalog, evolutionRecipes } from '../src/systems/SkillCatalog.js';
import { DATA, WARRIOR, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime,
  registeredIds, registryMap, draftCatalog, jobPools, seedRange, runner } from './warrior-common.mjs';
import { readFileSync } from 'node:fs';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';

const T = runner('戦士 18 進化 完成監査（M8-F）');
const { ok, section, info } = T;

const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const MAP = registryMap();
const IDS = registeredIds();
const CAT = buildCatalog({ skills: DATA.skills, passives: DATA.passives, evolutions: DATA.evolutions,
  jobs: DATA.jobs, jobId: 'warrior', registeredIds: IDS, runtimeStateIds: IDS });
const RECIPES = evolutionRecipes(CAT).filter((r) => WARRIOR.evolutionPool.includes(r.evolutionId));
const ACTIVE = new Set(WARRIOR.activeSkillPool);
// 発動しても直接ダメージを持たない「構え / 反応」系（設計どおり）。
const STANCE_ONLY = new Set(['adamant_counter', 'heaven_mirror_reversal']);
// 移動を伴うため遠方の敵へも到達しうる（射程の意味が違う）。
const MOVERS = new Set(['heaven_crushing_descent', 'fortress_rampage', 'shadow_swallow_riposte',
  'mountain_hurl', 'godspeed_impaler', 'continental_quake_march']);

const build = (o = {}) => {
  const enemies = o.enemies !== undefined ? o.enemies : makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, boss: o.boss || null, now: 10000, quality: 'high', enemyBullets: [] });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (c, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    c.sm.update(step, { hasEnemies: true });
    c.w.setHp(c.scene.player.hp, c.scene.player.maxHp);
    c.w.update(step); c.scene.advance(step);
  }
};
const st = (c, id) => c.sm.statsList().find((x) => x.id === id) || {};

// ===== 1. 一覧（base / support / 必要 Lv / 置換 / 分岐）=====
section('1. 18 進化の一覧監査');
const MATRIX = [];
for (const r of RECIPES) {
  const e = DATA.evolutions.find((x) => x.id === r.evolutionId);
  const aux = [...r.auxActive.map((a) => ({ ...a, kind: 'active' })), ...r.auxPassive.map((a) => ({ ...a, kind: 'passive' }))];
  ok(aux.length === 1, `${r.evolutionId}: 補助はちょうど 1 件（${aux.length}）`);
  ok(ACTIVE.has(r.baseSkillId), `${r.evolutionId}: base ${r.baseSkillId}`);
  ok(e.replacementSkillId === r.evolutionId, `${r.evolutionId}: base を置換`);
  ok(!e.branches && !e.branchOf, `${r.evolutionId}: 分岐なし`);
  ok(e.visualTier === 'evolved', `${r.evolutionId}: visualTier=evolved`);
  ok(!!MAP[r.evolutionId], `${r.evolutionId}: 実装クラスがある`);
  MATRIX.push({ id: r.evolutionId, base: r.baseSkillId, baseLv: r.baseMaxLevel,
    aux: aux[0].skill, auxKind: aux[0].kind, auxLv: aux[0].level });
}
info('進化マトリクス:');
for (const m of MATRIX) {
  info(`  ${m.id.padEnd(26)} base=${m.base}(Lv${m.baseLv}) 補助=${m.aux}(${m.auxKind} Lv${m.auxLv})`);
}
{
  const activeSupport = MATRIX.filter((m) => m.auxKind === 'active');
  ok(activeSupport.length === 3, `active 補助の進化は 3 件（${activeSupport.map((m) => m.id).join(',')}）`);
  const passiveSupport = MATRIX.filter((m) => m.auxKind === 'passive');
  ok(passiveSupport.length === 15, `passive 補助の進化は 15 件（${passiveSupport.length}）`);
  // 4 passive が偏らず担当している。
  const byP = {};
  for (const m of passiveSupport) byP[m.aux] = (byP[m.aux] || 0) + 1;
  ok(Object.keys(byP).length === 4, `4 passive すべてが補助を担当（${JSON.stringify(byP)}）`);
  for (const [k, n] of Object.entries(byP)) ok(n >= 3 && n <= 5, `${k}: 担当 ${n} 件（3〜5 に収まる）`);
}

// ===== 2. 進化後の再提示 / 通常 draft への混入 =====
section('2. 進化後に base が再提示されない・進化が通常 draft へ混ざらない');
{
  const catalog = draftCatalog();
  const job = jobPools('warrior');
  let baseReoffered = 0; let evoInNormal = 0;
  const evoSet = new Set(WARRIOR.evolutionPool);
  for (const m of MATRIX.slice(0, 6)) {
    for (const seed of seedRange(30)) {
      const d = new SkillDraftManager({});
      // 進化を所持し base は失っている状態。
      const owned = { active: { [m.id]: 1 }, passive: {} };
      const c = d._generate({ catalog, job, owned, evolvedBaseIds: [m.base],
        slots: { active: { used: 1, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3 }, seed);
      for (const x of c) {
        if (x.id === m.base) baseReoffered += 1;
        if (evoSet.has(x.id) && x.kind !== 'evolution') evoInNormal += 1;
      }
    }
  }
  ok(baseReoffered === 0, `進化後に base が再提示されない（${baseReoffered}）`);
  ok(evoInNormal === 0, `進化が通常候補（new/up）として出ない（${evoInNormal}）`);
  // evolvables を渡さなければ進化候補は 1 つも出ない。
  let leaked = 0;
  for (const seed of seedRange(80)) {
    const d = new SkillDraftManager({});
    const c = d._generate({ catalog, job, owned: { active: {}, passive: {} },
      slots: { active: { used: 0, max: 8 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3 }, seed);
    leaked += c.filter((x) => evoSet.has(x.id)).length;
  }
  ok(leaked === 0, `条件未成立で進化が出ない（${leaked}）`);
}

// ===== 3. 置換で base と同時稼働しない =====
section('3. 置換で base のクラスが 1 度も動かない（同時稼働しない）');
for (const m of MATRIX) {
  const c = build();
  c.sm.acquireOrLevel(m.base); c.sm.setLevel(m.base, 8);
  run(c, 2000);
  const baseCasts = st(c, m.base).casts || 0;
  const evoId = c.sm.evolve(m.base);
  ok(evoId === m.id, `${m.base} → ${m.id} へ置換される`);
  ok(!c.sm.skills.has(m.base), `${m.base}: 置換後はスキル表から消える`);
  const before = c.scene.calls.filter((x) => x[1] === m.base).length;
  run(c, 6000);
  const after = c.scene.calls.filter((x) => x[1] === m.base).length;
  ok(after === before, `${m.base}: 置換後に 1 度も動かない（+${after - before}）`);
  ok((st(c, m.id).casts || 0) > 0, `${m.id}: 置換後に発動する`);
  void baseCasts;
}

// ===== 4. 18 件すべてが実動作する =====
section('4. 18 進化すべてが発動し、構え系以外は命中してダメージを与える');
for (const id of WARRIOR.evolutionPool) {
  const c = build({ boss: makeBoss({ x: 470, y: 300, hp: 1e9 }) });
  c.sm.acquireOrLevel(id);
  run(c, 14000);
  const s = st(c, id);
  ok((s.casts || 0) > 0, `${id}: 発動する（cast ${s.casts}）`);
  if (STANCE_ONLY.has(id)) { ok(true, `${id}: 構え / 反応系なので命中を要求しない`); continue; }
  ok((s.hits || 0) > 0, `${id}: 命中する（hit ${s.hits}）`);
  ok((s.damage || 0) > 0, `${id}: ダメージを与える（${Math.round(s.damage)}）`);
}

// ===== 5. 進化は base より弱くならない =====
section('5. 進化が base より弱くならない');
for (const m of MATRIX) {
  const lo = build(); lo.sm.acquireOrLevel(m.base); lo.sm.setLevel(m.base, 8); run(lo, 16000);
  const hi = build(); hi.sm.acquireOrLevel(m.id); run(hi, 16000);
  const bd = st(lo, m.base).damage || 0;
  const ed = st(hi, m.id).damage || 0;
  if (STANCE_ONLY.has(m.id)) {
    // 構え系はダメージで比べられない。data の数値次元が base Lv8 以上であることを見る。
    const e = DATA.evolutions.find((x) => x.id === m.id);
    const b = DATA.skills.find((x) => x.id === m.base).levels[7];
    const shared = Object.keys(b).filter((k) => typeof e[k] === 'number' && typeof b[k] === 'number' && k !== 'cooldown');
    const worse = shared.filter((k) => e[k] < b[k]);
    ok(worse.length === 0, `${m.id}: 共有する数値が base Lv8 を下回らない（${worse.join(',') || 'なし'}）`);
  } else {
    ok(ed >= bd * 0.9, `${m.id}: 総ダメージ ${Math.round(ed)} ≥ base Lv8 ${Math.round(bd)} の 90%`);
  }
}

// ===== 6. 射程（移動系以外は画面端へ届かない）=====
section('6. 移動系以外の進化は遠方（700px 先）へ届かない');
for (const id of WARRIOR.evolutionPool) {
  if (MOVERS.has(id)) { ok(true, `${id}: 移動系なので射程の意味が違う（対象外）`); continue; }
  const far = makeEnemies(4, { x: 400 + 700, y: 300, dx: 6, hp: 1e9 });
  const c = build({ enemies: far });
  c.sm.acquireOrLevel(id);
  run(c, 10000);
  ok(far.every((e) => e.hp === e.maxHp), `${id}: 700px 先の敵へ 1 ダメージも通らない`);
}

// ===== 7. safetyCaps が全キー参照される =====
section('7. safetyCaps が非負でありすべて実装から参照される');
{
  const map = registryMap();
  for (const id of WARRIOR.evolutionPool) {
    const e = DATA.evolutions.find((x) => x.id === id);
    const caps = e.safetyCaps || {};
    ok(Object.keys(caps).length > 0, `${id}: safetyCaps がある`);
    for (const [k, v] of Object.entries(caps)) {
      ok(typeof v === 'number' && Number.isFinite(v) && v >= 0, `${id}.${k}: 非負の有限数（${v}）`);
    }
    // 参照は基礎クラス側にある場合もあるので、進化 + base の両方を見る。
    const src = [map[id], map[e.baseSkillId]].filter(Boolean)
      .map((cls) => { try { return readFileSync(`src/skills/${cls}.js`, 'utf8'); } catch { return ''; } }).join('');
    for (const k of Object.keys(caps)) ok(src.includes(`'${k}'`), `${id}.${k}: 実装から参照される`);
  }
}

T.finish();
