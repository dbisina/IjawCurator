import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

export const Tutorial: React.FC<TutorialProps> = ({ steps, onComplete, isOpen }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, height: 0 });

  const updateCoords = useCallback(() => {
    const step = steps[currentStep];
    if (!step) return;

    if (step.action) {
      step.action();
    }

    // Give a small delay for DOM updates if action was performed
    setTimeout(() => {
      const target = document.getElementById(step.targetId);
      if (target) {
        const rect = target.getBoundingClientRect();
        setCoords({
          top: rect.top + window.scrollY,
          left: rect.left + window.scrollX,
          width: rect.width,
          height: rect.height
        });
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, step.action ? 100 : 0);
  }, [currentStep, steps]);

  useEffect(() => {
    if (isOpen) {
      updateCoords();
      window.addEventListener('resize', updateCoords);
      return () => window.removeEventListener('resize', updateCoords);
    }
  }, [isOpen, updateCoords]);

  if (!isOpen || !steps[currentStep]) return null;

  const step = steps[currentStep];

  const getTooltipPosition = () => {
    const gap = 12;
    switch (step.position) {
      case 'top': return { bottom: '100%', left: '50%', transform: 'translateX(-50%) translateY(-12px)' };
      case 'bottom': return { top: '100%', left: '50%', transform: 'translateX(-50%) translateY(12px)' };
      case 'left': return { right: '100%', top: '50%', transform: 'translateY(-50%) translateX(-12px)' };
      case 'right': return { left: '100%', top: '50%', transform: 'translateY(-50%) translateX(12px)' };
    }
  };

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Overlay with hole */}
      <div className="absolute inset-0 bg-black/60 transition-opacity duration-500" style={{
        clipPath: `polygon(0% 0%, 0% 100%, ${coords.left}px 100%, ${coords.left}px ${coords.top}px, ${coords.left + coords.width}px ${coords.top}px, ${coords.left + coords.width}px ${coords.top + coords.height}px, ${coords.left}px ${coords.top + coords.height}px, ${coords.left}px 100%, 100% 100%, 100% 0%)`
      }} />

      {/* Tooltip */}
      <motion.div
        layout
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          position: 'absolute',
          top: coords.top,
          left: coords.left,
          width: coords.width,
          height: coords.height,
        }}
        className="pointer-events-none"
      >
        <div 
          className="absolute z-[101] w-80 bg-slate-900/90 border border-indigo-500/30 p-6 rounded-xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] pointer-events-auto backdrop-blur-xl"
          style={getTooltipPosition()}
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
          
          <div className="flex justify-between items-center">
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
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-widest rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/20 active:scale-95 border border-indigo-500"
            >
              {currentStep === steps.length - 1 ? 'Finish' : 'Next'}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Arrow */}
          <div className={cn(
            "absolute w-4 h-4 bg-slate-900 border-l border-t border-indigo-500/30 rotate-45",
            step.position === 'top' && "bottom-[-8px] left-1/2 -track-x-1/2 border-l-0 border-t-0 border-r border-b",
            step.position === 'bottom' && "top-[-8px] left-1/2 -track-x-1/2",
            step.position === 'left' && "right-[-8px] top-1/2 -track-y-1/2 border-l-0 border-t-0 border-r border-b -rotate-45",
            step.position === 'right' && "left-[-8px] top-1/2 -track-y-1/2 rotate-[225deg]"
          )} />
        </div>
      </motion.div>
    </div>
  );
};
