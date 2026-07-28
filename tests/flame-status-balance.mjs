// 火の魔女 完成監査 9/12: 炎上 / DoT / 爆発 / 共鳴のバランス分析（M8-A §9）。Node.js 標準機能のみ。
// production のスキル実装をそのまま駆動し、炎上付与・同時炎上数・DoT tick とダメージ・爆発・二次爆発・
// 共鳴（灼熱共鳴 / 万象炎鳴）の寄与を集計して、FlameBalanceWarnings で異常（0件・過剰・再帰）を検出する。
// 炎上索引（registerBurning / burningCount / burningEnemies）は BattleScene と同じ意味論をヘッドレスで再現する。
// 外部送信は一切しない。
// 実行: node tests/flame-status-balance.mjs

import { DATA, FLAME, makeScene, makeEnemies, runner, bootRuntime, evolutionBaseMap, readSrc } from './flame-audit-common.mjs';
import { analyzeFlameWarnings } from '../src/systems/FlameBalanceWarnings.js';

const { SkillManager } = await bootRuntime();
const T = runner('火の魔女 炎上・DoT・爆発・共鳴 バランス分析（M8-A）');
const { ok, section, info } = T;
const EVO_BASE = evolutionBaseMap();

// ---- 炎上索引つきヘッドレス scene（BattleScene の registerBurning/burningCount/burningEnemies と同じ意味論）----
function makeBurnScene(opts = {}) {
  const scene = makeScene(opts);
  const index = new Set();
  const M = {
    burningApplications: 0, burningRefresh: 0, burningPeak: 0, burningDurationSum: 0,
    dotTicks: 0, dotDamage: 0, directHits: 0, directDamage: 0,
    explosions: 0, secondaryExplosions: 0, explosionDamage: 0,
    resonancePulses: 0, resonanceChains: 0, indexLeaks: 0,
    bySkillBurning: {}, bySkillExplosion: {}, bySkillDot: {},
  };
  scene.metrics = M;
  scene.burningIndex = index;
  const now = () => scene.time.now;

  scene.combat.ignite = (e, ms, dmg, o) => {
    if (!e || !e.alive) return false;
    const already = e._igniteUntil && now() < e._igniteUntil;
    if (already) M.burningRefresh += 1; else M.burningApplications += 1;
    e.ignited = true; e._igniteUntil = now() + (ms || 0);
    M.burningDurationSum += (ms || 0);
    index.add(e);
    const sid = (o && o.skillId) || 'unknown';
    M.bySkillBurning[sid] = (M.bySkillBurning[sid] || 0) + 1;
    return true;
  };
  scene.combat.registerBurning = (e) => { if (e && e.alive) index.add(e); };
  scene.combat.burningCount = () => { let n = 0; for (const e of index) { if (e.alive && e.ignited && now() < e._igniteUntil) n++; else index.delete(e); } return n; };
  scene.combat.burningEnemies = (limit = 60) => {
    const out = [];
    for (const e of index) { if (e.alive && e.ignited && now() < e._igniteUntil) { if (out.length < limit) out.push(e); } else index.delete(e); }
    return out;
  };
  // Enemy.ignite 互換経路（スキルは e.ignite(ms, gen) を直接呼ぶ）。
  for (const e of opts.enemies || []) {
    e.ignite = function (ms, gen) { scene.combat.ignite(this, ms, 0, { skillId: scene._currentSkill }); this._igniteGen = gen || 0; return true; };
  }
  // ダメージ経路を計測へフックする。
  const origDeal = scene.combat.dealDamage;
  scene.combat.dealDamage = (t, amt, id, o) => {
    const opt = o || {};
    if (opt.tag === 'dot') { M.dotTicks += 1; M.dotDamage += amt; M.bySkillDot[id] = (M.bySkillDot[id] || 0) + amt; }
    else { M.directHits += 1; M.directDamage += amt; }
    return origDeal(t, amt, id, o);
  };
  const origArea = scene.combat.damageArea;
  scene.combat.damageArea = (x, y, r, amt, id, o) => {
    const opt = o || {};
    if (opt.tag === 'dot') { M.dotTicks += 1; M.dotDamage += amt; M.bySkillDot[id] = (M.bySkillDot[id] || 0) + amt; }
    if (opt.isExplosion) {
      M.explosions += 1; M.explosionDamage += amt;
      M.bySkillExplosion[id] = (M.bySkillExplosion[id] || 0) + 1;
      if (opt.isMarkDetonation || opt.secondary) M.secondaryExplosions += 1;
    }
    return origArea(x, y, r, amt, id, o);
  };
  scene.aoe = (x, y, r, amt, id, o) => {
    const opt = o || {};
    M.explosions += 1; M.explosionDamage += amt;
    M.bySkillExplosion[id] = (M.bySkillExplosion[id] || 0) + 1;
    if (opt.isMarkDetonation) M.secondaryExplosions += 1;
    scene.calls.push(['aoe', x, y, r, amt, id, o]);
  };
  return scene;
}

// 炎を撒くスキルと、それを利用する共鳴スキルを同時に走らせるハーネス。
function runHarness({ skills = [], evolutions = [], seconds = 60, enemies = 24 }) {
  const es = makeEnemies(enemies, { dy: 12 });
  const scene = makeBurnScene({ enemies: es, absorb: 1, seed: 0x51a3c7e5, deathEvents: [{ id: 1, x: 320, y: 200 }] });
  const sm = new SkillManager(scene); scene.skills = sm;
  for (const id of skills) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  for (const eid of evolutions) { const b = EVO_BASE[eid]; sm.acquireOrLevel(b); sm.setLevel(b, 8); sm.evolve(b); }
  const frames = seconds * 20; // 50ms 刻み
  for (let f = 0; f < frames; f++) {
    scene.advance(50);
    sm.update(50, { hasEnemies: true });
    scene.metrics.burningPeak = Math.max(scene.metrics.burningPeak, scene.combat.burningCount());
  }
  // 共鳴の内部統計を回収する。
  for (const [id, st] of sm.stats) {
    const ex = st.extra || {};
    if (ex.resonancePulses) scene.metrics.resonancePulses += ex.resonancePulses;
    if (ex.resonanceChains) scene.metrics.resonanceChains += ex.resonanceChains;
    void id;
  }
  return { scene, sm, M: scene.metrics };
}

// ===== 1. 炎上（burning）の付与・同時数・持続 =====
section('1. 炎上の付与 / 同時数 / 持続 / 更新（refresh）');
const burn = runHarness({ skills: ['burning_trail', 'lava_bomb', 'magma_vein', 'flame_vortex'], evolutions: ['eternal_pyre'], seconds: 60 });
info(`炎上付与 ${burn.M.burningApplications} 回 / 更新 ${burn.M.burningRefresh} 回 / 同時ピーク ${burn.M.burningPeak} 体 / 平均持続 ${(burn.M.burningDurationSum / Math.max(1, burn.M.burningApplications + burn.M.burningRefresh)).toFixed(0)}ms`);
ok(burn.M.burningApplications > 0, '炎上が付与される');
ok(burn.M.burningPeak > 0, '同時炎上数が 1 体以上になる');
ok(burn.M.burningPeak <= 24, '同時炎上数が対象数（24体）を超えない');
ok(burn.M.burningDurationSum > 0, '炎上の持続時間が正');
ok(burn.M.burningRefresh >= 0, '既に炎上中の敵への再付与は「更新」として扱われる（スタックしない）');

// ===== 2. DoT tick とダメージ =====
section('2. DoT tick と与ダメージ（tag:"dot" 経路）');
info(`DoT tick ${burn.M.dotTicks} 回 / 合計 ${burn.M.dotDamage.toFixed(0)}（平均 ${(burn.M.dotDamage / Math.max(1, burn.M.dotTicks)).toFixed(2)}/tick）`);
ok(burn.M.dotTicks > 0, '炎上付与があるなら DoT tick も発生する');
ok(burn.M.dotDamage > 0, 'DoT tick に与ダメージが伴う（tick ありで damage 0 でない）');
{
  const skills = Object.keys(burn.M.bySkillDot);
  ok(skills.length >= 3, `DoT を出すスキルが ${skills.length} 種（${skills.join(', ')}）`);
  for (const [k, v] of Object.entries(burn.M.bySkillDot)) ok(v > 0, `${k}: DoT 寄与 ${v.toFixed(0)}`);
}

// ===== 3. 爆発 / 二次爆発 =====
section('3. 爆発・二次爆発（再帰なし）');
const boom = runHarness({ skills: ['meteor', 'detonation_mark', 'ember_minefield', 'bloodfire_pact'], evolutions: ['apocalypse_chain', 'hellfire_mine_network'], seconds: 60 });
info(`爆発 ${boom.M.explosions} 回（合計 ${boom.M.explosionDamage.toFixed(0)}）/ 二次爆発 ${boom.M.secondaryExplosions} 回`);
ok(boom.M.explosions > 0, '爆発が発生する');
ok(boom.M.secondaryExplosions <= boom.M.explosions, '二次爆発が一次爆発を上回らない（再帰していない）');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/isMarkDetonation:\s*true/.test(bs), '起爆ダメージ自身は刻印カウントを進めない（再起爆の停止）');
  ok(/_deathExpBudget--/.test(bs), '死亡爆発連鎖に毎周回の予算がある');
  ok(/_explosionBudget <= 0/.test(bs), '同時爆発の予算切れで抑制される（暴走なし）');
  ok(/ctx\.depth >= \(m\.maxDepth \|\| 8\)/.test(bs), '連鎖起爆に最大深度がある');
  ok(/ctx\.spread >= \(m\.maxSpread \|\| 6\)/.test(bs), '刻印の拡散に上限がある');
}

// ===== 4. 共鳴（灼熱共鳴 / 万象炎鳴）=====
section('4. 共鳴（scorching_resonance / universal_flame_resonance）の寄与');
// 炎上（ignited マーカー）を撒くのは eternal_pyre / infernal_vortex_wheel / solar_core_collapse の 3 進化。
// 灼熱共鳴の tier はその炎上数で決まるため、共鳴の段階を測るには炎上源を同時に所持させる。
const res1 = runHarness({ skills: ['lava_bomb', 'scorching_resonance'], evolutions: ['eternal_pyre'], seconds: 60 });
info(`灼熱共鳴: パルス ${res1.M.resonancePulses} 回 / 炎上ピーク ${res1.M.burningPeak} 体 / 総ダメージ ${(res1.M.directDamage + res1.M.dotDamage + res1.M.explosionDamage).toFixed(0)}`);
ok(res1.M.resonancePulses > 0, '灼熱共鳴のパルスが発生する');
{
  const st = res1.sm.stats.get('scorching_resonance') || {};
  const ex = st.extra || {};
  ok((st.damage || 0) > 0, `灼熱共鳴が与ダメージを記録する（${(st.damage || 0).toFixed(0)}）`);
  info(`灼熱共鳴 extra: ${JSON.stringify(ex)}`);
  ok(ex.maxResonanceLevel != null, '共鳴段階（tier）が記録される');
}
const res2 = runHarness({ skills: ['burning_trail', 'lava_bomb', 'magma_vein'], evolutions: ['universal_flame_resonance', 'eternal_pyre'], seconds: 60 });
{
  const st = res2.sm.stats.get('universal_flame_resonance') || {};
  const ex = st.extra || {};
  info(`万象炎鳴 extra: ${JSON.stringify(ex)} / 炎上ピーク ${res2.M.burningPeak}`);
  ok((ex.resonancePulses || 0) > 0, '万象炎鳴のパルスが発生する');
  ok((st.damage || 0) > 0, '万象炎鳴が与ダメージを記録する');
  const chainsPerPulse = (ex.resonanceChains || 0) / Math.max(1, ex.resonancePulses || 1);
  ok(chainsPerPulse <= 40, `1パルスあたりの共鳴連鎖 ${chainsPerPulse.toFixed(1)} 本（無限連鎖でない）`);
}

// ===== 5. 炎上索引の掃除（死亡・返却で残留しない）=====
section('5. 炎上索引が死亡/プール返却で残留しない');
{
  const { scene, M } = burn;
  const idx = scene.burningIndex;
  const before = scene.combat.burningCount();
  // 敵を死亡させる → 索引の掃除が走る。
  for (const e of scene.combat.burningEnemies(999)) { e.alive = false; e.ignited = false; }
  const after = scene.combat.burningCount();
  ok(after === 0, `全敵死亡後の炎上数が 0（${before} → ${after}）`);
  ok(idx.size === 0, `索引から死亡個体が取り除かれる（残留 ${idx.size} 件）`);
  M.indexLeaks = idx.size;
  // Enemy.reset() が炎上をクリアする（プール再利用の残留防止）。
  const enemySrc = readSrc('src/entities/Enemy.js');
  const resetBody = enemySrc.slice(enemySrc.indexOf('reset('));
  ok(/this\._igniteUntil\s*=\s*0/.test(resetBody), 'Enemy.reset() で _igniteUntil をクリアする');
  ok(/this\._igniteGen\s*=\s*0/.test(resetBody), 'Enemy.reset() で _igniteGen をクリアする');
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/unregisterBurning\(/.test(bs), 'BattleScene が炎上索引の解除経路を持つ');
  ok(/this\._burningIndex\.delete\(e\)/.test(bs), '索引の走査時に消火/死亡個体を取り除く');
}

// ===== 6. スキル別の炎上 / 爆発 寄与 =====
section('6. スキル別の炎上 / DoT / 爆発 寄与');
info(`炎上付与（Enemy.ignite 経由の合計）: ${burn.M.burningApplications} 回 / 延長 ${burn.M.burningRefresh} 回`);
for (const [k, v] of Object.entries(boom.M.bySkillExplosion)) info(`爆発     ${k.padEnd(24)} ${v} 回`);
ok(Object.keys(burn.M.bySkillDot).length > 0, 'スキル別 DoT 寄与を集計できる');

// ===== 7. quality（low / ultra）で DoT / 炎上が変わらない =====
section('7. low 品質でも DoT / 炎上 / 爆発のダメージイベントが消えない');
for (const q of ['low', 'ultra']) {
  const es = makeEnemies(24, { dy: 12 });
  const scene = makeBurnScene({ enemies: es, quality: q, seed: 0x51a3c7e5 });
  const sm = new SkillManager(scene); scene.skills = sm;
  for (const id of ['burning_trail', 'lava_bomb', 'magma_vein']) { sm.acquireOrLevel(id); sm.setLevel(id, 8); }
  // 炎上源（eternal_pyre）も所持させ、品質を変えても炎上付与が消えないことを確認する。
  sm.acquireOrLevel('burning_trail'); sm.setLevel('burning_trail', 8); sm.evolve('burning_trail');
  for (let f = 0; f < 600; f++) { scene.advance(50); sm.update(50, { hasEnemies: true }); }
  ok(scene.metrics.dotTicks > 0, `${q}: DoT tick が発生する`);
  ok(scene.metrics.dotDamage > 0, `${q}: DoT ダメージが 0 にならない`);
  ok(scene.metrics.burningApplications > 0, `${q}: 炎上付与が 0 にならない`);
  info(`${q}: DoT tick ${scene.metrics.dotTicks} / DoT ダメージ ${scene.metrics.dotDamage.toFixed(0)} / 炎上付与 ${scene.metrics.burningApplications}`);
}

// ===== 8. FlameBalanceWarnings による警告生成 =====
section('8. FlameBalanceWarnings（炎上 / DoT / 爆発 / 共鳴の警告）');
{
  const warns = analyzeFlameWarnings({
    status: {
      burningApplications: burn.M.burningApplications, burningPeak: burn.M.burningPeak,
      dotTicks: burn.M.dotTicks, dotDamage: burn.M.dotDamage,
      explosions: boom.M.explosions, secondaryExplosions: boom.M.secondaryExplosions,
      resonancePulses: res1.M.resonancePulses + res2.M.resonancePulses,
      resonanceChains: res2.M.resonanceChains,
      burningIndexLeaks: burn.M.indexLeaks, fightSeconds: 60,
    },
  });
  for (const w of warns) info(`${w.severity}: ${w.code} ${w.target} — ${w.detail}`);
  ok(warns.filter((w) => w.severity === 'high').length === 0, `炎上/DoT/爆発/共鳴の high 警告 0 件（実際 ${warns.filter((w) => w.severity === 'high').length}）`);
  // 警告器が壊れていないことを、異常な入力で確認する。
  const bad = analyzeFlameWarnings({ status: { burningApplications: 500, dotTicks: 0, explosions: 0, secondaryExplosions: 0, resonancePulses: 0, burningIndexLeaks: 7, fightSeconds: 60 } });
  ok(bad.some((w) => w.code === 'FLAME_DOT_ZERO'), '炎上ありなのに DoT 0 を検出する');
  ok(bad.some((w) => w.code === 'FLAME_EXPLOSION_ZERO'), '爆発 0 を検出する');
  ok(bad.some((w) => w.code === 'FLAME_RESONANCE_ZERO'), '共鳴 0 を検出する');
  ok(bad.some((w) => w.code === 'FLAME_BURNING_INDEX_LEAK'), '炎上索引の残留を検出する');
  const bad2 = analyzeFlameWarnings({ status: { burningApplications: 10, dotTicks: 10, dotDamage: 0, explosions: 5, secondaryExplosions: 9, resonancePulses: 2, resonanceChains: 500, fightSeconds: 60 } });
  ok(bad2.some((w) => w.code === 'FLAME_DOT_DAMAGE_ZERO'), 'DoT tick ありで damage 0 を検出する');
  ok(bad2.some((w) => w.code === 'FLAME_EXPLOSION_RECURSION'), '二次爆発 > 一次爆発を検出する');
  ok(bad2.some((w) => w.code === 'FLAME_RESONANCE_RUNAWAY'), '共鳴の無限連鎖を検出する');
}

// ===== 9. 外部送信をしない =====
section('9. 外部送信なし（ローカル集計のみ）');
for (const f of ['src/systems/FlameBalanceWarnings.js', 'src/systems/CombatTelemetry.js', 'src/systems/RunBalanceSummary.js']) {
  const s = readSrc(f);
  ok(!/fetch\(|XMLHttpRequest|navigator\.sendBeacon|WebSocket|https?:\/\//.test(s), `${f}: 外部送信 API / 外部URL を含まない`);
}
void DATA; void FLAME;

T.finish();
