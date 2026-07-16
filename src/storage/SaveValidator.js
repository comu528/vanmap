// SaveValidator（Milestone 5-B）: 保存データの共通形式（エンベロープ）の生成・検証、
// 破損検出用チェックサム、JSON インポートの安全検証を担う。
// DOM / 外部ライブラリに依存しない純粋な JS（Node からも import してテストできる）。
//
// checksum は暗号用途ではなく、ファイル破損・不完全書き込みの検出が目的。

export const FORMAT_VERSION = 1;
export const EXPORT_FORMAT_VERSION = 1;

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

// キーを辞書順に固定した安定 JSON 文字列化（チェックサムの決定性のため）。
export function stableStringify(value) {
  const seen = new WeakSet();
  const walk = (v) => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) return null; // 循環は無視（保存データに循環は無い前提の安全策）
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    const out = {};
    for (const k of Object.keys(v).sort()) {
      if (DANGEROUS_KEYS.has(k)) continue;
      out[k] = walk(v[k]);
    }
    return out;
  };
  return JSON.stringify(walk(value));
}

// FNV-1a 32bit（軽量・非暗号）。失敗時は長さベースの代替値へフォールバックし、保存不能にしない。
export function checksum(str) {
  try {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return 'fnv1a:' + (h >>> 0).toString(16).padStart(8, '0');
  } catch (e) {
    return 'len:' + (str ? str.length : 0);
  }
}

// 一意な ID（保存単位・書き込み主体）。crypto があれば使用、無ければ時刻＋乱数で代替。
export function newId(prefix = 'id') {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  } catch (e) { /* fallthrough */ }
  const t = Date.now().toString(36);
  const r = Math.floor(Math.random() * 1e9).toString(36);
  return `${prefix}_${t}${r}`;
}

// ---- エンベロープ（保存データ共通形式） ----
// { formatVersion, saveVersion, gameVersion, saveId, createdAt, updatedAt, writerId, checksum, payload }
export function makeEnvelope({ type, payload, saveVersion, gameVersion, writerId, saveId, createdAt, nowIso }) {
  const now = nowIso || new Date().toISOString();
  const body = payload == null ? {} : payload;
  const env = {
    formatVersion: FORMAT_VERSION,
    type: type || 'unknown',
    saveVersion: saveVersion || 1,
    gameVersion: gameVersion || '0.0.0',
    saveId: saveId || newId('save'),
    createdAt: createdAt || now,
    updatedAt: now,
    writerId: writerId || 'unknown',
    checksum: '',
    payload: body,
  };
  env.checksum = checksum(stableStringify(body));
  return env;
}

// エンベロープの構造・チェックサムを検証する。
export function verifyEnvelope(env) {
  if (!env || typeof env !== 'object' || Array.isArray(env)) return { ok: false, reason: 'not-object' };
  if (typeof env.formatVersion !== 'number') return { ok: false, reason: 'no-formatVersion' };
  if (env.formatVersion > FORMAT_VERSION) return { ok: false, reason: 'future-formatVersion' };
  if (!('payload' in env) || env.payload == null || typeof env.payload !== 'object') return { ok: false, reason: 'no-payload' };
  if (typeof env.checksum !== 'string' || !env.checksum) return { ok: false, reason: 'no-checksum' };
  const expected = checksum(stableStringify(env.payload));
  if (expected !== env.checksum) return { ok: false, reason: 'checksum-mismatch', expected, actual: env.checksum };
  return { ok: true };
}

// 危険キー（__proto__/prototype/constructor）を再帰的に除去したクリーンなコピーを返す。
// 既存オブジェクトへ直接 Object.assign させないための前処理。
export function sanitize(value, depth = 0) {
  if (depth > 64) return null; // 異常な深さは打ち切り
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sanitize(v, depth + 1));
  const out = {};
  for (const k of Object.keys(value)) {
    if (DANGEROUS_KEYS.has(k)) continue;
    out[k] = sanitize(value[k], depth + 1);
  }
  return out;
}

const isIsoDateLike = (s) => typeof s === 'string' && s.length >= 8 && !Number.isNaN(Date.parse(s));

// 一式インポート用バンドルの検証。refs（既存の難易度/スキル/進化 ID 集合）が与えられれば
// 参照整合も検証する。破壊的な取り込みの前に呼び、errors が空のときのみ移行処理へ渡す。
export function validateImportBundle(bundle, opts = {}) {
  const errors = [];
  const maxBytes = opts.maxBytes || 2 * 1024 * 1024;
  const expectSaveVersion = opts.saveVersion || null;
  const refs = opts.refs || null;
  const rawBytes = typeof opts.rawBytes === 'number' ? opts.rawBytes : null;

  if (rawBytes != null && rawBytes > maxBytes) {
    errors.push(`ファイルが大きすぎます (${rawBytes} > ${maxBytes} bytes)`);
    return { ok: false, errors };
  }
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) {
    errors.push('JSON がオブジェクトではありません');
    return { ok: false, errors };
  }
  if (hasDangerousKey(bundle)) errors.push('危険なキー(__proto__/prototype/constructor)が含まれています');
  if (typeof bundle.exportFormatVersion !== 'number') errors.push('exportFormatVersion がありません');
  else if (bundle.exportFormatVersion > EXPORT_FORMAT_VERSION) errors.push(`未対応の exportFormatVersion (${bundle.exportFormatVersion})`);
  if (!('profile' in bundle)) errors.push('profile がありません');

  const prof = bundle.profile;
  if (prof && typeof prof === 'object' && !Array.isArray(prof)) {
    if (typeof prof.save_version !== 'number' || prof.save_version < 1) errors.push('profile.save_version が不正');
    else if (expectSaveVersion && prof.save_version > expectSaveVersion) errors.push(`profile.save_version が新しすぎます (${prof.save_version} > ${expectSaveVersion})`);
    for (const key of ['embers', 'lifetimeEmbers', 'soulflame', 'lifetimeSoulflame', 'reincarnationCount']) {
      if (key in prof && (typeof prof[key] !== 'number' || !Number.isFinite(prof[key]) || prof[key] < 0)) {
        errors.push(`profile.${key} が不正（負または非数）`);
      }
    }
    validateLevelMap(prof.permanentUpgrades, 'permanentUpgrades', errors);
    validateLevelMap(prof.reincarnationUpgrades, 'reincarnationUpgrades', errors);
    if ('unlockedDifficulties' in prof && !Array.isArray(prof.unlockedDifficulties)) errors.push('profile.unlockedDifficulties が配列でない');
    if (prof.created_at != null && !isIsoDateLike(prof.created_at)) errors.push('profile.created_at の日時が不正');
    if (prof.updated_at != null && !isIsoDateLike(prof.updated_at)) errors.push('profile.updated_at の日時が不正');
    if (refs) {
      if (Array.isArray(prof.unlockedDifficulties)) {
        for (const d of prof.unlockedDifficulties) if (!refs.difficultyIds.has(d)) errors.push(`存在しない難易度 ${d}`);
      }
      for (const id of Object.keys(prof.permanentUpgrades || {})) if (!DANGEROUS_KEYS.has(id) && refs.upgradeIds && !refs.upgradeIds.has(id)) errors.push(`存在しない恒久強化 ${id}`);
      for (const id of Object.keys(prof.reincarnationUpgrades || {})) if (!DANGEROUS_KEYS.has(id) && refs.reincNodeIds && !refs.reincNodeIds.has(id)) errors.push(`存在しない魂炎強化 ${id}`);
      for (const id of Object.keys(prof.skillMastery || {})) if (!DANGEROUS_KEYS.has(id) && refs.skillIds && !refs.skillIds.has(id)) errors.push(`存在しないスキル ${id}`);
      for (const id of Object.keys(prof.evolutionStatistics || {})) if (!DANGEROUS_KEYS.has(id) && refs.evolutionIds && !refs.evolutionIds.has(id)) errors.push(`存在しない進化 ${id}`);
    }
  } else if ('profile' in bundle) {
    errors.push('profile がオブジェクトではありません');
  }

  return { ok: errors.length === 0, errors };
}

function validateLevelMap(map, name, errors) {
  if (map == null) return;
  if (typeof map !== 'object' || Array.isArray(map)) { errors.push(`profile.${name} がオブジェクトでない`); return; }
  for (const [k, v] of Object.entries(map)) {
    if (DANGEROUS_KEYS.has(k)) { errors.push(`profile.${name} に危険キー ${k}`); continue; }
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || Math.trunc(v) !== v) errors.push(`profile.${name}.${k} の強化レベルが不正 (${v})`);
  }
}

// 再帰的に危険キーの存在を検出する（プロトタイプ汚染の検出）。
export function hasDangerousKey(value, depth = 0) {
  if (depth > 64 || value === null || typeof value !== 'object') return false;
  if (!Array.isArray(value)) {
    for (const k of Object.keys(value)) {
      if (DANGEROUS_KEYS.has(k)) return true;
    }
  }
  const vals = Array.isArray(value) ? value : Object.values(value);
  for (const v of vals) if (hasDangerousKey(v, depth + 1)) return true;
  return false;
}
