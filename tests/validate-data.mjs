// Data validation for Reincarnation Flame Survivor.
// Uses only Node.js standard modules (no external dependencies).
// Run: node tests/validate-data.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
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

  // --- 空間グリッド設定（M5-A） ---
  const QUALITIES = ['low', 'medium', 'high', 'ultra'];
  const eq = balance.effectQuality || {};
  const sg = balance.spatialGrid;
  requireFields('balance.json', sg, ['cellSize', 'maxRegistered', 'enabledByDefault'], '(spatialGrid)');
  if (sg) {
    if (typeof sg.cellSize !== 'number' || sg.cellSize <= 0 || !Number.isInteger(sg.cellSize)) {
      err(`balance.json: spatialGrid.cellSize は正の整数である必要がある (${sg.cellSize})`);
    }
    if (typeof sg.maxRegistered !== 'number' || sg.maxRegistered <= 0) {
      err(`balance.json: spatialGrid.maxRegistered は正の数である必要がある (${sg.maxRegistered})`);
    }
    if (typeof sg.enabledByDefault !== 'boolean') {
      err('balance.json: spatialGrid.enabledByDefault は真偽値である必要がある');
    }
    // 登録上限は同時出現しうる敵の最大数（品質別 maxEnemies の最大）以上であること。
    const maxEnemyCap = Math.max(0, ...QUALITIES.map((q) => (eq[q] && eq[q].maxEnemies) || 0));
    if (typeof sg.maxRegistered === 'number' && maxEnemyCap > 0 && sg.maxRegistered < maxEnemyCap) {
      err(`balance.json: spatialGrid.maxRegistered (${sg.maxRegistered}) が最大同時敵数 (${maxEnemyCap}) を下回っている`);
    }
  }

  // --- エフェクト品質の上限（M5-A: プール上限/品質別上限の整合） ---
  // 各品質に必須の上限があり、正の数であること。負の検索距離につながる不正値を弾く。
  for (const q of QUALITIES) {
    const c = eq[q];
    if (!c) { err(`balance.json: effectQuality.${q} が未定義`); continue; }
    requireFields('balance.json', c, ['maxEnemies', 'maxProjectiles', 'maxSparksPerBurst', 'particleScale'], `(effectQuality.${q})`);
    for (const k of ['maxEnemies', 'maxProjectiles', 'maxSparksPerBurst']) {
      if (typeof c[k] !== 'number' || c[k] <= 0 || !Number.isInteger(c[k])) {
        err(`balance.json: effectQuality.${q}.${k} は正の整数である必要がある (${c[k]})`);
      }
    }
    if (typeof c.particleScale !== 'number' || c.particleScale < 0) {
      err(`balance.json: effectQuality.${q}.particleScale が負 (${c.particleScale})`);
    }
  }
  // 品質が上がるほど上限は同等以上であること（low > medium などの逆転を検出）。
  const pb = (balance.combatCaps && balance.combatCaps.particleBudget) || {};
  const ORDERED = ['low', 'medium', 'high', 'ultra'];
  const monotonic = (getVal, label) => {
    for (let i = 1; i < ORDERED.length; i++) {
      const a = getVal(ORDERED[i - 1]), b = getVal(ORDERED[i]);
      if (typeof a === 'number' && typeof b === 'number' && a > b) {
        err(`balance.json: ${label} が品質順で逆転 (${ORDERED[i - 1]}=${a} > ${ORDERED[i]}=${b})`);
      }
    }
  };
  monotonic((q) => eq[q] && eq[q].maxEnemies, 'effectQuality.maxEnemies');
  monotonic((q) => eq[q] && eq[q].maxProjectiles, 'effectQuality.maxProjectiles');
  monotonic((q) => eq[q] && eq[q].maxSparksPerBurst, 'effectQuality.maxSparksPerBurst');
  monotonic((q) => pb[q], 'combatCaps.particleBudget');

  // --- 保存設定（M5-B） ---
  const save = balance.save;
  requireFields('balance.json', save, ['formatVersion', 'exportFormatVersion', 'folderName', 'maxAutoBackups', 'maxManualBackups', 'autoBackupMinIntervalSec', 'maxImportBytes', 'autosaveDebounceMs'], '(save)');
  if (save) {
    for (const k of ['formatVersion', 'exportFormatVersion']) {
      if (typeof save[k] !== 'number' || save[k] < 1 || !Number.isInteger(save[k])) err(`balance.json: save.${k} は正の整数である必要がある (${save[k]})`);
    }
    for (const k of ['maxAutoBackups', 'maxManualBackups']) {
      if (typeof save[k] !== 'number' || save[k] < 1 || !Number.isInteger(save[k])) err(`balance.json: save.${k} は 1 以上の整数である必要がある (${save[k]})`);
    }
    if (typeof save.autoBackupMinIntervalSec !== 'number' || save.autoBackupMinIntervalSec < 0) err(`balance.json: save.autoBackupMinIntervalSec が負または不正 (${save.autoBackupMinIntervalSec})`);
    if (typeof save.maxImportBytes !== 'number' || save.maxImportBytes <= 0) err(`balance.json: save.maxImportBytes は正の数である必要がある (${save.maxImportBytes})`);
    if (typeof save.autosaveDebounceMs !== 'number' || save.autosaveDebounceMs < 0) err(`balance.json: save.autosaveDebounceMs が負または不正 (${save.autosaveDebounceMs})`);
    if (typeof save.folderName !== 'string' || !save.folderName) err('balance.json: save.folderName が空');
  }
  // save_version は M5-B で 5（既存の >=1 検証に加え、後方互換で移行できる版であることを明示）。
  if (typeof balance.saveVersion === 'number' && balance.saveVersion < 5) {
    warn(`balance.json: saveVersion が ${balance.saveVersion}（M5-B は 5 を想定）`);
  }

  // --- combatCaps（毎フレーム安全上限）と particleBudget の整合 ---
  const cc = balance.combatCaps;
  if (cc) {
    for (const k of ['maxAoePerFrame', 'maxDamageNumbersPerFrame', 'maxExtraFireballs', 'maxDeathExplosionChain', 'maxInfectGenerations']) {
      if (k in cc && (typeof cc[k] !== 'number' || cc[k] < 0)) {
        err(`balance.json: combatCaps.${k} が負または不正 (${cc[k]})`);
      }
    }
    for (const q of QUALITIES) {
      if (!(q in pb)) err(`balance.json: combatCaps.particleBudget.${q} が未定義`);
      else if (typeof pb[q] !== 'number' || pb[q] < 0) err(`balance.json: combatCaps.particleBudget.${q} が負または不正 (${pb[q]})`);
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
  'effectCap', 'permCap', 'speedMode', 'autoDash', 'startEmber', 'activeSlots',
]);
const evoData = loadJson('skill-evolutions.json');
// 補助スキルは active(skills) と passive(passives) の両方を許容する（M6-B: 進化条件にパッシブを使用）。
const auxSkillIds = new Set(skillIds);
{
  const pv = loadJson('passives.json');
  for (const p of (pv && pv.passives) || []) auxSkillIds.add(p.id);
}
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
      if (!auxSkillIds.has(req.skill)) err(`skill-evolutions.json: 進化 ${ev.id} が存在しない補助スキル/パッシブ "${req.skill}" を参照`);
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

// --- Milestone 6-A: skill-config / passives / jobs / スキル抽選メタ ---
const RARITIES = new Set(['common', 'uncommon', 'rare', 'legendary']);
const CATEGORIES = new Set(['active', 'passive']);
const skillCfg = loadJson('skill-config.json');
const passivesData = loadJson('passives.json');
const jobsData = loadJson('jobs.json');
const MODIFIER_KEYS = new Set((skillCfg && skillCfg.modifierKeys) || []);
const catalogIds = new Set();
const passiveIds = new Set();

if (skillCfg) {
  requireFields('skill-config.json', skillCfg, ['rarityWeights', 'rarityOrder', 'slots', 'draft']);
  for (const r of RARITIES) {
    const w = skillCfg.rarityWeights && skillCfg.rarityWeights[r];
    if (typeof w !== 'number' || w <= 0) err(`skill-config.json: rarityWeights.${r} が正の数でない (${w})`);
  }
  const sl = skillCfg.slots || {};
  if (typeof sl.baseActiveSlots !== 'number' || sl.baseActiveSlots < 1) err('skill-config.json: slots.baseActiveSlots が不正');
  if (typeof sl.basePassiveSlots !== 'number' || sl.basePassiveSlots < 1) err('skill-config.json: slots.basePassiveSlots が不正');
  const dr = skillCfg.draft || {};
  for (const k of ['baseRerolls', 'baseBanishes', 'baseSkips']) if (typeof dr[k] !== 'number' || dr[k] < 0) err(`skill-config.json: draft.${k} が不正 (${dr[k]})`);
}

// active スキル（skills.json）の抽選メタ
if (skillsData) {
  for (const s of skillsData.skills || []) {
    catalogIds.add(s.id);
    if (s.category && !CATEGORIES.has(s.category)) err(`skills.json: ${s.id} の category が不正 (${s.category})`);
    if (s.rarity && !RARITIES.has(s.rarity)) err(`skills.json: ${s.id} の rarity が不正 (${s.rarity})`);
    if (s.weight != null && (typeof s.weight !== 'number' || s.weight < 0)) err(`skills.json: ${s.id} の weight が不正 (${s.weight})`);
    if (s.prerequisites && !Array.isArray(s.prerequisites)) err(`skills.json: ${s.id} の prerequisites が配列でない`);
    if (Array.isArray(s.conflicts) && s.conflicts.includes(s.id)) err(`skills.json: ${s.id} が自分自身と conflict`);
    for (const eb of s.evolutionBranches || []) {
      const evoOk = ((evoData && evoData.evolutions) || []).some((e) => e.id === eb) || (skillsData.skills || []).some((x) => x.evolution && x.evolution.id === eb);
      if (!evoOk) err(`skills.json: ${s.id} の evolutionBranches "${eb}" が存在しない進化`);
    }
  }
}

// passives.json
if (passivesData) {
  requireFields('passives.json', passivesData, ['passives']);
  checkDuplicateIds('passives.json', passivesData.passives);
  for (const p of passivesData.passives || []) {
    requireFields('passives.json', p, ['id', 'displayName', 'category', 'rarity', 'maxLevel', 'modifiers', 'enabled', 'isCommon'], `(passive ${p?.id})`);
    passiveIds.add(p.id); catalogIds.add(p.id);
    if (p.category !== 'passive') err(`passives.json: ${p.id} は category=passive である必要`);
    if (p.rarity && !RARITIES.has(p.rarity)) err(`passives.json: ${p.id} の rarity が不正 (${p.rarity})`);
    if (typeof p.maxLevel !== 'number' || p.maxLevel < 1) err(`passives.json: ${p.id} の maxLevel が不正 (${p.maxLevel})`);
    if (Array.isArray(p.conflicts) && p.conflicts.includes(p.id)) err(`passives.json: ${p.id} が自分自身と conflict`);
    for (const m of p.modifiers || []) {
      if (!m.key || (MODIFIER_KEYS.size && !MODIFIER_KEYS.has(m.key))) err(`passives.json: ${p.id} の modifier key "${m.key}" が未知`);
      if (typeof m.perLevel !== 'number') err(`passives.json: ${p.id} の modifier perLevel が数値でない`);
    }
  }
}

// jobs.json（必須項目・初期スキルがプールに存在・プールID整合）
if (jobsData) {
  requireFields('jobs.json', jobsData, ['jobs']);
  checkDuplicateIds('jobs.json', jobsData.jobs);
  for (const j of jobsData.jobs || []) {
    requireFields('jobs.json', j, ['id', 'displayName', 'initialActiveSkills', 'initialPassiveSkills', 'activeSkillPool', 'passiveSkillPool', 'baseActiveSlots', 'basePassiveSlots'], `(job ${j?.id})`);
    if (typeof j.baseActiveSlots !== 'number' || j.baseActiveSlots < 1) err(`jobs.json: ${j.id} の baseActiveSlots が不正`);
    if (typeof j.basePassiveSlots !== 'number' || j.basePassiveSlots < 1) err(`jobs.json: ${j.id} の basePassiveSlots が不正`);
    for (const id of j.activeSkillPool || []) if (!catalogIds.has(id)) err(`jobs.json: ${j.id} の activeSkillPool "${id}" が存在しない`);
    for (const id of j.passiveSkillPool || []) if (!catalogIds.has(id)) err(`jobs.json: ${j.id} の passiveSkillPool "${id}" が存在しない`);
    for (const id of j.initialActiveSkills || []) {
      if (!catalogIds.has(id)) err(`jobs.json: ${j.id} の initialActiveSkills "${id}" が存在しない`);
      else if (!(j.activeSkillPool || []).includes(id)) err(`jobs.json: ${j.id} の初期スキル "${id}" が activeSkillPool に含まれない`);
    }
    for (const id of j.initialPassiveSkills || []) {
      if (!catalogIds.has(id)) err(`jobs.json: ${j.id} の initialPassiveSkills "${id}" が存在しない`);
      else if (!(j.passiveSkillPool || []).includes(id) && !passiveIds.has(id)) err(`jobs.json: ${j.id} の初期passive "${id}" が passiveSkillPool/共通passive に含まれない`);
    }
  }
}

// --- M7-B 追加監査: passive のジョブ分離（暗黙の共通扱いを禁止・passiveSkillPool を正とする）---
if (passivesData && jobsData) {
  const jobsList = jobsData.jobs || [];
  const jobIdSet = new Set(jobsList.map((j) => j.id));
  const poolOf = (jid) => new Set((jobsList.find((j) => j.id === jid) || {}).passiveSkillPool || []);
  for (const p of passivesData.passives || []) {
    const jobsArr = Array.isArray(p.jobs) ? p.jobs : [];
    const explicitCommon = p.isCommon === true || jobsArr.includes('*');
    if (!explicitCommon) {
      // jobs 未指定（空）を暗黙の全ジョブ共通として扱わない: 専用passive は jobs を明示すること。
      if (jobsArr.length === 0) err(`passives.json: ${p.id} は isCommon:false かつ jobs 未指定（暗黙の共通は禁止。jobs:["<jobId>"] もしくは isCommon:true / jobs:["*"] を明示）`);
      for (const jid of jobsArr) {
        if (jid === '*') continue;
        if (!jobIdSet.has(jid)) err(`passives.json: ${p.id} の jobs "${jid}" が実在しないジョブ`);
        else if (!poolOf(jid).has(p.id)) err(`passives.json: ${p.id} は jobs に ${jid} を持つが ${jid}.passiveSkillPool に無い（jobs とプールの不一致）`);
      }
    }
  }
  // 各ジョブの passiveSkillPool の中身は「そのジョブ専用（jobs に自身を含む）」または「明示的共通」であること（他ジョブ専用passive の混入禁止）。
  for (const j of jobsList) {
    for (const id of j.passiveSkillPool || []) {
      const p = (passivesData.passives || []).find((x) => x.id === id);
      if (!p) continue; // 存在チェックは既存の別ブロックで実施
      const jobsArr = Array.isArray(p.jobs) ? p.jobs : [];
      const explicitCommon = p.isCommon === true || jobsArr.includes('*');
      if (!explicitCommon && !jobsArr.includes(j.id)) err(`jobs.json: ${j.id}.passiveSkillPool の ${id} は ${j.id} 専用でない（他ジョブ専用passive の混入・jobs=${JSON.stringify(jobsArr)}）`);
    }
  }
}

// 前提条件の循環（skills + passives 横断）と自己 conflict の総点検
{
  const allDraft = [...((skillsData && skillsData.skills) || []), ...((passivesData && passivesData.passives) || [])];
  const prereqMap = {};
  for (const s of allDraft) prereqMap[s.id] = (s.prerequisites || []).map((r) => r.skill);
  const hasCycle = (start) => {
    const seen = new Set(); const stack = [...(prereqMap[start] || [])];
    while (stack.length) { const n = stack.pop(); if (n === start) return true; if (seen.has(n)) continue; seen.add(n); for (const p of prereqMap[n] || []) stack.push(p); }
    return false;
  };
  for (const id of Object.keys(prereqMap)) if (hasCycle(id)) err(`前提条件が循環している: ${id}`);
}

// 魂炎強化 active_skill_slots が 4→6→8（base + effectPerLevel*level）
if (reincData && skillCfg) {
  const node = (reincData.nodes || []).find((n) => n.id === 'active_skill_slots');
  if (node) {
    const base = (skillCfg.slots && skillCfg.slots.baseActiveSlots) || 4;
    if (node.effectType !== 'activeSlots') err('reincarnation.json: active_skill_slots の effectType が activeSlots でない');
    if (base + (node.effectPerLevel || 0) * 1 !== 6 || base + (node.effectPerLevel || 0) * (node.maxLevel || 0) !== 8) {
      err(`reincarnation.json: active_skill_slots が 4→6→8 にならない (base ${base}, perLevel ${node.effectPerLevel}, maxLevel ${node.maxLevel})`);
    }
  }
}

// --- skillCaps（M6-B）: 各上限は品質別(low<=medium<=high<=ultra)の非負整数 ---
if (balance && balance.skillCaps) {
  const Q = ['low', 'medium', 'high', 'ultra'];
  for (const [name, c] of Object.entries(balance.skillCaps)) {
    if (!c || typeof c !== 'object') { err(`balance.json: skillCaps.${name} がオブジェクトでない`); continue; }
    let prev = -Infinity;
    for (const q of Q) {
      const v = c[q];
      if (typeof v !== 'number' || v < 0 || !Number.isInteger(v)) { err(`balance.json: skillCaps.${name}.${q} が非負整数でない (${v})`); continue; }
      if (v < prev) err(`balance.json: skillCaps.${name} が品質順で逆転 (${q}=${v} < 前=${prev})`);
      prev = v;
    }
  }
}

// --- cast メタデータ（M6-D）: echoPolicy/clonePolicy/フラグの検証 ---
{
  const POL = new Set(['standard', 'custom', 'forbidden']);
  const skillsArr = (skillsData && skillsData.skills) || [];
  const evosArr = (evoData && evoData.evolutions) || [];
  for (const s of [...skillsArr, ...evosArr]) {
    const id = s.id;
    if (s.echoPolicy != null && !POL.has(s.echoPolicy)) err(`cast: ${id} の echoPolicy が不正 (${s.echoPolicy})`);
    if (s.clonePolicy != null && !POL.has(s.clonePolicy)) err(`cast: ${id} の clonePolicy が不正 (${s.clonePolicy})`);
    for (const k of ['isDefensive', 'isReactive', 'usesResourceCost', 'canTriggerEcho', 'canBeCopiedByClone']) {
      if (s[k] != null && typeof s[k] !== 'boolean') err(`cast: ${id} の ${k} が真偽値でない (${s[k]})`);
    }
    // forbidden は複製・残響の対象にしない（メタの一貫性）
    if (s.echoPolicy === 'forbidden' && s.canTriggerEcho === true) err(`cast: ${id} は echoPolicy=forbidden だが canTriggerEcho=true（矛盾）`);
    if (s.clonePolicy === 'forbidden' && s.canBeCopiedByClone === true) err(`cast: ${id} は clonePolicy=forbidden だが canBeCopiedByClone=true（矛盾）`);
  }
  // maxCopyGeneration / maxEchoCloneGeneration は 1 以上の整数（無限複製防止）
  for (const n of ['maxCopyGeneration', 'maxEchoCloneGeneration']) {
    const c = balance && balance.skillCaps && balance.skillCaps[n];
    if (c) for (const q of ['low', 'medium', 'high', 'ultra']) {
      if (!Number.isInteger(c[q]) || c[q] < 1) err(`balance.json: skillCaps.${n}.${q} は1以上の整数であること (${c[q]})`);
    }
  }
}

// --- job-progression.json（M6-C）: ジョブ育成（曲線・報酬・到達報酬）の検証 ---
const jobProgData = loadJson('job-progression.json');
if (jobProgData) {
  requireFields('job-progression.json', jobProgData, ['version', 'jobs']);
  const jobIds = new Set((jobsData?.jobs || []).map((j) => j.id));
  const KNOWN_TYPES = new Set(['fireDamageMult', 'projectileSpeedMult', 'cooldownMult', 'rerollBonus', 'explosion', 'echo', 'evolvedDamageMult', 'rarityWeight', 'projectileCount', 'echoUpgrade',
    // M7-A: 氷術師の到達報酬 type
    'elementDamageMult', 'statusPowerMult', 'statusTargetDamage', 'shatterOnFrozenKill', 'absoluteZero']);
  for (const [jid, jc] of Object.entries(jobProgData.jobs || {})) {
    const c = `(job ${jid})`;
    if (jobIds.size && !jobIds.has(jid)) err(`job-progression.json: ${jid} は jobs.json に存在しないジョブ`);
    requireFields('job-progression.json', jc, ['levelCap', 'xpCurve', 'xpReward', 'perLevelBonuses', 'milestones'], c);
    if (typeof jc.levelCap !== 'number' || jc.levelCap < 1 || !Number.isInteger(jc.levelCap)) err(`job-progression.json: ${jid} の levelCap が不正 (${jc.levelCap})`);
    // XP曲線係数（非負・有限）
    for (const k of ['quad', 'lin']) {
      const v = jc.xpCurve?.[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) err(`job-progression.json: ${jid} の xpCurve.${k} が非負の有限数でない (${v})`);
    }
    // 曲線が単調増加（Lv1=0 かつ Lv上昇で必要XPが減少しない）
    {
      const q = jc.xpCurve?.quad || 0, l = jc.xpCurve?.lin || 0;
      const tot = (L) => q * (L - 1) * (L - 1) + l * (L - 1);
      if (tot(1) !== 0) err(`job-progression.json: ${jid} の Lv1 累計必要XPが0でない`);
      let prev = -1, mono = true;
      for (let L = 1; L <= (jc.levelCap || 100); L++) { const t = tot(L); if (t < prev) mono = false; prev = t; }
      if (!mono) err(`job-progression.json: ${jid} の XP曲線が単調増加でない`);
    }
    // XP報酬係数（非負）
    const rw = jc.xpReward || {};
    for (const k of ['perSurvivalSecond', 'perNormalKill', 'normalKillCap', 'perEliteKill', 'perBossKill', 'victoryBonus']) {
      if (rw[k] != null && (typeof rw[k] !== 'number' || rw[k] < 0 || !Number.isFinite(rw[k]))) err(`job-progression.json: ${jid} の xpReward.${k} が非負の有限数でない (${rw[k]})`);
    }
    for (const [dk, dv] of Object.entries(rw.difficultyMult || {})) {
      if (typeof dv !== 'number' || dv <= 0 || !Number.isFinite(dv)) err(`job-progression.json: ${jid} の difficultyMult.${dk} が正の有限数でない (${dv})`);
    }
    // perLevelBonuses（非負）
    for (const [bk, bv] of Object.entries(jc.perLevelBonuses || {})) {
      if (typeof bv !== 'number' || bv < 0 || !Number.isFinite(bv)) err(`job-progression.json: ${jid} の perLevelBonuses.${bk} が非負の有限数でない (${bv})`);
    }
    // milestones（レベル昇順・重複なし・1..levelCap・既知type・報酬ID重複なし・数値健全）
    const mIds = new Set();
    let prevLv = 0;
    for (const m of jc.milestones || []) {
      requireFields('job-progression.json', m, ['level', 'id', 'type'], `${c} milestone`);
      if (typeof m.level !== 'number' || m.level < 1 || m.level > (jc.levelCap || 100) || !Number.isInteger(m.level)) err(`job-progression.json: ${jid} の到達報酬レベルが不正 (${m.level})`);
      if (m.level < prevLv) err(`job-progression.json: ${jid} の到達報酬レベルが昇順でない (${m.level} < ${prevLv})`);
      if (m.level === prevLv) err(`job-progression.json: ${jid} の到達報酬レベル重複 (${m.level})`);
      prevLv = m.level;
      if (mIds.has(m.id)) err(`job-progression.json: ${jid} の到達報酬ID重複 "${m.id}"`);
      mIds.add(m.id);
      if (!KNOWN_TYPES.has(m.type)) err(`job-progression.json: ${jid} の到達報酬 ${m.id} が未知の type "${m.type}"`);
      // 残響回数（正整数）・残響倍率（0以上）
      if ((m.type === 'echo' || m.type === 'echoUpgrade')) {
        if (typeof m.interval !== 'number' || m.interval < 1 || !Number.isInteger(m.interval)) err(`job-progression.json: ${jid} の ${m.id} の残響回数(interval)が正整数でない (${m.interval})`);
        if (typeof m.power !== 'number' || m.power < 0 || !Number.isFinite(m.power)) err(`job-progression.json: ${jid} の ${m.id} の残響倍率(power)が非負でない (${m.power})`);
      }
      // 抽選重み倍率（正）
      if (m.type === 'rarityWeight') {
        for (const rk of ['rare', 'legendary']) if (m[rk] != null && (typeof m[rk] !== 'number' || m[rk] <= 0)) err(`job-progression.json: ${jid} の ${m.id} の抽選重み ${rk} が正でない (${m[rk]})`);
      }
      // projectileCount は整数
      if (m.type === 'projectileCount' && (typeof m.value !== 'number' || !Number.isInteger(m.value))) err(`job-progression.json: ${jid} の ${m.id} の projectileCount value が整数でない (${m.value})`);
      // cooldownMult は 0..1 の短縮率（安全下限を超えて短縮しない前提）
      if (m.type === 'cooldownMult' && (typeof m.value !== 'number' || m.value < 0 || m.value >= 1)) err(`job-progression.json: ${jid} の ${m.id} の cooldownMult value が 0..1 でない (${m.value})`);
      // NaN 相当の混入チェック（数値フィールド）
      for (const [mk, mv] of Object.entries(m)) if (typeof mv === 'number' && !Number.isFinite(mv)) err(`job-progression.json: ${jid} の ${m.id}.${mk} が有限数でない`);
    }
  }
}

// --- M6-E: castMode / 主発動イベント / 共鳴閾値 / 炉心熱量 / 新スキル・進化・skillCaps の検証 ---
{
  const CAST_MODES = new Set(['periodic', 'cooldown', 'continuous', 'reactive', 'defensive', 'movement', 'resource']);
  const ATTACK_MODES = new Set(['periodic', 'cooldown', 'continuous', 'resource']);
  const KNOWN_TAGS = new Set(['active', 'fire', 'projectile', 'area', 'explosion', 'dot', 'damageOverTime', 'burn', 'summon', 'beam', 'laser', 'melee', 'slash', 'defensive', 'reactive', 'barrier', 'shield', 'homing', 'chain', 'pierce', 'piercing', 'orbit', 'mark', 'combo', 'ground', 'fissure', 'movingArea', 'formation', 'zone', 'resonance', 'statusScaling', 'pulse', 'overheat', 'escalating', 'burst', 'highRisk', 'deathTriggered', 'delayed', 'trap', 'mine', 'ricochet', 'bouncing', 'clone', 'copy', 'sacrifice', 'projectileAbsorb', 'charge', 'screenEdge', 'wave', 'tether', 'control', 'pull', 'directional', 'spread', 'dash', 'movement', 'retaliation', 'revival', 'witch', 'ice', 'mage', 'slow', 'boomerang', 'placement', 'barrage', 'turret']);
  const skillsArr = (skillsData && skillsData.skills) || [];
  const evosArr = (evoData && evoData.evolutions) || [];
  const actives = skillsArr.filter((s) => (s.category || 'active') === 'active');
  // 全 active は castMode/echoPolicy/clonePolicy/mainCastEvent/echo・cloneDescription/lv80ProjectileTarget を持つ。
  for (const s of actives) {
    if (!CAST_MODES.has(s.castMode)) err(`M6-E: active ${s.id} の castMode が不正/未設定 (${s.castMode})`);
    if (s.echoPolicy == null) err(`M6-E: active ${s.id} に echoPolicy がない`);
    if (s.clonePolicy == null) err(`M6-E: active ${s.id} に clonePolicy がない`);
    if (typeof s.lv80ProjectileTarget !== 'boolean') err(`M6-E: active ${s.id} の lv80ProjectileTarget が真偽値でない`);
    if (!s.echoDescription) err(`M6-E: active ${s.id} に echoDescription がない`);
    if (!s.cloneDescription) err(`M6-E: active ${s.id} に cloneDescription がない`);
    // 攻撃目的の castMode は主発動イベントを持つ（各tick/連鎖/分裂で recordCast しないための宣言）。
    if (ATTACK_MODES.has(s.castMode) && !s.mainCastEvent) err(`M6-E: 攻撃 active ${s.id} に mainCastEvent がない`);
    for (const t of s.tags || []) if (!KNOWN_TAGS.has(t)) warn(`M6-E: active ${s.id} の未知タグ "${t}"`);
  }
  // 進化にも castMode / mainCastEvent / echo・clonePolicy を要求。lv80ProjectileTarget は false（単一形態）。
  for (const ev of evosArr) {
    if (!CAST_MODES.has(ev.castMode)) err(`M6-E: 進化 ${ev.id} の castMode が不正/未設定 (${ev.castMode})`);
    if (ev.echoPolicy == null) err(`M6-E: 進化 ${ev.id} に echoPolicy がない`);
    if (ev.clonePolicy == null) err(`M6-E: 進化 ${ev.id} に clonePolicy がない`);
    if (ev.lv80ProjectileTarget === true) err(`M6-E: 進化 ${ev.id} は lv80ProjectileTarget=false であること（進化は発射数+1対象外）`);
    if (ATTACK_MODES.has(ev.castMode) && !ev.mainCastEvent) err(`M6-E: 攻撃進化 ${ev.id} に mainCastEvent がない`);
  }
  // active プールは30種・火の魔女進化18種・ID一意（M7-A: 進化総数は火18＋氷3＝21）。
  const fw = (jobsData?.jobs || []).find((j) => j.id === 'flame_witch');
  if (fw && fw.activeSkillPool.length !== 30) err(`M6-E: flame_witch の activeSkillPool が30種でない (${fw.activeSkillPool.length})`);
  const fwBaseIds = new Set(skillsArr.filter((s) => (s.jobs || []).includes('flame_witch')).map((s) => s.id));
  const fireEvos = evosArr.filter((e) => fwBaseIds.has(e.baseSkillId));
  if (fireEvos.length !== 18) err(`M6-E: 火の魔女の進化総数が18種でない (${fireEvos.length})`);
  {
    const ids = actives.map((s) => s.id); const dup = ids.filter((v, i) => ids.indexOf(v) !== i);
    if (dup.length) err(`M6-E: active ID 重複 ${dup.join(',')}`);
    const eids = evosArr.map((e) => e.id); const edup = eids.filter((v, i) => eids.indexOf(v) !== i);
    if (edup.length) err(`M6-E: 進化 ID 重複 ${edup.join(',')}`);
  }
  // 新 active5種の存在・maxLevel8・Lv1..8・rarity。
  const NEW_A = { funeral_pyres: 'uncommon', magma_vein: 'common', tri_flame_array: 'rare', scorching_resonance: 'rare', core_overdrive: 'legendary' };
  for (const [id, rar] of Object.entries(NEW_A)) {
    const s = skillsArr.find((x) => x.id === id);
    if (!s) { err(`M6-E: 新 active ${id} が存在しない`); continue; }
    if (s.maxLevel !== 8) err(`M6-E: ${id} の maxLevel が8でない`);
    if (!Array.isArray(s.levels) || s.levels.length !== 8 || !s.levels.every((lv, i) => lv.level === i + 1)) err(`M6-E: ${id} の levels が Lv1..8 連番でない`);
    if (s.rarity !== rar) err(`M6-E: ${id} の rarity が ${rar} でない (${s.rarity})`);
    // 隣接レベルで最低1項目変化。
    for (let i = 1; i < (s.levels || []).length; i++) if (JSON.stringify(s.levels[i]) === JSON.stringify(s.levels[i - 1])) err(`M6-E: ${id} の Lv${i + 1} が Lv${i} と同一（成長なし）`);
    // 負数・非有限の混入チェック。
    for (const lv of s.levels || []) for (const [k, v] of Object.entries(lv)) if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) err(`M6-E: ${id} Lv${lv.level} の ${k} が負/非有限 (${v})`);
  }
  // 共鳴閾値（灼熱共鳴 config.tierThresholds / 万象炎鳴 config.tierThresholds）は昇順・重複なし・0始まり。
  const checkThresholds = (arr, who) => {
    if (!Array.isArray(arr) || arr.length < 2) { err(`M6-E: ${who} の tierThresholds が不正`); return; }
    if (arr[0] !== 0) err(`M6-E: ${who} の tierThresholds は0始まりであること`);
    for (let i = 1; i < arr.length; i++) { if (!(arr[i] > arr[i - 1])) err(`M6-E: ${who} の tierThresholds が昇順/一意でない (${arr.join(',')})`); }
  };
  checkThresholds(skillsArr.find((s) => s.id === 'scorching_resonance')?.config?.tierThresholds, 'scorching_resonance');
  checkThresholds(evosArr.find((e) => e.id === 'universal_flame_resonance')?.config?.tierThresholds, 'universal_flame_resonance');
  // 炉心暴走: maxHeat>0・overheatMs>0・minCooldownMs>0・cooldownRate>0（各Lv）。
  {
    const co = skillsArr.find((s) => s.id === 'core_overdrive');
    for (const lv of co?.levels || []) {
      if (!(lv.maxHeat > 0)) err(`M6-E: core_overdrive Lv${lv.level} の maxHeat が正でない`);
      if (!(lv.overheatMs > 0)) err(`M6-E: core_overdrive Lv${lv.level} の overheatMs が正でない`);
      if (!(lv.minCooldownMs > 0)) err(`M6-E: core_overdrive Lv${lv.level} の minCooldownMs が正でない`);
      if (!(lv.cooldownRate > 0)) err(`M6-E: core_overdrive Lv${lv.level} の cooldownRate が正でない`);
      // 熱量最大化でも安全下限未満に短縮しない（effectiveCd >= minCooldownMs）。
      if (lv.cooldown != null && lv.heatAccelPct != null && lv.cooldown * (1 - lv.heatAccelPct) < lv.minCooldownMs) warn(`M6-E: core_overdrive Lv${lv.level} は最大熱量CDが minCooldownMs 未満になりうる`);
    }
  }
  // 新進化5種: 条件（実在の基礎/補助スキルLv）・replacementSkillId==id・baseSkillId が新 active。
  const NEW_E = {
    necroflame_mausoleum: { base: 'funeral_pyres', req: 'phoenix_feather' },
    world_scorching_rift: { base: 'magma_vein', req: 'burning_trail' },
    hexagram_inferno_array: { base: 'tri_flame_array', req: 'flame_vortex' },
    universal_flame_resonance: { base: 'scorching_resonance', req: 'chain_flame' },
    doomsday_core: { base: 'core_overdrive', req: 'bloodfire_pact' },
  };
  const skillIdSet = new Set(skillsArr.map((s) => s.id));
  const passiveIdSet = new Set((loadJson('passives.json')?.passives || []).map((p) => p.id));
  for (const [id, m] of Object.entries(NEW_E)) {
    const ev = evosArr.find((e) => e.id === id);
    if (!ev) { err(`M6-E: 新進化 ${id} が存在しない`); continue; }
    if (ev.replacementSkillId !== id) err(`M6-E: ${id} の replacementSkillId が id と不一致`);
    if (ev.baseSkillId !== m.base) err(`M6-E: ${id} の baseSkillId が ${m.base} でない (${ev.baseSkillId})`);
    if (!skillIdSet.has(ev.baseSkillId)) err(`M6-E: ${id} の baseSkillId が実在しない (${ev.baseSkillId})`);
    for (const rs of ev.requiredSkills || []) {
      if (!skillIdSet.has(rs.skill) && !passiveIdSet.has(rs.skill)) err(`M6-E: ${id} の requiredSkills "${rs.skill}" が実在しない`);
      if (!(rs.level >= 1)) err(`M6-E: ${id} の requiredSkills "${rs.skill}" の level が不正`);
    }
    // safetyCaps は非負。
    for (const [ck, cv] of Object.entries(ev.safetyCaps || {})) if (typeof cv === 'number' && cv < 0) err(`M6-E: ${id} の safetyCaps.${ck} が負 (${cv})`);
  }
  // 新 active の evolutionBranches が実在の進化を指す。
  for (const [id, m] of Object.entries(NEW_E)) {
    const base = skillsArr.find((s) => s.id === m.base);
    if (base && !(base.evolutionBranches || []).includes(id)) err(`M6-E: ${m.base} の evolutionBranches に ${id} がない`);
  }
  // 新 skillCaps が品質順（low<=medium<=high<=ultra）で存在する。
  const NEW_CAPS = ['maxDeathEventsTracked', 'maxDeathEventsPerFrame', 'maxFuneralPyres', 'maxPyreEruptionsPerFrame', 'maxMagmaVeins', 'maxMagmaSegments', 'maxMagmaIntersections', 'maxTriArrays', 'maxArrayTicksPerFrame', 'maxResonanceTargets', 'maxResonanceChains', 'maxResonanceExplosions', 'maxOverdriveProjectiles', 'maxOverdriveCastsPerFrame', 'maxMausoleums', 'maxHexagramArrays', 'maxHexagramBeams', 'maxDoomsdayProjectiles', 'maxDoomsdayExplosions', 'maxBurningEnemyIndex', 'maxMainCastEventsPerFrame'];
  for (const n of NEW_CAPS) {
    const c = balance?.skillCaps?.[n];
    if (!c) { err(`M6-E: skillCaps.${n} がない`); continue; }
    if (!(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra)) err(`M6-E: skillCaps.${n} が品質順でない`);
    for (const q of ['low', 'medium', 'high', 'ultra']) if (typeof c[q] !== 'number' || c[q] < 0 || !Number.isFinite(c[q])) err(`M6-E: skillCaps.${n}.${q} が非負の有限数でない`);
  }
}

// --- M6-F: シナジー抽選補助設定の検証 ---
{
  const sc = loadJson('skill-config.json');
  const syn = sc && sc.synergy;
  if (syn) {
    if (typeof syn.synergyAssistEnabled !== 'boolean') err('skill-config.json: synergy.synergyAssistEnabled が真偽値でない');
    const posMult = ['evolutionPartnerWeightMultiplier', 'ownedSkillUpgradeWeightMultiplier', 'nearlyMaxedSkillWeightMultiplier', 'unrelatedNewSkillWeightMultiplier', 'synergyAssistMaxMultiplier', 'noProgressMaxMultiplier'];
    for (const k of posMult) {
      const v = syn[k];
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) err(`skill-config.json: synergy.${k} が正の有限数でない (${v})`);
    }
    // 倍率は 1 以上（重みを下げる補助にはしない・legendary を common 並みに増やさない上限）。
    for (const k of ['evolutionPartnerWeightMultiplier', 'ownedSkillUpgradeWeightMultiplier', 'nearlyMaxedSkillWeightMultiplier']) {
      if (typeof syn[k] === 'number' && syn[k] < 1) err(`skill-config.json: synergy.${k} は1以上であること (${syn[k]})`);
    }
    if (typeof syn.synergyAssistMaxMultiplier === 'number' && syn.synergyAssistMaxMultiplier > 4) warn(`skill-config.json: synergy.synergyAssistMaxMultiplier が大きすぎる (${syn.synergyAssistMaxMultiplier})`);
    if (typeof syn.noProgressDraftThreshold !== 'number' || syn.noProgressDraftThreshold < 1 || !Number.isInteger(syn.noProgressDraftThreshold)) err(`skill-config.json: synergy.noProgressDraftThreshold が正整数でない (${syn.noProgressDraftThreshold})`);
    if (typeof syn.noProgressWeightBonus !== 'number' || syn.noProgressWeightBonus < 0) err(`skill-config.json: synergy.noProgressWeightBonus が非負でない (${syn.noProgressWeightBonus})`);
    if (typeof syn.synergyAssistMinBattleLevel !== 'number' || syn.synergyAssistMinBattleLevel < 0) err(`skill-config.json: synergy.synergyAssistMinBattleLevel が非負でない (${syn.synergyAssistMinBattleLevel})`);
  }
}

// --- M6-F: バランス警告しきい値・テレメトリ上限の検証 ---
{
  const th = loadJson('balance-thresholds.json');
  if (th) {
    const w = obj => (obj && typeof obj === 'object') ? obj : {};
    const wa = w(th.warnings), te = w(th.telemetry);
    for (const [k, v] of Object.entries(wa)) if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) err(`balance-thresholds.json: warnings.${k} が非負の有限数でない (${v})`);
    for (const [k, v] of Object.entries(te)) if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) err(`balance-thresholds.json: telemetry.${k} が非負の有限数でない (${v})`);
    if (typeof wa.minSamples === 'number' && (!Number.isInteger(wa.minSamples) || wa.minSamples < 1)) err(`balance-thresholds.json: warnings.minSamples が正整数でない (${wa.minSamples})`);
    for (const k of ['maxRecentRuns', 'maxDebugRuns', 'maxSummarySkills']) {
      if (te[k] != null && (!Number.isInteger(te[k]) || te[k] < 1)) err(`balance-thresholds.json: telemetry.${k} が正整数でない (${te[k]})`);
    }
  } else {
    warn('balance-thresholds.json が見つからない（M6-F バランス警告のしきい値）');
  }
}

// --- M7-A: 状態異常基盤 / 氷術師（ジョブ・スキル・進化・skillCaps）の検証 ---
{
  const se = loadJson('status-effects.json');
  const KINDS = new Set(['timed', 'scalar', 'damageOverTime', 'control', 'immunity', 'vulnerability']);
  const REQUIRED_STATUS = ['burning', 'chill', 'frozen', 'freeze_immunity', 'frostbreak_vulnerability'];
  if (!se) { err('status-effects.json が見つからない（M7-A 状態異常基盤）'); }
  else {
    const defs = Array.isArray(se.statusEffects) ? se.statusEffects : [];
    const ids = new Set();
    for (const d of defs) {
      requireFields('status-effects.json', d, ['id', 'kind'], 'status');
      if (ids.has(d.id)) err(`status-effects.json: 状態ID重複 "${d.id}"`); ids.add(d.id);
      if (!KINDS.has(d.kind)) err(`status-effects.json: ${d.id} の kind が未知 "${d.kind}"`);
      for (const k of ['duration', 'maxDuration', 'tickRate', 'decayRate', 'maxStacks']) {
        if (d[k] != null && (typeof d[k] !== 'number' || d[k] < 0 || !Number.isFinite(d[k]))) err(`status-effects.json: ${d.id}.${k} が非負の有限数でない (${d[k]})`);
      }
      if (typeof d.stackMode === 'string' && !['refresh', 'accumulate', 'stack', 'ignore'].includes(d.stackMode)) warn(`status-effects.json: ${d.id} の未知 stackMode "${d.stackMode}"`);
    }
    for (const id of REQUIRED_STATUS) if (!ids.has(id)) err(`status-effects.json: 必須状態 "${id}" が無い`);
    // freeze 設定（通常/エリート）。
    const fr = se.freeze || {};
    if (typeof fr.chanceFromChill !== 'number' || fr.chanceFromChill < 0 || fr.chanceFromChill > 1) err(`status-effects.json: freeze.chanceFromChill が0..1でない (${fr.chanceFromChill})`);
    for (const prof of ['normal', 'elite']) {
      const p = fr[prof];
      if (!p) { err(`status-effects.json: freeze.${prof} が無い`); continue; }
      if (typeof p.chillCap !== 'number' || p.chillCap <= 0) err(`status-effects.json: freeze.${prof}.chillCap が正でない (${p.chillCap})`);
      if (typeof p.maxSlow !== 'number' || p.maxSlow < 0 || p.maxSlow > 1) err(`status-effects.json: freeze.${prof}.maxSlow が0..1でない (${p.maxSlow})`);
      if (typeof p.freezeChanceCap !== 'number' || p.freezeChanceCap < 0 || p.freezeChanceCap > 1) err(`status-effects.json: freeze.${prof}.freezeChanceCap が0..1でない (${p.freezeChanceCap})`);
      if (typeof p.guaranteedFreezeThreshold !== 'number' || p.guaranteedFreezeThreshold <= 0) err(`status-effects.json: freeze.${prof}.guaranteedFreezeThreshold が正でない`);
      for (const k of ['baseFreezeDuration', 'postFreezeImmunity', 'immunityChillGainMultiplier', 'chillGainMultiplier', 'freezeDurationMultiplier', 'decayRate']) {
        if (p[k] != null && (typeof p[k] !== 'number' || p[k] < 0 || !Number.isFinite(p[k]))) err(`status-effects.json: freeze.${prof}.${k} が非負でない (${p[k]})`);
      }
    }
    // ボス氷砕。
    const bf = se.bossFrostbreak || {};
    if (typeof bf.baseThreshold !== 'number' || bf.baseThreshold <= 0) err(`status-effects.json: bossFrostbreak.baseThreshold が正でない`);
    if (typeof bf.thresholdGrowthPerBreak !== 'number' || bf.thresholdGrowthPerBreak < 1) err(`status-effects.json: bossFrostbreak.thresholdGrowthPerBreak が1以上でない (${bf.thresholdGrowthPerBreak})`);
    if (typeof bf.maximumThresholdMultiplier !== 'number' || bf.maximumThresholdMultiplier < 1) err(`status-effects.json: bossFrostbreak.maximumThresholdMultiplier が1以上でない`);
    if (typeof bf.iceDamageTakenMultiplierDuringVulnerability !== 'number' || bf.iceDamageTakenMultiplierDuringVulnerability < 1) err(`status-effects.json: bossFrostbreak.iceDamageTakenMultiplierDuringVulnerability が1以上でない`);
    for (const k of ['breakStaggerDuration', 'vulnerabilityDuration', 'cooldownAfterBreak']) if (typeof bf[k] !== 'number' || bf[k] < 0) err(`status-effects.json: bossFrostbreak.${k} が非負でない`);
    // 粉砕。
    const sh = se.shatter || {};
    for (const k of ['baseDamage', 'skillPowerCoefficient', 'maxHpCoefficient', 'maxHpDamageCap', 'absoluteCap', 'explosionRadius']) if (typeof sh[k] !== 'number' || sh[k] < 0) err(`status-effects.json: shatter.${k} が非負でない (${sh[k]})`);
    if (typeof sh.maxHpCoefficient === 'number' && sh.maxHpCoefficient > 0.5) warn(`status-effects.json: shatter.maxHpCoefficient が大きすぎる（最大HP割合ダメージの暴走注意） (${sh.maxHpCoefficient})`);
  }

  // frost_mage ジョブ定義。
  const fm = (jobsData?.jobs || []).find((j) => j.id === 'frost_mage');
  if (!fm) err('jobs.json: frost_mage が無い');
  else {
    if (fm.element !== 'ice') err(`jobs.json: frost_mage の element が ice でない (${fm.element})`);
    if (fm.initialActiveSkills?.[0] !== 'frost_shard') err('jobs.json: frost_mage の初期スキルが frost_shard でない');
    const skillIdSet = new Set((skillsData.skills || []).map((s) => s.id));
    const passiveIdSet = new Set((passivesData.passives || []).map((p) => p.id));
    const evoIdSet = new Set((evoData.evolutions || []).map((e) => e.id));
    for (const id of fm.activeSkillPool || []) if (!skillIdSet.has(id)) err(`jobs.json: frost_mage の activeSkillPool 参照先 ${id} が存在しない`);
    for (const id of fm.passiveSkillPool || []) if (!passiveIdSet.has(id)) err(`jobs.json: frost_mage の passiveSkillPool 参照先 ${id} が存在しない`);
    for (const id of fm.evolutionPool || []) if (!evoIdSet.has(id)) err(`jobs.json: frost_mage の evolutionPool 参照先 ${id} が存在しない`);
    for (const id of fm.statusEffects || []) { const se2 = loadJson('status-effects.json'); if (se2 && !(se2.statusEffects || []).some((d) => d.id === id)) err(`jobs.json: frost_mage の statusEffects 参照 ${id} が未知`); }
  }

  // frost_mage progression。
  const fmp = jobProgData?.jobs?.frost_mage;
  if (!fmp) err('job-progression.json: frost_mage が無い');
  else if (fmp.element !== 'ice') err('job-progression.json: frost_mage の element が ice でない');

  // 氷術師 active5種・passive4種・進化3種のデータ健全性。
  const FROST_A = { frost_shard: 'common', frost_nova: 'common', glacial_lance: 'uncommon', permafrost_field: 'uncommon', ice_wall: 'rare' };
  for (const [id, rar] of Object.entries(FROST_A)) {
    const s = (skillsData.skills || []).find((x) => x.id === id);
    if (!s) { err(`M7-A: 氷 active ${id} が無い`); continue; }
    if (!(s.jobs || []).includes('frost_mage')) err(`M7-A: ${id} が frost_mage 専用でない`);
    if (s.element !== 'ice') err(`M7-A: ${id} の element が ice でない`);
    if (s.rarity !== rar) err(`M7-A: ${id} の rarity が ${rar} でない (${s.rarity})`);
    if (s.maxLevel !== 8) err(`M7-A: ${id} の maxLevel が8でない`);
    if (!Array.isArray(s.levels) || s.levels.length !== 8 || !s.levels.every((lv, i) => lv.level === i + 1)) err(`M7-A: ${id} の levels が Lv1..8 連番でない`);
    if (typeof s.procCoefficient !== 'number' || s.procCoefficient <= 0 || s.procCoefficient > 1.5) err(`M7-A: ${id} の procCoefficient が不正 (${s.procCoefficient})`);
    for (let i = 1; i < (s.levels || []).length; i++) if (JSON.stringify(s.levels[i]) === JSON.stringify(s.levels[i - 1])) err(`M7-A: ${id} の Lv${i + 1} が Lv${i} と同一（成長なし）`);
    for (const lv of s.levels || []) {
      for (const [k, v] of Object.entries(lv)) if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) err(`M7-A: ${id} Lv${lv.level} の ${k} が負/非有限 (${v})`);
      if (typeof lv.baseFreezeChance === 'number' && lv.baseFreezeChance > 1) err(`M7-A: ${id} Lv${lv.level} の baseFreezeChance が100%超 (${lv.baseFreezeChance})`);
    }
  }
  const FROST_P = ['frost_amplification', 'rapid_freezing', 'frozen_expansion', 'lingering_cold'];
  const MK = new Set((skillCfg && skillCfg.modifierKeys) || []);
  for (const id of FROST_P) {
    const p = (passivesData.passives || []).find((x) => x.id === id);
    if (!p) { err(`M7-A: 氷 passive ${id} が無い`); continue; }
    if (!(p.jobs || []).includes('frost_mage')) err(`M7-A: passive ${id} が frost_mage 専用でない`);
    for (const m of p.modifiers || []) if (m.key && MK.size && !MK.has(m.key)) err(`M7-A: passive ${id} の未知 modifier key "${m.key}"`);
  }
  const FROST_E = { diamond_blizzard: 'frost_shard', absolute_zero_domain: 'frost_nova', heaven_piercing_glacier: 'glacial_lance' };
  for (const [id, base] of Object.entries(FROST_E)) {
    const e = (evoData.evolutions || []).find((x) => x.id === id);
    if (!e) { err(`M7-A: 氷 進化 ${id} が無い`); continue; }
    if (e.baseSkillId !== base) err(`M7-A: 進化 ${id} の baseSkillId が ${base} でない (${e.baseSkillId})`);
    if (e.element !== 'ice') err(`M7-A: 進化 ${id} の element が ice でない`);
    if (e.lv80ProjectileTarget === true) err(`M7-A: 進化 ${id} は Lv80発射数対象外であること`);
    for (const req of e.requiredSkills || []) {
      const exists = (skillsData.skills || []).some((s) => s.id === req.skill) || (passivesData.passives || []).some((p) => p.id === req.skill);
      if (!exists) err(`M7-A: 進化 ${id} の補助条件 ${req.skill} が実在しない`);
    }
  }
  // 新 skillCaps（品質順・非負）。
  const FROST_CAPS = ['maxFrozenEnemies', 'maxShattersPerFrame', 'maxShatterProjectiles', 'maxStatusIndexEntries', 'maxFrostShards', 'maxFrostNovaTargetsPerFrame', 'maxGlacialLances', 'maxPermafrostFields', 'maxPermafrostTicksPerFrame', 'maxIceWalls', 'maxIceWallSegments', 'maxIceWallCollisionsPerFrame', 'maxDiamondBlizzardProjectiles', 'maxAbsoluteZeroDomains', 'maxAbsoluteZeroShattersPerFrame', 'maxHeavenGlacierFragments', 'maxBossFrostbreaksPerFrame'];
  for (const n of FROST_CAPS) {
    const c = balance?.skillCaps?.[n];
    if (!c) { err(`M7-A: skillCaps.${n} が無い`); continue; }
    if (!(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra)) err(`M7-A: skillCaps.${n} が品質順(low<=medium<=high<=ultra)でない`);
    for (const q of ['low', 'medium', 'high', 'ultra']) if (typeof c[q] !== 'number' || c[q] < 0 || !Number.isFinite(c[q])) err(`M7-A: skillCaps.${n}.${q} が非負の有限数でない`);
  }
}

// --- M7-B: 氷術師 新 active10種・新進化5種・プール・skillCaps・非回帰の検証 ---
{
  const skillsArr = (skillsData && skillsData.skills) || [];
  const evosArr = (evoData && evoData.evolutions) || [];
  // 新 active10種（rarity/castMode/lv80）。
  const B_A = {
    icicle_volley: { rarity: 'common', castMode: 'cooldown', lv80: true },
    frost_orbit: { rarity: 'common', castMode: 'continuous', lv80: false },
    freezing_ray: { rarity: 'uncommon', castMode: 'continuous', lv80: false },
    hailstorm: { rarity: 'uncommon', castMode: 'periodic', lv80: false },
    cryo_mine: { rarity: 'common', castMode: 'reactive', lv80: false },
    frost_spirit: { rarity: 'uncommon', castMode: 'continuous', lv80: false },
    ice_prison: { rarity: 'rare', castMode: 'cooldown', lv80: false },
    avalanche: { rarity: 'uncommon', castMode: 'periodic', lv80: false },
    mirror_ice: { rarity: 'rare', castMode: 'defensive', lv80: false },
    glacier_drop: { rarity: 'legendary', castMode: 'cooldown', lv80: false },
  };
  for (const [id, meta] of Object.entries(B_A)) {
    const s = skillsArr.find((x) => x.id === id);
    if (!s) { err(`M7-B: 氷 active ${id} が無い`); continue; }
    if (!(s.jobs || []).includes('frost_mage') || (s.jobs || []).length !== 1) err(`M7-B: ${id} が frost_mage 専用でない`);
    if (s.element !== 'ice') err(`M7-B: ${id} の element が ice でない`);
    if (s.rarity !== meta.rarity) err(`M7-B: ${id} の rarity が ${meta.rarity} でない (${s.rarity})`);
    if (s.castMode !== meta.castMode) err(`M7-B: ${id} の castMode が ${meta.castMode} でない (${s.castMode})`);
    if (s.lv80ProjectileTarget !== meta.lv80) err(`M7-B: ${id} の lv80ProjectileTarget が ${meta.lv80} でない`);
    if (s.maxLevel !== 8) err(`M7-B: ${id} の maxLevel が8でない`);
    if (!Array.isArray(s.levels) || s.levels.length !== 8 || !s.levels.every((lv, i) => lv.level === i + 1)) err(`M7-B: ${id} の levels が Lv1..8 連番でない`);
    if (typeof s.procCoefficient !== 'number' || s.procCoefficient <= 0 || s.procCoefficient > 1.5) err(`M7-B: ${id} の procCoefficient が不正 (${s.procCoefficient})`);
    for (let i = 1; i < (s.levels || []).length; i++) if (JSON.stringify(s.levels[i]) === JSON.stringify(s.levels[i - 1])) err(`M7-B: ${id} の Lv${i + 1} が Lv${i} と同一（成長なし）`);
    for (const lv of s.levels || []) for (const [k, v] of Object.entries(lv)) if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) err(`M7-B: ${id} Lv${lv.level} の ${k} が負/非有限 (${v})`);
  }
  // 新進化5種（base/aux/lv80 false/置換）。
  const B_E = {
    crystal_tempest: { base: 'icicle_volley', aux: 'frost_amplification' },
    absolute_zero_ray: { base: 'freezing_ray', aux: 'rapid_freezing' },
    whiteout_cataclysm: { base: 'hailstorm', aux: 'lingering_cold' },
    frost_queen_court: { base: 'frost_spirit', aux: 'frozen_expansion' },
    world_end_avalanche: { base: 'avalanche', aux: 'ice_wall' },
  };
  const allIds = new Set(skillsArr.map((s) => s.id));
  const passIds2 = new Set((passivesData.passives || []).map((p) => p.id));
  for (const [id, meta] of Object.entries(B_E)) {
    const e = evosArr.find((x) => x.id === id);
    if (!e) { err(`M7-B: 氷 進化 ${id} が無い`); continue; }
    if (e.baseSkillId !== meta.base) err(`M7-B: 進化 ${id} の baseSkillId が ${meta.base} でない (${e.baseSkillId})`);
    if (e.replacementSkillId !== id) err(`M7-B: 進化 ${id} の replacementSkillId が id でない`);
    if (e.element !== 'ice') err(`M7-B: 進化 ${id} の element が ice でない`);
    if (e.lv80ProjectileTarget === true) err(`M7-B: 進化 ${id} は Lv80発射数対象外であること`);
    const reqs = e.requiredSkills || [];
    if (!(reqs.length === 1 && reqs[0].skill === meta.aux)) err(`M7-B: 進化 ${id} の補助条件が ${meta.aux} 1件でない`);
    if (!allIds.has(meta.aux) && !passIds2.has(meta.aux)) err(`M7-B: 進化 ${id} の補助 ${meta.aux} が実在しない`);
    const base = skillsArr.find((s) => s.id === meta.base);
    if (base && !(base.evolutionBranches || []).includes(id)) err(`M7-B: ${meta.base} の evolutionBranches に ${id} がない`);
  }
  // frost_mage プール: active15 / evolution8。
  const fm = (jobsData?.jobs || []).find((j) => j.id === 'frost_mage');
  if (fm) {
    const frostActives = skillsArr.filter((s) => (s.jobs || []).includes('frost_mage'));
    if (frostActives.length !== 30) err(`M7-D: 氷術師 active が30種でない (${frostActives.length})`);
    if ((fm.activeSkillPool || []).length !== 30) err(`M7-D: frost_mage activeSkillPool が30種でない (${fm.activeSkillPool?.length})`);
    const frostEvos = evosArr.filter((e) => new Set(frostActives.map((s) => s.id)).has(e.baseSkillId));
    if (frostEvos.length !== 18) err(`M7-D: 氷術師 進化が18種でない (${frostEvos.length})`);
    if ((fm.evolutionPool || []).length !== 18) err(`M7-D: frost_mage evolutionPool が18種でない (${fm.evolutionPool?.length})`);
  }
  // 新 skillCaps（品質順・正）。
  const B_CAPS = ['maxIcicleVolleyProjectiles', 'maxIcicleVolleyBurstsPerFrame', 'maxFrostOrbitCrystals', 'maxFrostOrbitHitsPerFrame', 'maxFreezingRayTargets', 'maxFreezingRayTicksPerFrame', 'maxHailstorms', 'maxHailImpactsPerFrame', 'maxCryoMines', 'maxCryoMineExplosionsPerFrame', 'maxFrostSpirits', 'maxFrostSpiritProjectiles', 'maxIcePrisons', 'maxIcePrisonTargetsPerFrame', 'maxAvalancheWaves', 'maxAvalancheHitsPerFrame', 'maxMirrorIceBarriers', 'maxMirrorIceInterceptsPerFrame', 'maxMirrorIceCounterProjectiles', 'maxGlacierDrops', 'maxGlacierImpactsPerFrame', 'maxCrystalTempestProjectiles', 'maxAbsoluteZeroRayBranches', 'maxWhiteoutCataclysms', 'maxWhiteoutHailImpactsPerFrame', 'maxFrostQueenSpirits', 'maxFrostQueenProjectiles', 'maxWorldEndAvalancheWaves', 'maxWorldEndAvalancheShattersPerFrame'];
  for (const n of B_CAPS) {
    const c = balance?.skillCaps?.[n];
    if (!c) { err(`M7-B: skillCaps.${n} が無い`); continue; }
    if (!(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra)) err(`M7-B: skillCaps.${n} が品質順でない`);
    for (const q of ['low', 'medium', 'high', 'ultra']) if (typeof c[q] !== 'number' || c[q] <= 0 || !Number.isFinite(c[q])) err(`M7-B: skillCaps.${n}.${q} が正の有限数でない`);
  }
  // 非回帰: 火の魔女 active30・進化18。
  const fw2 = (jobsData?.jobs || []).find((j) => j.id === 'flame_witch');
  if (fw2 && (fw2.activeSkillPool || []).length !== 30) err(`M7-B: flame_witch activeSkillPool が30種でない (${fw2.activeSkillPool?.length})`);
}

// --- M7-C: 氷術師 新 active10種・新進化5種・プール（25/4/13）・skillCaps・Lv80対象・非回帰の検証 ---
{
  const skillsArr = (skillsData && skillsData.skills) || [];
  const evosArr = (evoData && evoData.evolutions) || [];
  const passIds3 = new Set((passivesData.passives || []).map((p) => p.id));
  const allIds3 = new Set(skillsArr.map((s) => s.id));
  // 新 active10種（rarity/castMode/lv80）。
  const C_A = {
    rime_boomerang: { rarity: 'common', castMode: 'cooldown', lv80: true },
    frost_chain: { rarity: 'uncommon', castMode: 'cooldown', lv80: false },
    crystal_bloom: { rarity: 'common', castMode: 'periodic', lv80: false },
    snowblind_mist: { rarity: 'uncommon', castMode: 'continuous', lv80: false },
    polar_star: { rarity: 'rare', castMode: 'cooldown', lv80: true },
    icebreaker_wave: { rarity: 'common', castMode: 'cooldown', lv80: false },
    frozen_clock: { rarity: 'legendary', castMode: 'periodic', lv80: false },
    crystal_refraction: { rarity: 'rare', castMode: 'cooldown', lv80: false },
    winter_halo: { rarity: 'uncommon', castMode: 'defensive', lv80: false },
    comet_sleet: { rarity: 'rare', castMode: 'periodic', lv80: false },
  };
  for (const [id, meta] of Object.entries(C_A)) {
    const s = skillsArr.find((x) => x.id === id);
    if (!s) { err(`M7-C: 氷 active ${id} が無い`); continue; }
    if (!(s.jobs || []).includes('frost_mage') || (s.jobs || []).length !== 1) err(`M7-C: ${id} が frost_mage 専用でない`);
    if (s.isCommon !== false) err(`M7-C: ${id} の isCommon が false でない`);
    if (s.element !== 'ice') err(`M7-C: ${id} の element が ice でない`);
    if (s.rarity !== meta.rarity) err(`M7-C: ${id} の rarity が ${meta.rarity} でない (${s.rarity})`);
    if (s.castMode !== meta.castMode) err(`M7-C: ${id} の castMode が ${meta.castMode} でない (${s.castMode})`);
    if (!s.mainCastEvent) err(`M7-C: ${id} に mainCastEvent が無い`);
    if (!['standard', 'custom', 'forbidden'].includes(s.echoPolicy)) err(`M7-C: ${id} の echoPolicy 無効`);
    if (!['standard', 'custom', 'forbidden'].includes(s.clonePolicy)) err(`M7-C: ${id} の clonePolicy 無効`);
    if (s.lv80ProjectileTarget !== meta.lv80) err(`M7-C: ${id} の lv80ProjectileTarget が ${meta.lv80} でない`);
    if (s.maxLevel !== 8) err(`M7-C: ${id} の maxLevel が8でない`);
    if (!Array.isArray(s.levels) || s.levels.length !== 8 || !s.levels.every((lv, i) => lv.level === i + 1)) err(`M7-C: ${id} の levels が Lv1..8 連番でない`);
    if (typeof s.procCoefficient !== 'number' || s.procCoefficient <= 0 || s.procCoefficient > 1.5) err(`M7-C: ${id} の procCoefficient が不正 (${s.procCoefficient})`);
    for (const lv of s.levels || []) { if (lv.chillAmount == null) err(`M7-C: ${id} Lv${lv.level} に chillAmount が無い`); }
    for (let i = 1; i < (s.levels || []).length; i++) if (JSON.stringify(s.levels[i]) === JSON.stringify(s.levels[i - 1])) err(`M7-C: ${id} の Lv${i + 1} が Lv${i} と同一（成長なし）`);
    for (const lv of s.levels || []) for (const [k, v] of Object.entries(lv)) if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) err(`M7-C: ${id} Lv${lv.level} の ${k} が負/非有限 (${v})`);
  }
  // forbidden echo/clone は frozen_clock / winter_halo。
  for (const id of ['frozen_clock', 'winter_halo']) { const s = skillsArr.find((x) => x.id === id); if (s && (s.echoPolicy !== 'forbidden' || s.clonePolicy !== 'forbidden')) err(`M7-C: ${id} は echo/clone forbidden であること`); }
  // 新進化5種（base/aux/lv80 false/置換/echo・clonePolicy）。
  const C_E = {
    rime_execution_wheel: { base: 'rime_boomerang', aux: 'frost_amplification', echo: 'standard' },
    eternal_frost_chain: { base: 'frost_chain', aux: 'rapid_freezing', echo: 'custom' },
    crystal_world_tree: { base: 'crystal_bloom', aux: 'frozen_expansion', echo: 'custom' },
    everlasting_white_mist: { base: 'snowblind_mist', aux: 'lingering_cold', echo: 'custom' },
    zero_hour_world: { base: 'frozen_clock', aux: 'ice_prison', echo: 'forbidden' },
  };
  for (const [id, meta] of Object.entries(C_E)) {
    const e = evosArr.find((x) => x.id === id);
    if (!e) { err(`M7-C: 氷 進化 ${id} が無い`); continue; }
    if (e.baseSkillId !== meta.base) err(`M7-C: 進化 ${id} の baseSkillId が ${meta.base} でない (${e.baseSkillId})`);
    if (e.replacementSkillId !== id) err(`M7-C: 進化 ${id} の replacementSkillId が id でない`);
    if (e.element !== 'ice') err(`M7-C: 進化 ${id} の element が ice でない`);
    if (e.lv80ProjectileTarget === true) err(`M7-C: 進化 ${id} は Lv80発射数対象外であること`);
    if (e.echoPolicy !== meta.echo) err(`M7-C: 進化 ${id} の echoPolicy が ${meta.echo} でない (${e.echoPolicy})`);
    if (typeof e.procCoefficient !== 'number' || e.procCoefficient <= 0 || e.procCoefficient > 1.5) err(`M7-C: 進化 ${id} の procCoefficient が不正 (${e.procCoefficient})`);
    const reqs = e.requiredSkills || [];
    if (!(reqs.length === 1 && reqs[0].skill === meta.aux)) err(`M7-C: 進化 ${id} の補助条件が ${meta.aux} 1件でない`);
    if (!allIds3.has(meta.aux) && !passIds3.has(meta.aux)) err(`M7-C: 進化 ${id} の補助 ${meta.aux} が実在しない`);
    const base = skillsArr.find((s) => s.id === meta.base);
    if (base && !(base.evolutionBranches || []).includes(id)) err(`M7-C: ${meta.base} の evolutionBranches に ${id} がない`);
  }
  // 新 skillCaps（品質順・正）。
  const C_CAPS = ['maxRimeBoomerangs', 'maxRimeBoomerangHitsPerFrame', 'maxFrostChainSegmentsPerFrame', 'maxCrystalBlooms', 'maxCrystalBloomPulsesPerFrame', 'maxSnowblindMistTicksPerFrame', 'maxPolarStars', 'maxPolarStarShards', 'maxIcebreakerEffects', 'maxIcebreakerHitsPerFrame', 'maxFrozenClockWaves', 'maxFrozenClockHitsPerFrame', 'maxRefractionProjectiles', 'maxWinterHaloVisualShards', 'maxWinterHaloInterceptsPerFrame', 'maxCometSleetProjectiles', 'maxCometImpactsPerFrame', 'maxRimeExecutionWheelHitsPerFrame', 'maxEternalFrostChainSegmentsPerFrame', 'maxCrystalWorldTrees', 'maxEverlastingMistTicksPerFrame', 'maxZeroHourWorldWaves'];
  for (const n of C_CAPS) {
    const c = balance?.skillCaps?.[n];
    if (!c) { err(`M7-C: skillCaps.${n} が無い`); continue; }
    if (!(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra)) err(`M7-C: skillCaps.${n} が品質順でない`);
    for (const q of ['low', 'medium', 'high', 'ultra']) if (typeof c[q] !== 'number' || c[q] <= 0 || !Number.isFinite(c[q])) err(`M7-C: skillCaps.${n}.${q} が正の有限数でない`);
  }
  // frost_mage プール: active30 / passive4 / evolution18。
  const fm3 = (jobsData?.jobs || []).find((j) => j.id === 'frost_mage');
  if (fm3) {
    if ((fm3.activeSkillPool || []).length !== 30) err(`M7-D: frost_mage activeSkillPool が30種でない (${fm3.activeSkillPool?.length})`);
    if ((fm3.passiveSkillPool || []).length !== 4) err(`M7-C: frost_mage passiveSkillPool が4種でない (${fm3.passiveSkillPool?.length})`);
    if ((fm3.evolutionPool || []).length !== 18) err(`M7-D: frost_mage evolutionPool が18種でない (${fm3.evolutionPool?.length})`);
    // 火 pool へ氷スキルが混入しない。
    const fw3 = (jobsData?.jobs || []).find((j) => j.id === 'flame_witch');
    if (fw3) for (const id of Object.keys(C_A)) if ((fw3.activeSkillPool || []).includes(id)) err(`M7-C: flame_witch pool に氷スキル ${id} が混入`);
  }
  // bossGaugeMult 監査: 「Lv成長項目」として宣言したフィールドが死んでいない（＝実際に成長する）ことを検出する。
  //   frozen_clock は Lv1..8 で単調増加（定数のままの死んだ成長項目を禁止）。zero_hour_world は frozen_clock 最大より明確に高い。
  //   everlasting_white_mist は氷砕ゲージ倍率を持ち正値。値は StatusEffectManager のボス分岐で addBossGauge へ1回だけ適用される（コード側で参照）。
  {
    const fc = skillsArr.find((s) => s.id === 'frozen_clock');
    if (fc) {
      const vals = (fc.levels || []).map((lv) => lv.bossGaugeMult);
      if (vals.some((v) => typeof v !== 'number' || v <= 0)) err('M7-C: frozen_clock.bossGaugeMult に非正/欠損の Lv がある');
      else {
        let increases = 0;
        for (let i = 1; i < vals.length; i++) { if (vals[i] > vals[i - 1] + 1e-9) increases++; }
        if (increases === 0) err('M7-C: frozen_clock.bossGaugeMult が全 Lv 一定（死んだ成長項目・Lv成長として機能していない）');
        const fcMax = Math.max(...vals);
        const zh = evosArr.find((e) => e.id === 'zero_hour_world');
        if (zh) {
          if (typeof zh.bossGaugeMult !== 'number' || zh.bossGaugeMult <= 0) err('M7-C: zero_hour_world.bossGaugeMult が非正/欠損');
          else if (!(zh.bossGaugeMult > fcMax + 1e-9)) err(`M7-C: zero_hour_world.bossGaugeMult(${zh.bossGaugeMult}) は frozen_clock 最大(${fcMax}) より明確に高いこと`);
        }
      }
    }
    const ewm = evosArr.find((e) => e.id === 'everlasting_white_mist');
    if (ewm && (typeof ewm.bossGaugeMult !== 'number' || ewm.bossGaugeMult <= 0)) err('M7-C: everlasting_white_mist.bossGaugeMult が非正/欠損');
    // bossGaugeMult を宣言するスキル/進化は StatusEffectManager のボス分岐（addBossGauge）で実際に参照されること（死に値の再発を検出）。
    const semSrc = readFileSync(join(__dirname, '..', 'src', 'systems', 'StatusEffectManager.js'), 'utf8');
    if (!/bossGaugeMult/.test(semSrc)) err('M7-C: bossGaugeMult がコード（StatusEffectManager）で参照されていない（未使用の成長項目）');
  }
}

// --- M7-D: 氷術師 新 active5種・新進化5種・プール（30/4/18）・skillCaps・Lv80対象・marker・bossGaugeMult・非回帰の検証 ---
{
  const skillsArr = (skillsData && skillsData.skills) || [];
  const evosArr = (evoData && evoData.evolutions) || [];
  const passIds4 = new Set((passivesData.passives || []).map((p) => p.id));
  const allIds4 = new Set(skillsArr.map((s) => s.id));
  const seIds = new Set(((loadJson('status-effects.json') || {}).statusEffects || []).map((d) => d.id));
  // 新 active5種（rarity/castMode/lv80/echo/clone）。
  const D_A = {
    glacial_spear_rain: { rarity: 'common', castMode: 'periodic', lv80: true, echo: 'custom' },
    snowflake_sentry: { rarity: 'uncommon', castMode: 'continuous', lv80: false, echo: 'custom' },
    iceberg_ram: { rarity: 'rare', castMode: 'cooldown', lv80: false, echo: 'standard' },
    absolute_ice_seal: { rarity: 'rare', castMode: 'reactive', lv80: false, echo: 'forbidden' },
    aurora_veil: { rarity: 'legendary', castMode: 'continuous', lv80: false, echo: 'forbidden' },
  };
  for (const [id, meta] of Object.entries(D_A)) {
    const s = skillsArr.find((x) => x.id === id);
    if (!s) { err(`M7-D: 氷 active ${id} が無い`); continue; }
    if (!(s.jobs || []).includes('frost_mage') || (s.jobs || []).length !== 1) err(`M7-D: ${id} が frost_mage 専用でない`);
    if (s.isCommon !== false) err(`M7-D: ${id} の isCommon が false でない`);
    if (s.element !== 'ice') err(`M7-D: ${id} の element が ice でない`);
    if (s.rarity !== meta.rarity) err(`M7-D: ${id} の rarity が ${meta.rarity} でない (${s.rarity})`);
    if (s.castMode !== meta.castMode) err(`M7-D: ${id} の castMode が ${meta.castMode} でない (${s.castMode})`);
    if (!s.mainCastEvent) err(`M7-D: ${id} に mainCastEvent が無い`);
    if (s.echoPolicy !== meta.echo) err(`M7-D: ${id} の echoPolicy が ${meta.echo} でない (${s.echoPolicy})`);
    if (!['standard', 'custom', 'forbidden'].includes(s.clonePolicy)) err(`M7-D: ${id} の clonePolicy 無効`);
    if (s.lv80ProjectileTarget !== meta.lv80) err(`M7-D: ${id} の lv80ProjectileTarget が ${meta.lv80} でない`);
    if (s.maxLevel !== 8) err(`M7-D: ${id} の maxLevel が8でない`);
    if (!Array.isArray(s.levels) || s.levels.length !== 8 || !s.levels.every((lv, i) => lv.level === i + 1)) err(`M7-D: ${id} の levels が Lv1..8 連番でない`);
    if (typeof s.procCoefficient !== 'number' || s.procCoefficient <= 0 || s.procCoefficient > 1.5) err(`M7-D: ${id} の procCoefficient が不正 (${s.procCoefficient})`);
    for (const lv of s.levels || []) { if (lv.chillAmount == null) err(`M7-D: ${id} Lv${lv.level} に chillAmount が無い`); }
    // cadence: cooldown / interval / deployInterval / markInterval / recastInterval / activeDuration のいずれかを持つ。
    for (const lv of s.levels || []) { if (lv.cooldown == null && lv.interval == null && lv.deployInterval == null && lv.markInterval == null && lv.recastInterval == null && lv.activeDuration == null) err(`M7-D: ${id} Lv${lv.level} に cadence(cooldown/interval/deployInterval/markInterval/recastInterval/activeDuration) が無い`); }
    for (let i = 1; i < (s.levels || []).length; i++) if (JSON.stringify(s.levels[i]) === JSON.stringify(s.levels[i - 1])) err(`M7-D: ${id} の Lv${i + 1} が Lv${i} と同一（成長なし）`);
    for (const lv of s.levels || []) for (const [k, v] of Object.entries(lv)) if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) err(`M7-D: ${id} Lv${lv.level} の ${k} が負/非有限 (${v})`);
    // damage tag / status id: element ice のみ（新正式 status を追加しない）。
    for (const t of s.tags || []) if (t === 'status' || seIds.has(t)) err(`M7-D: ${id} の tag "${t}" が正式 status id と衝突`);
  }
  // marker（氷印/氷棺）は正式 status として登録しない。
  for (const bad of ['ice_seal', 'iceSeal', 'ice_coffin', 'sealed_coffin']) if (seIds.has(bad)) err(`M7-D: marker "${bad}" が StatusEffectRegistry へ登録されている（skill-local であること）`);
  // 新進化5種（base/aux/echo/lv80 false）。
  const D_E = {
    heavenfall_glacier_lances: { base: 'glacial_spear_rain', aux: 'frost_amplification', echo: 'custom' },
    crystal_sentinel_legion: { base: 'snowflake_sentry', aux: 'rapid_freezing', echo: 'custom' },
    continental_glacier_rush: { base: 'iceberg_ram', aux: 'frozen_expansion', echo: 'custom' },
    eternal_sealed_coffin: { base: 'absolute_ice_seal', aux: 'ice_prison', echo: 'forbidden' },
    polar_night_aurora: { base: 'aurora_veil', aux: 'lingering_cold', echo: 'forbidden' },
  };
  for (const [id, meta] of Object.entries(D_E)) {
    const e = evosArr.find((x) => x.id === id);
    if (!e) { err(`M7-D: 氷 進化 ${id} が無い`); continue; }
    if (e.baseSkillId !== meta.base) err(`M7-D: 進化 ${id} の baseSkillId が ${meta.base} でない (${e.baseSkillId})`);
    if (e.replacementSkillId !== id) err(`M7-D: 進化 ${id} の replacementSkillId が id でない`);
    if (e.element !== 'ice') err(`M7-D: 進化 ${id} の element が ice でない`);
    if (e.lv80ProjectileTarget === true) err(`M7-D: 進化 ${id} は Lv80発射数対象外であること`);
    if (e.echoPolicy !== meta.echo) err(`M7-D: 進化 ${id} の echoPolicy が ${meta.echo} でない (${e.echoPolicy})`);
    if (typeof e.procCoefficient !== 'number' || e.procCoefficient <= 0 || e.procCoefficient > 1.5) err(`M7-D: 進化 ${id} の procCoefficient が不正 (${e.procCoefficient})`);
    const reqs = e.requiredSkills || [];
    if (!(reqs.length === 1 && reqs[0].skill === meta.aux)) err(`M7-D: 進化 ${id} の補助条件が ${meta.aux} 1件でない`);
    if (!allIds4.has(meta.aux) && !passIds4.has(meta.aux)) err(`M7-D: 進化 ${id} の補助 ${meta.aux} が実在しない`);
    const base = skillsArr.find((s) => s.id === meta.base);
    if (base && !(base.evolutionBranches || []).includes(id)) err(`M7-D: ${meta.base} の evolutionBranches に ${id} がない`);
  }
  // eternal_sealed_coffin の伝播世代上限（1）。
  const esc = evosArr.find((e) => e.id === 'eternal_sealed_coffin');
  if (esc && (esc.propagation || {}).generations !== 1) err(`M7-D: eternal_sealed_coffin の伝播世代が1でない (${(esc.propagation || {}).generations})`);
  // 新 skillCaps（品質順・正）。
  const D_CAPS = ['maxGlacialSpearTelegraphs', 'maxGlacialSpearImpactsPerFrame', 'maxGlacialSpearProjectiles', 'maxSnowflakeSentries', 'maxSentryProjectiles', 'maxIcebergRams', 'maxIcebergContactChecks', 'maxIcebergShards', 'maxIceSealMarks', 'maxIceSealExplosionsPerFrame', 'maxAuroraBands', 'maxAuroraQueriesPerTick', 'maxAuroraBurstsPerFrame', 'maxHeavenfallImpactsPerFrame', 'maxSentinelLegionLinksPerFrame', 'maxContinentalGlacierRushes', 'maxSealedCoffinMarks', 'maxPolarNightBands'];
  for (const n of D_CAPS) {
    const c = balance?.skillCaps?.[n];
    if (!c) { err(`M7-D: skillCaps.${n} が無い`); continue; }
    if (!(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra)) err(`M7-D: skillCaps.${n} が品質順でない`);
    for (const q of ['low', 'medium', 'high', 'ultra']) if (typeof c[q] !== 'number' || c[q] <= 0 || !Number.isFinite(c[q])) err(`M7-D: skillCaps.${n}.${q} が正の有限数でない`);
  }
  // 火 pool へ氷スキルが混入しない。
  const fw4 = (jobsData?.jobs || []).find((j) => j.id === 'flame_witch');
  if (fw4) for (const id of Object.keys(D_A)) if ((fw4.activeSkillPool || []).includes(id)) err(`M7-D: flame_witch pool に氷スキル ${id} が混入`);
  // bossGaugeMult 監査（M7-D の宣言スキル）: absolute_ice_seal は Lv 単調増加（死んだ成長項目でない）・宣言スキルはコード参照される。
  const ais = skillsArr.find((s) => s.id === 'absolute_ice_seal');
  if (ais) {
    const vals = (ais.levels || []).map((lv) => lv.bossGaugeMult);
    if (vals.some((v) => typeof v !== 'number' || v <= 0)) err('M7-D: absolute_ice_seal.bossGaugeMult に非正/欠損の Lv がある');
    else { let inc = 0; for (let i = 1; i < vals.length; i++) if (vals[i] > vals[i - 1] + 1e-9) inc++; if (inc === 0) err('M7-D: absolute_ice_seal.bossGaugeMult が全 Lv 一定（死んだ成長項目）'); }
  }
  const av = skillsArr.find((s) => s.id === 'aurora_veil');
  if (av) { const vals = (av.levels || []).map((lv) => lv.bossGaugeMult); if (vals.some((v) => typeof v !== 'number' || v <= 0)) err('M7-D: aurora_veil.bossGaugeMult に非正/欠損の Lv がある'); }
  for (const [id, holder] of [['eternal_sealed_coffin', esc], ['polar_night_aurora', evosArr.find((e) => e.id === 'polar_night_aurora')], ['heavenfall_glacier_lances', evosArr.find((e) => e.id === 'heavenfall_glacier_lances')]]) {
    if (holder && (typeof holder.bossGaugeMult !== 'number' || holder.bossGaugeMult <= 0)) err(`M7-D: ${id}.bossGaugeMult が非正/欠損`);
  }
  // bossGaugeMult を宣言する新スキルは dealDamage 経由でボスゲージへ渡される（未使用の成長項目の再発検出）。
  const gsr = readFileSync(join(__dirname, '..', 'src', 'skills', 'AbsoluteIceSealSkill.js'), 'utf8');
  if (!/bossGaugeMult/.test(gsr)) err('M7-D: AbsoluteIceSealSkill が bossGaugeMult を参照していない（未使用の成長項目）');
  const avc = readFileSync(join(__dirname, '..', 'src', 'skills', 'AuroraVeilSkill.js'), 'utf8');
  if (!/bossGaugeMult/.test(avc)) err('M7-D: AuroraVeilSkill が bossGaugeMult を参照していない（未使用の成長項目）');
}

// --- M7-B.1: 状態異常の視認性（品質別の表示上限・状態表示設定）の検証 ---
{
  const VIS_CAPS = ['maxStatusIcons', 'maxChillVisuals', 'maxFrozenVisuals', 'maxImmunityVisuals', 'maxSlowTrails', 'maxShatterEffectsPerFrame', 'maxStatusFloatingTextsPerFrame', 'maxFrostbreakEffects', 'maxStatusDebugHistory', 'chillNearThresholdEffectCooldown', 'statusVisualUpdateInterval'];
  for (const n of VIS_CAPS) {
    const c = balance?.skillCaps?.[n];
    if (!c) { err(`M7-B.1: skillCaps.${n} が無い`); continue; }
    if (!(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra)) err(`M7-B.1: skillCaps.${n} が品質順(low<=medium<=high<=ultra)でない`);
    for (const q of ['low', 'medium', 'high', 'ultra']) if (typeof c[q] !== 'number' || c[q] <= 0 || !Number.isFinite(c[q])) err(`M7-B.1: skillCaps.${n}.${q} が正の有限数でない (${c[q]})`);
  }
  // アイコン最大数は小さめ（頭上を横一列に埋めない）。
  const icons = balance?.skillCaps?.maxStatusIcons;
  if (icons && icons.ultra > 4) warn(`M7-B.1: maxStatusIcons.ultra が大きすぎる（頭上表示が混雑）(${icons.ultra})`);
  // 状態表示設定（アイコン優先度・既知 visual type・frostbreak/vulnerability 表示）。
  const sv = balance?.statusVisuals;
  if (!sv) err('M7-B.1: balance.json に statusVisuals 設定が無い');
  else {
    const KNOWN_STATUS = new Set(['frozen', 'burning', 'freeze_immunity', 'chill_high', 'chill', 'frostbreak_vulnerability']);
    const KNOWN_VISUAL = new Set(['chill_low', 'chill_mid', 'chill_high', 'chill_near', 'slow_trail', 'frozen_shell', 'freeze_immunity', 'status_icon', 'shatter', 'floating_text', 'boss_gauge', 'frostbreak']);
    if (!Array.isArray(sv.iconStatuses) || sv.iconStatuses.length === 0) err('M7-B.1: statusVisuals.iconStatuses が空/配列でない');
    else for (const s of sv.iconStatuses) if (!KNOWN_STATUS.has(s)) err(`M7-B.1: statusVisuals.iconStatuses に未知の status id "${s}"`);
    if (!Array.isArray(sv.iconPriority) || sv.iconPriority.length === 0) err('M7-B.1: statusVisuals.iconPriority が空/配列でない');
    else {
      for (const s of sv.iconPriority) if (!KNOWN_STATUS.has(s)) err(`M7-B.1: statusVisuals.iconPriority に未知の status id "${s}"`);
      for (const s of sv.iconPriority) if (!(sv.iconStatuses || []).includes(s)) err(`M7-B.1: statusVisuals.iconPriority の "${s}" が iconStatuses に無い`);
    }
    if (!Array.isArray(sv.visualTypes) || sv.visualTypes.length === 0) err('M7-B.1: statusVisuals.visualTypes が空/配列でない');
    else for (const v of sv.visualTypes) if (!KNOWN_VISUAL.has(v)) err(`M7-B.1: statusVisuals.visualTypes に未知の visual type "${v}"`);
    // frostbreak 表示設定。
    const fb = sv.frostbreak || {};
    if (typeof fb.showText !== 'boolean') err('M7-B.1: statusVisuals.frostbreak.showText が真偽値でない');
    if (typeof fb.textDurationMs !== 'number' || fb.textDurationMs <= 0) err('M7-B.1: statusVisuals.frostbreak.textDurationMs が正でない');
    if (typeof fb.shardCount !== 'number' || fb.shardCount < 0) err('M7-B.1: statusVisuals.frostbreak.shardCount が非負でない');
    // vulnerability 表示設定。
    const vu = sv.vulnerability || {};
    if (typeof vu.blink !== 'boolean') err('M7-B.1: statusVisuals.vulnerability.blink が真偽値でない');
    if (typeof vu.blinkPeriodMs !== 'number' || vu.blinkPeriodMs <= 0) err('M7-B.1: statusVisuals.vulnerability.blinkPeriodMs が正でない');
  }
}


// ===== Milestone 7-E: 氷術師 完成監査（カタログ/プール/到達性/死にfield/未使用cap/marker/docs） =====
{
  const skills = loadJson('skills.json');
  const passives = loadJson('passives.json');
  const evolutions = loadJson('skill-evolutions.json');
  const jobs = loadJson('jobs.json');
  const balance = loadJson('balance.json');
  const statusEffects = loadJson('status-effects.json');
  const frost = (jobs?.jobs || []).find((j) => j.id === 'frost_mage');
  const flame = (jobs?.jobs || []).find((j) => j.id === 'flame_witch');
  const S = (id) => (skills?.skills || []).find((s) => s.id === id);
  const E = (id) => (evolutions?.evolutions || []).find((e) => e.id === id);
  const P = (id) => (passives?.passives || []).find((p) => p.id === id);

  if (!frost || !flame) err('M7-E: jobs.json に frost_mage / flame_witch が無い');
  else {
    // 1. カタログ総数（M7-E は新規追加をしない）。
    if (frost.activeSkillPool.length !== 30) err(`M7-E: 氷術師 active が ${frost.activeSkillPool.length}（期待 30）`);
    if ((frost.passiveSkillPool || []).length !== 4) err(`M7-E: 氷術師 passive が ${(frost.passiveSkillPool || []).length}（期待 4）`);
    if ((frost.evolutionPool || []).length !== 18) err(`M7-E: 氷術師 evolution が ${(frost.evolutionPool || []).length}（期待 18）`);
    if (flame.activeSkillPool.length !== 30 || (flame.passiveSkillPool || []).length !== 4 || (flame.evolutionPool || []).length !== 18) {
      err('M7-E: 火の魔女のカタログ数（30/4/18）が変化している');
    }
    // 2. 重複 id / 重複表示名。
    const seen = new Set();
    for (const m of [...(skills?.skills || []), ...(evolutions?.evolutions || []), ...(passives?.passives || [])]) {
      if (seen.has(m.id)) err(`M7-E: id が重複している "${m.id}"`);
      seen.add(m.id);
    }
    const nameSeen = new Map();
    for (const id of [...frost.activeSkillPool, ...frost.evolutionPool]) {
      const d = S(id) || E(id);
      const nm = d && (d.name || d.displayName);
      if (!nm) { err(`M7-E: ${id} に表示名が無い`); continue; }
      if (nameSeen.has(nm)) err(`M7-E: 氷術師の表示名が重複している "${nm}"（${nameSeen.get(nm)} と ${id}）`);
      nameSeen.set(nm, id);
    }
    // 3. プール/共通指定（暗黙共通の禁止・他ジョブ混入の禁止）。
    const flameActive = new Set(flame.activeSkillPool);
    for (const id of frost.activeSkillPool) {
      const s = S(id);
      if (!s) { err(`M7-E: 氷術師プールの ${id} が skills.json に無い`); continue; }
      if (!Array.isArray(s.jobs) || s.jobs.length !== 1 || s.jobs[0] !== 'frost_mage') err(`M7-E: ${id} の jobs が ["frost_mage"] でない`);
      if (s.isCommon !== false) err(`M7-E: ${id} の isCommon が false でない（ジョブ専用スキルを共通扱いしない）`);
      if (flameActive.has(id)) err(`M7-E: ${id} が火の魔女プールにも入っている（プール混入）`);
      if ((s.element || 'ice') !== 'ice') err(`M7-E: ${id} の element が ice でない`);
      if (s.maxLevel !== 8) err(`M7-E: ${id} の maxLevel が 8 でない`);
    }
    for (const id of frost.passiveSkillPool || []) {
      const p = P(id);
      if (!p) { err(`M7-E: 氷 passive ${id} が passives.json に無い`); continue; }
      if (p.isCommon === true || (Array.isArray(p.jobs) && p.jobs.includes('*'))) err(`M7-E: passive ${id} を明示共通にしない（ジョブ分離）`);
      if (!Array.isArray(p.jobs) || !p.jobs.includes('frost_mage')) err(`M7-E: passive ${id} の jobs に frost_mage が無い`);
    }
    // 4. 進化の参照と到達可能性（base/support がプール内・必要Lvが上限内・自己/循環参照なし）。
    const evoIds = new Set(frost.evolutionPool);
    const activeSet = new Set(frost.activeSkillPool);
    const passiveSet = new Set(frost.passiveSkillPool || []);
    const baseSeen = new Map();
    for (const eid of frost.evolutionPool) {
      const ev = E(eid);
      if (!ev) { err(`M7-E: 進化 ${eid} が skill-evolutions.json に無い`); continue; }
      if (!activeSet.has(ev.baseSkillId)) err(`M7-E: 進化 ${eid} の base ${ev.baseSkillId} が氷術師プールに無い（到達不能）`);
      if (evoIds.has(ev.baseSkillId)) err(`M7-E: 進化 ${eid} の base が進化スキル（進化の進化は不可）`);
      if (ev.baseSkillId === eid) err(`M7-E: 進化 ${eid} が自己参照している`);
      if (baseSeen.has(ev.baseSkillId)) err(`M7-E: base ${ev.baseSkillId} から複数の進化へ分岐している（${baseSeen.get(ev.baseSkillId)} / ${eid}）`);
      baseSeen.set(ev.baseSkillId, eid);
      const base = S(ev.baseSkillId);
      if (base && !(base.evolutionBranches || []).includes(eid)) err(`M7-E: base ${ev.baseSkillId} の evolutionBranches に ${eid} が無い`);
      const reqs = ev.requiredSkills || [];
      if (reqs.length === 0) err(`M7-E: 進化 ${eid} に補助条件が無い`);
      for (const r of reqs) {
        if (r.skill === eid || r.skill === ev.baseSkillId) err(`M7-E: 進化 ${eid} の補助 ${r.skill} が自分/自分の base（循環参照）`);
        if (evoIds.has(r.skill)) err(`M7-E: 進化 ${eid} の補助 ${r.skill} が進化スキル（到達不能）`);
        const asActive = S(r.skill), asPassive = P(r.skill);
        if (!asActive && !asPassive) { err(`M7-E: 進化 ${eid} の補助 ${r.skill} が実在しない`); continue; }
        if (asPassive && !passiveSet.has(r.skill)) err(`M7-E: 進化 ${eid} の passive 補助 ${r.skill} が氷 passiveSkillPool に無い（到達不能）`);
        if (!asPassive && asActive && !activeSet.has(r.skill)) err(`M7-E: 進化 ${eid} の active 補助 ${r.skill} が氷プールに無い（到達不能）`);
        const maxLv = (asPassive ? asPassive.maxLevel : asActive.maxLevel) || 1;
        if (!(r.level >= 1 && r.level <= maxLv)) err(`M7-E: 進化 ${eid} の補助 ${r.skill} 必要Lv ${r.level} が上限 ${maxLv} を超える（到達不能）`);
      }
      // 進化は Lv80 対象外・単一形態。
      if (ev.lv80ProjectileTarget === true) err(`M7-E: 進化 ${eid} が Lv80 発射数対象になっている`);
      if (ev.replacementSkillId !== eid) err(`M7-E: 進化 ${eid} の replacementSkillId が自分自身でない（置換）`);
    }
    // 5. Lv80 対象は明示 flag の氷6種のみ。
    const LV80 = ['frost_shard', 'glacial_lance', 'icicle_volley', 'rime_boomerang', 'polar_star', 'glacial_spear_rain'];
    const actual = frost.activeSkillPool.filter((id) => (S(id) || {}).lv80ProjectileTarget === true).sort();
    if (actual.join(',') !== LV80.slice().sort().join(',')) err(`M7-E: 氷の Lv80 対象が [${actual.join(',')}]（期待 [${LV80.slice().sort().join(',')}]）`);
    // 6. 数値の健全性（NaN / Infinity / 負数 / 成長しない Lv）。
    const checkNum = (id, path, v) => {
      if (typeof v !== 'number') return;
      if (!Number.isFinite(v)) err(`M7-E: ${id}.${path} が NaN/Infinity`);
      else if (v < 0) err(`M7-E: ${id}.${path} が負数 (${v})`);
    };
    const walk = (id, obj, prefix) => {
      for (const [k, v] of Object.entries(obj || {})) {
        const p = prefix ? prefix + '.' + k : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) walk(id, v, p); else checkNum(id, p, v);
      }
    };
    for (const id of frost.activeSkillPool) {
      const s = S(id); if (!s) continue;
      const lv = s.levels || [];
      if (lv.length !== (s.maxLevel || 8)) err(`M7-E: ${id} の levels 数 ${lv.length} が maxLevel ${s.maxLevel} と一致しない`);
      for (const l of lv) walk(id, l, `Lv${l.level}`);
      for (let i = 1; i < lv.length; i++) {
        const changed = Object.keys(lv[i]).some((k) => k !== 'level' && lv[i][k] !== lv[i - 1][k]);
        if (!changed) err(`M7-E: ${id} の Lv${i} → Lv${i + 1} で一切値が変化しない（成長しない成長項目）`);
      }
      // bossGaugeMult は単調非減少（M7-C 追加監査の仕様）。
      if (lv[0] && lv[0].bossGaugeMult != null) {
        for (let i = 1; i < lv.length; i++) {
          if (lv[i].bossGaugeMult < lv[i - 1].bossGaugeMult) err(`M7-E: ${id} の bossGaugeMult が Lv${i + 1} で減少`);
        }
      }
    }
    for (const eid of frost.evolutionPool) walk(eid, E(eid) || {}, '');
    // 7. 氷印/氷棺は正式 status として登録しない（skill-local marker）。
    const statusIds = ((statusEffects || {}).statusEffects || []).map((s) => s.id);
    for (const forbidden of ['ice_seal', 'iceSeal', 'ice_coffin', 'sealed_coffin', 'ice_mark']) {
      if (statusIds.includes(forbidden)) err(`M7-E: status-effects.json に skill-local マーカー "${forbidden}" を登録している`);
    }
    if (statusIds.length !== 5) err(`M7-E: 正式状態が ${statusIds.length} 種（期待 5・M7-E で新規状態は追加しない）`);
    // 8. quality cap の妥当性 + 未使用 cap / 存在しない cap の検出。
    const caps = (balance || {}).skillCaps || {};
    const FLAME_LEGACY_UNUSED = new Set(['maxBarrierEffects', 'maxBurningEnemyIndex', 'maxChainTargets', 'maxCopyGeneration', 'maxMainCastEventsPerFrame']);
    let srcAll = '';
    const walkSrc = (dir) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walkSrc(p);
        else if (f.endsWith('.js')) srcAll += readFileSync(p, 'utf8');
      }
    };
    try { walkSrc(join(__dirname, '..', 'src')); } catch (e) { warn(`M7-E: src 走査に失敗 (${e.message})`); }
    if (srcAll) {
      for (const [name, v] of Object.entries(caps)) {
        if (!new RegExp("'" + name + "'").test(srcAll) && !FLAME_LEGACY_UNUSED.has(name)) {
          err(`M7-E: quality cap "${name}" が実装から参照されていない（未使用 cap）`);
        }
        for (const t of ['low', 'medium', 'high', 'ultra']) {
          if (typeof v[t] !== 'number' || !Number.isFinite(v[t]) || v[t] <= 0) err(`M7-E: skillCaps.${name}.${t} が正の有限数でない`);
        }
        if (!(v.low <= v.medium && v.medium <= v.high && v.high <= v.ultra)) err(`M7-E: skillCaps.${name} が low ≤ medium ≤ high ≤ ultra でない`);
      }
      const refs = new Set();
      for (const m of srcAll.matchAll(/skillCap\(\s*'([A-Za-z0-9_]+)'/g)) refs.add(m[1]);
      for (const m of srcAll.matchAll(/frameBudget\(\s*'[^']*'\s*,\s*'([A-Za-z0-9_]+)'/g)) refs.add(m[1]);
      for (const name of refs) if (!(name in caps)) err(`M7-E: 実装が参照する quality cap "${name}" が balance.json に存在しない（名前違い）`);
      // 9. 死に成長項目の検出（宣言された Lv 成長値が実装のどこからも参照されない）。
      const smSrc = readFileSync(join(__dirname, '..', 'src', 'systems', 'SkillManager.js'), 'utf8');
      const clsOf = {};
      for (const m of smSrc.matchAll(/([a-z0-9_]+):\s*([A-Za-z0-9_]+Skill),/g)) clsOf[m[1]] = m[2];
      const META = new Set(['level', 'visual', 'initial', 'requires']);
      for (const id of [...frost.activeSkillPool, ...frost.evolutionPool]) {
        const cls = clsOf[id];
        if (!cls) { err(`M7-E: ${id} の実装クラスが REGISTRY に無い`); continue; }
        let cs = '';
        try { cs = readFileSync(join(__dirname, '..', 'src', 'skills', cls + '.js'), 'utf8'); } catch (e) { err(`M7-E: ${id} の実装 ${cls}.js が読めない`); continue; }
        const d = S(id) || E(id) || {};
        const lv1 = (d.levels || [])[0] || {};
        for (const k of Object.keys(lv1)) {
          if (META.has(k)) continue;
          if (!new RegExp('\\b' + k + '\\b').test(cs) && !new RegExp('\\b' + k + '\\b').test(srcAll)) {
            err(`M7-E: ${id} の Lv成長項目 "${k}" が実装から参照されていない（死にパラメータ）`);
          }
        }
      }
      // 10. bossGaugeMult は共通経路（StatusEffectManager のボス分岐）でのみ適用される。
      const semSrc = readFileSync(join(__dirname, '..', 'src', 'systems', 'StatusEffectManager.js'), 'utf8');
      if (!/bossGaugeMult/.test(semSrc)) err('M7-E: bossGaugeMult がコード（StatusEffectManager）で参照されていない（未使用の成長項目）');
      if (!/addBossGauge\(e,\s*chillAmt\s*\*\s*gaugeMult\)/.test(semSrc)) err('M7-E: bossGaugeMult がボス氷砕ゲージ量へ1回だけ適用されていない');
    }
    // 11. docs のカタログ数と id 記載。
    try {
      const docsCatalog = readFileSync(join(__dirname, '..', 'docs', 'skill-catalog.md'), 'utf8');
      for (const id of [...frost.activeSkillPool, ...frost.evolutionPool]) {
        if (!docsCatalog.includes(id)) err(`M7-E: docs/skill-catalog.md に ${id} の記載が無い`);
      }
      const jobsMd = readFileSync(join(__dirname, '..', 'docs', 'jobs.md'), 'utf8');
      if (!/active\s*30|active30/.test(jobsMd)) warn('M7-E: docs/jobs.md に active30 の記載が見つからない');
    } catch (e) { warn(`M7-E: docs の確認に失敗 (${e.message})`); }
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
