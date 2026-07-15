// 空間グリッド（Spatial Hash Grid, Milestone 5-A）。
// 大量の敵に対する近傍検索を O(敵数×弾数) の総当たりから、周辺セルのみの走査へ置き換える。
//
// 設計方針:
//   - Phaser や DOM に一切依存しない純粋な JS（Node からも import できる＝決定論テスト可能）。
//   - グリッドは「候補の絞り込み」だけを担当する。最終的な当たり判定（円・矩形・距離）は
//     呼び出し側が候補に対して厳密に行う。同じセルにいるだけで命中扱いにはしない。
//   - 登録オブジェクトは { x, y } を持てばよい。任意で { alive, active } を見て
//     無効化・死亡済みを除外する。ボス/エリート判定は filter コールバックで行う。
//   - 更新は差分方式: 別セルへ移動したオブジェクトだけ所属セルを付け替える（毎フレーム全消去しない）。
//
// オブジェクトには内部フィールド `_gridCell`（現在のセル index）を付与する。
// プールへ戻す際に remove() を呼べば残留登録は起きない。

export class SpatialGrid {
  // cellSize: セル一辺(px), worldW/worldH: ワールド寸法(px)。
  constructor(cellSize, worldW, worldH) {
    this.setBounds(cellSize, worldW, worldH);
  }

  setBounds(cellSize, worldW, worldH) {
    this.cellSize = Math.max(1, cellSize | 0);
    this.worldW = worldW;
    this.worldH = worldH;
    this.cols = Math.max(1, Math.ceil(worldW / this.cellSize));
    this.rows = Math.max(1, Math.ceil(worldH / this.cellSize));
    this.cells = new Map();   // cellIndex -> Set(obj)
    this._count = 0;
  }

  _cx(x) {
    const c = Math.floor(x / this.cellSize);
    return c < 0 ? 0 : (c >= this.cols ? this.cols - 1 : c);
  }
  _cy(y) {
    const c = Math.floor(y / this.cellSize);
    return c < 0 ? 0 : (c >= this.rows ? this.rows - 1 : c);
  }
  _index(x, y) { return this._cy(y) * this.cols + this._cx(x); }

  _bucket(idx) {
    let b = this.cells.get(idx);
    if (!b) { b = new Set(); this.cells.set(idx, b); }
    return b;
  }

  // 登録。既に登録済みなら update と同義に振る舞う。
  insert(obj) {
    const idx = this._index(obj.x, obj.y);
    if (obj._gridCell != null) {
      if (obj._gridCell === idx) return;
      this._removeFromCell(obj);
    }
    this._bucket(idx).add(obj);
    obj._gridCell = idx;
    this._count++;
  }

  // 位置更新。所属セルが変わったときだけ付け替える（差分更新）。
  update(obj) {
    if (obj._gridCell == null) { this.insert(obj); return; }
    const idx = this._index(obj.x, obj.y);
    if (idx === obj._gridCell) return;
    this._removeFromCell(obj);
    this._bucket(idx).add(obj);
    obj._gridCell = idx;
    this._count++;
  }

  _removeFromCell(obj) {
    const b = this.cells.get(obj._gridCell);
    if (b) {
      b.delete(obj);
      if (b.size === 0) this.cells.delete(obj._gridCell);
    }
    obj._gridCell = null;
    this._count--;
  }

  // 削除。プールへ戻す際・死亡時に必ず呼ぶ。
  remove(obj) {
    if (obj._gridCell == null) return;
    this._removeFromCell(obj);
  }

  // 全消去（Scene 終了・再構築時）。登録印もクリアする。
  clear() {
    for (const b of this.cells.values()) {
      for (const o of b) o._gridCell = null;
    }
    this.cells.clear();
    this._count = 0;
  }

  // ---- 検索（候補を返すだけ。厳密判定は呼び出し側） ----

  // 有効判定: 明示的に alive===false / active===false のものは除外。
  static _isLive(o) {
    return o.alive !== false && o.active !== false;
  }

  // 円（の外接矩形）に重なるセルの候補を out に集める。重複なし（各オブジェクトは1セル所属）。
  // filter: 任意の絞り込み（例: (o) => o.isElite）。examined へ走査数を返す。
  queryCircle(x, y, radius, filter = null, out = []) {
    return this.queryAABB(x, y, radius * 2, radius * 2, filter, out);
  }

  // 中心 (x,y)、全幅 width・全高 height の矩形に重なるセルの候補を集める。
  queryAABB(x, y, width, height, filter = null, out = []) {
    const hw = width / 2, hh = height / 2;
    const minCx = this._cx(x - hw), maxCx = this._cx(x + hw);
    const minCy = this._cy(y - hh), maxCy = this._cy(y + hh);
    for (let cy = minCy; cy <= maxCy; cy++) {
      const base = cy * this.cols;
      for (let cx = minCx; cx <= maxCx; cx++) {
        const b = this.cells.get(base + cx);
        if (!b) continue;
        for (const o of b) {
          if (!SpatialGrid._isLive(o)) continue;
          if (filter && !filter(o)) continue;
          out.push(o);
        }
      }
    }
    return out;
  }

  // 指定位置から maxDistance 以内で最も近い対象を厳密距離で返す（候補内で確定）。
  // 距離が同じ場合は最初に見つかったものを優先（呼び出し側で必要なら安定化する）。
  findNearest(x, y, maxDistance, filter = null) {
    const cand = this.queryCircle(x, y, maxDistance, filter);
    let best = null, bestD2 = maxDistance * maxDistance;
    for (const o of cand) {
      const dx = o.x - x, dy = o.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= bestD2) { bestD2 = d2; best = o; }
    }
    return best;
  }

  get size() { return this._count; }
  get usedCells() { return this.cells.size; }
}
