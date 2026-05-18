import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  RefreshCw,
  Volume2,
  Check,
  Plus,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  Loader2,
} from 'lucide-react';
import { auth, communityVoteWord } from '../firebase';
import { cn } from '../lib/utils';
import { useHoverSound } from '../hooks/useHoverSound';
import { VoiceRecorder } from './VoiceRecorder';
import { generateSpeech } from '../services/geminiService';
import { AGREEMENT_THRESHOLD } from '../constants';
import { WordEntry, CorrectionEntry } from '../types';

interface WordCardProps {
  key?: string | number;
  word: WordEntry;
  index: number;
  isAdmin?: boolean;
  pendingCorrection?: CorrectionEntry;
  approvedCorrection?: CorrectionEntry;
  onFlag: () => void;
  onUnflag: () => void;
  onVerify?: () => void;
  onInlineCorrect: (word: string, meaning: string, pronunciation: string, audioUrl?: string) => Promise<void>;
  onAgree?: (correctionId: string) => void;
  currentUserId?: string;
  onVote?: (wordId: string, vote: 'up' | 'down') => void;
}

export const WordCard = ({
  word,
  index,
  isAdmin,
  pendingCorrection,
  approvedCorrection,
  onFlag,
  onUnflag,
  onVerify,
  onInlineCorrect,
  onAgree,
  currentUserId,
  onVote,
}: WordCardProps) => {
  const { playHover } = useHoverSound();
  const [isEditing, setIsEditing] = useState(false);
  const [editedWord, setEditedWord] = useState(word.word);
  const [editedPronunciation, setEditedPronunciation] = useState(word.pronunciation);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [uploadedAudioUrl, setUploadedAudioUrl] = useState<string | null>(null);
  const [isCompleting, setIsCompleting] = useState(false);

  const handlePlay = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      // Always prefer human-recorded audio when available
      if (word.audioUrl) {
        const audio = new Audio(word.audioUrl);
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => {
          setIsPlaying(false);
          toast.error("Failed to play audio sample");
        };
        audio.play().catch(() => { setIsPlaying(false); toast.error("Failed to play audio"); });
        return;
      }

      // For manually entered words with no uploaded audio, don't use AI TTS
      if (!word.isAiGenerated) {
        setIsPlaying(false);
        toast.info("No audio recorded for this word yet. Edit and record a pronunciation to add one.");
        return;
      }

      const base64 = await generateSpeech(editedWord);

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Int16Array(len / 2);
      for (let i = 0; i < len; i += 2) {
        bytes[i / 2] = (binaryString.charCodeAt(i + 1) << 8) | binaryString.charCodeAt(i);
      }

      const audioBuffer = audioContext.createBuffer(1, bytes.length, 24000);
      const channelData = audioBuffer.getChannelData(0);
      for (let i = 0; i < bytes.length; i++) {
        channelData[i] = bytes[i] / 32768;
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      source.onended = () => setIsPlaying(false);
      source.start();
    } catch (error) {
      console.error("Playback error:", error);
      // Fallback: browser Web Speech API
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(editedWord);
        utterance.lang = 'en';
        utterance.rate = 0.85;
        utterance.onend = () => setIsPlaying(false);
        utterance.onerror = () => setIsPlaying(false);
        window.speechSynthesis.speak(utterance);
      } else {
        toast.error("Failed to play pronunciation");
        setIsPlaying(false);
      }
    }
  };

  const statusColors = {
    pending: "border-slate-800/50 bg-slate-900/30",
    verified: "border-emerald-500/30 bg-emerald-500/5",
    flagged: "border-red-500/30 bg-red-500/5"
  };

  const handleSubmit = async () => {
    if (isSubmitting || !editedWord.trim()) {
      if (!editedWord.trim()) toast.error("Word cannot be empty");
      return;
    }
    setIsSubmitting(true);
    try {
      await onInlineCorrect(editedWord, word.meaning, editedPronunciation, uploadedAudioUrl || undefined);
      setIsEditing(false);
      setUploadedAudioUrl(null);
      setIsCompleting(true);
    } catch (error) {
      console.error("Submit error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      layout
      id={index === 0 ? "first-word-card" : undefined}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={isCompleting
        ? { scale: [1, 1.02, 1], transition: { duration: 0.35 } }
        : { opacity: 1, scale: 1 }
      }
      exit={{ opacity: 0, scale: 0.88, y: -12, transition: { duration: 0.22, ease: "easeIn" } }}
      onMouseEnter={playHover}
      className={cn(
        "relative border p-5 rounded-xl flex flex-col gap-4 transition-colors duration-300 shadow-sm overflow-hidden",
        isCompleting
          ? "border-emerald-500/50 bg-emerald-500/5 shadow-emerald-500/10"
          : statusColors[word.status]
      )}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {isEditing ? (
              <div className="flex-1 flex items-center gap-2">
                <div className="space-y-1.5 flex-1">
                  <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Ijaw Word</p>
                  <input
                    type="text"
                    value={editedWord}
                    onChange={(e) => setEditedWord(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-700/50 rounded-lg px-3 py-2 text-lg font-semibold text-white focus:outline-none focus:border-amber-500 transition-colors"
                    placeholder="Ijaw word..."
                  />
                </div>
                <button
                  onClick={handlePlay}
                  disabled={isPlaying}
                  className="mt-5 p-2 bg-slate-800/50 hover:bg-slate-700 rounded-xl text-slate-400 hover:text-white transition-colors disabled:opacity-50 border border-slate-700/50"
                  title="Play pronunciation"
                >
                  {isPlaying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-semibold text-white" style={{fontFamily: "'Cormorant Garamond', serif"}}>{word.word}</h3>
                <button
                  onClick={handlePlay}
                  disabled={isPlaying}
                  className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors disabled:opacity-50 border border-transparent hover:border-slate-700/50"
                  title="Play pronunciation"
                >
                  {isPlaying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-1.5 mt-2">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Pronunciation</p>
              <input
                type="text"
                value={editedPronunciation}
                onChange={(e) => setEditedPronunciation(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 transition-all font-mono"
                placeholder="Pronunciation..."
              />
            </div>
          ) : (
            <p className="text-xs text-slate-500 font-mono tracking-wider italic">/{word.pronunciation || 'no-guide'}/</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {word.isAiGenerated && (
            <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] font-bold uppercase tracking-widest rounded border border-amber-500/20">
              AI Draft
            </span>
          )}
          <span className={cn(
            "px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] rounded-lg border",
            word.status === 'pending' && "bg-slate-800/50 text-slate-500 border-slate-700/50",
            word.status === 'verified' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
            word.status === 'flagged' && "bg-red-500/10 text-red-400 border-red-500/20"
          )}>
            {word.status}
          </span>
          {pendingCorrection && (
            <div className="flex flex-col items-end gap-1">
              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] font-bold uppercase tracking-widest rounded border border-amber-500/20 flex items-center gap-1">
                <RefreshCw className="w-2 h-2 animate-spin-slow" />
                Correction Pending
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-500 font-black uppercase tracking-tighter">
                  {pendingCorrection.agreedBy?.length || 0}/{AGREEMENT_THRESHOLD} Agree
                </span>
                {onAgree && pendingCorrection.submittedBy !== auth.currentUser?.uid && (
                  <button
                    onClick={() => onAgree(pendingCorrection.id)}
                    className={cn(
                      "p-1.5 rounded-lg transition-all border",
                      pendingCorrection.agreedBy?.includes(auth.currentUser?.uid || '')
                        ? "bg-amber-700 border-amber-500 text-white"
                        : "bg-slate-800 border-slate-700/50 text-slate-500 hover:text-white"
                    )}
                    title="Agree with this correction"
                  >
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={cn(
        "flex flex-col gap-1 p-4 rounded-xl border transition-colors",
        isEditing ? "border-amber-500/20 bg-amber-500/5" : "bg-slate-950/30 border-slate-800/50 shadow-inner"
      )}>
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">
          Meaning (English)
        </p>
        <p className="text-slate-300 text-[1.05rem] leading-relaxed">{word.meaning}</p>
      </div>

        {isEditing && (
          <div className="pt-5 border-t border-slate-800/50">
            <VoiceRecorder
              wordId={word.id}
              dialect={word.dialect}
              onUploadingChange={setIsUploading}
              onUploadSuccess={(url) => {
                setUploadedAudioUrl(url);
                toast.success("Voice sample uploaded and linked to correction!");
              }}
            />
          </div>
        )}

        <div className="flex gap-2 mt-auto pt-3 flex-wrap">
        {isEditing ? (
          <>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditedWord(word.word);
                setEditedPronunciation(word.pronunciation);
                setUploadedAudioUrl(null);
              }}
              className="flex-1 py-2.5 bg-slate-800/50 text-slate-400 hover:bg-slate-800 hover:text-white rounded-xl text-sm font-medium transition-all border border-slate-700/50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isUploading}
              className="flex-1 py-2.5 bg-amber-700 hover:bg-amber-600 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm shadow-amber-700/20 disabled:opacity-50"
            >
              {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : (isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />)}
              {isUploading ? "Uploading..." : "Submit"}
            </button>
          </>
        ) : (
          <>
            <button
              id={index === 0 ? "correct-btn-step" : undefined}
              onClick={() => setIsEditing(true)}
              disabled={!!pendingCorrection && !isAdmin}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 shadow-sm",
                !!pendingCorrection && !isAdmin
                  ? "bg-slate-800/50 text-slate-500 border border-slate-800/50 cursor-not-allowed"
                  : "bg-slate-100 text-slate-900 hover:bg-white"
              )}
            >
              {!!pendingCorrection && !isAdmin ? (
                <>{pendingCorrection.submittedBy === auth.currentUser?.uid ? "Correction Pending" : "Reviewing..."}</>
              ) : (
                <><Plus className="w-4 h-4" /> {isAdmin ? "Edit & Verify" : "Verify / Edit"}</>
              )}
            </button>
            {/* Admin quick verify stays */}
            {isAdmin && word.status === 'pending' && (
              <button
                onClick={async () => {
                  setIsCompleting(true);
                  await new Promise(r => setTimeout(r, 350));
                  onVerify?.();
                }}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition-all flex items-center justify-center shadow-sm shadow-emerald-600/20"
                title="Quick Verify"
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            {/* Community vote buttons — always visible for non-own words */}
            {word.status !== 'verified' && currentUserId && currentUserId !== word.createdBy && (
              <div className="flex items-center gap-1 ml-auto">
                <button
                  onClick={async () => {
                    if (!currentUserId) return;
                    try {
                      await communityVoteWord(word.id, currentUserId, 'up');
                    } catch (e: any) {
                      toast.error(e.message || 'Vote failed');
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border",
                    word.upvotes?.includes(currentUserId)
                      ? "bg-emerald-600/20 border-emerald-500/40 text-emerald-400"
                      : "bg-slate-800/50 border-slate-700/50 text-slate-500 hover:text-emerald-400 hover:border-emerald-500/30"
                  )}
                  title="Upvote — counts toward verification"
                >
                  <ThumbsUp className="w-3 h-3" />
                  <span>{word.upvotes?.length ?? 0}</span>
                </button>
                <button
                  onClick={async () => {
                    if (!currentUserId) return;
                    try {
                      await communityVoteWord(word.id, currentUserId, 'down');
                    } catch (e: any) {
                      toast.error(e.message || 'Vote failed');
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border",
                    word.downvotes?.includes(currentUserId)
                      ? "bg-red-600/20 border-red-500/40 text-red-400"
                      : "bg-slate-800/50 border-slate-700/50 text-slate-500 hover:text-red-400 hover:border-red-500/30"
                  )}
                  title="Downvote — flag as incorrect"
                >
                  <ThumbsDown className="w-3 h-3" />
                  <span>{word.downvotes?.length ?? 0}</span>
                </button>
              </div>
            )}
            <button
              id={index === 0 ? "flag-btn-step" : undefined}
              onClick={onFlag}
              className="px-4 py-2.5 bg-slate-800/50 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-xl text-sm font-medium transition-colors border border-slate-700/50 hover:border-red-500/30"
            >
              <AlertTriangle className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      {/* Vote progress bar */}
      {word.status === 'pending' && (word.upvotes?.length ?? 0) > 0 && (
        <div className="mt-2 space-y-1">
          <div className="flex justify-between text-[9px] font-bold text-slate-600 uppercase tracking-wider">
            <span>Community Verification</span>
            <span>{word.upvotes?.length ?? 0}/{AGREEMENT_THRESHOLD}</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500/70 rounded-full transition-all"
              style={{ width: `${Math.min(100, ((word.upvotes?.length ?? 0) / AGREEMENT_THRESHOLD) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Completion flash overlay */}
      <AnimatePresence>
        {isCompleting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 rounded-xl flex items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.2, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
              className="w-14 h-14 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/40"
            >
              <Check className="w-7 h-7 text-white stroke-[2.5]" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
