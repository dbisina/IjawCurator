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
  ThumbsUp
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
    <div id="dialect-selector" className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {IJAW_DIALECTS.map((dialect) => (
        <button
          key={dialect}
          onMouseEnter={playHover}
          onClick={() => onSelect(dialect)}
          className="p-6 bg-zinc-900 border border-zinc-800 rounded-2xl text-center hover:border-indigo-500 hover:bg-indigo-500/5 transition-all group"
        >
          <span className="block text-lg font-medium text-white group-hover:text-indigo-400">{dialect}</span>
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
  onFlag, 
  onVerify,
  onInlineCorrect,
  onAgree
}: { 
  word: WordEntry, 
  index: number, 
  isAdmin?: boolean,
  pendingCorrection?: CorrectionEntry,
  onFlag: () => void, 
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

  const handlePlay = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      // Use human audio if available and not currently editing the word text
      if (word.audioUrl && !isEditing) {
        const audio = new Audio(word.audioUrl);
        audio.onended = () => setIsPlaying(false);
        audio.onerror = () => {
          setIsPlaying(false);
          toast.error("Failed to play audio sample");
        };
        audio.play();
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
      toast.error("Failed to play pronunciation");
      setIsPlaying(false);
    }
  };

  const statusColors = {
    pending: "border-zinc-800 bg-zinc-900/50",
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
      animate={{ opacity: 1, scale: 1 }}
      onMouseEnter={playHover}
      className={cn(
        "border p-6 rounded-2xl flex flex-col gap-4 transition-all duration-300",
        statusColors[word.status]
      )}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            {isEditing ? (
              <div className="flex-1 flex items-center gap-2">
                <div className="space-y-1 flex-1">
                  <p className="text-[10px] font-bold text-zinc-500 uppercase">Ijaw Word</p>
                  <input
                    type="text"
                    value={editedWord}
                    onChange={(e) => setEditedWord(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-lg font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                    placeholder="Ijaw word..."
                  />
                </div>
                <button 
                  onClick={handlePlay}
                  disabled={isPlaying}
                  className="mt-4 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                  title="Play pronunciation"
                >
                  {isPlaying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h3 className="text-2xl font-bold text-white tracking-tight">{word.word}</h3>
                <button 
                  onClick={handlePlay}
                  disabled={isPlaying}
                  className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                  title="Play pronunciation"
                >
                  {isPlaying ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
          {isEditing ? (
            <div className="space-y-1 mt-2">
              <p className="text-[10px] font-bold text-zinc-500 uppercase">Pronunciation</p>
              <input
                type="text"
                value={editedPronunciation}
                onChange={(e) => setEditedPronunciation(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                placeholder="Pronunciation..."
              />
            </div>
          ) : (
            <p className="text-sm text-zinc-500 font-mono">/{word.pronunciation}/</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          {word.isAiGenerated && (
            <span className="px-2 py-0.5 bg-indigo-500/10 text-indigo-400 text-[9px] font-bold uppercase tracking-widest rounded border border-indigo-500/20">
              AI Draft
            </span>
          )}
          <span className={cn(
            "px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded border",
            word.status === 'pending' && "bg-zinc-800 text-zinc-400 border-zinc-700",
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
                <span className="text-[10px] text-zinc-500 font-bold">
                  {pendingCorrection.agreedBy?.length || 0}/{AGREEMENT_THRESHOLD} Agree
                </span>
                {onAgree && pendingCorrection.submittedBy !== auth.currentUser?.uid && (
                  <button
                    onClick={() => onAgree(pendingCorrection.id)}
                    className={cn(
                      "p-1 rounded transition-all",
                      pendingCorrection.agreedBy?.includes(auth.currentUser?.uid || '') 
                        ? "bg-indigo-600 text-white" 
                        : "bg-zinc-800 text-zinc-400 hover:text-white"
                    )}
                    title="Agree with this correction"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className={cn(
        "py-2 bg-black/20 rounded-xl p-4 border transition-colors",
        isEditing ? "border-indigo-500/20 bg-indigo-500/5" : "border-zinc-800/50"
      )}>
        <p className="text-xs font-bold text-zinc-600 uppercase tracking-widest mb-1">
          Meaning (English)
        </p>
        <p className="text-zinc-300 text-lg leading-snug">{word.meaning}</p>
      </div>

        {isEditing && (
          <div className="pt-4 border-t border-zinc-800/50">
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

        <div className="flex gap-2 mt-auto pt-2">
        {isEditing ? (
          <>
            <button 
              onClick={() => {
                setIsEditing(false);
                setEditedWord(word.word);
                setEditedPronunciation(word.pronunciation);
                setUploadedAudioUrl(null);
              }}
              className="flex-1 py-2.5 bg-zinc-800 text-zinc-400 hover:text-white rounded-xl text-sm font-bold transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleSubmit}
              disabled={isSubmitting || isUploading}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg disabled:opacity-50"
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
                "flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 shadow-lg",
                !!pendingCorrection && !isAdmin 
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
                  : "bg-white text-black hover:bg-zinc-200"
              )}
            >
              {!!pendingCorrection && !isAdmin ? (
                <>{pendingCorrection.submittedBy === auth.currentUser?.uid ? "Your Correction Pending" : "Reviewing..."}</>
              ) : (
                <><Plus className="w-4 h-4" /> {isAdmin ? "Edit & Verify" : "Verify / Edit"}</>
              )}
            </button>
            {isAdmin && word.status === 'pending' && (
              <button 
                onClick={onVerify}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center shadow-lg"
                title="Quick Verify"
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            <button 
              id={index === 0 ? "flag-btn-step" : undefined}
              onClick={onFlag}
              className="px-4 py-2.5 bg-zinc-800 hover:bg-red-900/30 text-red-500 rounded-xl text-sm font-medium transition-colors border border-zinc-700"
            >
              <AlertTriangle className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
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
        <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl space-y-6">
          <div className="w-12 h-12 bg-indigo-500/10 rounded-2xl flex items-center justify-center">
            <FileSpreadsheet className="w-6 h-6 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Export CSV</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Download a spreadsheet containing all words, phrases, and translations. This is perfect for data analysis or quick review.
            </p>
          </div>
          <button 
            id="export-csv-btn"
            onClick={handleExportCSV}
            disabled={isExporting}
            className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl space-y-6">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center">
            <Music className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-bold mb-2">Full Dataset (ZIP)</h3>
            <p className="text-zinc-500 text-sm leading-relaxed">
              Export all text data along with their corresponding audio recordings. Each recording is matched to its text entry in a metadata file.
            </p>
          </div>
          <div className="space-y-4">
            <button 
              id="export-full-btn"
              onClick={handleExportFull}
              disabled={isExporting}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
            >
              {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export Full Dataset
            </button>
            {isExporting && progress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase">
                  <span>Processing Audios</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-emerald-500"
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
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button 
              onClick={() => setAdminTab('dataset')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all",
                adminTab === 'dataset' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Dataset
            </button>
            <button 
              onClick={() => setAdminTab('logs')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all",
                adminTab === 'logs' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Activity Log
            </button>
            <button 
              id="export-tab-btn"
              onClick={() => setAdminTab('export')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold uppercase transition-all",
                adminTab === 'export' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Export
            </button>
          </div>
        </div>
        
        {adminTab === 'dataset' && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-zinc-900 px-3 py-1 rounded-xl border border-zinc-800">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Dialect:</span>
              <select 
                value={selectedDialect || ''} 
                onChange={(e) => onDialectChange(e.target.value || null)}
                className="bg-transparent text-xs font-bold text-indigo-400 focus:outline-none cursor-pointer"
              >
                <option value="">All Dialects</option>
                {IJAW_DIALECTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
              {(['all', 'pending', 'verified', 'flagged'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                    filter === f ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300"
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
            <div key={word.id} className="bg-zinc-900/50 border border-zinc-800 p-4 rounded-xl space-y-2">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-lg font-bold">{word.word}</p>
                  <p className="text-xs text-indigo-400 font-medium uppercase">{word.dialect}</p>
                </div>
                <span className={cn(
                  "px-2 py-0.5 text-[8px] font-bold uppercase rounded border",
                  word.status === 'pending' && "border-zinc-700 text-zinc-500",
                  word.status === 'verified' && "border-emerald-500/30 text-emerald-500",
                  word.status === 'flagged' && "border-red-500/30 text-red-500"
                )}>
                  {word.status}
                </span>
              </div>
              <p className="text-sm text-zinc-400 line-clamp-2">{word.meaning}</p>
            </div>
          ))}
        </div>
      ) : adminTab === 'logs' ? (
        <div className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-900 text-zinc-500 uppercase text-[10px] font-bold tracking-widest">
              <tr>
                <th className="px-6 py-4">Timestamp</th>
                <th className="px-6 py-4">User</th>
                <th className="px-6 py-4">Action</th>
                <th className="px-6 py-4">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-900/50 transition-colors">
                  <td className="px-6 py-4 text-zinc-500 font-mono text-xs">
                    {log.timestamp?.toDate().toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-medium">{log.userEmail}</p>
                    <p className="text-[10px] text-zinc-600 font-mono">{log.userId}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-zinc-800 rounded text-[10px] font-bold uppercase">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-zinc-400">
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

  if (loading) return <div className="py-20 text-center text-zinc-500">Loading vetting queue...</div>;

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
                filterByDialect ? "bg-indigo-600/10 border-indigo-500/50 text-indigo-400" : "bg-zinc-900 border-zinc-800 text-zinc-500"
              )}
            >
              {filterByDialect ? `Only ${selectedDialect}` : "All Dialects"}
            </button>
          )}
          <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
            <button 
              onClick={() => setVettingTab('corrections')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                vettingTab === 'corrections' ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Corrections ({corrections.length})
            </button>
            <button 
              onClick={() => setVettingTab('chat')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                vettingTab === 'chat' ? "bg-emerald-600 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Chat Sessions ({chatSessions.length})
            </button>
            <button 
              onClick={() => setVettingTab('voice')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-bold transition-all",
                vettingTab === 'voice' ? "bg-amber-600 text-white" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Voice Samples ({voiceExercises.length})
            </button>
          </div>
        </div>
      </div>

      {vettingTab === 'corrections' ? (
        corrections.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800">
            <CheckCircle2 className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-zinc-400">All caught up!</h3>
            <p className="text-zinc-600 mt-2">There are no pending corrections to review.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {corrections.map((corr) => (
              <motion.div 
                key={corr.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col gap-6"
              >
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Correction for:</span>
                      <span className="text-sm font-mono text-indigo-400">{corr.wordId}</span>
                      {corr.dialect && (
                        <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] font-bold uppercase rounded border border-zinc-700">
                          {corr.dialect}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2 px-3 py-1 bg-zinc-900 rounded-full border border-zinc-800">
                        <ThumbsUp className="w-3 h-3 text-indigo-400" />
                        <span className="text-[10px] font-bold text-zinc-400">
                          {corr.agreedBy?.length || 0}/{AGREEMENT_THRESHOLD} Agreements
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => handleCorrectionAction(corr, 'rejected')}
                          className="px-4 py-1.5 bg-zinc-800 hover:bg-red-900/20 text-red-500 rounded-lg text-xs font-bold transition-colors border border-zinc-700"
                        >
                          Reject
                        </button>
                        <button 
                          onClick={() => handleCorrectionAction(corr, 'approved')}
                          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-indigo-600/20"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                    <div className="space-y-4">
                      <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-zinc-800 pb-1">Current Version</p>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-zinc-500 uppercase font-bold">Word</p>
                          <p className="text-lg font-bold text-zinc-400">{corr.originalWord || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 uppercase font-bold">Meaning</p>
                          <p className="text-sm text-zinc-500">{corr.originalMeaning || 'N/A'}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 uppercase font-bold">Pronunciation</p>
                          <p className="text-xs font-mono text-zinc-600">/{corr.originalPronunciation || 'N/A'}/</p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 border-l border-zinc-800 pl-6">
                      <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest border-b border-indigo-500/20 pb-1">Suggested Correction</p>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-zinc-500 uppercase font-bold">Word</p>
                          <p className="text-lg font-bold text-white">{corr.suggestedWord}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 uppercase font-bold">Meaning</p>
                          <p className="text-sm text-zinc-300">{corr.suggestedMeaning}</p>
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 uppercase font-bold">Pronunciation</p>
                          <p className="text-xs font-mono text-indigo-400">/{corr.suggestedPronunciation}/</p>
                        </div>
                        {corr.audioUrl && (
                          <div className="pt-2">
                            <button 
                              onClick={() => new Audio(corr.audioUrl).play()}
                              className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-[10px] font-bold transition-all border border-indigo-500/20 group"
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
                    <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                      <p className="text-xs text-zinc-500 uppercase font-bold mb-1">Reason for Correction</p>
                      <p className="text-sm text-zinc-400 italic">"{corr.reason}"</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )
      ) : vettingTab === 'chat' ? (
        chatSessions.length === 0 ? (
          <div className="text-center py-20 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800">
            <MessageSquare className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-zinc-400">No chat sessions</h3>
            <p className="text-zinc-600 mt-2">There are no pending chat translations to review.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {chatSessions.map((session) => (
              <motion.div 
                key={session.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col gap-6"
              >
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Chat Session:</span>
                      <span className="text-sm font-mono text-emerald-400">{session.dialect}</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleChatAction(session, 'rejected')}
                        className="px-4 py-1.5 bg-zinc-800 hover:bg-red-900/20 text-red-500 rounded-lg text-xs font-bold transition-colors border border-zinc-700"
                      >
                        Reject
                      </button>
                      <button 
                        onClick={() => handleChatAction(session, 'verified')}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-emerald-600/20"
                      >
                        Verify
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50">
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest border-b border-zinc-800 pb-1">AI Prompt (English)</p>
                      <p className="text-lg font-medium text-white italic">"{session.englishPhrase}"</p>
                    </div>
                    <div className="space-y-2 border-l border-zinc-800 pl-6">
                      <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest border-b border-emerald-500/20 pb-1">User Translation (Ijaw)</p>
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xl font-bold text-emerald-400">{session.ijawTranslation}</p>
                        {session.audioUrl && (
                          <button 
                            onClick={() => new Audio(session.audioUrl).play()}
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
          <div className="text-center py-20 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800">
            <Mic2 className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-zinc-400">No voice samples</h3>
            <p className="text-zinc-600 mt-2">There are no pending voice exercises to review.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {voiceExercises.map((exercise) => (
              <motion.div 
                key={exercise.id}
                layout
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="bg-zinc-900 border border-zinc-800 p-6 rounded-2xl flex flex-col gap-6"
              >
                <div className="flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Voice Sample for:</span>
                      <span className="text-sm font-mono text-amber-400">{exercise.wordId}</span>
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleVoiceAction(exercise, 'rejected')}
                        className="px-4 py-1.5 bg-zinc-800 hover:bg-red-900/20 text-red-500 rounded-lg text-xs font-bold transition-colors border border-zinc-700"
                      >
                        Reject
                      </button>
                      <button 
                        onClick={() => handleVoiceAction(exercise, 'verified')}
                        className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-amber-600/20"
                      >
                        Verify
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-950/50 rounded-xl border border-zinc-800/50 flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Submitted By</p>
                      <p className="text-sm text-white">{exercise.userEmail}</p>
                      <p className="text-[10px] text-zinc-500 uppercase">{exercise.dialect}</p>
                    </div>
                    <button 
                      onClick={() => new Audio(exercise.audioUrl).play()}
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
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl shadow-2xl text-center"
      >
        <div className="w-20 h-20 bg-indigo-600/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <Languages className="w-10 h-10 text-indigo-500" />
        </div>
        <h1 className="text-3xl font-bold mb-2">Ijaw Language Curator</h1>
        <p className="text-zinc-400 mb-8">Help us build the most accurate dataset for the Ijaw language and its dialects.</p>
        <button
          onClick={handleLogin}
          className="w-full py-4 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-3"
        >
          <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
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
          handleFirestoreError(e, OperationType.GET, `users/${u.uid}`);
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
      const newWords = await generateIjawWords(selectedDialect, genCount, difficulty);
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

  if (loading) return null;
  if (!user) return <Login />;

  if ((!profile || !profile.username) && !isSettingUpProfile) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-white">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-zinc-900 border border-zinc-800 p-8 rounded-[2.5rem] space-y-8 shadow-2xl"
        >
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">Complete Your Profile</h2>
            <p className="text-zinc-400">Choose a unique username and your primary dialect to get started.</p>
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
              
              setProfile(prev => prev ? { ...prev, username, preferredDialect: dialect } : null);
              toast.success("Profile updated!");
            } catch (error) {
              console.error("Profile setup error:", error);
              toast.error("Failed to update profile");
            } finally {
              setIsSettingUpProfile(false);
            }
          }} className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Unique Username</label>
              <input 
                name="username"
                required
                pattern="^[a-zA-Z0-9_]{3,20}$"
                placeholder="e.g. ijaw_learner_123"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors text-white placeholder:text-zinc-600"
              />
              <p className="text-[10px] text-zinc-400 ml-1">3-20 characters, letters, numbers, and underscores only.</p>
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest ml-1">Primary Dialect</label>
              <select 
                name="dialect"
                required
                className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-indigo-500 transition-colors appearance-none text-white"
              >
                <option value="">Select a dialect...</option>
                {IJAW_DIALECTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            
            <button 
              type="submit"
              disabled={isSettingUpProfile}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-2xl transition-all shadow-lg shadow-indigo-600/20"
            >
              {isSettingUpProfile ? "Setting up..." : "Save Profile"}
            </button>
          </form>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans">
      <Toaster position="top-center" theme="dark" />
      
      {/* Header */}
      <header className="sticky top-0 z-40 bg-zinc-950/80 backdrop-blur-md border-bottom border-zinc-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setSelectedDialect(null)}>
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">
              <Languages className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-lg leading-tight">Ijaw Curator</h2>
              {selectedDialect && <p className="text-xs text-indigo-400 font-medium uppercase tracking-wider">{selectedDialect}</p>}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setShowTutorial(true)}
              onMouseEnter={playHover}
              className="p-2 bg-zinc-900 text-zinc-400 hover:text-white rounded-lg transition-colors"
              title="Start Tutorial"
            >
              <HelpCircle className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setActiveTab(activeTab === 'social' ? 'curate' : 'social')}
              onMouseEnter={playHover}
              className={cn(
                "p-2 rounded-lg transition-colors",
                activeTab === 'social' ? "bg-indigo-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
              )}
              title="Social Hub"
            >
              <UsersIcon className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setActiveTab(activeTab === 'leaderboard' ? 'curate' : 'leaderboard')}
              onMouseEnter={playHover}
              className={cn(
                "p-2 rounded-lg transition-colors",
                activeTab === 'leaderboard' ? "bg-amber-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
              )}
              title="Leaderboard"
            >
              <Trophy className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setActiveTab(activeTab === 'gamification' ? 'curate' : 'gamification')}
              onMouseEnter={playHover}
              className={cn(
                "p-2 rounded-lg transition-colors",
                activeTab === 'gamification' ? "bg-orange-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
              )}
              title="Streaks & Awards"
            >
              <Flame className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setActiveTab(activeTab === 'history' ? 'curate' : 'history')}
              onMouseEnter={playHover}
              className={cn(
                "p-2 rounded-lg transition-colors",
                activeTab === 'history' ? "bg-indigo-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
              )}
              title="Translation History"
            >
              <History className="w-5 h-5" />
            </button>
            <button 
              id="chat-tab-btn"
              onClick={() => setActiveTab(activeTab === 'chat' ? 'curate' : 'chat')}
              onMouseEnter={playHover}
              className={cn(
                "p-2 rounded-lg transition-colors",
                activeTab === 'chat' ? "bg-emerald-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
              )}
              title="Interactive Chat"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
            {isAdmin && (
              <div className="flex gap-2">
                <button 
                  onClick={() => setActiveTab(activeTab === 'admin' ? 'curate' : 'admin')}
                  onMouseEnter={playHover}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    activeTab === 'admin' ? "bg-indigo-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
                  )}
                  title="Admin Dashboard"
                >
                  <ShieldCheck className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => setActiveTab(activeTab === 'vetting' ? 'curate' : 'vetting')}
                  onMouseEnter={playHover}
                  className={cn(
                    "p-2 rounded-lg transition-colors",
                    activeTab === 'vetting' ? "bg-indigo-600 text-white" : "bg-zinc-900 text-zinc-400 hover:text-white"
                  )}
                  title="Vetting Queue"
                >
                  <CheckCircle2 className="w-5 h-5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-3 pl-4 border-l border-zinc-800">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium">{user.displayName}</p>
                <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{isAdmin ? 'admin' : 'user'}</p>
              </div>
              <button 
                onClick={() => setSettingsModalOpen(true)} 
                onMouseEnter={playHover}
                className="p-2 bg-zinc-900 text-zinc-400 hover:text-white rounded-lg transition-colors"
                title="Profile Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button onClick={() => signOut(auth)} onMouseEnter={playHover} className="p-2 bg-zinc-900 hover:bg-red-900/20 text-zinc-400 hover:text-red-500 rounded-lg transition-all">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {activeTab === 'social' ? (
          <SocialSection profile={profile} />
        ) : activeTab === 'leaderboard' ? (
          <LeaderboardSection />
        ) : activeTab === 'gamification' ? (
          profile && <GamificationSection profile={profile} />
        ) : !selectedDialect ? (
          <div className="py-12">
            <div className="mb-12 text-center max-w-2xl mx-auto">
              <h1 className="text-4xl font-bold mb-4">Choose a Dialect</h1>
              <p className="text-zinc-400 text-lg">Select the dialect you are most familiar with to start curating and correcting words.</p>
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
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                  <button 
                    onClick={() => setCurateFilter('pending')}
                    onMouseEnter={playHover}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                      curateFilter === 'pending' ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    To Review
                  </button>
                  <button 
                    onClick={() => setCurateFilter('all')}
                    onMouseEnter={playHover}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                      curateFilter === 'all' ? "bg-zinc-800 text-white" : "text-zinc-500 hover:text-zinc-300"
                    )}
                  >
                    All
                  </button>
                </div>

                <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                  {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((level) => (
                    <button
                      key={level}
                      onClick={() => setDifficulty(level)}
                      onMouseEnter={playHover}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                        difficulty === level ? "bg-indigo-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {level}
                    </button>
                  ))}
                </div>
                
                <div className="flex items-center gap-2 bg-zinc-900 p-1 rounded-xl border border-zinc-800">
                  {[5, 10, 20].map((count) => (
                    <button
                      key={count}
                      onClick={() => setGenCount(count)}
                      onMouseEnter={playHover}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                        genCount === count ? "bg-emerald-600 text-white" : "text-zinc-500 hover:text-zinc-300"
                      )}
                    >
                      {count}
                    </button>
                  ))}
                </div>

                <div className="h-8 w-[1px] bg-zinc-800 mx-2 hidden sm:block" />

                <button 
                  id="generate-btn"
                  onClick={handleGenerate}
                  onMouseEnter={playHover}
                  disabled={isGenerating}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                >
                  {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Generate Words
                </button>

                <button 
                  id="generate-sentences-btn"
                  onClick={handleGenerateSentences}
                  onMouseEnter={playHover}
                  disabled={isGenerating}
                  className="px-6 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-purple-600/20"
                >
                  {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  Generate Sentences
                </button>

                <button 
                  id="add-entry-btn"
                  onClick={() => setAddModalOpen(true)}
                  onMouseEnter={playHover}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium transition-all flex items-center gap-2 shadow-lg shadow-emerald-600/20"
                >
                  <Plus className="w-4 h-4" />
                  Add Entry
                </button>
                <button 
                  id="keyboard-toggle"
                  onClick={() => setShowKeyboard(!showKeyboard)}
                  onMouseEnter={playHover}
                  className={cn(
                    "p-2.5 rounded-xl border transition-all",
                    showKeyboard ? "bg-zinc-800 border-indigo-500 text-indigo-400" : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white"
                  )}
                >
                  <Keyboard className="w-5 h-5" />
                </button>
              </div>
              
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input 
                  type="text" 
                  placeholder="Search words..." 
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-sm focus:outline-none focus:border-indigo-500 transition-colors"
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
                />
              ))}
            </div>

            {words.length === 0 && !isGenerating && (
              <div className="text-center py-20 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800">
                <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-4">
                  <RefreshCw className="w-8 h-8 text-zinc-600" />
                </div>
                <h3 className="text-xl font-medium text-zinc-300">No words found for this dialect</h3>
                <p className="text-zinc-500 mt-2">Click the generate button to start building the dataset.</p>
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
              className="relative w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h3 className="text-xl font-bold">Add New Entry</h3>
                <button onClick={() => setAddModalOpen(false)} onMouseEnter={playHover} className="p-2 hover:bg-zinc-800 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Word or Phrase (Ijaw)</label>
                  <input 
                    value={addForm.word}
                    onChange={(e) => setAddForm({ ...addForm, word: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. I am going home"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Meaning (English)</label>
                  <input 
                    value={addForm.meaning}
                    onChange={(e) => setAddForm({ ...addForm, meaning: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500"
                    placeholder="e.g. I am going home"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Pronunciation Guide</label>
                  <input 
                    value={addForm.pronunciation}
                    onChange={(e) => setAddForm({ ...addForm, pronunciation: e.target.value })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 focus:outline-none focus:border-emerald-500"
                    placeholder="Phonetic guide"
                  />
                </div>

                <button 
                  onClick={handleAddSubmit}
                  onMouseEnter={playHover}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition-all mt-4"
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
              className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                <h3 className="text-xl font-bold">Profile Settings</h3>
                <button onClick={() => setSettingsModalOpen(false)} onMouseEnter={playHover} className="p-2 hover:bg-zinc-800 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-8 space-y-8">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <Languages className="w-5 h-5 text-indigo-400" />
                    <h4 className="font-bold text-zinc-300 uppercase tracking-widest text-sm">Preferred Dialect</h4>
                  </div>
                  <p className="text-zinc-500 text-sm">Setting a preferred dialect will automatically filter content and default your selections when you log in.</p>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {IJAW_DIALECTS.map((dialect) => (
                      <button
                        key={dialect}
                        onClick={() => handleUpdatePreferredDialect(dialect)}
                        onMouseEnter={playHover}
                        className={cn(
                          "px-4 py-3 rounded-xl border text-sm font-medium transition-all",
                          profile?.preferredDialect === dialect 
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/20" 
                            : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-600 hover:text-white"
                        )}
                      >
                        {dialect}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-zinc-800">
                  <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-2xl border border-zinc-700">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-zinc-700 rounded-full flex items-center justify-center">
                        <UserIcon className="w-6 h-6 text-zinc-400" />
                      </div>
                      <div>
                        <p className="font-bold text-white">{user.displayName}</p>
                        <p className="text-sm text-zinc-500">{user.email}</p>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-zinc-700 rounded-lg text-[10px] font-bold uppercase tracking-widest text-zinc-400">
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
