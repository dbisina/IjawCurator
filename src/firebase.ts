import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, updateDoc, onSnapshot, query, where, orderBy, getDocFromServer, serverTimestamp, increment } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import { UserProfile, WordEntry, CorrectionEntry } from './types';

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
