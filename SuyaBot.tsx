import React, { useState, useEffect, useRef, useCallback } from 'react';
import './SuyaBot.css';

/* =====================================================
   Types
   ===================================================== */
export type SuyaMode =
  | 'awake' | 'idle' | 'sleeping' | 'offline' | 'bored';

export type SuyaExpression =
  | 'neutral' | 'happy' | 'thinking' | 'thinking_hard'
  | 'eating'  | 'listening' | 'shocked';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
interface Position { x: number; y: number; corner: Corner; }

export interface SuyaBotProps {
  mode?:           SuyaMode;
  isActive?:       boolean;
  isBusy?:         boolean;
  isListening?:    boolean;
  isShocked?:      boolean;
  isThinkingHard?: boolean;
  message?:        string;
  onInteraction?:  () => void;
  highlightTarget?: HTMLElement | null;
}

/* =====================================================
   SVG gradient defs — unique prefix per instance
   ===================================================== */
const Defs: React.FC<{ p: string }> = ({ p }) => (
  <defs>
    <radialGradient id={`${p}skin`} cx="38%" cy="28%" r="68%">
      <stop offset="0%"   stopColor="#FFF0DC"/>
      <stop offset="48%"  stopColor="#FFD49A"/>
      <stop offset="100%" stopColor="#F0A860"/>
    </radialGradient>
    <radialGradient id={`${p}skin_pale`} cx="38%" cy="28%" r="68%">
      <stop offset="0%"   stopColor="#EEE6D4"/>
      <stop offset="48%"  stopColor="#D8C498"/>
      <stop offset="100%" stopColor="#C4A068"/>
    </radialGradient>
    <radialGradient id={`${p}skin_grey`} cx="38%" cy="28%" r="68%">
      <stop offset="0%"   stopColor="#D8D4CC"/>
      <stop offset="48%"  stopColor="#B8B4AC"/>
      <stop offset="100%" stopColor="#989490"/>
    </radialGradient>
    <radialGradient id={`${p}iris`} cx="28%" cy="25%" r="68%">
      <stop offset="0%"   stopColor="#7EC4F4"/>
      <stop offset="50%"  stopColor="#1E6EC0"/>
      <stop offset="100%" stopColor="#0C3880"/>
    </radialGradient>
    <radialGradient id={`${p}iris_focus`} cx="28%" cy="25%" r="68%">
      <stop offset="0%"   stopColor="#FF9858"/>
      <stop offset="50%"  stopColor="#D84010"/>
      <stop offset="100%" stopColor="#801808"/>
    </radialGradient>
    <radialGradient id={`${p}iris_listen`} cx="28%" cy="25%" r="68%">
      <stop offset="0%"   stopColor="#B0ECFF"/>
      <stop offset="50%"  stopColor="#18B0E8"/>
      <stop offset="100%" stopColor="#0870B8"/>
    </radialGradient>
    <radialGradient id={`${p}orb`} cx="32%" cy="28%" r="65%">
      <stop offset="0%"   stopColor="#FFE070"/>
      <stop offset="100%" stopColor="#FF6B1A"/>
    </radialGradient>
    <radialGradient id={`${p}orb_sleep`} cx="32%" cy="28%" r="65%">
      <stop offset="0%"   stopColor="#C0C8E8"/>
      <stop offset="100%" stopColor="#7080A8"/>
    </radialGradient>
    <radialGradient id={`${p}orb_off`} cx="32%" cy="28%" r="65%">
      <stop offset="0%"   stopColor="#888888"/>
      <stop offset="100%" stopColor="#444444"/>
    </radialGradient>
    <radialGradient id={`${p}blush`} cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stopColor="rgba(255,110,80,.48)"/>
      <stop offset="100%" stopColor="rgba(255,110,80,0)"/>
    </radialGradient>
    <radialGradient id={`${p}blush_pale`} cx="50%" cy="50%" r="50%">
      <stop offset="0%"   stopColor="rgba(255,110,80,.28)"/>
      <stop offset="100%" stopColor="rgba(255,110,80,0)"/>
    </radialGradient>
    <radialGradient id={`${p}hand`} cx="40%" cy="30%" r="70%">
      <stop offset="0%"   stopColor="#FFE4B0"/>
      <stop offset="100%" stopColor="#F0B060"/>
    </radialGradient>
    <linearGradient id={`${p}meat`} x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%"   stopColor="#C45030"/>
      <stop offset="50%"  stopColor="#8B2010"/>
      <stop offset="100%" stopColor="#5A1208"/>
    </linearGradient>
  </defs>
);

/* ── Antenna + head circle ── */
const Head: React.FC<{ p: string; skinId?: string; orbId?: string; stroke?: string }> = ({
  p, skinId, orbId, stroke = '#D88040',
}) => (
  <>
    <line x1="32" y1="9" x2="32" y2="15" stroke="#C8804A" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="32" cy="7" r="4" fill={`url(#${orbId ?? p + 'orb'})`}/>
    <circle cx="30.5" cy="5.8" r="1.1" fill="rgba(255,255,255,.65)"/>
    <circle cx="32" cy="40" r="28" fill={`url(#${skinId ?? p + 'skin'})`} stroke={stroke} strokeWidth="1"/>
    <ellipse cx="23" cy="27" rx="10" ry="5.5" fill="rgba(255,255,255,.14)" transform="rotate(-14 23 27)"/>
  </>
);

/* ── Full open eye pair ── */
const Eyes: React.FC<{
  p: string; irisId?: string;
  lPupilDx?: number; lPupilDy?: number;
  rPupilDx?: number; rPupilDy?: number;
  lRx?: number; lRy?: number; rRx?: number; rRy?: number;
}> = ({ p, irisId, lPupilDx=0, lPupilDy=0, rPupilDx=0, rPupilDy=0, lRx=5.8, lRy=6.5, rRx=5.8, rRy=6.5 }) => {
  const iris = irisId ?? `${p}iris`;
  return (<>
    {/* Left */}
    <ellipse cx="17" cy="38" rx="10"  ry="11.5" fill="#1A0A02"/>
    <ellipse cx="17" cy="38" rx="8.5" ry="10"   fill="white"/>
    <ellipse cx={17+lPupilDx} cy={38+lPupilDy} rx={lRx} ry={lRy} fill={`url(#${iris})`}/>
    <circle  cx={17+lPupilDx} cy={38+lPupilDy} r="3.5"              fill="#05152A"/>
    <circle  cx={17+lPupilDx+2.2} cy={38+lPupilDy-3} r="1.9"       fill="rgba(255,255,255,.93)"/>
    {/* Right */}
    <ellipse cx="47" cy="38" rx="10"  ry="11.5" fill="#1A0A02"/>
    <ellipse cx="47" cy="38" rx="8.5" ry="10"   fill="white"/>
    <ellipse cx={47+rPupilDx} cy={38+rPupilDy} rx={rRx} ry={rRy} fill={`url(#${iris})`}/>
    <circle  cx={47+rPupilDx} cy={38+rPupilDy} r="3.5"              fill="#05152A"/>
    <circle  cx={47+rPupilDx+2.2} cy={38+rPupilDy-3} r="1.9"       fill="rgba(255,255,255,.93)"/>
  </>);
};

/* ── Single meat chunk for eating animation ── */
const MeatChunk: React.FC<{
  p: string; x: number; y: number; rot: number; cls: string;
}> = ({ p, x, y, rot, cls }) => (
  <g className={cls} style={{ transformOrigin: `${x}px ${y}px` }}>
    <g transform={`translate(${x},${y}) rotate(${rot})`}>
      <rect x="-7" y="-5.5" width="14" height="11" rx="3.5" fill={`url(#${p}meat)`}/>
      <rect x="-5.5" y="-3.5" width="11" height="1.2" rx=".5" fill="#240A02" opacity=".52"/>
      <rect x="-5.5" y="-.5"  width="11" height="1.2" rx=".5" fill="#240A02" opacity=".38"/>
      <rect x="-5"   y="-5.5" width="5.5" height="4"  rx="1.5" fill="rgba(255,210,130,.4)"/>
      <rect x="1.5"  y="-3"   width="4"   height="1.5" rx=".5" fill="rgba(255,235,200,.26)"/>
    </g>
  </g>
);

/* ── Large palm that covers face ── */
const CoveringHand: React.FC<{ p: string; flip?: boolean; cls?: string }> = ({ p, flip, cls }) => (
  <g className={cls} transform={flip ? 'translate(64,0) scale(-1,1)' : undefined}>
    {/* Four fingers pointing upward */}
    <ellipse cx="10" cy="26" rx="3.8" ry="5.2" fill={`url(#${p}hand)`} stroke="#C88040" strokeWidth=".8"/>
    <ellipse cx="17" cy="23" rx="3.8" ry="5.2" fill={`url(#${p}hand)`} stroke="#C88040" strokeWidth=".8"/>
    <ellipse cx="24" cy="22" rx="3.8" ry="5.2" fill={`url(#${p}hand)`} stroke="#C88040" strokeWidth=".8"/>
    <ellipse cx="31" cy="24" rx="3.8" ry="5.2" fill={`url(#${p}hand)`} stroke="#C88040" strokeWidth=".8"/>
    {/* Thumb out to side */}
    <ellipse cx="5"  cy="36" rx="4.5" ry="3.2" fill={`url(#${p}hand)`} stroke="#C88040" strokeWidth=".8"/>
    {/* Big palm */}
    <rect x="5" y="28" width="30" height="32" rx="7" fill={`url(#${p}hand)`} stroke="#C88040" strokeWidth=".9"/>
    <path d="M10 38 Q20 42 33 38" stroke="rgba(180,90,20,.22)" strokeWidth="1"   fill="none" strokeLinecap="round"/>
    <path d="M10 46 Q18 50 28 46" stroke="rgba(180,90,20,.16)" strokeWidth=".8"  fill="none" strokeLinecap="round"/>
  </g>
);

/* =====================================================
   SUYA FACE
   viewBox "0 0 64 76"  overflow:visible for hands/skewer
   ===================================================== */
interface FaceProps { expr: SuyaExpression; mode: SuyaMode; p: string; }

const SuyaFace: React.FC<FaceProps> = ({ expr, mode, p }) => {

  /* ─────────── OFFLINE ─────────── */
  if (mode === 'offline') return (
    <svg width="64" height="76" viewBox="0 0 64 76" fill="none" overflow="visible">
      <Defs p={p}/>
      <line x1="32" y1="9" x2="32" y2="15" stroke="#888" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="32" cy="7" r="4" fill={`url(#${p}orb_off)`}/>
      <circle cx="32" cy="40" r="28" fill={`url(#${p}skin_grey)`} stroke="#808080" strokeWidth="1"/>
      {/* X eyes */}
      {([17,47] as const).map((cx,i) => (
        <g key={i}>
          <ellipse cx={cx} cy={37} rx="10" ry="11.5" fill="#404040"/>
          <ellipse cx={cx} cy={37} rx="8.5" ry="10"  fill="#C8C4BC"/>
          <line x1={cx-5} y1={32} x2={cx+5} y2={42} stroke="#505050" strokeWidth="3.5" strokeLinecap="round"/>
          <line x1={cx+5} y1={32} x2={cx-5} y2={42} stroke="#505050" strokeWidth="3.5" strokeLinecap="round"/>
        </g>
      ))}
      <path d="M9 25 Q17 24 25 25"  stroke="#909090" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M39 25 Q47 24 55 25" stroke="#909090" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M22 56 L42 56" stroke="#909090" strokeWidth="2" strokeLinecap="round"/>
      {/* No-signal icon */}
      <circle cx="52" cy="12" r="2" fill="#B0B0B0" opacity=".5"/>
      <line x1="55" y1="9"  x2="58" y2="5"  stroke="#B0B0B0" strokeWidth="1.4" strokeLinecap="round" opacity=".5"/>
      <line x1="58" y1="12" x2="62" y2="7"  stroke="#B0B0B0" strokeWidth="1.4" strokeLinecap="round" opacity=".35"/>
    </svg>
  );

  /* ─────────── SLEEPING ─────────── */
  if (mode === 'sleeping') return (
    <svg width="64" height="76" viewBox="0 0 64 76" fill="none" overflow="visible">
      <Defs p={p}/>
      <Head p={p} skinId={`${p}skin_pale`} orbId={`${p}orb_sleep`} stroke="#B07030"/>
      {/* Closed eyes */}
      {([17,47] as const).map((cx,i) => (
        <g key={i}>
          <ellipse cx={cx} cy={38} rx="10"  ry="11.5" fill="#2A1A0A"/>
          <ellipse cx={cx} cy={38} rx="8.5" ry="10"   fill={`url(#${p}skin_pale)`}/>
          <path d={`M${cx-9.5} ${35} Q${cx} ${29} ${cx+9.5} ${35}`} fill="#2A1A0A"/>
        </g>
      ))}
      <path d="M9 27 Q17 25.5 24 27"  stroke="#9A7030" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M40 27 Q47 25.5 55 27" stroke="#9A7030" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M25 57 Q32 58.5 39 57" stroke="#B07040" strokeWidth="1.4" strokeLinecap="round" fill="none"/>
      <ellipse cx="8"  cy="47" rx="5.5" ry="4" fill={`url(#${p}blush_pale)`}/>
      <ellipse cx="56" cy="47" rx="5.5" ry="4" fill={`url(#${p}blush_pale)`}/>
    </svg>
  );

  /* ─────────── IDLE ─────────── */
  if (mode === 'idle') return (
    <svg width="64" height="76" viewBox="0 0 64 76" fill="none" overflow="visible">
      <Defs p={p}/>
      <Head p={p} stroke="#C07838"/>
      {/* Open eyes, pupils shifted slightly downward — heavy/drowsy */}
      <Eyes p={p} lPupilDy={2} rPupilDy={2}/>
      <path d="M9.5 25 Q17 23.5 24 25"  stroke="#9A6030" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      <path d="M40 25 Q47 23.5 54.5 25" stroke="#9A6030" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      <path d="M24 56 Q32 59 40 56" stroke="#B07040" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
    </svg>
  );

  /* ─────────── BORED ─────────── */
  if (mode === 'bored') return (
    <svg width="64" height="76" viewBox="0 0 64 76" fill="none" overflow="visible">
      <Defs p={p}/>
      <Head p={p} stroke="#C07838"/>
      {/* Open eyes, pupils shoved hard LEFT — that glazed sideways stare */}
      <Eyes p={p} lPupilDx={-4.5} rPupilDx={-4.5}/>
      {/* Flat low brows */}
      <path d="M9 26.5 Q17 27.5 25 26.5"  stroke="#9A6030" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      <path d="M39 26.5 Q47 27.5 55 26.5" stroke="#9A6030" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      {/* Frown */}
      <path d="M22 58 Q32 54.5 42 58" stroke="#A06030" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      {/* Sweat drop */}
      <path d="M56 32 Q58 38 56 42 Q54 38 56 32Z" fill="#80C8FF" opacity=".6"/>
      {/* Ellipsis */}
      <circle cx="24" cy="67" r="1.8" fill="#C09060" opacity=".5"/>
      <circle cx="32" cy="67" r="1.8" fill="#C09060" opacity=".5"/>
      <circle cx="40" cy="67" r="1.8" fill="#C09060" opacity=".5"/>
    </svg>
  );

  /* =====================================================
     AWAKE EXPRESSIONS
     ===================================================== */

  if (expr === 'neutral') return (
    <svg width="64" height="76" viewBox="0 0 64 76" fill="none" overflow="visible">
      <Defs p={p}/><Head p={p}/>
      <Eyes p={p}/>
      <path d="M9 25 Q17 22.5 24.5 24.5"  stroke="#7A3A10" strokeWidth="3"   strokeLinecap="round" fill="none"/>
      <path d="M39.5 24.5 Q47 22.5 55 25"  stroke="#7A3A10" strokeWidth="3"   strokeLinecap="round" fill="none"/>
      <path d="M22 57 Q32 60 42 57"         stroke="#A04820" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    </svg>
  );

  if (expr === 'happy') return (
    <svg width="64" height="76" viewBox="0 0 64 76" fill="none" overflow="visible">
      <Defs p={p}/><Head p={p}/>
      {/* Squinting joy arcs */}
      <ellipse cx="17" cy="38" rx="10" ry="11.5" fill="#1A0A02"/>
      <ellipse cx="17" cy="38" rx="8.5" ry="10"  fill="white"/>
      <path d="M7.5 38 Q17 27 26.5 38" fill="#1A0A02"/>
      <ellipse cx="47" cy="38" rx="10" ry="11.5" fill="#1A0A02"/>
      <ellipse cx="47" cy="38" rx="8.5" ry="10"  fill="white"/>
      <path d="M37.5 38 Q47 27 56.5 38" fill="#1A0A02"/>
      <path d="M9 22.5 Q17 19 24.5 21.5"  stroke="#7A3A10" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      <path d="M39.5 21.5 Q47 19 55 22.5" stroke="#7A3A10" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      <path d="M18 53 Q32 64 46 53" stroke="#903A14" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <ellipse cx="8"  cy="48" rx="6" ry="4.5" fill={`url(#${p}blush)`}/>
      <ellipse cx="56" cy="48" rx="6" ry="4.5" fill={`url(#${p}blush)`}/>
      <path d="M50 10 L51.5 7.5 L53 10 L50 11 Z" fill="#FFD060" opacity=".75"/>
    </svg>
  );

  if (expr === 'thinking') return (
    <svg width="64" height="76" viewBox="0 0 64 76" fill="none" overflow="visible">
      <Defs p={p}/><Head p={p}/>
      <Eyes p={p} rPupilDx={-2} rPupilDy={-2}/>
      <path d="M9 25 Q17 22.5 24.5 24.5"  stroke="#7A3A10" strokeWidth="3"   strokeLinecap="round" fill="none"/>
      <path d="M39.5 22 Q47 19 55 21.5"   stroke="#7A3A10" strokeWidth="3"   strokeLinecap="round" fill="none"/>
      <path d="M20 57 Q25 55.5 29 57 Q32 58.5 36 56.5" stroke="#A04820" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <circle cx="54" cy="22" r="2"   fill="#FFD4A0" opacity=".58"/>
      <circle cx="58" cy="16" r="2.8" fill="#FFD4A0" opacity=".72"/>
      <circle cx="62" cy="10" r="3.5" fill="#FFD4A0" opacity=".82"/>
    </svg>
  );

  if (expr === 'thinking_hard') return (
    <svg width="64" height="76" viewBox="0 0 64 76" fill="none" overflow="visible">
      <Defs p={p}/><Head p={p}/>
      {/* Heavy squint: focus iris + thick drooping skin lid */}
      {([17,47] as const).map((cx,i) => (
        <g key={i}>
          <ellipse cx={cx}   cy={38}    rx="10"  ry="11.5" fill="#1A0A02"/>
          <ellipse cx={cx}   cy={38}    rx="8.5" ry="10"   fill="white"/>
          <ellipse cx={cx+(i===1?2:0)} cy={38} rx="5.8" ry="6.5" fill={`url(#${p}iris_focus)`}/>
          <circle  cx={cx+(i===1?2:0)} cy={38} r="3.5"           fill="#200408"/>
          <circle  cx={cx+(i===1?3.8:2)} cy={35} r="1.7"         fill="rgba(255,255,255,.9)"/>
          {/* Heavy drooping lid — skin-toned path over top of eye */}
          <path d={`M${cx-9.5} ${34} Q${cx} ${42} ${cx+9.5} ${34}`} fill={`url(#${p}skin)`}/>
          <path d={`M${cx-9.5} ${34} Q${cx} ${42} ${cx+9.5} ${34}`} stroke="#7A3010" strokeWidth=".8" fill="none"/>
        </g>
      ))}
      {/* V-brows almost meeting */}
      <path d="M8 27.5 Q14 23 22 26.5"  stroke="#5A2008" strokeWidth="3.8" strokeLinecap="round" fill="none"/>
      <path d="M42 26.5 Q50 23 56 27.5" stroke="#5A2008" strokeWidth="3.8" strokeLinecap="round" fill="none"/>
      <line x1="22" y1="26" x2="23.5" y2="28.5" stroke="#5A2008" strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="42" y1="26" x2="40.5" y2="28.5" stroke="#5A2008" strokeWidth="1.6" strokeLinecap="round"/>
      {/* Gritted teeth */}
      <path d="M20 57 Q32 62 44 57" fill="#8C2006"/>
      <path d="M20 57 Q32 59.5 44 57" fill="white"/>
      {/* Steam lines */}
      <line x1="5"  y1="28" x2=".5"  y2="20" stroke="#FF8020" strokeWidth="1.8" strokeLinecap="round" opacity=".7"/>
      <line x1="59" y1="28" x2="63.5" y2="20" stroke="#FF8020" strokeWidth="1.8" strokeLinecap="round" opacity=".7"/>
    </svg>
  );

  /* ─────────── SHOCKED — both palms cover full face, spring in, hold ─────────── */
  if (expr === 'shocked') return (
    <svg width="64" height="76" viewBox="0 0 64 76" fill="none" overflow="visible">
      <Defs p={p}/>
      <Head p={p}/>
      {/* Brows peeking over fingers — shot to very top */}
      <path d="M8 20 Q17 15 26 19"  stroke="#7A3A10" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      <path d="M38 19 Q47 15 56 20" stroke="#7A3A10" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      {/* Shock star bursts */}
      <path d="M4 16 L5.5 13.5 L7 16 L4 17 Z"   fill="#FFD020" opacity=".85"/>
      <path d="M57 16 L58.5 13.5 L60 16 L57 17 Z" fill="#FFD020" opacity=".85"/>
      {/* LEFT palm */}
      <CoveringHand p={p} cls="hand-cover-l"/>
      {/* RIGHT palm (mirrored) */}
      <CoveringHand p={p} flip cls="hand-cover-r"/>
    </svg>
  );

  /* ─────────── EATING ─────────────────────────────────────────────
     Three meat chunks sit on the skewer at positions along the stick.
     Each chunk has its own CSS class (eat-c0 / eat-c1 / eat-c2).
     The @keyframes eatChunk translates each chunk toward the mouth
     (upper-left in the rotated stick coordinate system = right cheek
      of the face = roughly x:48, y:48 in head coordinates).
     Stagger: 0s / 0.8s / 1.6s  — only ONE vanishes at a time.
     The head is drawn ON TOP so the stick tip disappears behind the cheek.
  ──────────────────────────────────────────────────────────────────── */
  if (expr === 'eating') return (
    <svg width="64" height="76" viewBox="0 0 64 76" fill="none" overflow="visible">
      <Defs p={p}/>

      {/* ── Skewer group behind head ── */}
      <g className="sk-nudge">
        {/* Bamboo stick: from far right toward mouth (x≈50,y≈45) */}
        <line x1="50" y1="45" x2="90" y2="68" stroke="#7A4825" strokeWidth="2.8" strokeLinecap="round"/>

        {/*
          Chunk positions along the stick (in document coords, no rotation wrapper
          so the CSS translate moves them straight toward the mouth):
            Chunk 0 = at x:58,y:50  (closest to mouth — vanishes FIRST, delay 0s)
            Chunk 1 = at x:70,y:57  (middle — delay 0.8s)
            Chunk 2 = at x:82,y:64  (furthest — delay 1.6s)
          eatChunk translates: translate(-9px,-5px) which is toward the mouth
          at upper-left of each chunk's position on the stick.
        */}
        <MeatChunk p={p} x={58} y={50} rot={-27} cls="eat-c0"/>
        <MeatChunk p={p} x={70} y={57} rot={-27} cls="eat-c1"/>
        <MeatChunk p={p} x={82} y={64} rot={-27} cls="eat-c2"/>

        {/* Right hand gripping stick at bottom-right */}
        <g transform="translate(90,68) rotate(-27)">
          <ellipse cx="-5.5" cy="-6"   rx="2.8" ry="3.2" fill={`url(#${p}hand)`} stroke="#C88040" strokeWidth=".7"/>
          <ellipse cx="-1.8" cy="-7.5" rx="2.8" ry="3.2" fill={`url(#${p}hand)`} stroke="#C88040" strokeWidth=".7"/>
          <ellipse cx="2"    cy="-7.5" rx="2.8" ry="3.2" fill={`url(#${p}hand)`} stroke="#C88040" strokeWidth=".7"/>
          <ellipse cx="5.8"  cy="-6"   rx="2.8" ry="3.2" fill={`url(#${p}hand)`} stroke="#C88040" strokeWidth=".7"/>
          <ellipse cx="0.5"  cy="0"    rx="7.5" ry="6"   fill={`url(#${p}hand)`} stroke="#C88040" strokeWidth=".8"/>
          <path d="M-5.5 1 Q0.5 2.8 6.5 1" stroke="rgba(180,90,20,.28)" strokeWidth=".7" fill="none"/>
        </g>
      </g>

      {/* ── Head drawn ON TOP ── */}
      <Head p={p}/>

      {/* Squeezed-shut bliss eyes — U-arc covers bottom half */}
      {([17,47] as const).map((cx,i) => (
        <g key={i}>
          <ellipse cx={cx} cy={38} rx="10"  ry="11.5" fill="#1A0A02"/>
          <ellipse cx={cx} cy={38} rx="8.5" ry="10"   fill="white"/>
          <path d={`M${cx-8.5} 38 Q${cx} 48 ${cx+8.5} 38`} fill="#1A0A02"/>
          <line x1={cx-8.5} y1={38} x2={cx-10.5} y2={36} stroke="#1A0A02" strokeWidth="1.3" strokeLinecap="round"/>
          <line x1={cx+8.5} y1={38} x2={cx+10.5} y2={36} stroke="#1A0A02" strokeWidth="1.3" strokeLinecap="round"/>
        </g>
      ))}

      {/* Pleased raised brows */}
      <path d="M8.5 22 Q17 19 24.5 21.5"  stroke="#8A3A08" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      <path d="M39.5 21.5 Q47 19 55.5 22" stroke="#8A3A08" strokeWidth="3.2" strokeLinecap="round" fill="none"/>

      {/* Puffed right cheek — food bulge */}
      <ellipse cx="53" cy="47" rx="10" ry="8" fill={`url(#${p}blush)`} opacity=".9"/>

      {/* Mouth — closed chewing, upturned right corner */}
      <path d="M21 55.5 Q32 57.5 42 54.5"    stroke="#A04820" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M42 54.5 Q45.5 55.5 44.5 58"  stroke="#A04820" strokeWidth="1.6" strokeLinecap="round" fill="none"/>

      {/* Left mild blush */}
      <ellipse cx="7" cy="47" rx="5.5" ry="4" fill={`url(#${p}blush)`} opacity=".4"/>
      {/* Satisfaction sparkle */}
      <path d="M6 24 L7 22 L8 24 L6 25 Z" fill="#FFD060" opacity=".65"/>
    </svg>
  );

  /* ─────────── LISTENING ─────────── */
  return (
    <svg width="64" height="76" viewBox="0 0 64 76" fill="none" overflow="visible">
      <Defs p={p}/>
      <Head p={p} stroke="#80B8C8"/>
      {/* Huge owl eyes */}
      {([17,47] as const).map((cx,i) => (
        <g key={i}>
          <ellipse cx={cx} cy={38} rx="11"  ry="12.5" fill="#1A0A02"/>
          <ellipse cx={cx} cy={38} rx="9.5" ry="11"   fill="white"/>
          <ellipse cx={cx} cy={38} rx="7"   ry="8"    fill={`url(#${p}iris_listen)`}/>
          <circle  cx={cx} cy={38} r="4.2"            fill="#021C30"/>
          <circle  cx={cx+2.5} cy={34.5} r="2.3"      fill="rgba(255,255,255,.95)"/>
        </g>
      ))}
      <path d="M8 24 Q17 21.5 25 23.5"  stroke="#6898B8" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M39 23.5 Q47 21.5 56 24" stroke="#6898B8" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <ellipse cx="32" cy="57.5" rx="4"   ry="3.5"  fill="#8C3010"/>
      <ellipse cx="32" cy="57"   rx="2.5" ry="2.2"  fill="#5A1808"/>
    </svg>
  );
};

/* =====================================================
   Whoosh helpers
   ===================================================== */
const WHOOSH_DUR = 400;

function spawnTrails(x: number, y: number) {
  [68, 52, 36].forEach((sz, i) => {
    const el = document.createElement('div');
    el.className = 'suya-speed-trail';
    el.style.cssText = `left:${x + (68 - sz) / 2}px;top:${y + (76 - sz) / 2}px;width:${sz}px;height:${sz}px;background:radial-gradient(circle,rgba(255,160,60,.6) 0%,rgba(255,100,20,0) 70%);animation-delay:${i * 32}ms;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 500);
  });
}

function spawnLines(from: Position, to: Position) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ang = Math.atan2(dy, dx) * 180 / Math.PI;
  const dist = Math.hypot(dx, dy);
  for (let i = 0; i < 5; i++) {
    const offset = (i - 2) * 8;
    const px = -Math.sin(ang * Math.PI / 180) * offset;
    const py =  Math.cos(ang * Math.PI / 180) * offset;
    const el = document.createElement('div');
    el.className = 'suya-speed-line';
    el.style.cssText = `left:${from.x + 34 + px}px;top:${from.y + 38 + py}px;width:${dist * (0.44 + Math.random() * 0.44)}px;--ang:${ang}deg;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), WHOOSH_DUR + 80);
  }
}

/* =====================================================
   SuyaBot — Main component
   ===================================================== */
let _uid = 0;

export const SuyaBot: React.FC<SuyaBotProps> = ({
  mode           = 'awake',
  isActive       = false,
  isBusy         = false,
  isListening    = false,
  isShocked      = false,
  isThinkingHard = false,
  message,
  onInteraction,
  highlightTarget,
}) => {
  const uid = useRef(`sb${++_uid}`).current;
  const [pos,       setPos]    = useState<Position>({ x: 20, y: 20, corner: 'bottom-right' });
  const [expr,      setExpr]   = useState<SuyaExpression>('neutral');
  const [showMsg,   setShowMsg]= useState(false);
  const [hlBox,     setHlBox]  = useState<DOMRect | null>(null);
  const [whoosh,    setWhoosh] = useState<'idle' | 'out' | 'in'>('idle');
  const botRef  = useRef<HTMLDivElement>(null);
  const prevPos = useRef<Position | null>(null);

  const findOptimal = useCallback((): Position => {
    const pad = 20, sw = window.innerWidth, sh = window.innerHeight;
    const occ = new Set<string>();
    document.querySelectorAll('[data-suya-bot]').forEach(el => {
      if (el === botRef.current) return;
      const r = el.getBoundingClientRect();
      if (r.left < sw/2  && r.top < sh/2)  occ.add('top-left');
      if (r.left >= sw/2 && r.top < sh/2)  occ.add('top-right');
      if (r.left < sw/2  && r.top >= sh/2) occ.add('bottom-left');
      if (r.left >= sw/2 && r.top >= sh/2) occ.add('bottom-right');
    });
    const corners: Corner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    for (const c of corners) {
      if (!occ.has(c)) return {
        corner: c,
        x: c.includes('right') ? sw - 88 - pad : pad,
        y: c.includes('bottom') ? sh - 96 - pad : pad,
      };
    }
    return { x: sw - 88 - pad, y: sh - 96 - pad, corner: 'bottom-right' };
  }, []);

  useEffect(() => {
    const p = findOptimal();
    setPos(p); prevPos.current = p;
    const onResize = () => { const next = findOptimal(); triggerWhoosh(prevPos.current!, next); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [findOptimal]);

  const triggerWhoosh = (from: Position, to: Position) => {
    if (from.x === to.x && from.y === to.y) { setPos(to); return; }
    spawnTrails(from.x, from.y);
    spawnLines(from, to);
    setWhoosh('out');
    setTimeout(() => {
      setPos(to); prevPos.current = to;
      setWhoosh('in');
      setTimeout(() => setWhoosh('idle'), WHOOSH_DUR);
    }, WHOOSH_DUR * 0.52);
  };

  /** Programmatically reposition to a random different corner */
  const reposition = useCallback(() => {
    const cur = prevPos.current || pos;
    const others = (['bottom-right','bottom-left','top-right','top-left'] as Corner[]).filter(c => c !== cur.corner);
    const nc = others[Math.floor(Math.random() * others.length)];
    const pad = 20, sw = window.innerWidth, sh = window.innerHeight;
    triggerWhoosh(cur, {
      corner: nc,
      x: nc.includes('right') ? sw - 88 - pad : pad,
      y: nc.includes('bottom') ? sh - 96 - pad : pad,
    });
  }, [pos]);

  useEffect(() => {
    if (mode === 'sleeping' || mode === 'offline' || mode === 'idle' || mode === 'bored') return;
    if (isBusy)          setExpr('eating');
    else if (isShocked)  setExpr('shocked');
    else if (isThinkingHard) setExpr('thinking_hard');
    else if (isListening) setExpr('listening');
    else if (isActive)   setExpr('happy');
    else                 setExpr('neutral');
  }, [mode, isActive, isBusy, isListening, isShocked, isThinkingHard]);

  useEffect(() => {
    if (!message) { setShowMsg(false); return; }
    const t = setTimeout(() => setShowMsg(true), 700);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    if (!showMsg) return;
    const t = setTimeout(() => setShowMsg(false), 5800);
    return () => clearTimeout(t);
  }, [showMsg]);
  useEffect(() => {
    if (!highlightTarget) { setHlBox(null); return; }
    setHlBox(highlightTarget.getBoundingClientRect());
    const t = setTimeout(() => setHlBox(null), 4000);
    return () => clearTimeout(t);
  }, [highlightTarget]);

  const handleClick = () => {
    if (mode === 'sleeping' || mode === 'offline') return;
    onInteraction?.();
  };

  const modeClass = {
    idle: 'mode-idle', sleeping: 'mode-sleeping',
    offline: 'mode-offline', bored: 'mode-bored', awake: '',
  }[mode];

  const stateClass = [
    modeClass,
    isBusy         ? 'busy'          : '',
    isListening    ? 'listening'     : '',
    isShocked      ? 'shocked'       : '',
    isThinkingHard ? 'thinking-hard' : '',
    whoosh === 'out' ? 'whoosh-out' : '',
    whoosh === 'in'  ? 'whoosh-in'  : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div className={`suya-overlay ${isActive ? 'active' : ''}`} onClick={handleClick}>
        {hlBox && (
          <div className="suya-highlight-wrapper" style={{
            position: 'absolute',
            left:   hlBox.left  - 18,
            top:    hlBox.top   - 18,
            width:  hlBox.width + 36,
            height: hlBox.height + 36,
          }}>
            <div className="vignette-frame"/>
          </div>
        )}
        {showMsg && message && (
          <div className="suya-bubble">
            <div className="bubble-top-accent"/>
            <div className="bubble-icon" aria-hidden>🍢</div>
            <div className="bubble-content">{message}</div>
            <div className="bubble-tail"/>
          </div>
        )}
      </div>

      <div
        ref={botRef}
        data-suya-bot="true"
        className={`suya-bot ${stateClass}`}
        style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
        onClick={handleClick}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleClick()}
        role="button"
        tabIndex={0}
        aria-label="Suya Bot"
      >
        {mode === 'sleeping' && (
          <>
            <span className="z-particle z1" aria-hidden>Z</span>
            <span className="z-particle z2" aria-hidden>Z</span>
            <span className="z-particle z3" aria-hidden>z</span>
          </>
        )}
        {isListening && (
          <>
            <div className="listen-ring ring-1"/>
            <div className="listen-ring ring-2"/>
            <div className="listen-ring ring-3"/>
          </>
        )}
        <SuyaFace expr={expr} mode={mode} p={uid}/>
      </div>
    </>
  );
};

export default SuyaBot;
