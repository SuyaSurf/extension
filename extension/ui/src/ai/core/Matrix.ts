// ============================================================
// SuyaSurf AI Engine — Raw Matrix Math
// Pure JavaScript implementation, no external libraries.
// All operations allocate new matrices (immutable style).
// ============================================================

import type { MatrixData, MatrixShape } from '../types';

export class Matrix {
  readonly data: MatrixData;
  readonly rows: number;
  readonly cols: number;

  constructor(data: MatrixData) {
    this.rows = data.length;
    this.cols = data[0]?.length ?? 0;
    this.data = data;
  }

  get shape(): MatrixShape {
    return { rows: this.rows, cols: this.cols };
  }

  // ── Constructors ────────────────────────────────────────

  static zeros(rows: number, cols: number): Matrix {
    return new Matrix(
      Array.from({ length: rows }, () => new Array(cols).fill(0))
    );
  }

  static ones(rows: number, cols: number): Matrix {
    return new Matrix(
      Array.from({ length: rows }, () => new Array(cols).fill(1))
    );
  }

  /** Xavier/Glorot uniform initialisation: [-limit, +limit] */
  static random(rows: number, cols: number, scale?: number): Matrix {
    const limit = scale ?? Math.sqrt(6 / (rows + cols));
    return new Matrix(
      Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => (Math.random() * 2 - 1) * limit)
      )
    );
  }

  static identity(n: number): Matrix {
    return new Matrix(
      Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (__, j) => (i === j ? 1 : 0))
      )
    );
  }

  static fromArray(arr: number[], asColumn = true): Matrix {
    return asColumn
      ? new Matrix(arr.map((v) => [v]))
      : new Matrix([arr]);
  }

  static fromFlat(flat: number[], rows: number, cols: number): Matrix {
    if (flat.length !== rows * cols) {
      throw new Error(`fromFlat: expected ${rows * cols} elements, got ${flat.length}`);
    }
    const data: MatrixData = [];
    for (let r = 0; r < rows; r++) {
      data.push(flat.slice(r * cols, r * cols + cols));
    }
    return new Matrix(data);
  }

  // ── Accessors ───────────────────────────────────────────

  get(row: number, col: number): number {
    return this.data[row][col];
  }

  toArray(): number[] {
    return this.data.flat();
  }

  toColumnVector(): number[] {
    return this.data.map((row) => row[0]);
  }

  clone(): Matrix {
    return new Matrix(this.data.map((row) => [...row]));
  }

  // ── Core Arithmetic ─────────────────────────────────────

  /** Element-wise addition. Matrices must have the same shape. */
  add(other: Matrix): Matrix {
    this.assertSameShape(other, 'add');
    return new Matrix(
      this.data.map((row, r) => row.map((v, c) => v + other.data[r][c]))
    );
  }

  /** Element-wise subtraction. */
  sub(other: Matrix): Matrix {
    this.assertSameShape(other, 'sub');
    return new Matrix(
      this.data.map((row, r) => row.map((v, c) => v - other.data[r][c]))
    );
  }

  /** Element-wise (Hadamard) product. */
  hadamard(other: Matrix): Matrix {
    this.assertSameShape(other, 'hadamard');
    return new Matrix(
      this.data.map((row, r) => row.map((v, c) => v * other.data[r][c]))
    );
  }

  /** Scalar multiplication. */
  scale(s: number): Matrix {
    return new Matrix(this.data.map((row) => row.map((v) => v * s)));
  }

  /** Scalar addition. */
  addScalar(s: number): Matrix {
    return new Matrix(this.data.map((row) => row.map((v) => v + s)));
  }

  // ── Matrix Multiplication ────────────────────────────────

  /**
   * Standard matrix multiplication: C = A × B
   * A: (m × k), B: (k × n) → C: (m × n)
   * O(m·k·n) — optimised with local variable caching.
   */
  multiply(other: Matrix): Matrix {
    if (this.cols !== other.rows) {
      throw new Error(
        `multiply: shape mismatch — (${this.rows}×${this.cols}) × (${other.rows}×${other.cols})`
      );
    }
    const result: MatrixData = Array.from({ length: this.rows }, () =>
      new Array(other.cols).fill(0)
    );
    const aData = this.data;
    const bData = other.data;
    for (let i = 0; i < this.rows; i++) {
      for (let k = 0; k < this.cols; k++) {
        const aik = aData[i][k];
        if (aik === 0) continue; // sparse optimisation
        for (let j = 0; j < other.cols; j++) {
          result[i][j] += aik * bData[k][j];
        }
      }
    }
    return new Matrix(result);
  }

  // ── Transpose ───────────────────────────────────────────

  transpose(): Matrix {
    const result: MatrixData = Array.from({ length: this.cols }, () =>
      new Array(this.rows).fill(0)
    );
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        result[c][r] = this.data[r][c];
      }
    }
    return new Matrix(result);
  }

  // ── Dot Product (vectors) ────────────────────────────────

  /**
   * Computes the scalar dot product of two column-vector matrices.
   * Both must be (n × 1).
   */
  dot(other: Matrix): number {
    if (this.cols !== 1 || other.cols !== 1 || this.rows !== other.rows) {
      throw new Error('dot: both matrices must be (n×1) column vectors of equal length');
    }
    let sum = 0;
    for (let i = 0; i < this.rows; i++) {
      sum += this.data[i][0] * other.data[i][0];
    }
    return sum;
  }

  // ── Reductions ───────────────────────────────────────────

  sum(): number {
    return this.data.reduce((acc, row) => acc + row.reduce((s, v) => s + v, 0), 0);
  }

  mean(): number {
    return this.sum() / (this.rows * this.cols);
  }

  max(): number {
    let m = -Infinity;
    for (const row of this.data) {
      for (const v of row) if (v > m) m = v;
    }
    return m;
  }

  min(): number {
    let m = Infinity;
    for (const row of this.data) {
      for (const v of row) if (v < m) m = v;
    }
    return m;
  }

  /** L2 (Frobenius) norm. */
  norm(): number {
    let sq = 0;
    for (const row of this.data) for (const v of row) sq += v * v;
    return Math.sqrt(sq);
  }

  // ── Element-wise Map ─────────────────────────────────────

  map(fn: (value: number, row: number, col: number) => number): Matrix {
    return new Matrix(
      this.data.map((row, r) => row.map((v, c) => fn(v, r, c)))
    );
  }

  /** Apply a row-wise function and return a column vector Matrix. */
  reduceRows(fn: (row: number[]) => number): Matrix {
    return new Matrix(this.data.map((row) => [fn(row)]));
  }

  // ── Broadcast Helpers ────────────────────────────────────

  /**
   * Add a column-vector bias to every column of this matrix.
   * this: (m×n), bias: (m×1) → (m×n)
   */
  addBias(bias: Matrix): Matrix {
    if (bias.cols !== 1 || bias.rows !== this.rows) {
      throw new Error(
        `addBias: bias must be (${this.rows}×1), got (${bias.rows}×${bias.cols})`
      );
    }
    return new Matrix(
      this.data.map((row, r) => row.map((v) => v + bias.data[r][0]))
    );
  }

  /**
   * Sum all columns into a single column-vector (m×1).
   * Used when computing bias gradients from a mini-batch.
   */
  sumCols(): Matrix {
    return new Matrix(
      this.data.map((row) => [row.reduce((a, v) => a + v, 0)])
    );
  }

  // ── Utility ─────────────────────────────────────────────

  private assertSameShape(other: Matrix, op: string): void {
    if (this.rows !== other.rows || this.cols !== other.cols) {
      throw new Error(
        `${op}: shape mismatch — (${this.rows}×${this.cols}) vs (${other.rows}×${other.cols})`
      );
    }
  }

  toString(): string {
    const lines = this.data.map((row) =>
      '[ ' + row.map((v) => v.toFixed(4).padStart(9)).join(', ') + ' ]'
    );
    return `Matrix(${this.rows}×${this.cols})\n` + lines.join('\n');
  }
}
