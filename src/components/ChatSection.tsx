import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Send, Volume2, Loader2,
  CheckCircle2, AlertCircle, History, X, Mic2, ChevronRight
} from 'lucide-react';
import { generateEnglishPhrase, generateSpeech, verifyIjawWord } from '../services/geminiService';
import { VoiceRecorder } from './VoiceRecorder';
import { db, auth, logActivity, awardPoints } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { cn } from '../lib/utils';

interface ChatSectionProps {
  dialect: string;
  profile: any;
  setProfile: (profile: any) => void;
  checkAchievements: (profile: any) => void;
}

interface SessionEntry {
  englishPhrase: string;
  ijawTranslation: string;
  audioUrl: string | null;
  verdict: { isCorrect: boolean; correction?: string; reason?: string } | null;
  submittedAt: Date;
}

export const ChatSection: React.FC<ChatSectionProps> = ({
  dialect, profile, setProfile, checkAchievements
}) => {
  const [englishPhrase, setEnglishPhrase]       = useState('');
  const [ijawTranslation, setIjawTranslation]   = useState('');
  const [audioUrl, setAudioUrl]                 = useState<string | null>(null);
  const [isGenerating, setIsGenerating]         = useState(false);
  const [isSubmitting, setIsSubmitting]         = useState(false);
  const [isVerifying, setIsVerifying]           = useState(false);
  const [isPlaying, setIsPlaying]               = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const [sessionHistory, setSessionHistory]     = useState<SessionEntry[]>([]);
  const [showHistory, setShowHistory]           = useState(false);
  const [verdict, setVerdict]                   = useState<SessionEntry['verdict']>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchNewPhrase = async () => {
    setIsGenerating(true);
    setVerdict(null);
    setIjawTranslation('');
    setAudioUrl(null);
    try {
      const phrase = await generateEnglishPhrase();
      setEnglishPhrase(phrase || 'I want to learn Ijaw.');
    } catch {
      setEnglishPhrase('Welcome to Izonate.');
      toast.error('Could not load a phrase — try refreshing');
    } finally {
      setIsGenerating(false);
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  };

  useEffect(() => { fetchNewPhrase(); }, []);

  const playAI = async () => {
    if (!englishPhrase || isPlaying) return;
    setIsPlaying(true);
    try {
      const b64 = await generateSpeech(englishPhrase);
      const raw  = atob(b64);
      const buf  = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) buf[i] = raw.charCodeAt(i);
      const ctx  = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const ab   = ctx.createBuffer(1, buf.length / 2, 24000);
      const view = new DataView(buf.buffer);
      const ch   = ab.getChannelData(0);
      for (let i = 0; i < buf.length / 2; i++) ch[i] = view.getInt16(i * 2, true) / 32768;
      const src = ctx.createBufferSource();
      src.buffer = ab;
      src.connect(ctx.destination);
      src.onended = () => { setIsPlaying(false); ctx.close(); };
      src.start();
    } catch {
      toast.error('Could not play audio');
      setIsPlaying(false);
    }
  };

  const handleSubmit = async () => {
    if (!ijawTranslation.trim() || !auth.currentUser) {
      toast.error('Enter your translation first');
      return;
    }
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'chatSessions'), {
        englishPhrase,
        ijawTranslation,
        audioUrl: audioUrl || '',
        userId: auth.currentUser.uid,
        dialect,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      const updated = await awardPoints(auth.currentUser.uid, 10, true);
      if (updated) { setProfile(updated); await checkAchievements(updated); }
      await logActivity('CHAT_TRANSLATION_SUBMITTED', `Submitted: ${englishPhrase}`);
    } catch {
      toast.error('Failed to save your translation');
      setIsSubmitting(false);
      return;
    }
    setIsSubmitting(false);
    setIsVerifying(true);

    let v: SessionEntry['verdict'] = null;
    try {
      v = await verifyIjawWord(ijawTranslation, englishPhrase, dialect);
      setVerdict(v);
    } catch {
      // verification failure is non-fatal
    } finally {
      setIsVerifying(false);
    }

    setSessionHistory(prev => [{
      englishPhrase, ijawTranslation, audioUrl, verdict: v, submittedAt: new Date()
    }, ...prev]);

    fetchNewPhrase();
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  };

  const busy = isSubmitting || isVerifying || isUploadingAudio;

  return (
    <div className="max-w-5xl mx-auto py-10 px-4 sm:px-6">

      {/* ── Page title row ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-10">
        <div>
          <p className="text-[11px] font-semibold text-amber-500/70 uppercase tracking-[0.25em] mb-1">
            {dialect}
          </p>
          <h2
            className="text-4xl sm:text-5xl font-semibold text-[#f0ede4] leading-tight"
            style={{ fontFamily: "'Cormorant Garamond', serif" }}
          >
            Practice
          </h2>
        </div>

        {sessionHistory.length > 0 && (
          <button
            onClick={() => setShowHistory(h => !h)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border',
              showHistory
                ? 'bg-slate-800 border-slate-700 text-white'
                : 'bg-transparent border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
            )}
          >
            <History className="w-4 h-4" />
            History
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-700/30 text-amber-400 rounded-md">
              {sessionHistory.length}
            </span>
          </button>
        )}
      </div>

      <div className={cn(
        'grid gap-8 items-start',
        showHistory && sessionHistory.length > 0 ? 'lg:grid-cols-[1fr_320px]' : 'grid-cols-1'
      )}>

        {/* ── Left: main practice card ────────────────────────────── */}
        <div className="space-y-3">

          {/* Phrase card */}
          <div className="rounded-2xl bg-slate-900/50 border border-slate-800/60 overflow-hidden">

            {/* Phrase display */}
            <div className="px-6 pt-8 pb-6">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-[0.2em] mb-5">
                Translate into {dialect}
              </p>

              <AnimatePresence mode="wait">
                {isGenerating ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-3 h-16"
                  >
                    <div className="w-5 h-5 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
                    <span className="text-slate-500 text-lg">Getting phrase…</span>
                  </motion.div>
                ) : (
                  <motion.div
                    key={englishPhrase}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.22, ease: 'easeOut' }}
                  >
                    <p
                      className="text-3xl sm:text-4xl text-[#f0ede4] leading-snug"
                      style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
                    >
                      {englishPhrase}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Phrase actions row */}
            <div className="flex items-center gap-2 px-6 pb-6">
              <button
                onClick={playAI}
                disabled={isGenerating || isPlaying || !englishPhrase}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/50 text-slate-300 hover:text-white text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                title="Listen to phrase"
              >
                {isPlaying
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Volume2 className="w-4 h-4" />}
                Listen
              </button>

              <button
                onClick={fetchNewPhrase}
                disabled={isGenerating}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-transparent hover:bg-slate-800/60 border border-slate-800/60 text-slate-500 hover:text-slate-300 text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                title="Skip to another phrase"
              >
                <RefreshCw className={cn('w-4 h-4', isGenerating && 'animate-spin')} />
                Skip
              </button>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-800/60" />

            {/* Translation input */}
            <div className="px-6 pt-6 pb-4">
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-[0.2em] mb-4">
                Your translation
              </p>
              <textarea
                ref={textareaRef}
                value={ijawTranslation}
                onChange={e => setIjawTranslation(e.target.value)}
                onKeyDown={handleKey}
                placeholder={`Type in ${dialect}…`}
                rows={3}
                className="w-full bg-transparent focus:outline-none text-2xl text-white placeholder:text-slate-800 resize-none leading-relaxed"
                style={{ fontFamily: "'Cormorant Garamond', serif" }}
              />
              <p className="text-[10px] text-slate-700 mt-2">
                ⌘ + Enter to submit
              </p>
            </div>

            {/* Voice recorder strip */}
            <div className="px-6 pb-5 border-t border-slate-800/40 pt-4">
              <VoiceRecorder
                variant="compact"
                onUploadingChange={setIsUploadingAudio}
                onUploadSuccess={(url) => {
                  setAudioUrl(url);
                  toast.success('Voice recording attached');
                }}
                className="bg-transparent"
              />
            </div>

            {/* Submit */}
            <div className="px-6 pb-6">
              <button
                id="submit-translation-btn"
                onClick={handleSubmit}
                disabled={busy || !ijawTranslation.trim()}
                className={cn(
                  'w-full flex items-center justify-center gap-3 py-4 rounded-xl font-semibold text-sm transition-all',
                  busy || !ijawTranslation.trim()
                    ? 'bg-slate-800/60 text-slate-600 cursor-not-allowed'
                    : 'bg-amber-700 hover:bg-amber-600 text-white shadow-lg shadow-amber-900/30 active:scale-[0.99]'
                )}
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {isVerifying && <RefreshCw className="w-4 h-4 animate-spin" />}
                {!isSubmitting && !isVerifying && <Send className="w-4 h-4" />}
                {isVerifying ? 'Checking…' : isSubmitting ? 'Saving…' : 'Submit'}
              </button>
            </div>
          </div>

          {/* ── Verdict banner ───────────────────────────────────── */}
          <AnimatePresence>
            {verdict && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={cn(
                  'rounded-2xl border px-6 py-5 flex items-start gap-4',
                  verdict.isCorrect
                    ? 'bg-emerald-500/5 border-emerald-500/20'
                    : 'bg-amber-500/5 border-amber-500/20'
                )}
              >
                <div className={cn(
                  'mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                  verdict.isCorrect ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                )}>
                  {verdict.isCorrect
                    ? <CheckCircle2 className="w-4 h-4" />
                    : <AlertCircle className="w-4 h-4" />}
                </div>

                <div className="flex-1 min-w-0">
                  <p className={cn(
                    'text-xs font-semibold mb-1',
                    verdict.isCorrect ? 'text-emerald-400' : 'text-amber-400'
                  )}>
                    {verdict.isCorrect ? 'Looks good' : 'Needs a small fix'}
                  </p>
                  {verdict.reason && (
                    <p className="text-slate-300 text-sm leading-relaxed">{verdict.reason}</p>
                  )}
                  {!verdict.isCorrect && verdict.correction && (
                    <p
                      className="mt-3 text-2xl text-amber-200"
                      style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
                    >
                      {verdict.correction}
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setVerdict(null)}
                  className="text-slate-700 hover:text-slate-400 transition-colors shrink-0 mt-0.5"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Right: history sidebar ──────────────────────────────── */}
        <AnimatePresence>
          {showHistory && sessionHistory.length > 0 && (
            <motion.aside
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="space-y-3 lg:sticky lg:top-24"
            >
              <p className="text-[10px] font-semibold text-slate-600 uppercase tracking-[0.2em] px-1 mb-4">
                This session
              </p>

              <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                {sessionHistory.map((entry, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="group rounded-xl border border-slate-800/60 bg-slate-900/30 hover:bg-slate-900/60 px-4 py-3.5 transition-all cursor-default"
                  >
                    {/* English */}
                    <p className="text-[11px] text-slate-600 mb-1.5 line-clamp-1">
                      {entry.englishPhrase}
                    </p>

                    {/* Ijaw */}
                    <p
                      className="text-lg text-[#f0ede4] leading-snug line-clamp-2 mb-3"
                      style={{ fontFamily: "'Cormorant Garamond', serif", fontWeight: 600 }}
                    >
                      {entry.ijawTranslation}
                    </p>

                    <div className="flex items-center justify-between">
                      {/* Verdict dot */}
                      <span className={cn(
                        'inline-flex items-center gap-1.5 text-[10px] font-semibold',
                        entry.verdict === null ? 'text-slate-600' :
                        entry.verdict.isCorrect ? 'text-emerald-500' : 'text-amber-500'
                      )}>
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full',
                          entry.verdict === null ? 'bg-slate-700' :
                          entry.verdict.isCorrect ? 'bg-emerald-500' : 'bg-amber-500'
                        )} />
                        {entry.verdict === null ? 'Unverified' :
                         entry.verdict.isCorrect ? 'Correct' : 'Corrected'}
                      </span>

                      {/* Audio playback */}
                      {entry.audioUrl && (
                        <button
                          onClick={() => new Audio(entry.audioUrl!).play()}
                          className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-all"
                          title="Play recording"
                        >
                          <Volume2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
