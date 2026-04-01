import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Flame, Target, CheckCircle2, Lock, Star, Zap, Award, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '../lib/utils';
import { UserProfile, Achievement } from '../types';

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_word', title: 'Pioneer', description: 'Contribute your first word or phrase', icon: '🌟' },
  { id: 'verified_10', title: 'Curator', description: 'Verify 10 words or phrases', icon: '📜' },
  { id: 'verified_50', title: 'Sage', description: 'Verify 50 words or phrases', icon: '🏛️' },
  { id: 'streak_7', title: 'Dedicated', description: 'Maintain a 7-day streak', icon: '🔥' },
  { id: 'streak_30', title: 'Eternal', description: 'Maintain a 30-day streak', icon: '✨' },
  { id: 'chat_10', title: 'Translator', description: 'Submit 10 translations in chat', icon: '🗣️' },
];

interface GamificationSectionProps {
  profile: UserProfile;
}

export const GamificationSection: React.FC<GamificationSectionProps> = ({ profile }) => {
  const unlockedCount = profile.achievements?.length || 0;
  const totalAchievements = ACHIEVEMENTS.length;
  const progressPercent = (unlockedCount / totalAchievements) * 100;

  return (
    <div className="max-w-6xl mx-auto space-y-16 py-10 px-4">
      {/* Header Stats - Premium Dashboard Look */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Streak Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-10 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-5 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Flame className="w-32 h-32 text-orange-500" />
          </div>
          <div className="w-20 h-20 bg-orange-500/10 rounded-3xl flex items-center justify-center border border-orange-500/20 shadow-2xl shadow-orange-950/20 relative z-10 transition-transform group-hover:scale-110">
            <Flame className={cn("w-10 h-10", profile.streak?.current > 0 ? "text-orange-500 animate-pulse" : "text-slate-700")} />
          </div>
          <div className="relative z-10">
            <h3 className="text-5xl font-black text-white tracking-tighter">{profile.streak?.current || 0}</h3>
            <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-[10px]">Active Multiplier</p>
          </div>
          <div className="px-4 py-1.5 bg-orange-500/5 rounded-full border border-orange-500/10">
             <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">Max Streak: {profile.streak?.longest || 0}</p>
          </div>
        </motion.div>

        {/* Points Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-panel p-10 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-5 relative overflow-hidden group border-amber-500/20 bg-amber-500/[0.03]"
        >
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Star className="w-32 h-32 text-amber-500" />
          </div>
          <div className="w-24 h-24 bg-amber-500/10 rounded-[2rem] flex items-center justify-center border border-amber-500/20 shadow-2xl shadow-amber-950/30 relative z-10 transition-transform group-hover:rotate-12 duration-500">
            <Star className="w-12 h-12 text-amber-500 fill-amber-500/20" />
          </div>
          <div className="relative z-10">
            <h3 className="text-5xl font-black text-white tracking-tighter">{profile.points.toLocaleString()}</h3>
            <p className="text-amber-500/60 font-black uppercase tracking-[0.3em] text-[10px]">Curation Points</p>
          </div>
          <div className="flex items-center gap-2 px-5 py-2 bg-amber-500/20 border border-amber-500/30 rounded-full shadow-lg shadow-amber-500/5">
            <Sparkles className="w-3 h-3 text-amber-300" />
            <p className="text-[10px] text-amber-100 font-black uppercase tracking-widest">Master Sage</p>
          </div>
        </motion.div>

        {/* Contributions Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel p-10 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-5 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Award className="w-32 h-32 text-slate-500" />
          </div>
          <div className="w-20 h-20 bg-slate-500/10 rounded-3xl flex items-center justify-center border border-slate-500/20 shadow-2xl relative z-10 transition-transform group-hover:-translate-y-2">
            <Trophy className="w-10 h-10 text-slate-400" />
          </div>
          <div className="relative z-10">
            <h3 className="text-5xl font-black text-white tracking-tighter">{profile.contributions || 0}</h3>
            <p className="text-slate-500 font-black uppercase tracking-[0.3em] text-[10px]">Contributions</p>
          </div>
          <p className="text-[10px] text-slate-600 font-bold uppercase tracking-widest leading-relaxed">Language Preserved</p>
        </motion.div>
      </div>

      {/* Achievements Section */}
      <section className="space-y-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 rounded-xl border border-amber-500/20 shadow-lg shadow-amber-500/5">
                <Trophy className="w-6 h-6 text-amber-500" />
              </div>
              <h2 className="text-4xl heading-serif text-white tracking-tight">Milestones <span className="text-amber-500">& Honors</span></h2>
            </div>
            <p className="text-slate-400 font-medium max-w-sm">Recognition for your dedication to the preservation of Dialect knowledge.</p>
          </div>
          
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-4">
              <div className="w-48 h-2.5 bg-white/5 rounded-full overflow-hidden border border-white/5 p-px">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  className="h-full bg-gradient-to-r from-amber-600 to-orange-500 rounded-full"
                />
              </div>
              <span className="text-xs font-black text-amber-500 tracking-widest">{unlockedCount} / {totalAchievements}</span>
            </div>
            <p className="text-[10px] text-slate-600 font-black uppercase tracking-widest">Collection Progress</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ACHIEVEMENTS.map((achievement, idx) => {
            const isUnlocked = profile.achievements?.includes(achievement.id);
            return (
              <motion.div
                key={achievement.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "p-8 rounded-[2rem] border transition-all duration-500 flex flex-col items-center text-center gap-5 relative overflow-hidden group",
                  isUnlocked 
                    ? "glass-panel border-amber-500/20 bg-amber-500/[0.02]" 
                    : "bg-black/40 border-white/5 opacity-50 contrast-75 grayscale"
                )}
              >
                <div className={cn(
                  "w-20 h-20 rounded-3xl flex items-center justify-center text-4xl shadow-inner border transition-all duration-500 relative z-10",
                  isUnlocked 
                    ? "bg-amber-500/20 border-amber-500/20 group-hover:scale-110 group-hover:rotate-6" 
                    : "bg-slate-900 border-white/5"
                )}>
                  {isUnlocked ? achievement.icon : <Lock className="w-7 h-7 text-slate-700" />}
                </div>
                <div className="relative z-10 space-y-2 flex-1">
                  <h4 className={cn("text-xl heading-serif font-black tracking-tight", isUnlocked ? "text-white" : "text-slate-600")}>
                    {achievement.title}
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed font-medium px-2">{achievement.description}</p>
                </div>
                {isUnlocked && (
                  <div className="absolute top-4 right-4 animate-bounce">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  </div>
                )}
                {/* Cultural pattern background for unlocked */}
                {isUnlocked && (
                   <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/az-subtle.png')] opacity-5 pointer-events-none" />
                )}
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Daily Challenges - Modern Quest Board */}
      <section className="space-y-10">
        <div className="flex items-center gap-3 px-4">
          <div className="p-2.5 bg-rose-500/10 rounded-xl border border-rose-500/20 shadow-lg shadow-rose-500/5">
            <Target className="w-6 h-6 text-rose-500" />
          </div>
          <h2 className="text-4xl heading-serif text-white tracking-tight">Active <span className="text-rose-500">Quests</span></h2>
        </div>

        <div className="glass-panel rounded-[3rem] p-12 overflow-hidden relative">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/[0.02] via-transparent to-amber-500/[0.02]" />
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 relative z-10">
            {/* Quest 1 */}
            <div className="space-y-6 group p-2">
              <div className="flex justify-between items-start">
                <div className="flex gap-4">
                  <div className="w-14 h-14 bg-amber-500/10 rounded-2xl flex items-center justify-center border border-amber-500/20 shadow-inner group-hover:scale-105 transition-transform">
                    <Zap className="w-7 h-7 text-amber-500 fill-amber-500/20" />
                  </div>
                  <div>
                    <h4 className="text-xl heading-serif font-black text-white tracking-tight mb-1">
                      Lexicon Master
                    </h4>
                    <p className="text-sm text-slate-500 font-medium">Contribute 5 entries today</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-amber-500/20 px-3 py-1.5 rounded-xl border border-amber-500/30">
                  <span className="text-[10px] font-black text-amber-200 uppercase tracking-widest">+100 XP</span>
                </div>
              </div>
              
              <div className="space-y-4 pt-2">
                <div className="flex justify-between text-[11px] font-black text-slate-500 uppercase tracking-widest px-2 group-hover:text-amber-500/60 transition-colors">
                  <span>QUEST PROGRESS</span>
                  <span className="text-slate-300">{Math.min(profile.contributions % 5, 5)} / 5</span>
                </div>
                <div className="h-4 bg-white/5 rounded-full overflow-hidden p-1 border border-white/5 shadow-inner">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((profile.contributions % 5) / 5 * 100, 100)}%` }}
                    className="h-full bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 rounded-full shadow-[0_0_15px_rgba(201,146,42,0.3)]"
                  />
                </div>
              </div>
            </div>

            {/* Quest 2 - Locked/Future */}
            <div className="space-y-6 p-2 relative group cursor-not-allowed">
              <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-2xl flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="flex flex-col items-center gap-2">
                   <Lock className="w-8 h-8 text-slate-500" />
                   <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Unlocks at Level 5</p>
                </div>
              </div>
              
              <div className="flex justify-between items-start opacity-30">
                <div className="flex gap-4">
                  <div className="w-14 h-14 bg-slate-800/50 rounded-2xl flex items-center justify-center border border-white/5 shadow-inner">
                    <UsersIcon className="w-7 h-7 text-slate-500" />
                  </div>
                  <div>
                    <h4 className="text-xl heading-serif font-black text-slate-400 tracking-tight mb-1">
                      Oral Traditon
                    </h4>
                    <p className="text-sm text-slate-600 font-medium">Record 3 village stories</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-slate-800/30 px-3 py-1.5 rounded-xl border border-white/5">
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">+500 XP</span>
                </div>
              </div>
              
              <div className="space-y-4 pt-2 opacity-20">
                <div className="flex justify-between text-[11px] font-black text-slate-700 uppercase tracking-widest px-2">
                  <span>QUEST PROGRESS</span>
                  <span>0 / 3</span>
                </div>
                <div className="h-4 bg-white/2 rounded-full overflow-hidden p-1 border border-white/5">
                  <div className="h-full w-0 bg-slate-800 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 flex justify-center">
             <button className="flex items-center gap-2 text-xs font-black text-amber-500/60 uppercase tracking-[0.3em] hover:text-amber-500 transition-colors">
               View Quest Archive <ChevronRight className="w-4 h-4" />
             </button>
          </div>
        </div>
      </section>
    </div>
  );
};

// Internal Lucide alias for convenience if needed, but imported above
const UsersIcon = (props: any) => (
  <svg
    {...props}
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
