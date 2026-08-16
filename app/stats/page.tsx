'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/client';
import { Trophy, TrendingUp, Dumbbell, Calendar } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface ExerciseHistoryItem {
  date: string;
  weight: number;
  reps: number;
  estimated1RM: number;
}

interface ExercisePR {
  exerciseName: string;
  maxWeight: number;
  maxRepsAtMaxWeight: number;
  estimated1RM: number;
  lastPerformed: string;
  history: ExerciseHistoryItem[]; // <-- Added here
}

export default function StatsPage() {
  const [prs, setPrs] = useState<ExercisePR[]>([]);
  const [loading, setLoading] = useState(true);
// Inside your Stats component
const [searchQuery, setSearchQuery] = useState('');
// 1. State for the modal
const [selectedExerciseForAnalysis, setSelectedExerciseForAnalysis] = useState<any | null>(null);

  // 2. Helper function to open the analysis modal
  function openAnalysis(pr: any) {
    console.log("Selected Exercise Data:", pr);
    setSelectedExerciseForAnalysis(pr);
  }
// Filter PRs based on the search input
const filteredPrs = prs.filter((pr) =>
  pr.exerciseName.toLowerCase().includes(searchQuery.toLowerCase())
);
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

    // 2. Aggregate history and metrics per exercise
    const exerciseMap: { [name: string]: { history: { date: string; weight: number; reps: number; est1RM: number; rawDate: string }[] } } = {};

    setsData?.forEach((item: any) => {
      const sessionInfo = item.workout_session_exercises?.workout_sessions;
      if (!sessionInfo || sessionInfo.user_id !== session.user.id) return;

      const exerciseName = item.workout_session_exercises?.exercise?.exercise?.name;
      if (!exerciseName) return;

      const weight = item.weight_lb || 0;
      const reps = item.reps || 0;
      const date = sessionInfo.started_at;

      const est1RM = reps > 0 ? Math.round(weight * (1 + reps / 30)) : weight;

      if (!exerciseMap[exerciseName]) {
        exerciseMap[exerciseName] = { history: [] };
      }

      exerciseMap[exerciseName].history.push({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        weight,
        reps,
        est1RM,
        rawDate: date // Used for sorting chronological history
      });
    });

    const formattedPRs: ExercisePR[] = Object.keys(exerciseMap).map((name) => {
      const hist = exerciseMap[name].history;

      // Sort history chronologically from oldest to newest for the line chart
      hist.sort((a, b) => new Date(a.rawDate).getTime() - new Date(b.rawDate).getTime());

      // Find max weight and corresponding reps
      let maxWeight = 0;
      let maxRepsAtMaxWeight = 0;
      let maxEst1RM = 0;

      hist.forEach((h) => {
        if (h.weight > maxWeight) {
          maxWeight = h.weight;
          maxRepsAtMaxWeight = h.reps;
        } else if (h.weight === maxWeight && h.reps > maxRepsAtMaxWeight) {
          maxRepsAtMaxWeight = h.reps;
        }
        if (h.est1RM > maxEst1RM) {
          maxEst1RM = h.est1RM;
        }
      });

      const lastRecord = hist[hist.length - 1];

      return {
        exerciseName: name,
        maxWeight,
        maxRepsAtMaxWeight,
        estimated1RM: maxEst1RM,
        lastPerformed: lastRecord ? lastRecord.date : 'N/A',
        history: hist.map(h => ({
          date: h.date,
          weight: h.weight,
          reps: h.reps,
          estimated1RM: h.est1RM
        }))
      };
    });

    // Sort alphabetically by exercise name
    formattedPRs.sort((a, b) =>
      a.exerciseName.localeCompare(b.exerciseName, undefined, { sensitivity: 'base' })
    );

    setPrs(formattedPRs);
    setLoading(false);
  }

return (
  <div className="space-y-6 pb-12">
    <div className="flex items-center space-x-2">
      <Trophy className="w-6 h-6 text-emerald-500" />
      <h1 className="text-2xl font-bold tracking-tight">Personal Records & Stats</h1>
    </div>

    {/* --- SEARCH / FILTER INPUT --- */}
    {!loading && prs.length > 0 && (
      <div className="relative">
        <input
          type="text"
          placeholder="Filter exercises (e.g., Bench Press, RDL)..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-neutral-900 border border-white/10 rounded-xl py-2.5 px-4 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:border-amber-500 transition"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 hover:text-stone-200 bg-neutral-800 px-2 py-1 rounded-lg"
          >
            Clear
          </button>
        )}
      </div>
    )}

    {loading ? (
      <div className="text-center py-12 text-stone-500 text-sm">Calculating achievements...</div>
    ) : prs.length === 0 ? (
      <div className="gold-card rounded-2xl p-8 text-center space-y-2">
        <Dumbbell className="w-8 h-8 text-stone-600 mx-auto" />
        <h3 className="font-semibold text-stone-300">No stats yet</h3>
        <p className="text-xs text-stone-500">Log some workouts to see your maximum weights and estimated 1RMs here!</p>
      </div>
    ) : filteredPrs.length === 0 ? (
      <div className="gold-card rounded-2xl p-8 text-center space-y-2">
        <p className="text-xs text-stone-400">No exercises found matching "{searchQuery}".</p>
      </div>
    ) : (
      <div className="space-y-4">
        {filteredPrs.map((pr, idx) => (
          <div 
            key={idx} 
            onClick={() => openAnalysis(pr)} 
            className="gold-card rounded-2xl p-4 sm:p-5 space-y-4 w-full cursor-pointer hover:border-amber-500/50 transition group"
          >
            <div className="flex justify-between items-center text-[10px] text-stone-500 group-hover:text-amber-400 transition">
              <span>Tap for progression charts & history</span>
              <span>→</span>
            </div>
            
            {/* Exercise Name & Est. 1RM Badge */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-white/5 pb-3">
              <h3 className="font-bold text-amber-400 text-base">{pr.exerciseName}</h3>
              <span className="text-xs gold-badge px-3 py-1 rounded-full font-semibold self-start sm:self-auto">
                Est. 1RM: {pr.estimated1RM} lbs
              </span>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              
              {/* Max Weight */}
              <div className="bg-black/40 border border-white/5 p-3 rounded-xl space-y-1">
                <span className="text-stone-500 block text-[11px] uppercase tracking-wider font-medium">Max Weight Lifted</span>
                <div className="flex items-baseline space-x-1.5 pt-0.5">
                  <span className="font-bold text-stone-100 text-sm sm:text-base">{pr.maxWeight} lbs</span>
                  <span className="text-stone-400 text-xs">({pr.maxRepsAtMaxWeight} reps)</span>
                </div>
              </div>

              {/* Last Performed */}
              <div className="bg-black/40 border border-white/5 p-3 rounded-xl space-y-1">
                <span className="text-stone-500 block text-[11px] uppercase tracking-wider font-medium">Last Performed</span>
                <div className="flex items-center space-x-1.5 pt-1 text-stone-200 font-medium">
                  <Calendar className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span className="text-sm">{pr.lastPerformed}</span>
                </div>
              </div>

            </div>
          </div>
        ))}
      </div>
    )}

    {/* --- EXERCISE ANALYSIS MODAL --- */}
    {selectedExerciseForAnalysis && (
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
        <div className="gold-card w-full max-w-lg rounded-3xl p-6 space-y-6 shadow-2xl max-h-[90vh] flex flex-col border border-amber-500/30">
          
          {/* Modal Header */}
          <div className="flex justify-between items-start border-b border-white/10 pb-4">
            <div>
              <span className="text-xs uppercase tracking-wider text-amber-400 font-semibold">Exercise Analysis</span>
              <h2 className="text-xl font-bold text-white mt-0.5">{selectedExerciseForAnalysis.exerciseName}</h2>
            </div>
            <button
              onClick={() => setSelectedExerciseForAnalysis(null)}
              className="bg-neutral-800 hover:bg-neutral-700 text-stone-300 w-8 h-8 rounded-full flex items-center justify-center transition text-sm font-bold"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-6 pr-1">
            
            {/* Quick Highlights Row */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-black/40 border border-white/5 p-3 rounded-2xl text-center">
                <span className="text-[10px] text-stone-500 block uppercase font-medium">Peak 1RM</span>
                <span className="text-base font-bold text-amber-400">{selectedExerciseForAnalysis.estimated1RM} lbs</span>
              </div>
              <div className="bg-black/40 border border-white/5 p-3 rounded-2xl text-center">
                <span className="text-[10px] text-stone-500 block uppercase font-medium">Max Weight</span>
                <span className="text-base font-bold text-stone-100">{selectedExerciseForAnalysis.maxWeight} lbs</span>
              </div>
              <div className="bg-black/40 border border-white/5 p-3 rounded-2xl text-center">
                <span className="text-[10px] text-stone-500 block uppercase font-medium">Total Sessions</span>
                <span className="text-base font-bold text-emerald-400">{selectedExerciseForAnalysis.history?.length || 1}</span>
              </div>
            </div>

            {/* Estimated 1RM Progression Chart */}
            <div className="bg-black/50 border border-white/5 p-4 rounded-2xl space-y-3">
              <div className="flex justify-between items-center">
                <h4 className="text-xs font-semibold text-stone-300 uppercase tracking-wider">Estimated 1RM Over Time</h4>
                <span className="text-[10px] text-stone-500">lbs</span>
              </div>
              
              <div className="h-48 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedExerciseForAnalysis.history || []}>
                    <XAxis dataKey="date" stroke="#78716c" fontSize={10} tickLine={false} />
                    <YAxis stroke="#78716c" fontSize={10} tickLine={false} domain={['auto', 'auto']} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#171717', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                      itemStyle={{ color: '#fbbf24' }}
                    />
                    <Line type="monotone" dataKey="estimated1RM" stroke="#fbbf24" strokeWidth={2.5} dot={{ fill: '#fbbf24', r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Historical Session Log Table */}
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-stone-300 uppercase tracking-wider">Past Performance History</h4>
              <div className="space-y-2">
                {(selectedExerciseForAnalysis.history || []).map((session: any, sIdx: number) => (
                  <div key={sIdx} className="bg-neutral-900/80 border border-white/5 p-3 rounded-xl flex justify-between items-center text-xs">
                    <span className="text-stone-400 font-medium">{session.date}</span>
                    <div className="space-x-2">
                      <span className="gold-badge">{session.weight} lbs × {session.reps} reps</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    )}
  </div>
);
}