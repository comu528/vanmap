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
  const KNOWN_TYPES = new Set(['fireDamageMult', 'projectileSpeedMult', 'cooldownMult', 'rerollBonus', 'explosion', 'echo', 'evolvedDamageMult', 'rarityWeight', 'projectileCount', 'echoUpgrade']);
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
