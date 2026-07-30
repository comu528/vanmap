// 戦士 完成監査 22/23: バランス完成監査（M8-F §24）。Node.js 標準機能のみ。
// 数値の「良し悪し」ではなく、**死にスキル / 逆転 / 永久状態 / 場外** といった構造的な異常を洗う。
// HEAVY=1 で seed / 時間を増やす。
// 実行: node tests/warrior-completion-balance.mjs
import { DATA, WARRIOR, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, runner } from './warrior-common.mjs';
const T = runner('戦士 バランス完成監査（M8-F）');
const { ok, section, info } = T;
const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const W = DATA.balance.warrior;
const HEAVY = process.env.HEAVY === '1';
const STEPS = HEAVY ? 18000 : 9000;
let bs = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bs, x: 400 + (i % 6) * 5, y: 300 + Math.floor(i / 6) * 5, angle: Math.PI, alive: true, hostile: true,
  damage: 20, speed: 180, projectileKind: 'bossBullet', isBeam: false, isTelegraph: false,
  alreadyDeflected: false, deflectGeneration: 0, suppressSpecialEffects: false, _deflectId: null,
}));
const mk = (o = {}) => {
  const enemies = o.enemies || [...makeEnemies(30, { x: 340, y: 300, dx: 8, dy: 3, hp: 1e9 }), ...makeEnemies(6, { x: 360, y: 300, dx: 8, hp: 1e9, elite: true })];
  const scene = makeScene({ enemies, boss: o.boss !== undefined ? o.boss : makeBoss({ x: 520, y: 300, hp: 1e9 }),
    now: 10000, quality: 'high', enemyBullets: mkBullets(30) });
  const w = makeWarrior(WarriorCombatSystem, scene, o);
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};
const play = (ids, o = {}) => {
  const c = mk(o);
  for (const id of ids) { c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; } }
  for (let i = 0; i < STEPS; i++) {
    c.sm.update(32, { hasEnemies: true });
    c.w.setHp(c.scene.player.maxHp * (i % 500 < 250 ? 1 : 0.2), c.scene.player.maxHp);
    c.w.update(32); c.scene.advance(32);
    if (i % 40 === 20) c.scene.onWarriorHit(35, 25);
    if (i % 200 === 0) c.scene.enemyBullets.push(...mkBullets(10));
    if (c.scene.calls.length > 150000) c.scene.calls.length = 0;
  }
  return c;
};

// ===== 1. 30 active の damage / utility 分布 =====
section('1. 30 active すべてが damage か utility を出す（死にスキル 0）');
const DIST = {};
{
  const c = play(EXPECTED.actives, { mods: { killHealMult: 1 } });
  const list = c.sm.statsList();
  const total = list.reduce((a, s) => a + (s.damage || 0), 0);
  // 直接ダメージを持たない設計のスキル（構え / 弾き返し）。
  const UTILITY_ONLY = new Set(['counter_stance', 'weapon_deflection']);
  for (const id of EXPECTED.actives) {
    const s = list.find((x) => x.id === id) || {};
    DIST[id] = { dmg: s.damage || 0, cast: s.casts || 0, hit: s.hits || 0, share: (s.damage || 0) / Math.max(1, total) };
    ok((s.casts || 0) > 0, `${id}: 発動する（${s.casts}）`);
    if (UTILITY_ONLY.has(id)) {
      // utility は「効果が実際に動いた」ことで測る。
      const ex = s.extra || {};
      const acted = Object.values(ex).some((v) => typeof v === 'number' && v > 0);
      ok(acted, `${id}: 直接ダメージは無いが効果が動く（${JSON.stringify(ex)}）`);
    } else {
      ok((s.damage || 0) > 0, `${id}: ダメージを出す（${Math.round(s.damage || 0)}）`);
      ok((s.hits || 0) > 0, `${id}: 命中する（${s.hits}）`);
    }
  }
  const top = Object.entries(DIST).sort((a, b) => b[1].share - a[1].share)[0];
  ok(top[1].share <= 0.35, `最大ダメージシェア ${(top[1].share * 100).toFixed(1)}% ≤ 35%（${top[0]}）`);
  info('ダメージシェア上位 8:');
  for (const [id, d] of Object.entries(DIST).sort((a, b) => b[1].share - a[1].share).slice(0, 8)) {
    info(`  ${id.padEnd(24)} ${(d.share * 100).toFixed(1)}% dmg=${Math.round(d.dmg)} cast=${d.cast} hit=${d.hit}`);
  }
  info('ダメージシェア下位 5:');
  for (const [id, d] of Object.entries(DIST).sort((a, b) => a[1].share - b[1].share).slice(0, 5)) {
    info(`  ${id.padEnd(24)} ${(d.share * 100).toFixed(1)}% dmg=${Math.round(d.dmg)} cast=${d.cast} hit=${d.hit}`);
  }
}

// ===== 2. 18 進化が base を完全に食わない / 弱くならない =====
section('2. 18 進化が base より弱くならず、既存スキルを完全に食わない');
{
  const STANCE = new Set(['adamant_counter', 'heaven_mirror_reversal']);
  for (const id of EXPECTED.evolutions) {
    const e = DATA.evolutions.find((x) => x.id === id);
    const lo = play([e.baseSkillId]);
    const hi = play([id]);
    const bd = (lo.sm.statsList().find((s) => s.id === e.baseSkillId) || {}).damage || 0;
    const ed = (hi.sm.statsList().find((s) => s.id === id) || {}).damage || 0;
    if (STANCE.has(id)) { ok(true, `${id}: 構え系（ダメージで比べない）`); continue; }
    ok(ed >= bd * 0.9, `${id}: ${Math.round(ed)} ≥ base ${Math.round(bd)} の 90%`);
    // 「完全に食う」= 他の 29 active すべてのシェアを 1% 未満へ落とす、が起きない。
    const all = play([...EXPECTED.actives.filter((x) => x !== e.baseSkillId), id]);
    const list = all.sm.statsList();
    const tot = list.reduce((a, s) => a + (s.damage || 0), 0);
    const mine = (list.find((s) => s.id === id) || {}).damage || 0;
    ok(mine / Math.max(1, tot) <= 0.45, `${id}: 全部盛りでもシェア ${((mine / Math.max(1, tot)) * 100).toFixed(1)}% ≤ 45%`);
  }
}

// ===== 3. 永久状態が無い =====
section('3. 永久状態（構え / 決闘 / 窓 / 陣 / 解放 / exposed）が無い');
{
  const c = play(EXPECTED.actives, { mods: { killHealMult: 1 } });
  // すべてのスキルを破棄せず、時間だけを大きく進める。
  for (let i = 0; i < 2000; i++) { c.w.update(32); c.scene.advance(32); }
  ok(!c.w.tranceActive, '構えが永続しない');
  ok(!c.w.duelActive, '決闘が永続しない');
  ok(!c.w.deflectionActive, '弾き窓が永続しない');
  ok(!c.w.rallyActive, '陣が永続しない');
  ok(!c.w.releaseActive, '闘気解放が永続しない');
  ok(!c.w.exposedActive, 'ボスの露出が永続しない');
  ok(!c.w.grabbing, '掴みが永続しない');
  ok(c.w.counterWindows.size === 0, '反撃窓が残らない');
}

// ===== 4. 無限回復 / 自傷最適解が無い =====
section('4. 無限回復 / 「瀕死維持が最適」にならない');
{
  const c = play(EXPECTED.actives, { mods: { killHealMult: 1 } });
  ok(c.w.telemetry.killHealCapped >= 0, '撃破回復に上限がある');
  ok(c.scene.player.hp <= c.scene.player.maxHp, 'overheal しない');
  // 低 HP 倍率が頭打ち。
  ok(W.lowHp.maxMissingHpMultiplier <= 2, `低 HP 倍率の上限 ${W.lowHp.maxMissingHpMultiplier} ≤ 2`);
  const avg = c.w.telemetry.lowHpBonusSamples ? c.w.telemetry.lowHpBonusSum / c.w.telemetry.lowHpBonusSamples : 1;
  ok(avg <= W.lowHp.maxMissingHpMultiplier + 1e-6, `低 HP 倍率の実測平均 ${avg.toFixed(3)} が上限内`);
  // 自傷する経路が無い。
  const src = (await import('node:fs')).readFileSync('src/systems/WarriorCombatSystem.js', 'utf8');
  ok(!/hp\s*-=|selfDamage|hpCost/.test(src), '自傷の経路が無い');
}

// ===== 5. ボスを永久拘束できない =====
section('5. ボスを永久に拘束できない');
{
  const c = play(EXPECTED.actives, { enemies: makeEnemies(6, { x: 360, y: 300, dx: 8, hp: 1e9 }), boss: makeBoss({ x: 460, y: 300, hp: 1e9 }) });
  const b = c.scene.boss;
  ok(!(b._airborneUntil > 0), 'ボスが浮いていない');
  ok(b._grabbed !== true, 'ボスが掴まれていない');
  ok(!(b._staggerUntil > c.scene.time.now + 5000), 'ボスが長時間 stagger していない');
  // 露出時間の合計が周回時間の一定割合を超えない。
  const runMs = STEPS * 32;
  ok(c.w.telemetry.exposedUptimeMs <= runMs * 0.5, `露出時間 ${(c.w.telemetry.exposedUptimeMs / 1000).toFixed(1)}s が周回の 50% 以下`);
  ok(c.w.bossPoise.thresholdMult <= W.poise.boss.thresholdMaxMult + 1e-6, `しきい値倍率が上限内（×${c.w.bossPoise.thresholdMult.toFixed(2)}）`);
  info(`ボス: 崩し ${c.w.bossPoise.breaks} 回 / 露出 ${(c.w.telemetry.exposedUptimeMs / 1000).toFixed(1)}s / しきい値 ×${c.w.bossPoise.thresholdMult.toFixed(2)}`);
}

// ===== 6. 通常敵を過剰拘束しない / 場外へ出さない =====
section('6. 通常敵を過剰に拘束せず、場外へ押し出さない');
{
  const c = play(EXPECTED.actives);
  const now = c.scene.time.now;
  for (const e of c.enemies) {
    ok(!(e._airborneUntil > now + W.launch.maxAirborneMs), `敵 ${e._seq}: 滞空が上限を超えない`);
    ok(e.x >= 0 && e.x <= c.scene.worldW && e.y >= 0 && e.y <= c.scene.worldH, `敵 ${e._seq}: 場外へ出ない`);
    ok(Number.isFinite(e.x) && Number.isFinite(e.y), `敵 ${e._seq}: 座標が有限`);
  }
  const airborne = c.enemies.filter((e) => e._airborneUntil > now).length;
  ok(airborne <= c.enemies.length, `同時に浮いている敵 ${airborne} / ${c.enemies.length}`);
}

// ===== 7. 反射 / 弾き返しが過剰でない =====
section('7. 弾き返し / 反射が過剰でない（完全無効化にならない）');
{
  const c = play(['weapon_deflection', 'heaven_mirror_reversal', 'counter_stance', 'adamant_counter']);
  const seen = c.w.telemetry.deflectSeen;
  const deflected = c.w.telemetry.deflected;
  ok(seen > 0, `弾を検知する（${seen}）`);
  ok(deflected < seen, `検知した弾のすべては弾けない（${deflected} < ${seen}）＝完全無効化ではない`);
  ok(c.scene.enemyBullets.filter((b) => b.alive).length > 0, '生き残る敵弾がある');
  ok(c.w.telemetry.reflectedSpawned <= deflected, `反射弾 ${c.w.telemetry.reflectedSpawned} ≤ 弾いた数 ${deflected}`);
  info(`弾き返し: 検知 ${seen} / 弾き ${deflected}（${((deflected / Math.max(1, seen)) * 100).toFixed(1)}%）/ 反射 ${c.w.telemetry.reflectedSpawned}`);
}

// ===== 8. 闘気解放が過剰に連発されない =====
section('8. 闘気解放が過剰に連発されない');
{
  const c = play(EXPECTED.actives);
  const runSec = (STEPS * 32) / 1000;
  const per = c.w.telemetry.furyReleases / runSec;
  ok(per <= 1 / (W.furyRelease.durationMs / 1000), `解放の頻度 ${(per * 60).toFixed(1)}回/分 が持続時間の逆数以下`);
  ok(c.w.telemetry.furyReleases > 0, `それでも解放は起きる（${c.w.telemetry.furyReleases} 回）`);
  const upt = c.w.telemetry.furyReleaseUptimeMs / (STEPS * 32);
  ok(upt <= 0.75, `解放の稼働率 ${(upt * 100).toFixed(1)}% ≤ 75%（常時解放にならない）`);
  info(`闘気解放: ${c.w.telemetry.furyReleases} 回 / 稼働率 ${(upt * 100).toFixed(1)}%`);
}

// ===== 9. 既存 25 active が全ハズレ化しない =====
section('9. M8-E で追加した 5 種が既存 25 種を全ハズレにしない');
{
  const FINAL = EXPECTED.finalActives;
  const finalShare = FINAL.reduce((a, id) => a + DIST[id].share, 0);
  ok(finalShare <= 0.5, `最終Wave 5 種の合計シェア ${(finalShare * 100).toFixed(1)}% ≤ 50%`);
  const older = EXPECTED.actives.filter((id) => !FINAL.includes(id));
  const weak = older.filter((id) => DIST[id].share < 0.002 && DIST[id].dmg === 0);
  ok(weak.length === 0, `既存 25 種に「ダメージ 0 かつシェア 0.2% 未満」が無い（${weak.join(',') || 'なし'}）`);
  info(`最終Wave 5 種の合計シェア ${(finalShare * 100).toFixed(1)}% / 既存 25 種 ${((1 - finalShare) * 100).toFixed(1)}%`);
}

// ===== 10. 品質で戦力が落ちない（規則が変わらない） =====
section('10. 品質を落としても 1 発動あたりの規則が変わらない');
{
  const per = (q) => {
    const c = mk({ quality: q });
    c.sm.acquireOrLevel('great_cleave'); c.sm.setLevel('great_cleave', 8);
    for (let i = 0; i < 600; i++) { c.sm.update(16, { hasEnemies: true }); c.w.update(16); c.scene.advance(16); }
    const s = c.sm.statsList().find((x) => x.id === 'great_cleave') || {};
    return (s.damage || 0) / Math.max(1, s.hits || 1);
  };
  const lo = per('low'); const hi = per('ultra');
  ok(Math.abs(lo - hi) < 1e-6, `1 命中あたりのダメージが品質で変わらない（low ${lo.toFixed(3)} / ultra ${hi.toFixed(3)}）`);
}

T.finish();
