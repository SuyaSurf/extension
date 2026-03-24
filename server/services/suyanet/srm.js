/**
 * SuyaNet — Statistical Relational Model (SRM)
 *
 * Models relationships between entities using learnable relation matrices.
 * This is a bilinear relational model:
 *   score(head, relation, tail) = eₕᵀ · R · eₜ
 *
 * Trained with margin-based ranking loss:
 *   L = Σ max(0, γ + score(neg) - score(pos))
 *
 * All gradients are hand-derived. No autograd.
 *
 * Use cases:
 *   - Knowledge graph completion
 *   - Link prediction
 *   - Entity classification (feed embeddings into the neural net)
 *   - Relational reasoning
 */

import { Matrix } from './matrix.js';

class SRM {
  /**
   * @param {number} numEntities - total number of entities
   * @param {number} numRelations - total number of relation types
   * @param {number} embeddingDim - dimensionality of entity/relation embeddings
   * @param {object} [options]
   * @param {number} [options.margin=1.0] - margin for ranking loss
   * @param {number} [options.lr=0.01] - learning rate
   * @param {number} [options.regWeight=0.001] - L2 regularization weight
   */
  constructor(numEntities, numRelations, embeddingDim, options = {}) {
    this.numEntities = numEntities;
    this.numRelations = numRelations;
    this.dim = embeddingDim;
    this.margin = options.margin || 1.0;
    this.lr = options.lr || 0.01;
    this.regWeight = options.regWeight || 0.001;

    // Entity embeddings: each entity is a column vector of size dim
    // Stored as a (dim × numEntities) matrix
    this.entityEmb = Matrix.randomUniform(embeddingDim, numEntities, -0.5, 0.5);
    this._normalizeEntities();

    // Relation matrices: each relation r has a (dim × dim) matrix
    this.relationMats = [];
    for (let r = 0; r < numRelations; r++) {
      this.relationMats.push(Matrix.randomUniform(embeddingDim, embeddingDim, -0.5, 0.5));
    }

    // Adam state for entity embeddings
    this.entityM = Matrix.zeros(embeddingDim, numEntities);
    this.entityV = Matrix.zeros(embeddingDim, numEntities);

    // Adam state for each relation matrix
    this.relM = [];
    this.relV = [];
    for (let r = 0; r < numRelations; r++) {
      this.relM.push(Matrix.zeros(embeddingDim, embeddingDim));
      this.relV.push(Matrix.zeros(embeddingDim, embeddingDim));
    }

    this.t = 0; // Adam timestep
  }

  /** Normalize entity embeddings to unit length (per column) */
  _normalizeEntities() {
    for (let j = 0; j < this.numEntities; j++) {
      let norm = 0;
      for (let i = 0; i < this.dim; i++) {
        const v = this.entityEmb.get(i, j);
        norm += v * v;
      }
      norm = Math.sqrt(norm) + 1e-12;
      for (let i = 0; i < this.dim; i++) {
        this.entityEmb.set(i, j, this.entityEmb.get(i, j) / norm);
      }
    }
  }

  /**
   * Get entity embedding vector as a (dim × 1) Matrix
   */
  getEntity(entityIdx) {
    const vec = Matrix.zeros(this.dim, 1);
    for (let i = 0; i < this.dim; i++) {
      vec.set(i, 0, this.entityEmb.get(i, entityIdx));
    }
    return vec;
  }

  /**
   * Compute bilinear score: eₕᵀ · R · eₜ
   * Returns a scalar
   */
  score(headIdx, relationIdx, tailIdx) {
    const eh = this.getEntity(headIdx);     // (dim × 1)
    const R = this.relationMats[relationIdx]; // (dim × dim)
    const et = this.getEntity(tailIdx);      // (dim × 1)

    // R · et → (dim × 1)
    const Ret = Matrix.multiply(R, et);
    // ehᵀ · (R · et) → scalar
    return Matrix.dot(eh, Ret);
  }

  /**
   * Generate a corrupted (negative) triple by randomly replacing head or tail
   */
  _corruptTriple(headIdx, relationIdx, tailIdx) {
    if (Math.random() < 0.5) {
      // Corrupt head
      let newHead;
      do {
        newHead = Math.floor(Math.random() * this.numEntities);
      } while (newHead === headIdx);
      return [newHead, relationIdx, tailIdx];
    } else {
      // Corrupt tail
      let newTail;
      do {
        newTail = Math.floor(Math.random() * this.numEntities);
      } while (newTail === tailIdx);
      return [headIdx, relationIdx, newTail];
    }
  }

  /**
   * Train on a batch of positive triples.
   * Each triple is [headIdx, relationIdx, tailIdx].
   *
   * @param {number[][]} triples - array of [h, r, t] positive triples
   * @returns {number} average loss for this batch
   */
  trainBatch(triples) {
    this.t++;
    const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;

    // Accumulate gradients
    const dEntity = Matrix.zeros(this.dim, this.numEntities);
    const dRel = this.relationMats.map(() => Matrix.zeros(this.dim, this.dim));

    let totalLoss = 0;

    for (const [h, r, t] of triples) {
      // Positive score
      const eh = this.getEntity(h);
      const et = this.getEntity(t);
      const R = this.relationMats[r];
      const Ret = Matrix.multiply(R, et);
      const scorePos = Matrix.dot(eh, Ret);

      // Negative triple
      const [hn, rn, tn] = this._corruptTriple(h, r, t);
      const ehn = this.getEntity(hn);
      const etn = this.getEntity(tn);
      const Retn = Matrix.multiply(R, etn);
      const scoreNeg = Matrix.dot(ehn, Retn);

      // Margin ranking loss
      const violation = this.margin + scoreNeg - scorePos;
      if (violation <= 0) continue; // no loss

      totalLoss += violation;

      // ── Gradients (hand-derived) ──

      // Positive triple: we want to INCREASE scorePos → gradient is negative
      // ∂score/∂eh = R · et,  ∂score/∂et = Rᵀ · eh,  ∂score/∂R = eh · etᵀ

      // dL/d(scorePos) = -1 (push it up)
      // dL/d(scoreNeg) = +1 (push it down)

      // Gradient for positive head entity
      for (let i = 0; i < this.dim; i++) {
        dEntity.set(i, h, dEntity.get(i, h) - Ret.get(i, 0));
      }

      // Gradient for positive tail entity
      const RtEh = Matrix.multiply(Matrix.transpose(R), eh);
      for (let i = 0; i < this.dim; i++) {
        dEntity.set(i, t, dEntity.get(i, t) - RtEh.get(i, 0));
      }

      // Gradient for relation matrix (positive): -eh · etᵀ
      for (let i = 0; i < this.dim; i++) {
        for (let j = 0; j < this.dim; j++) {
          dRel[r].set(i, j, dRel[r].get(i, j) - eh.get(i, 0) * et.get(j, 0));
        }
      }

      // Gradient for negative head entity
      for (let i = 0; i < this.dim; i++) {
        dEntity.set(i, hn, dEntity.get(i, hn) + Retn.get(i, 0));
      }

      // Gradient for negative tail entity
      const RtEhn = Matrix.multiply(Matrix.transpose(R), ehn);
      for (let i = 0; i < this.dim; i++) {
        dEntity.set(i, tn, dEntity.get(i, tn) + RtEhn.get(i, 0));
      }

      // Gradient for relation matrix (negative): +ehn · etnᵀ
      for (let i = 0; i < this.dim; i++) {
        for (let j = 0; j < this.dim; j++) {
          dRel[r].set(i, j, dRel[r].get(i, j) + ehn.get(i, 0) * etn.get(j, 0));
        }
      }
    }

    // ── Adam update for entity embeddings ──
    for (let i = 0; i < dEntity.data.length; i++) {
      // Add L2 regularization
      const g = dEntity.data[i] + this.regWeight * this.entityEmb.data[i];
      this.entityM.data[i] = beta1 * this.entityM.data[i] + (1 - beta1) * g;
      this.entityV.data[i] = beta2 * this.entityV.data[i] + (1 - beta2) * g * g;
      const mHat = this.entityM.data[i] / (1 - Math.pow(beta1, this.t));
      const vHat = this.entityV.data[i] / (1 - Math.pow(beta2, this.t));
      this.entityEmb.data[i] -= this.lr * mHat / (Math.sqrt(vHat) + eps);
    }

    // ── Adam update for relation matrices ──
    for (let r = 0; r < this.numRelations; r++) {
      const R = this.relationMats[r];
      for (let i = 0; i < R.data.length; i++) {
        const g = dRel[r].data[i] + this.regWeight * R.data[i];
        this.relM[r].data[i] = beta1 * this.relM[r].data[i] + (1 - beta1) * g;
        this.relV[r].data[i] = beta2 * this.relV[r].data[i] + (1 - beta2) * g * g;
        const mHat = this.relM[r].data[i] / (1 - Math.pow(beta1, this.t));
        const vHat = this.relV[r].data[i] / (1 - Math.pow(beta2, this.t));
        R.data[i] -= this.lr * mHat / (Math.sqrt(vHat) + eps);
      }
    }

    // Re-normalize entity embeddings
    this._normalizeEntities();

    return totalLoss / triples.length;
  }

  /**
   * Predict the most likely tail entity for a given (head, relation, ?)
   * @returns {number[]} entity indices sorted by score (descending)
   */
  predictTail(headIdx, relationIdx, topK = 5) {
    const scores = [];
    for (let e = 0; e < this.numEntities; e++) {
      scores.push({ entity: e, score: this.score(headIdx, relationIdx, e) });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  /**
   * Predict the most likely head entity for a given (?, relation, tail)
   */
  predictHead(relationIdx, tailIdx, topK = 5) {
    const scores = [];
    for (let e = 0; e < this.numEntities; e++) {
      scores.push({ entity: e, score: this.score(e, relationIdx, tailIdx) });
    }
    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, topK);
  }

  /**
   * Get entity embeddings as a matrix that can be fed into the neural network
   * @param {number[]} entityIndices
   * @returns {Matrix} (dim × numEntities) matrix
   */
  getEmbeddingsForNN(entityIndices) {
    const result = Matrix.zeros(this.dim, entityIndices.length);
    for (let j = 0; j < entityIndices.length; j++) {
      const idx = entityIndices[j];
      for (let i = 0; i < this.dim; i++) {
        result.set(i, j, this.entityEmb.get(i, idx));
      }
    }
    return result;
  }

  /** Serialize */
  serialize() {
    return {
      numEntities: this.numEntities,
      numRelations: this.numRelations,
      dim: this.dim,
      margin: this.margin,
      entityEmb: Array.from(this.entityEmb.data),
      relationMats: this.relationMats.map(R => Array.from(R.data))
    };
  }

  /** Deserialize */
  static deserialize(obj) {
    const srm = new SRM(obj.numEntities, obj.numRelations, obj.dim, { margin: obj.margin });
    srm.entityEmb = new Matrix(obj.dim, obj.numEntities, new Float64Array(obj.entityEmb));
    for (let r = 0; r < obj.numRelations; r++) {
      srm.relationMats[r] = new Matrix(obj.dim, obj.dim, new Float64Array(obj.relationMats[r]));
    }
    return srm;
  }
}

export { SRM };
