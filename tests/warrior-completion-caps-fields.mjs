// 戦士 完成監査 19/23: skillCaps / 死にフィールド（M8-F §21）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-caps-fields.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA, WARRIOR, REPO, runner } from './warrior-common.mjs';
const T = runner('戦士 cap / 死にフィールド 完成監査（M8-F）');
const { ok, section, info } = T;
const CAPS = DATA.balance.skillCaps;
const Q = ['low', 'medium', 'high', 'ultra'];
let SRC = '';
for (const d of ['src/skills', 'src/systems', 'src/scenes', 'src/entities', 'src/ui', 'src/config']) {
  for (const f of readdirSync(join(REPO, d))) if (f.endsWith('.js')) SRC += readFileSync(join(REPO, d, f), 'utf8');
}
const referenced = (k) => SRC.includes(`'${k}'`) || SRC.includes(`"${k}"`) || SRC.includes(`.${k}`) || SRC.includes(`${k}:`);

// ===== 1. skillCaps の形 =====
section('1. skillCaps 全 217 件が 4 段階・正数・単調非減少');
{
  const names = Object.keys(CAPS);
  ok(names.length > 200, `skillCaps ${names.length} 件`);
  for (const name of names) {
    const c = CAPS[name];
    for (const q of Q) ok(typeof c[q] === 'number' && Number.isFinite(c[q]) && c[q] > 0, `${name}.${q}: 正の有限数（${c[q]}）`);
    ok(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra, `${name}: low ≤ medium ≤ high ≤ ultra`);
    ok(Object.keys(c).every((k) => Q.includes(k)), `${name}: 余分なキーが無い（${Object.keys(c).join(',')}）`);
  }
}

// ===== 2. 未参照 cap 0 / 予約 0 =====
section('2. 未参照の cap が 0 件・予約 cap が 0 件');
{
  const unused = Object.keys(CAPS).filter((k) => !SRC.includes(`'${k}'`) && !SRC.includes(`"${k}"`));
  ok(unused.length === 0, `未参照の skillCaps が 0 件（${unused.join(',') || 'なし'}）`);
  // 逆方向: 実装が読むのに data に無い cap（既定値だけで動いている cap）を洗い出す。
  const used = new Set();
  for (const m of SRC.matchAll(/skillCap\(\s*'([a-zA-Z0-9_]+)'/g)) used.add(m[1]);
  for (const m of SRC.matchAll(/this\.cap\(\s*'([a-zA-Z0-9_]+)'/g)) used.add(m[1]);
  const missing = [...used].filter((k) => !CAPS[k] && !k.startsWith('max') === false && !CAPS[k]);
  // safetyCaps（進化ごと）は skillCaps とは別なので、skillCap() 経由のものだけを見る。
  const viaSkillCap = new Set();
  for (const m of SRC.matchAll(/skillCap\(\s*'([a-zA-Z0-9_]+)'/g)) viaSkillCap.add(m[1]);
  const notInData = [...viaSkillCap].filter((k) => !CAPS[k]);
  ok(notInData.length === 0, `skillCap() が読むのに data に無い cap が 0 件（${notInData.join(',') || 'なし'}）`);
  void missing;
  info(`skillCap() 経由で参照される cap: ${viaSkillCap.size} 件 / data ${Object.keys(CAPS).length} 件`);
}

// ===== 3. event / visual の区別 =====
section('3. event 系と visual 系が区別され、visual は数値に影響しない');
{
  const VISUAL = Object.keys(CAPS).filter((k) => /Visual|Trail|Spark|Ring|Aura|Marker|Dust|Spin|Arc\b/.test(k));
  ok(VISUAL.length > 10, `visual 系の cap が ${VISUAL.length} 件`);
  // visual cap は damage / poise / combo / fury の計算に使われていない。
  for (const name of VISUAL) {
    const idx = SRC.indexOf(`'${name}'`);
    if (idx < 0) continue;
    const around = SRC.slice(Math.max(0, idx - 300), idx + 300);
    ok(!/damage\s*[:=]\s*[^,\n]*skillCap/.test(around), `${name}: ダメージ計算に使われていない`);
  }
  ok(CAPS.maxDeflectSparkVisuals && CAPS.maxThrustTrails, 'M8-E の visual cap がある');
}

// ===== 4. 戦士 data の死にフィールド 0 =====
section('4. 戦士 data（skills / evolutions / passives / balance.warrior）に死にフィールドが無い');
{
  const dead = [];
  const IGNORE = new Set(['_comment']);
  for (const id of WARRIOR.activeSkillPool) {
    const s = DATA.skills.find((x) => x.id === id);
    const keys = new Set();
    for (const lv of s.levels || []) for (const k of Object.keys(lv)) keys.add(k);
    for (const k of Object.keys(s.config || {})) keys.add(k);
    for (const k of keys) if (!IGNORE.has(k) && !referenced(k)) dead.push(`skills.${id}.${k}`);
  }
  for (const id of WARRIOR.evolutionPool) {
    const e = DATA.evolutions.find((x) => x.id === id);
    for (const k of Object.keys(e.safetyCaps || {})) if (!IGNORE.has(k) && !referenced(k)) dead.push(`evolutions.${id}.safetyCaps.${k}`);
  }
  for (const id of WARRIOR.passiveSkillPool || []) {
    const p = DATA.passives.find((x) => x.id === id);
    for (const m of p.modifiers || []) if (!referenced(m.key)) dead.push(`passives.${id}.${m.key}`);
  }
  const walk = (o, path) => {
    for (const [k, v] of Object.entries(o)) {
      if (IGNORE.has(k)) continue;
      if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, `${path}.${k}`);
      else if (!referenced(k)) dead.push(`balance.warrior${path}.${k}`);
    }
  };
  walk(DATA.balance.warrior, '');
  ok(dead.length === 0, `死にフィールドが 0 件（${dead.join(', ') || 'なし'}）`);
  info(`検査した戦士 data: active${WARRIOR.activeSkillPool.length} / evolution${WARRIOR.evolutionPool.length} / passive${(WARRIOR.passiveSkillPool || []).length} / balance.warrior ${Object.keys(DATA.balance.warrior).length} ブロック`);
}

// ===== 5. fallback だけで本値が未使用でない =====
section('5. balance.warrior の値が実際に使われている（既定値だけで動いていない）');
{
  // WARRIOR_DEFAULTS の値と data の値が異なるキーを選び、data 側が優先されることを確かめる。
  const wsrc = readFileSync(join(REPO, 'src/systems/WarriorCombatSystem.js'), 'utf8');
  ok(/WARRIOR_DEFAULTS/.test(wsrc), '既定値が定義されている（balance を渡さなくても落ちない）');
  ok(/this\.cfg = \{[\s\S]{0,200}config/.test(wsrc) || /config \|\| WARRIOR_DEFAULTS|deepMerge|mergeDefaults/.test(wsrc),
    'data の config が既定値より優先される経路がある');
  // 主要な上限が data 由来であること（ハードコードされていない）。
  for (const [block, key] of [['line', 'maxLineLength'], ['duel', 'maxDurationMs'], ['trance', 'combinedOffenseCap'],
    ['deflection', 'maxDeflectionsPerWindow'], ['march', 'maxStomps'], ['mitigation', 'maxTotalReduction'],
    ['fury', 'max'], ['killHeal', 'perSecondCapPercent'], ['unyielding', 'cooldownMs']]) {
    ok(DATA.balance.warrior[block] && DATA.balance.warrior[block][key] !== undefined,
      `balance.warrior.${block}.${key} が data にある（${DATA.balance.warrior[block][key]}）`);
    ok(wsrc.includes(key), `${key} が実装から読まれる`);
  }
}

// ===== 6. NaN / Infinity / 負数が無い =====
section('6. 戦士 data に NaN / Infinity / 想定外の負数が無い');
{
  const bad = [];
  const NEG_OK = new Set(['mitigationPenalty', 'backMultiplier', 'minMitigationAfterPenalty']);
  const scan = (o, path) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object') scan(v, `${path}.${k}`);
      else if (typeof v === 'number') {
        if (!Number.isFinite(v)) bad.push(`${path}.${k}=${v}`);
        else if (v < 0 && !NEG_OK.has(k)) bad.push(`${path}.${k}=${v}（負数）`);
      }
    }
  };
  for (const id of WARRIOR.activeSkillPool) scan(DATA.skills.find((x) => x.id === id), `skills.${id}`);
  for (const id of WARRIOR.evolutionPool) scan(DATA.evolutions.find((x) => x.id === id), `evolutions.${id}`);
  for (const id of WARRIOR.passiveSkillPool || []) scan(DATA.passives.find((x) => x.id === id), `passives.${id}`);
  scan(DATA.balance.warrior, 'balance.warrior');
  scan(CAPS, 'skillCaps');
  ok(bad.length === 0, `NaN / Infinity / 負数が 0 件（${bad.join(', ') || 'なし'}）`);
}

// ===== 7. data → balance → runtime → telemetry の接続 =====
section('7. data の成長軸が runtime と telemetry まで届いている');
{
  const wsrc = readFileSync(join(REPO, 'src/systems/WarriorCombatSystem.js'), 'utf8');
  const CHAIN = [
    ['line', 'maxLineLength', 'lineThrusts'],
    ['duel', 'maxDurationMs', 'duelUptimeMs'],
    ['trance', 'maxMitigationPenalty', 'trancePenaltySum'],
    ['deflection', 'maxDeflectionsPerWindow', 'deflectCapReached'],
    ['march', 'maxStomps', 'marchStomps'],
    ['launch', 'maxAirborneMs', 'launches'],
    ['rally', 'maxDurationMs', 'rallyUptimeMs'],
    ['poise', 'boss', 'bossStanceBreaks'],
  ];
  for (const [block, key, tel] of CHAIN) {
    ok(DATA.balance.warrior[block] !== undefined, `balance.warrior.${block} がある`);
    ok(wsrc.includes(key), `${key} が実装から読まれる`);
    ok(wsrc.includes(tel), `${tel} がテレメトリにある`);
  }
}

// ===== 8. 進化の safetyCaps =====
section('8. 進化の safetyCaps が非負でありすべて参照される');
{
  let total = 0;
  for (const id of WARRIOR.evolutionPool) {
    const e = DATA.evolutions.find((x) => x.id === id);
    const caps = e.safetyCaps || {};
    ok(Object.keys(caps).length > 0, `${id}: safetyCaps がある（${Object.keys(caps).length} 件）`);
    for (const [k, v] of Object.entries(caps)) {
      total++;
      ok(typeof v === 'number' && Number.isFinite(v) && v >= 0, `${id}.${k}: 非負の有限数（${v}）`);
      ok(SRC.includes(`'${k}'`), `${id}.${k}: 実装から参照される`);
    }
  }
  info(`進化の safetyCaps 合計 ${total} 件（すべて参照済み）`);
}

T.finish();
