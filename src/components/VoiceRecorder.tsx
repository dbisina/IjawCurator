import React, { useState, useRef } from 'react';
import { Mic, Square, Play, Trash2, Upload, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../lib/utils';
import { useHoverSound } from '../hooks/useHoverSound';
import { storage, db, auth } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';

interface VoiceRecorderProps {
  wordId?: string;
  dialect?: string;
  onUploadSuccess?: (url: string) => void;
  onUploadingChange?: (isUploading: boolean) => void;
  className?: string;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ wordId, dialect, onUploadSuccess, onUploadingChange, className }) => {
  const { playHover } = useHoverSound();
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const setUploadingState = (state: boolean) => {
    setIsUploading(state);
    if (onUploadingChange) onUploadingChange(state);
  };
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      // Clean up any existing audio URL to free resources
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
        setAudioUrl(null);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Check for supported mime types with better cross-browser support
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : 'audio/ogg';
            
      console.log(`[VoiceRecorder] Starting recording with mimeType: ${mimeType}`);
      
      mediaRecorder.current = new MediaRecorder(stream, { 
        audioBitsPerSecond: 128000, // Slightly higher quality
        mimeType
      });
      chunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.current.push(e.data);
          console.log(`[VoiceRecorder] Data chunk received: ${e.data.size} bytes`);
        }
      };

      mediaRecorder.current.onstop = () => {
        const blob = new Blob(chunks.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        console.log(`[VoiceRecorder] Recording stopped. Final blob size: ${(blob.size / 1024).toFixed(2)} KB (${mimeType})`);
      };

      mediaRecorder.current.start(1000); // Collect data every second for better reliability
      setIsRecording(true);
    } catch (err) {
      console.error("[VoiceRecorder] Error accessing microphone:", err);
      toast.error("Could not access microphone. Please check permissions and ensure you are on HTTPS.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorder.current && isRecording) {
      console.log("[VoiceRecorder] Stopping recording...");
      mediaRecorder.current.stop();
      setIsRecording(false);
      mediaRecorder.current.stream.getTracks().forEach(track => {
        track.stop();
        console.log(`[VoiceRecorder] Track stopped: ${track.label}`);
      });
    }
  };

  const deleteRecording = () => {
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      console.log("[VoiceRecorder] Audio URL revoked");
    }
    setAudioUrl(null);
    setAudioBlob(null);
    setUploadProgress(0);
  };

  const handleUpload = async () => {
    if (!audioBlob || !auth.currentUser) {
      toast.error("You must be logged in to upload recordings.");
      return;
    }

    if (audioBlob.size === 0) {
      toast.error("Recording is empty. Please try recording again.");
      return;
    }

    setUploadingState(true);
    setUploadProgress(10); // Start at 10% to show activity
    const startTime = Date.now();
    console.log(`[VoiceRecorder] Starting upload... Size: ${(audioBlob.size / 1024).toFixed(2)} KB, Type: ${audioBlob.type}`);

    try {
      const extension = audioBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const filename = `voice_recordings/${auth.currentUser.uid}/${wordId || 'chat'}_${Date.now()}.${extension}`;
      const storageRef = ref(storage, filename);
      
      const metadata = {
        contentType: audioBlob.type,
        customMetadata: {
          'wordId': wordId || 'chat',
          'userId': auth.currentUser.uid,
          'dialect': dialect || 'unknown'
        }
      };

      // Using uploadBytes instead of uploadBytesResumable for better reliability in proxy environments
      // uploadBytes is a single POST request which is often more stable than the resumable protocol
      console.log("[VoiceRecorder] Uploading via uploadBytes...");
      setUploadProgress(30);
      
      const uploadResult = await uploadBytes(storageRef, audioBlob, metadata);
      console.log("[VoiceRecorder] uploadBytes successful:", uploadResult.metadata.fullPath);
      setUploadProgress(70);
      
      const downloadURL = await getDownloadURL(uploadResult.ref);
      const uploadDuration = Date.now() - startTime;
      console.log(`[VoiceRecorder] Upload completed in ${uploadDuration}ms. URL: ${downloadURL}`);
      setUploadProgress(100);

      if (wordId && dialect) {
        const dbStartTime = Date.now();
        await addDoc(collection(db, 'voiceExercises'), {
          wordId,
          userId: auth.currentUser.uid,
          userEmail: auth.currentUser.email,
          dialect,
          audioUrl: downloadURL,
          submittedAt: serverTimestamp(),
          status: 'pending'
        });
        console.log(`[VoiceRecorder] Firestore entry created in ${Date.now() - dbStartTime}ms`);
      }

      toast.success("Recording uploaded successfully!");
      if (onUploadSuccess) onUploadSuccess(downloadURL);
      deleteRecording();
    } catch (error: any) {
      console.error("[VoiceRecorder] Upload error:", error);
      let errorMsg = error.message || "Unknown error";
      if (error.code === 'storage/unauthorized') {
        errorMsg = "Permission denied. Please check storage rules.";
      } else if (error.code === 'storage/retry-limit-exceeded') {
        errorMsg = "Network timeout. Please check your connection.";
      }
      toast.error(`Upload failed: ${errorMsg}`);
    } finally {
      setUploadingState(false);
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-4 p-6 bg-zinc-900/50 rounded-2xl border border-zinc-800", className)}>
      <div className="text-center">
        <h3 className="text-lg font-medium text-white">Voice Exercise</h3>
        <p className="text-sm text-zinc-400">Record your pronunciation to help AI learn</p>
      </div>

      <div className="relative">
        <AnimatePresence mode="wait">
          {!audioUrl ? (
            <motion.button
              key="record"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={isRecording ? stopRecording : startRecording}
              onMouseEnter={playHover}
              className={cn(
                "w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300",
                isRecording 
                  ? "bg-red-500 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.4)]" 
                  : "bg-indigo-600 hover:bg-indigo-500 shadow-lg"
              )}
            >
              {isRecording ? <Square className="text-white fill-white" /> : <Mic className="text-white" />}
            </motion.button>
          ) : (
            <motion.div
              key="preview"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="flex items-center gap-3"
            >
              <button
                onClick={() => new Audio(audioUrl).play()}
                onMouseEnter={playHover}
                className="w-14 h-14 bg-zinc-800 hover:bg-zinc-700 text-white rounded-full flex items-center justify-center transition-colors"
              >
                <Play className="fill-white" />
              </button>
              <button
                onClick={deleteRecording}
                onMouseEnter={playHover}
                className="w-14 h-14 bg-zinc-800 hover:bg-red-900/30 text-red-500 rounded-full flex items-center justify-center transition-colors"
              >
                <Trash2 />
              </button>
              <button
                onClick={handleUpload}
                onMouseEnter={playHover}
                disabled={isUploading}
                className="w-14 h-14 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full flex items-center justify-center transition-colors disabled:opacity-50 relative overflow-hidden"
              >
                {isUploading ? (
                  <>
                    <div 
                      className="absolute bottom-0 left-0 w-full bg-indigo-400/30 transition-all duration-300" 
                      style={{ height: `${uploadProgress}%` }}
                    />
                    <span className="text-[10px] font-bold z-10">{Math.round(uploadProgress)}%</span>
                  </>
                ) : (
                  <Upload />
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {isRecording && (
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
          <span className="text-xs font-mono text-red-500 uppercase tracking-widest">Recording...</span>
        </div>
      )}
    </div>
  );
};
