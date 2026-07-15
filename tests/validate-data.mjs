// Data validation for Reincarnation Flame Survivor.
// Uses only Node.js standard modules (no external dependencies).
// Run: node tests/validate-data.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

const errors = [];
const warnings = [];
function err(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

function loadJson(name) {
  const path = join(dataDir, name);
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    err(`${name}: ファイルを読み込めません (${e.message})`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    err(`${name}: JSON構文エラー (${e.message})`);
    return null;
  }
}

function requireFields(name, obj, fields, ctx = '') {
  for (const f of fields) {
    if (obj == null || !(f in obj)) {
      err(`${name}: 必須項目が不足 "${f}" ${ctx}`);
    }
  }
}

function checkDuplicateIds(name, list, key = 'id') {
  const seen = new Set();
  for (const item of list || []) {
    const id = item?.[key];
    if (id == null) continue;
    if (seen.has(id)) err(`${name}: ID重複 "${id}"`);
    seen.add(id);
  }
  return seen;
}

// --- balance.json ---
const balance = loadJson('balance.json');
if (balance) {
  requireFields('balance.json', balance, ['saveVersion', 'gameVersion', 'player', 'run', 'leveling', 'difficulties']);
  if (typeof balance.saveVersion !== 'number' || balance.saveVersion < 1) {
    err('balance.json: saveVersion が未定義または不正');
  }
  const diffIds = new Set();
  for (const d of balance.difficulties || []) {
    requireFields('balance.json', d, ['id', 'name', 'enemyHp', 'enemyDamage', 'enemySpeed', 'spawnRate', 'bossHp', 'currency', 'reincarnationEfficiency', 'unlockAfter'], `(difficulty ${d?.id})`);
    if (diffIds.has(d.id)) err(`balance.json: 難易度ID重複 "${d.id}"`);
    diffIds.add(d.id);
    for (const mkey of ['enemyHp', 'enemyDamage', 'enemySpeed', 'spawnRate', 'bossHp', 'currency', 'reincarnationEfficiency']) {
      if (typeof d[mkey] !== 'number' || d[mkey] <= 0) {
        err(`balance.json: 難易度 ${d.id} の倍率 "${mkey}" が不正 (${d[mkey]})`);
      }
    }
  }
  for (const d of balance.difficulties || []) {
    if (d.unlockAfter != null && !diffIds.has(d.unlockAfter)) {
      err(`balance.json: 難易度 ${d.id} の unlockAfter "${d.unlockAfter}" が存在しない難易度を参照`);
    }
  }
  // 残り火報酬設定（M3）
  requireFields('balance.json', balance.emberReward, ['perSecond', 'perKill', 'perBossKill', 'winBonus', 'winMultiplier', 'defeatMultiplier'], '(emberReward)');
  if (balance.emberReward) {
    if (balance.emberReward.defeatMultiplier > balance.emberReward.winMultiplier) {
      err('balance.json: emberReward.defeatMultiplier は winMultiplier 以下である必要がある（敗北時は少なく）');
    }
  }
}

// --- enemies.json ---
const enemiesData = loadJson('enemies.json');
let enemyIds = new Set();
if (enemiesData) {
  requireFields('enemies.json', enemiesData, ['enemies']);
  enemyIds = checkDuplicateIds('enemies.json', enemiesData.enemies);
  for (const e of enemiesData.enemies || []) {
    requireFields('enemies.json', e, ['id', 'name', 'behavior', 'hp', 'speed', 'damage', 'xp'], `(enemy ${e?.id})`);
    if (typeof e.hp === 'number' && e.hp <= 0) err(`enemies.json: 敵 ${e.id} のHPが不正 (${e.hp})`);
    if (typeof e.damageReduction === 'number' && (e.damageReduction < 0 || e.damageReduction >= 1)) {
      err(`enemies.json: 敵 ${e.id} の damageReduction が範囲外 (${e.damageReduction})`);
    }
  }
}

// --- bosses.json ---
const bossesData = loadJson('bosses.json');
if (bossesData) {
  requireFields('bosses.json', bossesData, ['bosses']);
  checkDuplicateIds('bosses.json', bossesData.bosses);
  for (const b of bossesData.bosses || []) {
    requireFields('bosses.json', b, ['id', 'name', 'hp', 'speed', 'damage'], `(boss ${b?.id})`);
    for (const s of b.summons || []) {
      if (!enemyIds.has(s)) err(`bosses.json: ボス ${b.id} が存在しない敵 "${s}" を召喚参照`);
    }
  }
}

// --- skills.json ---
const skillsData = loadJson('skills.json');
let skillIds = new Set();
if (skillsData) {
  requireFields('skills.json', skillsData, ['skills']);
  skillIds = checkDuplicateIds('skills.json', skillsData.skills);
  for (const s of skillsData.skills || []) {
    requireFields('skills.json', s, ['id', 'name', 'maxLevel', 'levels'], `(skill ${s?.id})`);
    if (typeof s.maxLevel !== 'number' || s.maxLevel < 1 || s.maxLevel > 20) {
      err(`skills.json: スキル ${s.id} の maxLevel が不正 (${s.maxLevel})`);
    }
    if (Array.isArray(s.levels)) {
      if (s.levels.length !== s.maxLevel) {
        err(`skills.json: スキル ${s.id} の levels 数 (${s.levels.length}) が maxLevel (${s.maxLevel}) と不一致`);
      }
      s.levels.forEach((lv, i) => {
        if (lv.level !== i + 1) err(`skills.json: スキル ${s.id} の levels[${i}].level が連番でない (${lv.level})`);
        if (typeof lv.cooldown === 'number' && lv.cooldown < 0) {
          err(`skills.json: スキル ${s.id} lv${lv.level} のクールダウンが負 (${lv.cooldown})`);
        }
        if (typeof lv.damage === 'number' && lv.damage < 0) {
          err(`skills.json: スキル ${s.id} lv${lv.level} のダメージが負 (${lv.damage})`);
        }
      });
    }
  }
  // evolution references
  for (const s of skillsData.skills || []) {
    const evo = s.evolution;
    if (!evo) continue;
    requireFields('skills.json', evo, ['id', 'name', 'requires'], `(evolution of ${s.id})`);
    for (const req of evo.requires || []) {
      if (!skillIds.has(req.skill)) {
        err(`skills.json: 進化 ${evo.id} が存在しないスキル "${req.skill}" を参照`);
      }
      if (typeof req.level !== 'number' || req.level < 1) {
        err(`skills.json: 進化 ${evo.id} の要求レベルが不正 (${req.level})`);
      }
    }
  }
}

// --- permanent-upgrades.json ---
const KNOWN_EFFECT_TYPES = new Set([
  'maxHpAdd', 'damageMult', 'moveSpeedMult', 'xpMult', 'pickupMult',
  'dashRechargeMult', 'invulnMult', 'emberMult', 'autoMoveSkill', 'startSkillLevel',
]);
const upgradesData = loadJson('permanent-upgrades.json');
if (upgradesData) {
  requireFields('permanent-upgrades.json', upgradesData, ['upgrades']);
  checkDuplicateIds('permanent-upgrades.json', upgradesData.upgrades);
  for (const u of upgradesData.upgrades || []) {
    requireFields('permanent-upgrades.json', u, ['id', 'displayName', 'maxLevel', 'baseCost', 'costGrowth', 'effectType', 'effectPerLevel', 'displayOrder'], `(upgrade ${u?.id})`);
    if (typeof u.maxLevel !== 'number' || u.maxLevel < 1 || u.maxLevel > 100) err(`permanent-upgrades.json: ${u.id} の maxLevel が不正 (${u.maxLevel})`);
    if (typeof u.baseCost === 'number' && u.baseCost < 0) err(`permanent-upgrades.json: ${u.id} の baseCost が負 (${u.baseCost})`);
    if (typeof u.costGrowth === 'number' && u.costGrowth < 1) err(`permanent-upgrades.json: ${u.id} の costGrowth が 1 未満 (${u.costGrowth})`);
    if (u.effectType && !KNOWN_EFFECT_TYPES.has(u.effectType)) err(`permanent-upgrades.json: ${u.id} の未知の effectType "${u.effectType}"`);
  }
}

// --- skill-mastery.json ---
const masteryData = loadJson('skill-mastery.json');
if (masteryData) {
  requireFields('skill-mastery.json', masteryData, ['maxLevel', 'exp', 'rewards']);
  if (typeof masteryData.maxLevel !== 'number' || masteryData.maxLevel < 1) err('skill-mastery.json: maxLevel が不正');
  requireFields('skill-mastery.json', masteryData.exp, ['perDamage', 'perHit', 'perKill', 'perRun', 'curveBase', 'curveGrowth'], '(exp)');
  if (masteryData.exp && (typeof masteryData.exp.curveGrowth !== 'number' || masteryData.exp.curveGrowth <= 1)) {
    err('skill-mastery.json: exp.curveGrowth は 1 より大きい必要がある');
  }
}

// --- skill-evolutions.json（M4） ---
const REINC_EFFECT_TYPES = new Set([
  'levelUpChoices', 'startDamageMult', 'startSkillLevel', 'chainCount', 'enemyDensity',
  'effectCap', 'permCap', 'speedMode', 'autoDash', 'startEmber',
]);
const evoData = loadJson('skill-evolutions.json');
if (evoData) {
  requireFields('skill-evolutions.json', evoData, ['evolutions']);
  const evoIds = checkDuplicateIds('skill-evolutions.json', evoData.evolutions);
  const baseIds = new Set();
  for (const ev of evoData.evolutions || []) {
    requireFields('skill-evolutions.json', ev, ['id', 'displayName', 'baseSkillId', 'requiredSkills', 'requiredMasteryLevel', 'replacementSkillId', 'safetyCaps', 'displayOrder'], `(evolution ${ev?.id})`);
    if (ev.baseSkillId && !skillIds.has(ev.baseSkillId)) err(`skill-evolutions.json: 進化 ${ev.id} が存在しない基礎スキル "${ev.baseSkillId}" を参照`);
    if (baseIds.has(ev.baseSkillId)) err(`skill-evolutions.json: 基礎スキル "${ev.baseSkillId}" に複数の進化が定義されている`);
    baseIds.add(ev.baseSkillId);
    if (typeof ev.requiredMasteryLevel !== 'number' || ev.requiredMasteryLevel < 0) err(`skill-evolutions.json: 進化 ${ev.id} の requiredMasteryLevel が不正`);
    for (const req of ev.requiredSkills || []) {
      if (!skillIds.has(req.skill)) err(`skill-evolutions.json: 進化 ${ev.id} が存在しない補助スキル "${req.skill}" を参照`);
      if (typeof req.level !== 'number' || req.level < 1 || req.level > 8) err(`skill-evolutions.json: 進化 ${ev.id} の補助スキル要求レベルが不正 (${req.level})`);
    }
    // 循環参照: 進化先が別の進化の基礎スキルになっていない（進化の連鎖ループ防止）
    if (ev.replacementSkillId && skillIds.has(ev.replacementSkillId)) {
      err(`skill-evolutions.json: 進化 ${ev.id} の replacementSkillId "${ev.replacementSkillId}" が基礎スキルと衝突（循環参照の恐れ）`);
    }
    if (evoIds.has(ev.baseSkillId)) err(`skill-evolutions.json: 進化 ${ev.id} の基礎スキルが別の進化ID（循環参照）`);
    // 安全上限の負値チェック
    for (const [k, v] of Object.entries(ev.safetyCaps || {})) {
      if (typeof v === 'number' && v < 0) err(`skill-evolutions.json: 進化 ${ev.id} の safetyCaps.${k} が負 (${v})`);
    }
  }
}

// --- reincarnation.json（M4） ---
const reincData = loadJson('reincarnation.json');
if (reincData) {
  requireFields('reincarnation.json', reincData, ['nodes', 'unlock', 'soulflame']);
  requireFields('reincarnation.json', reincData.unlock, ['clearDifficulty', 'totalEmber'], '(unlock)');
  const nodeIds = checkDuplicateIds('reincarnation.json', reincData.nodes);
  for (const n of reincData.nodes || []) {
    requireFields('reincarnation.json', n, ['id', 'displayName', 'maxLevel', 'baseCost', 'costGrowth', 'effectType', 'effectPerLevel', 'displayOrder'], `(node ${n?.id})`);
    if (typeof n.maxLevel !== 'number' || n.maxLevel < 1) err(`reincarnation.json: ノード ${n.id} の maxLevel が不正 (${n.maxLevel})`);
    if (typeof n.baseCost === 'number' && n.baseCost < 0) err(`reincarnation.json: ノード ${n.id} の baseCost が負 (${n.baseCost})`);
    if (n.effectType && !REINC_EFFECT_TYPES.has(n.effectType)) err(`reincarnation.json: ノード ${n.id} の未知の effectType "${n.effectType}"`);
    if (n.prerequisite != null && !nodeIds.has(n.prerequisite)) err(`reincarnation.json: ノード ${n.id} が存在しない前提ノード "${n.prerequisite}" を参照`);
  }
}

// --- report ---
if (warnings.length) {
  console.log('--- 警告 ---');
  for (const w of warnings) console.log('  ⚠ ' + w);
}
if (errors.length) {
  console.error('--- データ検証エラー ---');
  for (const e of errors) console.error('  ✗ ' + e);
  console.error(`\n${errors.length} 件のエラーが見つかりました。`);
  process.exit(1);
} else {
  console.log(`✓ データ検証に成功しました (${errors.length} エラー, ${warnings.length} 警告)。`);
  process.exit(0);
}
