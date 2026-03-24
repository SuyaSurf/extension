/**
 * SuyaNet — Raw Matrix Library
 * Zero dependencies. Every operation is hand-written.
 * Backed by flat Float64Array for performance.
 */

class Matrix {
  /**
   * @param {number} rows
   * @param {number} cols
   * @param {Float64Array|number[]} [data] - flat row-major data
   */
  constructor(rows, cols, data) {
    this.rows = rows;
    this.cols = cols;
    if (data) {
      this.data = data instanceof Float64Array ? data : new Float64Array(data);
    } else {
      this.data = new Float64Array(rows * cols);
    }
  }

  // ── Accessors ──

  get(r, c) {
    return this.data[r * this.cols + c];
  }

  set(r, c, val) {
    this.data[r * this.cols + c] = val;
  }

  get shape() {
    return [this.rows, this.cols];
  }

  clone() {
    return new Matrix(this.rows, this.cols, new Float64Array(this.data));
  }

  // ── Factory Methods ──

  static zeros(rows, cols) {
    return new Matrix(rows, cols);
  }

  static ones(rows, cols) {
    const m = new Matrix(rows, cols);
    m.data.fill(1);
    return m;
  }

  static fromArray(arr2d) {
    const rows = arr2d.length;
    const cols = arr2d[0].length;
    const data = new Float64Array(rows * cols);
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        data[i * cols + j] = arr2d[i][j];
      }
    }
    return new Matrix(rows, cols, data);
  }

  toArray() {
    const result = [];
    for (let i = 0; i < this.rows; i++) {
      const row = [];
      for (let j = 0; j < this.cols; j++) {
        row.push(this.get(i, j));
      }
      result.push(row);
    }
    return result;
  }

  // ── Random Initialization ──

  /** Box-Muller transform — no library needed */
  static _boxMuller() {
    let u1 = 0, u2 = 0;
    while (u1 === 0) u1 = Math.random();
    while (u2 === 0) u2 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  /** He initialization: N(0, sqrt(2/fan_in)) — best for ReLU */
  static randomHe(rows, cols, fanIn) {
    const std = Math.sqrt(2.0 / fanIn);
    const m = new Matrix(rows, cols);
    for (let i = 0; i < m.data.length; i++) {
      m.data[i] = Matrix._boxMuller() * std;
    }
    return m;
  }

  /** Xavier initialization: N(0, sqrt(1/fan_in)) — best for sigmoid/tanh */
  static randomXavier(rows, cols, fanIn) {
    const std = Math.sqrt(1.0 / fanIn);
    const m = new Matrix(rows, cols);
    for (let i = 0; i < m.data.length; i++) {
      m.data[i] = Matrix._boxMuller() * std;
    }
    return m;
  }

  /** Uniform random in [lo, hi) */
  static randomUniform(rows, cols, lo = -1, hi = 1) {
    const m = new Matrix(rows, cols);
    const range = hi - lo;
    for (let i = 0; i < m.data.length; i++) {
      m.data[i] = Math.random() * range + lo;
    }
    return m;
  }

  // ── Core Operations ──

  /** Matrix multiply: C = A · B, O(n³) */
  static multiply(a, b) {
    if (a.cols !== b.rows) {
      throw new Error(`MatMul shape mismatch: (${a.rows},${a.cols}) x (${b.rows},${b.cols})`);
    }
    const result = new Matrix(a.rows, b.cols);
    for (let i = 0; i < a.rows; i++) {
      for (let k = 0; k < a.cols; k++) {
        const aik = a.data[i * a.cols + k];
        if (aik === 0) continue; // skip zeros
        for (let j = 0; j < b.cols; j++) {
          result.data[i * b.cols + j] += aik * b.data[k * b.cols + j];
        }
      }
    }
    return result;
  }

  /** Element-wise addition: C = A + B */
  static add(a, b) {
    if (a.rows !== b.rows || a.cols !== b.cols) {
      // Broadcasting: if b is (rows, 1), broadcast across columns
      if (b.rows === a.rows && b.cols === 1) {
        const result = a.clone();
        for (let i = 0; i < a.rows; i++) {
          const bval = b.data[i];
          for (let j = 0; j < a.cols; j++) {
            result.data[i * a.cols + j] += bval;
          }
        }
        return result;
      }
      // Broadcasting: if b is (1, cols), broadcast across rows
      if (b.rows === 1 && b.cols === a.cols) {
        const result = a.clone();
        for (let i = 0; i < a.rows; i++) {
          for (let j = 0; j < a.cols; j++) {
            result.data[i * a.cols + j] += b.data[j];
          }
        }
        return result;
      }
      throw new Error(`Add shape mismatch: (${a.rows},${a.cols}) + (${b.rows},${b.cols})`);
    }
    const result = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.data.length; i++) {
      result.data[i] = a.data[i] + b.data[i];
    }
    return result;
  }

  /** Element-wise subtraction: C = A - B */
  static subtract(a, b) {
    if (a.rows !== b.rows || a.cols !== b.cols) {
      throw new Error(`Sub shape mismatch: (${a.rows},${a.cols}) - (${b.rows},${b.cols})`);
    }
    const result = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.data.length; i++) {
      result.data[i] = a.data[i] - b.data[i];
    }
    return result;
  }

  /** Hadamard (element-wise) product: C = A ⊙ B */
  static hadamard(a, b) {
    if (a.rows !== b.rows || a.cols !== b.cols) {
      throw new Error(`Hadamard shape mismatch: (${a.rows},${a.cols}) ⊙ (${b.rows},${b.cols})`);
    }
    const result = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.data.length; i++) {
      result.data[i] = a.data[i] * b.data[i];
    }
    return result;
  }

  /** Scalar multiplication: C = s * A */
  static scale(a, scalar) {
    const result = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.data.length; i++) {
      result.data[i] = a.data[i] * scalar;
    }
    return result;
  }

  /** Transpose: Aᵀ[j][i] = A[i][j] */
  static transpose(a) {
    const result = new Matrix(a.cols, a.rows);
    for (let i = 0; i < a.rows; i++) {
      for (let j = 0; j < a.cols; j++) {
        result.data[j * a.rows + i] = a.data[i * a.cols + j];
      }
    }
    return result;
  }

  /** Apply function to every element */
  static map(a, fn) {
    const result = new Matrix(a.rows, a.cols);
    for (let i = 0; i < a.data.length; i++) {
      result.data[i] = fn(a.data[i], i);
    }
    return result;
  }

  /** Sum all elements */
  sum() {
    let s = 0;
    for (let i = 0; i < this.data.length; i++) s += this.data[i];
    return s;
  }

  /** Sum along axis. axis=0 → sum columns (result: 1×cols), axis=1 → sum rows (result: rows×1) */
  sumAxis(axis) {
    if (axis === 0) {
      const result = Matrix.zeros(1, this.cols);
      for (let i = 0; i < this.rows; i++) {
        for (let j = 0; j < this.cols; j++) {
          result.data[j] += this.data[i * this.cols + j];
        }
      }
      return result;
    } else {
      const result = Matrix.zeros(this.rows, 1);
      for (let i = 0; i < this.rows; i++) {
        let s = 0;
        for (let j = 0; j < this.cols; j++) {
          s += this.data[i * this.cols + j];
        }
        result.data[i] = s;
      }
      return result;
    }
  }

  /** Flat inner product (for gradient checking) */
  static dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.data.length; i++) {
      s += a.data[i] * b.data[i];
    }
    return s;
  }

  /** Max value */
  max() {
    let m = -Infinity;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] > m) m = this.data[i];
    }
    return m;
  }

  /** Argmax per column (for predictions) — returns array of row indices */
  argmaxCol() {
    const indices = new Array(this.cols);
    for (let j = 0; j < this.cols; j++) {
      let maxVal = -Infinity;
      let maxIdx = 0;
      for (let i = 0; i < this.rows; i++) {
        const v = this.data[i * this.cols + j];
        if (v > maxVal) { maxVal = v; maxIdx = i; }
      }
      indices[j] = maxIdx;
    }
    return indices;
  }

  /** Pretty print */
  print(label = '') {
    if (label) console.log(`── ${label} (${this.rows}×${this.cols}) ──`);
    const arr = this.toArray();
    for (const row of arr) {
      console.log('  [' + row.map(v => v.toFixed(6).padStart(11)).join(', ') + ' ]');
    }
  }
}

module.exports = { Matrix };
