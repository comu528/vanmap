// StorageAdapter（Milestone 5-B）: 保存先を抽象化する共通インターフェース。
// SaveCoordinator は具体的な保存先（ブラウザ/フォルダ/メモリ）を意識せず、この API 経由で読み書きする。
// すべて「エンベロープ（SaveValidator.makeEnvelope の形）」を単位に扱う。
//
// type は 'profile' | 'activeRun' | 'settings'。read/write は破損検出のため
// エンベロープ全体（checksum 付き）を保存・取得する。
//
// 共通 API:
//   isAvailable(): boolean
//   async read(type): envelope | null
//   async write(type, envelope): { ok, error? }
//   async remove(type): { ok }
//   async listBackups(type?): [{ id, type, kind, createdAt, size, summary }]
//   async createBackup(type, envelope, kind): { ok, id }
//   async restoreBackup(id): envelope | null
//   async pruneBackups(limits): { removed }
//   async getMetadata(): object（manifest 相当）
//   async testConnection(): { ok, state }

export const SAVE_TYPES = ['profile', 'activeRun', 'settings'];
export const FILE_NAMES = { profile: 'profile.json', activeRun: 'active_run.json', settings: 'settings.json' };

// エンベロープからバックアップ一覧/UI 表示用の要約を取り出す（純粋関数）。
export function summarize(env) {
  const p = (env && env.payload) || {};
  const st = (p.statistics && typeof p.statistics === 'object') ? p.statistics : {};
  // M6-C: 選択ジョブと火の魔女のジョブレベル/累計Job XP（totalXp が正・レベルは表示時に算出）。
  const jobId = (typeof p.selectedJobId === 'string' && p.selectedJobId) || 'flame_witch';
  const jp = (p.jobProgress && typeof p.jobProgress === 'object' && p.jobProgress[jobId]) || null;
  const jobTotalXp = jp && typeof jp.totalXp === 'number' ? jp.totalXp : null;
  return {
    type: env?.type || null,
    saveId: env?.saveId || null,
    writerId: env?.writerId || null,
    gameVersion: env?.gameVersion || null,
    saveVersion: env?.saveVersion || (typeof p.save_version === 'number' ? p.save_version : null),
    updatedAt: env?.updatedAt || p.updated_at || null,
    reincarnationCount: typeof p.reincarnationCount === 'number' ? p.reincarnationCount : null,
    embers: typeof p.embers === 'number' ? p.embers : null,
    soulflame: typeof p.soulflame === 'number' ? p.soulflame : null,
    selectedDifficulty: typeof p.selectedDifficulty === 'number' ? p.selectedDifficulty : null,
    selectedJobId: jobId,
    jobTotalXp,
    jobLevel: jobLevelFromTotalXp(jobTotalXp),
    hasActiveRun: !!p.inProgress,
    elapsedSec: typeof p.elapsedSec === 'number' ? p.elapsedSec : null,
  };
}

// 保存比較・競合・インポート表示用の軽量なジョブレベル算出（曲線は火の魔女の既定係数 quad=25/lin=75）。
// 表示専用のため DataManager 非依存（比較UIは実データに厳密一致でなくても良い）。levelCap=100 で頭打ち。
export function jobLevelFromTotalXp(totalXp, cap = 100, quad = 25, lin = 75) {
  if (typeof totalXp !== 'number' || !Number.isFinite(totalXp) || totalXp < 0) return null;
  let level = 1;
  for (let L = 2; L <= cap; L++) { if (totalXp >= quad * (L - 1) * (L - 1) + lin * (L - 1)) level = L; else break; }
  return level;
}

export class StorageAdapter {
  get id() { return 'base'; }
  isAvailable() { return false; }
  async read() { throw new Error('not implemented'); }
  async write() { throw new Error('not implemented'); }
  async remove() { throw new Error('not implemented'); }
  async listBackups() { return []; }
  async createBackup() { return { ok: false, error: 'not implemented' }; }
  async restoreBackup() { return null; }
  async pruneBackups() { return { removed: 0 }; }
  async getMetadata() { return {}; }
  async testConnection() { return { ok: this.isAvailable(), state: this.isAvailable() ? 'connected' : 'unavailable' }; }
}
