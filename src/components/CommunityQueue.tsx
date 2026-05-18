import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  ThumbsUp,
  ThumbsDown,
  Play,
  CheckCircle2,
  MessageSquare,
  Mic2,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import {
  communityVoteCorrection,
  communityVoteChatSession,
  communityVoteVoiceExercise,
  applyCorrection,
  logActivity,
} from '../firebase';
import { AGREEMENT_THRESHOLD, REJECTION_THRESHOLD } from '../constants';
import { CorrectionEntry } from '../types';
import { cn } from '../lib/utils';

// ─── Local interfaces (not exported to avoid types.ts conflicts) ─────────────

interface ChatSessionEntry {
  id: string;
  englishPhrase: string;
  ijawTranslation: string;
  audioUrl: string;
  userId: string;
  dialect: string;
  status: 'pending' | 'verified' | 'flagged';
  createdAt: unknown;
  upvotedBy?: string[];
  downvotedBy?: string[];
}

interface VoiceExerciseEntry {
  id: string;
  wordId: string;
  userId: string;
  userEmail: string;
  dialect: string;
  audioUrl: string;
  submittedAt: unknown;
  status: 'pending' | 'verified' | 'rejected';
  upvotedBy?: string[];
  downvotedBy?: string[];
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface CommunityQueueProps {
  selectedDialect: string | null;
  currentUserId: string;
  isAdmin?: boolean;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type TabId = 'corrections' | 'chat' | 'voice';

interface VoteBarProps {
  upvotes: number;
  downvotes: number;
  threshold?: number;
  rejectionThreshold?: number;
}

const VoteBar: React.FC<VoteBarProps> = ({
  upvotes,
  downvotes,
  threshold = AGREEMENT_THRESHOLD,
  rejectionThreshold = REJECTION_THRESHOLD,
}) => {
  const upFill = Math.min(upvotes / threshold, 1);
  const downFill = Math.min(downvotes / rejectionThreshold, 1);

  return (
    <div className="space-y-1.5">
      {/* Upvote bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-emerald-500 font-bold w-14 shrink-0 uppercase tracking-wider">
          Approve
        </span>
        <div className="flex-1 h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-emerald-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${upFill * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
        <span className="text-[10px] text-slate-400 font-mono w-10 text-right shrink-0">
          {upvotes}/{threshold}
        </span>
      </div>
      {/* Downvote bar */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-red-500 font-bold w-14 shrink-0 uppercase tracking-wider">
          Reject
        </span>
        <div className="flex-1 h-1.5 bg-slate-800/60 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-red-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${downFill * 100}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
        <span className="text-[10px] text-slate-400 font-mono w-10 text-right shrink-0">
          {downvotes}/{rejectionThreshold}
        </span>
      </div>
    </div>
  );
};

interface VoteButtonsProps {
  hasUpvoted: boolean;
  hasDownvoted: boolean;
  upvotes: number;
  downvotes: number;
  isOwnItem: boolean;
  loading: boolean;
  onUpvote: () => void;
  onDownvote: () => void;
}

const VoteButtons: React.FC<VoteButtonsProps> = ({
  hasUpvoted,
  hasDownvoted,
  upvotes,
  downvotes,
  isOwnItem,
  loading,
  onUpvote,
  onDownvote,
}) => (
  <div className="flex items-center gap-2">
    <button
      onClick={onUpvote}
      disabled={isOwnItem || loading}
      title={isOwnItem ? "Can't vote on your own submission" : 'Upvote to approve'}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all',
        hasUpvoted
          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'
          : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-emerald-500/10 hover:border-emerald-500/30 hover:text-emerald-400',
        (isOwnItem || loading) && 'opacity-40 cursor-not-allowed'
      )}
    >
      <ThumbsUp className="w-3 h-3" />
      <span>{upvotes}</span>
    </button>
    <button
      onClick={onDownvote}
      disabled={isOwnItem || loading}
      title={isOwnItem ? "Can't vote on your own submission" : 'Downvote to reject'}
      className={cn(
        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all',
        hasDownvoted
          ? 'bg-red-500/20 border-red-500/40 text-red-400'
          : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400',
        (isOwnItem || loading) && 'opacity-40 cursor-not-allowed'
      )}
    >
      <ThumbsDown className="w-3 h-3" />
      <span>{downvotes}</span>
    </button>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const CommunityQueue: React.FC<CommunityQueueProps> = ({
  selectedDialect,
  currentUserId,
  isAdmin = false,
}) => {
  const [corrections, setCorrections] = useState<CorrectionEntry[]>([]);
  const [chatSessions, setChatSessions] = useState<ChatSessionEntry[]>([]);
  const [voiceExercises, setVoiceExercises] = useState<VoiceExerciseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('corrections');
  const [filterByDialect, setFilterByDialect] = useState(true);
  const [votingIds, setVotingIds] = useState<Set<string>>(new Set());

  // ── Firestore subscriptions ──────────────────────────────────────────────

  useEffect(() => {
    const corrConstraints = [
      where('status', '==', 'pending'),
      orderBy('submittedAt', 'desc'),
      ...(filterByDialect && selectedDialect ? [where('dialect', '==', selectedDialect)] : []),
    ];
    const chatConstraints = [
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc'),
      ...(filterByDialect && selectedDialect ? [where('dialect', '==', selectedDialect)] : []),
    ];
    const voiceConstraints = [
      where('status', '==', 'pending'),
      orderBy('submittedAt', 'desc'),
      ...(filterByDialect && selectedDialect ? [where('dialect', '==', selectedDialect)] : []),
    ];

    const unsubCorr = onSnapshot(
      query(collection(db, 'corrections'), ...corrConstraints),
      (snap) => setCorrections(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CorrectionEntry)))
    );
    const unsubChat = onSnapshot(
      query(collection(db, 'chatSessions'), ...chatConstraints),
      (snap) => setChatSessions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ChatSessionEntry)))
    );
    const unsubVoice = onSnapshot(
      query(collection(db, 'voiceExercises'), ...voiceConstraints),
      (snap) => {
        setVoiceExercises(snap.docs.map((d) => ({ id: d.id, ...d.data() } as VoiceExerciseEntry)));
        setLoading(false);
      }
    );

    return () => {
      unsubCorr();
      unsubChat();
      unsubVoice();
    };
  }, [filterByDialect, selectedDialect]);

  // ── Vote handlers ────────────────────────────────────────────────────────

  const withVoteLock = useCallback(
    async (id: string, fn: () => Promise<void>) => {
      if (votingIds.has(id)) return;
      setVotingIds((prev) => new Set(prev).add(id));
      try {
        await fn();
      } finally {
        setVotingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [votingIds]
  );

  const handleCorrectionVote = useCallback(
    (corr: CorrectionEntry, vote: 'up' | 'down') => {
      withVoteLock(corr.id, async () => {
        try {
          const result = await communityVoteCorrection(corr.id, currentUserId, vote);
          if (result === 'approved') toast.success('Correction approved by community!');
          else if (result === 'rejected') toast.info('Correction rejected by community.');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Vote failed');
        }
      });
    },
    [currentUserId, withVoteLock]
  );

  const handleChatVote = useCallback(
    (session: ChatSessionEntry, vote: 'up' | 'down') => {
      withVoteLock(session.id, async () => {
        try {
          const result = await communityVoteChatSession(session.id, currentUserId, vote);
          if (result === 'verified') toast.success('Translation verified by community!');
          else if (result === 'flagged') toast.info('Translation flagged by community.');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Vote failed');
        }
      });
    },
    [currentUserId, withVoteLock]
  );

  const handleVoiceVote = useCallback(
    (exercise: VoiceExerciseEntry, vote: 'up' | 'down') => {
      withVoteLock(exercise.id, async () => {
        try {
          const result = await communityVoteVoiceExercise(exercise.id, currentUserId, vote);
          if (result === 'verified') toast.success('Voice sample verified by community!');
          else if (result === 'flagged') toast.info('Voice sample flagged by community.');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Vote failed');
        }
      });
    },
    [currentUserId, withVoteLock]
  );

  // ── Admin override handlers ──────────────────────────────────────────────

  const adminApproveCorrection = useCallback(
    async (corr: CorrectionEntry) => {
      try {
        await applyCorrection(corr);
        await logActivity('ADMIN_CORRECTION_APPROVED', `Admin approved correction for word ID: ${corr.wordId}`);
        toast.success('Correction force-approved!');
      } catch (err) {
        toast.error('Admin approve failed');
      }
    },
    []
  );

  const adminRejectCorrection = useCallback(
    async (corr: CorrectionEntry) => {
      try {
        const ref = doc(db, 'corrections', corr.id);
        await updateDoc(ref, { status: 'rejected' });
        await logActivity('ADMIN_CORRECTION_REJECTED', `Admin rejected correction for word ID: ${corr.wordId}`);
        toast.info('Correction force-rejected.');
      } catch (err) {
        toast.error('Admin reject failed');
      }
    },
    []
  );

  const adminApproveChat = useCallback(
    async (session: ChatSessionEntry) => {
      try {
        const ref = doc(db, 'chatSessions', session.id);
        await updateDoc(ref, { status: 'verified' });
        await logActivity('ADMIN_CHAT_VERIFIED', `Admin verified chat translation for: ${session.englishPhrase}`);
        toast.success('Translation force-approved!');
      } catch (err) {
        toast.error('Admin approve failed');
      }
    },
    []
  );

  const adminRejectChat = useCallback(
    async (session: ChatSessionEntry) => {
      try {
        const ref = doc(db, 'chatSessions', session.id);
        await updateDoc(ref, { status: 'flagged' });
        await logActivity('ADMIN_CHAT_FLAGGED', `Admin flagged chat translation for: ${session.englishPhrase}`);
        toast.info('Translation force-rejected.');
      } catch (err) {
        toast.error('Admin reject failed');
      }
    },
    []
  );

  const adminApproveVoice = useCallback(
    async (exercise: VoiceExerciseEntry) => {
      try {
        const ref = doc(db, 'voiceExercises', exercise.id);
        await updateDoc(ref, { status: 'verified' });
        await logActivity('ADMIN_VOICE_VERIFIED', `Admin verified voice sample for word ID: ${exercise.wordId}`);
        toast.success('Voice sample force-approved!');
      } catch (err) {
        toast.error('Admin approve failed');
      }
    },
    []
  );

  const adminRejectVoice = useCallback(
    async (exercise: VoiceExerciseEntry) => {
      try {
        const ref = doc(db, 'voiceExercises', exercise.id);
        await updateDoc(ref, { status: 'rejected' });
        await logActivity('ADMIN_VOICE_REJECTED', `Admin rejected voice sample for word ID: ${exercise.wordId}`);
        toast.info('Voice sample force-rejected.');
      } catch (err) {
        toast.error('Admin reject failed');
      }
    },
    []
  );

  // ── Shared admin override section ────────────────────────────────────────

  const AdminOverride: React.FC<{
    onApprove: () => void;
    onReject: () => void;
  }> = ({ onApprove, onReject }) => (
    <div className="flex gap-2 pt-3 border-t border-slate-800/50 mt-3">
      <span className="text-[9px] text-slate-600 uppercase font-bold tracking-widest self-center">
        Admin:
      </span>
      <button
        onClick={onApprove}
        className="px-3 py-1 bg-amber-700/20 text-amber-400 text-xs rounded-lg border border-amber-700/30 hover:bg-amber-700/40 transition-all"
      >
        Force Approve
      </button>
      <button
        onClick={onReject}
        className="px-3 py-1 bg-red-500/10 text-red-400 text-xs rounded-lg border border-red-500/20 hover:bg-red-500/20 transition-all"
      >
        Force Reject
      </button>
    </div>
  );

  // ── Empty state ──────────────────────────────────────────────────────────

  const EmptyState: React.FC<{ icon: React.ReactNode; message?: string }> = ({
    icon,
    message = 'Nothing to review — the community is up to date!',
  }) => (
    <div className="text-center py-20 bg-slate-950/30 rounded-xl border border-dashed border-slate-800/50">
      <div className="w-12 h-12 text-slate-700 mx-auto mb-4">{icon}</div>
      <p className="text-slate-300 font-medium">All caught up!</p>
      <p className="text-slate-500 mt-2 text-sm">{message}</p>
    </div>
  );

  // ── Tab badge helper ─────────────────────────────────────────────────────

  const TabBadge: React.FC<{ count: number }> = ({ count }) =>
    count > 0 ? (
      <span className="ml-1 px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[9px] font-bold rounded-full border border-amber-500/20">
        {count}
      </span>
    ) : null;

  // ── Render guards ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-500 text-sm">
        Loading community queue…
      </div>
    );
  }

  const tabs: Array<{ id: TabId; label: string; count: number; icon: React.ReactNode }> = [
    {
      id: 'corrections',
      label: 'Corrections',
      count: corrections.length,
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    {
      id: 'chat',
      label: 'Translations',
      count: chatSessions.length,
      icon: <MessageSquare className="w-3.5 h-3.5" />,
    },
    {
      id: 'voice',
      label: 'Voice',
      count: voiceExercises.length,
      icon: <Mic2 className="w-3.5 h-3.5" />,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <h2 className="text-2xl font-bold tracking-tight">Community Queue</h2>
          </div>

          {selectedDialect && (
            <button
              onClick={() => setFilterByDialect((v) => !v)}
              className={cn(
                'px-4 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-2',
                filterByDialect
                  ? 'bg-amber-700/10 border-amber-500/50 text-amber-400'
                  : 'bg-slate-900/50 border-slate-800/50 text-slate-500 hover:text-slate-300'
              )}
            >
              {filterByDialect ? `Only ${selectedDialect}` : 'All Dialects'}
            </button>
          )}

          {/* Tabs */}
          <div className="flex bg-slate-950/50 p-1 rounded-xl border border-slate-800/50">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold transition-all',
                  activeTab === tab.id
                    ? 'bg-amber-700 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-300'
                )}
              >
                {tab.icon}
                {tab.label}
                <TabBadge count={tab.count} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Corrections Tab ─────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {activeTab === 'corrections' && (
          <motion.div
            key="corrections"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {corrections.length === 0 ? (
              <EmptyState icon={<CheckCircle2 className="w-12 h-12" />} />
            ) : (
              <div className="grid gap-4">
                {corrections.map((corr) => {
                  const upvotes = corr.agreedBy?.length ?? 0;
                  const downvotes = corr.downvotedBy?.length ?? 0;
                  const hasUpvoted = corr.agreedBy?.includes(currentUserId) ?? false;
                  const hasDownvoted = corr.downvotedBy?.includes(currentUserId) ?? false;
                  const isOwnItem = corr.submittedBy === currentUserId;
                  const isVoting = votingIds.has(corr.id);

                  return (
                    <motion.div
                      key={corr.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        'bg-slate-900/40 border border-slate-800/50 rounded-xl p-5 space-y-4 shadow-sm',
                        hasUpvoted && 'border-emerald-500/30 bg-emerald-500/5'
                      )}
                    >
                      {/* Header row */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 bg-amber-700/20 text-amber-400 text-[10px] font-bold uppercase rounded border border-amber-700/30 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            Correction
                          </span>
                          <span className="text-sm font-mono text-amber-400">{corr.wordId}</span>
                          {corr.dialect && (
                            <span className="px-2 py-0.5 bg-slate-800/50 text-slate-400 text-[10px] font-bold uppercase rounded border border-slate-700/50">
                              {corr.dialect}
                            </span>
                          )}
                          {isOwnItem && (
                            <span className="px-2 py-0.5 bg-slate-800/30 text-slate-500 text-[10px] font-bold uppercase rounded border border-slate-700/30">
                              Your submission
                            </span>
                          )}
                        </div>
                        <VoteButtons
                          hasUpvoted={hasUpvoted}
                          hasDownvoted={hasDownvoted}
                          upvotes={upvotes}
                          downvotes={downvotes}
                          isOwnItem={isOwnItem}
                          loading={isVoting}
                          onUpvote={() => handleCorrectionVote(corr, 'up')}
                          onDownvote={() => handleCorrectionVote(corr, 'down')}
                        />
                      </div>

                      {/* Content grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-950/30 rounded-xl border border-slate-800/50">
                        <div className="space-y-3">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800/50 pb-1">
                            Current Version
                          </p>
                          <div className="space-y-1.5">
                            <p className="text-lg font-bold text-slate-400">{corr.originalWord ?? 'N/A'}</p>
                            <p className="text-sm text-slate-500 leading-snug">{corr.originalMeaning ?? 'N/A'}</p>
                            <p className="text-xs font-mono text-slate-600">/{corr.originalPronunciation ?? 'N/A'}/</p>
                          </div>
                        </div>
                        <div className="space-y-3 border-l border-slate-800/50 pl-6">
                          <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest border-b border-amber-500/20 pb-1">
                            Suggested
                          </p>
                          <div className="space-y-1.5">
                            <p className="text-lg font-bold text-slate-100">{corr.suggestedWord}</p>
                            <p className="text-sm text-slate-300 leading-snug">{corr.suggestedMeaning}</p>
                            <p className="text-xs font-mono text-amber-400">/{corr.suggestedPronunciation}/</p>
                            {corr.audioUrl && (
                              <button
                                onClick={() =>
                                  new Audio(corr.audioUrl!).play().catch(() => toast.error('Failed to play audio'))
                                }
                                className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-600/20 text-amber-400 rounded-lg text-[10px] font-bold transition-all border border-amber-500/20 mt-1"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                Play Audio
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {corr.reason && (
                        <div className="p-3 bg-slate-950/50 rounded-xl border border-slate-800/50">
                          <p className="text-[10px] text-slate-500 uppercase font-semibold mb-1">Reason</p>
                          <p className="text-sm text-slate-400 italic">"{corr.reason}"</p>
                        </div>
                      )}

                      {/* Vote progress */}
                      <VoteBar upvotes={upvotes} downvotes={downvotes} />

                      {/* Admin override */}
                      {isAdmin && (
                        <AdminOverride
                          onApprove={() => adminApproveCorrection(corr)}
                          onReject={() => adminRejectCorrection(corr)}
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Translations Tab ──────────────────────────────────────────── */}
        {activeTab === 'chat' && (
          <motion.div
            key="chat"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {chatSessions.length === 0 ? (
              <EmptyState
                icon={<MessageSquare className="w-12 h-12" />}
                message="Nothing to review — the community is up to date!"
              />
            ) : (
              <div className="grid gap-4">
                {chatSessions.map((session) => {
                  const upvotes = session.upvotedBy?.length ?? 0;
                  const downvotes = session.downvotedBy?.length ?? 0;
                  const hasUpvoted = session.upvotedBy?.includes(currentUserId) ?? false;
                  const hasDownvoted = session.downvotedBy?.includes(currentUserId) ?? false;
                  const isOwnItem = session.userId === currentUserId;
                  const isVoting = votingIds.has(session.id);

                  return (
                    <motion.div
                      key={session.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        'bg-slate-900/40 border border-slate-800/50 rounded-xl p-5 space-y-4 shadow-sm',
                        hasUpvoted && 'border-emerald-500/30 bg-emerald-500/5'
                      )}
                    >
                      {/* Header row */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 bg-emerald-700/20 text-emerald-400 text-[10px] font-bold uppercase rounded border border-emerald-700/30 flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            Translation
                          </span>
                          <span className="px-2 py-0.5 bg-slate-800/50 text-slate-400 text-[10px] font-bold uppercase rounded border border-slate-700/50">
                            {session.dialect}
                          </span>
                          {isOwnItem && (
                            <span className="px-2 py-0.5 bg-slate-800/30 text-slate-500 text-[10px] font-bold uppercase rounded border border-slate-700/30">
                              Your submission
                            </span>
                          )}
                        </div>
                        <VoteButtons
                          hasUpvoted={hasUpvoted}
                          hasDownvoted={hasDownvoted}
                          upvotes={upvotes}
                          downvotes={downvotes}
                          isOwnItem={isOwnItem}
                          loading={isVoting}
                          onUpvote={() => handleChatVote(session, 'up')}
                          onDownvote={() => handleChatVote(session, 'down')}
                        />
                      </div>

                      {/* Content grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-slate-950/30 rounded-xl border border-slate-800/50">
                        <div className="space-y-2">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-slate-800/50 pb-1">
                            English Phrase
                          </p>
                          <p className="text-lg font-medium text-slate-300 italic">"{session.englishPhrase}"</p>
                        </div>
                        <div className="space-y-2 border-l border-slate-800/50 pl-6">
                          <p className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest border-b border-emerald-500/20 pb-1">
                            Ijaw Translation
                          </p>
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-xl font-bold text-emerald-400">{session.ijawTranslation}</p>
                            {session.audioUrl && (
                              <button
                                onClick={() =>
                                  new Audio(session.audioUrl).play().catch(() => toast.error('Failed to play audio'))
                                }
                                className="p-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-full transition-all border border-emerald-500/20"
                                title="Play recording"
                              >
                                <Play className="w-4 h-4 fill-current" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Vote progress */}
                      <VoteBar upvotes={upvotes} downvotes={downvotes} />

                      {/* Admin override */}
                      {isAdmin && (
                        <AdminOverride
                          onApprove={() => adminApproveChat(session)}
                          onReject={() => adminRejectChat(session)}
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Voice Tab ─────────────────────────────────────────────────── */}
        {activeTab === 'voice' && (
          <motion.div
            key="voice"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {voiceExercises.length === 0 ? (
              <EmptyState
                icon={<Mic2 className="w-12 h-12" />}
                message="Nothing to review — the community is up to date!"
              />
            ) : (
              <div className="grid gap-4">
                {voiceExercises.map((exercise) => {
                  const upvotes = exercise.upvotedBy?.length ?? 0;
                  const downvotes = exercise.downvotedBy?.length ?? 0;
                  const hasUpvoted = exercise.upvotedBy?.includes(currentUserId) ?? false;
                  const hasDownvoted = exercise.downvotedBy?.includes(currentUserId) ?? false;
                  const isOwnItem = exercise.userId === currentUserId;
                  const isVoting = votingIds.has(exercise.id);

                  return (
                    <motion.div
                      key={exercise.id}
                      layout
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={cn(
                        'bg-slate-900/40 border border-slate-800/50 rounded-xl p-5 space-y-4 shadow-sm',
                        hasUpvoted && 'border-emerald-500/30 bg-emerald-500/5'
                      )}
                    >
                      {/* Header row */}
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 bg-amber-600/20 text-amber-400 text-[10px] font-bold uppercase rounded border border-amber-600/30 flex items-center gap-1">
                            <Mic2 className="w-3 h-3" />
                            Voice
                          </span>
                          <span className="text-sm font-mono text-amber-400">{exercise.wordId}</span>
                          <span className="px-2 py-0.5 bg-slate-800/50 text-slate-400 text-[10px] font-bold uppercase rounded border border-slate-700/50">
                            {exercise.dialect}
                          </span>
                          {isOwnItem && (
                            <span className="px-2 py-0.5 bg-slate-800/30 text-slate-500 text-[10px] font-bold uppercase rounded border border-slate-700/30">
                              Your submission
                            </span>
                          )}
                        </div>
                        <VoteButtons
                          hasUpvoted={hasUpvoted}
                          hasDownvoted={hasDownvoted}
                          upvotes={upvotes}
                          downvotes={downvotes}
                          isOwnItem={isOwnItem}
                          loading={isVoting}
                          onUpvote={() => handleVoiceVote(exercise, 'up')}
                          onDownvote={() => handleVoiceVote(exercise, 'down')}
                        />
                      </div>

                      {/* Content */}
                      <div className="p-4 bg-slate-950/30 rounded-xl border border-slate-800/50 flex items-center justify-between">
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">
                            Submitted By
                          </p>
                          <p className="text-sm text-slate-200">{exercise.userEmail}</p>
                          <p className="text-[10px] text-slate-500 uppercase">{exercise.dialect}</p>
                        </div>
                        <button
                          onClick={() =>
                            new Audio(exercise.audioUrl).play().catch(() => toast.error('Failed to play audio'))
                          }
                          className="p-4 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-full transition-all border border-amber-500/20"
                          title="Play recording"
                        >
                          <Play className="w-6 h-6 fill-current" />
                        </button>
                      </div>

                      {/* Vote progress */}
                      <VoteBar upvotes={upvotes} downvotes={downvotes} />

                      {/* Admin override */}
                      {isAdmin && (
                        <AdminOverride
                          onApprove={() => adminApproveVoice(exercise)}
                          onReject={() => adminRejectVoice(exercise)}
                        />
                      )}
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
