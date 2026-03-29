import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, CheckCircle2, AlertTriangle, Clock, Volume2, Languages, Filter, ArrowUpDown, Search, X } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { cn } from '../lib/utils';
import { useHoverSound } from '../hooks/useHoverSound';
import { IJAW_DIALECTS } from '../constants';

interface ChatSession {
  id: string;
  englishPhrase: string;
  ijawTranslation: string;
  audioUrl: string;
  dialect: string;
  status: 'pending' | 'verified' | 'flagged';
  createdAt: any;
}

export const ChatHistory: React.FC = () => {
  const { playHover } = useHoverSound();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filtering & Sorting State
  const [dialectFilter, setDialectFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'dialect'>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;

    // We fetch all user sessions and filter/sort client-side for better responsiveness 
    // and to avoid complex Firestore composite index requirements for this prototype.
    const q = query(
      collection(db, 'chatSessions'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ChatSession));
      setSessions(list);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const filteredAndSortedSessions = useMemo(() => {
    return sessions
      .filter(s => {
        const matchesDialect = dialectFilter === 'all' || s.dialect === dialectFilter;
        const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
        const matchesSearch = searchQuery === '' || 
          (s.englishPhrase?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
          (s.ijawTranslation?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
        return matchesDialect && matchesStatus && matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'newest') {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeB - timeA;
        }
        if (sortBy === 'oldest') {
          const timeA = a.createdAt?.toMillis?.() || 0;
          const timeB = b.createdAt?.toMillis?.() || 0;
          return timeA - timeB;
        }
        if (sortBy === 'dialect') {
          return (a.dialect || '').localeCompare(b.dialect || '');
        }
        return 0;
      });
  }, [sessions, dialectFilter, statusFilter, sortBy, searchQuery]);

  const clearFilters = () => {
    setDialectFilter('all');
    setStatusFilter('all');
    setSearchQuery('');
    setSortBy('newest');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="text-center py-20 space-y-4">
        <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto">
          <History className="w-8 h-8 text-zinc-700" />
        </div>
        <h3 className="text-xl font-bold text-zinc-400">No translation history yet</h3>
        <p className="text-zinc-500 max-w-md mx-auto">
          Start translating English phrases in the Chat section to build your history!
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400">
          Translation History
        </h2>
        <p className="text-zinc-500">Review your past translations and their verification status</p>
      </div>

      {/* Controls Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search phrases or translations..."
              className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-indigo-500 transition-all text-zinc-200"
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              onMouseEnter={playHover}
              className={cn(
                "px-4 py-3 rounded-2xl border transition-all flex items-center gap-2 font-bold text-sm",
                showFilters || dialectFilter !== 'all' || statusFilter !== 'all' 
                  ? "bg-indigo-600 border-indigo-500 text-white" 
                  : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              )}
            >
              <Filter className="w-4 h-4" />
              Filters
              {(dialectFilter !== 'all' || statusFilter !== 'all') && (
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              )}
            </button>
            <div className="relative group">
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                onMouseEnter={playHover}
                className="appearance-none px-4 py-3 bg-zinc-900/50 border border-zinc-800 rounded-2xl text-zinc-400 text-sm font-bold hover:border-zinc-700 transition-all focus:outline-none pr-10 cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="dialect">By Dialect</option>
              </select>
              <ArrowUpDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
            </div>
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-zinc-900/30 border border-zinc-800/50 rounded-3xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Dialect</label>
                  <select 
                    value={dialectFilter}
                    onChange={(e) => setDialectFilter(e.target.value)}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all">All Dialects</option>
                    {IJAW_DIALECTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Status</label>
                  <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                  >
                    <option value="all">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="verified">Verified</option>
                    <option value="flagged">Flagged</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button 
                    onClick={clearFilters}
                    onMouseEnter={playHover}
                    className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <X className="w-3 h-3" />
                    Clear All Filters
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredAndSortedSessions.length > 0 ? (
          filteredAndSortedSessions.map((session) => (
            <motion.div
              key={session.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onMouseEnter={playHover}
              className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-3xl hover:border-zinc-700 transition-all group"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-4 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-indigo-500/10 rounded-lg flex items-center justify-center">
                      <Languages className="w-4 h-4 text-indigo-400" />
                    </div>
                    <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">{session.dialect} Dialect</span>
                    <div className="h-1 w-1 bg-zinc-700 rounded-full" />
                    <span className="text-xs text-zinc-500">
                      {session.createdAt?.toDate?.() 
                        ? session.createdAt.toDate().toLocaleDateString() 
                        : 'Just now'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">English</p>
                      <p className="text-lg text-zinc-300 font-medium">"{session.englishPhrase}"</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Ijaw Translation</p>
                      <p className="text-lg text-emerald-400 font-medium">{session.ijawTranslation}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 border-t md:border-t-0 md:border-l border-zinc-800 pt-4 md:pt-0 md:pl-6">
                  <div className="flex flex-col items-center md:items-end gap-2">
                    <div className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-2",
                      session.status === 'verified' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                      session.status === 'flagged' ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                      "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    )}>
                      {session.status === 'verified' ? <CheckCircle2 className="w-3 h-3" /> :
                       session.status === 'flagged' ? <AlertTriangle className="w-3 h-3" /> :
                       <Clock className="w-3 h-3" />}
                      {session.status}
                    </div>
                    
                    {session.audioUrl && (
                      <button 
                        onClick={() => new Audio(session.audioUrl).play()}
                        className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-all"
                        title="Play Recording"
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-20 bg-zinc-900/20 border border-dashed border-zinc-800 rounded-3xl">
            <p className="text-zinc-500">No translations match your filters.</p>
            <button 
              onClick={clearFilters}
              className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm font-bold"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
