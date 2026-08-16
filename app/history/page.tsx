'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/client';

export default function HistoryPage() {
  const [sessions, setSessions] = useState<any[]>([]);

  useEffect(() => {
    fetchGroupedSessions();
  }, []);

  async function fetchGroupedSessions() {
    const supabase = createClient();
    const { data } = await supabase
      .from('workout_sessions')
      .select(`
        id,
        started_at,
        workout_session_exercises (
          id,
          exercise:exercise_id (
              exercise
            ),
          workout_session_sets ( weight_lb, reps, set_index )
        )
      `)
      .order('started_at', { ascending: false });

    if (data) {
      // Group by Date string
      const grouped = data.reduce((acc: any, session: any) => {
        const dateKey = new Date(session.started_at).toLocaleDateString(undefined, {
          month: 'short', day: 'numeric', year: 'numeric'
        });

        if (!acc[dateKey]) {
          acc[dateKey] = {
            date: dateKey,
            exercises: []
          };
        }

        // Merge exercises from this session record into the date's list
        if (session.workout_session_exercises) {
          acc[dateKey].exercises.push(...session.workout_session_exercises);
        }
        
        return acc;
      }, {});

      // Convert object back to array for the UI
      setSessions(Object.values(grouped));
    }
  }

  return (
    <div className="space-y-6 pb-32 px-4 pt-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold">History</h1>
      
      {sessions.map((session, idx) => (
        <div key={idx} className="gold-card p-4 space-y-4">
          <div className="text-sm font-semibold text-amber-500 border-b border-white/5 pb-2">
            {session.date}
          </div>
          
          <div className="space-y-4">
            {session.exercises.map((ex: any) => {
              // Sort sets by set_index to ensure they render in proper 1, 2, 3, 4 order
              const sortedSets = (ex.workout_session_sets || []).sort(
                (a: any, b: any) => a.set_index - b.set_index
              );

              return (
                <div key={ex.id} className="space-y-1.5 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                  <span className="ex-name font-medium text-stone-200 block text-xs tracking-wide">
                    {ex.exercise?.exercise?.name}
                  </span>
                  
                  {/* --- SETS WRAPPING GRID (Always 3-wide max per row) --- */}
                  <div className="grid grid-cols-3 gap-1.5">
                    {sortedSets.map((set: any, sIdx: number) => (
                      <div key={sIdx} className="gold-badge text-center py-1 px-1.5 rounded-lg flex items-center justify-center space-x-1 text-xs">
                        <span className="text-stone-400 text-[10px]">#{set.set_index + 1}</span>
                        <span className="font-semibold text-amber-300">{set.weight_lb}×{set.reps}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}