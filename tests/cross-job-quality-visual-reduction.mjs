// M9-A 横断監査 6/25: 品質を下げると **visual だけ** が減ること。Node.js 標準機能のみ。
// 実行: node tests/cross-job-quality-visual-reduction.mjs
import { DATA, QUALITIES, runner, readSrc } from './cross-job-common.mjs';
import { capNamesByClass } from './cap-shape.mjs';
import { capFor } from './warrior-common.mjs';

const T = runner('品質: visual だけが減る（M9-A）');
const { ok, section, info } = T;

section('1. visual cap は low で実際に減っている（削減が実在する）');
{
  const names = capNamesByClass(DATA.balance, 'visual');
  let reduced = 0;
  for (const n of names) {
    const c = DATA.balance.skillCaps[n];
    ok(c.low <= c.ultra, `${n}: low ≤ ultra`);
    if (c.low < c.ultra) reduced++;
  }
  ok(reduced >= 40, `visual cap ${names.length} 件中 ${reduced} 件は low < ultra（品質の意味が残っている）`);
}

section('2. gameplay / safety cap は品質名を変えても値が 1 件も変わらない');
{
  for (const cls of ['gameplay', 'safety']) {
    for (const n of capNamesByClass(DATA.balance, cls)) {
      const vals = QUALITIES.map((q) => capFor(n, q, -1));
      ok(new Set(vals).size === 1, `${n}（${cls}）: 4 品質で同値（${vals[0]}）`);
    }
  }
}

section('3. effectQuality の演出トグルが品質で段階的（damageNumbers / shake / flash / 粒子）');
{
  const eq = DATA.balance.effectQuality;
  ok(eq.low.particleScale < eq.ultra.particleScale, `particleScale: low ${eq.low.particleScale} < ultra ${eq.ultra.particleScale}`);
  ok(eq.low.maxSparksPerBurst < eq.ultra.maxSparksPerBurst, 'maxSparksPerBurst が品質で増える');
  ok(eq.low.damageNumbers === false && eq.high.damageNumbers === true, 'ダメージ数字は low で消える（表示のみ）');
  ok(eq.low.screenShake === false && eq.high.screenShake === true, 'screenShake は low で消える');
  const pb = DATA.balance.combatCaps.particleBudget;
  ok(pb.low < pb.ultra, `particleBudget: low ${pb.low} < ultra ${pb.ultra}`);
}

section('4. gameplay に効く品質分岐がコードへ残っていない');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  // 敵プール / 弾プールの上限は gameplayLimits 由来（品質ブロックから読まない）。
  ok(bs.includes('gl.maxEnemies') && bs.includes('gl.maxProjectiles'), 'プール上限が gameplayLimits 由来');
  // hitStop（ロジック frame を止める）は品質で切り替わらない。
  ok(bs.includes('hitStop: true'), 'hitStop が品質非依存（常に同じロジック経過）');
  ok(!/quality === 'low' \? 0 : \(reinc\.enemyCapAdd/.test(bs), '魂炎の敵密度ノードが品質で無効化されない');
  ok(!/quality === 'high' \|\| quality === 'ultra'\) \? \(reinc\.effectCapAdd/.test(bs), '魂炎の弾上限ノードが品質で無効化されない');
  // EvolutionScene の lowFx は演出フラグのみ（gameplay 値を渡さない）。
  ok(/lowFx: this\.settings\.effectQuality === 'low'/.test(bs), '進化演出の低品質フラグは表示専用のまま');
}

section('5. visualCap 経路は演出だけを絞る（damage 対象数へ影響しない）');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/visualCap を明示していればそれを使う（演出だけの上限。damage 件数へは影響しない）/.test(bs),
    'meleeStrike の visualCap が演出専用と明記されている');
  // 対象選択（SEQ_CMP / SpatialGrid）に品質が入らない。
  const grid = readSrc('src/systems/SpatialGrid.js');
  ok(!/quality/i.test(grid), 'SpatialGrid に品質参照が無い（対象選択順は品質非依存）');
}

T.finish();
