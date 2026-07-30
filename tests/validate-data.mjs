// Data validation for Reincarnation Flame Survivor.
// Uses only Node.js standard modules (no external dependencies).
// Run: node tests/validate-data.mjs

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
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
    'elementDamageMult', 'statusPowerMult', 'statusTargetDamage', 'shatterOnFrozenKill', 'absoluteZero',
    // M8-B: 戦士の到達報酬 type
    'maxHpMult', 'furyGainMult', 'damageReductionBonus', 'comboThresholdBonus', 'furyRelease', 'strikeCount', 'warriorApex']);
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
  const KNOWN_TAGS = new Set(['active', 'fire', 'projectile', 'area', 'explosion', 'dot', 'damageOverTime', 'burn', 'summon', 'beam', 'laser', 'melee', 'slash', 'defensive', 'reactive', 'barrier', 'shield', 'homing', 'chain', 'pierce', 'piercing', 'orbit', 'mark', 'combo', 'ground', 'fissure', 'movingArea', 'formation', 'zone', 'resonance', 'statusScaling', 'pulse', 'overheat', 'escalating', 'burst', 'highRisk', 'deathTriggered', 'delayed', 'trap', 'mine', 'ricochet', 'bouncing', 'clone', 'copy', 'sacrifice', 'projectileAbsorb', 'charge', 'screenEdge', 'wave', 'tether', 'control', 'pull', 'directional', 'spread', 'dash', 'movement', 'retaliation', 'revival', 'witch', 'ice', 'mage', 'slow', 'boomerang', 'placement', 'barrage', 'turret',
    // M8-B: 戦士（物理近接）のタグ
    'physical', 'warrior', 'blunt', 'defense', 'spin', 'stance_break', 'knockback', 'cleave', 'counter', 'sustain',
    // M8-C: 戦士 Wave1 のタグ
    'execute', 'buff', 'pull', 'reactive',
    // M8-D: 戦士 Wave2 のタグ
    'launch', 'grab', 'throw', 'thrown', 'field',
    // M8-E: 戦士 最終Wave のタグ
    'thrust', 'line', 'duel', 'focus', 'stance', 'deflect']);
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
  const NEW_CAPS = ['maxDeathEventsTracked', 'maxDeathEventsPerFrame', 'maxFuneralPyres', 'maxPyreEruptionsPerFrame', 'maxMagmaVeins', 'maxMagmaSegments', 'maxMagmaIntersections', 'maxTriArrays', 'maxArrayTicksPerFrame', 'maxResonanceTargets', 'maxResonanceChains', 'maxResonanceExplosions', 'maxOverdriveProjectiles', 'maxOverdriveCastsPerFrame', 'maxMausoleums', 'maxHexagramArrays', 'maxHexagramBeams', 'maxDoomsdayProjectiles', 'maxDoomsdayExplosions'];
  // ※ maxBurningEnemyIndex / maxMainCastEventsPerFrame は M8-A で削除（実装から一度も参照されない予約値だった）。
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

// --- M8-C.1: 進化導線補助（guidance）の検証 ---
// 予約フィールド禁止: 宣言したキーは全て SkillDraftManager から参照されること。
{
  const sc = loadJson('skill-config.json');
  const g = sc && sc.guidance;
  if (g) {
    const src = readFileSync(join(__dirname, '..', 'src', 'systems', 'SkillDraftManager.js'), 'utf8');
    const jobs = loadJson('jobs.json');
    const jobIds = new Set(((jobs && jobs.jobs) || []).map((j) => j.id));
    if (typeof g.enabled !== 'boolean') err('skill-config.json: guidance.enabled が真偽値でない');
    if (!Array.isArray(g.jobs) || g.jobs.length === 0) err('skill-config.json: guidance.jobs が空でない配列でない');
    else for (const j of g.jobs) {
      if (!jobIds.has(j)) err(`skill-config.json: guidance.jobs の ${j} は jobs.json に無い`);
      // 火 / 氷へ誤って設定していないこと（M8-C.1 は戦士だけを対象にする）。
      if (j === 'flame_witch' || j === 'frost_mage') err(`skill-config.json: guidance.jobs へ ${j} を入れてはいけない（火/氷は非回帰対象）`);
    }
    // 倍率は 1 以上の有限数（重みを下げる補助にしない＝到達不能を作らない）。
    const MULT = ['maxMultiplier', 'readyBaseAcquireWeightMultiplier', 'ownedBaseUpgradeWeightMultiplier',
      'baseNearMaxBonusMultiplier', 'supportReadyBaseMultiplier', 'requiredSupportWeightMultiplier',
      'supportNearRequiredMultiplier',
      // M8-D: 補助が active のレシピ（枠を 1 つ占める＝カタログ拡張で不利になる）への追加補正。
      'activeSupportWeightMultiplier'];
    for (const k of MULT) {
      const v = g[k];
      if (typeof v !== 'number' || !Number.isFinite(v)) err(`skill-config.json: guidance.${k} が有限数でない (${v})`);
      else if (v < 1) err(`skill-config.json: guidance.${k} は 1 以上であること (${v})`);
    }
    // 非負整数のしきい値。
    for (const k of ['minBattleLevel', 'nearMaxRemainingLevels', 'nearRequiredRemainingLevels']) {
      const v = g[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) err(`skill-config.json: guidance.${k} が非負整数でない (${v})`);
    }
    // 合成上限は個別倍率の最大値以上（cap がどの補正よりも小さいと死にフィールドになる）。
    const maxSingle = Math.max(...MULT.filter((k) => k !== 'maxMultiplier').map((k) => (typeof g[k] === 'number' ? g[k] : 0)));
    if (typeof g.maxMultiplier === 'number' && g.maxMultiplier < maxSingle) {
      err(`skill-config.json: guidance.maxMultiplier (${g.maxMultiplier}) が個別倍率の最大 (${maxSingle}) より小さい`);
    }
    if (typeof g.maxMultiplier === 'number' && g.maxMultiplier > 8) warn(`skill-config.json: guidance.maxMultiplier が大きすぎる (${g.maxMultiplier})`);
    // pity。
    const p = g.pity;
    if (!p || typeof p !== 'object') err('skill-config.json: guidance.pity が無い');
    else {
      if (typeof p.threshold !== 'number' || !Number.isInteger(p.threshold) || p.threshold < 1) err(`skill-config.json: guidance.pity.threshold が正整数でない (${p.threshold})`);
      if (typeof p.bonusPerStep !== 'number' || !Number.isFinite(p.bonusPerStep) || p.bonusPerStep < 0) err(`skill-config.json: guidance.pity.bonusPerStep が非負の有限数でない (${p.bonusPerStep})`);
      if (typeof p.maxMultiplier !== 'number' || !Number.isFinite(p.maxMultiplier) || p.maxMultiplier < 1) err(`skill-config.json: guidance.pity.maxMultiplier が 1 以上の有限数でない (${p.maxMultiplier})`);
      for (const k of Object.keys(p)) {
        if (k.startsWith('_')) continue;
        if (!src.includes(`p.${k}`) && !src.includes(`'${k}'`)) err(`skill-config.json: guidance.pity.${k} が SkillDraftManager から参照されていない（予約フィールド禁止）`);
      }
    }
    // 予約フィールド禁止 / 重複禁止。
    const seen = new Set();
    for (const k of Object.keys(g)) {
      if (seen.has(k)) err(`skill-config.json: guidance.${k} が重複している`);
      seen.add(k);
      if (k === '_comment' || k === 'pity' || k === 'jobs' || k === 'enabled') continue;
      if (!src.includes(`cfg.${k}`)) err(`skill-config.json: guidance.${k} が SkillDraftManager から参照されていない（予約フィールド禁止）`);
    }
    // 逆方向: 実装が読むキーが data に無い（暗黙の既定値で黙って動く）ことを防ぐ。
    for (const m of src.matchAll(/cfg\.([A-Za-z][A-Za-z0-9]*)/g)) {
      const k = m[1];
      if (['enabled', 'jobs', 'pity', 'synergyAssistEnabled', 'synergyAssistMinBattleLevel', 'synergyAssistMaxMultiplier',
        'evolutionPartnerWeightMultiplier', 'ownedSkillUpgradeWeightMultiplier', 'nearlyMaxedSkillWeightMultiplier',
        'unrelatedNewSkillWeightMultiplier', 'noProgressDraftThreshold', 'noProgressWeightBonus', 'noProgressMaxMultiplier'].includes(k)) continue;
      if (!(k in g)) err(`skill-config.json: SkillDraftManager が読む guidance.${k} が data に無い`);
    }
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
    // M8-A: 火の魔女由来の未参照 cap 5件は削除済み。以後、未参照 cap は 0 件でなければならない（許容リストは空）。
    const FLAME_LEGACY_UNUSED = new Set();
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

// ==========================================================================================
// Milestone 8-A（火の魔女 完成監査）の検証。
// 新しい active / passive / 進化 / ジョブ / 状態 / 敵 / ボス / 難易度は追加しない前提で、
// カタログ数・プール分離・進化到達可能性・cast メタ・runtime 保存・死にフィールド・未使用 cap を検証する。
// ==========================================================================================
{
  const flameJob = (jobsData.jobs || []).find((j) => j.id === 'flame_witch');
  const frostJob = (jobsData.jobs || []).find((j) => j.id === 'frost_mage');
  if (!flameJob) err('M8-A: jobs.json に flame_witch が無い');
  else {
    const S = (id) => (skillsData.skills || []).find((x) => x.id === id);
    const E = (id) => (evoData.evolutions || []).find((x) => x.id === id);
    const P = (id) => (passivesData.passives || []).find((x) => x.id === id);

    // 1. カタログ数（active30 / passive4 / evolution18・合計52）。
    if ((flameJob.activeSkillPool || []).length !== 30) err(`M8-A: 火の魔女 activeSkillPool が ${(flameJob.activeSkillPool || []).length} 種（期待 30）`);
    if ((flameJob.passiveSkillPool || []).length !== 4) err(`M8-A: 火の魔女 passiveSkillPool が ${(flameJob.passiveSkillPool || []).length} 種（期待 4）`);
    if ((flameJob.evolutionPool || []).length !== 18) err(`M8-A: 火の魔女 evolutionPool が ${(flameJob.evolutionPool || []).length} 種（期待 18）`);

    // 2. duplicate id / name（グローバル一意）。
    const seenId = new Set(), seenName = new Set();
    for (const x of [...(skillsData.skills || []), ...(evoData.evolutions || []), ...(passivesData.passives || [])]) {
      if (seenId.has(x.id)) err(`M8-A: id "${x.id}" が重複している`);
      seenId.add(x.id);
      const nm = x.name || x.displayName;
      if (nm) { if (seenName.has(nm)) err(`M8-A: 表示名 "${nm}" が重複している`); seenName.add(nm); }
    }

    // 3. プール分離（jobs / isCommon / 暗黙共通の禁止・他ジョブ混入の禁止）。
    const frostActive = new Set((frostJob && frostJob.activeSkillPool) || []);
    for (const id of flameJob.activeSkillPool || []) {
      const s = S(id);
      if (!s) { err(`M8-A: 火の魔女プールの ${id} が skills.json に無い`); continue; }
      if (!Array.isArray(s.jobs) || s.jobs.length !== 1 || s.jobs[0] !== 'flame_witch') err(`M8-A: ${id} の jobs が ["flame_witch"] でない`);
      if (s.isCommon !== false) err(`M8-A: ${id} の isCommon が false でない（ジョブ専用スキルを共通扱いしない）`);
      if (frostActive.has(id)) err(`M8-A: ${id} が氷術師プールにも入っている（プール混入）`);
      if (s.maxLevel !== 8) err(`M8-A: ${id} の maxLevel が 8 でない`);
      if (!Array.isArray(s.tags) || !s.tags.includes('fire')) err(`M8-A: ${id} の tags に fire が無い`);
      if (!RARITIES.has(s.rarity)) err(`M8-A: ${id} の rarity が不正 (${s.rarity})`);
      if (!s.castMode) err(`M8-A: ${id} に castMode が無い`);
      if (['periodic', 'cooldown', 'continuous', 'resource'].includes(s.castMode) && !s.mainCastEvent) err(`M8-A: ${id} に mainCastEvent が無い`);
      // levels の健全性（NaN / Infinity / 負数の禁止・Lv ごとに1項目は変化）。
      const lv = s.levels || [];
      if (lv.length !== s.maxLevel) err(`M8-A: ${id} の levels が maxLevel と一致しない (${lv.length})`);
      for (const l of lv) for (const [k, v] of Object.entries(l)) {
        if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) err(`M8-A: ${id} Lv${l.level}.${k} が不正な数値 (${v})`);
      }
      for (let i = 1; i < lv.length; i++) {
        const changed = Object.keys(lv[i]).some((k) => k !== 'level' && lv[i][k] !== lv[i - 1][k]);
        if (!changed) err(`M8-A: ${id} の Lv${i} → Lv${i + 1} で成長する項目が無い`);
      }
      // 旧 evolution ブロック（skill-evolutions.json との二重管理）を残さない。
      if (s.evolution) err(`M8-A: ${id} に旧 evolution ブロックが残っている（進化の正は skill-evolutions.json）`);
    }
    for (const id of flameJob.passiveSkillPool || []) {
      const p = P(id);
      if (!p) { err(`M8-A: 火 passive ${id} が passives.json に無い`); continue; }
      if (p.isCommon === true || (Array.isArray(p.jobs) && p.jobs.includes('*'))) err(`M8-A: passive ${id} を明示共通にしない（ジョブ分離）`);
      if (!Array.isArray(p.jobs) || !p.jobs.includes('flame_witch')) err(`M8-A: passive ${id} の jobs に flame_witch が無い`);
      if (!Array.isArray(p.modifiers) || p.modifiers.length === 0) err(`M8-A: passive ${id} に modifier が無い（死に passive）`);
    }

    // 4. 進化の参照と到達可能性（base/support がプール内・必要Lvが上限内・自己/循環参照なし・分岐なし）。
    const fEvoIds = new Set(flameJob.evolutionPool || []);
    const fActive = new Set(flameJob.activeSkillPool || []);
    const fPassive = new Set(flameJob.passiveSkillPool || []);
    const baseSeen = new Map();
    for (const eid of flameJob.evolutionPool || []) {
      const ev = E(eid);
      if (!ev) { err(`M8-A: 進化 ${eid} が skill-evolutions.json に無い`); continue; }
      if (!fActive.has(ev.baseSkillId)) err(`M8-A: 進化 ${eid} の base ${ev.baseSkillId} が火の魔女プールに無い（到達不能）`);
      if (ev.baseSkillId === eid) err(`M8-A: 進化 ${eid} の base が自分自身（自己参照）`);
      if (fEvoIds.has(ev.baseSkillId)) err(`M8-A: 進化 ${eid} の base が別の進化（進化の進化）`);
      if (ev.replacementSkillId !== eid) err(`M8-A: 進化 ${eid} の replacementSkillId が自分自身でない`);
      if (ev.visualTier !== 'evolved') err(`M8-A: 進化 ${eid} の visualTier が evolved でない`);
      if (ev.lv80ProjectileTarget === true) err(`M8-A: 進化 ${eid} が Job Lv80 発射数対象になっている（進化は対象外）`);
      if (Array.isArray(ev.levels) && ev.levels.length > 1) err(`M8-A: 進化 ${eid} が追加 Lv を持っている（単一形態）`);
      if (baseSeen.has(ev.baseSkillId)) err(`M8-A: base ${ev.baseSkillId} から複数の進化へ分岐している（${baseSeen.get(ev.baseSkillId)} / ${eid}）`);
      baseSeen.set(ev.baseSkillId, eid);
      const base = S(ev.baseSkillId);
      if (base && !(base.evolutionBranches || []).includes(eid)) err(`M8-A: ${ev.baseSkillId} の evolutionBranches に ${eid} が無い`);
      for (const r of ev.requiredSkills || []) {
        const isActive = fActive.has(r.skill), isPassive = fPassive.has(r.skill);
        if (!isActive && !isPassive) err(`M8-A: 進化 ${eid} の補助 ${r.skill} が火の魔女プールに無い（到達不能）`);
        if (r.skill === ev.baseSkillId || r.skill === eid) err(`M8-A: 進化 ${eid} の補助が自分/自分の base（自己参照）`);
        if (fEvoIds.has(r.skill)) err(`M8-A: 進化 ${eid} の補助が進化スキル`);
        const max = isActive ? ((S(r.skill) || {}).maxLevel || 8) : ((P(r.skill) || {}).maxLevel || 5);
        if (!(r.level >= 1 && r.level <= max)) err(`M8-A: 進化 ${eid} の補助 ${r.skill} の必要Lv ${r.level} が上限 ${max} を超える（到達不能）`);
      }
      // 進化も cast メタと安全上限を宣言する。
      if (!ev.castMode) err(`M8-A: 進化 ${eid} に castMode が無い`);
      if (!ev.safetyCaps || Object.keys(ev.safetyCaps).length === 0) err(`M8-A: 進化 ${eid} に safetyCaps が無い`);
      for (const [k, v] of Object.entries(ev.safetyCaps || {})) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) err(`M8-A: 進化 ${eid}.safetyCaps.${k} が不正 (${v})`);
      }
    }

    // 5. echo / clone / Lv80 の宣言整合（火の魔女の全 active / 進化）。
    const LV80_EXPECT = ['fireball', 'flame_lance', 'scatter_flame', 'homing_wisp', 'ricochet_ember', 'core_overdrive'].sort().join(',');
    const lv80Actual = (flameJob.activeSkillPool || []).filter((id) => (S(id) || {}).lv80ProjectileTarget === true).sort().join(',');
    if (lv80Actual !== LV80_EXPECT) err(`M8-A: Job Lv80 発射数対象が [${lv80Actual}]（期待 [${LV80_EXPECT}]）`);
    for (const id of [...(flameJob.activeSkillPool || []), ...(flameJob.evolutionPool || [])]) {
      const d = S(id) || E(id) || {};
      for (const key of ['echoPolicy', 'clonePolicy']) {
        if (d[key] && !['standard', 'custom', 'forbidden'].includes(d[key])) err(`M8-A: ${id}.${key} が不正 (${d[key]})`);
      }
      if (d.echoPolicy === 'forbidden' && d.canTriggerEcho !== false) err(`M8-A: ${id} は echoPolicy=forbidden だが canTriggerEcho が false でない`);
      if (d.clonePolicy === 'forbidden' && d.canBeCopiedByClone !== false) err(`M8-A: ${id} は clonePolicy=forbidden だが canBeCopiedByClone が false でない`);
      if ((d.isDefensive || d.isReactive) && d.canTriggerEcho !== false) err(`M8-A: ${id} は防御/反応だが canTriggerEcho が false でない`);
    }

    // 6. 実装との対応（runtime 保存 / 死にフィールド / 未使用 cap）。
    try {
      const smSrc = readFileSync(join(__dirname, '..', 'src', 'systems', 'SkillManager.js'), 'utf8');
      const clsMap = {};
      for (const m of smSrc.matchAll(/([a-z0-9_]+):\s*([A-Za-z0-9_]+Skill),/g)) clsMap[m[1]] = m[2];
      for (const id of [...(flameJob.activeSkillPool || []), ...(flameJob.evolutionPool || [])]) {
        if (!clsMap[id]) { err(`M8-A: ${id} の実装クラスが REGISTRY に無い`); continue; }
        const src = readFileSync(join(__dirname, '..', 'src', 'skills', clsMap[id] + '.js'), 'utf8');
        // 全 active / 進化が runtimeState（CD・周期・設置状態）を保存する（再開直後の無料発動の防止）。
        if (!/serializeState\s*\(/.test(src)) err(`M8-A: ${id} に serializeState が無い（再開で CD が全回復し無料発動になる）`);
        if (!/restoreState\s*\(/.test(src)) err(`M8-A: ${id} に restoreState が無い`);
        // custom 宣言に対する実装。
        const d = S(id) || E(id) || {};
        if (d.echoPolicy === 'custom' && !/echoCast\s*\(/.test(src)) err(`M8-A: ${id} は echoPolicy=custom だが echoCast が無い（no-op）`);
        if (d.clonePolicy === 'custom' && !/cloneCast\s*\(|echoCast\s*\(/.test(src)) err(`M8-A: ${id} は clonePolicy=custom だが cloneCast/echoCast が無い（no-op）`);
        // Lv80 対象と fireProjectileCount の一致。
        const usesCount = /fireProjectileCount\s*\(/.test(src);
        if ((d.lv80ProjectileTarget === true) !== usesCount) err(`M8-A: ${id} の lv80ProjectileTarget=${!!d.lv80ProjectileTarget} と fireProjectileCount の使用が一致しない`);
        // 全敵総当たりの禁止（炎上索引 / SpatialGrid を使う）。
        if (/enemyPool\.forEachActive/.test(src)) err(`M8-A: ${id} が enemyPool.forEachActive で全敵を総当たりしている`);
      }
      // 予約フィールドの禁止（SkillBase の未参照フィールド・空の serializeState）。
      const baseSrc = readFileSync(join(__dirname, '..', 'src', 'skills', 'SkillBase.js'), 'utf8');
      if (/_initCd/.test(baseSrc)) err('M8-A: SkillBase に未参照フィールド _initCd が残っている');
    } catch (e) { warn(`M8-A: 実装との対応確認に失敗 (${e.message})`); }

    // 7. docs のカタログ記載。
    try {
      const docsCatalog = readFileSync(join(__dirname, '..', 'docs', 'skill-catalog.md'), 'utf8');
      for (const id of [...(flameJob.activeSkillPool || []), ...(flameJob.evolutionPool || []), ...(flameJob.passiveSkillPool || [])]) {
        if (!docsCatalog.includes(id)) err(`M8-A: docs/skill-catalog.md に ${id} の記載が無い`);
      }
    } catch (e) { warn(`M8-A: docs の確認に失敗 (${e.message})`); }
  }
}

// ---------- Milestone 8-B: 戦士 基盤実装（データ整合の追加検証） ----------
{
  const warriorJob = (jobsData?.jobs || []).find((j) => j.id === 'warrior');
  const flameJob = (jobsData?.jobs || []).find((j) => j.id === 'flame_witch');
  const frostJob = (jobsData?.jobs || []).find((j) => j.id === 'frost_mage');
  if (!warriorJob) err('M8-B: jobs.json に warrior が無い');
  else {
    // M8-C（Wave1）で active5 → 15 / evolution3 → 8、M8-D（Wave2）で 25 / 13、
    // M8-E（最終Wave）で 30 / 18。passive は 4 のまま。
    // Job Lv80 の対象は 3 ジョブとも 6 種のまま（Wave1 / Wave2 / 最終Wave の新規は対象にしない）。
    const EXPECT = {
      actives: ['great_cleave', 'shield_bash', 'whirlwind_slash', 'charge_slash', 'ground_slam',
        'armor_breaker', 'twin_fang_slash', 'execution_strike', 'leap_smash', 'sweeping_advance',
        'counter_stance', 'war_cry', 'chain_hook', 'shockwave_stomp', 'relentless_combo',
        'rising_slash', 'shield_charge', 'backstep_riposte', 'battlefield_throw', 'triple_crush',
        'blade_guard', 'berserker_rush', 'war_axe_throw', 'breaker_knee', 'rallying_banner',
        'piercing_lunge', 'duel_challenge', 'battle_trance', 'earthshaker_march', 'weapon_deflection'],
      passives: ['brute_force', 'heavy_armor', 'combat_instinct', 'bloodlust'],
      evolutions: ['thousand_blade_dance', 'bloodstorm_whirlwind', 'unyielding_fortress',
        'skull_splitter', 'crimson_execution', 'war_god_roar', 'adamant_counter', 'heaven_crushing_descent',
        'heaven_rending_ascent', 'fortress_rampage', 'shadow_swallow_riposte', 'mountain_hurl',
        'blood_oath_standard',
        'godspeed_impaler', 'king_slayer_duel', 'blood_asura_trance', 'continental_quake_march',
        'heaven_mirror_reversal'],
      lv80: ['great_cleave', 'shield_bash', 'ground_slam', 'armor_breaker', 'twin_fang_slash', 'relentless_combo'],
    };
    // 1. カタログ規模（M8-E は active30 / passive4 / evolution18）。
    if ((warriorJob.activeSkillPool || []).join(',') !== EXPECT.actives.join(',')) err(`M8-B: 戦士 activeSkillPool が期待と違う（${(warriorJob.activeSkillPool || []).join(',')}）`);
    if ((warriorJob.passiveSkillPool || []).join(',') !== EXPECT.passives.join(',')) err(`M8-B: 戦士 passiveSkillPool が期待と違う`);
    if ((warriorJob.evolutionPool || []).join(',') !== EXPECT.evolutions.join(',')) err(`M8-B: 戦士 evolutionPool が期待と違う`);
    if (warriorJob.element !== 'physical') err('M8-B: 戦士の element が physical でない');
    if ((warriorJob.statusEffects || []).length !== 0) err('M8-B: 戦士は共通状態異常を追加しない（statusEffects は空）');
    // 火/氷のカタログ規模が変わっていないこと（非回帰）。
    if (flameJob && (flameJob.activeSkillPool.length !== 30 || (flameJob.passiveSkillPool || []).length !== 4 || (flameJob.evolutionPool || []).length !== 18)) {
      err('M8-B: 火の魔女のカタログ数（30/4/18）が変化している');
    }
    if (frostJob && (frostJob.activeSkillPool.length !== 30 || (frostJob.passiveSkillPool || []).length !== 4 || (frostJob.evolutionPool || []).length !== 18)) {
      err('M8-B: 氷術師のカタログ数（30/4/18）が変化している');
    }

    // 2. active5: 属性・ジョブ分離・レベル数・近接ポリシー。
    const flameSet = new Set(flameJob ? flameJob.activeSkillPool : []);
    const frostSet = new Set(frostJob ? frostJob.activeSkillPool : []);
    for (const id of warriorJob.activeSkillPool || []) {
      const s = (skillsData?.skills || []).find((x) => x.id === id);
      if (!s) { err(`M8-B: 戦士プールの ${id} が skills.json に無い`); continue; }
      if (s.element !== 'physical') err(`M8-B: ${id} の element が physical でない`);
      if (!Array.isArray(s.jobs) || s.jobs.length !== 1 || s.jobs[0] !== 'warrior') err(`M8-B: ${id} の jobs が ["warrior"] でない`);
      if (s.isCommon !== false) err(`M8-B: ${id} の isCommon が false でない`);
      if (flameSet.has(id) || frostSet.has(id)) err(`M8-B: ${id} が火/氷のプールにも入っている（プール混入）`);
      if (s.maxLevel !== 8) err(`M8-B: ${id} の maxLevel が 8 でない`);
      if (!Array.isArray(s.levels) || s.levels.length !== 8) err(`M8-B: ${id} の levels が 8 段階でない`);
      if (s.echoPolicy !== 'forbidden' || s.clonePolicy !== 'forbidden') err(`M8-B: ${id} は残響/分身を forbidden にする`);
      if (s.canTriggerEcho !== false || s.canBeCopiedByClone !== false) err(`M8-B: ${id} の canTriggerEcho / canBeCopiedByClone が false でない`);
      if (typeof s.meleeRange !== 'number' || !(s.meleeRange > 0)) err(`M8-B: ${id} の meleeRange が正の数でない`);
      if (typeof s.lv80ProjectileTarget !== 'boolean') err(`M8-B: ${id} は lv80ProjectileTarget を明示する`);
      // レベル成長の単調性。
      for (let i = 1; i < (s.levels || []).length; i++) {
        if (s.levels[i].damage < s.levels[i - 1].damage) err(`M8-B: ${id} の damage が Lv${i + 1} で減少している`);
        if (s.levels[i].cooldown > s.levels[i - 1].cooldown) err(`M8-B: ${id} の cooldown が Lv${i + 1} で増加している`);
      }
    }

    // 3. passive4: ジョブ分離・modifier キーの登録。
    const modKeys = new Set(skillCfg?.modifierKeys || []);
    for (const id of warriorJob.passiveSkillPool || []) {
      const p = (passivesData?.passives || []).find((x) => x.id === id);
      if (!p) { err(`M8-B: 戦士 passive ${id} が passives.json に無い`); continue; }
      if (!Array.isArray(p.jobs) || p.jobs.join(',') !== 'warrior') err(`M8-B: passive ${id} の jobs が ["warrior"] でない`);
      if (p.isCommon !== false) err(`M8-B: passive ${id} の isCommon が false でない`);
      if (p.maxLevel !== 4) err(`M8-B: passive ${id} の maxLevel が 4 でない`);
      for (const m of p.modifiers || []) {
        if (!modKeys.has(m.key)) err(`M8-B: passive ${id} の modifier key "${m.key}" が skill-config.modifierKeys に無い`);
        if (!(typeof m.perLevel === 'number' && m.perLevel > 0)) err(`M8-B: passive ${id} の ${m.key} の perLevel が正でない`);
      }
    }

    // 4. evolution3: 基礎/補助・置換・safetyCaps。
    for (const id of warriorJob.evolutionPool || []) {
      const e = (evoData?.evolutions || []).find((x) => x.id === id);
      if (!e) { err(`M8-B: 戦士 evolution ${id} が skill-evolutions.json に無い`); continue; }
      if (e.element !== 'physical') err(`M8-B: ${id} の element が physical でない`);
      if (!(warriorJob.activeSkillPool || []).includes(e.baseSkillId)) err(`M8-B: ${id} の baseSkillId ${e.baseSkillId} が戦士 active でない`);
      if (e.replacementSkillId !== e.id) err(`M8-B: ${id} の replacementSkillId が自身でない（置換関係）`);
      if (e.echoPolicy !== 'forbidden' || e.clonePolicy !== 'forbidden') err(`M8-B: ${id} は残響/分身を forbidden にする`);
      if (e.lv80ProjectileTarget !== false) err(`M8-B: ${id} は Lv80 打撃数の対象外にする`);
      if (!e.safetyCaps || Object.keys(e.safetyCaps).length === 0) err(`M8-B: ${id} に safetyCaps が無い`);
      // 補助は戦士の passive プール、または戦士の active プール（M8-C: 天墜崩撃 = 地砕き Lv6）。
      // active 補助の場合は必要 Lv を data で明示し、その active が置換されないことを保証する。
      for (const req of e.requiredSkills || []) {
        const inPassive = (warriorJob.passiveSkillPool || []).includes(req.skill);
        const inActive = (warriorJob.activeSkillPool || []).includes(req.skill);
        if (!inPassive && !inActive) err(`M8-B/M8-C: ${id} の補助 ${req.skill} が戦士のプールに無い`);
        if (typeof req.level !== 'number' || req.level < 1) err(`M8-C: ${id} の補助 ${req.skill} の必要 Lv が data で明示されていない`);
        if (inActive) {
          const sup = (skillsData?.skills || []).find((x) => x.id === req.skill);
          if (sup && req.level > (sup.maxLevel || 1)) err(`M8-C: ${id} の補助 active ${req.skill} の必要 Lv${req.level} が maxLevel を超える`);
          // active 補助は置換されない（進化の replacement は base だけ）。
          if (e.replacementSkillId === req.skill) err(`M8-C: ${id} が補助 active ${req.skill} を置換している`);
          if (e.baseSkillId === req.skill) err(`M8-C: ${id} の base と補助 active が同じ（${req.skill}）`);
        }
      }
      const base = (skillsData?.skills || []).find((s) => s.id === e.baseSkillId);
      if (base && !(base.evolutionBranches || []).includes(id)) err(`M8-B: ${e.baseSkillId} の evolutionBranches に ${id} が無い`);
    }

    // 5. balance.json の warrior ブロック（数値のハードコード禁止・上限の健全性）。
    const wb = balance?.warrior;
    if (!wb) err('M8-B: balance.json に warrior ブロックが無い');
    else {
      for (const k of ['fury', 'furyRelease', 'combo', 'mitigation', 'unyielding', 'killHeal', 'poise', 'autoMove']) {
        if (!wb[k]) err(`M8-B: balance.warrior.${k} が無い`);
      }
      if (wb.fury) {
        if (!(wb.fury.max > 0)) err('M8-B: fury.max が正でない');
        if (!(wb.fury.maxGainPerCast > 0 && wb.fury.maxGainPerCast < wb.fury.max)) err('M8-B: fury.maxGainPerCast が 0 < x < max でない');
        if (!(wb.fury.maxGainPerSecond > 0)) err('M8-B: fury.maxGainPerSecond が正でない');
        if (!(wb.fury.releaseGainMult >= 0 && wb.fury.releaseGainMult < 1)) err('M8-B: fury.releaseGainMult が [0,1) でない');
      }
      if (wb.mitigation && !(wb.mitigation.maxTotalReduction > 0 && wb.mitigation.maxTotalReduction < 1)) {
        err('M8-B: mitigation.maxTotalReduction が (0,1) でない（永久無敵の禁止）');
      }
      if (wb.unyielding) {
        if (!(wb.unyielding.cooldownMs > wb.unyielding.durationMs)) err('M8-B: unyielding.cooldownMs は durationMs より長くする');
        if (!(wb.unyielding.damageReduction > 0 && wb.unyielding.damageReduction < 1)) err('M8-B: unyielding.damageReduction が (0,1) でない');
      }
      if (wb.killHeal && !(wb.killHeal.perSecondCapPercent > 0)) err('M8-B: killHeal.perSecondCapPercent が正でない（無限回復の禁止）');
      if (wb.poise) {
        if (wb.poise.elite && !(wb.poise.elite.immunityMs > wb.poise.elite.staggerMs)) err('M8-B: poise.elite.immunityMs は staggerMs より長くする（連続 stagger の禁止）');
        if (wb.poise.boss) {
          if (!(wb.poise.boss.thresholdGrowth > 1)) err('M8-B: poise.boss.thresholdGrowth が 1 より大きくない');
          if (!(wb.poise.boss.thresholdMaxMult > 1)) err('M8-B: poise.boss.thresholdMaxMult が 1 より大きくない');
          if (!(wb.poise.boss.breakCooldownMs > 0)) err('M8-B: poise.boss.breakCooldownMs が正でない');
        }
      }
      if (wb.combo && Array.isArray(wb.combo.thresholds)) {
        for (let i = 1; i < wb.combo.thresholds.length; i++) {
          if (wb.combo.thresholds[i].at <= wb.combo.thresholds[i - 1].at) err('M8-B: combo.thresholds の at が昇順でない');
        }
      }
    }

    // 6. M8-B で追加した skillCaps（4 品質・単調・正・実装から参照）。
    const M8B_CAPS = ['maxMeleeTargetsPerHit', 'maxSpinTicksPerFrame', 'maxChargeHits', 'maxCounterHits',
      'maxBladeDanceStrikes', 'maxWarriorSlams', 'maxMeleeArcVisuals', 'maxSlashTrails', 'maxSpinVisuals',
      'maxDashTrails', 'maxGroundDebris', 'maxWarriorHitSparks', 'maxPoiseIndicators',
      // M8-C（Wave1）で追加した damage/event 上限 9 種と演出上限 11 種。
      'maxOverheadStrikes', 'maxTwinFangStrikes', 'maxExecutesPerCast', 'maxLeapImpacts',
      'maxSweepStrikesPerFrame', 'maxCounterWindows', 'maxChainPullsPerCast',
      'maxRelentlessStrikes', 'maxRelentlessRetargets',
      'maxOverheadSlashVisuals', 'maxTwinSlashVisuals', 'maxExecuteMarkers', 'maxLeapTrails',
      'maxLandingDebris', 'maxSweepTrails', 'maxCounterFlashes', 'maxWarCryRings',
      'maxChainHookLines', 'maxStompDebris', 'maxRelentlessSparks'];
    for (const n of M8B_CAPS) {
      const c = balance?.skillCaps?.[n];
      if (!c) { err(`M8-B: skillCaps.${n} が無い`); continue; }
      for (const q of ['low', 'medium', 'high', 'ultra']) {
        if (!(typeof c[q] === 'number' && Number.isInteger(c[q]) && c[q] > 0)) err(`M8-B: skillCaps.${n}.${q} が正の整数でない`);
      }
      if (!(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra)) err(`M8-B: skillCaps.${n} が品質順で単調でない`);
    }

    // 6b. Job Lv80「打撃数+1」対象は明示 flag の 6 種だけ（M8-C で 3 → 6 へ）。
    {
      const lv80 = (warriorJob.activeSkillPool || []).filter((id) => {
        const sk = (skillsData?.skills || []).find((x) => x.id === id);
        return sk && sk.lv80ProjectileTarget === true;
      });
      if (lv80.join(',') !== EXPECT.lv80.join(',')) err(`M8-C: 戦士の Lv80 対象が期待と違う（${lv80.join(',')}）`);
      for (const id of warriorJob.evolutionPool || []) {
        const e = (evoData?.evolutions || []).find((x) => x.id === id);
        if (e && e.lv80ProjectileTarget !== false) err(`M8-C: 進化 ${id} は Lv80 対象外にする`);
      }
    }

    // 7. job-progression.json（warrior）。
    const wp = jobProgData?.jobs?.warrior;
    if (!wp) err('M8-B: job-progression.json に warrior が無い');
    else {
      if (wp.levelCap !== 100) err('M8-B: warrior の levelCap が 100 でない');
      if ((wp.milestones || []).length < 10) err(`M8-B: warrior の到達報酬が ${(wp.milestones || []).length} 件（10 件以上必要）`);
      if (!(wp.milestones || []).some((m) => m.level === 80 && m.type === 'strikeCount')) err('M8-B: warrior に Lv80「打撃数+1」の報酬が無い');
      if (!(wp.milestones || []).some((m) => m.level === 100)) err('M8-B: warrior に Lv100 の報酬が無い');
    }

    // 8. 実装との対応（クラス登録・戦士システム・HUD・死にフィールドの禁止）。
    try {
      const smSrc = readFileSync(join(__dirname, '..', 'src', 'systems', 'SkillManager.js'), 'utf8');
      const reg = {};
      for (const m of smSrc.matchAll(/([a-z0-9_]+):\s*([A-Za-z0-9_]+Skill),/g)) reg[m[1]] = m[2];
      // M8-C: 進化が基礎 active のクラスを継承する場合があるため、`extends` を辿って
      // 祖先クラスのソースも連結して見る（継承で満たしている実装を「未実装」と誤検出しない）。
      const srcWithAncestors = (cls, depth = 0) => {
        const f = join(__dirname, '..', 'src', 'skills', cls + '.js');
        if (!existsSync(f) || depth > 4) return '';
        const body = readFileSync(f, 'utf8');
        const m = body.match(/export class \w+ extends (\w+)/);
        return m ? body + '\n' + srcWithAncestors(m[1], depth + 1) : body;
      };
      for (const id of [...(warriorJob.activeSkillPool || []), ...(warriorJob.evolutionPool || [])]) {
        if (!reg[id]) { err(`M8-B: ${id} の実装クラスが SkillManager の REGISTRY に無い`); continue; }
        const file = join(__dirname, '..', 'src', 'skills', reg[id] + '.js');
        if (!existsSync(file)) { err(`M8-B: ${id} の実装ファイル ${reg[id]}.js が無い`); continue; }
        const own = readFileSync(file, 'utf8');
        const src = srcWithAncestors(reg[id]); // 継承も含めた実装の全体
        if (!/serializeState\s*\(/.test(src) || !/restoreState\s*\(/.test(src)) err(`M8-B: ${id} が serializeState / restoreState を実装していない`);
        if (!/cdLeft/.test(src)) err(`M8-B: ${id} がクールダウンを保存していない`);
        if (!/destroy\s*\(\s*\)\s*\{/.test(src)) err(`M8-B: ${id} が destroy を実装していない`);
        if (/echoCast|cloneCast/.test(own)) err(`M8-B: ${id} は残響/分身の実装を持たない`);
        if (/enemyPool\.forEachActive/.test(own)) err(`M8-B: ${id} が全敵を総当たりしている（meleeStrike / SpatialGrid を使う）`);
        if (/Math\.random\s*\(|Date\.now\s*\(|performance\.now\s*\(/.test(own.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'))) {
          err(`M8-B: ${id} が乱数 / 実時間へ依存している（決定論違反）`);
        }
      }
      // 戦士システム / HUD の存在と、外部通信の禁止。
      for (const rel of ['src/systems/WarriorCombatSystem.js', 'src/skills/WarriorSkillBase.js', 'src/ui/WarriorHud.js']) {
        const f = join(__dirname, '..', rel);
        if (!existsSync(f)) { err(`M8-B: ${rel} が無い`); continue; }
        const src = readFileSync(f, 'utf8');
        if (/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/.test(src)) err(`M8-B: ${rel} が外部通信をしている`);
      }
      // 進化の宣言値がすべて実装から参照されること（死にフィールドの禁止）。
      for (const id of warriorJob.evolutionPool || []) {
        const e = (evoData?.evolutions || []).find((x) => x.id === id);
        if (!e || !reg[id]) continue;
        const src = srcWithAncestors(reg[id]);
        for (const key of Object.keys(e.safetyCaps || {})) {
          if (!src.includes(`'${key}'`) && !src.includes(`"${key}"`)) err(`M8-B: ${id} の safetyCaps.${key} が実装から参照されていない（死にフィールド）`);
        }
        for (const block of ['damage', 'area', 'knockback', 'poiseDamage', 'comboGain', 'furyGain', 'projectileCount', 'mitigation', 'counterWindow', 'killExtend']) {
          if (!e[block]) continue;
          for (const key of Object.keys(e[block])) {
            if (!src.includes(key)) err(`M8-B: ${id} の ${block}.${key} が実装から参照されていない（死にフィールド）`);
          }
        }
      }
      // active の宣言値（levels の各キー・config）も実装から参照されること。
      for (const id of warriorJob.activeSkillPool || []) {
        const s = (skillsData?.skills || []).find((x) => x.id === id);
        if (!s || !reg[id]) continue;
        const src = srcWithAncestors(reg[id]);
        // level / cooldown は SkillBase（共通基底）が消費するため、各スキルクラス側の参照は求めない。
        const baseHandled = new Set(['level', 'cooldown']);
        for (const key of Object.keys(s.levels?.[0] || {})) {
          if (baseHandled.has(key)) continue;
          if (!src.includes(key)) err(`M8-B: ${id} の levels.${key} が実装から参照されていない（死にフィールド）`);
        }
        for (const key of Object.keys(s.config || {})) {
          if (!src.includes(key)) err(`M8-B: ${id} の config.${key} が実装から参照されていない（死にフィールド）`);
        }
      }
      // balance.warrior の各キーが WarriorCombatSystem から参照されること。
      const wcs = existsSync(join(__dirname, '..', 'src', 'systems', 'WarriorCombatSystem.js'))
        ? readFileSync(join(__dirname, '..', 'src', 'systems', 'WarriorCombatSystem.js'), 'utf8') : '';
      const battleSrc = readFileSync(join(__dirname, '..', 'src', 'scenes', 'BattleScene.js'), 'utf8');
      const combined = wcs + battleSrc;
      const walkKeys = (obj, path) => {
        for (const [k, v] of Object.entries(obj || {})) {
          if (k.startsWith('_')) continue;
          if (v && typeof v === 'object' && !Array.isArray(v)) { walkKeys(v, path + '.' + k); continue; }
          if (!combined.includes(k)) err(`M8-B: balance.warrior${path}.${k} が実装から参照されていない（死にフィールド）`);
        }
      };
      if (wb) walkKeys(wb, '');
    } catch (e) { warn(`M8-B: 実装との対応確認に失敗 (${e.message})`); }

    // 9. docs のカタログ記載。
    try {
      const docsCatalog = readFileSync(join(__dirname, '..', 'docs', 'skill-catalog.md'), 'utf8');
      for (const id of [...(warriorJob.activeSkillPool || []), ...(warriorJob.evolutionPool || []), ...(warriorJob.passiveSkillPool || [])]) {
        if (!docsCatalog.includes(id)) err(`M8-B: docs/skill-catalog.md に ${id} の記載が無い`);
      }
    } catch (e) { warn(`M8-B: docs の確認に失敗 (${e.message})`); }
  }
}

// ---------- Milestone 8-D: 戦士スキル拡張 Wave2（データ整合の追加検証） ----------
{
  const warriorJob = (jobsData?.jobs || []).find((j) => j.id === 'warrior');
  if (warriorJob) {
    const WAVE2_ACT = ['rising_slash', 'shield_charge', 'backstep_riposte', 'battlefield_throw', 'triple_crush',
      'blade_guard', 'berserker_rush', 'war_axe_throw', 'breaker_knee', 'rallying_banner'];
    const WAVE2_EVO = ['heaven_rending_ascent', 'fortress_rampage', 'shadow_swallow_riposte',
      'mountain_hurl', 'blood_oath_standard'];

    // 1. カタログ規模（active25 / passive4 / evolution13）。
    if ((warriorJob.activeSkillPool || []).length !== 30) err(`M8-D: 戦士 active が 30 でない（${(warriorJob.activeSkillPool || []).length}）`);
    if ((warriorJob.passiveSkillPool || []).length !== 4) err(`M8-D: 戦士 passive が 4 でない（${(warriorJob.passiveSkillPool || []).length}）`);
    if ((warriorJob.evolutionPool || []).length !== 18) err(`M8-D: 戦士 evolution が 18 でない（${(warriorJob.evolutionPool || []).length}）`);
    for (const id of WAVE2_ACT) if (!(warriorJob.activeSkillPool || []).includes(id)) err(`M8-D: 戦士 activeSkillPool に ${id} が無い`);
    for (const id of WAVE2_EVO) if (!(warriorJob.evolutionPool || []).includes(id)) err(`M8-D: 戦士 evolutionPool に ${id} が無い`);

    // 2. Job Lv80「打撃数 +1」の対象を増やしていない（3 ジョブとも 6 種のまま）。
    for (const jid of ['warrior', 'flame_witch', 'frost_mage']) {
      const j = (jobsData?.jobs || []).find((x) => x.id === jid);
      const n = (j?.activeSkillPool || []).filter((id) => ((skillsData?.skills || []).find((s) => s.id === id) || {}).lv80ProjectileTarget === true).length;
      if (n !== 6) err(`M8-D: ${jid} の Job Lv80 対象が 6 種でない（${n}）`);
    }
    for (const id of [...WAVE2_ACT, ...WAVE2_EVO]) {
      const def = (skillsData?.skills || []).find((s) => s.id === id) || (evoData?.evolutions || []).find((e) => e.id === id);
      if (def && def.lv80ProjectileTarget !== false) err(`M8-D: ${id} は Lv80 対象にしない（lv80ProjectileTarget:false）`);
    }

    // 3. 新 active の data 完全性（物理・戦士専用・Lv1–8・残響/分身の対象外）。
    for (const id of WAVE2_ACT) {
      const s2 = (skillsData?.skills || []).find((x) => x.id === id);
      if (!s2) { err(`M8-D: skills.json に ${id} が無い`); continue; }
      if (s2.element !== 'physical') err(`M8-D: ${id} の element が physical でない`);
      if ((s2.jobs || []).join(',') !== 'warrior') err(`M8-D: ${id} の jobs が ["warrior"] でない`);
      if (s2.isCommon !== false) err(`M8-D: ${id} の isCommon が false でない`);
      if (s2.maxLevel !== 8 || (s2.levels || []).length !== 8) err(`M8-D: ${id} が Lv1–8 でない`);
      if (s2.echoPolicy !== 'forbidden' || s2.clonePolicy !== 'forbidden') err(`M8-D: ${id} の echo/clonePolicy が forbidden でない`);
      if (s2.canTriggerEcho !== false || s2.canBeCopiedByClone !== false) err(`M8-D: ${id} の canTriggerEcho/canBeCopiedByClone が false でない`);
      if (s2.castMode !== 'cooldown') err(`M8-D: ${id} の castMode が cooldown でない`);
      if (!(typeof s2.meleeRange === 'number' && s2.meleeRange > 0)) err(`M8-D: ${id} の meleeRange が正の数でない`);
      // 成長: cooldown は非増加、宣言した軸のうち 2 つ以上が Lv1 → Lv8 で伸びる。
      let cdOk = true;
      for (let i = 1; i < (s2.levels || []).length; i++) if (s2.levels[i].cooldown > s2.levels[i - 1].cooldown) cdOk = false;
      if (!cdOk) err(`M8-D: ${id} の cooldown が Lv で増えている`);
      const a = s2.levels[0], b = s2.levels[7];
      const grew = Object.keys(a).filter((k) => k !== 'level' && k !== 'cooldown' && typeof a[k] === 'number' && b[k] > a[k]);
      if (grew.length < 2) err(`M8-D: ${id} の Lv1 → Lv8 で伸びる数値が 2 つ未満`);
    }

    // 4. 新 evolution の data 完全性。
    for (const id of WAVE2_EVO) {
      const e = (evoData?.evolutions || []).find((x) => x.id === id);
      if (!e) { err(`M8-D: skill-evolutions.json に ${id} が無い`); continue; }
      if (!WAVE2_ACT.includes(e.baseSkillId)) err(`M8-D: ${id} の基礎 ${e.baseSkillId} が Wave2 の active でない`);
      if ((e.requiredSkills || []).length !== 1) err(`M8-D: ${id} の補助が 1 件でない`);
      if (e.replacementSkillId !== id) err(`M8-D: ${id} の replacementSkillId が自身でない`);
      if (e.element !== 'physical') err(`M8-D: ${id} の element が physical でない`);
      if (e.echoPolicy !== 'forbidden' || e.clonePolicy !== 'forbidden') err(`M8-D: ${id} の echo/clonePolicy が forbidden でない`);
      // 補助 active は置換しない（別スキルとして併存し、CD も触らない）。
      const req = (e.requiredSkills || [])[0];
      if (req && (warriorJob.activeSkillPool || []).includes(req.skill) && e.replacementSkillId === req.skill) {
        err(`M8-D: ${id} が補助 active ${req.skill} を置換している`);
      }
    }

    // 5. balance.warrior の Wave2 ブロック。
    const W = balance?.warrior || {};
    for (const k of ['launch', 'frontalGuard', 'grab', 'rally', 'lowHp']) {
      if (!W[k] || typeof W[k] !== 'object') err(`M8-D: balance.warrior.${k} が無い`);
    }
    if (W.launch) {
      if (!(W.launch.maxAirborneMs > 0)) err('M8-D: balance.warrior.launch.maxAirborneMs が正でない');
      if (!(W.launch.immuneMs > 0)) err('M8-D: balance.warrior.launch.immuneMs が正でない');
      if (W.launch.allowElite !== false || W.launch.allowBoss !== false) err('M8-D: 打ち上げはエリート / ボスへ許可しない');
      if (!(W.launch.poiseConversion > 0)) err('M8-D: balance.warrior.launch.poiseConversion が正でない');
    }
    if (W.frontalGuard) {
      const f = W.frontalGuard;
      if (f.requireDirection !== true) err('M8-D: frontalGuard.requireDirection は true（方向なしの被弾を前面扱いにしない）');
      if (!(f.maxFrontalMitigation > 0 && f.maxFrontalMitigation < 1)) err('M8-D: frontalGuard.maxFrontalMitigation が 0 < x < 1 でない');
      if (!(f.sideMultiplier >= 0 && f.sideMultiplier <= 1)) err('M8-D: frontalGuard.sideMultiplier が 0..1 でない');
      if (!(f.backMultiplier >= 0 && f.backMultiplier <= f.sideMultiplier)) err('M8-D: frontalGuard.backMultiplier ≤ sideMultiplier でない');
    }
    if (W.grab) {
      if (W.grab.allowElite !== false || W.grab.allowBoss !== false) err('M8-D: 掴みはエリート / ボスへ許可しない');
      if (!(W.grab.maxGrabPerCast >= 1)) err('M8-D: grab.maxGrabPerCast が 1 以上でない');
      if (!(W.grab.maxThrowMs > 0)) err('M8-D: grab.maxThrowMs が正でない');
    }
    if (W.rally) {
      if (W.rally.maxFields !== 1) err(`M8-D: rally.maxFields は 1（陣は常に 1 つ・実際 ${W.rally.maxFields}）`);
      for (const k of ['maxDurationMs', 'maxComboGrace', 'maxFuryGain', 'maxMitigation', 'maxMeleeArea', 'maxKillHealBonus']) {
        if (!(W.rally[k] > 0)) err(`M8-D: rally.${k} が正でない`);
      }
    }
    if (W.lowHp) {
      if (!(W.lowHp.maxMissingHpMultiplier > 1)) err('M8-D: lowHp.maxMissingHpMultiplier が 1 より大きくない');
      if (W.lowHp.maxMissingHpMultiplier > 2) err('M8-D: lowHp.maxMissingHpMultiplier が 2 を超えている（暴走の恐れ）');
    }

    // 6. data の宣言値が balance の上限を超えていない。
    const lv8 = (id) => (((skillsData?.skills || []).find((s) => s.id === id) || {}).levels || [])[7] || {};
    if (W.frontalGuard && lv8('shield_charge').frontalMitigation > W.frontalGuard.maxFrontalMitigation) {
      err('M8-D: shield_charge Lv8 の frontalMitigation が balance の上限を超えている');
    }
    if (W.launch && lv8('rising_slash').launchDuration > W.launch.maxAirborneMs) {
      err('M8-D: rising_slash Lv8 の launchDuration が maxAirborneMs を超えている');
    }
    if (W.rally) {
      const b = lv8('rallying_banner');
      if (b.duration > W.rally.maxDurationMs) err('M8-D: rallying_banner Lv8 の duration が上限を超えている');
      if (b.comboGrace > W.rally.maxComboGrace) err('M8-D: rallying_banner Lv8 の comboGrace が上限を超えている');
      if (b.furyGain > W.rally.maxFuryGain) err('M8-D: rallying_banner Lv8 の furyGain が上限を超えている');
      if (b.mitigationValue > W.rally.maxMitigation) err('M8-D: rallying_banner Lv8 の mitigationValue が上限を超えている');
      if (b.meleeArea > W.rally.maxMeleeArea) err('M8-D: rallying_banner Lv8 の meleeArea が上限を超えている');
    }
    if (W.lowHp && lv8('berserker_rush').missingHpBonus > W.lowHp.maxMissingHpMultiplier) {
      err('M8-D: berserker_rush Lv8 の missingHpBonus が上限を超えている');
    }

    // 7. Wave2 で足した skillCaps（4 段階・単調非減少・正の数）。
    const WAVE2_CAPS = ['maxLaunchTargets', 'maxChargeContacts', 'maxRiposteStrikes', 'maxThrowImpacts',
      'maxCrushStages', 'maxGuardTicksPerFrame', 'maxRushSteps', 'maxAxeHitsPerTarget', 'maxKneeStrikes', 'maxRallyFields',
      'maxLaunchVisuals', 'maxChargeTrails', 'maxRiposteTrails', 'maxThrowArcs', 'maxCrushShockVisuals',
      'maxGuardBladeVisuals', 'maxRushSparks', 'maxAxeSpinVisuals', 'maxKneeImpactVisuals', 'maxBannerRings'];
    for (const name of WAVE2_CAPS) {
      const c = (balance?.skillCaps || {})[name];
      if (!c) { err(`M8-D: balance.skillCaps に ${name} が無い`); continue; }
      for (const q of ['low', 'medium', 'high', 'ultra']) {
        if (!(typeof c[q] === 'number' && Number.isFinite(c[q]) && c[q] > 0)) err(`M8-D: skillCaps.${name}.${q} が正の有限数でない`);
      }
      if (!(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra)) err(`M8-D: skillCaps.${name} が単調非減少でない`);
    }

    // 8. 火 / 氷の非回帰（規模・混入）。
    for (const jid of ['flame_witch', 'frost_mage']) {
      const j = (jobsData?.jobs || []).find((x) => x.id === jid);
      if (!j) continue;
      if ((j.activeSkillPool || []).length !== 30) err(`M8-D: ${jid} の active が 30 でない`);
      if ((j.evolutionPool || []).length !== 18) err(`M8-D: ${jid} の evolution が 18 でない`);
      for (const id of [...WAVE2_ACT, ...WAVE2_EVO]) {
        if ((j.activeSkillPool || []).includes(id) || (j.evolutionPool || []).includes(id)) err(`M8-D: ${jid} へ ${id} が混入している`);
      }
    }
    if (balance?.saveVersion !== 6) err(`M8-D: saveVersion が 6 でない（${balance?.saveVersion}）— 追加は加算的にする`);

    // 9. guidance へ足したキー（active 補助の追加補正）。
    const g = (skillCfg || {}).guidance || {};
    if (typeof g.activeSupportWeightMultiplier !== 'number' || !(g.activeSupportWeightMultiplier >= 1)) {
      err('M8-D: guidance.activeSupportWeightMultiplier が 1 以上の数値でない');
    }
    if (!(g.jobs || []).includes('warrior') || (g.jobs || []).length !== 1) {
      err('M8-D: guidance.jobs は ["warrior"] のまま（火 / 氷は非回帰）');
    }
    // M8-C.1 のしきい値を下げていない。
    const KEEP = { minBattleLevel: 3, readyBaseAcquireWeightMultiplier: 1.3, ownedBaseUpgradeWeightMultiplier: 1.8, requiredSupportWeightMultiplier: 1.3 };
    for (const [k, v] of Object.entries(KEEP)) {
      if (g[k] !== v) err(`M8-D: guidance.${k} が M8-C.1 の値（${v}）から変わっている（${g[k]}）`);
    }
    if ((g.pity || {}).threshold !== 3) err('M8-D: guidance.pity.threshold が 3 から変わっている');

    // 10. docs の記載。
    try {
      const docsCatalog = readFileSync(join(__dirname, '..', 'docs', 'skill-catalog.md'), 'utf8');
      for (const id of [...WAVE2_ACT, ...WAVE2_EVO]) {
        if (!docsCatalog.includes(id)) err(`M8-D: docs/skill-catalog.md に ${id} の記載が無い`);
      }
    } catch (e) { warn(`M8-D: docs の確認に失敗 (${e.message})`); }
  }
}

// ---------- Milestone 8-E: 戦士スキル拡張 最終Wave（データ整合の追加検証） ----------
{
  const warriorJob = (jobsData?.jobs || []).find((j) => j.id === 'warrior');
  if (warriorJob) {
    const E_ACT = ['piercing_lunge', 'duel_challenge', 'battle_trance', 'earthshaker_march', 'weapon_deflection'];
    const E_EVO = ['godspeed_impaler', 'king_slayer_duel', 'blood_asura_trance', 'continental_quake_march', 'heaven_mirror_reversal'];
    const SK = (id) => (skillsData?.skills || []).find((x) => x.id === id);
    const EV = (id) => (evoData?.evolutions || []).find((x) => x.id === id);

    // 1. 最終カタログ（active30 / passive4 / evolution18 / 合計 52）。
    const nA = (warriorJob.activeSkillPool || []).length;
    const nP = (warriorJob.passiveSkillPool || []).length;
    const nE = (warriorJob.evolutionPool || []).length;
    if (nA !== 30) err(`M8-E: 戦士 active が 30 でない（${nA}）`);
    if (nP !== 4) err(`M8-E: 戦士 passive が 4 でない（${nP}）`);
    if (nE !== 18) err(`M8-E: 戦士 evolution が 18 でない（${nE}）`);
    if (nA + nP + nE !== 52) err(`M8-E: 戦士カタログ合計が 52 でない（${nA + nP + nE}）`);
    for (const id of E_ACT) if (!(warriorJob.activeSkillPool || []).includes(id)) err(`M8-E: activeSkillPool に ${id} が無い`);
    for (const id of E_EVO) if (!(warriorJob.evolutionPool || []).includes(id)) err(`M8-E: evolutionPool に ${id} が無い`);
    // 火 / 氷と同規模へ到達している。
    for (const jid of ['flame_witch', 'frost_mage']) {
      const j = (jobsData?.jobs || []).find((x) => x.id === jid);
      if (!j) continue;
      if ((j.activeSkillPool || []).length !== 30 || (j.evolutionPool || []).length !== 18) {
        err(`M8-E: ${jid} のカタログ規模が変わっている`);
      }
      for (const id of [...E_ACT, ...E_EVO]) {
        if ((j.activeSkillPool || []).includes(id) || (j.evolutionPool || []).includes(id)) err(`M8-E: ${jid} へ ${id} が混入している`);
      }
    }

    // 2. 新 active の data 完全性。
    for (const id of E_ACT) {
      const s2 = SK(id);
      if (!s2) { err(`M8-E: skills.json に ${id} が無い`); continue; }
      if (s2.element !== 'physical') err(`M8-E: ${id} の element が physical でない`);
      if ((s2.jobs || []).join(',') !== 'warrior') err(`M8-E: ${id} の jobs が ["warrior"] でない`);
      if (s2.isCommon !== false) err(`M8-E: ${id} の isCommon が false でない`);
      if (s2.maxLevel !== 8 || (s2.levels || []).length !== 8) err(`M8-E: ${id} が Lv1–8 でない`);
      if (s2.echoPolicy !== 'forbidden' || s2.clonePolicy !== 'forbidden') err(`M8-E: ${id} の echo/clonePolicy が forbidden でない`);
      if (s2.canTriggerEcho !== false || s2.canBeCopiedByClone !== false) err(`M8-E: ${id} の canTriggerEcho/canBeCopiedByClone が false でない`);
      if (s2.castMode !== 'cooldown') err(`M8-E: ${id} の castMode が cooldown でない`);
      if (s2.lv80ProjectileTarget !== false) err(`M8-E: ${id} を Lv80 対象にしてはいけない`);
      if (!(typeof s2.meleeRange === 'number' && s2.meleeRange > 0)) err(`M8-E: ${id} の meleeRange が正の数でない`);
      if (!(s2.damageTags || []).includes('melee')) err(`M8-E: ${id} の damageTags に melee が無い（物理近接）`);
      if (!(s2.tags || []).includes('physical')) err(`M8-E: ${id} の tags に physical が無い`);
      let cdOk = true;
      for (let i = 1; i < (s2.levels || []).length; i++) if (s2.levels[i].cooldown > s2.levels[i - 1].cooldown) cdOk = false;
      if (!cdOk) err(`M8-E: ${id} の cooldown が Lv で増えている`);
      const a = s2.levels[0], b = s2.levels[7];
      for (const k of Object.keys(a)) {
        const v = b[k];
        if (typeof v === 'number' && (!Number.isFinite(v) || v < 0)) err(`M8-E: ${id}.levels[8].${k} が不正 (${v})`);
      }
      const grew = Object.keys(a).filter((k) => k !== 'level' && k !== 'cooldown' && typeof a[k] === 'number' && b[k] > a[k]);
      if (grew.length < 2) err(`M8-E: ${id} の Lv1 → Lv8 で伸びる数値が 2 つ未満`);
      if (!Array.isArray(s2.evolutionBranches) || s2.evolutionBranches.length !== 1) err(`M8-E: ${id} の evolutionBranches が 1 件でない`);
    }
    // 直線（貫穿突き）の射程が balance の上限内＝画面端まで届かない。
    {
      const L = SK('piercing_lunge');
      const cfgLine = (balance?.warrior || {}).line || {};
      if (L && L.levels[7].lineLength > (cfgLine.maxLineLength || Infinity)) err('M8-E: piercing_lunge Lv8 の lineLength が balance の上限を超えている');
      if (L && L.levels[7].width > (cfgLine.maxWidth || Infinity)) err('M8-E: piercing_lunge Lv8 の width が balance の上限を超えている');
      if (L && L.levels[7].lineLength >= 600) err('M8-E: piercing_lunge の射程が長すぎる（遠距離化している）');
    }

    // 3. 新 evolution の data 完全性。
    for (const id of E_EVO) {
      const e = EV(id);
      if (!e) { err(`M8-E: skill-evolutions.json に ${id} が無い`); continue; }
      if (!E_ACT.includes(e.baseSkillId)) err(`M8-E: ${id} の基礎 ${e.baseSkillId} が最終Wave の active でない`);
      if ((e.requiredSkills || []).length !== 1) err(`M8-E: ${id} の補助が 1 件でない`);
      if (e.replacementSkillId !== id) err(`M8-E: ${id} の replacementSkillId が自身でない`);
      if (e.element !== 'physical') err(`M8-E: ${id} の element が physical でない`);
      if (e.echoPolicy !== 'forbidden' || e.clonePolicy !== 'forbidden') err(`M8-E: ${id} の echo/clonePolicy が forbidden でない`);
      if (e.lv80ProjectileTarget !== false) err(`M8-E: ${id} を Lv80 対象にしてはいけない`);
      if (!e.safetyCaps || Object.keys(e.safetyCaps).length === 0) err(`M8-E: ${id} に safetyCaps が無い`);
      for (const [k, v] of Object.entries(e.safetyCaps || {})) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) err(`M8-E: ${id}.safetyCaps.${k} が不正 (${v})`);
      }
      // active 補助は置換しない（別スキルとして併存し、CD も触らない）。
      const req = (e.requiredSkills || [])[0];
      if (req && (warriorJob.activeSkillPool || []).includes(req.skill)) {
        if (e.replacementSkillId === req.skill) err(`M8-E: ${id} が補助 active ${req.skill} を置換している`);
        if (!(req.level > 0)) err(`M8-E: ${id} の active 補助に必要 Lv が明示されていない`);
      }
    }

    // 4. Job Lv80 対象はちょうど 6 種のまま（3 ジョブとも）。
    for (const jid of ['warrior', 'flame_witch', 'frost_mage']) {
      const j = (jobsData?.jobs || []).find((x) => x.id === jid);
      const n = (j?.activeSkillPool || []).filter((id) => (SK(id) || {}).lv80ProjectileTarget === true).length;
      if (n !== 6) err(`M8-E: ${jid} の Job Lv80 対象が 6 種でない（${n}）`);
    }

    // 5. balance.warrior の最終Wave ブロック。
    const W = balance?.warrior || {};
    for (const k of ['line', 'duel', 'trance', 'deflection', 'march']) {
      if (!W[k] || typeof W[k] !== 'object') err(`M8-E: balance.warrior.${k} が無い`);
    }
    const pos = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
    if (W.line) {
      for (const k of ['maxLineLength', 'maxWidth', 'maxTargets', 'maxHitsPerTargetPerCast', 'maxStepInDistance']) {
        if (!pos(W.line[k])) err(`M8-E: line.${k} が正の有限数でない`);
      }
      if (!(W.line.toughSingleTargetRatio >= 0 && W.line.toughSingleTargetRatio <= 1)) err('M8-E: line.toughSingleTargetRatio が 0..1 でない');
      if (W.line.maxLineLength > 400) err('M8-E: line.maxLineLength が長すぎる（遠距離化の恐れ）');
    }
    if (W.duel) {
      if (W.duel.maxTargets !== 1) err(`M8-E: duel.maxTargets は 1（決闘対象は同時 1 体・実際 ${W.duel.maxTargets}）`);
      for (const k of ['maxDurationMs', 'maxMeleeDamageBonus', 'maxPoiseDamageBonus', 'maxFuryGainBonus', 'maxExtensionMs', 'extensionPerBreakMs']) {
        if (!pos(W.duel[k])) err(`M8-E: duel.${k} が正の有限数でない`);
      }
      if (!(W.duel.maxRetargetsPerCast >= 0 && W.duel.maxRetargetsPerCast <= 2)) err('M8-E: duel.maxRetargetsPerCast は 0..2');
      for (const k of ['bossPriority', 'elitePriority', 'normalPriority']) {
        if (!(typeof W.duel[k] === 'number' && W.duel[k] >= 0)) err(`M8-E: duel.${k} が非負数でない`);
      }
      if (!(W.duel.bossPriority > W.duel.elitePriority && W.duel.elitePriority > W.duel.normalPriority)) {
        err('M8-E: duel の優先度が ボス > エリート > 通常 になっていない');
      }
    }
    if (W.trance) {
      if (W.trance.maxStances !== 1) err(`M8-E: trance.maxStances は 1（構えは同時 1 つ・実際 ${W.trance.maxStances}）`);
      for (const k of ['maxDurationMs', 'maxMeleeDamageBonus', 'maxAttackSpeedBonus', 'maxComboGraceBonus', 'maxFuryGainBonus', 'maxMitigationPenalty', 'combinedOffenseCap', 'maxKillHealBonus']) {
        if (!pos(W.trance[k])) err(`M8-E: trance.${k} が正の有限数でない`);
      }
      if (!(W.trance.minMitigationAfterPenalty >= 0)) err('M8-E: trance.minMitigationAfterPenalty が非負でない');
      if (W.trance.maxMitigationPenalty >= 0.5) err('M8-E: trance.maxMitigationPenalty が大きすぎる（即死職化の恐れ）');
    }
    if (W.deflection) {
      for (const k of ['maxWindowMs', 'maxDeflectionsPerWindow', 'maxDeflectRadius', 'maxReflectedDamage', 'maxReflectedSpeed', 'maxReflectLifeMs', 'counterPriority']) {
        if (!pos(W.deflection[k])) err(`M8-E: deflection.${k} が正の有限数でない`);
      }
      if (!(W.deflection.maxReflectGeneration >= 1)) err('M8-E: deflection.maxReflectGeneration が 1 以上でない');
      if (W.deflection.maxReflectGeneration > 1) err('M8-E: deflection.maxReflectGeneration は 1（反射弾から再反射しない）');
      const allow = W.deflection.allowedKinds || [], deny = W.deflection.deniedKinds || [];
      if (!Array.isArray(allow) || allow.length === 0) err('M8-E: deflection.allowedKinds が空（弾ける弾を明示する）');
      if (!Array.isArray(deny) || deny.length === 0) err('M8-E: deflection.deniedKinds が空（弾けない弾を明示する）');
      for (const k of ['beam', 'telegraph']) if (!deny.includes(k)) err(`M8-E: deflection.deniedKinds に ${k} が無い`);
      for (const k of allow) if (deny.includes(k)) err(`M8-E: deflection の allow / deny が矛盾している（${k}）`);
    }
    if (W.march) {
      for (const k of ['maxStomps', 'maxMarchMs', 'maxStepDistance', 'maxRadius']) {
        if (!pos(W.march[k])) err(`M8-E: march.${k} が正の有限数でない`);
      }
      if (!(W.march.maxMitigation >= 0 && W.march.maxMitigation < 1)) err('M8-E: march.maxMitigation が 0 以上 1 未満でない');
    }

    // 6. data の宣言値が balance の上限を超えていない。
    const lv8 = (id) => ((SK(id) || {}).levels || [])[7] || {};
    if (W.trance) {
      const t = lv8('battle_trance');
      if (t.duration > W.trance.maxDurationMs) err('M8-E: battle_trance Lv8 の duration が上限を超えている');
      if (t.meleeDamageBonus > W.trance.maxMeleeDamageBonus) err('M8-E: battle_trance Lv8 の meleeDamageBonus が上限を超えている');
      if (t.mitigationPenalty > W.trance.maxMitigationPenalty) err('M8-E: battle_trance Lv8 の mitigationPenalty が上限を超えている');
    }
    if (W.duel) {
      const dd = lv8('duel_challenge');
      if (dd.duration > W.duel.maxDurationMs) err('M8-E: duel_challenge Lv8 の duration が上限を超えている');
      if (dd.meleeDamageBonus > W.duel.maxMeleeDamageBonus) err('M8-E: duel_challenge Lv8 の meleeDamageBonus が上限を超えている');
    }
    if (W.deflection) {
      const wd = lv8('weapon_deflection');
      if (wd.windowDuration > W.deflection.maxWindowMs) err('M8-E: weapon_deflection Lv8 の windowDuration が上限を超えている');
      if (wd.maxDeflections > W.deflection.maxDeflectionsPerWindow) err('M8-E: weapon_deflection Lv8 の maxDeflections が上限を超えている');
      if (wd.reflectedDamage > W.deflection.maxReflectedDamage) err('M8-E: weapon_deflection Lv8 の reflectedDamage が上限を超えている');
    }
    if (W.march) {
      const mm = lv8('earthshaker_march');
      if (mm.stompCount > W.march.maxStomps) err('M8-E: earthshaker_march Lv8 の stompCount が上限を超えている');
      if (mm.radius > W.march.maxRadius) err('M8-E: earthshaker_march Lv8 の radius が上限を超えている');
    }

    // 7. 最終Wave で足した skillCaps。
    const E_CAPS = ['maxLineTargets', 'maxLineThrusts', 'maxDuelTargets', 'maxTranceStances', 'maxMarchStomps',
      'maxDeflectionsPerWindow', 'maxReflectedProjectiles',
      'maxThrustTrails', 'maxDuelMarkers', 'maxTranceAuras', 'maxMarchDustVisuals', 'maxDeflectSparkVisuals'];
    for (const name of E_CAPS) {
      const c = (balance?.skillCaps || {})[name];
      if (!c) { err(`M8-E: balance.skillCaps に ${name} が無い`); continue; }
      for (const q of ['low', 'medium', 'high', 'ultra']) {
        if (!(typeof c[q] === 'number' && Number.isFinite(c[q]) && c[q] > 0)) err(`M8-E: skillCaps.${name}.${q} が正の有限数でない`);
      }
      if (!(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra)) err(`M8-E: skillCaps.${name} が単調非減少でない`);
    }
    // low 品質でも「弾ける数」「決闘」「構え」を 0 にしない（戦闘ロジックが消えない）。
    for (const name of ['maxDeflectionsPerWindow', 'maxDuelTargets', 'maxTranceStances', 'maxLineTargets', 'maxMarchStomps']) {
      const c = (balance?.skillCaps || {})[name];
      if (c && !(c.low >= 1)) err(`M8-E: skillCaps.${name}.low が 1 未満（低品質で効果が消える）`);
    }

    // 8. guidance のしきい値は M8-C.1 / M8-D から下げていない。
    const g = (skillCfg || {}).guidance || {};
    const KEEP = {
      minBattleLevel: 3, readyBaseAcquireWeightMultiplier: 1.3, ownedBaseUpgradeWeightMultiplier: 1.8,
      requiredSupportWeightMultiplier: 1.3, activeSupportWeightMultiplier: 1.6,
    };
    for (const [k, v] of Object.entries(KEEP)) {
      if (g[k] !== v) err(`M8-E: guidance.${k} が ${v} から変わっている（${g[k]}）— しきい値を下げてはいけない`);
    }
    if ((g.pity || {}).threshold !== 3) err('M8-E: guidance.pity.threshold が 3 から変わっている');
    if (!(g.jobs || []).includes('warrior') || (g.jobs || []).length !== 1) err('M8-E: guidance.jobs は ["warrior"] のまま');

    // 9. save_version は加算的（v6 のまま）。
    if (balance?.saveVersion !== 6) err(`M8-E: saveVersion が 6 でない（${balance?.saveVersion}）`);

    // 10. docs の記載。
    try {
      const docsCatalog = readFileSync(join(__dirname, '..', 'docs', 'skill-catalog.md'), 'utf8');
      for (const id of [...E_ACT, ...E_EVO]) {
        if (!docsCatalog.includes(id)) err(`M8-E: docs/skill-catalog.md に ${id} の記載が無い`);
      }
      if (!/\*\*30\*\*/.test(docsCatalog) || !/\*\*18\*\*/.test(docsCatalog)) {
        err('M8-E: docs/skill-catalog.md に最終カタログ規模（30 / 18）の記載が無い');
      }
    } catch (e) { warn(`M8-E: docs の確認に失敗 (${e.message})`); }
  }
}

// ============================================================================
// Milestone 8-F: 戦士 完成監査。新規コンテンツは無く、監査で見つけた不備の修正だけ。
// data 側の不変条件（カタログ規模 / 上限の存在 / 死にフィールド 0 / cap の健全性）を固定する。
// ============================================================================
{
  const W = balance.warrior || {};
  const jobs = (jobsData && jobsData.jobs) || [];
  const skills = (skillsData && skillsData.skills) || [];
  const evolutions = (evoData && evoData.evolutions) || [];
  const passives = (passivesData && passivesData.passives) || [];
  const skillConfig = skillCfg || {};
  const statusEffects = loadJson('status-effects.json') || {};
  const ROOT = join(__dirname, '..');
  const wjob = jobs.find((j) => j.id === 'warrior') || {};
  const wActives = wjob.activeSkillPool || [];
  const wPassives = wjob.passiveSkillPool || [];
  const wEvos = wjob.evolutionPool || [];

  // --- 1. 完成カタログ 30 / 4 / 18 / 合計 52（M8-E から増減なし）---
  if (wActives.length !== 30) err(`M8-F: 戦士 active が 30 件でない（${wActives.length}）`);
  if (wPassives.length !== 4) err(`M8-F: 戦士 passive が 4 件でない（${wPassives.length}）`);
  if (wEvos.length !== 18) err(`M8-F: 戦士 evolution が 18 件でない（${wEvos.length}）`);
  if (wActives.length + wPassives.length + wEvos.length !== 52) err('M8-F: 戦士の合計が 52 件でない');
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = jobs.find((x) => x.id === jid) || {};
    if ((j.activeSkillPool || []).length !== 30) err(`M8-F: ${jid} の active が 30 件でない`);
    if ((j.evolutionPool || []).length !== 18) err(`M8-F: ${jid} の evolution が 18 件でない`);
    if ((j.passiveSkillPool || []).length !== 4) err(`M8-F: ${jid} の passive が 4 件でない`);
  }
  if (skills.length !== 90) err(`M8-F: skills.json が 90 件でない（${skills.length}）`);
  if (evolutions.length !== 54) err(`M8-F: skill-evolutions.json が 54 件でない（${evolutions.length}）`);
  if (passives.length !== 12) err(`M8-F: passives.json が 12 件でない（${passives.length}）`);
  if (jobs.length !== 3) err(`M8-F: jobs.json が 3 ジョブでない（${jobs.length}）`);

  // --- 2. プール分離（3 ジョブとも互いに素）---
  {
    const sets = { flame_witch: 'flame_witch', frost_mage: 'frost_mage', warrior: 'warrior' };
    const pools = {};
    for (const jid of Object.keys(sets)) {
      const j = jobs.find((x) => x.id === jid) || {};
      pools[jid] = new Set([...(j.activeSkillPool || []), ...(j.evolutionPool || []), ...(j.passiveSkillPool || [])]);
    }
    const names = Object.keys(pools);
    for (let a = 0; a < names.length; a++) {
      for (let b = a + 1; b < names.length; b++) {
        const dup = [...pools[names[a]]].filter((id) => pools[names[b]].has(id));
        if (dup.length) err(`M8-F: ${names[a]} と ${names[b]} のプールが重複（${dup.join(',')}）`);
      }
    }
  }

  // --- 3. 表示名の重複 0（3 ジョブ横断）---
  {
    const allNames = [...skills.map((s) => s.name), ...evolutions.map((e) => e.displayName), ...passives.map((p) => p.displayName)];
    const dup = allNames.filter((n, i) => n && allNames.indexOf(n) !== i);
    if (dup.length) err(`M8-F: 表示名が重複している（${[...new Set(dup)].join(',')}）`);
  }

  // --- 4. rarity（戦士 active は common / uncommon / rare の 3 段・legendary 0）---
  {
    const byR = {};
    for (const id of wActives) {
      const s = skills.find((x) => x.id === id) || {};
      byR[s.rarity] = (byR[s.rarity] || 0) + 1;
    }
    for (const r of ['common', 'uncommon', 'rare']) {
      if (!(byR[r] > 0)) err(`M8-F: 戦士 active に ${r} が 0 件`);
    }
    if (byR.legendary) err(`M8-F: 戦士 active に legendary がある（進化がその役を担う設計・${byR.legendary} 件）`);
    const rw = skillConfig.rarityWeights || {};
    if (!(rw.common > rw.uncommon && rw.uncommon > rw.rare && rw.rare > rw.legendary)) {
      err('M8-F: rarityWeights の階層が崩れている');
    }
  }

  // --- 5. 進化の到達可能性（base Lv8 / 補助 Lv ≤ 最大 / 1 base に 1 進化）---
  {
    const byBase = {};
    for (const id of wEvos) {
      const e = evolutions.find((x) => x.id === id) || {};
      if (!wActives.includes(e.baseSkillId)) err(`M8-F: ${id} の base ${e.baseSkillId} が戦士 active プールに無い`);
      if (e.replacementSkillId !== id) err(`M8-F: ${id} の replacementSkillId が自身でない`);
      if (e.lv80ProjectileTarget !== false) err(`M8-F: ${id} が Lv80 対象になっている`);
      byBase[e.baseSkillId] = (byBase[e.baseSkillId] || 0) + 1;
      const reqs = e.requiredSkills || [];
      if (reqs.length !== 1) err(`M8-F: ${id} の補助が 1 件でない（${reqs.length}）`);
      for (const r of reqs) {
        const isActive = wActives.includes(r.skill);
        const isPassive = wPassives.includes(r.skill);
        if (!isActive && !isPassive) { err(`M8-F: ${id} の補助 ${r.skill} が戦士プールに無い`); continue; }
        const max = isActive
          ? ((skills.find((x) => x.id === r.skill) || {}).maxLevel || 8)
          : ((passives.find((x) => x.id === r.skill) || {}).maxLevel || 4);
        if (!(r.level >= 1 && r.level <= max)) err(`M8-F: ${id} の補助 ${r.skill} の必要 Lv ${r.level} が到達不能（最大 ${max}）`);
      }
    }
    for (const [b, n] of Object.entries(byBase)) if (n > 1) err(`M8-F: base ${b} に進化が ${n} 件ぶら下がっている`);
    if (Object.keys(byBase).length !== 18) err(`M8-F: 進化を持つ base が 18 種でない（${Object.keys(byBase).length}）`);
  }

  // --- 6. active 補助の進化（枠を 2 つ使うぶん必要 Lv が data で明示されている）---
  {
    const activeSupport = wEvos.filter((id) => {
      const e = evolutions.find((x) => x.id === id) || {};
      return (e.requiredSkills || []).some((r) => wActives.includes(r.skill));
    });
    if (activeSupport.length !== 3) err(`M8-F: active 補助の進化が 3 件でない（${activeSupport.length}）`);
    for (const id of activeSupport) {
      const e = evolutions.find((x) => x.id === id) || {};
      for (const r of e.requiredSkills || []) {
        if (wActives.includes(r.skill) && !(r.level >= 1)) err(`M8-F: ${id} の active 補助 ${r.skill} の必要 Lv が data に無い`);
      }
    }
  }

  // --- 7. Job Lv80 はちょうど 6 種・進化 0 種 ---
  {
    const lv80 = wActives.filter((id) => (skills.find((x) => x.id === id) || {}).lv80ProjectileTarget === true);
    if (lv80.length !== 6) err(`M8-F: 戦士の Lv80 対象が 6 種でない（${lv80.length}）`);
    const evoLv80 = wEvos.filter((id) => (evolutions.find((x) => x.id === id) || {}).lv80ProjectileTarget === true);
    if (evoLv80.length) err(`M8-F: 進化が Lv80 対象になっている（${evoLv80.join(',')}）`);
    for (const jid of ['flame_witch', 'frost_mage']) {
      const j = jobs.find((x) => x.id === jid) || {};
      const n = (j.activeSkillPool || []).filter((id) => (skills.find((x) => x.id === id) || {}).lv80ProjectileTarget === true).length;
      if (n !== 6) err(`M8-F: ${jid} の Lv80 対象が 6 種でない（${n}）`);
    }
  }

  // --- 8. WarriorCombatSystem が読む上限ブロックがすべて data にある ---
  {
    const NEED = {
      fury: ['max', 'maxGainPerCast', 'maxGainPerSecond', 'releaseGainMult'],
      furyRelease: ['durationMs', 'meleeDamageMult', 'attackSpeedMult', 'damageReduction'],
      combo: ['thresholds'],
      mitigation: ['maxTotalReduction', 'engagedRadius'],
      killHeal: ['maxHpPercent', 'perSecondCapPercent', 'eliteMult', 'bossMult'],
      unyielding: ['hpThreshold', 'durationMs', 'cooldownMs', 'minRunTimeMs'],
      poise: ['elite', 'boss'],
      execute: ['allowElite', 'allowBoss', 'maxExecutesPerSecond'],
      counter: ['maxPerDamageEvent', 'globalCooldownMs', 'maxCountersPerWindow', 'maxWindowMs'],
      launch: ['maxAirborneMs', 'immuneMs', 'allowElite', 'allowBoss'],
      frontalGuard: ['requireDirection', 'maxFrontalMitigation', 'sideMultiplier', 'backMultiplier'],
      grab: ['allowElite', 'allowBoss', 'maxGrabPerCast', 'maxThrowMs'],
      rally: ['maxFields', 'maxDurationMs', 'maxRadius', 'maxComboGrace', 'maxMitigation'],
      lowHp: ['maxMissingHpMultiplier'],
      line: ['maxLineLength', 'maxWidth', 'maxTargets', 'maxStepInDistance', 'toughSingleTargetRatio'],
      duel: ['maxTargets', 'maxDurationMs', 'maxMeleeDamageBonus', 'bossPriority', 'elitePriority', 'normalPriority'],
      trance: ['maxStances', 'maxDurationMs', 'combinedOffenseCap', 'maxMitigationPenalty', 'minMitigationAfterPenalty'],
      deflection: ['maxWindowMs', 'maxDeflectionsPerWindow', 'maxReflectGeneration', 'allowedKinds', 'deniedKinds'],
      march: ['maxStomps', 'maxMarchMs', 'maxStepDistance', 'worldMargin'],
    };
    for (const [block, keys] of Object.entries(NEED)) {
      if (!W[block]) { err(`M8-F: balance.warrior.${block} が無い`); continue; }
      for (const k of keys) {
        if (W[block][k] === undefined) err(`M8-F: balance.warrior.${block}.${k} が無い`);
      }
    }
    // 上限そのものの健全性。
    if (!(W.mitigation.maxTotalReduction > 0 && W.mitigation.maxTotalReduction < 1)) err('M8-F: 合計軽減の上限が (0,1) でない');
    if (!(W.trance.minMitigationAfterPenalty >= 0)) err('M8-F: 構えの軽減下限が負');
    if (!(W.trance.maxMeleeDamageBonus <= W.trance.combinedOffenseCap)) err('M8-F: 構えの単体上限が合成上限を超えている');
    if (W.duel.maxTargets !== 1) err('M8-F: 決闘の同時対象が 1 でない');
    if (W.trance.maxStances !== 1) err('M8-F: 構えの同時本数が 1 でない');
    if (W.rally.maxFields !== 1) err('M8-F: 陣の同時本数が 1 でない');
    if (W.deflection.maxReflectGeneration !== 1) err('M8-F: 反射弾の世代上限が 1 でない');
    if (!(W.counter.maxCountersPerWindow >= 1 && W.counter.maxCountersPerWindow <= 20)) err('M8-F: 1 窓の反撃回数の上限が現実的でない');
    if (!(W.rally.maxRadius > 0 && W.rally.maxRadius <= 600)) err('M8-F: 陣の半径上限が現実的でない');
    if (!(W.poise.boss.thresholdMaxMult > 1)) err('M8-F: ボス体勢しきい値の上限倍率が 1 以下');
    const allowed = W.deflection.allowedKinds || [];
    const denied = W.deflection.deniedKinds || [];
    if (!allowed.length || !denied.length) err('M8-F: 弾き返しの allowlist / denylist が空');
    if (allowed.some((k) => denied.includes(k))) err('M8-F: 弾き返しの allowlist と denylist が重なっている');
    for (const k of ['beam', 'telegraph', 'hazard', 'dot', 'ground']) {
      if (!denied.includes(k)) err(`M8-F: 弾き返しの denylist に ${k} が無い`);
    }
  }

  // --- 9. NaN / Infinity / 想定外の負数 ---
  {
    const NEG_OK = new Set(['mitigationPenalty', 'backMultiplier', 'minMitigationAfterPenalty']);
    const scan = (o, path) => {
      for (const [k, v] of Object.entries(o || {})) {
        if (v && typeof v === 'object') scan(v, `${path}.${k}`);
        else if (typeof v === 'number') {
          if (!Number.isFinite(v)) err(`M8-F: ${path}.${k} が有限でない（${v}）`);
          else if (v < 0 && !NEG_OK.has(k)) err(`M8-F: ${path}.${k} が負数（${v}）`);
        }
      }
    };
    for (const id of wActives) scan(skills.find((x) => x.id === id), `skills.${id}`);
    for (const id of wEvos) scan(evolutions.find((x) => x.id === id), `evolutions.${id}`);
    for (const id of wPassives) scan(passives.find((x) => x.id === id), `passives.${id}`);
    scan(W, 'balance.warrior');
  }

  // --- 10. skillCaps の健全性（4 段階・正数・単調非減少・余分なキー無し）---
  {
    const caps = balance.skillCaps || {};
    const Q = ['low', 'medium', 'high', 'ultra'];
    for (const [name, c] of Object.entries(caps)) {
      for (const q of Q) {
        if (!(typeof c[q] === 'number' && Number.isFinite(c[q]) && c[q] > 0)) err(`M8-F: skillCaps.${name}.${q} が正の有限数でない（${c[q]}）`);
      }
      if (!(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra)) err(`M8-F: skillCaps.${name} が単調非減少でない`);
      for (const k of Object.keys(c)) if (!Q.includes(k)) err(`M8-F: skillCaps.${name} に余分なキー ${k} がある`);
    }
  }

  // --- 11. 進化の safetyCaps が非負・空でない ---
  for (const id of wEvos) {
    const e = evolutions.find((x) => x.id === id) || {};
    const caps = e.safetyCaps || {};
    if (!Object.keys(caps).length) err(`M8-F: ${id} に safetyCaps が無い`);
    for (const [k, v] of Object.entries(caps)) {
      if (!(typeof v === 'number' && Number.isFinite(v) && v >= 0)) err(`M8-F: ${id}.safetyCaps.${k} が非負の有限数でない（${v}）`);
    }
  }

  // --- 12. passive4 の modifier が健全（死に modifier 0）---
  for (const id of wPassives) {
    const p = passives.find((x) => x.id === id) || {};
    const mods = p.modifiers || [];
    if (!mods.length) err(`M8-F: passive ${id} に modifiers が無い`);
    for (const m of mods) {
      if (!m.key) err(`M8-F: passive ${id} の modifier に key が無い`);
      if (!['addMult', 'subMult'].includes(m.op)) err(`M8-F: passive ${id}.${m.key} の op が未知（${m.op}）`);
      if (!(typeof m.perLevel === 'number' && Number.isFinite(m.perLevel) && m.perLevel > 0)) {
        err(`M8-F: passive ${id}.${m.key} の perLevel が正の有限数でない（${m.perLevel}）`);
      }
    }
    // 4 passive が進化の補助として使われている。
    const used = wEvos.some((eid) => ((evolutions.find((x) => x.id === eid) || {}).requiredSkills || []).some((r) => r.skill === id));
    if (!used) err(`M8-F: passive ${id} が 1 つの進化の補助にもなっていない`);
  }

  // --- 13. guidance の値が M8-E から変わっていない ---
  {
    const g = skillConfig.guidance || {};
    const EXPECT = {
      ownedBaseUpgradeWeightMultiplier: 1.8, nearMaxRemainingLevels: 3, baseNearMaxBonusMultiplier: 1.7,
      supportReadyBaseMultiplier: 1.5, requiredSupportWeightMultiplier: 1.3, nearRequiredRemainingLevels: 1,
      supportNearRequiredMultiplier: 1.2, activeSupportWeightMultiplier: 1.6,
      highRequirementSupportLevel: 6, highRequirementSupportMultiplier: 1.5,
    };
    for (const [k, v] of Object.entries(EXPECT)) {
      if (g[k] !== v) err(`M8-F: guidance.${k} が ${v} でない（${g[k]}）— M8-F では guidance を変更しない`);
    }
    if (!(Array.isArray(g.jobs) && g.jobs.length === 1 && g.jobs[0] === 'warrior')) err('M8-F: guidance が戦士専用でない');
  }

  // --- 14. save_version は v6 のまま ---
  if (balance.saveVersion !== 6) err(`M8-F: saveVersion が 6 でない（${balance.saveVersion}）`);

  // --- 15. 共通状態異常 5 種のまま（M8-F は formal status を作らない）---
  {
    const ids = (statusEffects.statusEffects || []).map((x) => x.id);
    if (ids.length !== 5) err(`M8-F: 共通状態異常が 5 種でない（${ids.length}）`);
  }

  // --- 16. docs の件数一致 ---
  {
    const docs = [
      ['docs/skill-catalog.md', ['30', '18']],
      ['docs/warrior-completion-audit.md', ['30', '18', 'M8-F']],
      ['docs/project-state.md', ['M8-F']],
      ['README.md', ['M8-F']],
      ['TODO.md', ['M8-F']],
    ];
    for (const [rel, needles] of docs) {
      let src = '';
      try { src = readFileSync(join(ROOT, rel), 'utf8'); } catch (e) { void e; err(`M8-F: ${rel} が無い`); continue; }
      for (const n of needles) if (!src.includes(n)) err(`M8-F: ${rel} に「${n}」の記載が無い`);
    }
    // 48 スキルすべてが skill-catalog.md に載っている。
    let cat = '';
    try { cat = readFileSync(join(ROOT, 'docs/skill-catalog.md'), 'utf8'); } catch (e) { void e; }
    for (const id of [...wActives, ...wEvos]) if (cat && !cat.includes(id)) err(`M8-F: docs/skill-catalog.md に ${id} が無い`);
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
