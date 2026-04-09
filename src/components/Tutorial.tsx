import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronRight, X, Info } from 'lucide-react';
import { cn } from '../lib/utils';

interface Step {
  targetId: string;
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  action?: () => void;
}

interface TutorialProps {
  steps: Step[];
  onComplete: () => void;
  isOpen: boolean;
}

const EMPTY_COORDS = { top: 0, left: 0, width: 0, height: 0 };
const COMPACT_VIEWPORT_WIDTH = 768;
const COMPACT_VIEWPORT_HEIGHT = 700;
const TARGET_RETRY_DELAY_MS = 140;
const TARGET_RETRY_ATTEMPTS = 6;
const ACTION_SETTLE_DELAY_MS = 220;
const SCROLL_SETTLE_DELAY_MS = 120;
const SPOTLIGHT_PADDING = 10;

export const Tutorial: React.FC<TutorialProps> = ({ steps, onComplete, isOpen }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [coords, setCoords] = useState(EMPTY_COORDS);
  const [hasTarget, setHasTarget] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const retryTimeoutRef = useRef<number | null>(null);

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current !== null) {
      window.clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const syncViewportMode = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const compact = window.innerWidth < COMPACT_VIEWPORT_WIDTH || window.innerHeight < COMPACT_VIEWPORT_HEIGHT;
    setIsCompactViewport(compact);
    return compact;
  }, []);

  const updateCoords = useCallback((runAction = false, attempt = 0) => {
    const step = steps[currentStep];
    if (!step) return;

    clearRetryTimeout();

    const compactViewport = syncViewportMode();
    if (runAction) {
      step.action?.();
    }

    const settleDelay = runAction
      ? ACTION_SETTLE_DELAY_MS
      : attempt > 0
        ? TARGET_RETRY_DELAY_MS
        : compactViewport
          ? 0
          : SCROLL_SETTLE_DELAY_MS;

    retryTimeoutRef.current = window.setTimeout(() => {
      const target = document.getElementById(step.targetId);

      if (!target) {
        if (attempt < TARGET_RETRY_ATTEMPTS) {
          updateCoords(runAction, attempt + 1);
          return;
        }

        setHasTarget(false);
        setCoords(EMPTY_COORDS);
        return;
      }

      target.scrollIntoView({
        behavior: compactViewport ? 'auto' : 'smooth',
        block: 'center',
        inline: 'nearest',
      });

      const rect = target.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        if (attempt < TARGET_RETRY_ATTEMPTS) {
          updateCoords(runAction, attempt + 1);
          return;
        }

        setHasTarget(false);
        setCoords(EMPTY_COORDS);
        return;
      }

      setHasTarget(true);
      setCoords({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    }, settleDelay);
  }, [clearRetryTimeout, currentStep, steps, syncViewportMode]);

  useEffect(() => {
    if (!isOpen) {
      clearRetryTimeout();
      setHasTarget(false);
      setCoords(EMPTY_COORDS);
      return;
    }

    setCurrentStep(0);
  }, [clearRetryTimeout, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    updateCoords(true);

    const handleViewportChange = () => updateCoords(false);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, { passive: true });

    return () => {
      clearRetryTimeout();
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange);
    };
  }, [clearRetryTimeout, currentStep, isOpen, updateCoords]);

  useEffect(() => () => clearRetryTimeout(), [clearRetryTimeout]);

  if (!isOpen || !steps[currentStep]) return null;

  const step = steps[currentStep];
  const showSpotlight = hasTarget && !isCompactViewport;

  const getTooltipPosition = () => {
    switch (step.position) {
      case 'top': return { bottom: '100%', left: '50%', transform: 'translateX(-50%) translateY(-12px)' };
      case 'bottom': return { top: '100%', left: '50%', transform: 'translateX(-50%) translateY(12px)' };
      case 'left': return { right: '100%', top: '50%', transform: 'translateY(-50%) translateX(-12px)' };
      case 'right': return { left: '100%', top: '50%', transform: 'translateY(-50%) translateX(12px)' };
    }
  };

  const renderCard = (cardClassName?: string, cardStyle?: React.CSSProperties, withArrow = false) => (
    <div
      className={cn(
        "z-[101] bg-slate-900/90 border border-indigo-500/30 p-6 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] backdrop-blur-xl w-full max-w-[min(20rem,calc(100vw-2rem))] pointer-events-auto",
        cardClassName
      )}
      style={cardStyle}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 text-indigo-400">
          <Info className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-widest">Step {currentStep + 1} of {steps.length}</span>
        </div>
        <button onClick={onComplete} title="Close tutorial" aria-label="Close tutorial" className="text-slate-500 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded-lg">
          <X className="w-4 h-4" />
        </button>
      </div>

      <h4 className="text-lg font-bold text-white mb-1">{step.title}</h4>
      <p className="text-sm text-slate-400 mb-5 leading-relaxed font-medium">{step.content}</p>

      <div className="flex justify-between items-center gap-3">
        <button
          onClick={onComplete}
          className="text-[10px] text-slate-500 hover:text-slate-300 font-black uppercase tracking-widest transition-colors"
        >
          Skip Tutorial
        </button>
        <button
          onClick={() => {
            if (currentStep < steps.length - 1) {
              setCurrentStep(currentStep + 1);
            } else {
              onComplete();
            }
          }}
          className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 border border-indigo-500 shrink-0"
        >
          {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {withArrow && (
        <div className={cn(
          "absolute w-4 h-4 bg-slate-900 border-l border-t border-indigo-500/30 rotate-45",
          step.position === 'top' && "bottom-[-8px] left-1/2 -translate-x-1/2 border-l-0 border-t-0 border-r border-b",
          step.position === 'bottom' && "top-[-8px] left-1/2 -translate-x-1/2",
          step.position === 'left' && "right-[-8px] top-1/2 -translate-y-1/2 border-l-0 border-t-0 border-r border-b -rotate-45",
          step.position === 'right' && "left-[-8px] top-1/2 -translate-y-1/2 rotate-[225deg]"
        )} />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {showSpotlight ? (
        <>
          <div
            className="absolute inset-x-0 top-0 bg-black/60 transition-opacity duration-300"
            style={{ height: Math.max(coords.top - SPOTLIGHT_PADDING, 0) }}
          />
          <div
            className="absolute inset-x-0 bg-black/60 transition-opacity duration-300"
            style={{ top: coords.top + coords.height + SPOTLIGHT_PADDING, bottom: 0 }}
          />
          <div
            className="absolute left-0 bg-black/60 transition-opacity duration-300"
            style={{
              top: Math.max(coords.top - SPOTLIGHT_PADDING, 0),
              width: Math.max(coords.left - SPOTLIGHT_PADDING, 0),
              height: coords.height + SPOTLIGHT_PADDING * 2,
            }}
          />
          <div
            className="absolute right-0 bg-black/60 transition-opacity duration-300"
            style={{
              top: Math.max(coords.top - SPOTLIGHT_PADDING, 0),
              left: coords.left + coords.width + SPOTLIGHT_PADDING,
              height: coords.height + SPOTLIGHT_PADDING * 2,
            }}
          />
          <div
            className="absolute rounded-2xl border border-amber-400/70 shadow-[0_0_0_1px_rgba(251,191,36,0.35),0_0_32px_rgba(251,191,36,0.28)] transition-all duration-300"
            style={{
              top: coords.top - SPOTLIGHT_PADDING,
              left: coords.left - SPOTLIGHT_PADDING,
              width: coords.width + SPOTLIGHT_PADDING * 2,
              height: coords.height + SPOTLIGHT_PADDING * 2,
            }}
          />

          <motion.div
            layout
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              height: coords.height,
            }}
            className="pointer-events-none"
          >
            {renderCard("absolute", getTooltipPosition(), true)}
          </motion.div>
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-black/70 transition-opacity duration-300" />
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="fixed inset-x-4 bottom-4 sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2"
          >
            {renderCard()}
          </motion.div>
        </>
      )}
    </div>
  );
};
