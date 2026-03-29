import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, UserPlus, UserMinus, Check, X, Search, User, Clock, RefreshCw, Flame, TrendingUp } from 'lucide-react';
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
  or,
  and
} from 'firebase/firestore';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useHoverSound } from '../hooks/useHoverSound';
import { UserProfile } from '../types';

// (Types moved to types.ts)

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

interface SocialSectionProps {
  profile: any; // Using any for simplicity here, but ideally UserProfile
}

export const SocialSection: React.FC<SocialSectionProps> = ({ profile }) => {
  const { playHover } = useHoverSound();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserProfile[]>([]);
  const [friends, setFriends] = useState<UserProfile[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [sentRequests, setSentRequests] = useState<FriendRequest[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) return;

    // Listen for incoming friend requests
    const pendingQ = query(
      collection(db, 'friendRequests'),
      where('toId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );
    const unsubPending = onSnapshot(pendingQ, (snap) => {
      setPendingRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest)));
    });

    // Listen for sent friend requests
    const sentQ = query(
      collection(db, 'friendRequests'),
      where('fromId', '==', currentUser.uid),
      where('status', '==', 'pending')
    );
    const unsubSent = onSnapshot(sentQ, (snap) => {
      setSentRequests(snap.docs.map(d => ({ id: d.id, ...d.data() } as FriendRequest)));
    });

    // Listen for friendships
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

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !currentUser) return;

    setIsSearching(true);
    try {
      const lowerQuery = searchQuery.toLowerCase();
      // Search by unique username_lowercase
      const q = query(
        collection(db, 'users'),
        where('username_lowercase', '>=', lowerQuery),
        where('username_lowercase', '<=', lowerQuery + '\uf8ff'),
        limit(10)
      );
      const snap = await getDocs(q);
      setSearchResults(snap.docs.map(d => d.data() as UserProfile));
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Failed to search users");
    } finally {
      setIsSearching(false);
    }
  };

  const sendFriendRequest = async (targetUser: UserProfile) => {
    if (!currentUser) return;

    // Check if already friends or already sent
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
      // Update request status
      await updateDoc(doc(db, 'friendRequests', request.id), {
        status: 'accepted'
      });

      // Create friendship
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
      await updateDoc(doc(db, 'friendRequests', request.id), {
        status: 'declined'
      });
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

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
          Social Hub
        </h2>
        <p className="text-zinc-500">Connect with other Ijaw language learners and contributors</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left Column: Search & Pending */}
        <div className="md:col-span-1 space-y-8">
          {/* Search */}
          <section className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl space-y-4">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Search className="w-4 h-4" /> Find Friends
            </h3>
            <form onSubmit={handleSearch} className="relative">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by username..."
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white">
                {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              </button>
            </form>

            <div className="space-y-2">
              {searchResults.map(u => (
                <div key={u.uid} className="flex items-center justify-between p-2 bg-zinc-800/30 rounded-xl border border-zinc-800">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-zinc-700 rounded-full flex items-center justify-center text-xs font-bold">
                      {(u?.username || u?.displayName || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-zinc-300">{u.displayName}</span>
                      <span className="text-[10px] text-zinc-500">@{u.username}</span>
                    </div>
                  </div>
                  {u.uid === currentUser?.uid ? (
                    <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-lg">
                      YOU
                    </span>
                  ) : (
                    <button 
                      onClick={() => sendFriendRequest(u)}
                      className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors"
                    >
                      <UserPlus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              {searchQuery && searchResults.length === 0 && !isSearching && (
                <p className="text-xs text-zinc-600 text-center py-2">No users found</p>
              )}
            </div>
          </section>

          {/* Pending Requests */}
          <section className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl space-y-4">
            <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-4 h-4" /> Pending Requests
            </h3>
            <div className="space-y-3">
              {pendingRequests.map(req => (
                <div key={req.id} className="flex items-center justify-between p-3 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-500/20 rounded-full flex items-center justify-center text-xs font-bold text-indigo-400">
                      {(req?.fromName || '?')[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-zinc-300">{req.fromName}</span>
                  </div>
                  <div className="flex gap-1">
                    <button 
                      onClick={() => acceptRequest(req)}
                      className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => declineRequest(req)}
                      className="p-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {pendingRequests.length === 0 && (
                <p className="text-xs text-zinc-600 text-center py-4 italic">No pending requests</p>
              )}
            </div>
          </section>
        </div>

        {/* Right Column: Friends List */}
        <div className="md:col-span-2">
          <section className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-[2rem] space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-zinc-200 flex items-center gap-3">
                <Users className="w-6 h-6 text-indigo-400" /> Your Friends
              </h3>
              <span className="px-3 py-1 bg-zinc-800 rounded-full text-xs font-bold text-zinc-500">
                {friends.length} Total
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {friends.map(friend => (
                <motion.div 
                  key={friend.uid}
                  layout
                  className="flex items-center justify-between p-4 bg-zinc-800/20 rounded-2xl border border-zinc-800 group hover:border-zinc-700 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center text-lg font-bold text-white shadow-lg relative">
                      {(friend?.username || friend?.displayName || '?')[0].toUpperCase()}
                      {friend?.streak?.current > 1 && (
                        <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shadow-lg">
                          <Flame className="w-2.5 h-2.5" /> {friend.streak.current}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="font-bold text-zinc-200">{friend.displayName}</p>
                      <p className="text-xs text-zinc-500 flex items-center gap-2">
                        @{friend.username}
                        <span className="w-1 h-1 bg-zinc-700 rounded-full" />
                        <span className="text-indigo-400 font-medium">{friend.points} pts</span>
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => removeFriend(friend.uid)}
                    className="p-2 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                    title="Remove Friend"
                  >
                    <UserMinus className="w-5 h-5" />
                  </button>
                </motion.div>
              ))}
              {friends.length === 0 && (
                <div className="col-span-full py-20 text-center space-y-4">
                  <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto">
                    <User className="w-8 h-8 text-zinc-800" />
                  </div>
                  <p className="text-zinc-500">You haven't added any friends yet.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
