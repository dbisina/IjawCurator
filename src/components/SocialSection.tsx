import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, UserMinus, Check, X, Search, User, Clock, RefreshCw, Flame, Mic2, Heart, MessageSquare, ChevronDown, Play, CheckCircle2 } from 'lucide-react';
import { db, auth } from '../firebase';
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  getDocs,
  limit,
  orderBy,
  arrayUnion,
  arrayRemove,
  getDoc
} from 'firebase/firestore';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useHoverSound } from '../hooks/useHoverSound';
import { UserProfile } from '../types';

interface FriendRequest {
  id: string;
  fromId: string;
  fromName: string;
  toId: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt: any;
}

interface Friendship {
  id: string;
  users: string[];
  createdAt: any;
}

interface VoiceExercise {
  id: string;
  wordId: string;
  userId: string;
  userEmail?: string;
  audioUrl: string;
  dialect: string;
  submittedAt: any;
  status: 'pending' | 'verified' | 'rejected';
  likes?: string[];
}

interface WordInfo {
  word: string;
  meaning: string;
  dialect: string;
}

interface SocialSectionProps {
  profile: any;
}

export const SocialSection: React.FC<SocialSectionProps> = ({ profile }) => {
  const { playHover } = useHoverSound();
  const [activeTab, setActiveTab] = useState<'friends' | 'recordings'>('friends');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Recordings tab state
  const [recordings, setRecordings] = useState<VoiceExercise[]>([]);
  const [recordingWords, setRecordingWords] = useState<Record<string, WordInfo>>({});
  const [isLoadingRecordings, setIsLoadingRecordings] = useState(false);
  const [correctionFormId, setCorrectionFormId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState('');
  const [correctionPronunciation, setCorrectionPronunciation] = useState('');
  const [isSubmittingCorrection, setIsSubmittingCorrection] = useState(false);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) return;

    const pendingQ = query(
      collection(db, 'friendRequests'),
      where('toId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );
    const unsubPending = onSnapshot(pendingQ, (snap) => {
      setPendingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest)));
    });

    const sentQ = query(
      collection(db, 'friendRequests'),
      where('fromId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );
    const unsubSent = onSnapshot(sentQ, (snap) => {
      setSentRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest)));
    });

    const friendsQ = query(
      collection(db, 'friendships'),
      where('users', 'array-contains', currentUser.uid)
    );
    const unsubFriends = onSnapshot(friendsQ, async (snap) => {
      const friendIds = snap.docs.map(d => {
        const data = d.data() as Friendship;
        return data.users.find(id => id !== currentUser.uid);
      }).filter(Boolean) as string[];

      if (friendIds.length > 0) {
        const usersSnap = await getDocs(query(collection(db, 'users'), where('uid', 'in', friendIds)));
        setFriends(usersSnap.docs.map(d => d.data() as UserProfile));
      } else {
        setFriends([]);
      }
    });

    return () => {
      unsubPending();
      unsubSent();
      unsubFriends();
    };
  }, [currentUser]);

  // Load community recordings when tab is active
  useEffect(() => {
    if (activeTab !== 'recordings') return;

    setIsLoadingRecordings(true);
    const q = query(
      collection(db, 'voiceExercises'),
      orderBy('submittedAt', 'desc'),
      limit(20)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const recs = snap.docs.map(d => ({ id: d.id, ...d.data() } as VoiceExercise));
      setRecordings(recs);
      setIsLoadingRecordings(false);

      // Batch-fetch associated words
      const uniqueWordIds = [...new Set(recs.map(r => r.wordId).filter(Boolean))];
      const wordsMap: Record<string, WordInfo> = {};
      await Promise.all(
        uniqueWordIds.map(async (wordId) => {
          try {
            const wordSnap = await getDoc(doc(db, 'words', wordId));
            if (wordSnap.exists()) {
              const data = wordSnap.data();
              wordsMap[wordId] = {
                word: data.word || wordId,
                meaning: data.meaning || '',
                dialect: data.dialect || '',
              };
            } else {
              wordsMap[wordId] = { word: '[Deleted]', meaning: '', dialect: '' };
            }
          } catch {
            wordsMap[wordId] = { word: '[Unavailable]', meaning: '', dialect: '' };
          }
        })
      );
      setRecordingWords(wordsMap);
    });

    return unsub;
  }, [activeTab]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !currentUser) return;

    setIsSearching(true);
    try {
      const lowerQuery = searchQuery.toLowerCase().trim();

      const [usernameSnap, emailSnap] = await Promise.all([
        getDocs(query(
          collection(db, 'users'),
          where('username_lowercase', '>=', lowerQuery),
          where('username_lowercase', '<=', lowerQuery + '\uf8ff'),
          limit(10)
        )),
        getDocs(query(
          collection(db, 'users'),
          where('email', '==', searchQuery.trim()),
          limit(5)
        )),
      ]);

      const allDocs = [...usernameSnap.docs, ...emailSnap.docs];
      const seen = new Set<string>();
      const results = allDocs
        .filter(d => {
          const uid = d.data().uid;
          if (!uid || seen.has(uid)) return false;
          seen.add(uid);
          return true;
        })
        .map(d => d.data() as UserProfile);

      setSearchResults(results);
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Failed to search users");
    } finally {
      setIsSearching(false);
    }
  };

  const sendFriendRequest = async (targetUser: UserProfile) => {
    if (!currentUser) return;

    if (friends.some(f => f.uid === targetUser.uid)) {
      toast.info("Already friends!");
      return;
    }
    if (sentRequests.some(r => r.toId === targetUser.uid)) {
      toast.info("Request already sent!");
      return;
    }

    try {
      await addDoc(collection(db, 'friendRequests'), {
        fromId: currentUser.uid,
        fromName: profile?.username || currentUser.displayName || 'Anonymous',
        toId: targetUser.uid,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      toast.success(`Friend request sent to ${targetUser.username || targetUser.displayName}`);
    } catch (error) {
      console.error("Request error:", error);
      toast.error("Failed to send request");
    }
  };

  const acceptRequest = async (request: FriendRequest) => {
    if (!currentUser) return;

    try {
      await updateDoc(doc(db, 'friendRequests', request.id), { status: 'accepted' });
      await addDoc(collection(db, 'friendships'), {
        users: [request.fromId, request.toId],
        createdAt: serverTimestamp()
      });
      toast.success("Friend request accepted!");
    } catch (error) {
      console.error("Accept error:", error);
      toast.error("Failed to accept request");
    }
  };

  const declineRequest = async (request: FriendRequest) => {
    try {
      await updateDoc(doc(db, 'friendRequests', request.id), { status: 'declined' });
      toast.info("Friend request declined");
    } catch (error) {
      console.error("Decline error:", error);
    }
  };

  const removeFriend = async (friendId: string) => {
    if (!currentUser) return;

    try {
      const q = query(
        collection(db, 'friendships'),
        where('users', 'array-contains', currentUser.uid)
      );
      const snap = await getDocs(q);
      const friendshipDoc = snap.docs.find(d => {
        const data = d.data() as Friendship;
        return data.users && data.users.includes(friendId);
      });

      if (friendshipDoc) {
        await deleteDoc(doc(db, 'friendships', friendshipDoc.id));
        toast.info("Friend removed");
      }
    } catch (error) {
      console.error("Remove error:", error);
      toast.error("Failed to remove friend");
    }
  };

  const handleLike = async (recording: VoiceExercise) => {
    if (!currentUser) return;
    const ref = doc(db, 'voiceExercises', recording.id);
    const isLiked = recording.likes?.includes(currentUser.uid);
    try {
      await updateDoc(ref, {
        likes: isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid)
      });
    } catch (error) {
      console.error("Like error:", error);
      toast.error("Failed to update like");
    }
  };

  const handleSubmitCorrection = async (recording: VoiceExercise) => {
    if (!currentUser || !correctionText.trim()) {
      toast.error("Please enter a corrected word");
      return;
    }
    setIsSubmittingCorrection(true);
    try {
      const wordInfo = recordingWords[recording.wordId];
      await addDoc(collection(db, 'corrections'), {
        wordId: recording.wordId,
        dialect: recording.dialect,
        originalWord: wordInfo?.word || '',
        originalMeaning: wordInfo?.meaning || '',
        originalPronunciation: '',
        suggestedWord: correctionText.trim(),
        suggestedMeaning: wordInfo?.meaning || '',
        suggestedPronunciation: correctionPronunciation.trim(),
        reason: 'Community recording correction suggestion',
        submittedBy: currentUser.uid,
        submittedAt: serverTimestamp(),
        status: 'pending',
        audioUrl: null,
        agreedBy: []
      });
      toast.success("Correction suggestion submitted!");
      setCorrectionFormId(null);
      setCorrectionText('');
      setCorrectionPronunciation('');
    } catch (error) {
      console.error("Correction submit error:", error);
      toast.error("Failed to submit correction");
    } finally {
      setIsSubmittingCorrection(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-10 py-10">
      <div className="text-center space-y-3">
        <h2 className="text-4xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-indigo-300 to-purple-300">
          Social Hub
        </h2>
        <p className="text-slate-400 text-lg font-medium">Connect with other Ijaw language learners and contributors</p>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800/50 w-fit mx-auto">
        <button
          onClick={() => setActiveTab('friends')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all",
            activeTab === 'friends' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Users className="w-4 h-4" />
          Friends
        </button>
        <button
          onClick={() => setActiveTab('recordings')}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all",
            activeTab === 'recordings' ? "bg-amber-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200"
          )}
        >
          <Mic2 className="w-4 h-4" />
          Community Recordings
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'friends' ? (
          <motion.div
            key="friends"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* Left Column: Search and Pending */}
              <div className="md:col-span-1 space-y-8">
                {/* Search */}
                <section className="bg-slate-900/40 border border-slate-800/50 p-6 rounded-xl flex flex-col gap-5 shadow-lg">
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Search className="w-5 h-5 text-indigo-400" /> Find Friends
                  </h3>
                  <form onSubmit={handleSearch} className="relative">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by username, email, or name..."
                      className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-500 hover:border-slate-700 transition-colors placeholder:text-slate-600"
                    />
                    <button type="submit" className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors">
                      {isSearching ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
                    </button>
                  </form>

                  <div className="space-y-3">
                    {searchResults.map(u => (
                      <div key={u.uid} className="flex items-center justify-between p-3 bg-slate-800/30 rounded-xl border border-slate-800/50 hover:bg-slate-800/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center text-sm font-semibold text-slate-300">
                            {(u?.username || u?.displayName || '?')[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-sm font-semibold text-slate-200">{u.displayName}</span>
                            <span className="text-xs text-slate-500">@{u.username}</span>
                          </div>
                        </div>
                        {u.uid === currentUser?.uid ? (
                          <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-3 py-1.5 rounded-lg border border-indigo-500/20">
                            YOU
                          </span>
                        ) : (
                          <button
                            onClick={() => sendFriendRequest(u)}
                            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shadow-sm shadow-indigo-600/20"
                          >
                            <UserPlus className="w-4 h-4" />
                            <span>Add</span>
                          </button>
                        )}
                      </div>
                    ))}
                    {searchQuery && searchResults.length === 0 && !isSearching && (
                      <p className="text-sm text-slate-500 text-center py-4 bg-slate-900/30 rounded-xl border border-slate-800/50 border-dashed">No users found</p>
                    )}
                  </div>
                </section>

                {/* Pending Requests */}
                <section className="bg-slate-900/40 border border-slate-800/50 p-6 rounded-xl flex flex-col gap-5 shadow-lg">
                  <h3 className="text-sm font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-5 h-5 text-amber-400" /> Pending Requests
                  </h3>
                  <div className="space-y-3">
                    {pendingRequests.map(req => (
                      <div key={req.id} className="flex flex-col gap-3 p-4 bg-indigo-500/5 rounded-xl border border-indigo-500/10">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-indigo-500/20 rounded-full flex items-center justify-center text-sm font-bold text-indigo-400">
                            {(req?.fromName || '?')[0].toUpperCase()}
                          </div>
                          <span className="text-sm font-semibold text-slate-200">{req.fromName}</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => acceptRequest(req)}
                            className="flex-1 flex justify-center items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors shadow-sm shadow-emerald-600/20"
                          >
                            <Check className="w-4 h-4" />
                            <span>Accept</span>
                          </button>
                          <button
                            onClick={() => declineRequest(req)}
                            className="flex-1 flex justify-center items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-red-500 text-slate-300 hover:text-white text-sm font-medium rounded-lg transition-colors border border-slate-700 hover:border-red-500"
                          >
                            <X className="w-4 h-4" />
                            <span>Decline</span>
                          </button>
                        </div>
                      </div>
                    ))}
                    {pendingRequests.length === 0 && (
                      <p className="text-sm text-slate-500 text-center py-6 bg-slate-900/30 rounded-xl border border-slate-800/50 border-dashed">No pending requests</p>
                    )}
                  </div>
                </section>
              </div>

              {/* Right Column: Friends List */}
              <div className="md:col-span-2">
                <section className="bg-slate-900/40 border border-slate-800/50 p-8 rounded-xl flex flex-col gap-6 shadow-lg h-full min-h-[500px]">
                  <div className="flex items-center justify-between pb-4 border-b border-slate-800/50">
                    <h3 className="text-xl font-black tracking-tight text-slate-100 flex items-center gap-3">
                      <Users className="w-6 h-6 text-indigo-400" /> Your Friends
                    </h3>
                    <span className="px-4 py-1.5 bg-slate-800 border border-slate-700/50 rounded-lg text-xs font-semibold text-slate-300">
                      {friends.length} User{friends.length !== 1 && 's'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 auto-rows-max">
                    {friends.map(friend => (
                      <motion.div
                        key={friend.uid}
                        layout
                        className="flex flex-col p-5 bg-slate-950/30 rounded-xl border border-slate-800/50 group hover:border-indigo-500/30 hover:bg-slate-800/30 transition-all gap-4 shadow-sm"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-xl font-bold text-white shadow-lg relative shrink-0">
                            {(friend?.username || friend?.displayName || '?')[0].toUpperCase()}
                            {friend?.streak?.current > 1 && (
                              <div className="absolute -bottom-1 -right-1 bg-slate-900 border border-slate-800 text-orange-400 text-[10px] font-bold px-2 py-0.5 rounded-lg flex items-center gap-1 shadow-lg">
                                <Flame className="w-3 h-3" /> {friend.streak.current}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-200 truncate pr-2">{friend.displayName}</p>
                            <p className="text-xs text-slate-500 flex items-center gap-2 truncate mt-0.5">
                              @{friend.username}
                              <span className="w-1 h-1 bg-slate-700 rounded-full shrink-0" />
                              <span className="text-indigo-400 font-medium shrink-0">{friend.points} pts</span>
                            </p>
                          </div>
                        </div>

                        <div className="pt-4 border-t border-slate-800/50 flex justify-end">
                          <button
                            onClick={() => removeFriend(friend.uid)}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all border border-transparent hover:border-red-500/20"
                            title="Remove Friend"
                          >
                            <UserMinus className="w-4 h-4" />
                            <span>Remove</span>
                          </button>
                        </div>
                      </motion.div>
                    ))}
                    {friends.length === 0 && (
                      <div className="col-span-full py-24 text-center space-y-5">
                        <div className="w-20 h-20 bg-slate-900/50 border border-slate-800/50 rounded-full flex items-center justify-center mx-auto shadow-inner">
                          <User className="w-10 h-10 text-slate-600" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-lg font-medium text-slate-300">No friends to show</p>
                          <p className="text-sm text-slate-500 max-w-sm mx-auto">Search for users and send connection requests to start curating together.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="recordings"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-100 flex items-center gap-3">
                <Mic2 className="w-6 h-6 text-amber-400" />
                Community Voice Recordings
              </h3>
              <span className="text-xs text-slate-500 font-medium">Latest 20 recordings</span>
            </div>

            {isLoadingRecordings ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 text-slate-600 animate-spin" />
              </div>
            ) : recordings.length === 0 ? (
              <div className="text-center py-20 bg-slate-900/30 rounded-xl border border-dashed border-slate-800/50">
                <Mic2 className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-slate-300">No recordings yet</h3>
                <p className="text-slate-500 mt-2">Be the first to submit a voice exercise!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {recordings.map(recording => {
                  const wordInfo = recordingWords[recording.wordId];
                  const isLiked = recording.likes?.includes(currentUser?.uid || '');
                  const isOwn = recording.userId === currentUser?.uid;
                  const isShowingForm = correctionFormId === recording.id;

                  return (
                    <motion.div
                      key={recording.id}
                      layout
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-slate-900/40 border border-slate-800/50 rounded-xl overflow-hidden shadow-sm hover:border-slate-700/70 transition-colors"
                    >
                      {/* Top: Word info */}
                      <div className="p-4 border-b border-slate-800/50 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {wordInfo ? (
                            <>
                              <p className="text-lg font-bold text-slate-100 truncate">{wordInfo.word}</p>
                              {wordInfo.meaning && (
                                <p className="text-sm text-slate-400 truncate mt-0.5">{wordInfo.meaning}</p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm text-slate-500 italic">Loading word info...</p>
                          )}
                          <p className="text-[10px] text-slate-600 mt-1 font-mono">
                            {recording.userId === currentUser?.uid ? 'You' : `User ···${recording.userId.slice(-6)}`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[9px] font-bold uppercase tracking-widest rounded border border-amber-500/20">
                            {recording.dialect}
                          </span>
                          <span className={cn(
                            "px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded border",
                            recording.status === 'verified' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                            recording.status === 'pending' && "bg-slate-800/50 text-slate-500 border-slate-700/50",
                            recording.status === 'rejected' && "bg-red-500/10 text-red-400 border-red-500/20",
                          )}>
                            {recording.status}
                          </span>
                        </div>
                      </div>

                      {/* Middle: Audio player */}
                      <div className="px-4 py-3 bg-slate-950/20">
                        <audio
                          controls
                          src={recording.audioUrl}
                          className="w-full h-8"
                          style={{ colorScheme: 'dark' }}
                          onError={() => console.warn(`Failed to load audio for ${recording.id}`)}
                        />
                      </div>

                      {/* Bottom: Actions */}
                      <div className="px-4 py-3 flex items-center gap-2">
                        <button
                          onClick={() => handleLike(recording)}
                          className={cn(
                            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                            isLiked
                              ? "bg-pink-500/10 text-pink-400 border-pink-500/20"
                              : "bg-slate-800/50 text-slate-400 hover:text-pink-400 hover:bg-pink-500/10 border-slate-700/50 hover:border-pink-500/20"
                          )}
                        >
                          <Heart className={cn("w-3.5 h-3.5", isLiked && "fill-current")} />
                          <span>{recording.likes?.length || 0}</span>
                        </button>

                        {!isOwn && (
                          <button
                            onClick={() => {
                              if (isShowingForm) {
                                setCorrectionFormId(null);
                                setCorrectionText('');
                                setCorrectionPronunciation('');
                              } else {
                                setCorrectionFormId(recording.id);
                                setCorrectionText('');
                                setCorrectionPronunciation('');
                              }
                            }}
                            className={cn(
                              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                              isShowingForm
                                ? "bg-indigo-600/20 text-indigo-300 border-indigo-500/30"
                                : "bg-slate-800/50 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 border-slate-700/50 hover:border-indigo-500/20"
                            )}
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            Suggest Correction
                          </button>
                        )}

                        <div className="ml-auto text-[10px] text-slate-600">
                          {recording.submittedAt?.toDate?.()?.toLocaleDateString?.() || ''}
                        </div>
                      </div>

                      {/* Inline correction form */}
                      <AnimatePresence>
                        {isShowingForm && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-slate-800/50"
                          >
                            <div className="p-4 space-y-3 bg-slate-950/30">
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Suggest a Correction</p>
                              <input
                                type="text"
                                value={correctionText}
                                onChange={(e) => setCorrectionText(e.target.value)}
                                placeholder="Corrected word / phrase..."
                                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600"
                              />
                              <input
                                type="text"
                                value={correctionPronunciation}
                                onChange={(e) => setCorrectionPronunciation(e.target.value)}
                                placeholder="Pronunciation guide (optional)..."
                                className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors placeholder:text-slate-600 font-mono"
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleSubmitCorrection(recording)}
                                  disabled={isSubmittingCorrection || !correctionText.trim()}
                                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-all flex items-center justify-center gap-1.5"
                                >
                                  {isSubmittingCorrection ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                  Submit
                                </button>
                                <button
                                  onClick={() => { setCorrectionFormId(null); setCorrectionText(''); setCorrectionPronunciation(''); }}
                                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs font-medium rounded-lg transition-all border border-slate-700/50"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
