'use client';

import { useState } from 'react';
import { createClient } from '@/utils/client';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';

export default function ImportPage() {
  const [rawData, setRawData] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Function to parse tab-separated data (pasted directly from Google Sheets)
  async function handleImport() {
    if (!rawData.trim()) {
      alert('Please paste your sheet data first.');
      return;
    }

    setLoading(true);
    setLogs(['Starting import process...']);
    const supabase = createClient();
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      alert('You must be logged in.');
      setLoading(false);
      return;
    }
    const userId = session.user.id;

    // 1. Fetch existing exercises to map names to IDs
    const { data: exerciseLibrary } = await supabase.from('exercise').select('id, exercise');
    const exerciseMap = new Map<string, number>();
    exerciseLibrary?.forEach((item: any) => {
      // Handle structure variation based on your exercise table layout
      const name = item.exercise?.name || item.name || item.exercise;
      if (name) exerciseMap.set(name.toLowerCase().trim(), item.id);
    });

    // 2. Parse text lines (tab-delimited from Google Sheets copy-paste)
    const lines = rawData.trim().split('\n');
    if (lines.length <= 1) {
      setLogs((prev) => [...prev, 'Error: No data rows found or missing header.']);
      setLoading(false);
      return;
    }

    // Skip header row (index 0)
    let successCount = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.split('\t').map((c) => c.trim());
      
      if (cols.length < 9) continue;

      const [dateStr, routineName, exerciseName, w1, w2, w3, r1, r2, r3] = cols;

      if (!exerciseName || !dateStr) continue;

      const exId = exerciseMap.get(exerciseName.toLowerCase().trim());
      if (!exId) {
        setLogs((prev) => [...prev, `Row ${i}: Exercise "${exerciseName}" not found in database library. Skipped.`]);
        continue;
      }

      try {
        // A. Create workout session for this date
        // Note: converting string date (e.g., '2026-05-01') to ISO timestamp
        const sessionDate = new Date(dateStr).toISOString();
        
        const { data: sessionData, error: sError } = await supabase
          .from('workout_sessions')
          .insert([{ user_id: userId, started_at: sessionDate }])
          .select()
          .single();

        if (sError) throw sError;

        // B. Create workout session exercise record
        const { data: seData, error: seError } = await supabase
          .from('workout_session_exercises')
          .insert([{
            workout_session_id: sessionData.id,
            exercise_id: exId,
            position: 0,
          }])
          .select()
          .single();

        if (seError) throw seError;

        // C. Build sets array from horizontal columns
        const setsToInsert = [];
        const weights = [w1, w2, w3];
        const reps = [r1, r2, r3];

        for (let s = 0; s < 3; s++) {
          const weightNum = Number(weights[s]);
          const repsNum = Number(reps[s]);

          if (!isNaN(weightNum) && !isNaN(repsNum) && weightNum > 0 && repsNum > 0) {
            setsToInsert.push({
              workout_session_exercise_id: seData.id,
              set_index: s,
              weight_lb: weightNum,
              reps: repsNum,
            });
          }
        }

        if (setsToInsert.length > 0) {
          const { error: setErr } = await supabase.from('workout_session_sets').insert(setsToInsert);
          if (setErr) throw setErr;
        }

        successCount++;
      } catch (err: any) {
        setLogs((prev) => [...prev, `Row ${i} Error: ${err.message}`]);
      }
    }

    setLogs((prev) => [...prev, `Import complete! Successfully imported ${successCount} entries.`]);
    setLoading(false);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div className="flex items-center space-x-2">
        <Upload className="w-6 h-6 text-amber-500" />
        <h1 className="text-2xl font-bold tracking-tight">Import Old Workout Data</h1>
      </div>

      <div className="gold-card p-5 space-y-4">
        <p className="text-xs text-stone-400">
          In your Google Sheet, select your rows including the header: <code className="text-amber-400">date | routine | exercise | set1 weight | set2 weight | set3 weight | set1 reps | set2 reps | set3 reps</code>, copy them, and paste them directly into the text box below.
        </p>

        <textarea
          rows={10}
          placeholder="Paste sheet data here..."
          value={rawData}
          onChange={(e) => setRawData(e.target.value)}
          className="w-full bg-black/50 border border-white/10 rounded-xl p-3 text-xs font-mono text-stone-200 focus:outline-none focus:border-amber-500"
        />

        <button
          onClick={handleImport}
          disabled={loading}
          className="gold-btn w-full py-2.5 rounded-xl text-sm flex items-center justify-center space-x-2"
        >
          <span>{loading ? 'Processing Import...' : 'Run Import'}</span>
        </button>
      </div>

      {logs.length > 0 && (
        <div className="gold-card p-4 space-y-2 max-h-60 overflow-y-auto">
          <h3 className="font-semibold text-xs text-stone-300">Import Logs:</h3>
          <div className="space-y-1 font-mono text-[11px] text-stone-400">
            {logs.map((log, index) => (
              <div key={index}>{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}