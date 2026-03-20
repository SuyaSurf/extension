import React, { useState, useEffect, useRef, useCallback } from 'react';
import './SuyaBot.css';

/* =====================================================
   Types
   ===================================================== */
export type SuyaExpression =
  | 'neutral' | 'happy' | 'thinking' | 'eating'
  | 'listening' | 'thinking_hard' | 'shocked';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface Position { x: number; y: number; corner: Corner; }

export interface SuyaBotProps {
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
   SuyaFace — Hyper-compact soulful SVG
   Eyes dominate. No wasted space.
   ===================================================== */
const SuyaFace: React.FC<{ expr: SuyaExpression }> = ({ expr }) => (
  /*
   * viewBox: 56×54
   * Head fills almost the entire box — r=25, centered at (28,30)
   * Eyes are massive: rx~9, ry~10.5 — Sonic-scale
   * Brows sit tight on the eye ring, sometimes overlapping
   */
  <svg width="46" height="44" viewBox="0 0 56 54" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      {/* Warm skin */}
      <radialGradient id="G_skin" cx="38%" cy="28%" r="68%">
        <stop offset="0%"   stopColor="#FFF0DC"/>
        <stop offset="50%"  stopColor="#FFD49A"/>
        <stop offset="100%" stopColor="#F0A860"/>
      </radialGradient>

      {/* Iris — deep warm brown for normal states */}
      <radialGradient id="G_iris" cx="28%" cy="25%" r="68%">
        <stop offset="0%"   stopColor="#7EC4F4"/>
        <stop offset="50%"  stopColor="#1E6EC0"/>
        <stop offset="100%" stopColor="#0C3880"/>
      </radialGradient>

      {/* Iris — shocked (yellow-gold, fear) */}
      <radialGradient id="G_iris_shock" cx="28%" cy="25%" r="68%">
        <stop offset="0%"   stopColor="#FFE87A"/>
        <stop offset="50%"  stopColor="#F0B000"/>
        <stop offset="100%" stopColor="#B07000"/>
      </radialGradient>

      {/* Iris — listen (cyan electric) */}
      <radialGradient id="G_iris_listen" cx="28%" cy="25%" r="68%">
        <stop offset="0%"   stopColor="#B0ECFF"/>
        <stop offset="50%"  stopColor="#18B0E8"/>
        <stop offset="100%" stopColor="#0870B8"/>
      </radialGradient>

      {/* Iris — thinking hard (intense red-orange) */}
      <radialGradient id="G_iris_focus" cx="28%" cy="25%" r="68%">
        <stop offset="0%"   stopColor="#FF9858"/>
        <stop offset="50%"  stopColor="#D84010"/>
        <stop offset="100%" stopColor="#801808"/>
      </radialGradient>

      {/* Cheek blush */}
      <radialGradient id="G_blush" cx="50%" cy="50%" r="50%">
        <stop offset="0%"   stopColor="rgba(255,110,80,.45)"/>
        <stop offset="100%" stopColor="rgba(255,110,80,0)"/>
      </radialGradient>

      {/* Antenna orb */}
      <radialGradient id="G_orb" cx="32%" cy="28%" r="65%">
        <stop offset="0%"   stopColor="#FFE070"/>
        <stop offset="100%" stopColor="#FF6B1A"/>
      </radialGradient>
    </defs>

    {/* ── Antenna ── */}
    <line x1="28" y1="4.5" x2="28" y2="10" stroke="#C8804A" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="28" cy="3.2" r="2.8" fill="url(#G_orb)"/>
    <circle cx="26.8" cy="2.2" r="0.9" fill="rgba(255,255,255,.65)"/>

    {/* ── Head ── */}
    <circle cx="28" cy="30" r="24" fill="url(#G_skin)" stroke="#D88040" strokeWidth="1"/>
    {/* Dome highlight */}
    <ellipse cx="22" cy="20" rx="9" ry="5" fill="rgba(255,255,255,.15)" transform="rotate(-14 22 20)"/>

    {/* ============================================================
        EYE HELPER — reused geometry:
        Left eye center:  (19, 27)
        Right eye center: (37, 27)
        Outer ring: rx=9.5, ry=10.5  (thick dark sclera ring)
        Sclera:     rx=8,   ry=9
        ============================================================ */}

    {/* ── NEUTRAL ── */}
    {expr === 'neutral' && (<>
      {/* Left eye */}
      <ellipse cx="19" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="8"   ry="9"    fill="white"/>
      <ellipse cx="19" cy="27" rx="5.5" ry="6"    fill="url(#G_iris)"/>
      <circle  cx="19" cy="27" r="3.2"             fill="#05152A"/>
      <circle  cx="21" cy="24.2" r="1.8"           fill="rgba(255,255,255,.95)"/>
      <circle  cx="17.5" cy="28.8" r=".7"          fill="rgba(255,255,255,.4)"/>
      {/* Right eye */}
      <ellipse cx="37" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="8"   ry="9"    fill="white"/>
      <ellipse cx="37" cy="27" rx="5.5" ry="6"    fill="url(#G_iris)"/>
      <circle  cx="37" cy="27" r="3.2"             fill="#05152A"/>
      <circle  cx="39" cy="24.2" r="1.8"           fill="rgba(255,255,255,.95)"/>
      <circle  cx="35.5" cy="28.8" r=".7"          fill="rgba(255,255,255,.4)"/>
      {/* Brows — calm, just above the eye ring */}
      <path d="M10.5 16 Q18.5 13.5 24.5 15.5" stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M31.5 15.5 Q37.5 13.5 45.5 16" stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      {/* Mouth */}
      <path d="M21 42 Q28 44.5 35 42" stroke="#A04820" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    </>)}

    {/* ── HAPPY ── */}
    {expr === 'happy' && (<>
      {/* Squinting arcs instead of full eyes — Sonic joy */}
      <ellipse cx="19" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="8"   ry="9"    fill="white"/>
      <path d="M10.5 27 Q19 18 27.5 27" fill="#1A0A02"/>
      {/* Right */}
      <ellipse cx="37" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="8"   ry="9"    fill="white"/>
      <path d="M28.5 27 Q37 18 45.5 27" fill="#1A0A02"/>
      {/* Brows lifted high */}
      <path d="M10 14 Q18.5 10.5 25 13" stroke="#7A3A10" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <path d="M31 13 Q37.5 10.5 46 14" stroke="#7A3A10" strokeWidth="3" strokeLinecap="round" fill="none"/>
      {/* Big grin */}
      <path d="M17 40 Q28 50 39 40" stroke="#903A14" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      {/* Cheeks */}
      <ellipse cx="9"  cy="34" rx="5.5" ry="4" fill="url(#G_blush)"/>
      <ellipse cx="47" cy="34" rx="5.5" ry="4" fill="url(#G_blush)"/>
      {/* Star sparkle */}
      <path d="M45 8 L46 6 L47 8 L45 9 Z"    fill="#FFD060" opacity=".75"/>
      <path d="M49 12 L50 10 L51 12 L50 14 Z" fill="#FFB040" opacity=".55"/>
    </>)}

    {/* ── THINKING ── */}
    {expr === 'thinking' && (<>
      {/* Left eye — normal forward */}
      <ellipse cx="19" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="8"   ry="9"    fill="white"/>
      <ellipse cx="19" cy="27" rx="5.5" ry="6"    fill="url(#G_iris)"/>
      <circle  cx="19" cy="27" r="3.2"             fill="#05152A"/>
      <circle  cx="21" cy="24.2" r="1.8"           fill="rgba(255,255,255,.95)"/>
      {/* Right eye — pupils shifted up-left, looking away */}
      <ellipse cx="37" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="8"   ry="9"    fill="white"/>
      <ellipse cx="35" cy="25" rx="5.5" ry="6"    fill="url(#G_iris)"/>
      <circle  cx="34" cy="24" r="3.2"             fill="#05152A"/>
      <circle  cx="35.5" cy="22.5" r="1.8"         fill="rgba(255,255,255,.95)"/>
      {/* Left brow calm, right brow raised */}
      <path d="M10.5 16 Q18.5 13.5 24.5 15.5" stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M31.5 13 Q37.5 10 45.5 12.5"   stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      {/* Smirk mouth */}
      <path d="M19 42 Q24 40.5 28 42 Q31 43.5 34 41" stroke="#A04820" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      {/* Thought bubble */}
      <circle cx="43" cy="16" r="1.6" fill="#FFD4A0" opacity=".6"/>
      <circle cx="47" cy="11" r="2.2" fill="#FFD4A0" opacity=".72"/>
      <circle cx="51" cy="7"  r="2.9" fill="#FFD4A0" opacity=".82"/>
    </>)}

    {/* ── EATING ── */}
    {expr === 'eating' && (<>
      {/* Wide excited eyes */}
      <ellipse cx="19" cy="26" rx="10" ry="11.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="26" rx="8.5" ry="10"  fill="white"/>
      <ellipse cx="19" cy="26" rx="6"   ry="7"   fill="url(#G_iris)"/>
      <circle  cx="19" cy="26" r="3.5"            fill="#05152A"/>
      <circle  cx="21.2" cy="23" r="2.1"          fill="rgba(255,255,255,.95)"/>
      <circle  cx="17.2" cy="28.2" r=".75"        fill="rgba(255,255,255,.45)"/>

      <ellipse cx="37" cy="26" rx="10" ry="11.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="26" rx="8.5" ry="10"  fill="white"/>
      <ellipse cx="37" cy="26" rx="6"   ry="7"   fill="url(#G_iris)"/>
      <circle  cx="37" cy="26" r="3.5"            fill="#05152A"/>
      <circle  cx="39.2" cy="23" r="2.1"          fill="rgba(255,255,255,.95)"/>
      <circle  cx="35.2" cy="28.2" r=".75"        fill="rgba(255,255,255,.45)"/>
      {/* Raised eager brows */}
      <path d="M9.5 14 Q18 11 24.5 13.5" stroke="#8A3A08" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      <path d="M31.5 13.5 Q38 11 46.5 14" stroke="#8A3A08" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      {/* Open mouth with teeth + tongue */}
      <path d="M16 40 Q28 52 40 40" fill="#8C2006"/>
      <path d="M16 40 Q28 43 40 40" fill="white"/>
      <ellipse cx="28" cy="46.5" rx="5.5" ry="3.5" fill="#FF7070"/>
      <ellipse cx="28" cy="46"   rx="3.2" ry="2"   fill="#D83030" opacity=".4"/>
      {/* Cheeks */}
      <ellipse cx="8"  cy="33" rx="5.5" ry="4.5" fill="url(#G_blush)"/>
      <ellipse cx="48" cy="33" rx="5.5" ry="4.5" fill="url(#G_blush)"/>
    </>)}

    {/* ── LISTENING ── */}
    {expr === 'listening' && (<>
      {/* Huge owl eyes — pupils centered, maximally attentive */}
      <ellipse cx="19" cy="27" rx="10.5" ry="12" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="9"    ry="10.5" fill="white"/>
      <ellipse cx="19" cy="27" rx="6.5"  ry="7.5"  fill="url(#G_iris_listen)"/>
      <circle  cx="19" cy="27" r="4"               fill="#021C30"/>
      <circle  cx="21.5" cy="23.8" r="2.2"         fill="rgba(255,255,255,.95)"/>
      <circle  cx="17.2" cy="29.5" r=".8"          fill="rgba(255,255,255,.4)"/>

      <ellipse cx="37" cy="27" rx="10.5" ry="12" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="9"    ry="10.5" fill="white"/>
      <ellipse cx="37" cy="27" rx="6.5"  ry="7.5"  fill="url(#G_iris_listen)"/>
      <circle  cx="37" cy="27" r="4"               fill="#021C30"/>
      <circle  cx="39.5" cy="23.8" r="2.2"         fill="rgba(255,255,255,.95)"/>
      <circle  cx="35.2" cy="29.5" r=".8"          fill="rgba(255,255,255,.4)"/>
      {/* Gentle attentive brows */}
      <path d="M10 15.5 Q18.5 13 25 15" stroke="#6898B8" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
      <path d="M31 15 Q37.5 13 46 15.5" stroke="#6898B8" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
      {/* Small curious O */}
      <ellipse cx="28" cy="43"  rx="4.2" ry="3.5"  fill="#8C3010"/>
      <ellipse cx="28" cy="42.5" rx="2.6" ry="2.2" fill="#5A1808"/>
    </>)}

    {/* ── THINKING HARD ── */}
    {expr === 'thinking_hard' && (<>
      {/* Left eye — furrowed, squinted half-closed */}
      <ellipse cx="19" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="8"   ry="9"    fill="white"/>
      <ellipse cx="19" cy="27" rx="5.5" ry="6"    fill="url(#G_iris_focus)"/>
      <circle  cx="19" cy="27" r="3.2"             fill="#200408"/>
      <circle  cx="20.8" cy="24.5" r="1.6"         fill="rgba(255,255,255,.9)"/>
      {/* Half-close lid on left eye */}
      <path d="M10.5 20 Q19 18.5 27.5 20" fill="#1A0A02"/>
      {/* Right eye — same, shifted pupil to far right corner */}
      <ellipse cx="37" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="8"   ry="9"    fill="white"/>
      <ellipse cx="39" cy="25" rx="5.5" ry="6"    fill="url(#G_iris_focus)"/>
      <circle  cx="40" cy="24" r="3.2"             fill="#200408"/>
      <circle  cx="41.5" cy="22" r="1.6"           fill="rgba(255,255,255,.9)"/>
      {/* Half-close lid on right eye */}
      <path d="M28.5 20 Q37 18.5 45.5 20" fill="#1A0A02"/>
      {/* Strong V-shaped furrowed brows — nearly touching at center */}
      <path d="M9.5 17.5 Q15 14 22 16.5" stroke="#5A2008" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <path d="M34 16.5 Q41 14 46.5 17.5" stroke="#5A2008" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      {/* Inner brow crease marks */}
      <line x1="21.5" y1="16" x2="22.5" y2="18.5" stroke="#5A2008" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="34.5" y1="16" x2="33.5" y2="18.5" stroke="#5A2008" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Intense gritted grin */}
      <path d="M19 42 Q28 46 37 42" fill="#8C2006"/>
      <path d="M19 42 Q28 44.5 37 42" fill="white"/>
      {/* Steam lines from head (thinking so hard) */}
      <line x1="6"  y1="20" x2="2"  y2="14" stroke="#FF8020" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/>
      <line x1="4"  y1="24" x2="-1" y2="20" stroke="#FF8020" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/>
      <line x1="50" y1="20" x2="54" y2="14" stroke="#FF8020" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/>
      <line x1="52" y1="24" x2="57" y2="20" stroke="#FF8020" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/>
    </>)}

    {/* ── SHOCKED ── */}
    {expr === 'shocked' && (<>
      {/* Eyes blown WIDE — tiny pupils (fear/shock) */}
      <ellipse cx="19" cy="25" rx="11" ry="13" fill="#1A0A02"/>
      <ellipse cx="19" cy="25" rx="9.5" ry="11.5" fill="white"/>
      <ellipse cx="19" cy="25" rx="7"  ry="8.5"   fill="url(#G_iris_shock)"/>
      <circle  cx="19" cy="25" r="2.5"             fill="#1A1000"/>
      <circle  cx="21" cy="22.5" r="1.4"           fill="rgba(255,255,255,.95)"/>
      {/* Shocked highlight ring */}
      <ellipse cx="19" cy="25" rx="9.5" ry="11.5" fill="none" stroke="rgba(255,220,40,.35)" strokeWidth="2"/>

      <ellipse cx="37" cy="25" rx="11" ry="13" fill="#1A0A02"/>
      <ellipse cx="37" cy="25" rx="9.5" ry="11.5" fill="white"/>
      <ellipse cx="37" cy="25" rx="7"  ry="8.5"   fill="url(#G_iris_shock)"/>
      <circle  cx="37" cy="25" r="2.5"             fill="#1A1000"/>
      <circle  cx="39" cy="22.5" r="1.4"           fill="rgba(255,255,255,.95)"/>
      <ellipse cx="37" cy="25" rx="9.5" ry="11.5" fill="none" stroke="rgba(255,220,40,.35)" strokeWidth="2"/>

      {/* Brows shot UP — as high as physically possible */}
      <path d="M8 11 Q18.5 7 25 10"   stroke="#7A3A10" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      <path d="M31 10 Q37.5 7 48 11"  stroke="#7A3A10" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      {/* Dropped jaw — wide screaming O */}
      <ellipse cx="28" cy="44" rx="7"  ry="6.5"  fill="#8C2006"/>
      <ellipse cx="28" cy="43" rx="5"  ry="4.5"  fill="#5A1008"/>
      <ellipse cx="28" cy="42.5" rx="2.8" ry="2.5" fill="#380804"/>
      {/* Exclamation dots */}
      <circle cx="5"  cy="10" r="1.8" fill="#FFD020" opacity=".9"/>
      <circle cx="5"  cy="15" r="1.8" fill="#FFD020" opacity=".9"/>
      <circle cx="51" cy="10" r="1.8" fill="#FFD020" opacity=".9"/>
      <circle cx="51" cy="15" r="1.8" fill="#FFD020" opacity=".9"/>
      {/* Sweat drop */}
      <path d="M48 32 Q50 37 48 40 Q46 37 48 32Z" fill="#80C8FF" opacity=".7"/>
      {/* Shock lines */}
      <line x1="5"  y1="28" x2="0"  y2="25" stroke="#FFD020" strokeWidth="1.6" strokeLinecap="round" opacity=".65"/>
      <line x1="51" y1="28" x2="56" y2="25" stroke="#FFD020" strokeWidth="1.6" strokeLinecap="round" opacity=".65"/>
    </>)}
  </svg>
);

/* =====================================================
   SuyaSkewer — Realistic meat skewer
   ===================================================== */
const SuyaSkewer: React.FC<{ idx: number }> = ({ idx }) => {
  const id = `s${idx}`;
  const chunks = [4, 19, 34, 49];
  return (
    <svg width="15" height="80" viewBox="0 0 15 80" className={`suya-skewer skewer-${idx + 1}`}>
      <defs>
        <linearGradient id={`wd${id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor="#4E2810"/>
          <stop offset="30%"  stopColor="#7A4825"/>
          <stop offset="60%"  stopColor="#9B6035"/>
          <stop offset="100%" stopColor="#5A3018"/>
        </linearGradient>
        <linearGradient id={`ma${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#C45030"/>
          <stop offset="45%"  stopColor="#8B2010"/>
          <stop offset="100%" stopColor="#5A1208"/>
        </linearGradient>
        <linearGradient id={`mb${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="#D46838"/>
          <stop offset="45%"  stopColor="#9B2A14"/>
          <stop offset="100%" stopColor="#6A1A0C"/>
        </linearGradient>
      </defs>
      <rect x="6" y="0" width="3" height="76" rx="1.5" fill={`url(#wd${id})`}/>
      <line x1="6.8" y1="8"  x2="6.8" y2="20"  stroke="rgba(0,0,0,.17)" strokeWidth=".4" strokeLinecap="round"/>
      <line x1="8"   y1="32" x2="8"   y2="46"  stroke="rgba(0,0,0,.12)" strokeWidth=".4" strokeLinecap="round"/>
      <polygon points="6,73 9,73 7.5,80" fill="#3C1A08"/>
      {chunks.map((y, i) => (
        <g key={i} className={`meat-piece piece-${i}`}>
          <rect x="1" y={y} width="13" height="12" rx="3" fill={i%2===0 ? `url(#ma${id})` : `url(#mb${id})`}/>
          <rect x="2" y={y+2.5} width="11" height="1.3" rx=".6" fill="#240A02" opacity=".5"/>
          <rect x="2" y={y+5.5} width="11" height="1.3" rx=".6" fill="#240A02" opacity=".38"/>
          <rect x="2" y={y+8.5} width="11" height="1.1" rx=".6" fill="#240A02" opacity=".28"/>
          <rect x="2.5" y={y} width="5" height="4" rx="1.5" fill="rgba(255,210,130,.36)"/>
          <rect x="7" y={y+3}   width="4" height="1.5" rx=".6" fill="rgba(255,235,200,.25)"/>
        </g>
      ))}
    </svg>
  );
};

/* =====================================================
   Whoosh effect utilities
   ===================================================== */
const WHOOSH_DUR = 420;

function spawnTrails(x: number, y: number): void {
  ['t1', 't2', 't3'].forEach((cls, i) => {
    const el = document.createElement('div');
    el.className = `suya-speed-trail ${cls}`;
    const size = [60, 46, 32][i];
    el.style.cssText = `left:${x + (66 - size) / 2}px;top:${y + (66 - size) / 2}px;width:${size}px;height:${size}px;`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 500);
  });
}

function spawnSpeedLines(fromX: number, fromY: number, toX: number, toY: number): void {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const dist  = Math.hypot(dx, dy);

  for (let i = 0; i < 5; i++) {
    const el = document.createElement('div');
    el.className = 'suya-speed-line';
    const offset = (i - 2) * 8;
    const perpX  = -Math.sin(angle * Math.PI / 180) * offset;
    const perpY  =  Math.cos(angle * Math.PI / 180) * offset;
    const len    = dist * (0.5 + Math.random() * 0.4);
    el.style.cssText = `
      left:${fromX + 33 + perpX}px;
      top:${fromY + 33 + perpY}px;
      width:${len}px;
      transform-origin:left center;
      transform:rotate(${angle}deg) scaleX(0);
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), WHOOSH_DUR + 100);
  }
}

/* =====================================================
   SuyaBot — Main component
   ===================================================== */
export const SuyaBot: React.FC<SuyaBotProps> = ({
  isActive       = false,
  isBusy         = false,
  isListening    = false,
  isShocked      = false,
  isThinkingHard = false,
  message,
  onInteraction,
  highlightTarget,
}) => {
  const [pos,         setPos]         = useState<Position>({ x: 20, y: 20, corner: 'bottom-right' });
  const [expr,        setExpr]        = useState<SuyaExpression>('neutral');
  const [showMsg,     setShowMsg]     = useState(false);
  const [hlBox,       setHlBox]       = useState<DOMRect | null>(null);
  const [whooshState, setWhooshState] = useState<'idle' | 'out' | 'in'>('idle');
  const botRef   = useRef<HTMLDivElement>(null);
  const prevPos  = useRef<Position | null>(null);

  /* ── Optimal corner ── */
  const findOptimal = useCallback((): Position => {
    const pad = 20, sz = 70;
    const sw = window.innerWidth, sh = window.innerHeight;
    const occupied = new Set<string>();
    document.querySelectorAll('[data-suya-bot]').forEach(el => {
      if (el === botRef.current) return;
      const r = el.getBoundingClientRect();
      if (r.left < sw/2 && r.top < sh/2)  occupied.add('top-left');
      if (r.left >= sw/2 && r.top < sh/2) occupied.add('top-right');
      if (r.left < sw/2 && r.top >= sh/2) occupied.add('bottom-left');
      if (r.left >= sw/2 && r.top >= sh/2) occupied.add('bottom-right');
    });
    const corners: Corner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    for (const corner of corners) {
      if (!occupied.has(corner)) {
        return {
          corner,
          x: corner.includes('right') ? sw - sz - pad : pad,
          y: corner.includes('bottom') ? sh - sz - pad : pad,
        };
      }
    }
    return { x: sw - sz - pad, y: sh - sz - pad, corner: 'bottom-right' };
  }, []);

  /* ── Position + whoosh on resize ── */
  useEffect(() => {
    const newPos = findOptimal();
    setPos(newPos);
    prevPos.current = newPos;
    const onResize = () => {
      const next = findOptimal();
      triggerWhoosh(prevPos.current!, next);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [findOptimal]);

  /* ── Whoosh locomotion ── */
  const triggerWhoosh = (from: Position, to: Position) => {
    if (!from || (from.x === to.x && from.y === to.y)) { setPos(to); return; }
    // spawn visual effects at old position
    spawnTrails(from.x, from.y);
    spawnSpeedLines(from.x, from.y, to.x, to.y);
    // phase 1: squeeze out
    setWhooshState('out');
    setTimeout(() => {
      // teleport silently to new position
      setPos(to);
      prevPos.current = to;
      // phase 2: burst in
      setWhooshState('in');
      setTimeout(() => setWhooshState('idle'), WHOOSH_DUR);
    }, WHOOSH_DUR * 0.55);
  };

  /* ── Expression derivation ── */
  useEffect(() => {
    if (isBusy)          setExpr('eating');
    else if (isShocked)  setExpr('shocked');
    else if (isThinkingHard) setExpr('thinking_hard');
    else if (isListening) setExpr('listening');
    else if (isActive)   setExpr('happy');
    else                 setExpr('neutral');
  }, [isActive, isBusy, isListening, isShocked, isThinkingHard]);

  /* ── Message timing ── */
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

  /* ── Highlight tracking ── */
  useEffect(() => {
    if (!highlightTarget) { setHlBox(null); return; }
    setHlBox(highlightTarget.getBoundingClientRect());
    const t = setTimeout(() => setHlBox(null), 4000);
    return () => clearTimeout(t);
  }, [highlightTarget]);

  /* ── Interaction ── */
  const handleInteraction = () => {
    if (!isBusy && !isListening && !isShocked) {
      setExpr('happy');
      setTimeout(() => setExpr(isActive ? 'happy' : 'neutral'), 2000);
    }
    onInteraction?.();
  };

  /* ── Demo reposition (public method via ref) ── */
  const reposition = () => {
    const current = prevPos.current || pos;
    // pick a different corner
    const corners: Corner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    const others = corners.filter(c => c !== current.corner);
    const next_corner = others[Math.floor(Math.random() * others.length)];
    const pad = 20, sz = 70;
    const sw = window.innerWidth, sh = window.innerHeight;
    const next: Position = {
      corner: next_corner,
      x: next_corner.includes('right') ? sw - sz - pad : pad,
      y: next_corner.includes('bottom') ? sh - sz - pad : pad,
    };
    triggerWhoosh(current, next);
  };

  const stateClass = [
    isActive      ? 'active'        : '',
    isBusy        ? 'busy'          : '',
    isListening   ? 'listening'     : '',
    isShocked     ? 'shocked'       : '',
    isThinkingHard ? 'thinking-hard' : '',
    whooshState === 'out' ? 'whoosh-out' : '',
    whooshState === 'in'  ? 'whoosh-in'  : '',
  ].filter(Boolean).join(' ');

  return (
    <>
      {/* Overlay */}
      <div className={`suya-overlay ${isActive ? 'active' : ''}`} onClick={handleInteraction}>
        {hlBox && (
          <div className="suya-highlight-wrapper" style={{
            position: 'absolute',
            left: hlBox.left - 18, top: hlBox.top - 18,
            width: hlBox.width + 36, height: hlBox.height + 36,
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
        {isBusy && (
          <div className="suya-grill" aria-hidden>
            <SuyaSkewer idx={0}/>
            <SuyaSkewer idx={1}/>
            <SuyaSkewer idx={2}/>
          </div>
        )}
      </div>

      {/* Bot character */}
      <div
        ref={botRef}
        data-suya-bot="true"
        className={`suya-bot ${stateClass}`}
        style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
        onClick={handleInteraction}
        onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && handleInteraction()}
        role="button"
        tabIndex={0}
        aria-label="Suya Bot"
      >
        {isListening && (<>
          <div className="listen-ring ring-1"/>
          <div className="listen-ring ring-2"/>
          <div className="listen-ring ring-3"/>
        </>)}
        <SuyaFace expr={expr}/>
      </div>
    </>
  );
};

export default SuyaBot;
