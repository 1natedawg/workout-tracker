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
    
    <div className="space-y-3">
      {session.exercises.map((ex: any) => (
        <div key={ex.id} className="flex justify-between items-center py-1">
  <span className="ex-name">{ex.exercise?.exercise?.name}</span>
  <div className="flex space-x-1.5">
    {ex.workout_session_sets?.map((set: any, sIdx: number) => (
      <span key={sIdx} className="gold-badge">
        {set.weight_lb}x{set.reps}
      </span>
    ))}
  </div>
</div>
      ))}
    </div>
  </div>
))}
    </div>
  );
}