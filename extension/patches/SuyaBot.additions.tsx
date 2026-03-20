/**
 * SuyaBot.additions.tsx
 *
 * Paste these additions into SuyaBot.tsx.
 * Sections are clearly labelled — find-and-replace the matching areas.
 */

/* ════════════════════════════════════════════════════════════════
   1. TYPE CHANGES
   Replace the existing SuyaMode type with:
   ════════════════════════════════════════════════════════════════ */
export type SuyaMode =
  | 'awake' | 'idle' | 'sleeping' | 'offline' | 'bored' | 'shrinked';
//                                                          ^^^^^^^^^ NEW


/* ════════════════════════════════════════════════════════════════
   2. DRAG STATE INTERFACE  (add after the existing Position interface)
   ════════════════════════════════════════════════════════════════ */
interface DragState {
  isDragging:       boolean;
  startX:           number;
  startY:           number;
  originBotX:       number;
  originBotY:       number;
  hasMoved:         boolean;
  lastDragTime:     number | null;
  recoveryTimerId:  ReturnType<typeof setTimeout> | null;
}


/* ════════════════════════════════════════════════════════════════
   3. UPDATED SuyaBotProps  (add two new optional props)
   ════════════════════════════════════════════════════════════════ */
export interface SuyaBotProps {
  // ... all existing props ...
  dragRecoveryMinutes?: number;  // NEW — default 60
  shrinkOnDrag?:        boolean; // NEW — default true
}


/* ════════════════════════════════════════════════════════════════
   4. SHRINKED FACE  (add this case to SuyaFace, before the offline block)
   ════════════════════════════════════════════════════════════════ */

// if (mode === 'shrinked') — insert at top of SuyaFace render:
const ShrinkedFace = ({ p }: { p: string }) => (
  <svg width="20" height="24" viewBox="0 0 20 24" fill="none" overflow="visible">
    <defs>
      <radialGradient id={`${p}orb_s`} cx="32%" cy="28%" r="65%">
        <stop offset="0%"   stopColor="#FFE070"/>
        <stop offset="100%" stopColor="#FF6B1A"/>
      </radialGradient>
    </defs>
    {/* Just the antenna + orb */}
    <line x1="10" y1="3" x2="10" y2="7"  stroke="#C8804A" strokeWidth="1.5" strokeLinecap="round"/>
    <circle cx="10" cy="2" r="3.5" fill={`url(#${p}orb_s)`}/>
    <circle cx="9"  cy="1" r=".9"  fill="rgba(255,255,255,.6)"/>
    {/* Tiny face stub */}
    <circle cx="10" cy="16" r="8.5" fill="#FFD49A" stroke="#D88040" strokeWidth=".8"/>
    {/* dot eyes */}
    <circle cx="7"  cy="15.5" r="1.8" fill="#1A0A02"/>
    <circle cx="13" cy="15.5" r="1.8" fill="#1A0A02"/>
    {/* smile */}
    <path d="M7 19 Q10 21 13 19" stroke="#A04820" strokeWidth="1" fill="none" strokeLinecap="round"/>
  </svg>
);


/* ════════════════════════════════════════════════════════════════
   5. DRAG + RECOVERY HOOKS
   Add these refs and effects inside the SuyaBot component body,
   after the existing state declarations.
   ════════════════════════════════════════════════════════════════ */

// --- REFS (add alongside existing refs) ---
// const dragRef  = useRef<DragState>({ ... })
// const preShinkMode = useRef<SuyaMode>('awake')

const DRAG_ADDITIONS_HOOKS = `
  // ── Drag state ref ──
  const dragRef = useRef<DragState>({
    isDragging:      false,
    startX:          0,
    startY:          0,
    originBotX:      0,
    originBotY:      0,
    hasMoved:        false,
    lastDragTime:    null,
    recoveryTimerId: null,
  });

  // Remember mode before shrink so we can restore it
  const preShrinkMode = useRef<SuyaMode>('awake');

  // Prop defaults
  const recoveryMs  = (dragRecoveryMinutes ?? 60) * 60 * 1000;
  const doShrink    = shrinkOnDrag ?? true;

  // ── Drag handlers ──
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (mode === 'offline') return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const d       = dragRef.current;
    d.isDragging  = true;
    d.startX      = e.clientX;
    d.startY      = e.clientY;
    d.originBotX  = pos.x;
    d.originBotY  = pos.y;
    d.hasMoved    = false;

    if (d.recoveryTimerId) {
      clearTimeout(d.recoveryTimerId);
      d.recoveryTimerId = null;
    }
  }, [mode, pos]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.isDragging) return;

    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;

    if (!d.hasMoved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      d.hasMoved = true;
      if (doShrink && mode !== 'shrinked') {
        preShrinkMode.current = mode as SuyaMode;
        // Use the parent's mode setter — see note below
        _setSuyaMode('shrinked');
      }
    }

    if (d.hasMoved) {
      const sw = window.innerWidth, sh = window.innerHeight;
      const newX = Math.max(0, Math.min(sw - 68,  d.originBotX + dx));
      const newY = Math.max(0, Math.min(sh - 80,  d.originBotY + dy));
      setPos(prev => ({ ...prev, x: newX, y: newY }));
    }
  }, [doShrink, mode]);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d.isDragging) return;
    d.isDragging  = false;
    d.lastDragTime = Date.now();

    if (d.hasMoved && doShrink) {
      // Snap to nearest edge
      const sw = window.innerWidth, sh = window.innerHeight;
      const cx = pos.x + 32, cy = pos.y + 38;
      const snapX = cx < sw / 2 ? 12 : sw - 80;
      const snapY = cy < sh / 2 ? 12 : sh - 92;
      // Animate snap
      triggerWhoosh(pos, { x: snapX, y: snapY, corner: 'bottom-right' });

      // Schedule recovery after configured time
      d.recoveryTimerId = setTimeout(() => {
        _setSuyaMode(preShrinkMode.current);
        d.recoveryTimerId = null;
      }, recoveryMs);
    }
  }, [pos, doShrink, recoveryMs]);

  // Instant-expand on hover/click in shrinked mode
  const onPointerEnterShrinked = useCallback(() => {
    if (mode !== 'shrinked') return;
    _setSuyaMode(preShrinkMode.current);
    if (dragRef.current.recoveryTimerId) {
      clearTimeout(dragRef.current.recoveryTimerId);
      dragRef.current.recoveryTimerId = null;
    }
  }, [mode]);
`;

/*
  NOTE on _setSuyaMode:
  SuyaBot currently receives 'mode' as a prop from outside.
  For drag-recovery to work you have two options:

  Option A (preferred): Lift mode state up to the parent and pass a setter:
    <SuyaBot mode={mode} onModeChange={setMode} ... />

  Option B: Add local mode state inside SuyaBot and let drag control it:
    const [localMode, setLocalMode] = useState(mode);
    const _setSuyaMode = setLocalMode;
    // Use localMode instead of mode prop throughout the component.
    // Still honour changes to the mode prop via useEffect:
    useEffect(() => { setLocalMode(mode); }, [mode]);
*/


/* ════════════════════════════════════════════════════════════════
   6. JSX ADDITIONS
   In the SuyaBot return, apply these changes:

   a) Add pointer event handlers to the main bot div:
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerEnter={onPointerEnterShrinked}
      style={{ ... cursor: dragRef.current.isDragging ? 'grabbing' : 'grab' }}

   b) Apply shrinked class when mode === 'shrinked':
      Already handled by modeClass mapping below.

   c) Render ShrinkedFace when mode === 'shrinked':
      (handled via SuyaFace — add the 'shrinked' check there)
   ════════════════════════════════════════════════════════════════ */

// Update modeClass map (add shrinked entry):
const UPDATED_MODE_CLASS = {
  idle:     'mode-idle',
  sleeping: 'mode-sleeping',
  offline:  'mode-offline',
  bored:    'mode-bored',
  shrinked: 'mode-shrinked',  // NEW
  awake:    '',
} as const;


/* ════════════════════════════════════════════════════════════════
   7. CSS ADDITIONS  (add to SuyaBot.css)
   ════════════════════════════════════════════════════════════════ */
export const SHRINKED_CSS = `
/* ── Shrinked mode ─────────────────────────────────────────── */
.suya-bot.mode-shrinked {
  width: 20px !important;
  height: 24px !important;
  opacity: .55;
  transition:
    width .28s cubic-bezier(.4,0,.2,1),
    height .28s cubic-bezier(.4,0,.2,1),
    opacity .28s ease;
  cursor: pointer;
}

.suya-bot.mode-shrinked:hover {
  opacity: .9;
  transform: scale(1.15);
}

/* Expand animation when leaving shrinked */
.suya-bot:not(.mode-shrinked) {
  transition:
    width .3s cubic-bezier(.34,1.56,.64,1),
    height .3s cubic-bezier(.34,1.56,.64,1),
    opacity .2s ease;
}

/* Dragging cursor override */
.suya-bot.dragging {
  cursor: grabbing !important;
  user-select: none;
}

/* ── Drag snap edge highlight ─────────────────────────────── */
.suya-bot.mode-shrinked::after {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 50%;
  border: 1.5px dashed rgba(255,107,53,.4);
  animation: shrinked-pulse 2s ease-in-out infinite;
  pointer-events: none;
}

@keyframes shrinked-pulse {
  0%, 100% { opacity: .4; transform: scale(1); }
  50%       { opacity: .15; transform: scale(1.15); }
}
`;
