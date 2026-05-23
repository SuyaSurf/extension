// ============================================================
// SuyaSurf AI Engine — Data Flow State Machine
// Event-driven FSM that manages data through the AI pipeline.
// No external libraries — pure TypeScript class with
// typed transitions and async action support.
// ============================================================

import type {
  FlowState,
  FlowEvent,
  FlowTransition,
  FlowListener,
} from '../types';

// ── Transition table ─────────────────────────────────────

const TRANSITION_TABLE: FlowTransition[] = [
  // Bootstrap
  { from: 'idle',          event: 'START_COLLECT',  to: 'collecting'     },
  { from: 'idle',          event: 'INFER_DIRECT',   to: 'inferring'      },

  // Data collection phase
  { from: 'collecting',    event: 'DATA_READY',     to: 'preprocessing'  },
  { from: 'collecting',    event: 'CANCEL',         to: 'idle'           },
  { from: 'collecting',    event: 'ERROR',          to: 'error'          },

  // Preprocessing phase
  { from: 'preprocessing', event: 'PREPROCESS_DONE', to: 'inferring'    },
  { from: 'preprocessing', event: 'CANCEL',          to: 'idle'         },
  { from: 'preprocessing', event: 'ERROR',           to: 'error'        },

  // Inference phase
  { from: 'inferring',     event: 'INFER_DONE',     to: 'postprocessing' },
  { from: 'inferring',     event: 'CANCEL',         to: 'idle'          },
  { from: 'inferring',     event: 'ERROR',          to: 'error'         },

  // Post-processing phase
  { from: 'postprocessing', event: 'POST_DONE',     to: 'complete'      },
  { from: 'postprocessing', event: 'ERROR',         to: 'error'         },

  // Terminal states → back to idle
  { from: 'complete',      event: 'RESET',          to: 'idle'          },
  { from: 'error',         event: 'RESET',          to: 'idle'          },
  { from: 'error',         event: 'RETRY',          to: 'collecting'    },
];

// ── Data pipeline context ────────────────────────────────

export interface PipelineContext {
  rawData?: unknown;
  preprocessedData?: unknown;
  inferenceResult?: unknown;
  finalResult?: unknown;
  error?: Error;
  metadata: Record<string, unknown>;
}

// ── State Machine ────────────────────────────────────────

export class DataFlowMachine {
  private _state: FlowState = 'idle';
  private _context: PipelineContext = { metadata: {} };
  private _history: Array<{ state: FlowState; event: string; ts: number }> = [];
  private _listeners: FlowListener[] = [];
  private _stateListeners: Map<FlowState, FlowListener[]> = new Map();

  // ── State access ─────────────────────────────────────────

  get state(): FlowState {
    return this._state;
  }

  get context(): Readonly<PipelineContext> {
    return this._context;
  }

  get history(): ReadonlyArray<{ state: FlowState; event: string; ts: number }> {
    return this._history;
  }

  isIdle(): boolean    { return this._state === 'idle'; }
  isComplete(): boolean { return this._state === 'complete'; }
  hasError(): boolean  { return this._state === 'error'; }

  // ── Event dispatch ────────────────────────────────────────

  /**
   * Dispatch an event to drive a state transition.
   * If a transition action is defined, it is awaited before the state
   * officially changes (so listeners see the final state).
   */
  async dispatch(eventType: string, payload?: unknown): Promise<void> {
    const transition = TRANSITION_TABLE.find(
      (t) => t.from === this._state && t.event === eventType
    );

    if (!transition) {
      console.warn(
        `[DataFlowMachine] No transition from '${this._state}' on '${eventType}'`
      );
      return;
    }

    const event: FlowEvent = { type: eventType, payload, timestamp: Date.now() };

    // Run transition action (if defined) before state changes
    if (transition.action) {
      try {
        await transition.action(payload);
      } catch (err) {
        await this.dispatch('ERROR', err);
        return;
      }
    }

    const prevState = this._state;
    this._state = transition.to;

    this._history.push({ state: transition.to, event: eventType, ts: event.timestamp });

    // Notify all listeners
    for (const listener of this._listeners) {
      listener(event, this._state);
    }

    // Notify state-specific listeners
    const stateListeners = this._stateListeners.get(this._state);
    if (stateListeners) {
      for (const listener of stateListeners) {
        listener(event, this._state);
      }
    }
  }

  // ── Context mutations ────────────────────────────────────

  setRawData(data: unknown): void {
    this._context = { ...this._context, rawData: data };
  }

  setPreprocessed(data: unknown): void {
    this._context = { ...this._context, preprocessedData: data };
  }

  setInferenceResult(result: unknown): void {
    this._context = { ...this._context, inferenceResult: result };
  }

  setFinalResult(result: unknown): void {
    this._context = { ...this._context, finalResult: result };
  }

  setMeta(key: string, value: unknown): void {
    this._context = {
      ...this._context,
      metadata: { ...this._context.metadata, [key]: value },
    };
  }

  setError(err: Error): void {
    this._context = { ...this._context, error: err };
  }

  // ── Listener management ──────────────────────────────────

  /** Subscribe to all state transitions. */
  on(listener: FlowListener): () => void {
    this._listeners.push(listener);
    return () => {
      this._listeners = this._listeners.filter((l) => l !== listener);
    };
  }

  /** Subscribe to transitions into a specific state. */
  onState(state: FlowState, listener: FlowListener): () => void {
    const list = this._stateListeners.get(state) ?? [];
    list.push(listener);
    this._stateListeners.set(state, list);
    return () => {
      this._stateListeners.set(
        state,
        (this._stateListeners.get(state) ?? []).filter((l) => l !== listener)
      );
    };
  }

  // ── High-level pipeline helpers ───────────────────────────

  /**
   * Run a complete pipeline:
   *   idle → collecting → preprocessing → inferring → postprocessing → complete
   *
   * Pass async functions for each phase; errors auto-transition to 'error'.
   */
  async runPipeline(pipeline: {
    collect?: () => Promise<unknown>;
    preprocess?: (raw: unknown) => Promise<unknown>;
    infer: (preprocessed: unknown) => Promise<unknown>;
    postprocess?: (result: unknown) => Promise<unknown>;
  }): Promise<unknown> {
    await this.dispatch('START_COLLECT');

    try {
      // Collect
      const raw = pipeline.collect ? await pipeline.collect() : null;
      this.setRawData(raw);
      await this.dispatch('DATA_READY', raw);

      // Preprocess
      const preprocessed = pipeline.preprocess
        ? await pipeline.preprocess(raw)
        : raw;
      this.setPreprocessed(preprocessed);
      await this.dispatch('PREPROCESS_DONE', preprocessed);

      // Infer
      const inferenceResult = await pipeline.infer(preprocessed);
      this.setInferenceResult(inferenceResult);
      await this.dispatch('INFER_DONE', inferenceResult);

      // Postprocess
      const final = pipeline.postprocess
        ? await pipeline.postprocess(inferenceResult)
        : inferenceResult;
      this.setFinalResult(final);
      await this.dispatch('POST_DONE', final);

      return final;
    } catch (err) {
      this.setError(err instanceof Error ? err : new Error(String(err)));
      await this.dispatch('ERROR', err);
      throw err;
    }
  }

  /** Reset the machine to idle and clear context. */
  async reset(): Promise<void> {
    await this.dispatch('RESET');
    this._context = { metadata: {} };
  }
}
