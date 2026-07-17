// 四方炎獄（M6-D）: 画面端の1〜4方向から炎波が中央へ進行。方向は scene.rng() で決定論的に選択。
// プレイヤーは無傷、敵へ接触でダメージ。座標は cameras.main.worldView（ワールド座標の可視領域）基準で、
// 640x360 でもブラウザ拡大時でも画面端に一致する。波スプライトは使い回し、越え切ったら破棄。
import { SkillBase } from './SkillBase.js';
import { TEX } from '../config/game-config.js';

export class FourSidedInfernoSkill extends SkillBase {
  constructor(scene, id, level) { super(scene, id, level); this.waves = []; this._dead = false; }
  canFire(ctx) { return ctx.hasEnemies; }

  fire() {
    const s = this.stats;
    const dirs = Math.min(s.directions || 1, 4);
    const edges = this._pickEdges(dirs); // 決定論的に方向を選択（全方向は directions>=4 のときのみ）
    edges.forEach((edge, k) => {
      this.scene.time.delayedCall(k * (s.staggerMs || 0), () => {
        if (this._dead || this.scene.gameOver) return;
        if (this.waves.length >= this.scene.combat.skillCap('maxScreenEdgeWaves', 4)) return;
        this._spawnWave(edge, s);
      });
    });
    this.scene.skills.recordExtra(this.id, 'wavesCreated', edges.length, 'add');
  }

  _pickEdges(n) {
    const arr = [0, 1, 2, 3]; // 0=上 1=右 2=下 3=左
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.scene.rng() * (i + 1));
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr.slice(0, n);
  }

  _spawnWave(edge, s) {
    const vv = this.scene.cameras.main.worldView; // ワールド座標の可視矩形
    const view = { x: vv.x, y: vv.y, w: vv.width, h: vv.height };
    const sprite = this.scene.add.image(0, 0, TEX.PARTICLE).setTint(0xff5722)
      .setBlendMode(Phaser.BlendModes.ADD).setDepth(45).setAlpha(0.4);
    this.waves.push({ edge, view, pos: 0, sprite, damage: s.damage, wallWidth: s.wallWidth || 30, waveSpeed: s.waveSpeed || 90, hitSet: new Set() });
  }

  update(dt, ctx) {
    super.update(dt, ctx);
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.pos += w.waveSpeed * dt / 1000;
      const span = (w.edge === 0 || w.edge === 2) ? w.view.h : w.view.w;
      this._draw(w);
      this._damage(w);
      this.scene.skills.recordExtra(this.id, 'maxEnemiesHitOneWave', w.hitSet.size, 'max');
      if (w.pos >= span) { if (w.sprite) w.sprite.destroy(); this.waves.splice(i, 1); }
    }
  }

  _line(w) {
    const v = w.view;
    if (w.edge === 0) return { cx: v.x + v.w / 2, cy: v.y + w.pos, horiz: true, len: v.w };
    if (w.edge === 2) return { cx: v.x + v.w / 2, cy: v.y + v.h - w.pos, horiz: true, len: v.w };
    if (w.edge === 3) return { cx: v.x + w.pos, cy: v.y + v.h / 2, horiz: false, len: v.h };
    return { cx: v.x + v.w - w.pos, cy: v.y + v.h / 2, horiz: false, len: v.h }; // edge 1 = 右
  }

  _draw(w) {
    const img = w.sprite; if (!img) return;
    const L = this._line(w);
    img.setPosition(L.cx, L.cy);
    if (L.horiz) { img.setRotation(0); img.setDisplaySize(w.view.w, w.wallWidth); }
    else { img.setRotation(0); img.setDisplaySize(w.wallWidth, w.view.h); }
  }

  _damage(w) {
    const v = w.view; const L = this._line(w);
    const half = w.wallWidth / 2 + 8; // 敵半径ぶんの余裕
    const R = Math.max(v.w, v.h);
    const cand = this.scene.combat.enemiesInRadius(L.cx, L.cy, R);
    for (const e of cand) {
      if (!e.alive || w.hitSet.has(e)) continue;
      if (L.horiz) {
        if (e.x < v.x || e.x > v.x + v.w) continue;
        if (Math.abs(e.y - L.cy) > half) continue;
      } else {
        if (e.y < v.y || e.y > v.y + v.h) continue;
        if (Math.abs(e.x - L.cx) > half) continue;
      }
      w.hitSet.add(e);
      this.scene.combat.dealDamage(e, w.damage, this.id, { from: { x: L.cx, y: L.cy }, knockback: 20, color: 0xff5722 });
    }
  }

  serializeState() { return { cdLeft: this._cd }; }
  restoreState(s) { if (s && typeof s.cdLeft === 'number') this._cd = s.cdLeft; }
  destroy() { this._dead = true; for (const w of this.waves) if (w.sprite) w.sprite.destroy(); this.waves = []; }
}
