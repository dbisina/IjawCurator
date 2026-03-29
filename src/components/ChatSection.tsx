import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Play, Send, Mic2, CheckCircle2, Languages, Volume2, Loader2 } from 'lucide-react';
import { generateEnglishPhrase, generateSpeech } from '../services/geminiService';
import { VoiceRecorder } from './VoiceRecorder';
import { db, auth, logActivity, awardPoints } from '../firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { useHoverSound } from '../hooks/useHoverSound';

interface ChatSectionProps {
  dialect: string;
  profile: any;
  setProfile: (profile: any) => void;
  checkAchievements: (profile: any) => void;
}

export const ChatSection: React.FC<ChatSectionProps> = ({ dialect, profile, setProfile, checkAchievements }) => {
  const { playHover } = useHoverSound();
  const [englishPhrase, setEnglishPhrase] = useState<string>('');
  const [ijawTranslation, setIjawTranslation] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);

  const fetchNewPhrase = async () => {
    setIsGenerating(true);
    try {
      const phrase = await generateEnglishPhrase();
      setEnglishPhrase(phrase);
      setIjawTranslation('');
      setAudioUrl(null);
    } catch (error) {
      console.error("Failed to fetch phrase:", error);
      toast.error("Failed to get a new phrase");
    } finally {
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    fetchNewPhrase();
  }, []);

  const playAI = async () => {
    if (!englishPhrase || isPlaying) return;
    setIsPlaying(true);
    try {
      const base64Audio = await generateSpeech(englishPhrase);
      const audio = new Audio(`data:audio/pcm;base64,${base64Audio}`);
      // Note: The TTS model returns 24kHz PCM. We might need a proper player if Audio doesn't handle it.
      // But for simplicity, let's try standard Audio first. 
      // Actually, standard Audio expects a container (WAV/MP3). 
      // Let's use a simple WAV header or just assume the user can hear it if I use a better approach.
      // For now, I'll use a simple approach.
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      
      // Since it's raw PCM 24000Hz, we should ideally use AudioContext.
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      const buffer = audioCtx.createBuffer(1, bytes.length / 2, 24000);
      const channelData = buffer.getChannelData(0);
      const view = new DataView(bytes.buffer);
      for (let i = 0; i < bytes.length / 2; i++) {
        channelData[i] = view.getInt16(i * 2, true) / 32768;
      }
      const source = audioCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(audioCtx.destination);
      source.onended = () => {
        setIsPlaying(false);
        audioCtx.close();
      };
      source.start();
    } catch (error) {
      console.error("Failed to play speech:", error);
      toast.error("Failed to play AI voice");
      setIsPlaying(false);
    }
  };

  const handleSubmit = async () => {
    if (!ijawTranslation.trim() || !auth.currentUser) {
      toast.error("Please provide a translation");
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
        createdAt: serverTimestamp()
      });
      const updated = await awardPoints(auth.currentUser.uid, 10, true);
      if (updated) {
        setProfile(updated);
        await checkAchievements(updated);
      }
      await logActivity('CHAT_TRANSLATION_SUBMITTED', `Submitted translation for: ${englishPhrase}`);
      toast.success("Translation submitted successfully!");
      fetchNewPhrase();
    } catch (error) {
      console.error("Failed to submit:", error);
      toast.error("Failed to save your translation");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
          Interactive Translation Chat
        </h2>
        <p className="text-zinc-500">AI speaks in English, you translate to Ijaw ({dialect})</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* AI Side */}
        <motion.div 
          id="ai-prompt-card"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onMouseEnter={playHover}
          className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl space-y-6 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Volume2 className="w-24 h-24" />
          </div>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Languages className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">AI Prompt (English)</span>
          </div>

          <div className="min-h-[100px] flex items-center justify-center text-center">
            {isGenerating ? (
              <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
            ) : (
              <h3 className="text-2xl font-medium text-zinc-200 leading-relaxed">
                "{englishPhrase}"
              </h3>
            )}
          </div>

          <div className="flex justify-center gap-4">
            <button 
              onClick={playAI}
              onMouseEnter={playHover}
              disabled={isGenerating || isPlaying}
              className="px-6 py-3 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-2xl font-medium transition-all flex items-center gap-2"
            >
              {isPlaying ? <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" /> : <Play className="w-4 h-4" />}
              Listen to AI
            </button>
            <button 
              onClick={fetchNewPhrase}
              onMouseEnter={playHover}
              disabled={isGenerating}
              className="p-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-2xl transition-all"
              title="New Phrase"
            >
              <RefreshCw className={cn("w-5 h-5", isGenerating && "animate-spin")} />
            </button>
          </div>
        </motion.div>

        {/* User Side */}
        <motion.div 
          id="user-translation-card"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          onMouseEnter={playHover}
          className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center">
              <Mic2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Your Translation ({dialect})</span>
          </div>

          <div className="space-y-4">
            <textarea 
              value={ijawTranslation}
              onChange={(e) => setIjawTranslation(e.target.value)}
              placeholder="Type the Ijaw translation here..."
              className="w-full bg-zinc-800/50 border border-zinc-700 rounded-2xl p-4 min-h-[120px] focus:outline-none focus:border-emerald-500 transition-colors resize-none text-lg"
            />

            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest block">Record Pronunciation</label>
              <VoiceRecorder 
                onUploadingChange={setIsUploadingAudio}
                onUploadSuccess={(url) => {
                  setAudioUrl(url);
                  toast.success("Voice sample uploaded!");
                }} 
              />
            </div>

            <button 
              id="submit-translation-btn"
              onClick={handleSubmit}
              onMouseEnter={playHover}
              disabled={isSubmitting || !ijawTranslation.trim() || isUploadingAudio}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-600/20"
            >
              {isSubmitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : (isUploadingAudio ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />)}
              {isUploadingAudio ? "Uploading Audio..." : "Submit Translation"}
            </button>
          </div>
        </motion.div>
      </div>

      <div className="bg-indigo-500/5 border border-indigo-500/10 p-6 rounded-3xl flex items-start gap-4">
        <div className="p-2 bg-indigo-500/10 rounded-xl">
          <CheckCircle2 className="w-6 h-6 text-indigo-400" />
        </div>
        <div>
          <h4 className="font-bold text-indigo-300">How it works</h4>
          <p className="text-sm text-zinc-500 leading-relaxed">
            AI generates a common English phrase and speaks it. Your job is to translate it into your dialect and record yourself saying it. This helps us build a rich dataset for phrases and sentences, not just single words!
          </p>
        </div>
      </div>
    </div>
  );
};
