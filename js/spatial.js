(function () {
  'use strict';

  var NUCLEON = (window.NUCLEON = window.NUCLEON || {});

  /**
   * Zero-allocation flat typed-array linked-list spatial hash for electrons.
   * Covers [-3600, 3600] with 48px cells (150 x 150 grid).
   */
  function SpatialGrid(maxEntities) {
    this.minCoord = -3600;
    this.cellSize = 48;
    this.invCellSize = 1 / 48;
    this.gridDim = 150;
    this.numCells = 150 * 150;
    this.head = new Int32Array(this.numCells);
    this.next = new Int32Array(maxEntities);
    this.head.fill(-1);
  }

  SpatialGrid.prototype.clear = function () {
    this.head.fill(-1);
  };

  SpatialGrid.prototype.insert = function (index, x, y) {
    var cx = ((x - this.minCoord) * this.invCellSize) | 0;
    var cy = ((y - this.minCoord) * this.invCellSize) | 0;
    if (cx < 0) cx = 0;
    else if (cx >= this.gridDim) cx = this.gridDim - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.gridDim) cy = this.gridDim - 1;

    var cell = cy * this.gridDim + cx;
    this.next[index] = this.head[cell];
    this.head[cell] = index;
  };

  SpatialGrid.prototype.getCellX = function (x) {
    var cx = ((x - this.minCoord) * this.invCellSize) | 0;
    if (cx < 0) return 0;
    if (cx >= this.gridDim) return this.gridDim - 1;
    return cx;
  };

  SpatialGrid.prototype.getCellY = function (y) {
    var cy = ((y - this.minCoord) * this.invCellSize) | 0;
    if (cy < 0) return 0;
    if (cy >= this.gridDim) return this.gridDim - 1;
    return cy;
  };

  /**
   * Invokes callback(otherIndex) for every entity in the 3x3 cell neighborhood.
   */
  SpatialGrid.prototype.query3x3 = function (x, y, callback) {
    var cx = this.getCellX(x);
    var cy = this.getCellY(y);
    var minX = cx > 0 ? cx - 1 : 0;
    var maxX = cx < this.gridDim - 1 ? cx + 1 : this.gridDim - 1;
    var minY = cy > 0 ? cy - 1 : 0;
    var maxY = cy < this.gridDim - 1 ? cy + 1 : this.gridDim - 1;

    var head = this.head;
    var next = this.next;
    var dim = this.gridDim;

    for (var gy = minY; gy <= maxY; gy++) {
      var rowOffset = gy * dim;
      for (var gx = minX; gx <= maxX; gx++) {
        var idx = head[rowOffset + gx];
        while (idx !== -1) {
          var nextIdx = next[idx];
          if (callback(idx) === true) {
            return;
          }
          idx = nextIdx;
        }
      }
    }
  };

  NUCLEON.SpatialGrid = SpatialGrid;
})();
