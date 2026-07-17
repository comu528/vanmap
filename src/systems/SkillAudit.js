// SkillAudit（Milestone 6-E）: active/進化スキルの「残響・分身・Job Lv80発射数・主要タグ」対応状況を
// スキル定義（skills.json / skill-evolutions.json の def）から解決する純粋ロジック。Phaser/DOM 非依存で Node からテスト可能。
//
// 目的:
//   - スキル説明UI（LevelUpScene / デバッグパネル）で「このスキルは残響するのか / 分身が複製するのか / Lv80で弾が増えるのか」を表示する。
//   - 監査テスト（skill-tag-audit / cast-event-audit）が、30 active・18 進化の対応状況を機械的に検証できるようにする。
//
// 依存: CastPolicy.resolveCastMeta（echoPolicy/clonePolicy/canTriggerEcho/canBeCopiedByClone の既定解決）。

import { resolveCastMeta } from './CastPolicy.js';

// 発動区分（castMode）: スキルがどう発動するか。監査で「攻撃 active は主発動イベントを持つ」ことを保証する。
export const CAST_MODES = ['periodic', 'cooldown', 'continuous', 'reactive', 'defensive', 'movement', 'resource'];

// 攻撃を目的とし、主発動イベント（recordCast 等）を持つべき castMode。
export const ATTACK_CAST_MODES = ['periodic', 'cooldown', 'continuous', 'resource'];

// UI に短い記号で出すタグの正規化（データ側の多様なタグ名を代表タグへ寄せる）。
const TAG_MAP = {
  projectile: 'projectile', bolt: 'projectile', shot: 'projectile',
  dot: 'DoT', damageOverTime: 'DoT', burn: 'DoT', ground: 'DoT',
  explosion: 'explosion', blast: 'explosion', burst: 'explosion',
  summon: 'summon', minion: 'summon',
  beam: 'beam', laser: 'beam',
  melee: 'melee', slash: 'melee',
  defensive: 'defensive', barrier: 'defensive',
  reactive: 'reactive', projectileAbsorb: 'reactive',
};
const TAG_ORDER = ['projectile', 'DoT', 'explosion', 'summon', 'beam', 'melee', 'defensive', 'reactive'];

// 代表タグ配列（重複なし・表示順で安定化）。
export function primaryTags(def) {
  const set = new Set();
  for (const t of (def && def.tags) || []) { const m = TAG_MAP[t]; if (m) set.add(m); }
  return TAG_ORDER.filter((t) => set.has(t));
}

// Job Lv80「発射数+1」の対象か（独立した projectile を発射する攻撃のみ true）。
// データの lv80ProjectileTarget を正とする（光線/地雷/墓標/分身/召喚/鎖/陣/亀裂/波/チャージ/共鳴段階/熱量段階は対象外）。
export function appliesLv80ProjectileCount(def) {
  return !!(def && def.lv80ProjectileTarget === true);
}

// 残響対応状況（UI/監査用）。
//   '対応'（standard・主発動が残響カウンタを進める） / '攻撃部分のみ'（custom） / '非対応'（forbidden もしくは主発動が残響対象外）。
export function echoStatus(def) {
  const m = resolveCastMeta(def);
  if (!m.canTriggerEcho || m.echoPolicy === 'forbidden') return '非対応';
  if (m.echoPolicy === 'custom') return '攻撃部分のみ';
  return '対応';
}

// 灰燼分身の複製対応状況（UI/監査用）。
//   '複製可能'（standard） / '攻撃部分のみ複製'（custom） / '複製不可'（forbidden もしくは複製対象外）。
export function cloneStatus(def) {
  const m = resolveCastMeta(def);
  if (!m.canBeCopiedByClone || m.clonePolicy === 'forbidden') return '複製不可';
  if (m.clonePolicy === 'custom') return '攻撃部分のみ複製';
  return '複製可能';
}

// Job Lv80 発射数の対応状況（UI/監査用）。
export function lv80Status(def) { return appliesLv80ProjectileCount(def) ? '発射数+1対象' : '対象外'; }

// 短い記号（640×360 でカードを圧迫しないための1行表示）。例: "残響○ 分身◑ Lv80+ ・弾/爆"
export function castBadge(def) {
  const e = echoStatus(def), c = cloneStatus(def);
  const eSym = e === '対応' ? '○' : (e === '攻撃部分のみ' ? '◑' : '×');
  const cSym = c === '複製可能' ? '○' : (c === '攻撃部分のみ複製' ? '◑' : '×');
  const lv80 = appliesLv80ProjectileCount(def) ? 'Lv80+' : '';
  return { echoSym: eSym, cloneSym: cSym, lv80, tags: primaryTags(def) };
}

// 完全な対応状況（UI詳細パネル / テスト用）。
export function castSummary(def) {
  const m = resolveCastMeta(def);
  return {
    castMode: def && def.castMode ? def.castMode : null,
    mainCastEvent: def && def.mainCastEvent ? def.mainCastEvent : null,
    echo: echoStatus(def), clone: cloneStatus(def), lv80: lv80Status(def),
    echoPolicy: m.echoPolicy, clonePolicy: m.clonePolicy,
    canTriggerEcho: m.canTriggerEcho, canBeCopiedByClone: m.canBeCopiedByClone,
    echoDescription: (def && def.echoDescription) || null,
    cloneDescription: (def && def.cloneDescription) || null,
    tags: primaryTags(def),
  };
}

// castMode が攻撃目的か（主発動イベントを要求すべきか）。
export function isAttackMode(def) {
  return !!(def && ATTACK_CAST_MODES.includes(def.castMode));
}

// スキル説明用の短い1行サマリ（残響/分身/Lv80/主要タグ ＋ 進化先）。M6-F: UI 共通（LevelUpScene / BaseScene / デバッグ）。
// UI ごとに別判定を作らず、この関数と castBadge を共有する。evoDef を渡すと「→進化名」を付す。
export function skillSummaryLine(def, evoDef) {
  if (!def) return '';
  const b = castBadge(def);
  const parts = [`残響${b.echoSym}`, `分身${b.cloneSym}`];
  if (b.lv80) parts.push('Lv80+');
  if (b.tags.length) parts.push('·' + b.tags.slice(0, 3).join('/'));
  if (evoDef) parts.push('→' + (evoDef.displayName || '進化'));
  return parts.join(' ');
}
