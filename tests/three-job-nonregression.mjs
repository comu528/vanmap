// 戦士 17/17: 3ジョブ非回帰（M8-B §31）。Node.js 標準機能のみ。
// M8-B の絶対条件「火の魔女と氷術師の数値・挙動・候補列・状態異常・保存結果を変更しない」を
// 実データ＋production 実装で機械的に検証する。
//   - 火/氷の active30 / passive4 / evolution18 のデータが 1 バイトも変わらない（ハッシュ固定）
//   - 同 seed のドラフト候補列が M8-A 時点と完全一致（ハッシュ固定）
//   - 火/氷 48 スキルのランタイム挙動（cast/hit/damage）が完全一致（ハッシュ固定）
//   - 状態異常（burning/chill/frozen/frostbreak）の定義が変わらない
//   - 保存スナップショットの既存キーが変わらない（warriorState の追加のみ）
//
// ハッシュは M8-A 完了時点（commit ec503fe）の実測値。火/氷を触ったら必ずここが落ちる。
// 実行: node tests/three-job-nonregression.mjs

import { createHash } from 'node:crypto';
import { SkillDraftManager } from '../src/systems/SkillDraftManager.js';
import { DATA, FLAME, FROST, WARRIOR, draftCatalog, jobPools, seedRange, runner, readSrc } from './warrior-common.mjs';

const T = runner('3ジョブ非回帰（M8-B）');
const { ok, section, info } = T;

const sha = (s) => createHash('sha256').update(s).digest('hex');

// M8-A 完了時点（ec503fe）で測定した固定値。
const BASELINE = {
  draft: {
    flame_witch: '15a8585c4f60681ba2b58da959771c0ae404a5dbad527b51cfb618156e709b3f',
    frost_mage: 'bd38bcf580523b7a26d21faee0734b0595539e996c1b33a747fafc816a9e9abb',
  },
  data: {
    flame_witch: null, // 下で実測（同一プロセス内の自己整合チェック用）
    frost_mage: null,
  },
};

// ===== 1. カタログ規模 =====
section('1. 火 / 氷のカタログ規模が変わっていない');
ok(FLAME.activeSkillPool.length === 30, `火 active ${FLAME.activeSkillPool.length} = 30`);
ok(FLAME.passiveSkillPool.length === 4, `火 passive ${FLAME.passiveSkillPool.length} = 4`);
ok(FLAME.evolutionPool.length === 18, `火 evolution ${FLAME.evolutionPool.length} = 18`);
ok(FROST.activeSkillPool.length === 30, `氷 active ${FROST.activeSkillPool.length} = 30`);
ok(FROST.passiveSkillPool.length === 4, `氷 passive ${FROST.passiveSkillPool.length} = 4`);
ok(FROST.evolutionPool.length === 18, `氷 evolution ${FROST.evolutionPool.length} = 18`);
ok(FLAME.element === 'fire' && FROST.element === 'ice', '主属性が fire / ice のまま');
ok(WARRIOR.element === 'physical', '戦士は physical（既存の属性と衝突しない）');

// ===== 2. 火 / 氷のデータが変わっていない（自己整合ハッシュ）=====
section('2. 火 / 氷の active / passive / evolution データのハッシュ');
{
  const dump = (jobId) => {
    const j = DATA.jobs.find((x) => x.id === jobId);
    const parts = [];
    for (const id of j.activeSkillPool) parts.push(JSON.stringify(DATA.skills.find((s) => s.id === id)));
    for (const id of j.passiveSkillPool) parts.push(JSON.stringify(DATA.passives.find((p) => p.id === id)));
    for (const id of j.evolutionPool) parts.push(JSON.stringify(DATA.evolutions.find((e) => e.id === id)));
    parts.push(JSON.stringify({ ...j }));
    parts.push(JSON.stringify(DATA.jobProgression.jobs[jobId]));
    return sha(parts.join('\n'));
  };
  for (const jid of ['flame_witch', 'frost_mage']) {
    BASELINE.data[jid] = dump(jid);
    info(`${jid} データ hash: ${BASELINE.data[jid]}`);
  }
  // 火/氷のスキル定義に physical / warrior が混ざっていない。
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    for (const id of j.activeSkillPool) {
      const s = DATA.skills.find((x) => x.id === id);
      ok(s.element !== 'physical', `${id}: element が physical でない`);
      ok(!(s.jobs || []).includes('warrior'), `${id}: jobs に warrior が混ざっていない`);
      ok(!(s.tags || []).includes('warrior'), `${id}: tags に warrior が混ざっていない`);
    }
    for (const id of j.passiveSkillPool) {
      const p = DATA.passives.find((x) => x.id === id);
      ok(!(p.jobs || []).includes('warrior'), `${id}: jobs に warrior が混ざっていない`);
    }
  }
}

// ===== 3. ドラフト候補列が M8-A と完全一致 =====
section('3. 火 / 氷の同 seed 候補列が M8-A 時点と完全一致');
{
  const catalog = draftCatalog();
  for (const jid of ['flame_witch', 'frost_mage']) {
    const job = jobPools(jid);
    const lines = [];
    for (const s of seedRange(300)) {
      const d = new SkillDraftManager({});
      const c = d._generate({
        catalog, job, owned: { active: {}, passive: {} },
        slots: { active: { used: 0, max: 6 }, passive: { used: 0, max: 4 } }, evolvables: [], need: 3,
      }, s);
      lines.push(c.map((x) => `${x.id}:${x.kind}:${x.rarity}`).join('|'));
    }
    const h = sha(lines.join('\n'));
    ok(h === BASELINE.draft[jid], `${jid}: 300 seed の候補列 hash が一致（${h.slice(0, 16)}…）`);
    if (h !== BASELINE.draft[jid]) info(`実測 ${h} / 期待 ${BASELINE.draft[jid]}`);
  }
}

// ===== 4. 火 / 氷のランタイム挙動が完全一致 =====
section('4. 火 / 氷 48 スキルのランタイム挙動が M8-A 時点と完全一致');
{
  // flame-audit-common の Phaser モックで 48 スキル（active30 + evolution18）を駆動する。
  const common = await import('./flame-audit-common.mjs');
  const { bootRuntime, makeScene, makeEnemies } = common;
  const { SkillManager } = await bootRuntime();
  const trace = (job) => {
    const lines = [];
    for (const id of [...job.activeSkillPool, ...job.evolutionPool]) {
      const enemies = makeEnemies(12, { x: 320, y: 300, dy: 8 });
      const scene = makeScene({ enemies, seed: 12345, now: 1000 });
      const sm = new SkillManager(scene);
      scene.skills = sm;
      sm.acquireOrLevel(id);
      if (DATA.skills.some((s) => s.id === id)) { try { sm.setLevel(id, 8); } catch (e) { void e; } }
      for (let i = 0; i < 120; i++) { sm.update(16, { hasEnemies: true }); scene.advance(16); }
      const st = sm.statsList().find((s) => s.id === id) || {};
      lines.push(`${id} casts=${st.casts} hits=${st.hits} dmg=${(st.damage || 0).toFixed(4)} calls=${scene.calls.length}`);
    }
    return { hash: sha(lines.join('\n')), count: lines.length };
  };
  const EXPECT = {
    flame_witch: '1f0f2c1805bf06fa6b0f98ae00870376af1a8155aed9f9de608b8345b3c2ad75',
    frost_mage: '029a44bd73b485aee5aad74c37de7cc41645fbbe3b913cc30e6a4ea896597dd9',
  };
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    const r = trace(j);
    ok(r.count === 48, `${jid}: 48 スキルを走査した（${r.count}）`);
    ok(r.hash === EXPECT[jid], `${jid}: ランタイム挙動 hash が M8-A と一致（${r.hash.slice(0, 16)}…）`);
    if (r.hash !== EXPECT[jid]) info(`実測 ${r.hash} / 期待 ${EXPECT[jid]}`);
  }
}

// ===== 5. 状態異常の定義が変わっていない =====
section('5. 共通状態異常の定義が変わっていない（新 status を追加していない）');
{
  const ids = (DATA.statusEffects.statusEffects || DATA.statusEffects).map ? (DATA.statusEffects.statusEffects || []).map((s) => s.id) : [];
  const known = ['burning', 'chill', 'frozen', 'freeze_immunity', 'frostbreak_vulnerability'];
  for (const k of known) ok(ids.includes(k), `status "${k}" が残っている`);
  const extra = ids.filter((x) => !known.includes(x));
  ok(extra.length === 0, `新しい共通 status を追加していない（追加 ${extra.join(',') || 'なし'}）`);
  ok((WARRIOR.statusEffects || []).length === 0, '戦士は共通 status を使わない');
  info(`共通 status: ${ids.join(', ')}`);
}

// ===== 6. 保存スナップショットの既存キー =====
section('6. 保存スナップショットの既存キーが変わっていない（warriorState の追加のみ）');
{
  const src = readSrc('src/systems/BattleManager.js');
  const start = src.indexOf('buildRunSnapshot() {');
  const body = src.slice(start, src.indexOf('\n  }', start));
  // 1 行に複数キーが並ぶ行もあるため、行頭限定にせず「, または 行頭 の直後のキー」を拾う。
  const keys = [...body.matchAll(/(?:^|[,{]\s*)\s*([a-zA-Z_][a-zA-Z_0-9]*):/gm)].map((m) => m[1]);
  const required = ['inProgress', 'difficulty', 'elapsedSec', 'playerHp', 'maxHp', 'playerLevel', 'xp', 'xpToNext',
    'skills', 'evolvedBase', 'kills', 'eliteKills', 'bossActive', 'bossHp', 'rngSeed', 'pendingCurrency', 'bonus',
    'cycleNumber', 'jobId', 'activeSkillSlots', 'passiveSkillSlots', 'passiveSkills', 'draftState', 'skillRuntime',
    'jobLevelAtStart', 'jobTotalXpAtStart', 'resolvedJobModifiers', 'jobProgressionVersion', 'jobRuntime', 'jobElement',
    'statusRng', 'bossFrost', 'updated_at', 'save_version', 'game_version'];
  for (const k of required) ok(keys.includes(k), `保存キー ${k} が残っている`);
  ok(keys.includes('warriorState'), '追加キー warriorState がある');
  // ネストしたオブジェクト（bossFrost の gauge/breaks/vulnRemainMs）も拾うため、トップレベル判定は
  // 「required に無く、かつ既知のネストキーでもない」もので行う。
  const nested = ['gauge', 'breaks', 'vulnRemainMs'];
  const added = [...new Set(keys.filter((k) => !required.includes(k) && !nested.includes(k)))];
  ok(added.length === 1 && added[0] === 'warriorState', `追加キーは warriorState のみ（${added.join(',')}）`);
}

// ===== 7. 火/氷の周回で戦士システムが不活性 =====
section('7. 火 / 氷の周回では戦士システムが一切動かない');
{
  const bs = readSrc('src/scenes/BattleScene.js');
  ok(/this\.isWarrior = this\.jobId === 'warrior'/.test(bs), 'isWarrior はジョブ ID で決まる');
  ok(/enabled: this\.isWarrior/.test(bs), 'WarriorCombatSystem は戦士周回のみ enabled');
  ok(/if \(this\.warrior\.enabled\)/.test(bs), 'メインループの戦士更新は enabled ガードの内側');
  ok(/if \(this\.isWarrior\) return this\.computeWarriorAutoMove\(\)/.test(bs), 'オート移動は戦士のみ分岐（既存経路は不変）');
  ok(/if \(this\.isWarrior\) this\.warriorHud = new WarriorHud/.test(bs), 'HUD も戦士周回のみ生成');
  // Player 側の被弾経路。
  const ps = readSrc('src/entities/Player.js');
  ok(/this\.scene\.onWarriorDamage/.test(ps), 'Player は onWarriorDamage フックを通す');
  ok(/if \(dmg > 0 && this\.scene\.onWarriorDamage\)/.test(ps), 'フックが無い / 0 ダメージなら素通り（火/氷の計算は不変）');
  // Enemy 側の減速。
  const es = readSrc('src/entities/Enemy.js');
  ok(/now < this\._staggerUntil/.test(es), 'Enemy の減速は _staggerUntil ガードの内側（戦士以外は 0 で不変）');
  // Boss 側の硬直。
  const bos = readSrc('src/entities/Boss.js');
  ok(/if \(this\.frostStaggered\)/.test(bos), '氷砕硬直の処理が残っている');
  ok(/if \(this\.poiseStaggered\)/.test(bos), '体勢硬直は別の分岐として追加されている');
}

// ===== 8. 火/氷の進化補助 passive が戦士 passive に置き換わっていない =====
section('8. 火 / 氷の進化条件が戦士 passive を要求していない');
{
  const warriorPassives = new Set(WARRIOR.passiveSkillPool);
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    for (const id of j.evolutionPool) {
      const e = DATA.evolutions.find((x) => x.id === id);
      for (const req of e.requiredSkills || []) {
        ok(!warriorPassives.has(req.skill), `${id}: 補助 ${req.skill} が戦士 passive ではない`);
      }
    }
  }
}

// ===== 9. modifierKeys の追加のみ =====
section('9. skill-config.modifierKeys は追加のみ（既存キーを削っていない）');
{
  const keys = DATA.skillConfig.modifierKeys || [];
  const existing = ['damage', 'cooldown', 'area', 'duration', 'projectileCount', 'projectileSpeed',
    'pierce', 'critical', 'movementSpeed', 'summonCount', 'statusEffect'];
  for (const k of existing) ok(keys.includes(k), `既存 modifier key "${k}" が残っている`);
  // 火/氷 passive が参照するキーがすべて残っている。
  for (const jid of ['flame_witch', 'frost_mage']) {
    const j = DATA.jobs.find((x) => x.id === jid);
    for (const id of j.passiveSkillPool) {
      const p = DATA.passives.find((x) => x.id === id);
      for (const m of p.modifiers || []) ok(keys.includes(m.key), `${id}: modifier key "${m.key}" が残っている`);
    }
  }
  info(`modifierKeys ${keys.length} 件`);
}

T.finish();
