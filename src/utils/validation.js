// ランタイムでのデータ検証（不正な JSON でクラッシュしないための最低限）。

export function isObject(v) {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

export function hasFields(obj, fields) {
  if (!isObject(obj)) return false;
  return fields.every((f) => f in obj);
}

export function asArray(v) {
  return Array.isArray(v) ? v : [];
}

export function safeNumber(v, fallback = 0) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
