'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/client';
import { Plus, Trash2, CheckCircle, Dumbbell, History, Calendar, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface ExerciseRecord {
  id: number;
  exercise: {
    name: string;
    sets: number;
  };
}

interface Routine {
  id: string;
  name: string;
  workout_exercises: {
    exercise_id: number;
    exercise: { name: string; sets: number };
  }[];
}

interface WorkoutPlan {
  id: string;
  name: string;
  workout_plan_days: {
    day_of_week: number;
    workouts: Routine | null;
  }[];
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
  exercise_id: number;
  name: string;
  sets: WorkoutSet[];
}

export default function LogWorkoutPage() {
  const router = useRouter();
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseRecord[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [todaysScheduledRoutine, setTodaysScheduledRoutine] = useState<Routine | null>(null);
  
  const [selectedExercises, setSelectedExercises] = useState<WorkoutExercise[]>([]);
  const [isChoosingExercise, setIsChoosingExercise] = useState(false);
  const [isChoosingRoutine, setIsChoosingRoutine] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    initLogPage();
  }, []);

  async function initLogPage() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/login';
      return;
    }

    // 1. Fetch complete exercise library
    const { data: exData } = await supabase.from('exercise').select('*').order('id', { ascending: false });
    if (exData) setExerciseLibrary(exData);

    // 2. Fetch routines with their associated exercises[cite: 1]
    const { data: routineData } = await supabase
      .from('workouts')
      .select(`
        id,
        name,
        workout_exercises (
          exercise_id,
          exercise:exercise_id ( exercise ->> 'name' as name, exercise ->> 'target_sets' as sets )
        )
      `)
      .eq('user_id', session.user.id);

    if (routineData) {
      const formattedRoutines = routineData.map((r: any) => ({
        ...r,
        workout_exercises: r.workout_exercises.map((we: any) => ({
          ...we,
          exercise: we.exercise?.exercise || we.exercise
        }))
      }));
      setRoutines(formattedRoutines);

      // 3. Detect today's day of the week (0 = Sunday, 6 = Saturday)
      const currentDayOfWeek = new Date().getDay();

      // 4. Check user's workout plans for today's scheduled workout[cite: 1]
      const { data: planData } = await supabase
        .from('workout_plans')
        .select(`
          id,
          workout_plan_days!inner (
            day_of_week,
            workouts (
              id,
              name,
              workout_exercises (
                exercise_id,
                exercise:exercise_id ( name, target_sets )
              )
            )
          )
        `)
        .eq('user_id', session.user.id)
        .eq('workout_plan_days.day_of_week', currentDayOfWeek)
        .limit(1);

      if (planData && planData.length > 0 && planData[0].workout_plan_days?.[0]?.workouts) {
        const scheduled = planData[0].workout_plan_days[0].workouts as any;
        const formattedScheduled = {
          ...scheduled,
          workout_exercises: scheduled.workout_exercises.map((we: any) => ({
            ...we,
            exercise: we.exercise?.exercise || we.exercise
          }))
        };
        setTodaysScheduledRoutine(formattedScheduled);
      }
    }
  }

  async function fetchPreviousExercisePerformance(exerciseId: number): Promise<PastSetInfo[] | null> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const { data: pastExercises } = await supabase
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

    if (!pastExercises || pastExercises.length === 0) return null;

    const { data: pastSets } = await supabase
      .from('workout_session_sets')
      .select('set_index, weight_lb, reps')
      .eq('workout_session_exercise_id', pastExercises[0].id)
      .order('set_index', { ascending: true });

    return pastSets || null;
  }

  async function loadRoutineIntoWorkout(routine: Routine) {
    const newWorkoutExercises: WorkoutExercise[] = [];

    for (const item of routine.workout_exercises) {
      const exerciseId = item.exercise_id;
      const exerciseName = item.exercise?.name || 'Exercise';
      const defaultSetsCount = item.exercise?.sets || 3;

      const pastSets = await fetchPreviousExercisePerformance(exerciseId);

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

      newWorkoutExercises.push({
        exercise_id: exerciseId,
        name: exerciseName,
        sets: initialSets,
      });
    }

    setSelectedExercises(newWorkoutExercises);
    setIsChoosingRoutine(false);
  }

  async function addExerciseToWorkout(record: ExerciseRecord) {
    const defaultSetsCount = record.exercise.sets || 3;
    const pastSets = await fetchPreviousExercisePerformance(record.id);

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

    setSelectedExercises([
      ...selectedExercises,
      {
        exercise_id: record.id,
        name: record.exercise.name,
        sets: initialSets,
      },
    ]);
    setIsChoosingExercise(false);
  }

  function updateSet(exerciseIndex: number, setIndex: number, field: 'weight' | 'reps', value: string) {
    const updated = [...selectedExercises];
    const val = value === '' ? '' : Number(value);
    updated[exerciseIndex].sets[setIndex][field] = val;
    setSelectedExercises(updated);
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

  async function handleFinishWorkout() {
    if (selectedExercises.length === 0) {
      alert('Add at least one exercise to your workout!');
      return;
    }

    setLoading(true);

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const { data: sessionData, error: sessionError } = await supabase
        .from('workout_sessions')
        .insert([{ user_id: session.user.id }])
        .select()
        .single();

      if (sessionError) throw sessionError;
      const workoutSessionId = sessionData.id;

      for (let i = 0; i < selectedExercises.length; i++) {
        const item = selectedExercises[i];

        const { data: exRecord, error: exError } = await supabase
          .from('workout_session_exercises')
          .insert([{
            workout_session_id: workoutSessionId,
            exercise_id: item.exercise_id,
            position: i,
          }])
          .select()
          .single();

        if (exError) throw exError;

        const setsToInsert = item.sets
          .filter((set) => set.weight !== '' && set.reps !== '')
          .map((set, setIdx) => ({
            workout_session_exercise_id: exRecord.id,
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
      console.error('Error saving workout:', err);
      alert('Error saving workout: ' + err.message);
    } finally {
      setLoading(false);
    }
  }

  const todayName = new Date().toLocaleDateString(undefined, { weekday: 'long' });

  return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Log Workout</h1>
          <p className="text-xs text-gray-400 flex items-center space-x-1 mt-0.5">
            <Calendar className="w-3 h-3 text-emerald-500" />
            <span>Happy {todayName}!</span>
          </p>
        </div>
        {selectedExercises.length > 0 && (
          <button
            onClick={handleFinishWorkout}
            disabled={loading}
            className="flex items-center space-x-1 gold-btn text-white px-3.5 py-1.5 rounded-lg text-sm font-medium transition shadow-lg shadow-emerald-950/50"
          >
            <CheckCircle className="w-4 h-4" />
            <span>{loading ? 'Saving...' : 'Finish'}</span>
          </button>
        )}
      </div>

      {selectedExercises.length === 0 ? (
        <div className="space-y-4">
          {/* 1. Day-of-Week Smart Recommendation Card */}
          {todaysScheduledRoutine ? (
            <div className="bg-gradient-to-br from-emerald-950/40 to-gray-900 border border-emerald-500/40 rounded-2xl p-5 space-y-3 shadow-lg">
              <div className="flex items-center space-x-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                <Play className="w-3.5 h-3.5 fill-emerald-400" />
                <span>Scheduled For Today</span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{todaysScheduledRoutine.name}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {todaysScheduledRoutine.workout_exercises?.length || 0} exercises planned
                </p>
              </div>
              <button
                onClick={() => loadRoutineIntoWorkout(todaysScheduledRoutine)}
                className="w-full gold-btn text-white py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center space-x-1.5 shadow-md"
              >
                <Play className="w-4 h-4 fill-white" />
                <span>Start Scheduled Workout</span>
              </button>
            </div>
          ) : (
            <div className="gold-card rounded-2xl p-4 text-center text-xs text-gray-500">
              No specific workout routine scheduled for {todayName} in your active plan.
            </div>
          )}

          {/* 2. Alternative Actions: Choose Routine or Ad-hoc Add */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setIsChoosingRoutine(true)}
              className="bg-gray-900 hover:bg-gray-850 border border-gray-800 p-4 rounded-2xl text-left space-y-1 transition group"
            >
              <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-amber-400 group-hover:bg-emerald-950 transition">
                <Dumbbell className="w-4 h-4" />
              </div>
              <div className="font-semibold text-sm text-gray-200 pt-1">Choose Routine</div>
              <p className="text-[11px] text-gray-500">Pick from any saved routine</p>
            </button>

            <button
              onClick={() => setIsChoosingExercise(true)}
              className="bg-gray-900 hover:bg-gray-850 border border-gray-800 p-4 rounded-2xl text-left space-y-1 transition group"
            >
              <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-amber-400 group-hover:bg-emerald-950 transition">
                <Plus className="w-4 h-4" />
              </div>
              <div className="font-semibold text-sm text-gray-200 pt-1">Ad-hoc Add</div>
              <p className="text-[11px] text-gray-500">Build workout as you go</p>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {selectedExercises.map((item, exIndex) => (
            <div key={exIndex} className="gold-card rounded-2xl p-4 space-y-3">
              <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                <h3 className="font-semibold text-amber-400">{item.name}</h3>
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
                    {set.prevWeight !== undefined && set.prevReps !== undefined && (
                      <div className="flex items-center space-x-1 text-[15px] text-gray-500 px-1">
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
            className="w-full py-3 bg-gray-900 hover:bg-gray-850 border border-dashed border-gray-800 rounded-2xl text-sm font-medium text-amber-400 flex items-center justify-center space-x-1 transition"
          >
            <Plus className="w-4 h-4" />
            <span>Add Another Exercise</span>
          </button>
        </div>
      )}

      {/* Routine Picker Modal */}
      {isChoosingRoutine && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="gold-card w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-xl max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-bold">Select Routine</h2>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {routines.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-8">No routines found. Create one in the Routines tab!</p>
              ) : (
                routines.map((routine) => (
                  <button
                    key={routine.id}
                    onClick={() => loadRoutineIntoWorkout(routine)}
                    className="w-full text-left bg-gray-950 hover:bg-gray-850 border border-gray-800 p-3 rounded-xl transition flex justify-between items-center"
                  >
                    <div>
                      <h4 className="font-medium text-gray-200 text-sm">{routine.name}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{routine.workout_exercises?.length || 0} exercises</p>
                    </div>
                    <Play className="w-4 h-4 text-emerald-500 fill-emerald-500" />
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => setIsChoosingRoutine(false)}
              className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl text-sm font-medium transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Exercise Picker Modal (Ad-hoc) */}
      {isChoosingExercise && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="gold-card w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-xl max-h-[80vh] flex flex-col">
            <h2 className="text-lg font-bold">Select Exercise</h2>
            
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {exerciseLibrary.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-8">No exercises found in library.</p>
              ) : (
                exerciseLibrary.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addExerciseToWorkout(item)}
                    className="w-full text-left bg-gray-950 hover:bg-gray-850 border border-gray-800 p-3 rounded-xl transition flex justify-between items-center"
                  >
                    <div>
                      <h4 className="font-medium text-gray-200 text-sm">{item.exercise.name}</h4>
                      <p className="text-xs text-gray-500 mt-0.5">{item.exercise.sets} default sets</p>
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