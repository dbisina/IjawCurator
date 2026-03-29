import React from 'react';
import { motion } from 'framer-motion';
import { Trophy, Flame, Target, CheckCircle2, Lock, Star, Zap, Award } from 'lucide-react';
import { cn } from '../lib/utils';
import { UserProfile, Achievement } from '../types';

// (Types moved to types.ts)

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_word', title: 'Pioneer', description: 'Contribute your first word or phrase', icon: '🌟' },
  { id: 'verified_10', title: 'Vetter', description: 'Verify 10 words or phrases', icon: '✅' },
  { id: 'verified_50', title: 'Expert', description: 'Verify 50 words or phrases', icon: '🎓' },
  { id: 'streak_7', title: 'Dedicated', description: 'Maintain a 7-day streak', icon: '🔥' },
  { id: 'streak_30', title: 'Legendary', description: 'Maintain a 30-day streak', icon: '👑' },
  { id: 'chat_10', title: 'Translator', description: 'Submit 10 translations in chat', icon: '💬' },
];

interface GamificationSectionProps {
  profile: UserProfile;
}

export const GamificationSection: React.FC<GamificationSectionProps> = ({ profile }) => {
  const unlockedCount = profile.achievements?.length || 0;
  const totalAchievements = ACHIEVEMENTS.length;
  const progressPercent = (unlockedCount / totalAchievements) * 100;

  return (
    <div className="max-w-5xl mx-auto space-y-12 py-8 px-4">
      {/* Header Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-4 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Flame className="w-24 h-24 text-orange-500" />
          </div>
          <div className="w-16 h-16 bg-orange-500/10 rounded-2xl flex items-center justify-center">
            <Flame className={cn("w-8 h-8", profile.streak?.current > 0 ? "text-orange-500 animate-pulse" : "text-zinc-600")} />
          </div>
          <div>
            <h3 className="text-4xl font-black text-white">{profile.streak?.current || 0}</h3>
            <p className="text-zinc-500 font-medium uppercase tracking-widest text-xs">Day Streak</p>
          </div>
          <p className="text-xs text-zinc-600">Longest: {profile.streak?.longest || 0} days</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-4 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Star className="w-24 h-24 text-yellow-500" />
          </div>
          <div className="w-16 h-16 bg-yellow-500/10 rounded-2xl flex items-center justify-center">
            <Star className="w-8 h-8 text-yellow-500" />
          </div>
          <div>
            <h3 className="text-4xl font-black text-white">{profile.points.toLocaleString()}</h3>
            <p className="text-zinc-500 font-medium uppercase tracking-widest text-xs">Total Points</p>
          </div>
          <p className="text-xs text-zinc-600">Rank: Master Curator</p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-zinc-900/50 border border-zinc-800 p-8 rounded-[2.5rem] flex flex-col items-center justify-center text-center space-y-4 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Award className="w-24 h-24 text-indigo-500" />
          </div>
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center">
            <Award className="w-8 h-8 text-indigo-500" />
          </div>
          <div>
            <h3 className="text-4xl font-black text-white">{profile.contributions || 0}</h3>
            <p className="text-zinc-500 font-medium uppercase tracking-widest text-xs">Contributions</p>
          </div>
          <p className="text-xs text-zinc-600">Verifications & Corrections</p>
        </motion.div>
      </div>

      {/* Achievements Section */}
      <section className="space-y-6">
        <div className="flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Trophy className="w-6 h-6 text-yellow-500" />
            <h2 className="text-2xl font-bold text-white">Achievements</h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block w-48 h-2 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                className="h-full bg-indigo-500"
              />
            </div>
            <span className="text-sm font-bold text-zinc-400">{unlockedCount}/{totalAchievements}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ACHIEVEMENTS.map((achievement, idx) => {
            const isUnlocked = profile.achievements?.includes(achievement.id);
            return (
              <motion.div
                key={achievement.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className={cn(
                  "p-6 rounded-3xl border transition-all duration-300 flex items-center gap-5",
                  isUnlocked 
                    ? "bg-indigo-500/5 border-indigo-500/20 shadow-lg shadow-indigo-500/5" 
                    : "bg-zinc-900/30 border-zinc-800 opacity-60 grayscale"
                )}
              >
                <div className={cn(
                  "w-14 h-14 rounded-2xl flex items-center justify-center text-3xl shadow-inner",
                  isUnlocked ? "bg-indigo-500/20" : "bg-zinc-800"
                )}>
                  {isUnlocked ? achievement.icon : <Lock className="w-6 h-6 text-zinc-600" />}
                </div>
                <div className="flex-1">
                  <h4 className={cn("font-bold text-lg", isUnlocked ? "text-white" : "text-zinc-500")}>
                    {achievement.title}
                  </h4>
                  <p className="text-xs text-zinc-500 leading-relaxed">{achievement.description}</p>
                </div>
                {isUnlocked && (
                  <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Daily Challenges */}
      <section className="space-y-6">
        <div className="flex items-center gap-3 px-4">
          <Target className="w-6 h-6 text-red-500" />
          <h2 className="text-2xl font-bold text-white">Daily Challenges</h2>
        </div>

        <div className="bg-zinc-900/50 border border-zinc-800 rounded-[2.5rem] p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-yellow-500" /> Word Master
                  </h4>
                  <p className="text-sm text-zinc-500">Verify 5 words today</p>
                </div>
                <span className="text-sm font-bold text-indigo-400">+100 XP</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-zinc-600">
                  <span>Progress</span>
                  <span>{Math.min(profile.contributions % 5, 5)} / 5</span>
                </div>
                <div className="h-3 bg-zinc-800 rounded-full overflow-hidden p-0.5">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min((profile.contributions % 5) / 5 * 100, 100)}%` }}
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 opacity-50">
              <div className="flex justify-between items-end">
                <div>
                  <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    <Zap className="w-5 h-5 text-zinc-600" /> Social Butterfly
                  </h4>
                  <p className="text-sm text-zinc-500">Add 3 new friends</p>
                </div>
                <span className="text-sm font-bold text-zinc-600">+250 XP</span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-bold text-zinc-600">
                  <span>Progress</span>
                  <span>0 / 3</span>
                </div>
                <div className="h-3 bg-zinc-800 rounded-full overflow-hidden p-0.5">
                  <div className="h-full w-0 bg-zinc-700 rounded-full" />
                </div>
              </div>
              <p className="text-[10px] text-zinc-700 uppercase tracking-widest font-bold">Coming Soon</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
