import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Medal, Star, Users, Globe, TrendingUp, Award, Sparkles } from 'lucide-react';
import { db, auth } from '../firebase';
import { 
  collection, 
  query, 
  orderBy, 
  limit, 
  onSnapshot,
  where,
  getDocs
} from 'firebase/firestore';
import { cn } from '../lib/utils';
import { useHoverSound } from '../hooks/useHoverSound';

interface LeaderboardUser {
  uid: string;
  displayName: string;
  username?: string;
  preferredDialect?: string;
  photoURL?: string;
  points: number;
  contributions: number;
  streak?: {
    current: number;
    longest: number;
    lastActiveDate: string;
  };
}

export const LeaderboardSection: React.FC = () => {
  const { playHover } = useHoverSound();
  const [globalLeaderboard, setGlobalLeaderboard] = useState<LeaderboardUser[]>([]);
  const [friendsLeaderboard, setFriendsLeaderboard] = useState<LeaderboardUser[]>([]);
  const [activeTab, setActiveTab] = useState<'global' | 'friends'>('global');
  const [loading, setLoading] = useState(true);

  const currentUser = auth.currentUser;

  useEffect(() => {
    // Global Leaderboard
    const globalQ = query(
      collection(db, 'users'),
      orderBy('points', 'desc'),
      limit(20)
    );

    const unsubGlobal = onSnapshot(globalQ, (snap) => {
      setGlobalLeaderboard(snap.docs.map(d => ({ 
        uid: d.id, 
        ...d.data(),
        points: d.data().points || 0,
        contributions: d.data().contributions || 0
      } as LeaderboardUser)));
      setLoading(false);
    });

    return () => unsubGlobal();
  }, []);

  useEffect(() => {
    if (!currentUser || activeTab !== 'friends') return;

    // Friends Leaderboard
    const fetchFriendsLeaderboard = async () => {
      const friendsQ = query(
        collection(db, 'friendships'),
        where('users', 'array-contains', currentUser.uid)
      );
      const snap = await getDocs(friendsQ);
      const friendIds = snap.docs.map(d => {
        const data = d.data();
        return data.users.find((id: string) => id !== currentUser.uid);
      }).filter(Boolean) as string[];

      // Include current user in friends leaderboard
      friendIds.push(currentUser.uid);

      if (friendIds.length > 0) {
        const usersQ = query(
          collection(db, 'users'),
          where('uid', 'in', friendIds.slice(0, 30)),
          orderBy('points', 'desc')
        );
        const usersSnap = await getDocs(usersQ);
        setFriendsLeaderboard(usersSnap.docs.map(d => ({ 
          uid: d.id, 
          ...d.data(),
          points: d.data().points || 0,
          contributions: d.data().contributions || 0
        } as LeaderboardUser)));
      }
    };

    fetchFriendsLeaderboard();
  }, [currentUser, activeTab]);

  const currentLeaderboard = activeTab === 'global' ? globalLeaderboard : friendsLeaderboard;

  return (
    <div className="max-w-4xl mx-auto space-y-12 py-10 px-4">
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full mb-2">
          <Trophy className="w-3 h-3 text-amber-500" />
          <span className="text-[10px] font-black text-amber-500 uppercase tracking-[0.2em]">Community Hall of Fame</span>
        </div>
        <h2 className="text-5xl heading-serif text-white tracking-tight">
          Contributors <span className="text-amber-500">& Learners</span>
        </h2>
        <p className="text-slate-400 font-medium max-w-xl mx-auto">Celebrating the top curators helping preserve the Ijaw language across all 16+ dialects.</p>
      </div>

      <div className="flex justify-center">
        <div className="flex bg-slate-950/60 p-1.5 rounded-2xl border border-white/5 shadow-2xl backdrop-blur-xl">
          <button 
            onClick={() => setActiveTab('global')}
            onMouseEnter={playHover}
            className={cn(
              "px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2.5",
              activeTab === 'global' 
                ? "bg-amber-600 text-white shadow-xl shadow-amber-600/20 border border-amber-400/20" 
                : "text-slate-500 hover:text-slate-200"
            )}
          >
            <Globe className="w-4 h-4" /> Global
          </button>
          <button 
            onClick={() => setActiveTab('friends')}
            onMouseEnter={playHover}
            className={cn(
              "px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2.5",
              activeTab === 'friends' 
                ? "bg-amber-600 text-white shadow-xl shadow-amber-600/20 border border-amber-400/20" 
                : "text-slate-500 hover:text-slate-200"
            )}
          >
            <Users className="w-4 h-4" /> Friends
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-[2.5rem] overflow-hidden relative">
        <div className="p-10 space-y-12">
          {/* Top 3 Podium */}
          <div className="grid grid-cols-3 gap-6 md:gap-12 items-end pb-12 border-b border-white/5">
            {/* 2nd Place - Silver */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative group">
                <div className="w-20 h-20 bg-gradient-to-br from-slate-300 via-slate-400 to-slate-600 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-2xl shadow-slate-900/40 border-2 border-white/20 group-hover:scale-105 transition-all">
                  {(currentLeaderboard[1]?.username || currentLeaderboard[1]?.displayName || '2')[0].toUpperCase()}
                </div>
                <div className="absolute -top-3 -right-3 w-8 h-8 bg-slate-400 rounded-full flex items-center justify-center text-xs font-black text-slate-950 border-4 border-slate-900 shadow-lg">
                  2
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-base heading-serif font-bold text-slate-200 truncate w-32">{currentLeaderboard[1]?.username || currentLeaderboard[1]?.displayName || '---'}</p>
                <div className="flex items-center justify-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-full border border-white/10">
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{currentLeaderboard[1]?.points || 0} PTS</p>
                </div>
              </div>
            </div>

            {/* 1st Place - Gold */}
            <div className="flex flex-col items-center space-y-6 pb-6">
              <div className="relative group">
                <div className="w-32 h-32 bg-gradient-to-br from-amber-300 via-amber-500 to-orange-600 rounded-3xl flex items-center justify-center text-5xl font-black text-white shadow-[0_20px_50px_rgba(201,146,42,0.3)] border-2 border-amber-300/40 group-hover:scale-110 transition-all duration-500 overflow-hidden">
                  <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
                  {(currentLeaderboard[0]?.username || currentLeaderboard[0]?.displayName || '1')[0].toUpperCase()}
                </div>
                <div className="absolute -top-4 -right-4 w-12 h-12 bg-amber-400 rounded-full flex items-center justify-center text-lg font-bold text-slate-950 border-4 border-slate-900 shadow-2xl">
                  <Trophy className="w-6 h-6 fill-slate-900" />
                </div>
                <div className="absolute -bottom-2 scale-x-150 blur-xl w-full h-4 bg-amber-500/20" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-2xl heading-serif font-black text-white tracking-tight">{currentLeaderboard[0]?.username || currentLeaderboard[0]?.displayName || '---'}</p>
                <div className="flex items-center justify-center gap-2 text-amber-300 px-4 py-1.5 bg-amber-500/10 rounded-full border border-amber-500/30 shadow-lg shadow-amber-500/5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <p className="text-base font-black tracking-tighter">{currentLeaderboard[0]?.points?.toLocaleString() || 0} POINTS</p>
                </div>
              </div>
            </div>

            {/* 3rd Place - Bronze */}
            <div className="flex flex-col items-center space-y-4">
              <div className="relative group">
                <div className="w-20 h-20 bg-gradient-to-br from-orange-700 via-orange-800 to-orange-950 rounded-2xl flex items-center justify-center text-2xl font-black text-white shadow-2xl shadow-orange-900/40 border-2 border-white/10 group-hover:scale-105 transition-all">
                  {(currentLeaderboard[2]?.username || currentLeaderboard[2]?.displayName || '3')[0].toUpperCase()}
                </div>
                <div className="absolute -top-3 -right-3 w-8 h-8 bg-orange-700 rounded-full flex items-center justify-center text-xs font-black text-white border-4 border-slate-900 shadow-lg">
                  3
                </div>
              </div>
              <div className="text-center space-y-1">
                <p className="text-base heading-serif font-bold text-slate-200 truncate w-32">{currentLeaderboard[2]?.username || currentLeaderboard[2]?.displayName || '---'}</p>
                <div className="flex items-center justify-center gap-1.5 px-2.5 py-1 bg-white/5 rounded-full border border-white/10">
                   <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{currentLeaderboard[2]?.points || 0} PTS</p>
                </div>
              </div>
            </div>
          </div>

          {/* List View */}
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-4 custom-scrollbar py-2">
            {currentLeaderboard.slice(3).map((user, idx) => (
              <motion.div 
                key={user.uid}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "flex items-center justify-between p-5 rounded-2xl border transition-all group",
                  user.uid === currentUser?.uid 
                    ? "bg-amber-500/10 border-amber-500/30 shadow-lg shadow-amber-500/5 backdrop-blur-md" 
                    : "bg-white/2 border-white/5 hover:border-white/15 hover:bg-white/5"
                )}
              >
                <div className="flex items-center gap-6">
                  <span className="w-6 text-center text-[11px] font-black text-slate-500 group-hover:text-amber-500 transition-colors">
                    {idx + 4}
                  </span>
                  <div className="w-12 h-12 bg-slate-900 rounded-xl flex items-center justify-center text-lg font-black text-slate-400 border border-white/5 shadow-inner group-hover:border-amber-500/30 transition-all overflow-hidden relative">
                    {(user?.username || user?.displayName || '?')[0].toUpperCase()}
                    <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div>
                    <p className="heading-serif text-lg font-bold text-white flex items-center gap-2.5 tracking-tight group-hover:text-amber-200 transition-colors">
                      {user.username || user.displayName}
                      {user.uid === currentUser?.uid && (
                        <span className="text-[9px] bg-amber-500 font-black text-slate-950 px-2 py-0.5 rounded-full uppercase tracking-widest shadow-lg shadow-amber-500/20">
                          YOU
                        </span>
                      )}
                      {user.streak?.current && user.streak.current > 1 && (
                        <span className="flex items-center gap-1 text-[11px] text-orange-400 font-black">
                          <TrendingUp className="w-3.5 h-3.5" /> {user.streak.current}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-[0.1em]">{user.contributions} contributions • {user.preferredDialect || 'Unknown Dialect'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-white tracking-tighter group-hover:text-amber-400 transition-colors">{user.points?.toLocaleString()}</p>
                  <p className="text-[9px] text-slate-600 font-black uppercase tracking-[0.2em]">Points</p>
                </div>
              </motion.div>
            ))}
            {currentLeaderboard.length <= 3 && (
              <div className="py-24 text-center mt-4">
                <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/5 opacity-50">
                  <Star className="w-8 h-8 text-slate-600" />
                </div>
                <p className="text-slate-500 italic text-base">New legends are yet to emerge.</p>
              </div>
            )}
          </div>
        </div>

        {/* User's Context Footer */}
        <div className="bg-amber-500/[0.03] p-8 flex flex-col sm:flex-row items-center justify-around gap-8 border-t border-white/5 backdrop-blur-2xl">
          <div className="flex items-center gap-5">
            <div className="p-4 bg-amber-500/10 rounded-2xl border border-amber-500/20 shadow-2xl shadow-amber-900/10">
              <Star className="w-8 h-8 text-amber-500 fill-amber-500/10" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 uppercase font-black tracking-[0.2em] mb-1">Lifetime Score</p>
              <div className="flex items-baseline gap-1.5">
                <p className="text-3xl font-black text-white tracking-tighter">
                  {globalLeaderboard.find(u => u.uid === currentUser?.uid)?.points?.toLocaleString() || 0}
                </p>
                <span className="text-amber-500 text-xs font-bold font-serif italic">Curator Pts</span>
              </div>
            </div>
          </div>
          <div className="h-12 w-[1px] bg-white/5 hidden sm:block" />
          <div className="flex items-center gap-5">
            <div className="p-4 bg-slate-800/20 rounded-2xl border border-white/5 shadow-2xl">
              <Award className="w-8 h-8 text-slate-400" />
            </div>
            <div>
              <p className="text-[11px] text-slate-500 uppercase font-black tracking-[0.2em] mb-1">Global Standing</p>
              <div className="flex items-baseline gap-1.5">
                <p className="text-3xl font-black text-white tracking-tighter">
                  #{globalLeaderboard.findIndex(u => u.uid === currentUser?.uid) + 1 || '---'}
                </p>
                <span className="text-slate-500 text-xs font-bold font-serif italic">Overall Rank</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
