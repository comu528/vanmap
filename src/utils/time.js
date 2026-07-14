// 時間フォーマット系ユーティリティ。

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function nowIso() {
  // Date は保存メタ情報にのみ使用する。
  return new Date().toISOString();
}
