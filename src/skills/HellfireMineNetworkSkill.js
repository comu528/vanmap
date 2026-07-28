// 地獄火連鎖陣（火種地雷の進化・M6-D）: 線で接続された地雷網を設置。1つの起爆が近くの地雷へ時間差で連鎖起爆し、
// 爆発を受けた敵へ起爆刻印を付与。visited集合と networkId で二重起爆を防止し、深度/爆発数/毎フレーム予算で無限化を防ぐ。
import { EvolvedSkillBase } from './EvolvedSkillBase.js';
import { TEX } from '../config/game-config.js';

export class HellfireMineNetworkSkill extends EvolvedSkillBase {
  constructor(scene, id, level) {
    super(scene, id, level);
    this.mines = [];
    this._pending = [];        // 予約連鎖の TimerEvent
    this._networks = new Map(); // networkId -> {visited:Set, count:number}
    this._netId = 0;
    this._mineIdx = 0;
    this._destroyed = false;
  }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const d = this.evoDef; const p = this.scene.player;
    const cap = this.cap('maxMines', 40);
    const room = Math.max(0, cap - this.mines.length);
    const n = Math.min(d.projectileCount?.mines || 6, room);
    if (n <= 0) return;
    const areaMul = this.passiveAreaMult();
    const netId = ++this._netId;
    const batch = [];
    const explR = (d.area?.explosionRadius || 52) * areaMul;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + this.scene.rng() * 0.5;
      const dist = 30 + this.scene.rng() * 60;
      const x = p.x + Math.cos(ang) * dist, y = p.y + Math.sin(ang) * dist;
      const spr = this.scene.add.image(x, y, TEX.PARTICLE).setTint(0xff7043).setBlendMode(Phaser.BlendModes.ADD).setDepth(41).setScale(1.4).setAlpha(0.8);
      const mine = {
        idx: ++this._mineIdx, x, y, networkId: netId, links: [], exploded: false, sprite: spr,
        life: 4000 + this.scene.rng() * 1500, sense: explR * 0.6, explosionRadius: explR,
      };
      batch.push(mine); this.mines.push(mine);
    }
    // 近接地雷をリンク（同一ネットワーク・linkRadius 内）。順序は idx で決定論的。
    const linkR = (d.area?.linkRadius || 70) * areaMul; const lr2 = linkR * linkR;
    for (let a = 0; a < batch.length; a++) {
      for (let b = a + 1; b < batch.length; b++) {
        const dx = batch[a].x - batch[b].x, dy = batch[a].y - batch[b].y;
        if (dx * dx + dy * dy <= lr2) { batch[a].links.push(batch[b]); batch[b].links.push(batch[a]); }
      }
    }
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    const now = this.scene.time.now;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      if (m.exploded) { this.mines.splice(i, 1); continue; }
      m.life -= dt;
      if (m.sprite) m.sprite.setAlpha(0.5 + 0.3 * Math.sin(now * 0.01 + m.idx));
      let trigger = false;
      if (m.life <= 0) trigger = true;
      else if (this.scene.combat.nearestEnemy(m.x, m.y, m.sense)) trigger = true;
      if (trigger) this._explodeMine(m, 0);
    }
  }

  _network(id) {
    let s = this._networks.get(id);
    if (!s) { s = { visited: new Set(), count: 0 }; this._networks.set(id, s); }
    return s;
  }

  _explodeMine(m, depth) {
    if (!m || m.exploded) return;
    const net = this._network(m.networkId);
    if (net.visited.has(m)) return;
    if (net.count >= this.cap('maxMineNetworkExplosions', 24)) return;
    // 毎フレーム予算を超えたら次フレームへ持ち越し（同一フレームに全爆発を潰さない）。
    if (!this.scene.combat.frameBudget('mineExpl', 'maxMineExplosionsPerFrame')) { this._schedule(() => this._explodeMine(m, depth), 50); return; }
    m.exploded = true; net.visited.add(m); net.count++;
    if (m.sprite) { m.sprite.destroy(); m.sprite = null; }
    const d = this.evoDef;
    this.scene.effects.explosion(m.x, m.y, m.explosionRadius, 0xff7043);
    this.scene.combat.damageArea(m.x, m.y, m.explosionRadius, d.damage?.explosion || 40, this.id, { isExplosion: true, color: 0xff7043 });
    this._markEnemies(m);
    if (depth < this.cap('maxMineNetworkDepth', 6)) {
      const links = m.links.slice().sort((a, b) => a.idx - b.idx);
      for (const lm of links) {
        if (lm.exploded || net.visited.has(lm)) continue;
        this._schedule(() => this._explodeMine(lm, depth + 1), 80);
      }
    }
  }

  _markEnemies(m) {
    const d = this.evoDef; const now = this.scene.time.now;
    // markTargets = 1回の爆発で刻印する対象数の上限（総数は safetyCaps.maxMarks が上限）。
    let room = Math.min(d.projectileCount?.markTargets ?? 6, this.cap('maxMarks', 40) - this.scene.combat.markedCount());
    if (room <= 0) return;
    this.scene.combat.forEachEnemyInRadius(m.x, m.y, m.explosionRadius, (e) => {
      if (room <= 0 || e.isBoss) return;
      if (e._mark && now < e._mark.until) return;
      this.scene.combat.markEnemy(e, {
        skillId: this.id, hits: 0, hitsNeeded: d.projectileCount?.hitsNeeded || 2, until: now + 6000,
        detonateDamage: d.damage?.markBonus || 18, detonateRadius: m.explosionRadius,
      });
      room--;
    });
  }

  _schedule(fn, ms) {
    const ev = this.scene.time.delayedCall(ms, () => { if (this._destroyed || this.scene.gameOver) return; fn(); });
    this._pending.push(ev);
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s) this._cd = s.cdLeft || 0; }

  destroy() {
    this._destroyed = true;
    for (const ev of this._pending) if (ev) ev.remove(false);
    this._pending = [];
    for (const m of this.mines) if (m.sprite) m.sprite.destroy();
    this.mines = []; this._networks.clear();
  }
}
