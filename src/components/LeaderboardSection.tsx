import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Medal, Star, Users, Globe, TrendingUp, Award } from 'lucide-react';
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
        // Firestore 'in' query limit is 30, but we'll do our best
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
    <div className="max-w-4xl mx-auto space-y-8 py-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-400 to-orange-400">
          Leaderboard
        </h2>
        <p className="text-zinc-500">Top contributors and language learners in the Ijaw community</p>
      </div>

      <div className="flex justify-center">
        <div className="flex bg-zinc-900 p-1 rounded-2xl border border-zinc-800 shadow-xl">
          <button 
            onClick={() => setActiveTab('global')}
            onMouseEnter={playHover}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              activeTab === 'global' ? "bg-amber-600 text-white shadow-lg shadow-amber-600/20" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Globe className="w-4 h-4" /> Global
          </button>
          <button 
            onClick={() => setActiveTab('friends')}
            onMouseEnter={playHover}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2",
              activeTab === 'friends' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/20" : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            <Users className="w-4 h-4" /> Friends
          </button>
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
        <div className="p-8 space-y-6">
          {/* Top 3 Podium */}
          <div className="grid grid-cols-3 gap-4 items-end pb-8 border-b border-zinc-800">
            {/* 2nd Place */}
            <div className="flex flex-col items-center space-y-3">
              <div className="relative group">
                <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-xl font-bold border-2 border-zinc-700 group-hover:border-zinc-500 transition-all">
                  {(currentLeaderboard[1]?.username || currentLeaderboard[1]?.displayName || '2')[0].toUpperCase()}
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-zinc-400 rounded-full flex items-center justify-center text-[10px] font-bold text-black border-2 border-zinc-900">
                  2
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-zinc-300 truncate w-24">{currentLeaderboard[1]?.username || currentLeaderboard[1]?.displayName || '---'}</p>
                <p className="text-[10px] text-indigo-400 font-medium uppercase tracking-tighter">{currentLeaderboard[1]?.preferredDialect}</p>
                <p className="text-xs text-zinc-500">{currentLeaderboard[1]?.points || 0} pts</p>
              </div>
            </div>

            {/* 1st Place */}
            <div className="flex flex-col items-center space-y-4 pb-4">
              <div className="relative group">
                <div className="w-24 h-24 bg-gradient-to-br from-amber-400 to-orange-500 rounded-3xl flex items-center justify-center text-3xl font-bold text-white shadow-2xl shadow-amber-500/20 border-4 border-amber-300/30 group-hover:scale-105 transition-all">
                  {(currentLeaderboard[0]?.username || currentLeaderboard[0]?.displayName || '1')[0].toUpperCase()}
                </div>
                <div className="absolute -top-3 -right-3 w-10 h-10 bg-amber-400 rounded-full flex items-center justify-center text-lg font-bold text-black border-4 border-zinc-900 shadow-xl">
                  <Trophy className="w-5 h-5" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-white truncate w-32">{currentLeaderboard[0]?.username || currentLeaderboard[0]?.displayName || '---'}</p>
                <p className="text-xs text-amber-400 font-bold uppercase tracking-widest mb-1">{currentLeaderboard[0]?.preferredDialect}</p>
                <div className="flex items-center justify-center gap-1 text-amber-400">
                  <Star className="w-3 h-3 fill-current" />
                  <p className="text-sm font-bold">{currentLeaderboard[0]?.points || 0} pts</p>
                </div>
              </div>
            </div>

            {/* 3rd Place */}
            <div className="flex flex-col items-center space-y-3">
              <div className="relative group">
                <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center text-xl font-bold border-2 border-zinc-700 group-hover:border-zinc-500 transition-all">
                  {(currentLeaderboard[2]?.username || currentLeaderboard[2]?.displayName || '3')[0].toUpperCase()}
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-orange-700 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-zinc-900">
                  3
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-bold text-zinc-300 truncate w-24">{currentLeaderboard[2]?.username || currentLeaderboard[2]?.displayName || '---'}</p>
                <p className="text-[10px] text-indigo-400 font-medium uppercase tracking-tighter">{currentLeaderboard[2]?.preferredDialect}</p>
                <p className="text-xs text-zinc-500">{currentLeaderboard[2]?.points || 0} pts</p>
              </div>
            </div>
          </div>

          {/* List View */}
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {currentLeaderboard.slice(3).map((user, idx) => (
              <motion.div 
                key={user.uid}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "flex items-center justify-between p-4 rounded-2xl border transition-all group",
                  user.uid === currentUser?.uid ? "bg-indigo-500/10 border-indigo-500/30" : "bg-zinc-800/20 border-zinc-800 hover:border-zinc-700"
                )}
              >
                <div className="flex items-center gap-4">
                  <span className="w-6 text-center text-xs font-bold text-zinc-600 group-hover:text-zinc-400">
                    {idx + 4}
                  </span>
                  <div className="w-10 h-10 bg-zinc-800 rounded-xl flex items-center justify-center text-sm font-bold text-zinc-400 border border-zinc-700">
                    {(user?.username || user?.displayName || '?')[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-bold text-zinc-200 flex items-center gap-2">
                      {user.username || user.displayName}
                      {user.uid === currentUser?.uid && <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">You</span>}
                      {user.streak?.current && user.streak.current > 1 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-orange-500 font-bold">
                          <TrendingUp className="w-3 h-3" /> {user.streak.current}
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-zinc-500 uppercase tracking-widest">{user.contributions} contributions • {user.preferredDialect}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-zinc-100">{user.points}</p>
                  <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">Points</p>
                </div>
              </motion.div>
            ))}
            {currentLeaderboard.length <= 3 && (
              <div className="py-12 text-center text-zinc-600 italic">
                No other users on the leaderboard yet.
              </div>
            )}
          </div>
        </div>

        {/* User's Stats Summary */}
        <div className="bg-zinc-800/50 p-6 flex items-center justify-around border-t border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500/10 rounded-2xl">
              <TrendingUp className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Your Points</p>
              <p className="text-xl font-black text-white">
                {globalLeaderboard.find(u => u.uid === currentUser?.uid)?.points || 0}
              </p>
            </div>
          </div>
          <div className="h-10 w-[1px] bg-zinc-700" />
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-500/10 rounded-2xl">
              <Award className="w-6 h-6 text-indigo-500" />
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Your Rank</p>
              <p className="text-xl font-black text-white">
                #{globalLeaderboard.findIndex(u => u.uid === currentUser?.uid) + 1 || '---'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
