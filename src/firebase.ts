import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, updateDoc, onSnapshot, query, where, orderBy, getDocFromServer, serverTimestamp, increment, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import _firebaseConfig from '../firebase-applet-config.json';
import { UserProfile, WordEntry, CorrectionEntry } from './types';
import { AGREEMENT_THRESHOLD, REJECTION_THRESHOLD } from './constants';

// firebase-applet-config.json uses "[GCP_API_KEY]" as a placeholder that
// AI Studio substitutes at runtime. Outside AI Studio (Railway, local dev)
// we override it with the real key from the environment variable.
const firebaseConfig = {
  ..._firebaseConfig,
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || _firebaseConfig.apiKey,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export const applyCorrection = async (correction: CorrectionEntry) => {
  try {
    const corrRef = doc(db, 'corrections', correction.id);
    await updateDoc(corrRef, { status: 'approved' });

    const wordRef = doc(db, 'words', correction.wordId);
    const updateData: any = {
      word: correction.suggestedWord,
      meaning: correction.suggestedMeaning,
      pronunciation: correction.suggestedPronunciation,
      status: 'verified'
    };
    
    if (correction.audioUrl) {
      updateData.audioUrl = correction.audioUrl;
    }

    await updateDoc(wordRef, updateData);
    await logActivity('CORRECTION_APPROVED', `Approved correction for word ID: ${correction.wordId}`);
    await awardPoints(correction.submittedBy, 50, true);
    if (auth.currentUser) await awardPoints(auth.currentUser.uid, 20);
    return true;
  } catch (error) {
    console.error("Apply correction error:", error);
    throw error;
  }
};

export const awardPoints = async (userId: string, points: number, isContribution: boolean = false): Promise<UserProfile | null> => {
  try {
    const userRef = doc(db, 'users', userId);
    await setDoc(userRef, {
      points: increment(points),
      contributions: isContribution ? increment(1) : increment(0)
    }, { merge: true });
    
    // Fetch updated data to return
    const snap = await getDoc(userRef);
    return snap.data() as UserProfile;
  } catch (error) {
    console.error("Failed to award points:", error);
    return null;
  }
};

export const logActivity = async (action: string, details: string) => {
  if (!auth.currentUser) return;
  try {
    await addDoc(collection(db, 'activityLogs'), {
      action,
      details,
      userId: auth.currentUser.uid,
      userEmail: auth.currentUser.email,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    console.error("Failed to log activity:", error);
  }
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const communityVoteWord = async (
  wordId: string,
  userId: string,
  vote: 'up' | 'down'
): Promise<WordEntry['status']> => {
  const wordRef = doc(db, 'words', wordId);
  const snap = await getDoc(wordRef);
  if (!snap.exists()) throw new Error('Word not found');

  const data = snap.data() as WordEntry;

  if (data.createdBy === userId) {
    throw new Error('Cannot vote on your own word');
  }

  const upvotes: string[] = data.upvotes ?? [];
  const downvotes: string[] = data.downvotes ?? [];
  const alreadyUp = upvotes.includes(userId);
  const alreadyDown = downvotes.includes(userId);

  if (vote === 'up' && alreadyUp) return data.status;
  if (vote === 'down' && alreadyDown) return data.status;

  const updatePayload: Record<string, unknown> = {};
  if (vote === 'up') {
    updatePayload.upvotes = arrayUnion(userId);
    if (alreadyDown) updatePayload.downvotes = arrayRemove(userId);
  } else {
    updatePayload.downvotes = arrayUnion(userId);
    if (alreadyUp) updatePayload.upvotes = arrayRemove(userId);
  }

  await updateDoc(wordRef, updatePayload);
  await awardPoints(userId, 5);

  // Re-fetch to get accurate counts after update
  const updated = (await getDoc(wordRef)).data() as WordEntry;
  const newUpvotes: string[] = updated.upvotes ?? [];
  const newDownvotes: string[] = updated.downvotes ?? [];

  let newStatus: WordEntry['status'] = updated.status;

  if (newUpvotes.length >= AGREEMENT_THRESHOLD && newStatus !== 'verified') {
    newStatus = 'verified';
    await updateDoc(wordRef, { status: 'verified' });
    await awardPoints(data.createdBy, 15);
    await logActivity('WORD_VERIFIED', `Community verified word ID: ${wordId}`);
  } else if (newDownvotes.length >= REJECTION_THRESHOLD && newStatus !== 'flagged') {
    newStatus = 'flagged';
    await updateDoc(wordRef, { status: 'flagged' });
    await logActivity('WORD_FLAGGED', `Community flagged word ID: ${wordId}`);
  }

  return newStatus;
};

export const communityVoteCorrection = async (
  correctionId: string,
  userId: string,
  vote: 'up' | 'down'
): Promise<'approved' | 'rejected' | 'pending'> => {
  const corrRef = doc(db, 'corrections', correctionId);
  const snap = await getDoc(corrRef);
  if (!snap.exists()) throw new Error('Correction not found');

  const data = snap.data() as CorrectionEntry;

  if (data.submittedBy === userId) {
    throw new Error('Cannot vote on your own correction');
  }

  const agreedBy: string[] = data.agreedBy ?? [];
  const downvotedBy: string[] = data.downvotedBy ?? [];
  const alreadyUp = agreedBy.includes(userId);
  const alreadyDown = downvotedBy.includes(userId);

  if (vote === 'up' && alreadyUp) return data.status;
  if (vote === 'down' && alreadyDown) return data.status;

  const updatePayload: Record<string, unknown> = {};
  if (vote === 'up') {
    updatePayload.agreedBy = arrayUnion(userId);
    if (alreadyDown) updatePayload.downvotedBy = arrayRemove(userId);
  } else {
    updatePayload.downvotedBy = arrayUnion(userId);
    if (alreadyUp) updatePayload.agreedBy = arrayRemove(userId);
  }

  await updateDoc(corrRef, updatePayload);

  const updated = (await getDoc(corrRef)).data() as CorrectionEntry;
  const newAgreedBy: string[] = updated.agreedBy ?? [];
  const newDownvotedBy: string[] = updated.downvotedBy ?? [];

  if (newAgreedBy.length >= AGREEMENT_THRESHOLD && updated.status === 'pending') {
    await applyCorrection({ ...updated, id: correctionId });
    return 'approved';
  }

  if (newDownvotedBy.length >= REJECTION_THRESHOLD && updated.status === 'pending') {
    await updateDoc(corrRef, { status: 'rejected' });
    await logActivity('CORRECTION_REJECTED', `Community rejected correction ID: ${correctionId}`);
    return 'rejected';
  }

  return 'pending';
};

export const communityVoteChatSession = async (
  sessionId: string,
  userId: string,
  vote: 'up' | 'down'
): Promise<string> => {
  const sessionRef = doc(db, 'chatSessions', sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) throw new Error('Chat session not found');

  const data = snap.data() as { createdBy?: string; status?: string; upvotedBy?: string[]; downvotedBy?: string[] };

  if (data.createdBy === userId) {
    throw new Error('Cannot vote on your own chat session');
  }

  const upvotedBy: string[] = data.upvotedBy ?? [];
  const downvotedBy: string[] = data.downvotedBy ?? [];
  const alreadyUp = upvotedBy.includes(userId);
  const alreadyDown = downvotedBy.includes(userId);

  if (vote === 'up' && alreadyUp) return data.status ?? 'pending';
  if (vote === 'down' && alreadyDown) return data.status ?? 'pending';

  const updatePayload: Record<string, unknown> = {};
  if (vote === 'up') {
    updatePayload.upvotedBy = arrayUnion(userId);
    if (alreadyDown) updatePayload.downvotedBy = arrayRemove(userId);
  } else {
    updatePayload.downvotedBy = arrayUnion(userId);
    if (alreadyUp) updatePayload.upvotedBy = arrayRemove(userId);
  }

  await updateDoc(sessionRef, updatePayload);

  const updated = (await getDoc(sessionRef)).data() as { status?: string; upvotedBy?: string[]; downvotedBy?: string[] };
  const newUpvotedBy: string[] = updated.upvotedBy ?? [];
  const newDownvotedBy: string[] = updated.downvotedBy ?? [];

  let newStatus: string = updated.status ?? 'pending';

  if (newUpvotedBy.length >= AGREEMENT_THRESHOLD && newStatus !== 'verified') {
    newStatus = 'verified';
    await updateDoc(sessionRef, { status: 'verified' });
    await logActivity('CHAT_SESSION_VERIFIED', `Community verified chat session ID: ${sessionId}`);
  } else if (newDownvotedBy.length >= REJECTION_THRESHOLD && newStatus !== 'flagged') {
    newStatus = 'flagged';
    await updateDoc(sessionRef, { status: 'flagged' });
    await logActivity('CHAT_SESSION_FLAGGED', `Community flagged chat session ID: ${sessionId}`);
  }

  return newStatus;
};

export const communityVoteVoiceExercise = async (
  exerciseId: string,
  userId: string,
  vote: 'up' | 'down'
): Promise<string> => {
  const exerciseRef = doc(db, 'voiceExercises', exerciseId);
  const snap = await getDoc(exerciseRef);
  if (!snap.exists()) throw new Error('Voice exercise not found');

  const data = snap.data() as { createdBy?: string; status?: string; upvotedBy?: string[]; downvotedBy?: string[] };

  if (data.createdBy === userId) {
    throw new Error('Cannot vote on your own voice exercise');
  }

  const upvotedBy: string[] = data.upvotedBy ?? [];
  const downvotedBy: string[] = data.downvotedBy ?? [];
  const alreadyUp = upvotedBy.includes(userId);
  const alreadyDown = downvotedBy.includes(userId);

  if (vote === 'up' && alreadyUp) return data.status ?? 'pending';
  if (vote === 'down' && alreadyDown) return data.status ?? 'pending';

  const updatePayload: Record<string, unknown> = {};
  if (vote === 'up') {
    updatePayload.upvotedBy = arrayUnion(userId);
    if (alreadyDown) updatePayload.downvotedBy = arrayRemove(userId);
  } else {
    updatePayload.downvotedBy = arrayUnion(userId);
    if (alreadyUp) updatePayload.upvotedBy = arrayRemove(userId);
  }

  await updateDoc(exerciseRef, updatePayload);

  const updated = (await getDoc(exerciseRef)).data() as { status?: string; upvotedBy?: string[]; downvotedBy?: string[] };
  const newUpvotedBy: string[] = updated.upvotedBy ?? [];
  const newDownvotedBy: string[] = updated.downvotedBy ?? [];

  let newStatus: string = updated.status ?? 'pending';

  if (newUpvotedBy.length >= AGREEMENT_THRESHOLD && newStatus !== 'verified') {
    newStatus = 'verified';
    await updateDoc(exerciseRef, { status: 'verified' });
    await logActivity('VOICE_EXERCISE_VERIFIED', `Community verified voice exercise ID: ${exerciseId}`);
  } else if (newDownvotedBy.length >= REJECTION_THRESHOLD && newStatus !== 'flagged') {
    newStatus = 'flagged';
    await updateDoc(exerciseRef, { status: 'flagged' });
    await logActivity('VOICE_EXERCISE_FLAGGED', `Community flagged voice exercise ID: ${exerciseId}`);
  }

  return newStatus;
};

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration. ");
    }
  }
}
testConnection();
