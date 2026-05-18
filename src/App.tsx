import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { auth, db, googleProvider, handleFirestoreError, OperationType, logActivity, awardPoints, applyCorrection } from './firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc, updateDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp, Timestamp, getDocsFromServer } from 'firebase/firestore';
import { IJAW_DIALECTS, AGREEMENT_THRESHOLD } from './constants';
import { generateIjawWords, generateIjawSentences, verifyIjawWord, generateEnglishPhrase, generateSpeech, IjawWord, IjawSentence, DifficultyLevel } from './services/geminiService';
import { VirtualKeyboard } from './components/VirtualKeyboard';
import { VoiceRecorder } from './components/VoiceRecorder';
const LandingPage = lazy(() => import('./components/LandingPage').then(m => ({ default: m.LandingPage })));
import { WordCard } from './components/WordCard';
import type { AdminPanelProps } from './components/AdminPanel';

const ChatSection = lazy(() => import('./components/ChatSection').then(m => ({ default: m.ChatSection })));
const ChatHistory = lazy(() => import('./components/ChatHistory').then(m => ({ default: m.ChatHistory })));
const SocialSection = lazy(() => import('./components/SocialSection').then(m => ({ default: m.SocialSection })));
const LeaderboardSection = lazy(() => import('./components/LeaderboardSection').then(m => ({ default: m.LeaderboardSection })));
const GamificationSection = lazy(() => import('./components/GamificationSection').then(m => ({ default: m.GamificationSection })));
const CommunityQueue = lazy(() => import('./components/CommunityQueue').then(m => ({ default: m.CommunityQueue })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));
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
  const [activeTab, setActiveTab] = useState<'dictionary' | 'contribute' | 'community' | 'profile'>('dictionary');
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
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
      action: () => setActiveTab('dictionary')
    },
    {
      targetId: 'generate-btn',
      title: 'Generate AI Words',
      content: 'Click here to let Gemini AI generate initial words and meanings for your chosen dialect.',
      position: 'bottom' as const,
      action: () => setActiveTab('dictionary')
    },
    {
      targetId: 'add-entry-btn',
      title: 'Add Your Own',
      content: 'Have a specific word, phrase, or sentence in mind? Click here to manually add it to the dataset.',
      position: 'bottom' as const,
      action: () => setActiveTab('dictionary')
    },
    {
      targetId: 'correct-btn-step',
      title: 'Verify & Edit',
      content: 'Click here to verify the AI draft. You can correct the spelling, meaning, or pronunciation.',
      position: 'top' as const,
      action: () => setActiveTab('dictionary')
    },
    {
      targetId: 'flag-btn-step',
      title: 'Flag Errors',
      content: 'If a word is completely wrong or offensive, use the flag button to alert the admins.',
      position: 'top' as const,
      action: () => setActiveTab('dictionary')
    },
    {
      targetId: 'chat-tab-btn',
      title: 'Interactive Chat',
      content: 'Try the Contribute section! AI speaks English, and you translate it to Ijaw with text and voice.',
      position: 'bottom' as const
    },
    {
      targetId: 'ai-prompt-card',
      title: 'AI Prompt',
      content: 'In the contribute tab, the AI will give you an English phrase. You can also listen to it being spoken.',
      position: 'right' as const,
      action: () => setActiveTab('contribute')
    },
    {
      targetId: 'user-translation-card',
      title: 'Your Translation',
      content: 'Type your translation and record your pronunciation here.',
      position: 'left' as const,
      action: () => setActiveTab('contribute')
    },
    {
      targetId: 'submit-translation-btn',
      title: 'Submit for Community Review',
      content: 'Once you are happy with your translation, submit it! It will be reviewed by our community.',
      position: 'top' as const,
      action: () => setActiveTab('contribute')
    },
    ...(isAdmin ? [
      {
        targetId: 'export-tab-btn',
        title: 'Admin Export',
        content: 'As an admin, you can export the entire dataset for offline use or training purposes.',
        position: 'bottom' as const,
        action: () => setAdminPanelOpen(true)
      },
      {
        targetId: 'export-full-btn',
        title: 'Full Dataset Export',
        content: 'Download all text data and audio recordings in a single ZIP file, perfectly matched for machine learning.',
        position: 'top' as const,
        action: () => { setAdminPanelOpen(true); setAdminTab('export'); }
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
                newStreak = 1;
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

    const q = query(collection(db, 'words'), ...constraints);

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
  if (!user) return <Suspense fallback={null}><LandingPage onEnter={() => {}} /></Suspense>;

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
              const usernameRef = doc(db, 'usernames', username.toLowerCase());
              const usernameSnap = await getDoc(usernameRef);

              if (usernameSnap.exists()) {
                toast.error("Username already taken!");
                setIsSettingUpProfile(false);
                return;
              }

              await setDoc(usernameRef, { uid: user.uid });

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
      <header className="sticky top-0 z-40 border-b" style={{background: 'rgba(6,10,18,0.95)', backdropFilter: 'blur(20px)', borderColor: 'rgba(201,146,42,0.12)'}}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Brand */}
          <button
            className="flex items-center gap-2.5 shrink-0 group"
            onClick={() => { setActiveTab('dictionary'); setSelectedDialect(null); }}
          >
            <div className="w-8 h-8 bg-amber-700 rounded-lg flex items-center justify-center shadow-lg shadow-amber-700/30 group-hover:bg-amber-600 transition-colors">
              <Languages className="w-4 h-4 text-white" />
            </div>
            <span className="hidden sm:block font-semibold text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif", fontSize: '1.15rem'}}>Izonate</span>
          </button>

          {/* Center nav — desktop only */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/50">
            {([
              { id: 'dictionary', label: 'Dictionary', icon: BookOpen },
              { id: 'contribute', label: 'Contribute', icon: MessageSquare },
              { id: 'community', label: 'Community', icon: UsersIcon },
              { id: 'profile', label: 'Profile', icon: UserIcon },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                onMouseEnter={playHover}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                  activeTab === id
                    ? "bg-amber-700 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/60"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Points display */}
            {profile && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold" style={{background: 'rgba(201,146,42,0.1)', border: '1px solid rgba(201,146,42,0.2)', color: '#d4a836'}}>
                <Star className="w-3 h-3" />
                {profile.points}
              </div>
            )}
            {/* Streak */}
            {profile?.streak && profile.streak.current > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span className="text-xs font-bold text-orange-300">{profile.streak.current}</span>
              </div>
            )}
            {/* Admin panel button */}
            {isAdmin && (
              <button
                onClick={() => setAdminPanelOpen(true)}
                onMouseEnter={playHover}
                className="p-2 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-slate-800/60 transition-all border border-transparent hover:border-slate-700/50"
                title="Admin Panel"
              >
                <ShieldCheck className="w-4 h-4" />
              </button>
            )}
            {/* Settings */}
            <button
              onClick={() => setSettingsModalOpen(true)}
              onMouseEnter={playHover}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-all border border-transparent hover:border-slate-700/50"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-lg bg-amber-700/20 border border-amber-500/30 flex items-center justify-center cursor-pointer hover:border-amber-400/50 transition-colors shrink-0"
              onClick={() => setActiveTab('profile')}
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

        {/* Mobile bottom tab bar */}
        <div className="md:hidden border-t" style={{borderColor: 'rgba(201,146,42,0.1)'}}>
          <div className="flex">
            {([
              { id: 'dictionary', label: 'Dictionary', icon: BookOpen },
              { id: 'contribute', label: 'Contribute', icon: MessageSquare },
              { id: 'community', label: 'Community', icon: UsersIcon },
              { id: 'profile', label: 'Profile', icon: UserIcon },
            ] as const).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-bold uppercase tracking-widest transition-all",
                  activeTab === id ? "text-amber-400" : "text-slate-600 hover:text-slate-400"
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 relative z-10">
        <AnimatePresence mode="wait">
          {activeTab === 'profile' ? (
            <motion.div key="profile" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} className="space-y-8">
              <Suspense fallback={<div className="h-32 bg-slate-900/40 rounded-xl animate-pulse" />}>
                {profile && <GamificationSection profile={profile} />}
                <LeaderboardSection />
                <SocialSection profile={profile} />
                <ChatHistory />
              </Suspense>
            </motion.div>
          ) : activeTab === 'community' ? (
            <motion.div key="community" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}>
              <div className="mb-6">
                <h2 className="text-3xl font-semibold text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif"}}>Community Review</h2>
                <p className="text-slate-500 text-sm mt-1">Vote on corrections and translations submitted by contributors</p>
              </div>
              {selectedDialect ? (
                <Suspense fallback={<div className="h-32 bg-slate-900/40 rounded-xl animate-pulse" />}>
                  <CommunityQueue
                    selectedDialect={selectedDialect}
                    currentUserId={user.uid}
                    isAdmin={isAdmin}
                  />
                </Suspense>
              ) : (
                <div className="py-12">
                  <div className="mb-8 text-center max-w-2xl mx-auto">
                    <h3 className="text-2xl font-semibold text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif"}}>Select a Dialect First</h3>
                    <p className="text-slate-400 mt-2">Choose a dialect to see its community review queue</p>
                  </div>
                  <DialectSelector onSelect={(d) => { setSelectedDialect(d); }} />
                </div>
              )}
            </motion.div>
          ) : activeTab === 'contribute' ? (
            <motion.div key="contribute" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}>
              {selectedDialect ? (
                <Suspense fallback={<div className="h-32 bg-slate-900/40 rounded-xl animate-pulse" />}>
                  <ChatSection
                    dialect={selectedDialect}
                    profile={profile}
                    setProfile={setProfile}
                    checkAchievements={checkAchievements}
                  />
                </Suspense>
              ) : (
                <div className="py-12">
                  <div className="mb-8 text-center max-w-2xl mx-auto">
                    <h3 className="text-2xl font-semibold text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif"}}>Select a Dialect to Contribute</h3>
                    <p className="text-slate-400 mt-2">Choose your dialect to start translating phrases</p>
                  </div>
                  <DialectSelector onSelect={setSelectedDialect} />
                </div>
              )}
            </motion.div>
          ) : (
            /* Dictionary tab */
            <motion.div key="dictionary" initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}}>
              {!selectedDialect ? (
                <div className="py-12">
                  <div className="mb-12 text-center max-w-2xl mx-auto">
                    <h1 className="text-5xl font-semibold mb-4 text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif"}}>Choose a Dialect</h1>
                    <p className="text-slate-400 text-lg font-medium">Select the dialect you know to start curating and verifying words.</p>
                  </div>
                  <DialectSelector onSelect={setSelectedDialect} />
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Controls bar */}
                  <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 p-4 rounded-xl border backdrop-blur-sm" style={{background: 'rgba(15,20,35,0.6)', borderColor: 'rgba(201,146,42,0.12)'}}>
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800/50">
                        {(['pending', 'all'] as const).map((f) => (
                          <button key={f} onClick={() => setCurateFilter(f)} onMouseEnter={playHover}
                            className={cn("px-4 py-2 rounded-lg text-xs font-semibold transition-all capitalize",
                              curateFilter === f ? "bg-amber-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                            )}>
                            {f === 'pending' ? 'To Review' : 'All'}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 bg-slate-950/50 p-1 rounded-xl border border-slate-800/50">
                        {(['easy', 'medium', 'hard'] as DifficultyLevel[]).map((level) => (
                          <button key={level} onClick={() => setDifficulty(level)} onMouseEnter={playHover}
                            className={cn("px-3 py-2 rounded-lg text-xs font-semibold capitalize transition-all",
                              difficulty === level ? "bg-amber-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                            )}>
                            {level}
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 bg-slate-950/50 p-1 rounded-xl border border-slate-800/50">
                        {[5, 10, 20].map((count) => (
                          <button key={count} onClick={() => setGenCount(count)} onMouseEnter={playHover}
                            className={cn("px-3 py-2 rounded-lg text-xs font-semibold transition-all",
                              genCount === count ? "bg-emerald-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
                            )}>
                            {count}
                          </button>
                        ))}
                      </div>
                      <button id="generate-btn" onClick={handleGenerate} onMouseEnter={playHover} disabled={isGenerating}
                        className="px-4 py-2 bg-amber-700 hover:bg-amber-600 disabled:opacity-50 text-white text-sm rounded-xl font-medium transition-all flex items-center gap-2 shadow-sm shadow-amber-700/20">
                        {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        Generate Words
                      </button>
                      <button id="generate-sentences-btn" onClick={handleGenerateSentences} onMouseEnter={playHover} disabled={isGenerating}
                        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm rounded-xl font-medium transition-all flex items-center gap-2">
                        {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                        Sentences
                      </button>
                      <button id="add-entry-btn" onClick={() => setAddModalOpen(true)} onMouseEnter={playHover}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-xl font-medium transition-all flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Add Entry
                      </button>
                      <button onClick={() => setShowKeyboard(!showKeyboard)} onMouseEnter={playHover}
                        className={cn("p-2 rounded-xl border transition-all",
                          showKeyboard ? "bg-slate-800 border-amber-500 text-amber-400" : "bg-slate-900/50 border-slate-700/50 text-slate-400 hover:text-white"
                        )}>
                        <Keyboard className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  {/* Keyboard */}
                  <AnimatePresence>
                    {showKeyboard && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <VirtualKeyboard onInput={() => {}} onBackspace={() => {}} />
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
                          isAdmin={isAdmin}
                          currentUserId={user.uid}
                          pendingCorrection={pendingCorrections.find(c => c.wordId === word.id)}
                          onFlag={() => handleFlag(word.id)}
                          onUnflag={() => handleUnflag(word.id)}
                          onVerify={() => handleVerify(word.id)}
                          onInlineCorrect={async (newWord, meaning, pronunciation, audioUrl) => {
                            if (!user) return;
                            try {
                              if (isAdmin) {
                                const wordRef = doc(db, 'words', word.id);
                                await updateDoc(wordRef, { word: newWord, meaning, pronunciation, status: 'verified' });
                                const updated = await awardPoints(user.uid, 20, true);
                                if (updated) { setProfile(updated); await checkAchievements(updated); }
                                await logActivity('WORD_UPDATED', `Admin updated and verified word ID: ${word.id}`);
                                toast.success("Word updated and verified!");
                              } else {
                                await addDoc(collection(db, 'corrections'), {
                                  wordId: word.id, dialect: word.dialect,
                                  originalWord: word.word, originalMeaning: word.meaning, originalPronunciation: word.pronunciation,
                                  suggestedWord: newWord, suggestedMeaning: meaning, suggestedPronunciation: pronunciation,
                                  reason: 'Inline correction', submittedBy: user.uid,
                                  submittedAt: serverTimestamp(), status: 'pending',
                                  audioUrl: audioUrl || null, agreedBy: []
                                });
                                const updated = await awardPoints(user.uid, 10, true);
                                if (updated) { setProfile(updated); await checkAchievements(updated); }
                                await logActivity('CORRECTION_SUBMITTED', `Submitted correction for word ID: ${word.id}`);
                                toast.success("Correction submitted for community review!");
                              }
                            } catch (error) {
                              toast.error("Failed to submit correction");
                              throw error;
                            }
                          }}
                          onAgree={handleAgreeCorrection}
                        />
                      ))}
                    </div>
                  </AnimatePresence>

                  {words.length === 0 && !isGenerating && (
                    <div className="text-center py-20 rounded-xl border border-dashed" style={{background: 'rgba(15,20,35,0.4)', borderColor: 'rgba(201,146,42,0.15)'}}>
                      <div className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-5 border" style={{background: 'rgba(30,40,60,0.5)', borderColor: 'rgba(201,146,42,0.15)'}}>
                        <BookOpen className="w-8 h-8 text-slate-600" />
                      </div>
                      <h3 className="text-2xl font-semibold text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif"}}>No words yet</h3>
                      <p className="text-slate-500 mt-2 text-sm">Generate AI words or add your own to start curating the {selectedDialect} dialect</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
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

                <div className="pt-4 border-t border-slate-800/50 flex justify-end">
                  <button
                    onClick={() => signOut(auth)}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-lg transition-colors border border-transparent hover:border-red-500/20"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Admin Panel Modal */}
      <AnimatePresence>
        {adminPanelOpen && isAdmin && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={() => setAdminPanelOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div
              initial={{scale:0.95, opacity:0, y:20}} animate={{scale:1, opacity:1, y:0}}
              exit={{scale:0.95, opacity:0, y:20}}
              className="relative w-full max-w-6xl max-h-[90vh] overflow-y-auto bg-[#060a12] border border-amber-900/20 rounded-xl shadow-2xl z-10"
            >
              <div className="sticky top-0 z-10 p-4 border-b border-amber-900/20 flex justify-between items-center" style={{background: 'rgba(6,10,18,0.95)', backdropFilter: 'blur(12px)'}}>
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                  <h2 className="text-xl font-semibold text-[#f0ede4]" style={{fontFamily: "'Cormorant Garamond', serif"}}>Admin Panel</h2>
                </div>
                <button onClick={() => setAdminPanelOpen(false)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-6">
                <Suspense fallback={<div className="h-32 bg-slate-900/40 rounded-xl animate-pulse" />}>
                  <AdminPanel
                    adminTab={adminTab}
                    setAdminTab={setAdminTab}
                    selectedDialect={selectedDialect}
                    onDialectChange={setSelectedDialect}
                  />
                </Suspense>
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
