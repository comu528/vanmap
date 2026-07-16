// 保存システム（Milestone 5-B）の自動テスト。Node.js 標準機能のみ（外部依存なし）。
// ブラウザ API に依存しない部分（スキーマ移行・チェックサム・検証・キュー・バックアップ・
// 競合検出/解決・複数タブ判定）を MemoryStorageAdapter を用いて検証する。
// 実行: node tests/save-system.mjs

import { migrateProfile, defaultProfile, coerceSettings } from '../src/systems/profileSchema.js';
import {
  makeEnvelope, verifyEnvelope, checksum, stableStringify, sanitize, hasDangerousKey, validateImportBundle,
} from '../src/storage/SaveValidator.js';
import { extractMeta, detectConflict, recommend } from '../src/storage/SaveConflictResolver.js';
import { MemoryStorageAdapter } from '../src/storage/MemoryStorageAdapter.js';
import { SaveCoordinator, computeWriterState } from '../src/storage/SaveCoordinator.js';

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + msg); } }
function section(t) { console.log(t); }

// 決定論的な時刻源。
let clock = 1700000000000;
const nowMs = () => (clock += 1000);
const nowIso = () => new Date(clock).toISOString();

// ===== 1. エンベロープ & チェックサム =====
section('1. エンベロープとチェックサム');
{
  const env = makeEnvelope({ type: 'profile', payload: { a: 1, b: [1, 2], c: { d: 3 } }, saveVersion: 5, gameVersion: '0.5.0', writerId: 'w1', saveId: 's1', nowIso });
  ok(verifyEnvelope(env).ok, 'エンベロープが検証を通る');
  ok(env.checksum.startsWith('fnv1a:'), 'checksum が算出される');
  const tampered = JSON.parse(JSON.stringify(env)); tampered.payload.a = 999;
  ok(!verifyEnvelope(tampered).ok, '改ざんされた payload は検証で弾かれる');
  // キー順に依存しない安定文字列化
  ok(stableStringify({ a: 1, b: 2 }) === stableStringify({ b: 2, a: 1 }), 'stableStringify がキー順に非依存');
  ok(checksum('x') === checksum('x'), 'checksum が決定的');
}

// ===== 2. profile 移行 v1〜v4 → v5 =====
section('2. profile 移行（v1〜v4 → v5）');
{
  const v4 = {
    save_version: 4, game_version: '0.4.0', embers: 123, lifetimeEmbers: 6000,
    permanentUpgrades: { max_hp: 3 }, unlockedDifficulties: [1, 2, 3], highestClearedDifficulty: 3,
    skillMastery: { fireball: { casts: 1, hits: 2, kills: 1, damage: 500, maxLevel: 8, runsUsed: 2, evolutions: 1 } },
    statistics: { totalPlayTime: 100, totalRuns: 3, totalWins: 2, totalDefeats: 1, totalKills: 300, totalBossKills: 2, highestDamage: 900 },
    reincarnationCount: 2, soulflame: 7, lifetimeSoulflame: 20, reincarnationUpgrades: { extra_choice: 1 },
    highestEverDifficulty: 3, currentCycle: { cycleNumber: 2, cycleEmbers: 100, cycleHighestDifficulty: 1, cycleBossKills: 0, cycleStartTime: '2020-01-01T00:00:00.000Z' },
  };
  const m = migrateProfile(v4, 5, '0.5.0');
  ok(m.save_version === 5, 'save_version が 5 になる');
  ok(m.embers === 123 && m.lifetimeEmbers === 6000, '残り火が保持される');
  ok(m.soulflame === 7 && m.lifetimeSoulflame === 20 && m.reincarnationCount === 2, '魂炎/転生回数が保持される');
  ok(m.permanentUpgrades.max_hp === 3 && m.reincarnationUpgrades.extra_choice === 1, '強化レベルが保持される');
  ok(m.skillMastery.fireball.evolutions === 1, '熟練度/進化統計が保持される');
  ok(m.currentCycle.cycleNumber === 2, 'currentCycle が保持される');

  // v1（残り火は旧 currencies.ember）
  const v1 = { save_version: 1, currencies: { ember: 50 }, difficultyUnlocked: [1, 2], stats: { runs: 5, kills: 40 } };
  const m1 = migrateProfile(v1, 5, '0.5.0');
  ok(m1.embers === 50 && m1.unlockedDifficulties.includes(2) && m1.statistics.totalRuns === 5, 'v1 の旧フィールドが移行される');
  // v2/v3 は v4 と同系統（欠落は既定へ）
  const m3 = migrateProfile({ save_version: 3, embers: 10 }, 5, '0.5.0');
  ok(m3.reincarnationCount === 0 && m3.soulflame === 0, 'v3 の未定義な転生系が安全な既定値になる');
}

// ===== 3. インポート検証 =====
section('3. インポート検証（不正データ拒否）');
{
  const good = { exportFormatVersion: 1, profile: defaultProfile(5, '0.5.0'), settings: {}, activeRun: null };
  ok(validateImportBundle(good, { saveVersion: 5 }).ok, '正常なバンドルは通る');

  const neg = { exportFormatVersion: 1, profile: { ...defaultProfile(5, '0.5.0'), embers: -5 } };
  ok(!validateImportBundle(neg).ok, '負の通貨を拒否');

  const badLevel = { exportFormatVersion: 1, profile: { ...defaultProfile(5, '0.5.0'), permanentUpgrades: { max_hp: -1 } } };
  ok(!validateImportBundle(badLevel).ok, '不正な強化レベルを拒否');

  const proto = JSON.parse('{"exportFormatVersion":1,"profile":{"save_version":5,"__proto__":{"x":1}}}');
  ok(hasDangerousKey(proto), '危険キーを検出');
  ok(!validateImportBundle(proto).ok, 'プロトタイプ汚染キーを含むバンドルを拒否');

  const future = { exportFormatVersion: 99, profile: defaultProfile(5, '0.5.0') };
  ok(!validateImportBundle(future).ok, '未対応 exportFormatVersion を拒否');

  const noProfile = { exportFormatVersion: 1 };
  ok(!validateImportBundle(noProfile).ok, 'profile 欠落を拒否');

  const tooBig = { exportFormatVersion: 1, profile: defaultProfile(5, '0.5.0') };
  ok(!validateImportBundle(tooBig, { rawBytes: 10 * 1024 * 1024, maxBytes: 2 * 1024 * 1024 }).ok, '巨大ファイルを拒否');

  const refs = { difficultyIds: new Set([1, 2, 3, 4, 5]), skillIds: new Set(['fireball']), upgradeIds: new Set(['max_hp']), reincNodeIds: new Set(['extra_choice']), evolutionIds: new Set(['infernal_barrage']) };
  const badDiff = { exportFormatVersion: 1, profile: { ...defaultProfile(5, '0.5.0'), unlockedDifficulties: [1, 99] } };
  ok(!validateImportBundle(badDiff, { refs }).ok, '存在しない難易度を拒否（refs あり）');
  const badSkill = { exportFormatVersion: 1, profile: { ...defaultProfile(5, '0.5.0'), skillMastery: { nope: { damage: 1 } } } };
  ok(!validateImportBundle(badSkill, { refs }).ok, '存在しないスキルを拒否（refs あり）');

  // sanitize は危険キー（own プロパティ）を除去する（'in' は継承も見るため hasOwnProperty で確認）。
  const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const cleaned = sanitize(JSON.parse('{"a":1,"__proto__":{"bad":1},"nested":{"constructor":2,"ok":3}}'));
  ok(!hasOwn(cleaned, '__proto__') && cleaned.a === 1 && cleaned.nested.ok === 3 && !hasOwn(cleaned.nested, 'constructor') && ({}).bad === undefined,
    'sanitize が危険キーを除去し他を保持（プロトタイプ非汚染）');
}

// ===== 4. SaveCoordinator: キュー順序・最新のみ保存 =====
section('4. SaveCoordinator（キュー/デバウンス/最新のみ）');
{
  const primary = new MemoryStorageAdapter({ nowIso });
  const coord = new SaveCoordinator({ primary, config: { autosaveDebounceMs: 800, autoBackupMinIntervalSec: 999999 }, meta: { saveVersion: 5, gameVersion: '0.5.0', writerId: 'wA' }, nowMs, nowIso, schedule: () => null });
  coord.notify('profile', { v: 1 });
  coord.notify('profile', { v: 2 }); // 直前を上書き（合体）
  coord.notify('settings', { s: 1 });
  await coord.flushNow();
  const prof = await primary.read('profile');
  ok(prof.payload.v === 2, '同一 type は最新のみ保存（古い保存が新しい保存を上書きしない）');
  ok(primary.writeLog.filter((w) => w.type === 'profile').length === 1, 'coalesce により profile 書き込みは1回');
  const settings = await primary.read('settings');
  ok(settings && settings.payload.s === 1, 'settings も保存される');
}

// ===== 5. バックアップ世代管理 =====
section('5. バックアップ（重要変更で作成・世代管理）');
{
  const primary = new MemoryStorageAdapter({ nowIso });
  const coord = new SaveCoordinator({ primary, config: { maxAutoBackups: 3, maxManualBackups: 2, autoBackupMinIntervalSec: 0 }, meta: { saveVersion: 5, gameVersion: '0.5.0', writerId: 'wB' }, nowMs, nowIso, schedule: () => null });
  // 最初の保存（既存なし→バックアップなし）
  coord.notify('profile', { reincarnationCount: 0 }, { immediate: true, reason: 'reincarnate' });
  await coord.flushNow();
  // 以降 reincarnate 保存のたびに「上書き前の既存」をバックアップ（auto 種別）
  for (let i = 1; i <= 5; i++) { coord.notify('profile', { reincarnationCount: i }, { reason: 'reincarnate' }); await coord.flushNow(); }
  const autos = (await primary.listBackups('profile')).filter((b) => b.kind === 'auto');
  ok(autos.length <= 3, `自動バックアップが maxAuto(3) 以下に剪定される（実際 ${autos.length}）`);
  ok(autos.length > 0, 'バックアップが作成されている');
  // 復元
  const anyId = (await primary.listBackups('profile'))[0].id;
  const restored = await primary.restoreBackup(anyId);
  ok(restored && restored.payload && typeof restored.payload.reincarnationCount === 'number', 'バックアップから復元できる');
}

// ===== 6. フォールバック（primary 失敗 → mirror） =====
section('6. フォールバック（フォルダ書き込み失敗→ブラウザ）');
{
  const primary = new MemoryStorageAdapter({ nowIso }); primary.failWrites = true;
  const mirror = new MemoryStorageAdapter({ nowIso });
  const coord = new SaveCoordinator({ primary, mirror, config: { autoBackupMinIntervalSec: 999999 }, meta: { saveVersion: 5, gameVersion: '0.5.0', writerId: 'wC' }, nowMs, nowIso, schedule: () => null });
  coord.notify('profile', { v: 42 }, { immediate: true });
  const res = await coord.flushNow();
  const mir = await mirror.read('profile');
  ok(mir && mir.payload.v === 42, 'primary 失敗時に mirror へ保存される');
  ok(res.degraded === true, 'degraded 状態になる');
  ok(coord.status.lastResult === 'success', 'フォールバック成功により全体は成功扱い（進行を止めない）');
}

// ===== 7. 競合検出・解決 =====
section('7. 競合検出と推奨');
{
  const pA = { save_version: 5, updated_at: '2024-01-02T00:00:00.000Z', reincarnationCount: 3, lifetimeSoulflame: 100, lifetimeEmbers: 5000, statistics: { totalPlayTime: 1000 }, currentCycle: { cycleNumber: 3 } };
  const pB = { save_version: 5, updated_at: '2024-01-01T00:00:00.000Z', reincarnationCount: 1, lifetimeSoulflame: 10, lifetimeEmbers: 200, statistics: { totalPlayTime: 100 }, currentCycle: { cycleNumber: 1 } };
  const browser = { present: true, meta: extractMeta(pA, null, { saveId: 'A', writerId: 'wA', updatedAt: pA.updated_at }) };
  const folder = { present: true, meta: extractMeta(pB, null, { saveId: 'B', writerId: 'wB', updatedAt: pB.updated_at }) };
  const det = detectConflict(browser, folder);
  ok(det.conflict, '異なる saveId/進行度で競合を検出');
  const rec = recommend(browser, folder);
  ok(rec.recommended === 'browser', '進行度の高い側を推奨（ブラウザ）');

  // active_run と profile の cycleNumber 不一致
  const arBad = { inProgress: true, elapsedSec: 50, cycleNumber: 9 };
  const b2 = { present: true, meta: extractMeta(pA, arBad, { saveId: 'A', updatedAt: pA.updated_at }) };
  ok(detectConflict(b2, folder).reasons.some((r) => r.includes('cycleNumber')), 'cycleNumber 不一致を競合理由に含む');

  // 片方のみ存在 → 競合なし
  ok(!detectConflict({ present: true, meta: browser.meta }, { present: false }).conflict, '片方のみ存在では競合としない');
}

// ===== 8. 複数タブ ライター判定 =====
section('8. 複数タブのライター判定');
{
  ok(computeWriterState(10000, null, 'me').writer, 'ロック無しならライター');
  ok(!computeWriterState(10000, { writerId: 'other', ts: 9000 }, 'me', 15000).writer, '新しい別タブが居れば読み取り専用');
  ok(computeWriterState(100000, { writerId: 'other', ts: 9000 }, 'me', 15000).writer, '古いロックは無効でライターになれる');
  ok(computeWriterState(10000, { writerId: 'me', ts: 9000 }, 'me').writer, '自分のロックならライター');
}

// ===== 9. 設定の安全な取り込み =====
section('9. settings coerce');
{
  const s = coerceSettings({ effectQuality: 'bogus', speed: 3, damageNumbers: 'yes', autoMove: true });
  ok(s.effectQuality === 'high' && s.speed === 1 && s.damageNumbers === true && s.autoMove === true, '不正値は既定へ・正当値は保持');
}

// ===== 結果 =====
console.log('');
if (fail) { console.error(`✗ 保存システムテスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ 保存システムテスト成功: ${pass} 件すべて通過`); process.exit(0); }
