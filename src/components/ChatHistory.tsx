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
      <div className="text-center py-20 space-y-6 bg-slate-900/20 border border-slate-800/50 rounded-xl backdrop-blur-sm">
        <div className="w-16 h-16 bg-slate-900 rounded-xl flex items-center justify-center mx-auto border border-slate-800 shadow-inner">
          <History className="w-8 h-8 text-slate-700" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-black text-slate-100 tracking-tight">No translation history yet</h3>
          <p className="text-slate-500 max-w-md mx-auto text-sm font-medium">
            Start translating English phrases in the Chat section to build your history!
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 py-8">
      <div className="text-center space-y-3">
        <h2 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 via-indigo-300 to-purple-400 tracking-tight">
          Translation History
        </h2>
        <p className="text-slate-500 font-medium">Review your past translations and their verification status</p>
      </div>

      {/* Controls Section */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <input 
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search phrases or translations..."
              className="w-full bg-slate-900/40 border border-slate-800/50 rounded-xl pl-12 pr-4 py-3.5 focus:outline-none focus:border-indigo-500/50 focus:ring-4 focus:ring-indigo-500/5 transition-all text-slate-100 placeholder:text-slate-600 backdrop-blur-md"
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => setShowFilters(!showFilters)}
              onMouseEnter={playHover}
              className={cn(
                "px-5 py-3 rounded-xl border transition-all flex items-center gap-2 font-black text-[10px] uppercase tracking-widest",
                showFilters || dialectFilter !== 'all' || statusFilter !== 'all' 
                  ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20" 
                  : "bg-slate-900/40 border-slate-800/50 text-slate-400 hover:border-slate-700 hover:text-slate-100 backdrop-blur-md"
              )}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
              {(dialectFilter !== 'all' || statusFilter !== 'all') && (
                <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
              )}
            </button>
            <div className="relative group">
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                onMouseEnter={playHover}
                className="appearance-none px-5 py-3 bg-slate-900/40 border border-slate-800/50 rounded-xl text-slate-400 text-[10px] font-black uppercase tracking-widest hover:border-slate-700 hover:text-slate-100 transition-all focus:outline-none pr-12 cursor-pointer backdrop-blur-md"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
                <option value="dialect">By Dialect</option>
              </select>
              <ArrowUpDown className="absolute right-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none group-hover:text-slate-400 transition-colors" />
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
              <div className="bg-slate-900/60 border border-slate-800/50 rounded-xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 backdrop-blur-md shadow-xl">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Dialect</label>
                  <select 
                    value={dialectFilter}
                    onChange={(e) => setDialectFilter(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
                  >
                    <option value="all">All Dialects</option>
                    {IJAW_DIALECTS.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">Status</label>
                  <select 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="w-full bg-slate-950/50 border border-slate-800 rounded-xl px-4 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-indigo-500/50 transition-all cursor-pointer"
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
                    className="w-full py-2.5 bg-slate-800 hover:bg-red-900/20 text-slate-400 hover:text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 border border-slate-700/50 group"
                  >
                    <X className="w-3 h-3 group-hover:rotate-90 transition-transform" />
                    Clear Filters
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
              className="bg-slate-900/40 border border-slate-800/50 p-7 rounded-xl hover:border-indigo-500/30 transition-all group backdrop-blur-sm relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl rounded-full -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-colors" />
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
                <div className="space-y-5 flex-1">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-indigo-500/10 rounded-xl flex items-center justify-center border border-indigo-500/20 shadow-inner">
                      <Languages className="w-4.5 h-4.5 text-indigo-400" />
                    </div>
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{session.dialect} Dialect</span>
                    <div className="h-1 w-1 bg-slate-700 rounded-full" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      {session.createdAt?.toDate?.() 
                        ? session.createdAt.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) 
                        : 'Just now'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">English Phrase</p>
                      <p className="text-xl text-slate-200 font-medium tracking-tight">"{session.englishPhrase}"</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">Ijaw Translation</p>
                      <p className="text-xl text-emerald-400 font-black tracking-tight">{session.ijawTranslation}</p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-slate-800/50 pt-5 md:pt-0 md:pl-8">
                  <div className="flex flex-col items-center md:items-end gap-4">
                    <div className={cn(
                      "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] flex items-center gap-2 shadow-sm",
                      session.status === 'verified' ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                      session.status === 'flagged' ? "bg-red-500/10 text-red-100 border border-red-500/20 shadow-red-500/5" :
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
                        className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all border border-slate-700/50 shadow-inner group/play"
                        title="Play Recording"
                      >
                        <Volume2 className="w-4.5 h-4.5 group-hover/play:scale-110 transition-transform" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))
        ) : (
          <div className="text-center py-20 bg-slate-900/20 border border-dashed border-slate-800/50 rounded-xl backdrop-blur-sm">
            <p className="text-slate-500 font-medium">No translations match your filters.</p>
            <button 
              onClick={clearFilters}
              className="mt-4 text-indigo-400 hover:text-indigo-300 text-[10px] font-black uppercase tracking-widest transition-colors"
            >
              Clear all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
