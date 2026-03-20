import React, { useState, useEffect, useRef } from 'react';
import './SuyaBot.css';

export type SuyaExpression =
  | 'neutral' | 'happy' | 'thinking' | 'eating'
  | 'listening' | 'thinking_hard' | 'shocked' | 'sleeping';

export type SuyaMode = 'awake' | 'idle' | 'sleeping';

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface Position {
  x: number;
  y: number;
  corner: Corner;
}

interface SuyaBotProps {
  isActive?: boolean;
  isBusy?: boolean;
  isListening?: boolean;
  isShocked?: boolean;
  isThinkingHard?: boolean;
  mode?: SuyaMode;
  message?: string;
  onInteraction?: () => void;
  highlightTarget?: HTMLElement | null;
  fixedPosition?: Position;
}

const WHOOSH_DUR = 420;

const spawnTrails = (x: number, y: number): void => {
  ['t1', 't2', 't3'].forEach((cls, index) => {
    const trail = document.createElement('div');
    const size = [52, 40, 28][index];
    trail.className = `suya-speed-trail ${cls}`;
    trail.style.cssText = `left:${x + (58 - size) / 2}px;top:${y + (58 - size) / 2}px;width:${size}px;height:${size}px;`;
    document.body.appendChild(trail);
    setTimeout(() => trail.remove(), 500);
  });
};

const spawnSpeedLines = (fromX: number, fromY: number, toX: number, toY: number): void => {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;
  const dist = Math.hypot(dx, dy);

  for (let i = 0; i < 4; i += 1) {
    const line = document.createElement('div');
    const offset = (i - 1.5) * 7;
    const perpX = -Math.sin(angle * Math.PI / 180) * offset;
    const perpY = Math.cos(angle * Math.PI / 180) * offset;
    const len = dist * (0.45 + Math.random() * 0.35);
    line.className = 'suya-speed-line';
    line.style.cssText = `left:${fromX + 29 + perpX}px;top:${fromY + 29 + perpY}px;width:${len}px;transform-origin:left center;transform:rotate(${angle}deg) scaleX(0);`;
    document.body.appendChild(line);
    setTimeout(() => line.remove(), WHOOSH_DUR + 100);
  }
};

const SuyaHands: React.FC<{ expr: SuyaExpression }> = ({ expr }) => {
  if (expr === 'shocked') {
    return (
      <>
        <div className="suya-hand left shocked" aria-hidden />
        <div className="suya-hand right shocked" aria-hidden />
      </>
    );
  }

  if (expr === 'eating') {
    return (
      <>
        <div className="suya-hand left eating" aria-hidden />
        <div className="suya-hand right eating" aria-hidden>
          <div className="suya-hand-skewer">
            <span className="meat meat-1" />
            <span className="meat meat-2" />
            <span className="stick" />
          </div>
        </div>
      </>
    );
  }

  return null;
};

const SuyaFace: React.FC<{ expr: SuyaExpression }> = ({ expr }) => (
  <svg width="46" height="44" viewBox="0 0 56 54" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="G_skin" cx="38%" cy="28%" r="68%">
        <stop offset="0%" stopColor="#FFF0DC"/>
        <stop offset="50%" stopColor="#FFD49A"/>
        <stop offset="100%" stopColor="#F0A860"/>
      </radialGradient>
      <radialGradient id="G_iris" cx="28%" cy="25%" r="68%">
        <stop offset="0%" stopColor="#7EC4F4"/>
        <stop offset="50%" stopColor="#1E6EC0"/>
        <stop offset="100%" stopColor="#0C3880"/>
      </radialGradient>
      <radialGradient id="G_iris_shock" cx="28%" cy="25%" r="68%">
        <stop offset="0%" stopColor="#FFE87A"/>
        <stop offset="50%" stopColor="#F0B000"/>
        <stop offset="100%" stopColor="#B07000"/>
      </radialGradient>
      <radialGradient id="G_iris_listen" cx="28%" cy="25%" r="68%">
        <stop offset="0%" stopColor="#B0ECFF"/>
        <stop offset="50%" stopColor="#18B0E8"/>
        <stop offset="100%" stopColor="#0870B8"/>
      </radialGradient>
      <radialGradient id="G_iris_focus" cx="28%" cy="25%" r="68%">
        <stop offset="0%" stopColor="#FF9858"/>
        <stop offset="50%" stopColor="#D84010"/>
        <stop offset="100%" stopColor="#801808"/>
      </radialGradient>
      <radialGradient id="G_blush" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="rgba(255,110,80,.45)"/>
        <stop offset="100%" stopColor="rgba(255,110,80,0)"/>
      </radialGradient>
      <radialGradient id="G_orb" cx="32%" cy="28%" r="65%">
        <stop offset="0%" stopColor="#FFE070"/>
        <stop offset="100%" stopColor="#FF6B1A"/>
      </radialGradient>
    </defs>

    <line x1="28" y1="4.5" x2="28" y2="10" stroke="#C8804A" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="28" cy="3.2" r="2.8" fill="url(#G_orb)"/>
    <circle cx="26.8" cy="2.2" r="0.9" fill="rgba(255,255,255,.65)"/>
    <circle cx="28" cy="30" r="24" fill="url(#G_skin)" stroke="#D88040" strokeWidth="1"/>
    <ellipse cx="22" cy="20" rx="9" ry="5" fill="rgba(255,255,255,.15)" transform="rotate(-14 22 20)"/>

    {expr === 'neutral' && (<>
      <ellipse cx="19" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="8" ry="9" fill="white"/>
      <ellipse cx="19" cy="27" rx="5.5" ry="6" fill="url(#G_iris)"/>
      <circle cx="19" cy="27" r="3.2" fill="#05152A"/>
      <circle cx="21" cy="24.2" r="1.8" fill="rgba(255,255,255,.95)"/>
      <circle cx="17.5" cy="28.8" r=".7" fill="rgba(255,255,255,.4)"/>
      <ellipse cx="37" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="8" ry="9" fill="white"/>
      <ellipse cx="37" cy="27" rx="5.5" ry="6" fill="url(#G_iris)"/>
      <circle cx="37" cy="27" r="3.2" fill="#05152A"/>
      <circle cx="39" cy="24.2" r="1.8" fill="rgba(255,255,255,.95)"/>
      <circle cx="35.5" cy="28.8" r=".7" fill="rgba(255,255,255,.4)"/>
      <path d="M10.5 16 Q18.5 13.5 24.5 15.5" stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M31.5 15.5 Q37.5 13.5 45.5 16" stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M21 42 Q28 44.5 35 42" stroke="#A04820" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
    </>)}

    {expr === 'happy' && (<>
      <ellipse cx="19" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="8" ry="9" fill="white"/>
      <path d="M10.5 27 Q19 18 27.5 27" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="8" ry="9" fill="white"/>
      <path d="M28.5 27 Q37 18 45.5 27" fill="#1A0A02"/>
      <path d="M10 14 Q18.5 10.5 25 13" stroke="#7A3A10" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <path d="M31 13 Q37.5 10.5 46 14" stroke="#7A3A10" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <path d="M17 40 Q28 50 39 40" stroke="#903A14" strokeWidth="2.4" strokeLinecap="round" fill="none"/>
      <ellipse cx="9" cy="34" rx="5.5" ry="4" fill="url(#G_blush)"/>
      <ellipse cx="47" cy="34" rx="5.5" ry="4" fill="url(#G_blush)"/>
      <path d="M45 8 L46 6 L47 8 L45 9 Z" fill="#FFD060" opacity=".75"/>
    </>)}

    {expr === 'thinking' && (<>
      <ellipse cx="19" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="8" ry="9" fill="white"/>
      <ellipse cx="19" cy="27" rx="5.5" ry="6" fill="url(#G_iris)"/>
      <circle cx="19" cy="27" r="3.2" fill="#05152A"/>
      <circle cx="21" cy="24.2" r="1.8" fill="rgba(255,255,255,.95)"/>
      <ellipse cx="37" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="8" ry="9" fill="white"/>
      <ellipse cx="35" cy="25" rx="5.5" ry="6" fill="url(#G_iris)"/>
      <circle cx="34" cy="24" r="3.2" fill="#05152A"/>
      <circle cx="35.5" cy="22.5" r="1.8" fill="rgba(255,255,255,.95)"/>
      <path d="M10.5 16 Q18.5 13.5 24.5 15.5" stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M31.5 13 Q37.5 10 45.5 12.5" stroke="#7A3A10" strokeWidth="2.8" strokeLinecap="round" fill="none"/>
      <path d="M19 42 Q24 40.5 28 42 Q31 43.5 34 41" stroke="#A04820" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <circle cx="43" cy="16" r="1.6" fill="#FFD4A0" opacity=".6"/>
      <circle cx="47" cy="11" r="2.2" fill="#FFD4A0" opacity=".72"/>
      <circle cx="51" cy="7" r="2.9" fill="#FFD4A0" opacity=".82"/>
    </>)}

    {expr === 'eating' && (<>
      <ellipse cx="19" cy="26" rx="10" ry="11.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="26" rx="8.5" ry="10" fill="white"/>
      <ellipse cx="19" cy="26" rx="6" ry="7" fill="url(#G_iris)"/>
      <circle cx="19" cy="26" r="3.5" fill="#05152A"/>
      <circle cx="21.2" cy="23" r="2.1" fill="rgba(255,255,255,.95)"/>
      <ellipse cx="37" cy="26" rx="10" ry="11.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="26" rx="8.5" ry="10" fill="white"/>
      <ellipse cx="37" cy="26" rx="6" ry="7" fill="url(#G_iris)"/>
      <circle cx="37" cy="26" r="3.5" fill="#05152A"/>
      <circle cx="39.2" cy="23" r="2.1" fill="rgba(255,255,255,.95)"/>
      <path d="M9.5 14 Q18 11 24.5 13.5" stroke="#8A3A08" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      <path d="M31.5 13.5 Q38 11 46.5 14" stroke="#8A3A08" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      <path d="M16 40 Q28 52 40 40" fill="#8C2006"/>
      <path d="M16 40 Q28 43 40 40" fill="white"/>
      <ellipse cx="28" cy="46.5" rx="5.5" ry="3.5" fill="#FF7070"/>
      <ellipse cx="28" cy="46" rx="3.2" ry="2" fill="#D83030" opacity=".4"/>
      <ellipse cx="8" cy="33" rx="5.5" ry="4.5" fill="url(#G_blush)"/>
      <ellipse cx="48" cy="33" rx="5.5" ry="4.5" fill="url(#G_blush)"/>
    </>)}

    {expr === 'listening' && (<>
      <ellipse cx="19" cy="27" rx="10.5" ry="12" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="9" ry="10.5" fill="white"/>
      <ellipse cx="19" cy="27" rx="6.5" ry="7.5" fill="url(#G_iris_listen)"/>
      <circle cx="19" cy="27" r="4" fill="#021C30"/>
      <circle cx="21.5" cy="23.8" r="2.2" fill="rgba(255,255,255,.95)"/>
      <ellipse cx="37" cy="27" rx="10.5" ry="12" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="9" ry="10.5" fill="white"/>
      <ellipse cx="37" cy="27" rx="6.5" ry="7.5" fill="url(#G_iris_listen)"/>
      <circle cx="37" cy="27" r="4" fill="#021C30"/>
      <circle cx="39.5" cy="23.8" r="2.2" fill="rgba(255,255,255,.95)"/>
      <path d="M10 15.5 Q18.5 13 25 15" stroke="#6898B8" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
      <path d="M31 15 Q37.5 13 46 15.5" stroke="#6898B8" strokeWidth="2.6" strokeLinecap="round" fill="none"/>
      <ellipse cx="28" cy="43" rx="4.2" ry="3.5" fill="#8C3010"/>
      <ellipse cx="28" cy="42.5" rx="2.6" ry="2.2" fill="#5A1808"/>
    </>)}

    {expr === 'thinking_hard' && (<>
      <ellipse cx="19" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="19" cy="27" rx="8" ry="9" fill="white"/>
      <ellipse cx="19" cy="27" rx="5.5" ry="6" fill="url(#G_iris_focus)"/>
      <circle cx="19" cy="27" r="3.2" fill="#200408"/>
      <circle cx="20.8" cy="24.5" r="1.6" fill="rgba(255,255,255,.9)"/>
      <path d="M10.5 20 Q19 18.5 27.5 20" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="9.5" ry="10.5" fill="#1A0A02"/>
      <ellipse cx="37" cy="27" rx="8" ry="9" fill="white"/>
      <ellipse cx="39" cy="25" rx="5.5" ry="6" fill="url(#G_iris_focus)"/>
      <circle cx="40" cy="24" r="3.2" fill="#200408"/>
      <circle cx="41.5" cy="22" r="1.6" fill="rgba(255,255,255,.9)"/>
      <path d="M28.5 20 Q37 18.5 45.5 20" fill="#1A0A02"/>
      <path d="M9.5 17.5 Q15 14 22 16.5" stroke="#5A2008" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <path d="M34 16.5 Q41 14 46.5 17.5" stroke="#5A2008" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
      <line x1="21.5" y1="16" x2="22.5" y2="18.5" stroke="#5A2008" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="34.5" y1="16" x2="33.5" y2="18.5" stroke="#5A2008" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M19 42 Q28 46 37 42" fill="#8C2006"/>
      <path d="M19 42 Q28 44.5 37 42" fill="white"/>
      <line x1="6" y1="20" x2="2" y2="14" stroke="#FF8020" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/>
      <line x1="4" y1="24" x2="-1" y2="20" stroke="#FF8020" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/>
      <line x1="50" y1="20" x2="54" y2="14" stroke="#FF8020" strokeWidth="1.5" strokeLinecap="round" opacity=".7"/>
      <line x1="52" y1="24" x2="57" y2="20" stroke="#FF8020" strokeWidth="1.2" strokeLinecap="round" opacity=".5"/>
    </>)}

    {expr === 'shocked' && (<>
      <ellipse cx="19" cy="25" rx="11" ry="13" fill="#1A0A02"/>
      <ellipse cx="19" cy="25" rx="9.5" ry="11.5" fill="white"/>
      <ellipse cx="19" cy="25" rx="7" ry="8.5" fill="url(#G_iris_shock)"/>
      <circle cx="19" cy="25" r="2.5" fill="#1A1000"/>
      <circle cx="21" cy="22.5" r="1.4" fill="rgba(255,255,255,.95)"/>
      <ellipse cx="19" cy="25" rx="9.5" ry="11.5" fill="none" stroke="rgba(255,220,40,.35)" strokeWidth="2"/>
      <ellipse cx="37" cy="25" rx="11" ry="13" fill="#1A0A02"/>
      <ellipse cx="37" cy="25" rx="9.5" ry="11.5" fill="white"/>
      <ellipse cx="37" cy="25" rx="7" ry="8.5" fill="url(#G_iris_shock)"/>
      <circle cx="37" cy="25" r="2.5" fill="#1A1000"/>
      <circle cx="39" cy="22.5" r="1.4" fill="rgba(255,255,255,.95)"/>
      <ellipse cx="37" cy="25" rx="9.5" ry="11.5" fill="none" stroke="rgba(255,220,40,.35)" strokeWidth="2"/>
      <path d="M8 11 Q18.5 7 25 10" stroke="#7A3A10" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      <path d="M31 10 Q37.5 7 48 11" stroke="#7A3A10" strokeWidth="3.2" strokeLinecap="round" fill="none"/>
      <ellipse cx="28" cy="44" rx="4.1" ry="3.8" fill="#8C2006"/>
      <ellipse cx="28" cy="43.5" rx="2.6" ry="2.2" fill="#5A1008"/>
      <circle cx="5" cy="10" r="1.8" fill="#FFD020" opacity=".9"/>
      <circle cx="51" cy="10" r="1.8" fill="#FFD020" opacity=".9"/>
    </>)}

    {expr === 'sleeping' && (<>
      <path d="M11 27 Q18 23.5 25 27" stroke="#6A3412" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M31 27 Q38 23.5 45 27" stroke="#6A3412" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
      <path d="M22 42 Q28 45 34 42" stroke="#A04820" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
      <path d="M42 11 L47 11 L43 16 L48 16" stroke="#7EC4F4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </>)}
  </svg>
);

export const SuyaBot: React.FC<SuyaBotProps> = ({
  isActive = false,
  isBusy = false,
  isListening = false,
  isShocked = false,
  isThinkingHard = false,
  mode = 'idle',
  message,
  onInteraction,
  highlightTarget,
  fixedPosition
}) => {
  const [position, setPosition] = useState<Position>(fixedPosition ?? { x: 20, y: 20, corner: 'bottom-right' });
  const [expression, setExpression] = useState<SuyaExpression>('neutral');
  const [showMessage, setShowMessage] = useState(false);
  const [highlightBox, setHighlightBox] = useState<DOMRect | null>(null);
  const [whooshState, setWhooshState] = useState<'idle' | 'out' | 'in'>('idle');
  const botRef = useRef<HTMLDivElement>(null);
  const previousPosition = useRef<Position | null>(null);

  const findOptimalPosition = (): Position => {
    const padding = 20;
    const botSize = 58;
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;
    const occupiedPositions = new Set<string>();

    document.querySelectorAll('[data-suya-bot]').forEach((element) => {
      if (element === botRef.current) {
        return;
      }

      const rect = element.getBoundingClientRect();
      if (rect.left < screenWidth / 2 && rect.top < screenHeight / 2) occupiedPositions.add('top-left');
      if (rect.left >= screenWidth / 2 && rect.top < screenHeight / 2) occupiedPositions.add('top-right');
      if (rect.left < screenWidth / 2 && rect.top >= screenHeight / 2) occupiedPositions.add('bottom-left');
      if (rect.left >= screenWidth / 2 && rect.top >= screenHeight / 2) occupiedPositions.add('bottom-right');
    });

    const corners: Corner[] = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
    for (const corner of corners) {
      if (!occupiedPositions.has(corner)) {
        return {
          corner,
          x: corner.includes('right') ? screenWidth - botSize - padding : padding,
          y: corner.includes('bottom') ? screenHeight - botSize - padding : padding
        };
      }
    }

    return { x: screenWidth - botSize - padding, y: screenHeight - botSize - padding, corner: 'bottom-right' };
  };

  useEffect(() => {
    if (fixedPosition) {
      setPosition(fixedPosition);
      previousPosition.current = fixedPosition;
      return;
    }

    const nextPosition = findOptimalPosition();
    setPosition(nextPosition);
    previousPosition.current = nextPosition;

    const handleResize = () => {
      const current = previousPosition.current;
      const next = findOptimalPosition();

      if (!current) {
        setPosition(next);
        previousPosition.current = next;
        return;
      }

      if (current.x === next.x && current.y === next.y) {
        return;
      }

      spawnTrails(current.x, current.y);
      spawnSpeedLines(current.x, current.y, next.x, next.y);
      setWhooshState('out');

      window.setTimeout(() => {
        setPosition(next);
        previousPosition.current = next;
        setWhooshState('in');
        window.setTimeout(() => setWhooshState('idle'), WHOOSH_DUR);
      }, WHOOSH_DUR * 0.55);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [fixedPosition]);

  useEffect(() => {
    if (mode === 'sleeping') {
      setExpression('sleeping');
      return;
    }

    if (isBusy) {
      setExpression('eating');
      return;
    }

    if (isShocked) {
      setExpression('shocked');
      return;
    }

    if (isThinkingHard) {
      setExpression('thinking_hard');
      return;
    }

    if (isListening) {
      setExpression('listening');
      return;
    }

    if (isActive || mode === 'awake') {
      setExpression('happy');
      return;
    }

    setExpression('neutral');
  }, [isActive, isBusy, isListening, isShocked, isThinkingHard, mode]);

  useEffect(() => {
    if (!message) {
      setShowMessage(false);
      return;
    }

    const timer = window.setTimeout(() => setShowMessage(true), 450);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!showMessage) {
      return;
    }

    const timer = window.setTimeout(() => setShowMessage(false), 5200);
    return () => window.clearTimeout(timer);
  }, [showMessage]);

  useEffect(() => {
    if (!highlightTarget) {
      setHighlightBox(null);
      return;
    }

    setHighlightBox(highlightTarget.getBoundingClientRect());
    const timer = window.setTimeout(() => setHighlightBox(null), 3600);
    return () => window.clearTimeout(timer);
  }, [highlightTarget]);

  const handleInteraction = () => {
    onInteraction?.();
  };

  const stateClass = [
    isActive || mode === 'awake' ? 'active' : '',
    isBusy ? 'busy' : '',
    isListening ? 'listening' : '',
    isShocked ? 'shocked' : '',
    isThinkingHard ? 'thinking-hard' : '',
    mode === 'sleeping' ? 'sleeping' : '',
    mode === 'idle' ? 'idle' : '',
    whooshState === 'out' ? 'whoosh-out' : '',
    whooshState === 'in' ? 'whoosh-in' : ''
  ].filter(Boolean).join(' ');

  return (
    <>
      <div className={`suya-overlay ${isActive ? 'active' : ''}`} onClick={handleInteraction}>
        {highlightBox && (
          <div
            className="suya-highlight-wrapper"
            style={{
              position: 'absolute',
              left: highlightBox.left - 14,
              top: highlightBox.top - 14,
              width: highlightBox.width + 28,
              height: highlightBox.height + 28
            }}
          >
            <div className="vignette-frame" />
          </div>
        )}
        {showMessage && message && (
          <div className="suya-bubble">
            <div className="bubble-top-accent" />
            <div className="bubble-icon" aria-hidden>🍢</div>
            <div className="bubble-content">{message}</div>
            <div className="bubble-tail" />
          </div>
        )}
      </div>

      <div
        ref={botRef}
        data-suya-bot="true"
        className={`suya-bot ${stateClass}`}
        style={{ left: `${position.x}px`, top: `${position.y}px` }}
        onClick={handleInteraction}
        onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && handleInteraction()}
        role="button"
        tabIndex={0}
        aria-label={`Suya Bot ${mode}`}
      >
        {isListening && (
          <>
            <div className="listen-ring ring-1" />
            <div className="listen-ring ring-2" />
            <div className="listen-ring ring-3" />
          </>
        )}
        <SuyaHands expr={expression} />
        <SuyaFace expr={expression} />
      </div>
    </>
  );
};

export default SuyaBot;
