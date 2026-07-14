// 汎用的な数学ユーティリティ。

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function distance(ax, ay, bx, by) {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

export function angleBetween(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}

// 決定論的な疑似乱数（seed から再開できるようにするため）。mulberry32。
export function createRng(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
