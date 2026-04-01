import React, { useState, useRef, useEffect } from 'react';
import { SPECIAL_CHARS } from '../constants';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface VirtualKeyboardProps {
  onInput: (char: string) => void;
  onBackspace: () => void;
  onEnter?: () => void;
  className?: string;
}

const ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm']
];

export const VirtualKeyboard: React.FC<VirtualKeyboardProps> = ({ onInput, onBackspace, onEnter, className }) => {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [showAccents, setShowAccents] = useState<string | null>(null);
  const [isUppercase, setIsUppercase] = useState(false);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const isLongPressTriggered = useRef(false);

  const handlePressStart = (key: string) => {
    setActiveKey(key);
    isLongPressTriggered.current = false;
    
    // Close any existing accent menu if starting a new press on a different key
    if (showAccents && showAccents !== key) {
      setShowAccents(null);
    }

    longPressTimer.current = setTimeout(() => {
      if (SPECIAL_CHARS[key.toLowerCase()]) {
        setShowAccents(key);
        isLongPressTriggered.current = true;
      }
    }, 400); // Slightly faster long-press
  };

  const handlePressEnd = (key: string) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (!isLongPressTriggered.current) {
      // If the menu was already open for this key, and we just clicked it, close it
      if (showAccents === key) {
        setShowAccents(null);
      } else {
        onInput(isUppercase ? key.toUpperCase() : key);
      }
    }

    setActiveKey(null);
  };

  const handleAccentSelect = (accent: string) => {
    onInput(isUppercase ? accent.toUpperCase() : accent);
    setShowAccents(null);
  };

  useEffect(() => {
    const handleClickOutside = () => setShowAccents(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  return (
    <div className={cn("bg-slate-900/95 backdrop-blur-xl p-4 rounded-xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] select-none border border-slate-800/50", className)} onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-col gap-2.5">
        {ROWS.map((row, i) => (
          <div key={i} className="flex justify-center gap-1.5 sm:gap-2">
            {row.map((key) => {
              const hasAccents = !!SPECIAL_CHARS[key.toLowerCase()];
              return (
                <div key={key} className="relative">
                  <button
                    onMouseDown={(e) => { e.preventDefault(); handlePressStart(key); }}
                    onMouseUp={(e) => { e.preventDefault(); handlePressEnd(key); }}
                    onMouseLeave={() => {
                      if (longPressTimer.current) {
                        clearTimeout(longPressTimer.current);
                        longPressTimer.current = null;
                      }
                      setActiveKey(null);
                    }}
                    onTouchStart={(e) => { e.preventDefault(); handlePressStart(key); }}
                    onTouchEnd={(e) => { e.preventDefault(); handlePressEnd(key); }}
                    className={cn(
                      "w-9 h-11 sm:w-12 sm:h-16 bg-slate-800 text-slate-100 rounded-xl flex items-center justify-center font-black transition-all relative active:scale-95 touch-none border border-slate-700/30 shadow-sm",
                      activeKey === key && "bg-slate-700 ring-2 ring-indigo-500/50 scale-105 z-10",
                      showAccents === key && "bg-indigo-600/20 border-indigo-500/50",
                      hasAccents && "after:content-[''] after:absolute after:top-1.5 after:right-1.5 after:w-1 after:h-1 after:bg-slate-500 after:rounded-full shadow-inner"
                    )}
                  >
                    {isUppercase ? key.toUpperCase() : key}
                  </button>
                  <AnimatePresence>
                    {showAccents === key && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.9 }}
                        animate={{ opacity: 1, y: -10, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className={cn(
                          "absolute bottom-full z-50 bg-slate-900/95 backdrop-blur-2xl border border-slate-800/50 p-2 rounded-xl flex flex-wrap gap-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.6)] min-w-max max-w-[280px] sm:max-w-[400px]",
                          // Simple logic to keep menu on screen for edge keys
                          i === 0 && row.indexOf(key) > 7 ? "right-0" : 
                          i === 0 && row.indexOf(key) < 2 ? "left-0" : "left-1/2 -translate-x-1/2"
                        )}
                      >
                        {SPECIAL_CHARS[key.toLowerCase()].map((accent) => (
                          <button
                            key={accent}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAccentSelect(accent);
                            }}
                            className="w-10 h-12 sm:w-12 sm:h-14 bg-slate-800/80 text-white rounded-xl flex items-center justify-center hover:bg-indigo-600 hover:scale-110 transition-all text-xl font-black shadow-inner border border-slate-700/50"
                          >
                            {isUppercase ? accent.toUpperCase() : accent}
                          </button>
                        ))}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowAccents(null);
                          }}
                          className="w-10 h-12 sm:w-12 sm:h-14 bg-red-500/10 text-red-400 rounded-xl flex items-center justify-center hover:bg-red-500/20 transition-all text-sm font-bold"
                          title="Close"
                        >
                          ✕
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        ))}
        <div className="flex justify-center gap-1.5 mt-1">
          <button
            onClick={() => setIsUppercase(!isUppercase)}
            className={cn(
              "px-5 h-10 sm:h-14 rounded-xl flex items-center justify-center font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 border",
              isUppercase ? "bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20" : "bg-slate-800 text-slate-400 border-slate-700/50 hover:bg-slate-700 hover:text-slate-100"
            )}
          >
            Shift
          </button>
          <button
            onClick={onBackspace}
            className="px-5 h-10 sm:h-14 bg-slate-800 text-slate-100 rounded-xl flex items-center justify-center font-black text-[10px] uppercase tracking-widest active:bg-slate-700 active:scale-95 border border-slate-700/50 hover:bg-red-900/20 hover:text-red-400 hover:border-red-500/30 transition-all"
          >
            Backspace
          </button>
          <button
            onClick={() => onInput(' ')}
            className="flex-1 h-10 sm:h-14 bg-slate-800 text-slate-100 rounded-xl flex items-center justify-center font-black text-[10px] uppercase tracking-[0.3em] active:bg-slate-700 active:scale-95 border border-slate-700/50 hover:bg-slate-700/50 transition-all shadow-inner"
          >
            Space
          </button>
          {onEnter && (
            <button
              onClick={onEnter}
              className="px-6 h-10 sm:h-14 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-[10px] uppercase tracking-widest active:bg-indigo-500 active:scale-95 border border-indigo-500 shadow-lg shadow-indigo-500/20 transition-all"
            >
              Enter
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
