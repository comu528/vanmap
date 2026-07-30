// M9-A 横断監査 3/25: cap 分類（visual / gameplay / safety）。Node.js 標準機能のみ。
// M9-A の中核方針:
//   - visual cap のみ { low, medium, high, ultra }（品質で減らしてよい・単調非減少）
//   - gameplay / safety cap は { value } の**単一値**（品質を見る余地が構造的に無い）
//   - 分類の正は balance.json の skillCapClasses
// 実行: node tests/cross-job-quality-cap-classification.mjs
import { DATA, runner, allSrc } from './cross-job-common.mjs';
import { TIERS, isSingleCap, isTieredCap, capNamesByClass } from './cap-shape.mjs';

const T = runner('cap 分類（M9-A）');
const { ok, section, info } = T;
const CAPS = DATA.balance.skillCaps;
const CLS = DATA.balance.skillCapClasses;

section('1. 全 cap が分類され、分類外の cap / cap の無い分類が 0');
{
  const names = Object.keys(CAPS);
  ok(names.length === 217, `skillCaps 総数 217（${names.length}）`);
  for (const n of names) ok(['visual', 'gameplay', 'safety'].includes(CLS[n]), `${n}: 分類がある（${CLS[n]}）`);
  for (const n of Object.keys(CLS)) ok(!!CAPS[n], `${n}: 分類に対応する cap 宣言がある`);
  const v = capNamesByClass(DATA.balance, 'visual').length;
  const g = capNamesByClass(DATA.balance, 'gameplay').length;
  const s = capNamesByClass(DATA.balance, 'safety').length;
  info(`visual ${v} / gameplay ${g} / safety ${s}`);
  ok(v === 47 && g === 150 && s === 20, `分類数 visual47 / gameplay150 / safety20（${v}/${g}/${s}）`);
}

section('2. visual は 4 段階・単調非減少・正、gameplay / safety は単一値・正');
for (const [n, c] of Object.entries(CAPS)) {
  if (CLS[n] === 'visual') {
    ok(isTieredCap(c), `${n}: visual は 4 段階の形`);
    for (const t of TIERS) ok(Number.isFinite(c[t]) && c[t] > 0, `${n}.${t} が正`);
    ok(c.low <= c.medium && c.medium <= c.high && c.high <= c.ultra, `${n}: low ≤ medium ≤ high ≤ ultra`);
  } else {
    ok(isSingleCap(c), `${n}: ${CLS[n]} は単一値の形（品質キーを持たない）`);
    ok(Number.isFinite(c.value) && c.value > 0, `${n}.value が正（${c.value}）`);
    ok(Object.keys(c).length === 1, `${n}: value 以外のキーが無い（${Object.keys(c).join(',')}）`);
  }
}

section('3. 名前ヒューリスティックとの突合（誤分類の検知）');
{
  // 名前が演出を示す cap は visual、対象数 / ダメージ / 実体数を示す cap は visual でないこと。
  const VISUAL_NAME = /(Visuals?|Trails?|Sparks?|SparkVisuals|Debris|Markers?|Auras?|Rings?|Icons?|Flashes?|Dust|Indicators?|Lines)$|Visual/;
  // 名前は演出風だが**ダメージを与える実体**の上限（gameplay）である既知の例外。
  const EXC_GAMEPLAY = new Set(['maxBlazingTrails']); // 血路の足跡は DoT を与える field 実体
  const GAMEPLAY_NAME = /(Targets|Damage|Hits|Strikes|Ticks|Projectiles|Explosions|Chains?|Depth|Generation|PerSecond)/;
  // 名前だけでは決まらない既知の例外（実使用箇所で分類済み・docs/quality-cap-classification.md 参照）。
  const EXC_VISUAL = new Set([ // 名前は gameplay 風だが実使用は演出のみ
    'maxShatterEffectsPerFrame', 'maxStatusFloatingTextsPerFrame', 'maxWinterHaloVisualShards',
    'maxIcebreakerEffects', 'maxFrostbreakEffects', 'maxPhoenixEffects', 'maxStatusDebugHistory',
    'chillNearThresholdEffectCooldown', 'statusVisualUpdateInterval', 'maxStatusIcons',
    'maxChillVisuals', 'maxFrozenVisuals', 'maxImmunityVisuals', 'maxSlowTrails',
  ]);
  for (const [n] of Object.entries(CAPS)) {
    if (VISUAL_NAME.test(n) && !GAMEPLAY_NAME.test(n) && !EXC_GAMEPLAY.has(n)) {
      ok(CLS[n] === 'visual', `${n}: 名前が演出 → visual 分類（${CLS[n]}）`);
    } else if (GAMEPLAY_NAME.test(n) && !EXC_VISUAL.has(n) && !VISUAL_NAME.test(n)) {
      ok(CLS[n] !== 'visual', `${n}: 対象数 / 実体数 / ダメージ系 → visual でない（${CLS[n]}）`);
    }
  }
}

section('4. 品質ブロック（effectQuality）に gameplay 上限が無い');
{
  const eq = DATA.balance.effectQuality;
  for (const q of TIERS) {
    ok(eq[q].maxEnemies === undefined, `effectQuality.${q}.maxEnemies が無い（gameplayLimits へ移動済み）`);
    ok(eq[q].maxProjectiles === undefined, `effectQuality.${q}.maxProjectiles が無い`);
    for (const k of Object.keys(eq[q])) {
      ok(['particleScale', 'damageNumbers', 'screenShake', 'whiteFlash', 'maxSparksPerBurst'].includes(k),
        `effectQuality.${q}.${k} は演出キーのみ`);
    }
  }
  const gl = DATA.balance.gameplayLimits;
  ok(gl && gl.maxEnemies === 200 && gl.maxProjectiles === 400,
    `gameplayLimits = { maxEnemies: 200, maxProjectiles: 400 }（canonical = 旧 high）`);
}

section('5. canonical value = M8-F までの high（出荷既定品質）の値であること（代表 12 件）');
{
  // canonical baseline の選択理由は docs/quality-cap-classification.md。
  const CANON = {
    maxMeleeTargetsPerHit: 24, maxFlameLances: 80, maxFrostShards: 72, maxHomingWisps: 50,
    maxReflectedProjectiles: 6, maxEchoCloneGeneration: 1, maxBossFrostbreaksPerFrame: 1,
    maxFrozenEnemies: 100, maxStatusIndexEntries: 400, maxLineTargets: 10,
    maxEvolutionProjectiles: 140, maxDeflectionsPerWindow: 6,
  };
  for (const [n, v] of Object.entries(CANON)) ok(CAPS[n] && CAPS[n].value === v, `${n}: canonical ${v}（${CAPS[n] && CAPS[n].value}）`);
}

section('6. combatCaps / spatialGrid / statusVisuals の分類整合');
{
  const cc = DATA.balance.combatCaps;
  for (const k of ['maxAoePerFrame', 'maxDamageNumbersPerFrame', 'maxExtraFireballs', 'maxDeathExplosionChain', 'maxInfectGenerations', 'maxEchoPerFrame']) {
    ok(typeof cc[k] === 'number', `combatCaps.${k} は品質を持たない単一値`);
  }
  ok(cc.particleBudget && TIERS.every((t) => cc.particleBudget[t] > 0), 'particleBudget は visual（4 段階）のまま');
  ok(cc.particleBudget.low <= cc.particleBudget.ultra, 'particleBudget 単調');
  ok(typeof DATA.balance.spatialGrid.maxRegistered === 'number', 'spatialGrid.maxRegistered は単一値');
  ok(DATA.balance.spatialGrid.maxRegistered >= DATA.balance.gameplayLimits.maxEnemies,
    'spatialGrid.maxRegistered ≥ gameplayLimits.maxEnemies');
}

section('7. production の解決規則: gameplay cap はどの品質名でも同じ値');
{
  const dm = allSrc();
  ok(dm.includes("if (typeof c.value === 'number') return c.value;"), 'DataManager.skillCap が単一値の形を先に解決する');
}

T.finish();
