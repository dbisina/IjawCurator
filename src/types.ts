export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'user' | 'admin';
  points: number;
  contributions: number;
  createdAt: any;
  username?: string;
  username_lowercase?: string;
  preferredDialect?: string;
  streak: {
    current: number;
    longest: number;
    lastActiveDate: string;
  };
  achievements: string[];
  challenges: {
    [challengeId: string]: number;
  };
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  requirement?: (profile: UserProfile) => boolean;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  target: number;
  points: number;
  type: 'contributions' | 'streak' | 'friends';
}

export interface WordEntry {
  id: string;
  word: string;
  meaning: string;
  pronunciation: string;
  dialect: string;
  status: 'pending' | 'verified' | 'flagged';
  createdBy: string;
  createdAt: any;
  isAiGenerated: boolean;
  audioUrl?: string;
}

export interface CorrectionEntry {
  id: string;
  wordId: string;
  dialect?: string;
  originalWord?: string;
  originalMeaning?: string;
  originalPronunciation?: string;
  suggestedWord?: string;
  suggestedMeaning?: string;
  suggestedPronunciation?: string;
  reason?: string;
  submittedBy: string;
  submittedAt: any;
  status: 'pending' | 'approved' | 'rejected';
  audioUrl?: string;
  agreedBy?: string[];
}
