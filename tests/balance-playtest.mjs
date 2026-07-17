// Balance Playtest（通常プレイ検証モード）の純ロジックテスト（M6-F）。Node.js 標準機能のみ。
// profile を変更しないこと・常に debugRun 扱いになること・設定の安全化を検証する。
import { defaultPlaytestConfig, coercePlaytestConfig, isDebugRun, resolveOverrides, PROTECTED_PROFILE_FIELDS } from '../src/systems/BalancePlaytest.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const section = (t) => console.log(t);

// ===== 1. 既定値・安全化 =====
section('1. 設定の安全化');
const d = defaultPlaytestConfig();
ok(d.permUpgrades === 'profile' && d.jobMods === 'normal' && d.seed === 1, '既定は通常profile相当');
const c = coercePlaytestConfig({ seed: 12345, difficulty: 9, quality: 'ultra', speed: 3, jobLevel: 250, activeSlots: 7, choices: 4, permUpgrades: 'xxx', soulflame: 'none', mastery: 'none', jobMods: 'off', durationSec: 999 });
ok(c.difficulty === 1, '不正 difficulty(9) は既定1へ');
ok(c.speed === 1, '不正 speed(3) は既定1へ');
ok(c.jobLevel === null, '範囲外 jobLevel(250) は null へ');
ok(c.activeSlots === null, '不正 activeSlots(7) は null へ');
ok(c.choices === 4, '有効 choices(4) は保持');
ok(c.permUpgrades === 'profile', '不正 permUpgrades は profile へ');
ok(c.soulflame === 'none' && c.mastery === 'none' && c.jobMods === 'off', '有効な無効化指定は保持');
ok(c.durationSec === null, '不正 durationSec は null へ');
ok(c.quality === 'ultra', '有効 quality は保持');

// ===== 2. 常に debugRun =====
section('2. debugRun 判定');
ok(isDebugRun(d, false) === true, 'Balance Playtest は補正なしでも debugRun');
ok(isDebugRun(d, true) === true, 'F5〜F7 使用時も debugRun');

// ===== 3. profile を変更しない =====
section('3. profile 非変更');
const profile = {
  permanentUpgrades: { max_hp: 3, move_speed: 2 }, soulflame: 500, embers: 1000,
  highestClearedDifficulty: 4, jobProgress: { flame_witch: { totalXp: 5000 } },
  skillMastery: { fireball: { damage: 100 } }, statistics: { totalRuns: 10 },
};
const snapshot = JSON.stringify(profile);
const ovNone = resolveOverrides({ permUpgrades: 'none', soulflame: 'none', mastery: 'none', jobMods: 'off' }, profile);
ok(JSON.stringify(profile) === snapshot, 'resolveOverrides が profile を変更しない(none)');
ok(Object.keys(ovNone.permUpgrades).length === 0, 'permUpgrades none で空');
ok(ovNone.disableSoulflame && ovNone.disableMastery && ovNone.disableJobMods, '無効化フラグが立つ');
ok(ovNone.debugRun === true && ovNone.readOnlyProfile === true, 'debugRun/readOnlyProfile が true');

const ovProfile = resolveOverrides({ permUpgrades: 'profile' }, profile);
ok(JSON.stringify(ovProfile.permUpgrades) === JSON.stringify(profile.permanentUpgrades), 'permUpgrades profile は profile のコピー');
ovProfile.permUpgrades.max_hp = 999; // オーバーライドを書き換えても
ok(profile.permanentUpgrades.max_hp === 3, 'コピーの変更が profile へ波及しない');

const ovCustom = resolveOverrides({ permUpgrades: 'custom', customPermUpgrades: { max_hp: 1 } }, profile);
ok(ovCustom.permUpgrades.max_hp === 1 && !ovCustom.permUpgrades.move_speed, 'custom は指定値のみ');
ok(JSON.stringify(profile) === snapshot, 'custom 解決後も profile 不変');

// ===== 4. 保護フィールド宣言 =====
section('4. 保護フィールド');
for (const f of ['embers', 'soulflame', 'permanentUpgrades', 'jobProgress', 'skillMastery', 'highestClearedDifficulty', 'statistics']) {
  ok(PROTECTED_PROFILE_FIELDS.includes(f), `${f} が保護対象に含まれる`);
}

// ===== 5. null 安全 =====
section('5. null 安全');
const ovNull = resolveOverrides(null, null);
ok(ovNull && ovNull.debugRun === true, 'null 入力でも安全に解決');

console.log('');
if (fail) { console.error(`✗ Balance Playtest テスト失敗: ${fail} 件（成功 ${pass}）`); process.exit(1); }
else { console.log(`✓ Balance Playtest テスト成功: ${pass} 件すべて通過`); process.exit(0); }
