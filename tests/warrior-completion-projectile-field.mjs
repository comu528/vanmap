// 戦士 完成監査 14/23: 弾 / 設置物 / 一時オブジェクト（M8-F §16）。Node.js 標準機能のみ。
// 実行: node tests/warrior-completion-projectile-field.mjs
import { DATA, EXPECTED, makeScene, makeEnemies, makeBoss, makeWarrior, bootRuntime, capFor, readSrc, runner } from './warrior-common.mjs';
const T = runner('戦士 弾 / 設置物 完成監査（M8-F）');
const { ok, section, info } = T;
const { SkillManager, WarriorCombatSystem } = await bootRuntime();
const W = DATA.balance.warrior;
let bs = 0;
const mkBullets = (n) => Array.from({ length: n }, (_, i) => ({
  _id: ++bs, x: 402 + (i % 8) * 4, y: 300 + Math.floor(i / 8) * 4, angle: Math.PI, alive: true, hostile: true,
  damage: 20, speed: 180, projectileKind: 'bossBullet', isBeam: false, isTelegraph: false,
  alreadyDeflected: false, deflectGeneration: 0, suppressSpecialEffects: false, _deflectId: null,
}));
const mk = (o = {}) => {
  const enemies = o.enemies || makeEnemies(12, { x: 340, y: 300, dx: 10, dy: 3, hp: 1e9 });
  const scene = makeScene({ enemies, boss: o.boss || null, now: 10000, quality: o.quality || 'high', enemyBullets: o.bullets || mkBullets(24) });
  const w = makeWarrior(WarriorCombatSystem, scene, {});
  const sm = new SkillManager(scene); scene.skills = sm;
  return { scene, w, sm, enemies };
};
const run = (c, ms, step = 16) => {
  for (let i = 0; i < ms / step; i++) {
    c.sm.update(step, { hasEnemies: true }); c.w.setHp(c.scene.player.hp, c.scene.player.maxHp);
    c.w.update(step); c.scene.advance(step);
    if (i % 120 === 0) c.scene.enemyBullets.push(...mkBullets(8));
  }
};

// ===== 1. 戦斧投擲は Projectile を使わない =====
section('1. 戦斧投擲 / 山岳投擲は Projectile を作らない（近接倍率も乗らない）');
for (const id of ['war_axe_throw', 'mountain_hurl', 'battlefield_throw']) {
  const c = mk({ bullets: [] });
  c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  run(c, 12000);
  ok(c.scene.calls.filter((x) => x[0] === 'proj').length === 0, `${id}: 弾を 1 つも作らない`);
  ok((c.sm.statsList().find((s) => s.id === id) || {}).casts > 0, `${id}: 発動する`);
}
{
  const bsSrc = readSrc('src/scenes/BattleScene.js');
  ok(/isThrown/.test(bsSrc), '投擲は isThrown フラグで区別される');
  ok(/isMelee:\s*!o\.isThrown/.test(bsSrc), '投擲は近接扱いにならない（近接倍率が乗らない）');
}

// ===== 2. 反射弾の生成と後始末 =====
section('2. 反射弾は世代 1・短命・同時数上限つきでプールへ返る');
for (const id of ['weapon_deflection', 'heaven_mirror_reversal']) {
  const c = mk({ bullets: mkBullets(40) });
  c.sm.acquireOrLevel(id); try { c.sm.setLevel(id, 8); } catch (e) { void e; }
  run(c, 30000);
  const cap = capFor('maxReflectedProjectiles', 'high', 8);
  ok(c.scene.reflected.length <= cap, `${id}: 同時反射弾 ${c.scene.reflected.length} ≤ ${cap}`);
  for (const p of c.scene.reflected) {
    ok(p.deflectGeneration === 1, `${id}: 世代 1`);
    ok(p.alreadyDeflected === true, `${id}: 再反射されない印`);
    ok(p.hostile === false && p.ownerType === 'player', `${id}: オーナーが戦士側`);
    ok(p.suppressSpecialEffects === true, `${id}: 元弾の特殊効果を引き継がない`);
    ok(p.damage <= W.deflection.maxReflectedDamage + 1e-9, `${id}: ダメージ上限内`);
    ok(p.speed <= W.deflection.maxReflectedSpeed + 1e-9, `${id}: 速度上限内`);
    ok(p.lifeMs <= W.deflection.maxReflectLifeMs + 1e-9, `${id}: 短命`);
    ok(p.chillAmount === 0 && p.baseFreezeChance === 0 && p.explosionRadius === 0, `${id}: 状態異常 / 爆発を持たない`);
  }
  // 破棄で窓とフックが消える。
  c.sm.skills.get(id).destroy();
  ok(!c.w.deflectionActive, `${id}: destroy で窓が消える`);
  ok(c.scene._deflectOpts === null, `${id}: destroy で被弾フックが外れる`);
  ok(c.w._deflectedIds.size === 0, `${id}: 弾いた id 集合が空になる`);
}

// ===== 3. Projectile の追加フィールドは既定値で無害 =====
section('3. Projectile の追加フィールドは既定値で無害・reset で戻る');
{
  const src = readSrc('src/entities/Projectile.js');
  for (const [f, def] of [['_deflectId', 'null'], ['alreadyDeflected', 'false'], ['deflectGeneration', '0'], ['suppressSpecialEffects', 'false']]) {
    ok(new RegExp(`this\\.${f}\\s*=\\s*${def}`).test(src), `${f} の既定は ${def}`);
  }
  const clear = src.slice(src.indexOf('_clearState()'), src.indexOf('reset(x, y, angle'));
  for (const f of ['_deflectId', 'alreadyDeflected', 'deflectGeneration', 'suppressSpecialEffects']) {
    ok(clear.includes(f), `_clearState() が ${f} を戻す（プール再利用で持ち越さない）`);
  }
  ok(/reset\s*\([^)]*\)\s*\{\s*[^}]*this\._clearState\(\)/.test(src), 'reset() が _clearState() を呼ぶ');
}

// ===== 4. 設置物（陣）は常に 1 つ =====
section('4. 戦旗の陣は常に 1 つ・外側では効かず・時間で必ず消える');
{
  const c = mk({ bullets: [] });
  const w = c.w; const p = c.scene.player;
  w.placeRallyField('a', { x: p.x, y: p.y, durationMs: 5000, radius: 150, meleeArea: 0.2 });
  w.placeRallyField('b', { x: p.x + 300, y: p.y, durationMs: 5000, radius: 150, meleeArea: 0.2 });
  ok(w.rallyActive, '陣が張られる');
  ok(W.rally.maxFields === 1, 'balance で 1 本まで');
  // 内側 / 外側。
  w.updateRallyPosition(w.rallyField.x, w.rallyField.y);
  ok(w.rallyInside, '中心にいれば内側');
  ok(w.rallyBonus('meleeArea') > 0, '内側では効果が乗る');
  w.updateRallyPosition(w.rallyField.x + 1e6, w.rallyField.y);
  ok(!w.rallyInside, '離れれば外側');
  ok(w.rallyBonus('meleeArea') === 0, '外側では効果が 0');
  // 時間で消える。
  for (let i = 0; i < 500; i++) { w.update(16); c.scene.advance(16); }
  ok(!w.rallyActive, '時間で消える');
  ok(w.rallyBonus('meleeArea') === 0, '消えた後は 0');
}

// ===== 5. 一時的な状態が Scene 終了で残らない =====
section('5. Scene 終了 / 破棄で一時オブジェクトが 1 つも残らない');
{
  const c = mk({ bullets: mkBullets(30) });
  for (const id of EXPECTED.actives) { c.sm.acquireOrLevel(id); c.sm.setLevel(id, 8); }
  run(c, 20000);
  for (const id of EXPECTED.actives) c.sm.skills.get(id).destroy();
  c.w.destroy();
  c.scene.cleanupWarrior();   // production の BattleScene.cleanup 相当
  ok(!c.w.rallyActive && !c.w.duelActive && !c.w.tranceActive && !c.w.deflectionActive, '時限状態が全部消える');
  ok(!c.w.grabbing, '掴みが消える');
  ok(c.w._deflectedIds.size === 0, '弾いた id 集合が空');
  ok(c.w.counterWindows.size === 0, '反撃窓が空');
  ok(c.scene._deflectOpts === null, '被弾フックが外れている');
  ok(c.enemies.filter((e) => e._duelMark).length === 0, `決闘マーカーが 1 つも残らない（${c.enemies.filter((e) => e._duelMark).length}）`);
}

// ===== 6. Phaser の実体を保存しない =====
section('6. Timer / Tween / Graphics / listener を保存しない・残さない');
{
  const map = (await import('./warrior-common.mjs')).registryMap();
  for (const id of [...EXPECTED.actives, ...EXPECTED.evolutions]) {
    const src = readSrc(`src/skills/${map[id]}.js`);
    if (/delayedCall/.test(src)) ok(/this\._dead\s*\|\|/.test(src), `${id}: delayedCall に破棄ガードがある`);
    if (/tweens\.add/.test(src)) ok(/destroy\(\)|onComplete/.test(src), `${id}: tween に破棄経路がある`);
    if (/this\.scene\.add\./.test(src)) ok(/\.destroy\(\)/.test(src), `${id}: 生成した表示物を破棄する`);
    // 保存に Phaser の実体を入れない（serializeState の本体だけを波括弧の対応で切り出す）。
    const i0 = src.indexOf('serializeState');
    if (i0 >= 0) {
      const open = src.indexOf('{', i0);
      let depth = 0; let end = open;
      for (let k = open; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) { end = k; break; } } }
      const ser = src.slice(open, end + 1).replace(/\/\/[^\n]*/g, '');
      ok(!/scene|tween|graphics|timer|sprite/i.test(ser), `${id}: serializeState に Phaser の実体を入れない`);
    }
  }
}

// ===== 7. 長時間で配列が伸び続けない =====
section('7. 長時間プレイで一時オブジェクトが伸び続けない');
{
  const c = mk({ bullets: mkBullets(30) });
  for (const id of EXPECTED.actives) { c.sm.acquireOrLevel(id); c.sm.setLevel(id, 8); }
  run(c, 30000);
  const mid = { r: c.scene.reflected.length, d: c.w._deflectedIds.size, cw: c.w.counterWindows.size };
  run(c, 90000);
  const end = { r: c.scene.reflected.length, d: c.w._deflectedIds.size, cw: c.w.counterWindows.size };
  ok(end.r <= capFor('maxReflectedProjectiles', 'high', 8), `反射弾が上限内（${mid.r} → ${end.r}）`);
  ok(end.d <= W.deflection.maxDeflectionsPerWindow, `弾いた id 集合が 1 窓分（${mid.d} → ${end.d}）`);
  ok(end.cw <= 4, `反撃窓が有界（${mid.cw} → ${end.cw}）`);
  info(`2 分相当: 反射弾 ${end.r} / 弾いた id ${end.d} / 反撃窓 ${end.cw}`);
}

// ===== 8. 品質で logic が変わらない =====
section('8. 品質で「弾ける種別」の判定が変わらない（演出だけ）');
for (const q of ['low', 'medium', 'high', 'ultra']) {
  const c = mk({ quality: q, bullets: [] });
  c.w.beginDeflectionWindow('x', { windowMs: 5000, maxDeflections: 8, radius: 200, reflect: false, reflectedDamage: 0, reflectedSpeed: 0, reflectLifeMs: 0 });
  const base = { alive: true, hostile: true, isBeam: false, isTelegraph: false, alreadyDeflected: false, deflectGeneration: 0 };
  ok(c.w.canDeflectProjectile({ ...base, projectileKind: 'bossBullet' }).ok === true, `${q}: 通常弾は弾ける`);
  ok(c.w.canDeflectProjectile({ ...base, isBeam: true }).ok === false, `${q}: 光条は弾けない`);
  ok(c.w.canDeflectProjectile({ ...base, projectileKind: 'hazard' }).ok === false, `${q}: 地形は弾けない`);
}

T.finish();
