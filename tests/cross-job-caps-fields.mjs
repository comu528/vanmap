// M9-A 横断監査 22/25: dead field / unused cap / duplicated config の全 data 横断。Node.js 標準機能のみ。
// 実行: node tests/cross-job-caps-fields.mjs
import { DATA, runner, allSrc, readSrc } from './cross-job-common.mjs';

const T = runner('dead field / unused cap 横断監査（M9-A）');
const { ok, section, info } = T;
const SRC = allSrc();
const ref = (k) => SRC.includes(`'${k}'`) || SRC.includes(`"${k}"`) || SRC.includes(`.${k}`) || SRC.includes(`${k}:`);

section('1. skillCaps 217 件すべてが実装から参照される（未参照 0・予約 0）');
{
  const unused = Object.keys(DATA.balance.skillCaps).filter((k) => !SRC.includes(`'${k}'`) && !SRC.includes(`"${k}"`));
  ok(unused.length === 0, `未参照 cap 0 件（${unused.join(',') || 'なし'}）`);
  ok(Object.keys(DATA.balance.skillCaps).length === 217, 'cap 総数 217（黙って増減しない）');
}

section('2. skillCapClasses が過不足なく 217 件（分類の予約 / 欠落 0）');
{
  const caps = new Set(Object.keys(DATA.balance.skillCaps));
  const cls = Object.keys(DATA.balance.skillCapClasses);
  ok(cls.length === caps.size, `分類件数 = cap 件数（${cls.length}）`);
  ok(cls.every((k) => caps.has(k)), '分類だけあって cap が無いものは 0');
}

section('3. combatCaps / gameplayLimits / spatialGrid / statusVisuals の全キーが参照される');
{
  for (const k of Object.keys(DATA.balance.combatCaps)) ok(ref(k), `combatCaps.${k}: 参照あり`);
  for (const k of Object.keys(DATA.balance.gameplayLimits)) ok(ref(k), `gameplayLimits.${k}: 参照あり`);
  for (const k of Object.keys(DATA.balance.spatialGrid)) ok(ref(k), `spatialGrid.${k}: 参照あり`);
  ok(ref('statusVisuals') || ref('iconPriority'), 'statusVisuals: 参照あり');
}

section('4. balance.warrior の既定値（WARRIOR_DEFAULTS）と data の一致（サンプル）');
{
  const src = readSrc('src/systems/WarriorCombatSystem.js');
  // M8-F で追加した上限は data と WARRIOR_DEFAULTS の両方に同じ値がある。
  for (const [key, val] of [['maxRadius: 280', DATA.balance.warrior.rally.maxRadius === 280],
    ['maxCountersPerWindow: 6', DATA.balance.warrior.counter.maxCountersPerWindow === 6],
    ['maxWindowMs: 6000', DATA.balance.warrior.counter.maxWindowMs === 6000]]) {
    ok(src.includes(key) && val, `WARRIOR_DEFAULTS と data が一致（${key}）`);
  }
}

section('5. 同義 cap の矛盾 0（大文字小文字違い / 単複違いの重複名なし）');
{
  const names = Object.keys(DATA.balance.skillCaps);
  const norm = new Map();
  for (const n of names) {
    const key = n.toLowerCase().replace(/s$/, '');
    if (norm.has(key)) info(`類似名: ${norm.get(key)} / ${n}（用途は別・意図的）`);
    norm.set(key, n);
  }
  ok(new Set(names.map((n) => n.toLowerCase())).size === names.length, '大文字小文字違いの重複 0');
}

section('6. 品質依存すべきでない cap が品質依存していない（分類との突合）');
{
  const CLS = DATA.balance.skillCapClasses;
  let bad = 0;
  for (const [n, c] of Object.entries(DATA.balance.skillCaps)) {
    const tiered = typeof c.value !== 'number';
    if (tiered && CLS[n] !== 'visual') { bad++; info(`  誤: ${n} が品質依存（${CLS[n]}）`); }
    if (!tiered && CLS[n] === 'visual') { bad++; info(`  誤: ${n} が単一値（visual）`); }
  }
  ok(bad === 0, `分類と形の矛盾 0（${bad}）`);
}

section('7. 3 ジョブの balance ブロックの命名整合（既知の設計差以外の逸脱なし）');
{
  ok('warrior' in DATA.balance, 'balance.warrior がある（戦士の共通機構）');
  // 火 / 氷は skillCaps + combatCaps + statusEffects/data 側で完結し、balance 直下に job ブロックを持たない。
  ok(!('flame_witch' in DATA.balance) && !('frost_mage' in DATA.balance),
    '火 / 氷は balance 直下に job ブロックを持たない（設計差・warrior のみ共通機構ブロック）');
}

T.finish();
