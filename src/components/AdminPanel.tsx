import React, { useState, useEffect } from 'react';
import { db, logActivity, applyCorrection } from '../firebase';
import { doc, collection, updateDoc, onSnapshot, query, where, orderBy, limit, serverTimestamp, getDocsFromServer } from 'firebase/firestore';
import { WordEntry, CorrectionEntry } from '../types';
import { Check, X, RefreshCw, Download, FileSpreadsheet, FileJson, Music, ChevronDown, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import JSZip from 'jszip';
import { IJAW_DIALECTS } from '../constants';

interface ActivityLog {
  id: string;
  action: string;
  details: string;
  userId: string;
  userEmail?: string;
  timestamp: any;
}

export interface AdminPanelProps {
  adminTab: 'dataset' | 'logs' | 'export';
  setAdminTab: (tab: 'dataset' | 'logs' | 'export') => void;
  selectedDialect: string | null;
  onDialectChange: (dialect: string | null) => void;
}

export const AdminPanel = ({ adminTab, setAdminTab, selectedDialect, onDialectChange }: AdminPanelProps) => {
  const [allWords, setAllWords] = useState<WordEntry[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'verified' | 'flagged'>('all');

  useEffect(() => {
    if (adminTab === 'dataset') {
      const constraints: any[] = [orderBy('createdAt', 'desc')];
      if (filter !== 'all') constraints.push(where('status', '==', filter));
      if (selectedDialect) constraints.push(where('dialect', '==', selectedDialect));

      const q = query(collection(db, 'words'), ...constraints);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WordEntry));
        setAllWords(list);
        setLoading(false);
      });
      return unsubscribe;
    } else if (adminTab === 'logs') {
      const q = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limit(50));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ActivityLog));
        setLogs(list);
        setLoading(false);
      });
      return unsubscribe;
    } else {
      setLoading(false);
    }
  }, [filter, adminTab, selectedDialect]);

  const ExportPanel = () => {
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState(0);

    const downloadFile = (content: string | Blob, fileName: string, contentType: string) => {
      const a = document.createElement("a");
      const file = new Blob([content], { type: contentType });
      a.href = URL.createObjectURL(file);
      a.download = fileName;
      a.click();
    };

    const handleExportCSV = async () => {
      setIsExporting(true);
      try {
        const wordsSnap = await getDocsFromServer(collection(db, 'words'));
        const chatSnap = await getDocsFromServer(collection(db, 'chatSessions'));
        const voiceSnap = await getDocsFromServer(collection(db, 'voiceExercises'));

        const words = wordsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const chats = chatSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const voices = voiceSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        let csv = "Type,ID,Field1,Field2,Dialect,Status,AudioURL\n";
        words.forEach((w: any) => {
          csv += `Word,${w.id},"${w.meaning}","${w.word}",${w.dialect},${w.status},\n`;
        });
        chats.forEach((c: any) => {
          csv += `Chat,${c.id},"${c.englishPhrase}","${c.ijawTranslation}",${c.dialect},${c.status},${c.audioUrl || ''}\n`;
        });
        voices.forEach((v: any) => {
          csv += `VoiceExercise,${v.id},"${v.wordId}","${v.userId}",${v.dialect},${v.status || 'pending'},${v.audioUrl || ''}\n`;
        });

        downloadFile(csv, `ijaw_dataset_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
        toast.success("CSV Exported!");
      } catch (error) {
        console.error("CSV Export error:", error);
        toast.error("Failed to export CSV");
      } finally {
        setIsExporting(false);
      }
    };

    const handleExportFull = async () => {
      setIsExporting(true);
      setProgress(0);
      try {
        const zip = new JSZip();
        const chatSnap = await getDocsFromServer(collection(db, 'chatSessions'));
        const voiceSnap = await getDocsFromServer(collection(db, 'voiceExercises'));

        const chats = chatSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        const voices = voiceSnap.docs.map(d => ({ id: d.id, ...d.data() } as any));

        const audiosFolder = zip.folder("audios");
        let csv = "Type,ID,Text1,Text2,Dialect,AudioFile\n";

        const allItems = [
          ...chats.map(c => ({ ...c, type: 'chat' })),
          ...voices.map(v => ({ ...v, type: 'voice' }))
        ];

        const total = allItems.length;
        for (let i = 0; i < allItems.length; i++) {
          const item = allItems[i];
          const audioFileName = `${item.type}_${item.id}.webm`;

          if (item.type === 'chat') {
            csv += `Chat,${item.id},"${item.englishPhrase}","${item.ijawTranslation}",${item.dialect},${audioFileName}\n`;
          } else {
            csv += `Voice,${item.id},"${item.wordId}","${item.userId}",${item.dialect},${audioFileName}\n`;
          }

          if (item.audioUrl) {
            try {
              const response = await fetch(item.audioUrl);
              const blob = await response.blob();
              audiosFolder?.file(audioFileName, blob);
            } catch (e) {
              console.warn(`Failed to fetch audio for ${item.id}`, e);
            }
          }
          setProgress(Math.round(((i + 1) / total) * 100));
        }

        zip.file("metadata.csv", csv);
        const content = await zip.generateAsync({ type: "blob" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(content);
        a.download = `ijaw_full_dataset_${new Date().toISOString().split('T')[0]}.zip`;
        a.click();

        toast.success("Full Dataset Exported!");
      } catch (error) {
        console.error("Full Export error:", error);
        toast.error("Failed to export full dataset");
      } finally {
        setIsExporting(false);
        setProgress(0);
      }
    };

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900/40 border border-slate-800/50 p-8 rounded-xl shadow-xl space-y-6 backdrop-blur-md">
          <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/20">
            <FileSpreadsheet className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-100 tracking-tight mb-2">Export CSV</h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              Download a spreadsheet containing all words, phrases, and translations. This is perfect for data analysis or quick review.
            </p>
          </div>
          <button
            id="export-csv-btn"
            onClick={handleExportCSV}
            disabled={isExporting}
            className="w-full py-4 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 border border-slate-700/50 shadow-inner"
          >
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>

        <div className="bg-slate-900/40 border border-slate-800/50 p-8 rounded-xl shadow-xl space-y-6 backdrop-blur-md">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center border border-emerald-500/20">
            <Music className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-100 tracking-tight mb-2">Full Dataset (ZIP)</h3>
            <p className="text-slate-500 text-sm leading-relaxed">
              Export all text data along with their corresponding audio recordings. Each recording is matched to its text entry in a metadata file.
            </p>
          </div>
          <div className="space-y-4">
            <button
              id="export-full-btn"
              onClick={handleExportFull}
              disabled={isExporting}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all flex items-center justify-center gap-3 shadow-lg shadow-emerald-500/20 border border-emerald-500"
            >
              {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              Export Full Dataset
            </button>
            {isExporting && progress > 0 && (
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-black text-slate-500 uppercase tracking-widest px-1">
                  <span>Processing Audios</span>
                  <span>{progress}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/30">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex gap-4 items-center">
          <h2 className="text-2xl font-bold">Admin Panel</h2>
          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/50">
            <button
              onClick={() => setAdminTab('dataset')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all",
                adminTab === 'dataset' ? "bg-slate-800 text-white shadow-sm border border-slate-700/50" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Dataset
            </button>
            <button
              onClick={() => setAdminTab('logs')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all",
                adminTab === 'logs' ? "bg-slate-800 text-white shadow-sm border border-slate-700/50" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Activity Log
            </button>
            <button
              id="export-tab-btn"
              onClick={() => setAdminTab('export')}
              className={cn(
                "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all",
                adminTab === 'export' ? "bg-slate-800 text-white shadow-sm border border-slate-700/50" : "text-slate-500 hover:text-slate-300"
              )}
            >
              Export
            </button>
          </div>
        </div>

        {adminTab === 'dataset' && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800/50">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Dialect:</span>
              <select
                value={selectedDialect || ''}
                onChange={(e) => onDialectChange(e.target.value || null)}
                className="bg-transparent text-xs font-black text-amber-400 focus:outline-none cursor-pointer p-1"
              >
                <option value="">All Dialects</option>
                {IJAW_DIALECTS.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800/50">
              {(['all', 'pending', 'verified', 'flagged'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all",
                    filter === f ? "bg-amber-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {adminTab === 'dataset' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {allWords.map((word) => (
            <div key={word.id} className="bg-slate-900/40 border border-slate-800/50 p-5 rounded-xl space-y-3 hover:bg-slate-800/40 transition-colors shadow-sm group">
              <div className="flex justify-between items-start">
                <div className="space-y-0.5">
                  <p className="text-lg font-black text-slate-100 tracking-tight group-hover:text-amber-400 transition-colors">{word.word}</p>
                  <p className="text-[10px] text-amber-400 font-black uppercase tracking-widest">{word.dialect}</p>
                </div>
                <span className={cn(
                  "px-2 py-0.5 text-[8px] font-black uppercase rounded border tracking-tighter",
                  word.status === 'pending' && "border-slate-700/50 text-slate-500 bg-slate-800/30",
                  word.status === 'verified' && "border-emerald-500/30 text-emerald-500 bg-emerald-500/5",
                  word.status === 'flagged' && "border-red-500/30 text-red-500 bg-red-500/5"
                )}>
                  {word.status}
                </span>
              </div>
              <p className="text-sm text-slate-400 line-clamp-2 leading-relaxed">{word.meaning}</p>
            </div>
          ))}
        </div>
      ) : adminTab === 'logs' ? (
        <div className="bg-slate-900/30 border border-slate-800/50 rounded-xl overflow-hidden shadow-xl">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-950 text-slate-500 uppercase text-[10px] font-black tracking-widest border-b border-slate-800/50">
              <tr>
                <th className="px-6 py-5">Timestamp</th>
                <th className="px-6 py-5">User</th>
                <th className="px-6 py-5">Action</th>
                <th className="px-6 py-5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-6 py-4 text-slate-500 font-mono text-xs">
                    {log.timestamp?.toDate().toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-black text-slate-300 tracking-tight">{log.userEmail}</p>
                    <p className="text-[9px] text-slate-600 font-mono group-hover:text-slate-500 transition-colors">{log.userId}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded-lg text-[9px] font-black uppercase tracking-tighter text-slate-400 group-hover:text-amber-400 transition-colors shadow-inner">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-400 font-medium">
                    {log.details}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ExportPanel />
      )}
    </div>
  );
};
