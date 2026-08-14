'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/client';
import { Plus, Trash2, CheckCircle, Dumbbell, History } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ExerciseRecord {
  id: bigint; // bigint primary key from public.exercise
  exercise: {
    name: string;
    sets: number;
    target_min_reps: number;
    target_max_reps: number;
  };
}

interface PastSetInfo {
  set_index: number;
  weight_lb: number;
  reps: number;
}

interface WorkoutSet {
  set_number: number;
  weight: number | '';
  reps: number | '';
prevWeight?: number;
  prevReps?: number;
}

interface WorkoutExercise {
  exercise_id: bigint; // bigint primary key from public.exercise
  name: string;
  sets: WorkoutSet[];
}

export default function LogWorkoutPage() {
  const router = useRouter();
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseRecord[]>([]);
  const [selectedExercises, setSelectedExercises] = useState<WorkoutExercise[]>([]);
  const [isChoosingExercise, setIsChoosingExercise] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkAuthAndFetchExercises();
  }, []);

  async function checkAuthAndFetchExercises() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/login';
      return;
    }

    const { data, error } = await supabase
      .from('exercise')
      .select('*')
      .order('id', { ascending: true });

    if (error) console.error('Error fetching exercises:', error);
    else if (data) setExerciseLibrary(data);
  }

  function updateSet(exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', value: string) {
    const updated = [...selectedExercises];
    const val = value === '' ? '' : Number(value);
    updated[exerciseIndex].sets[setIndex][field] = val;
    setSelectedExercises(updated);
  }

async function addExerciseToWorkout(record: { id: bigint; exercise: { name: string; sets: number } }) {
    const defaultSetsCount = record.exercise.sets || 3;
    const pastSets: PastSetInfo[] | null = await fetchPreviousExercisePerformance(record.id);
const initialSets: WorkoutSet[] = Array.from({ length: defaultSetsCount }, (_, i) => {
      const matchingPastSet = pastSets?.find((ps) => ps.set_index === i);
      return {
        set_number: i + 1,
        weight: '',
        reps: '',
        prevWeight: matchingPastSet ? matchingPastSet.weight_lb : undefined,
        prevReps: matchingPastSet ? matchingPastSet.reps : undefined,
      };
    });

    const newWorkoutExercise: WorkoutExercise = {
      exercise_id: record.id, // bigint primary key from public.exercise
      name: record.exercise.name,
      sets: initialSets,
    };

    setSelectedExercises([...selectedExercises, newWorkoutExercise]);
    setIsChoosingExercise(false);
  }

  function addSetToExercise(exerciseIndex: number) {
    const updated = [...selectedExercises];
    const currentSets = updated[exerciseIndex].sets;
    const lastSet = currentSets[currentSets.length - 1];
currentSets.push({
      set_number: currentSets.length + 1,
      weight: lastSet ? lastSet.weight : '',
      reps: '',
    });
    setSelectedExercises(updated);
  }

  function removeExercise(exerciseIndex: number) {
    setSelectedExercises(selectedExercises.filter((_, i) => i !== exerciseIndex));
  }

  async function fetchPreviousExercisePerformance(exerciseId: bigint) : Promise<PastSetInfo[] | null> {
    const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;

  // Find the most recent workout session exercise for this exercise and user
  const { data: pastExercises, error } = await supabase
    .from('workout_session_exercises')
    .select(`
      id,
      workout_sessions!inner (
        user_id,
        started_at
      )
    `)
    .eq('exercise_id', exerciseId)
    .eq('workout_sessions.user_id', session.user.id)
    .order('workout_sessions(started_at)', { ascending: false })
    .limit(1);

  if (error || !pastExercises || pastExercises.length === 0) {
    return null; // First time doing this exercise
  }
const { data: pastSets } = await supabase
      .from('workout_session_sets')
      .select('set_index, weight_lb, reps')
      .eq('workout_session_exercise_id', pastExercises[0].id)
      .order('set_index', { ascending: true });

    return pastSets || null;// Returns array like [{ set_index: 0, weight_lb: 185, reps: 8 }, ...]
}

 async function handleFinishWorkout() {
    if (selectedExercises.length === 0) {
      alert('Add at least one exercise to your workout!');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    try {
      // 1. Get the current authenticated user
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // 2. Create the main workout session entry
      const { data: sessionData, error: sessionError } = await supabase
        .from('workout_sessions')
        .insert([{ user_id: session.user.id }])
        .select()
        .single();

      if (sessionError) throw sessionError;
      const workoutSessionId = sessionData.id;

      // 3. Loop through exercises and insert them into workout_session_exercises
      for (let i = 0; i < selectedExercises.length; i++) {
        const item = selectedExercises[i];

        const { data: exRecord, error: exError } = await supabase
          .from('workout_session_exercises')
          .insert([{
            workout_session_id: workoutSessionId,
            exercise_id: item.exercise_id, // Must be the bigint ID from public.exercise
            position: i,
          }])
          .select()
          .single();

        if (exError) throw exError;
        const sessionExerciseId = exRecord.id;

        // 4. Loop through sets for this exercise and insert into workout_session_sets
        const setsToInsert = item.sets
          .filter((set) => set.weight !== '' && set.reps !== '')
          .map((set, setIdx) => ({
            workout_session_exercise_id: sessionExerciseId,
            set_index: setIdx,
            weight_lb: Number(set.weight),
            reps: Number(set.reps),
          }));

        if (setsToInsert.length > 0) {

          const { error: setsError } = await supabase
            .from('workout_session_sets')
            .insert(setsToInsert);

          if (setsError) throw setsError;
        }
      }

      alert('Workout saved successfully!');
      router.push('/history');
    } catch (err: any) {
      console.error('Error saving workout session:', err);
      alert('Error saving workout: ' + err.message);
    } finally {
      setLoading(false);
    }
  }


return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">Log Workout</h1>
        {selectedExercises.length > 0 && (
          <button
            onClick={handleFinishWorkout}
            disabled={loading}
            className="flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3.5 py-1.5 rounded-lg text-sm font-medium transition shadow-lg shadow-emerald-950/50"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{loading ? 'Saving...' : 'Finish'}</span>
          </button>
        )}
      </div>

      {selectedExercises.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-800 rounded-2xl p-6 space-y-3">
          <Dumbbell className="w-10 h-10 text-gray-600 mx-auto" />
          <div>
            <h3 className="font-medium text-gray-300">No exercises added yet</h3>
            <p className="text-xs text-gray-500 mt-0.5">Start your session by picking an exercise from your library.</p>
          </div>
          <button
            onClick={() => setIsChoosingExercise(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-medium transition mt-2"
          >
            Add Exercise
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {selectedExercises.map((item, exIndex) => (
            <div key={exIndex} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <h3 className="font-semibold text-emerald-400">{item.name}</h3>
                <button
                  onClick={() => removeExercise(exIndex)}
                  className="text-gray-500 hover:text-red-400 transition"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 font-medium px-1">
                <div className="col-span-2 text-center">SET</div>
                <div className="col-span-5 text-center">PREV / LBS</div>
                <div className="col-span-5 text-center">REPS</div>
              </div>

              <div className="space-y-3">
                {item.sets.map((set, setIndex) => (
                  <div key={setIndex} className="space-y-1">
                    {/* Previous history indicator tag */}
                    {set.prevWeight !== undefined && set.prevReps !== undefined && (
                      <div className="flex items-center space-x-1 text-[10px] text-gray-500 px-1">
                        <History className="w-3 h-3 text-emerald-600" />
                        <span>Last: {set.prevWeight} lbs × {set.prevReps} reps</span>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-2 text-center text-sm font-semibold text-gray-400">
                        {set.set_number}
                      </div>
                      <div className="col-span-5">
                        <input
                          type="number"
                          placeholder={set.prevWeight ? String(set.prevWeight) : '0'}
                          value={set.weight}
                          onChange={(e) => updateSet(exIndex, setIndex, 'weight', e.target.value)}
                          className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 text-center text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="col-span-5">
                        <input
                          type="number"
                          placeholder={set.prevReps ? String(set.prevReps) : '0'}
                          value={set.reps}
                          onChange={(e) => updateSet(exIndex, setIndex, 'reps', e.target.value)}
                          className="w-full bg-gray-950 border border-gray-800 rounded-xl py-2 text-center text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addSetToExercise(exIndex)}
                className="w-full py-1.5 bg-gray-950 hover:bg-gray-800/80 border border-gray-800 rounded-xl text-xs text-gray-400 font-medium transition mt-1"
              >
                + Add Set
              </button>
            </div>
          ))}

          <button
            onClick={() => setIsChoosingExercise(true)}
            className="w-full py-3 bg-gray-900 hover:bg-gray-850 border border-dashed border-gray-800 rounded-2xl text-sm font-medium text-emerald-400 flex items-center justify-center space-x-1 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Another Exercise</span>
          </button>
        </div>
      )}

      {/* Exercise Picker Modal */}
      {isChoosingExercise && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-xl max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-bold">Select Exercise</h2>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {exerciseLibrary.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-8">No exercises found in your library yet.</p>
              ) : (
                exerciseLibrary.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addExerciseToWorkout(item)}
                    className="w-full text-left bg-gray-950 hover:bg-gray-850 border border-gray-800 p-3 rounded-xl transition flex justify-between items-center"
                  >
                    <div>
                      <h4 className="font-medium text-gray-200 text-sm">{item.exercise.name}</h4>
                      {/* <p className="text-xs text-gray-500 mt-0.5">{item.exercise.muscle_groups?.join(', ')}</p> */}
                    </div>
                    <Plus className="w-4 h-4 text-emerald-500" />
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => setIsChoosingExercise(false)}
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl text-sm font-medium transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}