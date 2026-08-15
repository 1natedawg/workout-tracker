'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/client';
import { Trophy, TrendingUp, Dumbbell, Calendar } from 'lucide-react';

interface ExercisePR {
  exerciseName: string;
  maxWeight: number;
  maxRepsAtMaxWeight: number;
  estimated1RM: number;
  lastPerformed: string;
}

export default function StatsPage() {
  const [prs, setPrs] = useState<ExercisePR[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPersonalRecords();
  }, []);

  async function fetchPersonalRecords() {
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/login';
      return;
    }

    // 1. Fetch all logged sets joined with exercise names and session dates
    const { data: setsData, error } = await supabase
      .from('workout_session_sets')
      .select(`
        weight_lb,
        reps,
        workout_session_exercises:workout_session_exercise_id (
          exercise:exercise_id (
            exercise
          ),
          workout_sessions:workout_session_id ( started_at, user_id )
        )
      `);

    if (error) {
      console.error('Error fetching stats data:', error);
      setLoading(false);
      return;
    }

    // 2. Filter for current user and aggregate PRs per exercise
    const exerciseMap: { [name: string]: { maxWeight: number; maxReps: number; est1RM: number; lastDate: string } } = {};

    setsData?.forEach((item: any) => {
      const sessionInfo = item.workout_session_exercises?.workout_sessions;
      if (!sessionInfo || sessionInfo.user_id !== session.user.id) return;

      const exerciseName = item.workout_session_exercises?.exercise?.exercise?.name;
      if (!exerciseName) return;

      const weight = item.weight_lb || 0;
      const reps = item.reps || 0;
      const date = sessionInfo.started_at;

      // Calculate Epley formula for estimated 1 Rep Max: weight * (1 + reps / 30)
      const est1RM = reps > 0 ? Math.round(weight * (1 + reps / 30)) : weight;

      if (!exerciseMap[exerciseName]) {
        exerciseMap[exerciseName] = { maxWeight: weight, maxReps: reps, est1RM, lastDate: date };
      } else {
        const current = exerciseMap[exerciseName];
        // Track highest weight, or higher estimated 1RM if weight is equal
        if (weight > current.maxWeight || (weight === current.maxWeight && est1RM > current.est1RM)) {
          current.maxWeight = weight;
          current.maxReps = reps;
        }
        if (est1RM > current.est1RM) {
          current.est1RM = est1RM;
        }
        if (new Date(date) > new Date(current.lastDate)) {
          current.lastDate = date;
        }
      }
    });

    const formattedPRs: ExercisePR[] = Object.keys(exerciseMap).map((name) => ({
      exerciseName: name,
      maxWeight: exerciseMap[name].maxWeight,
      maxRepsAtMaxWeight: exerciseMap[name].maxReps,
      estimated1RM: exerciseMap[name].est1RM,
      lastPerformed: new Date(exerciseMap[name].lastDate).toLocaleDateString(),
    }));

    // Sort by heaviest estimated 1RM descending
    formattedPRs.sort((a, b) => b.estimated1RM - a.estimated1RM);

    setPrs(formattedPRs);
    setLoading(false);
  }

  return (
    <div className="space-y-6 pb-12">
      <div className="flex items-center space-x-2">
        <Trophy className="w-6 h-6 text-emerald-500" />
        <h1 className="text-2xl font-bold tracking-tight">Personal Records & Stats</h1>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Calculating achievements...</div>
      ) : prs.length === 0 ? (
        <div className="gold-card rounded-2xl p-8 text-center space-y-2">
          <Dumbbell className="w-8 h-8 text-gray-600 mx-auto" />
          <h3 className="font-semibold text-gray-300">No stats yet</h3>
          <p className="text-xs text-gray-500">Log some workouts to see your maximum weights and estimated 1RMs here!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {prs.map((pr, idx) => (
            <div key={idx} className="gold-card rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-start">
                <h3 className="font-semibold text-amber-400 text-base">{pr.exerciseName}</h3>
                <span className="text-[10px] gold-badge px-2 py-0.5 rounded-full font-medium">
                  Est. 1RM: {pr.estimated1RM} lbs
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-800 text-xs">
                <div className="bg-gray-950 border border-gray-800 p-2.5 rounded-xl space-y-0.5">
                  <span className="text-gray-500 block text-[10px]">Max Weight Lifted</span>
                  <span className="font-bold text-gray-200 text-sm">{pr.maxWeight} lbs</span>
                  <span className="text-gray-500 block text-[10px]">({pr.maxRepsAtMaxWeight} reps)</span>
                </div>

                <div className="bg-gray-950 border border-gray-800 p-2.5 rounded-xl space-y-0.5">
                  <span className="text-gray-500 block text-[10px]">Last Performed</span>
                  <span className="font-medium text-gray-300 text-sm flex items-center space-x-1 pt-1">
                    <Calendar className="w-3.5 h-3.5 text-gray-500" />
                    <span>{pr.lastPerformed}</span>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}