// ============================================================
// SuyaSurf AI Engine — Short-Term Memory (STM)
//
// Architecture: Ring Buffer + Temporal Decay + Dot-Product Attention
//
// HOW IT WORKS
// ─────────────
// Entries are stored in a fixed-capacity ring buffer (circular array).
// Each entry carries an optional dense "embedding" vector — a numeric
// fingerprint of the content (e.g. URL/text feature vector).
//
// Retrieval is content-addressable via attention:
//
//   score_i = cos_sim(query, embedding_i) × temporal_decay(entry_i)
//   attention = softmax(scores / √d)
//   result = top-K entries by attention weight
//
// Temporal decay:  w = exp( -λ × Δt / halfLife )
//   • λ = 1.0 (default) — steepness of the decay curve
//   • Δt = (now - entry.timestamp) in milliseconds
//   • halfLife — time (ms) at which an entry's decay weight = 1/e ≈ 0.37
//
// Cosine similarity: cos(a,b) = (a·b) / (‖a‖·‖b‖)
//   • 1.0  = identical direction
//   • 0.0  = orthogonal (unrelated)
//   • −1.0 = opposite
//
// When no embeddings are supplied, the memory degrades gracefully to a
// recency-weighted ring buffer (retrieval uses temporal score alone).
// ============================================================

export interface MemoryEntry<T = unknown> {
  /** Monotonically increasing ID. */
  id: number;
  /** Human-readable key (e.g. URL, concept name). */
  key: string;
  /** Dense numeric vector used as the attention key. Length = embedDim. */
  embedding: number[] | null;
  /** Arbitrary payload stored alongside the key. */
  value: T;
  /** Unix timestamp (ms) when this entry was written. */
  timestamp: number;
  /** Scalar importance weight set at store-time (default 1.0). */
  weight: number;
  /** Number of times this entry has been returned by retrieve(). */
  accessCount: number;
}

export interface MemoryRetrievalResult<T = unknown> {
  entry: MemoryEntry<T>;
  /** Combined score: cos_sim × temporal_decay (post-softmax). */
  attentionWeight: number;
  /** Raw cosine similarity before decay (or 1.0 if no embeddings). */
  similarity: number;
  /** Temporal decay factor in [0, 1]. */
  decay: number;
}

export interface STMConfig {
  /** Maximum number of entries. Oldest entry is overwritten on overflow. */
  capacity: number;
  /**
   * Dimensionality of embedding vectors.
   * Set to 0 to disable embedding-based retrieval (recency-only mode).
   */
  embedDim: number;
  /**
   * Half-life for temporal decay in milliseconds.
   * At age = halfLife, decay weight = 1/e ≈ 0.368.
   * Default: 5 minutes (300_000 ms).
   */
  halfLife?: number;
  /**
   * Decay steepness λ. Higher = faster forgetting.
   * decay = exp(−λ × Δt / halfLife).
   * Default: 1.0.
   */
  decayLambda?: number;
}

export interface STMState<T = unknown> {
  config: STMConfig;
  entries: Array<MemoryEntry<T> | null>;
  head: number;  // next write position in ring buffer
  size: number;  // number of valid entries (≤ capacity)
  nextId: number;
}

// ── Helpers ──────────────────────────────────────────────

function dotProduct(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

function l2Norm(v: number[]): number {
  let sq = 0;
  for (const x of v) sq += x * x;
  return Math.sqrt(sq);
}

/**
 * Cosine similarity between two equal-length vectors.
 * Returns 0 if either vector is the zero vector.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  const normA = l2Norm(a);
  const normB = l2Norm(b);
  if (normA === 0 || normB === 0) return 0;
  return dotProduct(a, b) / (normA * normB);
}

/**
 * Numerically-stable softmax over an array of raw scores.
 * Subtracts max to prevent exp() overflow.
 */
function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

// ── ShortTermMemory ──────────────────────────────────────

export class ShortTermMemory<T = unknown> {
  private readonly cfg: Required<STMConfig>;
  private ring: Array<MemoryEntry<T> | null>;
  private head: number = 0;   // next write slot
  private _size: number = 0;  // filled slots
  private nextId: number = 0;

  constructor(config: STMConfig) {
    this.cfg = {
      capacity: config.capacity,
      embedDim: config.embedDim,
      halfLife: config.halfLife ?? 300_000,   // 5 minutes
      decayLambda: config.decayLambda ?? 1.0,
    };
    this.ring = new Array(this.cfg.capacity).fill(null);
  }

  // ── Write ──────────────────────────────────────────────

  /**
   * Store a new entry in the ring buffer.
   *
   * Algorithm:
   *   1. Write to ring[head]
   *   2. head = (head + 1) % capacity   ← modular wrap-around
   *   3. If buffer was full, the oldest entry is silently overwritten.
   *
   * @param key      Human-readable identifier (e.g. page URL)
   * @param value    Payload to store
   * @param embedding Dense vector of length embedDim (optional)
   * @param weight   Importance multiplier applied before decay (default 1.0)
   */
  store(key: string, value: T, embedding?: number[], weight = 1.0): MemoryEntry<T> {
    if (embedding && embedding.length !== this.cfg.embedDim) {
      throw new Error(
        `STM.store: embedding length ${embedding.length} ≠ embedDim ${this.cfg.embedDim}`
      );
    }
    const entry: MemoryEntry<T> = {
      id: this.nextId++,
      key,
      embedding: embedding ?? null,
      value,
      timestamp: Date.now(),
      weight,
      accessCount: 0,
    };
    this.ring[this.head] = entry;
    this.head = (this.head + 1) % this.cfg.capacity;
    if (this._size < this.cfg.capacity) this._size++;
    return entry;
  }

  // ── Temporal Decay ────────────────────────────────────

  /**
   * Compute the temporal decay weight for an entry.
   *
   * Formula:  decay = entry.weight × exp( -λ × Δt / halfLife )
   *
   * Where:
   *   λ         = decayLambda (steepness)
   *   Δt        = now - entry.timestamp  (milliseconds)
   *   halfLife  = time at which decay factor reaches 1/e ≈ 0.368
   *
   * At Δt=0     → decay = weight × 1.0  (full weight, brand new)
   * At Δt=τ     → decay = weight × e^-1 ≈ 0.368
   * At Δt=2τ    → decay = weight × e^-2 ≈ 0.135
   * At Δt=10τ   → decay = weight × e^-10 ≈ 0.00005 (effectively forgotten)
   */
  private temporalDecay(entry: MemoryEntry<T>, now: number): number {
    const dt = now - entry.timestamp;
    const decayFactor = Math.exp(
      (-this.cfg.decayLambda * dt) / this.cfg.halfLife
    );
    return entry.weight * decayFactor;
  }

  // ── Retrieve ──────────────────────────────────────────

  /**
   * Retrieve top-K entries via attention-weighted scoring.
   *
   * Scoring algorithm (per entry i):
   *   1. Compute cosine_sim = cos(queryEmbedding, entry.embedding)
   *      Falls back to 1.0 when either has no embedding (recency mode).
   *   2. Compute temporal_decay = exp(-λ × Δt / halfLife) × entry.weight
   *   3. raw_score_i = cosine_sim_i × temporal_decay_i
   *   4. Normalise: attention = softmax(raw_scores / √embedDim)
   *      (Temperature scaling by √d mirrors transformer attention.)
   *   5. Return top-K entries sorted by attention weight descending.
   *
   * @param queryEmbedding  Vector to compare against stored embeddings.
   *                        Pass null/undefined for recency-only retrieval.
   * @param topK            Maximum entries to return (default: all).
   */
  retrieve(
    queryEmbedding?: number[] | null,
    topK?: number
  ): MemoryRetrievalResult<T>[] {
    const now = Date.now();
    const valid = this.allEntries();
    if (valid.length === 0) return [];

    const d = this.cfg.embedDim;
    const temp = d > 0 ? Math.sqrt(d) : 1;

    // ── Step 1-3: compute per-entry raw scores ────────────
    const scored = valid.map((entry) => {
      const decay = this.temporalDecay(entry, now);

      let similarity = 1.0; // default: recency-only
      if (
        queryEmbedding &&
        entry.embedding &&
        queryEmbedding.length === d &&
        entry.embedding.length === d
      ) {
        similarity = cosineSimilarity(queryEmbedding, entry.embedding);
        // Shift from [-1,1] → [0,1] so decay can scale it cleanly
        similarity = (similarity + 1) / 2;
      }

      return { entry, decay, similarity, raw: (similarity * decay) / temp };
    });

    // ── Step 4: softmax normalisation ────────────────────
    const rawScores = scored.map((s) => s.raw);
    const attnWeights = softmax(rawScores);

    const results: MemoryRetrievalResult<T>[] = scored.map((s, i) => ({
      entry: s.entry,
      attentionWeight: attnWeights[i],
      similarity: s.similarity,
      decay: s.decay,
    }));

    // ── Step 5: sort and return top-K ────────────────────
    results.sort((a, b) => b.attentionWeight - a.attentionWeight);

    const k = topK ?? results.length;
    const topResults = results.slice(0, k);

    // Increment access count (side-effect, but useful for analytics)
    for (const r of topResults) r.entry.accessCount++;

    return topResults;
  }

  // ── Convenience Queries ───────────────────────────────

  /**
   * Return the N most recently stored entries (newest first).
   * O(N) — iterates ring buffer in reverse insertion order.
   */
  recent(n?: number): MemoryEntry<T>[] {
    const all = this.allEntries();
    // allEntries() already returns insertion-ordered; reverse for newest first
    const reversed = all.slice().reverse();
    return n !== undefined ? reversed.slice(0, n) : reversed;
  }

  /** Look up a single entry by exact key match. O(capacity). */
  get(key: string): MemoryEntry<T> | null {
    for (const entry of this.ring) {
      if (entry !== null && entry.key === key) return entry;
    }
    return null;
  }

  /**
   * Remove all entries matching the given key.
   * Nulls them in the ring; does not compact or shift.
   */
  forget(key: string): number {
    let removed = 0;
    for (let i = 0; i < this.ring.length; i++) {
      if (this.ring[i]?.key === key) {
        this.ring[i] = null;
        removed++;
        if (this._size > 0) this._size--;
      }
    }
    return removed;
  }

  /** Clear all entries. */
  clear(): void {
    this.ring.fill(null);
    this.head = 0;
    this._size = 0;
  }

  /** Number of valid (non-null) entries currently stored. */
  get size(): number {
    return this._size;
  }

  /** True if the ring is at capacity. Next store() will overwrite oldest. */
  get isFull(): boolean {
    return this._size === this.cfg.capacity;
  }

  // ── Serialisation ─────────────────────────────────────

  serialize(): STMState<T> {
    return {
      config: { ...this.cfg },
      entries: this.ring.map((e) => (e ? { ...e, embedding: e.embedding ? [...e.embedding] : null } : null)),
      head: this.head,
      size: this._size,
      nextId: this.nextId,
    };
  }

  static deserialize<T>(state: STMState<T>): ShortTermMemory<T> {
    const mem = new ShortTermMemory<T>(state.config);
    mem.ring = state.entries.map((e) =>
      e
        ? { ...e, embedding: e.embedding ? [...e.embedding] : null }
        : null
    );
    mem.head = state.head;
    mem._size = state.size;
    mem.nextId = state.nextId;
    return mem;
  }

  // ── Internal ──────────────────────────────────────────

  /** Return all non-null entries in insertion order (oldest → newest). */
  private allEntries(): MemoryEntry<T>[] {
    if (this._size === 0) return [];
    if (this._size < this.cfg.capacity) {
      // Buffer not yet full — valid entries are ring[0..head-1]
      return this.ring.slice(0, this.head).filter((e): e is MemoryEntry<T> => e !== null);
    }
    // Buffer full — read in order: head (oldest) → head-1 (newest), wrapping around
    const result: MemoryEntry<T>[] = [];
    for (let i = 0; i < this.cfg.capacity; i++) {
      const idx = (this.head + i) % this.cfg.capacity;
      const entry = this.ring[idx];
      if (entry !== null) result.push(entry);
    }
    return result;
  }
}
