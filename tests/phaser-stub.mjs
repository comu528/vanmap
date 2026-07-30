// M9-A.1: Node から production の Phaser 依存クラス（Projectile / Enemy / Player / ExperienceGem /
// BattleScene）をそのまま import して駆動するための **最小 Phaser スタブ**。Node.js 標準機能のみ。
//
// 原則:
//   - ゲームロジック（damage / 対象選択 / 状態 / 上限）は 1 行も再実装しない。
//     ここにあるのは Phaser が提供する「座標・速度・表示プロパティ・数学ユーティリティ」だけ。
//   - 物理は Arcade Physics 相当の**等速直線積分**（drag / gravity なし = production の設定と同じ）。
//     `stepPhysics(dt)` をハーネスが毎フレーム呼ぶ（Phaser では world.step が行う部分）。
//   - 表示系メソッドは値を保持するだけ。ただし scaleX / displayWidth は production の
//     当たり判定計算（checkCollisions）が読むので実値を持つ。

const bodies = new Set();

class Vector2 {
  constructor(x = 0, y = 0) { this.x = x; this.y = y; }
  set(x, y) { this.x = x; this.y = y === undefined ? x : y; return this; }
  setTo(x, y) { return this.set(x, y); }
  normalize() { const l = Math.hypot(this.x, this.y) || 1; this.x /= l; this.y /= l; return this; }
  scale(v) { this.x *= v; this.y *= v; return this; }
  get length() { return Math.hypot(this.x, this.y); }
}

class Body {
  constructor(owner) {
    this.gameObject = owner;
    this.enable = true;
    this.velocity = new Vector2(0, 0);
    this.width = 16; this.height = 16;
    bodies.add(this);
  }
  setSize(w, h) { this.width = w; this.height = h; return this; }
  setCircle(r) { this.width = r * 2; this.height = r * 2; return this; }
  stop() { this.velocity.set(0, 0); return this; }
  reset(x, y) { this.gameObject.x = x; this.gameObject.y = y; this.velocity.set(0, 0); return this; }
}

class GameObject {
  constructor(scene, x = 0, y = 0, texture = null) {
    this.scene = scene;
    this.x = x; this.y = y;
    this.texture = texture;
    this.width = 16; this.height = 16;
    this.scaleX = 1; this.scaleY = 1;
    this.alpha = 1; this.rotation = 0; this.angle = 0;
    this.depth = 0; this.visible = true; this.active = true;
    this.tint = 0xffffff; this.blendMode = 0; this.flipX = false;
    this.originX = 0.5; this.originY = 0.5;
    this.body = null;
    this._collideWorldBounds = false;
  }
  get displayWidth() { return this.width * this.scaleX; }
  set displayWidth(v) { this.scaleX = this.width ? v / this.width : 1; }
  get displayHeight() { return this.height * this.scaleY; }
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  setX(x) { this.x = x; return this; }
  setY(y) { this.y = y; return this; }
  setSize(w, h) { this.width = w; this.height = h; return this; }
  setTexture(t) { this.texture = t; return this; }
  setScale(x, y) { this.scaleX = x; this.scaleY = y === undefined ? x : y; return this; }
  setDisplaySize(w, h) { this.displayWidth = w; this.scaleY = this.height ? h / this.height : 1; return this; }
  setAlpha(a) { this.alpha = a; return this; }
  setRotation(r) { this.rotation = r; return this; }
  setAngle(a) { this.angle = a; return this; }
  setDepth(d) { this.depth = d; return this; }
  setVisible(v) { this.visible = v; return this; }
  setActive(a) { this.active = a; return this; }
  setTint(t) { this.tint = t; return this; }
  setTintFill(t) { this.tint = t; return this; }
  clearTint() { this.tint = 0xffffff; return this; }
  setBlendMode(m) { this.blendMode = m; return this; }
  setFlipX(f) { this.flipX = f; return this; }
  setOrigin(x, y) { this.originX = x; this.originY = y === undefined ? x : y; return this; }
  setScrollFactor() { return this; }
  setInteractive() { return this; }
  setStrokeStyle() { return this; }
  setText(t) { this.text = t; return this; }
  setCollideWorldBounds(v) { this._collideWorldBounds = !!v; return this; }
  setVelocity(x, y) { if (this.body) this.body.velocity.set(x, y === undefined ? x : y); return this; }
  setVelocityX(x) { if (this.body) this.body.velocity.x = x; return this; }
  setVelocityY(y) { if (this.body) this.body.velocity.y = y; return this; }
  on() { return this; } once() { return this; } off() { return this; } emit() { return this; }
  destroy() { if (this.body) bodies.delete(this.body); this.destroyed = true; }
  add() { return this; }
  fillStyle() { return this; } fillCircle() { return this; } fillRect() { return this; }
  lineStyle() { return this; } strokeRect() { return this; } strokeCircle() { return this; }
  beginPath() { return this; } moveTo() { return this; } lineTo() { return this; }
  closePath() { return this; } strokePath() { return this; } fillPath() { return this; }
  slice() { return this; } arc() { return this; } clear() { return this; } generateTexture() { return this; }
}

class Sprite extends GameObject {}
class ArcadeSprite extends Sprite {}

const AngleWrap = (a) => {
  let x = a;
  while (x > Math.PI) x -= Math.PI * 2;
  while (x < -Math.PI) x += Math.PI * 2;
  return x;
};

export const PhaserStub = {
  BlendModes: { NORMAL: 0, ADD: 1, MULTIPLY: 2, SCREEN: 3 },
  Math: {
    Vector2,
    // 決定論のため中央値を返す（production のゲームプレイ判定は SeededRandom を使い、
    // Phaser.Math.Between は演出にしか使われない）。
    Between: (a, b) => a + Math.floor((b - a + 1) / 2),
    FloatBetween: (a, b) => (a + b) / 2,
    Clamp: (v, lo, hi) => (v < lo ? lo : (v > hi ? hi : v)),
    Linear: (a, b, t) => a + (b - a) * t,
    Distance: { Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) },
    Angle: { Between: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1), Wrap: AngleWrap },
    DegToRad: (d) => (d * Math.PI) / 180,
    RadToDeg: (r) => (r * 180) / Math.PI,
  },
  Geom: {
    Circle: class { constructor(x, y, r) { this.x = x; this.y = y; this.radius = r; } },
    Rectangle: class { constructor(x, y, w, h) { this.x = x; this.y = y; this.width = w; this.height = h; } },
  },
  Physics: { Arcade: { Sprite: ArcadeSprite, Group: class {} } },
  GameObjects: { Sprite, Image: Sprite, Container: GameObject, Graphics: GameObject, Text: GameObject },
  Scene: class Scene { constructor(key) { this.key = key; } },
  Input: { Keyboard: { JustDown: () => false, JustUp: () => false, KeyCodes: {} } },
  Utils: { Array: { GetRandom: (a) => a[0] } },
};

export function installPhaser() {
  globalThis.Phaser = globalThis.Phaser || PhaserStub;
  globalThis.window = globalThis.window || {};
  return globalThis.Phaser;
}

// Arcade Physics 相当の等速直線積分。world 境界クランプは
// setCollideWorldBounds(true) のオブジェクト（= Player）だけに掛かる。
export function stepPhysics(dt, worldW, worldH) {
  const s = dt / 1000;
  for (const b of bodies) {
    if (!b.enable) continue;
    const o = b.gameObject;
    if (!o || o.destroyed) continue;
    o.x += b.velocity.x * s;
    o.y += b.velocity.y * s;
    if (o._collideWorldBounds) {
      const hw = o.displayWidth / 2, hh = o.displayHeight / 2;
      if (o.x < hw) { o.x = hw; b.velocity.x = 0; }
      if (o.y < hh) { o.y = hh; b.velocity.y = 0; }
      if (o.x > worldW - hw) { o.x = worldW - hw; b.velocity.x = 0; }
      if (o.y > worldH - hh) { o.y = worldH - hh; b.velocity.y = 0; }
    }
  }
}

export function resetPhysics() { bodies.clear(); }
export function bodyCount() { return bodies.size; }

export function makeAddApi(scene) {
  const mk = (x = 0, y = 0) => new GameObject(scene, x, y);
  return {
    existing: (o) => o,
    image: (x, y) => mk(x, y), sprite: (x, y) => mk(x, y),
    rectangle: (x, y) => mk(x, y), circle: (x, y) => mk(x, y), ellipse: (x, y) => mk(x, y),
    graphics: () => mk(), text: (x, y) => mk(x, y), particles: () => mk(),
    tileSprite: (x, y) => mk(x, y),
    container: (x, y) => {
      const c = mk(x, y); c.list = [];
      c.add = (o) => { if (Array.isArray(o)) c.list.push(...o); else c.list.push(o); return c; };
      c.removeAll = () => { c.list.length = 0; return c; };
      return c;
    },
    group: () => ({ add: () => {}, children: { entries: [] } }),
  };
}

export function makePhysicsApi() {
  return {
    world: { setBounds: () => {}, pause: () => {}, resume: () => {}, enable: () => {}, disable: () => {} },
    add: {
      existing: (o) => { if (!o.body) o.body = new Body(o); return o; },
      group: () => ({ add: () => {} }),
      overlap: () => {}, collider: () => {},
    },
  };
}

export { GameObject, Body, Vector2 };
