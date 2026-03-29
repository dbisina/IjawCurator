import { useCallback, useRef } from 'react';

/**
 * A hook that provides a function to play a subtle "tick" sound.
 * Useful for hover feedback on interactive elements.
 */
export const useHoverSound = () => {
  const audioCtxRef = useRef<AudioContext | null>(null);

  const playHover = useCallback(() => {
    try {
      // Initialize AudioContext on first use
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioCtxRef.current;
      
      // Resume if suspended (browsers often suspend AudioContext until user interaction)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      // Subtle high-pitched "tick"
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1200, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.04);

      // Very quiet volume
      gainNode.gain.setValueAtTime(0.015, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.04);
    } catch (error) {
      // Silently fail if audio is blocked or not supported
      console.debug('Audio feedback failed:', error);
    }
  }, []);

  return { playHover };
};
