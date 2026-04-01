import React, { useState, useEffect, useCallback } from 'react';
import { auth, db, googleProvider, handleFirestoreError, OperationType, logActivity, awardPoints, applyCorrection } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc, updateDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp, Timestamp, getDocsFromServer } from 'firebase/firestore';
import { IJAW_DIALECTS, AGREEMENT_THRESHOLD } from './constants';
import { generateIjawWords, generateIjawSentences, verifyIjawWord, generateEnglishPhrase, generateSpeech, IjawWord, IjawSentence, DifficultyLevel } from './services/geminiService';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { VoiceRecorder } from './components/VoiceRecorder';
import { ChatSection } from './components/ChatSection';
import { ChatHistory } from './components/ChatHistory';
import { SocialSection } from './components/SocialSection';
import { LeaderboardSection } from './components/LeaderboardSection';
import { GamificationSection } from './components/GamificationSection';
import { LandingPage } from './components/LandingPage';
import { cn } from './lib/utils';
import { Toaster, toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import { Tutorial } from './components/Tutorial';
import { useHoverSound } from './hooks/useHoverSound';
import {
  Languages,
  LogOut,
  User as UserIcon,
  ShieldCheck,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Mic2,
  Keyboard,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  Search,
  Check,
  X,
  MessageSquare,
  History,
  HelpCircle,
  Play,
  Download,
  FileJson,
  FileSpreadsheet,
  Music,
  Volume2,
  Trophy,
  Users as UsersIcon,
  Settings,
  Flame,
  Loader2,
  ThumbsUp,
  MoreHorizontal,
  Home,
  BookOpen,
  Star,
  LogIn
} from 'lucide-react';
import JSZip from 'jszip';
import { UserProfile, Achievement, Challenge, WordEntry, CorrectionEntry } from './types';

// --- Components ---

interface ActivityLog {
  id: string;
  action: string;
  details: string;
  userId: string;
  userEmail?: string;
  timestamp: any;
}

// --- Components ---

const DialectSelector = ({ onSelect }: { onSelect: (dialect: string) => void }) => {
  const { playHover } = useHoverSound();
  return (
    <div id="dialect-selector" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
      {IJAW_DIALECTS.map((dialect) => (
        <button
          key={dialect}
          onMouseEnter={playHover}
          onClick={() => onSelect(dialect)}
          className="p-6 bg-slate-900/40 border border-slate-800/50 rounded-xl text-center hover:border-amber-500/50 hover:bg-amber-500/5 transition-all group shadow-sm hover:shadow-md hover:shadow-amber-500/10"
        >
          <span className="block text-lg font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">{dialect}</span>
        </button>
      ))}
    </div>
  );
};

const WordCard = ({
  word,
  index,
  isAdmin,
  pendingCorrection,
  approvedCorrection,
  onFlag,
  onUnflag,
  onVerify,
  onInlineCorrect,
  onAgree
}: {
  key?: string | number,
  word: WordEntry,
  index: number,
  isAdmin?: boolean,
  pendingCorrection?: CorrectionEntry,
  approvedCorrection?: CorrectionEntry,
  onFlag: () => void,
  onUnflag: () => void,
  onVerify?: () => void,
  onInlineCorrect: (word: string, meaning: string, pronunciation: string, audioUrl?: string) => Promise<void>,
  onAgree?: (correctionId: string) => void
}) => {
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

        <div className="flex gap-2 mt-auto pt-3">
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

const AdminDashboard = ({ adminTab, setAdminTab, selectedDialect, onDialectChange }: { adminTab: 'dataset' | 'logs' | 'export', setAdminTab: (tab: 'dataset' | 'logs' | 'export') => void, selectedDialect: string | null, onDialectChange: (dialect: string | null) => void }) => {
  const [allWords, setAllWords] = useState<WordEntry[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'flagged'>('all');

  useEffect(() => {
    if (adminTab === 'dataset') {
      const constraints: any[] = [orderBy('createdAt', 'desc')];
      if (filter !== 'all') constraints.push(where('status', '==', filter));
      if (selectedDialect) constraints.push(where('dialect', '==', selectedDialect));
      
      const q = query(collection(db, 'words'), ...constraints);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WordEntry));
        setAllWords(list);
        setLoading(false);
      });
      return unsubscribe;
    } else if (adminTab === 'logs') {
      const q = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(50));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
        setLogs(list);
        setLoading(false);
      });
      return unsubscribe;
    } else {
      setLoading(false);
    }
  }, [filter, adminTab, selectedDialect]);

  const ExportPanel = () => {
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState(0);

    const downloadFile = (content: string | Blob, fileName: string, contentType: string) => {
      const a = document.createElement("a");
      const file = new Blob([content], { type: contentType });
      a.href = URL.createObjectURL(file);
      a.download = fileName;
      a.click();
    };

    const handleExportCSV = async () => {
      setIsExporting(true);
      try {
        const wordsSnap = await getDocsFromServer(collection(db, 'words'));
        const chatSnap = await getDocsFromServer(collection(db, 'chatSessions'));
        const voiceSnap = await getDocsFromServer(collection(db, 'voiceExercises'));
        
        const words = wordsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const chats = chatSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const voices = voiceSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        let csv = "Type,ID,Field1,Field2,Dialect,Status,AudioURL\n";
        words.forEach((w: any) => {
          csv += `Word,${w.id},"${w.meaning}","${w.word}",${w.dialect},${w.status},\n`;
        });
        chats.forEach((c: any) => {
          csv += `Chat,${c.id},"${c.englishPhrase}","${c.ijawTranslation}",${c.dialect},${c.status},${c.audioUrl || ''}\n`;
        });
        voices.forEach((v: any) => {
          csv += `VoiceExercise,${v.id},"${v.wordId}","${v.userId}",${v.dialect},${v.status || 'pending'},${v.audioUrl || ''}\n`;
        });

        downloadFile(csv, `ijaw_dataset_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
        toast.success("CSV Exported!");
      } catch (error) {
        console.error("CSV Export error:", error);
        toast.error("Failed to export CSV");
      } finally {
        setIsExporting(false);
      }
    };

    const handleExportFull = async () => {
      setIsExporting(true);
      setProgress(0);
      try {
        const zip = new JSZip();
        const chatSnap = await getDocsFromServer(collection(db, 'chatSessions'));
        const voiceSnap = await getDocsFromServer(collection(db, 'voiceExercises'));
        
        const chats = chatSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        const voices = voiceSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        
        const audiosFolder = zip.folder("audios");
        let csv = "Type,ID,Text1,Text2,Dialect,AudioFile\n";

        const allItems = [
          ...chats.map(c => ({ ...c, type: 'chat' })),
          ...voices.map(v => ({ ...v, type: 'voice' }))
        ];

        const total = allItems.length;
        for (let i = 0; i < allItems.length; i++) {
          const item = allItems[i];
          const audioFileName = `${item.type}_${item.id}.webm`;
          
          if (item.type === 'chat') {
            csv += `Chat,${item.id},"${item.englishPhrase}","${item.ijawTranslation}",${item.dialect},${audioFileName}\n`;
          } else {
            csv += `Voice,${item.id},"${item.wordId}","${item.userId}",${item.dialect},${audioFileName}\n`;
          }
          
          if (item.audioUrl) {
            try {
              const response = await fetch(item.audioUrl);
              const blob = await response.blob();
              audiosFolder?.file(audioFileName, blob);
            } catch (e) {
              console.warn(`Failed to fetch audio for ${item.id}`, e);
            }
          }
          setProgress(Math.round(((i + 1) / total) * 100));
        }

        zip.file("metadata.csv", csv);
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `ijaw_full_dataset_${new Date().toISOString().split('T')[0]}.zip`;
        a.click();
        
        toast.success("Full Dataset Exported!");
      } catch (error) {
        console.error("Full Export error:", error);
        toast.error("Failed to export full dataset");
      } finally {
        setIsExporting(false);
        setProgress(0);
      }
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/40 border border-slate-800/50 p-8 rounded-xl shadow-xl space-y-6 backdrop-blur-md">
          <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20">
            <FileSpreadsheet className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-100 tracking-tight mb-2">Export CSV</h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              Download a spreadsheet containing all words, phrases, and translations. This is perfect for data analysis or quick review.
            </p>
          </div>
          <button 
            id="export-csv-btn"
            onClick={handleExportCSV}
            disabled={isExporting}
            className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 border border-slate-700/50 shadow-inner"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/50 p-8 rounded-xl shadow-xl space-y-6 backdrop-blur-md">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
            <Music className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-100 tracking-tight mb-2">Full Dataset (ZIP)</h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              Export all text data along with their corresponding audio recordings. Each recording is matched to its text entry in a metadata file.
            </p>
          </div>
          <div className="space-y-4">
            <button 
              id="export-full-btn"
              onClick={handleExportFull}
              disabled={isExporting}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20 border border-emerald-500"
            >
              {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export Full Dataset
            </button>
            {isExporting && progress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                  <span>Processing Audios</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/30">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex gap-4 items-center">
          <h2 className="text-2xl font-bold">Admin Panel</h2>
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/50">
            <button 
              onClick={() => setAdminTab('dataset')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all",
                adminTab === 'dataset' ? "bg-slate-800 text-white shadow-sm border border-slate-700/50" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Dataset
            </button>
            <button 
              onClick={() => setAdminTab('logs')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all",
                adminTab === 'logs' ? "bg-slate-800 text-white shadow-sm border border-slate-700/50" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Activity Log
            </button>
            <button 
              id="export-tab-btn"
              onClick={() => setAdminTab('export')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all",
                adminTab === 'export' ? "bg-slate-800 text-white shadow-sm border border-slate-700/50" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Export
            </button>
          </div>
        </div>
        
        {adminTab === 'dataset' && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800/50">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Dialect:</span>
              <select 
                value={selectedDialect || ''} 
                onChange={(e) => onDialectChange(e.target.value || null)}
                className="bg-transparent text-xs font-black text-amber-400 focus:outline-none cursor-pointer p-1"
              >
                <option value="">All Dialects</option>
                {IJAW_DIALECTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/50">
              {(['all', 'pending', 'verified', 'flagged'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all",
                    filter === f ? "bg-amber-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {adminTab === 'dataset' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allWords.map((word) => (
            <div key={word.id} className="bg-slate-900/40 border border-slate-800/50 p-5 rounded-xl space-y-3 hover:bg-slate-800/40 transition-colors shadow-sm group">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <p className="text-lg font-black text-slate-100 tracking-tight group-hover:text-amber-400 transition-colors">{word.word}</p>
                  <p className="text-[10px] text-amber-400 font-black uppercase tracking-widest">{word.dialect}</p>
                </div>
                <span className={cn(
                  "px-2 py-0.5 text-[8px] font-black uppercase rounded border tracking-tighter",
                  word.status === 'pending' && "border-slate-700/50 text-slate-500 bg-slate-800/30",
                  word.status === 'verified' && "border-emerald-500/30 text-emerald-500 bg-emerald-500/5",
                  word.status === 'flagged' && "border-red-500/30 text-red-500 bg-red-500/5"
                )}>
                  {word.status}
                </span>
              </div>
              <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">{word.meaning}</p>
            </div>
          ))}
        </div>
      ) : adminTab === 'logs' ? (
        <div className="bg-slate-900/30 border border-slate-800/50 rounded-xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] font-black tracking-widest border-b border-slate-800/50">
              <tr>
                <th className="px-6 py-5">Timestamp</th>
                <th className="px-6 py-5">User</th>
                <th className="px-6 py-5">Action</th>
                <th className="px-6 py-5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                    {log.timestamp?.toDate().toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-black text-slate-300 tracking-tight">{log.userEmail}</p>
                    <p className="text-[9px] text-slate-600 font-mono group-hover:text-slate-500 transition-colors">{log.userId}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded-lg text-[9px] font-black uppercase tracking-tighter text-slate-400 group-hover:text-amber-400 transition-colors shadow-inner">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 font-medium">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ExportPanel />
      )}
    </div>
  );
};

interface ChatSessionEntry {
  id: string;
  englishPhrase: string;
  ijawTranslation: string;
  audioUrl: string;
  userId: string;
  dialect: string;
  status: 'pending' | 'verified' | 'flagged';
  createdAt: any;
}

interface VoiceExerciseEntry {
  id: string;
  wordId: string;
  userId: string;
  userEmail: string;
  dialect: string;
  audioUrl: string;
  submittedAt: any;
  status: 'pending' | 'verified' | 'rejected';
}

const VettingPanel = ({ selectedDialect }: { selectedDialect: string | null }) => {
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionEntry[]>([]);
  const [voiceExercises, setVoiceExercises] = useState<VoiceExerciseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [vettingTab, setVettingTab] = useState<'corrections' | 'chat' | 'voice'>('corrections');
  const [filterByDialect, setFilterByDialect] = useState(true);

  useEffect(() => {
    const corrConstraints: any[] = [where('status', '==', 'pending'), orderBy('submittedAt', 'desc')];
    const chatConstraints: any[] = [where('status', '==', 'pending'), orderBy('createdAt', 'desc')];
    const voiceConstraints: any[] = [where('status', '==', 'pending'), orderBy('submittedAt', 'desc')];

    if (filterByDialect && selectedDialect) {
      corrConstraints.push(where('dialect', '==', selectedDialect));
      chatConstraints.push(where('dialect', '==', selectedDialect));
      voiceConstraints.push(where('dialect', '==', selectedDialect));
    }

    const qCorr = query(collection(db, 'corrections'), ...corrConstraints);
    const qChat = query(collection(db, 'chatSessions'), ...chatConstraints);
    const qVoice = query(collection(db, 'voiceExercises'), ...voiceConstraints);

    const unsubCorr = onSnapshot(qCorr, (snapshot) => {
      setCorrections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CorrectionEntry)));
    });

    const unsubChat = onSnapshot(qChat, (snapshot) => {
      setChatSessions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ChatSessionEntry)));
    });

    const unsubVoice = onSnapshot(qVoice, (snapshot) => {
      setVoiceExercises(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VoiceExerciseEntry)));
      setLoading(false);
    });

    return () => {
      unsubCorr();
      unsubChat();
      unsubVoice();
    };
  }, [filterByDialect, selectedDialect]);

  const handleCorrectionAction = async (correction: CorrectionEntry, action: 'approved' | 'rejected') => {
    try {
      if (action === 'approved') {
        await applyCorrection(correction);
        toast.success("Correction approved and word updated!");
      } else {
        const corrRef = doc(db, 'corrections', correction.id);
        await updateDoc(corrRef, { status: 'rejected' });
        await logActivity('CORRECTION_REJECTED', `Rejected correction for word ID: ${correction.wordId}`);
        toast.info("Correction rejected");
      }
    } catch (error) {
      console.error("Vetting error:", error);
      toast.error("Failed to process correction");
    }
  };

  const handleChatAction = async (session: ChatSessionEntry, action: 'verified' | 'flagged' | 'rejected') => {
    try {
      const sessionRef = doc(db, 'chatSessions', session.id);
      if (action === 'rejected') {
        await updateDoc(sessionRef, { status: 'rejected' });
        await logActivity('CHAT_REJECTED', `Rejected chat translation for: ${session.englishPhrase}`);
        toast.info("Chat translation rejected");
      } else {
        await updateDoc(sessionRef, { status: action });
        if (action === 'verified') {
          await awardPoints(session.userId, 50, true);
          if (auth.currentUser) await awardPoints(auth.currentUser.uid, 20);
        }
        await logActivity(`CHAT_${action.toUpperCase()}`, `${action} chat translation for: ${session.englishPhrase}`);
        toast.success(`Chat translation ${action}!`);
      }
    } catch (error) {
      console.error("Chat vetting error:", error);
      toast.error("Failed to process chat session");
    }
  };

  const handleVoiceAction = async (exercise: VoiceExerciseEntry, action: 'verified' | 'rejected') => {
    try {
      const voiceRef = doc(db, 'voiceExercises', exercise.id);
      await updateDoc(voiceRef, { status: action });

      if (action === 'verified') {
        await awardPoints(exercise.userId, 30, true);
        if (auth.currentUser) await awardPoints(auth.currentUser.uid, 10);
        await logActivity('VOICE_VERIFIED', `Verified voice sample for word ID: ${exercise.wordId}`);
        toast.success("Voice sample verified!");
      } else {
        await logActivity('VOICE_REJECTED', `Rejected voice sample for word ID: ${exercise.wordId}`);
        toast.info("Voice sample rejected");
      }
    } catch (error) {
      console.error("Voice vetting error:", error);
      toast.error("Failed to process voice sample");
    }
  };

  if (loading) return <div className="py-20 text-center text-slate-500">Loading vetting queue...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <h2 className="text-2xl font-bold tracking-tight">Vetting Queue</h2>
          {selectedDialect && (
            <button
              onClick={() => setFilterByDialect(!filterByDialect)}
              className={cn(
                "px-4 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2",
                filterByDialect ? "bg-amber-700/10 border-amber-500/50 text-amber-400" : "bg-slate-900/50 border-slate-800/50 text-slate-500 hover:text-slate-300"
              )}
            >
              {filterByDialect ? `Only ${selectedDialect}` : "All Dialects"}
            </button>
          )}
          <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800/50">
            <button 
              onClick={() => setVettingTab('corrections')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                vettingTab === 'corrections' ? "bg-amber-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Corrections ({corrections.length})
            </button>
            <button 
              onClick={() => setVettingTab('chat')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                vettingTab === 'chat' ? "bg-emerald-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Chat Sessions ({chatSessions.length})
            </button>
            <button 
              onClick={() => setVettingTab('voice')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                vettingTab === 'voice' ? "bg-amber-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Voice Samples ({voiceExercises.length})
            </button>
          </div>
        </div>
      </div>

      {vettingTab === 'corrections' ? (
        corrections.length === 0 ? (
          <div className="text-center py-20 bg-slate-950/30 rounded-xl border border-dashed border-slate-800/50">
            <CheckCircle2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-slate-300">All caught up!</h3>
            <p className="text-slate-500 mt-2">There are no pending corrections to review.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {corrections.map((corr) => (
              <motion.div 
                key={corr.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-slate-900/40 border border-slate-800/50 p-6 rounded-xl flex flex-col gap-6 shadow-sm"
              >
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Correction for:</span>
                      <span className="text-sm font-mono text-amber-400">{corr.wordId}</span>
                      {corr.dialect && (
                        <span className="px-2 py-0.5 bg-slate-800/50 text-slate-400 text-[10px] font-bold uppercase rounded border border-slate-700/50">
                          {corr.dialect}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 px-3 py-1 bg-slate-950/50 rounded-lg border border-slate-800/50 shadow-inner">
                        <ThumbsUp className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] font-bold text-slate-400">
                          {corr.agreedBy?.length || 0}/{AGREEMENT_THRESHOLD} Agreements
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleCorrectionAction(corr, 'rejected')}
                          className="px-4 py-1.5 bg-slate-800/50 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg text-xs font-bold transition-colors border border-slate-700/50 hover:border-red-500/30"
                        >
                          Reject
                        </button>
                        <button 
                          onClick={() => handleCorrectionAction(corr, 'approved')}
                          className="px-4 py-1.5 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-amber-700/20 border border-transparent"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-950/30 rounded-xl border border-slate-800/50">
                    <div className="space-y-4">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800/50 pb-1 flex items-center gap-2">
                         Current Version
                      </p>
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-semibold">Word</p>
                          <p className="text-lg font-bold text-slate-400">{corr.originalWord || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-semibold">Meaning</p>
                          <p className="text-[1.05rem] text-slate-400 leading-snug">{corr.originalMeaning || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-semibold">Pronunciation</p>
                          <p className="text-xs font-mono text-slate-500">/{corr.originalPronunciation || 'N/A'}/</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 border-l border-slate-800/50 pl-6">
                      <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest border-b border-amber-500/20 pb-1 flex items-center gap-2">
                        Suggested Correction
                      </p>
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-semibold">Word</p>
                          <p className="text-lg font-bold text-slate-100">{corr.suggestedWord}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-semibold">Meaning</p>
                          <p className="text-[1.05rem] text-slate-300 leading-snug">{corr.suggestedMeaning}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-semibold">Pronunciation</p>
                          <p className="text-xs font-mono text-amber-400">/{corr.suggestedPronunciation}/</p>
                        </div>
                        {corr.audioUrl && (
                          <div className="pt-2">
                             <button 
                              onClick={() => new Audio(corr.audioUrl).play().catch(() => toast.error("Failed to play audio"))}
                              className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-600/20 text-amber-400 rounded-lg text-[10px] font-bold transition-all border border-amber-500/20 group"
                            >
                              <Play className="w-3 h-3 fill-current group-hover:scale-110 transition-transform" />
                              Play Suggested Audio
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {corr.reason && (
                    <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/50 shadow-inner">
                      <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Reason for Correction</p>
                      <p className="text-sm text-slate-400 italic">"{corr.reason}"</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )
      ) : vettingTab === 'chat' ? (
        chatSessions.length === 0 ? (
          <div className="text-center py-20 bg-slate-950/30 rounded-2xl border border-dashed border-slate-800/50">
            <MessageSquare className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-slate-300">No chat sessions</h3>
            <p className="text-slate-500 mt-2">There are no pending chat translations to review.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {chatSessions.map((session) => (
              <motion.div 
                key={session.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-slate-900/40 border border-slate-800/50 p-6 rounded-xl flex flex-col gap-6 shadow-sm"
              >
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Chat Session:</span>
                      <span className="text-sm font-mono text-emerald-400">{session.dialect}</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleChatAction(session, 'rejected')}
                        className="px-4 py-1.5 bg-slate-800/50 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg text-xs font-bold transition-colors border border-slate-700/50 hover:border-red-500/30"
                      >
                        Reject
                      </button>
                      <button 
                        onClick={() => handleChatAction(session, 'verified')}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-emerald-600/20 border border-transparent"
                      >
                        Verify
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-950/30 rounded-xl border border-slate-800/50">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800/50 pb-1">AI Prompt (English)</p>
                      <p className="text-lg font-medium text-slate-300 italic">"{session.englishPhrase}"</p>
                    </div>
                    <div className="space-y-2 border-l border-slate-800/50 pl-6">
                      <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest border-b border-emerald-500/20 pb-1">User Translation (Ijaw)</p>
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xl font-bold text-emerald-400">{session.ijawTranslation}</p>
                        {session.audioUrl && (
                          <button 
                            onClick={() => new Audio(session.audioUrl).play().catch(() => toast.error("Failed to play audio"))}
                            className="p-3 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-full transition-all border border-emerald-500/20 group"
                            title="Play recording"
                          >
                            <Play className="w-5 h-5 fill-current group-hover:scale-110 transition-transform" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )
      ) : (
        voiceExercises.length === 0 ? (
          <div className="text-center py-20 bg-slate-950/30 rounded-2xl border border-dashed border-slate-800/50">
            <Mic2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-slate-300">No voice samples</h3>
            <p className="text-slate-500 mt-2">There are no pending voice exercises to review.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {voiceExercises.map((exercise) => (
              <motion.div 
                key={exercise.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-slate-900/40 border border-slate-800/50 p-6 rounded-xl flex flex-col gap-6 shadow-sm"
              >
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Voice Sample for:</span>
                      <span className="text-sm font-mono text-amber-400">{exercise.wordId}</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleVoiceAction(exercise, 'rejected')}
                        className="px-4 py-1.5 bg-slate-800/50 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg text-xs font-bold transition-colors border border-slate-700/50 hover:border-red-500/30"
                      >
                        Reject
                      </button>
                      <button 
                        onClick={() => handleVoiceAction(exercise, 'verified')}
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-amber-600/20 border border-transparent"
                      >
                        Verify
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-950/30 rounded-xl border border-slate-800/50 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">Submitted By</p>
                      <p className="text-sm text-slate-200">{exercise.userEmail}</p>
                      <p className="text-[10px] text-slate-500 uppercase">{exercise.dialect}</p>
                    </div>
                    <button 
                      onClick={() => new Audio(exercise.audioUrl).play().catch(() => toast.error("Failed to play audio"))}
                      className="p-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-full transition-all border border-amber-500/20 group"
                      title="Play recording"
                    >
                      <Play className="w-6 h-6 fill-current group-hover:scale-110 transition-transform" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_word', title: 'Pioneer', description: 'Contribute your first word or phrase', icon: '🌟' },
  { id: 'verified_10', title: 'Vetter', description: 'Verify 10 words or phrases', icon: '✅' },
  { id: 'verified_50', title: 'Expert', description: 'Verify 50 words or phrases', icon: '🎓' },
  { id: 'streak_7', title: 'Dedicated', description: 'Maintain a 7-day streak', icon: '🔥' },
  { id: 'streak_30', title: 'Legendary', description: 'Maintain a 30-day streak', icon: '👑' },
  { id: 'chat_10', title: 'Translator', description: 'Submit 10 translations in chat', icon: '💬' },
];

export default function App() {
  const { playHover } = useHoverSound();
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAchievements = async (updatedProfile: UserProfile) => {
    const newAchievements: string[] = [];
    const currentAchievements = updatedProfile.achievements || [];
    const contributions = updatedProfile.contributions || 0;
    const currentStreak = updatedProfile.streak?.current || 0;
    
    if (contributions >= 1 && !currentAchievements.includes('first_word')) {
      newAchievements.push('first_word');
    }
    if (contributions >= 10 && !currentAchievements.includes('verified_10')) {
      newAchievements.push('verified_10');
    }
    if (contributions >= 50 && !currentAchievements.includes('verified_50')) {
      newAchievements.push('verified_50');
    }
    if (currentStreak >= 7 && !currentAchievements.includes('streak_7')) {
      newAchievements.push('streak_7');
    }
    if (currentStreak >= 30 && !currentAchievements.includes('streak_30')) {
      newAchievements.push('streak_30');
    }

    if (newAchievements.length > 0) {
      const userRef = doc(db, 'users', updatedProfile.uid);
      const allAchievements = [...(updatedProfile.achievements || []), ...newAchievements];
      await updateDoc(userRef, { achievements: allAchievements });
      
      newAchievements.forEach(id => {
        const ach = ACHIEVEMENTS.find(a => a.id === id);
        if (ach) {
          toast.success(`🏆 Achievement Unlocked: ${ach.title}!`, {
            description: ach.description
          });
        }
      });
      
      setProfile({ ...updatedProfile, achievements: allAchievements });
    }
  };
  
  const isAdmin = profile?.role === 'admin' || user?.email === 'danbis664@gmail.com';

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const u = result.user;
      const userRef = doc(db, 'users', u.uid);
      
      let userSnap;
      try {
        userSnap = await getDoc(userRef);
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, `users/${u.uid}`);
        return;
      }

      if (!userSnap.exists()) {
        try {
          const role = u.email === 'danbis664@gmail.com' ? 'admin' : 'user';
          await setDoc(userRef, {
            uid: u.uid,
            email: u.email,
            displayName: u.displayName,
            photoURL: u.photoURL,
            role: role,
            points: 0,
            contributions: 0,
            createdAt: serverTimestamp()
          });
          // Update local profile immediately
          setProfile({
            uid: u.uid,
            email: u.email || '',
            displayName: u.displayName || '',
            photoURL: u.photoURL || '',
            role: role,
            points: 0,
            contributions: 0,
            createdAt: new Date().toISOString(),
            streak: { current: 1, longest: 1, lastActiveDate: new Date().toISOString().split('T')[0] },
            achievements: [],
            challenges: {}
          });
        } catch (e) {
          handleFirestoreError(e, OperationType.WRITE, `users/${u.uid}`);
          return;
        }
      } else {
        setProfile(userSnap.data() as UserProfile);
      }
      toast.success("Logged in successfully!");
    } catch (error) {
      console.error("Login error:", error);
      toast.error("Failed to login");
    }
  };

  const Login = () => (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white p-4 relative overflow-hidden">
      {/* Background Orbs */}
      <div className="absolute top-0 -left-20 w-96 h-96 bg-amber-700/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 -right-20 w-96 h-96 bg-emerald-600/10 rounded-full blur-[120px] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-slate-900/40 backdrop-blur-3xl border border-slate-800/50 p-10 rounded-xl shadow-[0_50px_100px_-20px_rgba(0,0,0,0.7)] text-center relative z-10"
      >
        <div className="w-24 h-24 bg-amber-700/20 rounded-xl flex items-center justify-center mx-auto mb-8 border border-amber-500/20 shadow-2xl">
          <Languages className="w-12 h-12 text-amber-400" />
        </div>
        <h1 className="text-4xl font-black mb-3 tracking-tighter text-slate-50">Izonate</h1>
        <p className="text-slate-400 mb-10 leading-relaxed font-medium">Help us build the most accurate dataset for the Ijaw language and its dialects.</p>
        <button
          onClick={handleLogin}
          className="w-full py-4 bg-slate-50 text-slate-950 font-black text-xs uppercase tracking-widest rounded-xl hover:bg-white transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3 shadow-xl"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5 grayscale" alt="Google" />
          Continue with Google
        </button>
      </motion.div>
    </div>
  );
  const [selectedDialect, setSelectedDialect] = useState<string | null>(null);
  const [words, setWords] = useState<WordEntry[]>([]);
  const [pendingCorrections, setPendingCorrections] = useState<CorrectionEntry[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showKeyboard, setShowKeyboard] = useState(false);
  const [activeTab, setActiveTab] = useState<'curate' | 'vetting' | 'admin' | 'chat' | 'history' | 'social' | 'leaderboard' | 'gamification'>('curate');
  const [curateFilter, setCurateFilter] = useState<'pending' | 'all'>('pending');
  const [adminTab, setAdminTab] = useState<'dataset' | 'logs' | 'export'>('dataset');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({ word: '', meaning: '', pronunciation: '' });
  const [showTutorial, setShowTutorial] = useState(false);
  const [isSettingUpProfile, setIsSettingUpProfile] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('easy');
  const [genCount, setGenCount] = useState<number>(5);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const tutorialSteps = [
    {
      targetId: 'dialect-selector',
      title: 'Choose a Dialect',
      content: 'Select the Ijaw dialect you are most familiar with to start curating words.',
      position: 'bottom' as const,
      action: () => setActiveTab('curate')
    },
    {
      targetId: 'generate-btn',
      title: 'Generate AI Words',
      content: 'Click here to let Gemini AI generate initial words and meanings for your chosen dialect.',
      position: 'bottom' as const,
      action: () => setActiveTab('curate')
    },
    {
      targetId: 'add-entry-btn',
      title: 'Add Your Own',
      content: 'Have a specific word, phrase, or sentence in mind? Click here to manually add it to the dataset.',
      position: 'bottom' as const,
      action: () => setActiveTab('curate')
    },
    {
      targetId: 'correct-btn-step',
      title: 'Verify & Edit',
      content: 'Click here to verify the AI draft. You can correct the spelling, meaning, or pronunciation.',
      position: 'top' as const,
      action: () => setActiveTab('curate')
    },
    {
      targetId: 'flag-btn-step',
      title: 'Flag Errors',
      content: 'If a word is completely wrong or offensive, use the flag button to alert the admins.',
      position: 'top' as const,
      action: () => setActiveTab('curate')
    },
    {
      targetId: 'chat-tab-btn',
      title: 'Interactive Chat',
      content: 'Try the new Chat section! AI speaks English, and you translate it to Ijaw with text and voice.',
      position: 'bottom' as const
    },
    {
      targetId: 'ai-prompt-card',
      title: 'AI Prompt',
      content: 'In the chat, the AI will give you an English phrase. You can also listen to it being spoken.',
      position: 'right' as const,
      action: () => setActiveTab('chat')
    },
    {
      targetId: 'user-translation-card',
      title: 'Your Translation',
      content: 'Type your translation and record your pronunciation here.',
      position: 'left' as const,
      action: () => setActiveTab('chat')
    },
    {
      targetId: 'submit-translation-btn',
      title: 'Submit for Vetting',
      content: 'Once you are happy with your translation, submit it! It will be reviewed by our community admins.',
      position: 'top' as const,
      action: () => setActiveTab('chat')
    },
    ...(isAdmin ? [
      {
        targetId: 'export-tab-btn',
        title: 'Admin Export',
        content: 'As an admin, you can export the entire dataset for offline use or training purposes.',
        position: 'bottom' as const,
        action: () => setActiveTab('admin')
      },
      {
        targetId: 'export-full-btn',
        title: 'Full Dataset Export',
        content: 'Download all text data and audio recordings in a single ZIP file, perfectly matched for machine learning.',
        position: 'top' as const,
        action: () => { setActiveTab('admin'); setAdminTab('export'); }
      }
    ] : [])
  ];

  const completeTutorial = () => {
    setShowTutorial(false);
    localStorage.setItem('hasSeenTutorial', 'true');
  };

  const handleUpdatePreferredDialect = async (dialect: string) => {
    if (!user) return;
    try {
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, { preferredDialect: dialect }, { merge: true });
      setProfile(prev => prev ? { ...prev, preferredDialect: dialect } : null);
      setSelectedDialect(dialect);
      toast.success(`Preferred dialect updated to ${dialect}`);
      setSettingsModalOpen(false);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${user.uid}`);
      toast.error("Failed to update preferred dialect");
    }
  };

  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
    if (!hasSeenTutorial && user && !loading) {
      setShowTutorial(true);
    }
  }, [user, loading]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) setLoading(true);
      setUser(u);
      if (u) {
        try {
          const userRef = doc(db, 'users', u.uid);
          const snap = await getDoc(userRef);
          if (!snap.exists()) {
            const initialProfile: UserProfile = {
              uid: u.uid,
              displayName: u.displayName || 'Anonymous',
              email: u.email || '',
              photoURL: u.photoURL || '',
              role: 'user',
              points: 0,
              contributions: 0,
              streak: {
                current: 1,
                longest: 1,
                lastActiveDate: new Date().toISOString().split('T')[0]
              },
              achievements: [],
              challenges: {},
              createdAt: serverTimestamp()
            };
            setProfile(initialProfile);
            await setDoc(userRef, initialProfile);
          } else {
            // Existing user, check streak
            const data = snap.data() as UserProfile;
            const today = new Date().toISOString().split('T')[0];
            const lastActive = data.streak?.lastActiveDate;
            
            if (lastActive !== today) {
              let newStreak = data.streak?.current || 0;
              const yesterday = new Date();
              yesterday.setDate(yesterday.getDate() - 1);
              const yesterdayStr = yesterday.toISOString().split('T')[0];
              
              if (lastActive === yesterdayStr) {
                newStreak += 1;
              } else {
                newStreak = 1; // Reset if missed a day or first time
              }
              
              const longest = Math.max(newStreak, data.streak?.longest || 0);
              const streakUpdate = {
                'streak.current': newStreak,
                'streak.longest': longest,
                'streak.lastActiveDate': today
              };
              
              await updateDoc(userRef, streakUpdate);
              const updatedProfile = { 
                ...data, 
                streak: { 
                  current: newStreak, 
                  longest: longest, 
                  lastActiveDate: today 
                } 
              };
              setProfile(updatedProfile);
              
              if (newStreak > 1) {
                toast.success(`🔥 ${newStreak} Day Streak! Keep it up!`, {
                  description: "You're on fire! Come back tomorrow to keep the streak alive."
                });
              }
            } else {
              setProfile(data);
            }
          }
        } catch (e) {
          // Log the error but don't re-throw — re-throwing skips setLoading(false)
          // which freezes the app. handleFirestoreError logs full auth context.
          try { handleFirestoreError(e, OperationType.GET, `users/${u.uid}`); } catch {}
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!selectedDialect) return;

    const constraints: any[] = [
      where('dialect', '==', selectedDialect),
      orderBy('createdAt', 'desc'),
      limit(20)
    ];

    if (curateFilter === 'pending') {
      constraints.push(where('status', '==', 'pending'));
    }

    const q = query(
      collection(db, 'words'),
      ...constraints
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const wordList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WordEntry));
      setWords(wordList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'words');
    });

    return unsubscribe;
  }, [selectedDialect]);

  useEffect(() => {
    if (!selectedDialect) {
      setPendingCorrections([]);
      return;
    }

    const q = query(
      collection(db, 'corrections'),
      where('dialect', '==', selectedDialect),
      where('status', '==', 'pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingCorrections(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CorrectionEntry)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'corrections');
    });

    return unsubscribe;
  }, [selectedDialect]);

  const handleGenerate = async () => {
    if (!selectedDialect || !user) return;
    setIsGenerating(true);
    try {
      const newWords = await generateIjawWords(selectedDialect, genCount, difficulty, [], user.uid);
      for (const w of newWords) {
        await addDoc(collection(db, 'words'), {
          ...w,
          status: 'pending',
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          isAiGenerated: true
        });
      }
      await logActivity('AI_GENERATION', `Generated ${newWords.length} words for dialect: ${selectedDialect} (${difficulty})`);
      toast.success(`Generated ${newWords.length} new words!`);
    } catch (error) {
      console.error("Generation error:", error);
      toast.error("Failed to generate words");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateSentences = async () => {
    if (!selectedDialect || !user) return;
    setIsGenerating(true);
    try {
      const newSentences = await generateIjawSentences(selectedDialect, 3, difficulty);
      for (const s of newSentences) {
        await addDoc(collection(db, 'words'), {
          word: s.sentence,
          meaning: s.meaning,
          pronunciation: s.pronunciation,
          dialect: s.dialect,
          status: 'pending',
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          isAiGenerated: true
        });
      }
      await logActivity('AI_SENTENCE_GENERATION', `Generated ${newSentences.length} sentences for dialect: ${selectedDialect} (${difficulty})`);
      toast.success(`Generated ${newSentences.length} new sentences!`);
    } catch (error) {
      console.error("Sentence generation error:", error);
      toast.error("Failed to generate sentences");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddSubmit = async () => {
    if (!user || !selectedDialect || !addForm.word || !addForm.meaning) return;
    try {
      await addDoc(collection(db, 'words'), {
        dialect: selectedDialect,
        word: addForm.word,
        meaning: addForm.meaning,
        pronunciation: addForm.pronunciation,
        status: 'pending',
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        isAiGenerated: false
      });
      await logActivity('WORD_ADDED', `Manually added word/phrase: ${addForm.word}`);
      toast.success("New entry added for vetting!");
      setAddModalOpen(false);
      setAddForm({ word: '', meaning: '', pronunciation: '' });
    } catch (error) {
      console.error("Add error:", error);
      toast.error("Failed to add entry");
    }
  };

  const handleVerify = async (wordId: string) => {
    try {
      const wordRef = doc(db, 'words', wordId);
      await updateDoc(wordRef, { status: 'verified' });
      if (user) {
        const updated = await awardPoints(user.uid, 20, true);
        if (updated) {
          setProfile(updated);
          await checkAchievements(updated);
        }
      }
      await logActivity('WORD_VERIFIED', `Directly verified word ID: ${wordId}`);
      toast.success("Word verified successfully!");
    } catch (error) {
      console.error("Verify error:", error);
      toast.error("Failed to verify word");
    }
  };

  const handleAgreeCorrection = async (correctionId: string) => {
    if (!user) {
      toast.error("Please login to agree with corrections.");
      return;
    }
    try {
      const corrRef = doc(db, 'corrections', correctionId);
      const corrSnap = await getDoc(corrRef);
      if (!corrSnap.exists()) return;
      
      const correction = { id: corrSnap.id, ...corrSnap.data() } as CorrectionEntry;
      const agreedBy = correction.agreedBy || [];
      
      if (correction.submittedBy === user.uid) {
        toast.error("You cannot agree with your own correction.");
        return;
      }

      if (agreedBy.includes(user.uid)) {
        toast.info("You already agreed to this correction.");
        return;
      }
      
      const newAgreedBy = [...agreedBy, user.uid];
      await updateDoc(corrRef, { agreedBy: newAgreedBy });
      
      // Threshold: AGREEMENT_THRESHOLD agreements (user requested 6-8, let's use 7)
      if (newAgreedBy.length >= AGREEMENT_THRESHOLD) {
        await applyCorrection(correction);
        toast.success("Community consensus reached! Correction applied.");
      } else {
        toast.success(`Agreement recorded! (${newAgreedBy.length}/${AGREEMENT_THRESHOLD})`);
      }
      await logActivity('CORRECTION_AGREED', `Agreed to correction for word ID: ${correction.wordId}`);
    } catch (error) {
      console.error("Agree error:", error);
      toast.error("Failed to record agreement");
    }
  };

  const handleFlag = async (wordId: string) => {
    try {
      const wordRef = doc(db, 'words', wordId);
      await updateDoc(wordRef, { status: 'flagged' });
      await logActivity('WORD_FLAGGED', `Flagged word ID: ${wordId}`);
      toast.info("Word flagged for review");
    } catch (error) {
      console.error("Flag error:", error);
    }
  };

  const handleUnflag = async (wordId: string) => {
    try {
      await updateDoc(doc(db, 'words', wordId), { status: 'pending' });
      await logActivity('WORD_UNFLAGGED', `Removed flag from word ID: ${wordId}`);
      toast.success("Flag removed — word is pending review again");
    } catch (error) {
      console.error("Unflag error:", error);
      toast.error("Failed to remove flag");
    }
  };

  if (loading) return null;
  if (!user) return <LandingPage onEnter={() => {}} />;

  if (!profile || !profile.username) {
    return (
      <div className="min-h-screen bg-[#060a12] flex items-center justify-center p-6 text-white relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
          <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-[0.06]" style={{background: 'radial-gradient(circle, #c9922a 0%, transparent 70%)'}} />
          <div className="absolute bottom-[-5%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-[0.04]" style={{background: 'radial-gradient(circle, #1a6b6e 0%, transparent 70%)'}} />
        </div>
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-slate-900/60 backdrop-blur-2xl border border-amber-900/20 p-10 rounded-xl space-y-10 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] relative z-10"
        >
          <div className="text-center space-y-3">
            <h2 className="text-5xl font-semibold text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif"}}>Complete Your Profile</h2>
            <p className="text-slate-400 font-medium">Choose your identity and primary dialect.</p>
          </div>
          
          <form onSubmit={async (e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const username = formData.get('username') as string;
            const dialect = formData.get('dialect') as string;
            
            if (!username || !dialect) return;
            
            try {
              setIsSettingUpProfile(true);
              // Check username uniqueness
              const usernameRef = doc(db, 'usernames', username.toLowerCase());
              const usernameSnap = await getDoc(usernameRef);
              
              if (usernameSnap.exists()) {
                toast.error("Username already taken!");
                setIsSettingUpProfile(false);
                return;
              }
              
              // Create username record
              await setDoc(usernameRef, { uid: user.uid });
              
              // Update user profile
              const userRef = doc(db, 'users', user.uid);
              await setDoc(userRef, {
                username: username,
                username_lowercase: username.toLowerCase(),
                preferredDialect: dialect,
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || 'Anonymous',
                photoURL: user.photoURL || '',
                role: 'user',
                points: profile?.points || 0,
                contributions: profile?.contributions || 0,
                createdAt: serverTimestamp()
              }, { merge: true });
              
              setProfile(prev => ({
                uid: user.uid,
                email: user.email || '',
                displayName: user.displayName || 'Anonymous',
                photoURL: user.photoURL || '',
                role: 'user' as const,
                points: 0,
                contributions: 0,
                createdAt: serverTimestamp(),
                streak: { current: 1, longest: 1, lastActiveDate: new Date().toISOString().split('T')[0] },
                achievements: [],
                challenges: {},
                ...(prev || {}),
                username,
                username_lowercase: username.toLowerCase(),
                preferredDialect: dialect,
              }));
              toast.success("Profile updated!");
            } catch (error) {
              console.error("Profile setup error:", error);
              toast.error("Failed to update profile");
            } finally {
              setIsSettingUpProfile(false);
            }
          }} className="space-y-6">
            <div className="space-y-2.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Unique Username</label>
              <input 
                name="username"
                required
                pattern="^[a-zA-Z0-9_]{3,20}$"
                placeholder="e.g. ijaw_learner_123"
                className="w-full bg-slate-950/50 border border-slate-800/50 rounded-xl px-4 py-4 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 transition-all text-slate-100 placeholder:text-slate-700 shadow-inner"
              />
              <p className="text-[10px] text-slate-600 font-medium ml-1">3-20 characters, lowercase letters, numbers, and underscores.</p>
            </div>
            
            <div className="space-y-2.5">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1">Primary Dialect</label>
              <div className="relative">
                <select 
                  name="dialect"
                  required
                  className="w-full bg-slate-950/50 border border-slate-800/50 rounded-xl px-4 py-4 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/20 appearance-none text-slate-100 transition-all shadow-inner cursor-pointer"
                >
                  <option value="" className="bg-slate-900">Select a dialect...</option>
                  {IJAW_DIALECTS.map(d => <option key={d} value={d} className="bg-slate-900">{d}</option>)}
                </select>
                <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>
            
            <button 
              type="submit"
              disabled={isSettingUpProfile}
              className="w-full py-4 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white font-bold rounded-xl transition-all shadow-lg shadow-amber-700/20"
            >
              {isSettingUpProfile ? "Setting up..." : "Save Profile"}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 font-sans selection:bg-amber-500/20">
      {/* Atmospheric glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] rounded-full opacity-[0.04]" style={{background: 'radial-gradient(circle, #c9922a 0%, transparent 70%)'}} />
        <div className="absolute bottom-[-5%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-[0.04]" style={{background: 'radial-gradient(circle, #1a6b6e 0%, transparent 70%)'}} />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] rounded-full opacity-[0.025]" style={{background: 'radial-gradient(circle, #c9922a 0%, transparent 70%)'}} />
      </div>
      <Toaster position="top-center" theme="dark" richColors />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#060a12]/95 backdrop-blur-xl border-b border-amber-900/20 shadow-sm shadow-black/50 z-40 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">

          {/* Brand */}
          <button
            className="flex items-center gap-2.5 shrink-0 cursor-pointer group"
            onClick={() => { setActiveTab('curate'); setSelectedDialect(null); }}
          >
            <div className="w-8 h-8 bg-amber-700 rounded-lg flex items-center justify-center shadow-md shadow-amber-700/30 group-hover:bg-amber-600 transition-colors">
              <Languages className="w-4.5 h-4.5 text-white" />
            </div>
            <span className="font-bold text-base hidden sm:block" style={{fontFamily: "'Cormorant Garamond', serif", fontWeight: 600, fontSize: '1.1rem', color: '#f0ede4'}}>Izonate</span>
          </button>

          {/* Primary Nav — center */}
          <nav className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('curate')}
              onMouseEnter={playHover}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === 'curate'
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
              )}
            >
              <Home className="w-4 h-4" />
              <span className="hidden sm:inline">Home</span>
            </button>

            <button
              id="chat-tab-btn"
              onClick={() => setActiveTab('chat')}
              onMouseEnter={playHover}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all",
                activeTab === 'chat'
                  ? "bg-emerald-600 text-white shadow-sm shadow-emerald-600/30"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
              )}
            >
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">Chat</span>
            </button>

            {isAdmin && (
              <>
                <button
                  onClick={() => setActiveTab('vetting')}
                  onMouseEnter={playHover}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all",
                    activeTab === 'vetting'
                      ? "bg-amber-600 text-white shadow-sm shadow-amber-600/30"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                  )}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="hidden md:inline">Vetting</span>
                </button>
                <button
                  onClick={() => setActiveTab('admin')}
                  onMouseEnter={playHover}
                  className={cn(
                    "flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all",
                    activeTab === 'admin'
                      ? "bg-amber-700 text-white shadow-sm shadow-amber-700/30"
                      : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                  )}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span className="hidden md:inline">Admin</span>
                </button>
              </>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Streak pill */}
            {profile?.streak && profile.streak.current > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs font-bold text-orange-300">{profile.streak.current}</span>
              </div>
            )}

            {/* More dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowMoreMenu(v => !v)}
                onMouseEnter={playHover}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all",
                  showMoreMenu ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                )}
                aria-label="More options"
              >
                <MoreHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">More</span>
              </button>

              <AnimatePresence>
                {showMoreMenu && (
                  <>
                    {/* backdrop */}
                    <div className="fixed inset-0 z-40" onClick={() => setShowMoreMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-2 w-52 bg-slate-900 border border-slate-700/60 rounded-xl shadow-2xl shadow-black/40 z-50 overflow-hidden"
                    >
                      <div className="p-1.5 space-y-0.5">
                        <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Explore</p>
                        {[
                          { label: 'Translation History', icon: History, tab: 'history' as const },
                          { label: 'Community', icon: UsersIcon, tab: 'social' as const },
                          { label: 'Leaderboard', icon: Trophy, tab: 'leaderboard' as const },
                          { label: 'Achievements', icon: Star, tab: 'gamification' as const },
                        ].map(({ label, icon: Icon, tab }) => (
                          <button
                            key={tab}
                            onClick={() => { setActiveTab(tab); setShowMoreMenu(false); }}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-left",
                              activeTab === tab ? "bg-amber-700/20 text-amber-300" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                            )}
                          >
                            <Icon className="w-4 h-4 shrink-0" />
                            {label}
                          </button>
                        ))}

                        <div className="my-1 border-t border-slate-800" />
                        <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Account</p>

                        <button
                          onClick={() => { setSettingsModalOpen(true); setShowMoreMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
                        >
                          <Settings className="w-4 h-4 shrink-0" />
                          Settings
                        </button>

                        <button
                          onClick={() => { setShowTutorial(true); setShowMoreMenu(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors text-left"
                        >
                          <HelpCircle className="w-4 h-4 shrink-0" />
                          Tutorial
                        </button>

                        <div className="my-1 border-t border-slate-800" />
                        <button
                          onClick={() => signOut(auth)}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors text-left"
                        >
                          <LogOut className="w-4 h-4 shrink-0" />
                          Sign out
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-lg bg-amber-700/20 border border-amber-500/30 flex items-center justify-center cursor-pointer hover:border-amber-400/50 transition-colors shrink-0"
              title={user.displayName || 'Profile'}
              onClick={() => setSettingsModalOpen(true)}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="avatar" className="w-full h-full rounded-lg object-cover" />
              ) : (
                <span className="text-xs font-bold text-amber-300">
                  {(user.displayName || user.email || 'U')[0].toUpperCase()}
                </span>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 relative z-10">
        {activeTab === 'social' ? (
          <SocialSection profile={profile} />
        ) : activeTab === 'leaderboard' ? (
          <LeaderboardSection />
        ) : activeTab === 'gamification' ? (
          profile && <GamificationSection profile={profile} />
        ) : !selectedDialect ? (
          <div className="py-12">
          <div className="mb-12 text-center max-w-2xl mx-auto">
            <h1 className="text-5xl font-semibold mb-4 text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif"}}>Choose a Dialect</h1>
            <p className="text-slate-400 text-lg font-medium">Select the dialect you are most familiar with to start curating and correcting words.</p>
          </div>
            <DialectSelector onSelect={setSelectedDialect} />
          </div>
        ) : activeTab === 'vetting' ? (
          <VettingPanel selectedDialect={selectedDialect} />
        ) : activeTab === 'admin' ? (
          <AdminDashboard 
            adminTab={adminTab} 
            setAdminTab={setAdminTab} 
            selectedDialect={selectedDialect} 
            onDialectChange={setSelectedDialect}
          />
        ) : activeTab === 'chat' ? (
          <ChatSection 
            dialect={selectedDialect} 
            profile={profile}
            setProfile={setProfile}
            checkAchievements={checkAchievements}
          />
        ) : activeTab === 'history' ? (
          <ChatHistory />
        ) : (
          <div className="space-y-8">
            {/* Controls */}
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 bg-slate-900/30 p-4 rounded-xl border border-amber-900/20 shadow-sm backdrop-blur-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800/50">
                  <button 
                    onClick={() => setCurateFilter('pending')}
                    onMouseEnter={playHover}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-semibold transition-all",
                      curateFilter === 'pending' ? "bg-amber-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    To Review
                  </button>
                  <button 
                    onClick={() => setCurateFilter('all')}
                    onMouseEnter={playHover}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-semibold transition-all",
                      curateFilter === 'all' ? "bg-slate-800 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                    )}
                  >
                    All
                  </button>
                </div>

                <div className="flex items-center gap-1 bg-slate-950/50 p-1 rounded-xl border border-slate-800/50">
                  {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => setDifficulty(level)}
                      onMouseEnter={playHover}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-semibold capitalize transition-all",
                        difficulty === level ? "bg-amber-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-1 bg-slate-950/50 p-1 rounded-xl border border-slate-800/50">
                  {[5, 10, 20].map((count) => (
                    <button
                      key={count}
                      onClick={() => setGenCount(count)}
                      onMouseEnter={playHover}
                      className={cn(
                        "px-3 py-2 rounded-lg text-xs font-semibold transition-all",
                        genCount === count ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                      )}
                    >
                      {count}
                    </button>
                  ))}
                </div>

                <div className="h-6 w-[1px] bg-slate-800 mx-1 hidden lg:block" />

                <button 
                  id="generate-btn"
                  onClick={handleGenerate}
                  onMouseEnter={playHover}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-sm rounded-xl font-medium transition-all flex items-center gap-2 shadow-sm shadow-amber-700/20"
                >
                  {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Words
                </button>

                <button 
                  id="generate-sentences-btn"
                  onClick={handleGenerateSentences}
                  onMouseEnter={playHover}
                  disabled={isGenerating}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm rounded-xl font-medium transition-all flex items-center gap-2 shadow-sm shadow-purple-600/20"
                >
                  {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  Sentences
                </button>

                <button 
                  id="add-entry-btn"
                  onClick={() => setAddModalOpen(true)}
                  onMouseEnter={playHover}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-xl font-medium transition-all flex items-center gap-2 shadow-sm shadow-emerald-600/20"
                >
                  <Plus className="w-4 h-4" />
                  Manual Entry
                </button>
                <button 
                  id="keyboard-toggle"
                  onClick={() => setShowKeyboard(!showKeyboard)}
                  onMouseEnter={playHover}
                  title="Toggle Virtual Keyboard"
                  className={cn(
                    "p-2 rounded-xl border transition-all",
                    showKeyboard ? "bg-slate-800 border-amber-500 text-amber-400" : "bg-slate-900/50 border-slate-700/50 text-slate-400 hover:text-white"
                  )}
                >
                  <Keyboard className="w-5 h-5" />
                </button>
              </div>
              
              <div className="relative w-full xl:w-64 shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="text" 
                  placeholder="Search words..." 
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/50 border border-slate-800 rounded-xl text-sm focus:outline-none focus:border-amber-500 transition-colors placeholder:text-slate-600"
                />
              </div>
            </div>

            {/* Keyboard Overlay */}
            <AnimatePresence>
              {showKeyboard && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <VirtualKeyboard 
                    onInput={(char) => {
                      // Handle keyboard input if needed
                    }}
                    onBackspace={() => {
                      // Handle backspace if needed
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Word Grid */}
            <AnimatePresence mode="popLayout">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {words.map((word, idx) => (
                <WordCard
                  key={word.id} 
                  word={word} 
                  index={idx}
                  isAdmin={profile?.role === 'admin'}
                  pendingCorrection={pendingCorrections.find(c => c.wordId === word.id)}
                  onFlag={() => handleFlag(word.id)}
                  onVerify={() => handleVerify(word.id)}
                  onInlineCorrect={async (newWord, meaning, pronunciation, audioUrl) => {
                    if (!user) return;
                    try {
                      if (profile?.role === 'admin') {
                        const wordRef = doc(db, 'words', word.id);
                        await updateDoc(wordRef, {
                          word: newWord,
                          meaning,
                          pronunciation,
                          status: 'verified'
                        });
                        const updated = await awardPoints(user.uid, 20, true);
                        if (updated) {
                          setProfile(updated);
                          await checkAchievements(updated);
                        }
                        await logActivity('WORD_UPDATED', `Admin updated and verified word ID: ${word.id}`);
                        toast.success("Word updated and verified!");
                      } else {
                        await addDoc(collection(db, 'corrections'), {
                          wordId: word.id,
                          dialect: word.dialect,
                          originalWord: word.word,
                          originalMeaning: word.meaning,
                          originalPronunciation: word.pronunciation,
                          suggestedWord: newWord,
                          suggestedMeaning: meaning,
                          suggestedPronunciation: pronunciation,
                          reason: 'Inline correction',
                          submittedBy: user.uid,
                          submittedAt: serverTimestamp(),
                          status: 'pending',
                          audioUrl: audioUrl || null,
                          agreedBy: []
                        });
                        const updated = await awardPoints(user.uid, 10, true);
                        if (updated) {
                          setProfile(updated);
                          await checkAchievements(updated);
                        }
                        await logActivity('CORRECTION_SUBMITTED', `Submitted inline correction for word ID: ${word.id}`);
                        toast.success("Correction submitted for community review!");
                      }
                    } catch (error) {
                      console.error("Inline correction error:", error);
                      toast.error("Failed to submit correction");
                      throw error;
                    }
                  }}
                  onAgree={handleAgreeCorrection}
                  onUnflag={() => handleUnflag(word.id)}
                />
              ))}
            </div>
            </AnimatePresence>

            {words.length === 0 && !isGenerating && (
              <div className="text-center py-20 bg-slate-900/40 rounded-xl border border-dashed border-slate-800/50 backdrop-blur-md">
                <div className="w-16 h-16 bg-slate-800/50 rounded-xl flex items-center justify-center mx-auto mb-5 border border-slate-700/50 shadow-inner">
                  <RefreshCw className="w-8 h-8 text-slate-600" />
                </div>
                <h3 className="text-2xl font-semibold text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif"}}>No words found</h3>
                <p className="text-slate-500 mt-2 font-medium uppercase text-[10px] tracking-widest">Select a dialect to begin generation</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Add Entry Modal */}
      <AnimatePresence>
        {addModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setAddModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-lg bg-slate-900/90 backdrop-blur-xl border border-slate-800/50 rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-amber-900/20 flex justify-between items-center bg-slate-900/50">
                <h3 className="text-2xl font-semibold text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif"}}>Add New Entry</h3>
                <button onClick={() => setAddModalOpen(false)} onMouseEnter={playHover} className="p-2 hover:bg-slate-800/50 rounded-lg text-slate-400 hover:text-slate-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Word or Phrase (Ijaw)</label>
                  <input 
                    value={addForm.word}
                    onChange={(e) => setAddForm({ ...addForm, word: e.target.value })}
                    className="w-full bg-slate-950/50 border border-slate-800/50 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all text-slate-200 placeholder:text-slate-600"
                    placeholder="e.g. I am going home"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Meaning (English)</label>
                  <input 
                    value={addForm.meaning}
                    onChange={(e) => setAddForm({ ...addForm, meaning: e.target.value })}
                    className="w-full bg-slate-950/50 border border-slate-800/50 rounded-xl px-4 py-3 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all text-slate-200 placeholder:text-slate-600"
                    placeholder="e.g. I am going home"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Pronunciation Guide</label>
                  <input 
                    value={addForm.pronunciation}
                    onChange={(e) => setAddForm({ ...addForm, pronunciation: e.target.value })}
                    className="w-full bg-slate-950/50 border border-slate-800/50 rounded-xl px-4 py-3 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all text-slate-200 placeholder:text-slate-600 font-mono text-sm"
                    placeholder="Phonetic guide"
                  />
                </div>

                <button 
                  onClick={handleAddSubmit}
                  onMouseEnter={playHover}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition-all mt-4 shadow-lg shadow-emerald-600/20 border border-transparent"
                >
                  Submit for Vetting
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Modal */}
      <AnimatePresence>
        {settingsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSettingsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-slate-900/90 backdrop-blur-xl border border-slate-800/50 rounded-xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-amber-900/20 flex justify-between items-center bg-slate-900/50">
                <h3 className="text-2xl font-semibold text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif"}}>Profile Settings</h3>
                <button onClick={() => setSettingsModalOpen(false)} onMouseEnter={playHover} className="p-2 hover:bg-slate-800/50 rounded-lg text-slate-400 hover:text-slate-100 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Languages className="w-5 h-5 text-amber-400" />
                    <h4 className="font-bold text-slate-300 uppercase tracking-widest text-xs">Preferred Dialect</h4>
                  </div>
                  <p className="text-slate-500 text-sm">Setting a preferred dialect will automatically filter content and default your selections when you log in.</p>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {IJAW_DIALECTS.map((dialect) => (
                      <button
                        key={dialect}
                        onClick={() => handleUpdatePreferredDialect(dialect)}
                        onMouseEnter={playHover}
                        className={cn(
                          "px-4 py-3 rounded-xl border text-sm font-medium transition-all",
                          profile?.preferredDialect === dialect 
                            ? "bg-amber-700 border-amber-500 text-white shadow-lg shadow-amber-700/20" 
                            : "bg-slate-950/50 border-slate-800/50 text-slate-400 hover:border-amber-500/30 hover:text-white"
                        )}
                      >
                        {dialect}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800/50">
                  <div className="flex items-center justify-between p-5 bg-slate-950/50 rounded-xl border border-slate-800/50 shadow-inner">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center border border-slate-800/50">
                        {user.photoURL ? (
                          <img src={user.photoURL} className="w-full h-full rounded-xl object-cover" alt="" />
                        ) : (
                          <UserIcon className="w-6 h-6 text-slate-500" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-slate-100">{user.displayName}</p>
                        <p className="text-xs text-slate-500">{user.email}</p>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-slate-800/50 border border-slate-700/50 rounded-lg text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      {isAdmin ? 'Admin Access' : 'Standard User'}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <Tutorial 
        steps={tutorialSteps} 
        isOpen={showTutorial} 
        onComplete={completeTutorial} 
      />
    </div>
  );
}
