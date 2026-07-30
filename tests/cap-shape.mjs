// M9-A: skillCaps の「形」を 1 か所で扱う共通ヘルパー（Node.js 標準機能のみ）。
//
// balance.json の skillCaps は M9-A から 2 つの形を持つ。
//   { value: N }                    … gameplay / safety 上限。**品質に依存しない単一値**。
//   { low, medium, high, ultra }    … visual 上限のみ。品質で減らしてよい。
//
// 単一値の形そのものが「品質で戦闘結果が変わらない」ことを構造的に保証する
// （quality を見る余地が無い＝将来の編集で静かに品質依存へ戻せない）。
// 分類の正は balance.json の `skillCapClasses`。

export const TIERS = ['low', 'medium', 'high', 'ultra'];
export const CAP_CLASSES = ['visual', 'gameplay', 'safety'];

// 単一値（gameplay / safety）の形かどうか。
export function isSingleCap(c) { return !!c && typeof c.value === 'number'; }

// 品質別（visual）の形かどうか。
export function isTieredCap(c) { return !!c && !isSingleCap(c) && TIERS.every((t) => typeof c[t] === 'number'); }

// 1 つの cap を品質で解決する（production の DataManager.skillCap と同じ規則）。
export function resolveCap(c, quality = 'high', fallback = 9999) {
  if (!c) return fallback;
  if (isSingleCap(c)) return c.value;
  const v = c[quality];
  return typeof v === 'number' ? v : (typeof c.high === 'number' ? c.high : fallback);
}

// 4 段階へ展開した見え方（単一値なら 4 つとも同じ値）。単調性の検査などに使う。
export function capTiers(c) {
  const out = {};
  for (const t of TIERS) out[t] = resolveCap(c, t, NaN);
  return out;
}

// cap 名 → 分類。未登録は null。
export function classOf(balance, name) {
  const m = (balance && balance.skillCapClasses) || {};
  return m[name] || null;
}

// 分類ごとの cap 名一覧。
export function capNamesByClass(balance, cls) {
  const caps = (balance && balance.skillCaps) || {};
  const m = (balance && balance.skillCapClasses) || {};
  return Object.keys(caps).filter((n) => m[n] === cls);
}

// balance 全体を「4 段階の見え方」へ展開したビューを返す。
// M9-A より前に書かれた検査（単調・正）をそのまま通すための互換ビューで、
// 生の形と分類の検査には使わない（`isSingleCap` / `classOf` を使う）。
export function expandCapsInBalance(balance) {
  if (!balance || !balance.skillCaps) return balance;
  const out = {};
  for (const [n, c] of Object.entries(balance.skillCaps)) {
    out[n] = isSingleCap(c) ? { low: c.value, medium: c.value, high: c.value, ultra: c.value } : c;
  }
  return { ...balance, skillCaps: out, rawSkillCaps: balance.skillCaps };
}
