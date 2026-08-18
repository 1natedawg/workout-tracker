'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/client';
import { Plus, Layers, Dumbbell, Trash2, Calendar, X, Check, Edit3, Moon } from 'lucide-react';

interface ExerciseItem {
  id: number;
  exercise: { name: string };
}

interface RoutineExercise {
  id: string;
  exercise_id: number;
  position: number;
  exercise: { name: string };
}

interface Routine {
  id: string;
  name: string;
  workout_exercises?: RoutineExercise[];
}

interface WorkoutPlan {
  id: string;
  name: string;
  workout_plan_days: {
    id: string;
    day_of_week: number;
    workout_id: string | null;
    workouts: { name: string } | null;
  }[];
}
const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function PlansAndRoutinesPage() {
const [activeTab, setActiveTab] = useState<'routines' | 'plans'>('routines');
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [plans, setPlans] = useState<WorkoutPlan[]>([]);
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Creation Modals
  const [isRoutineModalOpen, setIsRoutineModalOpen] = useState(false);
  const [routineName, setRoutineName] = useState('');
  const [selectedRoutineExercises, setSelectedRoutineExercises] = useState<number[]>([]);
  
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planDays, setPlanDays] = useState<{ [day: number]: string | null }>({
    0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null
  });

// Editing Modals State
  const [editingRoutine, setEditingRoutine] = useState<Routine | null>(null);
  const [editRoutineName, setEditRoutineName] = useState('');
  const [editRoutineExercises, setEditRoutineExercises] = useState<number[]>([]);

  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [editPlanName, setEditPlanName] = useState('');
  const [editPlanDays, setEditPlanDays] = useState<{ [day: number]: string | null }>({});

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/login';
      return;
    }
// 1. Fetch routines with their associated exercises[cite: 1]
    const { data: routineData } = await supabase
      .from('workouts')
      .select(`
        id,
        name,
        workout_exercises (
          id,
          exercise_id,
          position,
          exercise:exercise_id ( exercise ->> 'name' as name )
        )
      `)
      .eq('user_id', session.user.id)
      .order('name', { ascending: true });
    
    if (routineData) {
      // Flatten joined nested structure safely
      const formattedRoutines = routineData.map((r: any) => ({
        ...r,
        workout_exercises: r.workout_exercises.map((we: any) => ({
          ...we,
          exercise: we.exercise?.exercise || we.exercise // handle structure variation
        }))
      }));
      setRoutines(formattedRoutines);
    }

    // 2. Fetch workout plans and their 7 days via join[cite: 1]
    const { data: planData } = await supabase
      .from('workout_plans')
      .select(`
        id,
        name,
        workout_plan_days (
          id,
          day_of_week,
          workout_id,
          workouts:workout_id ( name )
        )
      `)
      .eq('user_id', session.user.id);
    
    if (planData) setPlans(planData as unknown as WorkoutPlan[]);

    // 3. Fetch exercise library
    const { data: exData } = await supabase.from('exercise')
    .select('id, exercise')
    .order('exercise->>name', { ascending: true });
    if (exData) setExerciseLibrary(exData);

    setLoading(false);
  }

  async function handleCreateRoutine(e: React.FormEvent) {
    e.preventDefault();
    if (!routineName.trim() || selectedRoutineExercises.length === 0) {
      alert('Provide a routine name and select at least one exercise.');
      return;
    }
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: workoutData, error: workoutError } = await supabase
      .from('workouts')
      .insert([{ name: routineName, user_id: session.user.id }])
      .select()
      .single();

    if (workoutError || !workoutData) {
      alert('Error creating routine: ' + workoutError?.message);
      return;
    }

    const workoutExercisesPayload = selectedRoutineExercises.map((exId, index) => ({
      workout_id: workoutData.id,
      exercise_id: exId,
      position: index,
    }));

    const { error: weError } = await supabase
      .from('workout_exercises')
      .insert(workoutExercisesPayload);

    if (weError) {
      alert('Error adding exercises: ' + weError.message);
    } else {
      setRoutineName('');
      setSelectedRoutineExercises([]);
      setIsRoutineModalOpen(false);
      fetchData();
    }
  }

  async function handleUpdateRoutine(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRoutine) return;

    const supabase = createClient();

    // 1. Update routine name
    const { error: nameError } = await supabase
      .from('workouts')
      .update({ name: editRoutineName })
      .eq('id', editingRoutine.id);

    if (nameError) {
      alert('Error updating routine name: ' + nameError.message);
      return;
    }

    // 2. Explicitly AWAIT the deletion of old exercises
    const { error: deleteError } = await supabase
      .from('workout_exercises')
      .delete()
      .eq('workout_id', editingRoutine.id);

    if (deleteError) {
      alert('Error clearing old routine exercises: ' + deleteError.message);
      return;
    }

    // 3. Optional: Filter out duplicate exercise IDs to prevent unique constraint clashes
    const uniqueExerciseIds = Array.from(new Set(editRoutineExercises));

    const workoutExercisesPayload = uniqueExerciseIds.map((exId, index) => ({
      workout_id: editingRoutine.id,
      exercise_id: exId,
      position: index,
    }));
    console.log('Inserting workout exercises payload:', workoutExercisesPayload);
    if (workoutExercisesPayload.length > 0) {
      const { error: weError } = await supabase
        .from('workout_exercises')
        .insert(workoutExercisesPayload);

      if (weError) {
        alert('Error updating routine exercises: ' + weError.message);
        return;
      }
    }

    setEditingRoutine(null);
    fetchData();
  }

  async function handleCreatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!planName.trim()) return;
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: planData, error: planError } = await supabase
      .from('workout_plans')
      .insert([{ name: planName, user_id: session.user.id }])
      .select()
      .single();

    if (planError || !planData) {
      alert('Error creating plan: ' + planError?.message);
      return;
    }

    const daysPayload = Object.entries(planDays).map(([dayStr, workoutId]) => ({
      workout_plan_id: planData.id,
      day_of_week: Number(dayStr),
      workout_id: workoutId === 'rest' || !workoutId ? null : workoutId,
    }));

    const { error: daysError } = await supabase
      .from('workout_plan_days')
      .insert(daysPayload);

    if (daysError) {
      alert('Error saving schedule: ' + daysError.message);
    } else {
      setPlanName('');
      setPlanDays({ 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null });
      setIsPlanModalOpen(false);
      fetchData();
    }
  }

  async function handleUpdatePlan(e: React.FormEvent) {
    e.preventDefault();
    if (!editingPlan) return;

    const supabase = createClient();

    // 1. Update plan name
    await supabase.from('workout_plans').update({ name: editPlanName }).eq('id', editingPlan.id);

    // 2. Replace 7-day schedule layout[cite: 1]
    await supabase.from('workout_plan_days').delete().eq('workout_plan_id', editingPlan.id);

    const daysPayload = Object.entries(editPlanDays).map(([dayStr, workoutId]) => ({
      workout_plan_id: editingPlan.id,
      day_of_week: Number(dayStr),
      workout_id: workoutId === 'rest' || !workoutId ? null : workoutId,
    }));

    const { error: daysError } = await supabase
      .from('workout_plan_days')
      .insert(daysPayload);

    if (daysError) {
      alert('Error updating plan schedule: ' + daysError.message);
    } else {
      setEditingPlan(null);
      fetchData();
    }
  }

  async function handleDeleteRoutine(id: string) {
    if (!confirm('Delete this routine?')) return;
    const supabase = createClient();
    await supabase.from('workouts').delete().eq('id', id);
    fetchData();
  }

  async function handleDeletePlan(id: string) {
    if (!confirm('Delete this workout plan?')) return;
    const supabase = createClient();
    await supabase.from('workout_plans').delete().eq('id', id);
    fetchData();
  }

  function openEditRoutine(routine: Routine) {
    setEditingRoutine(routine);
    setEditRoutineName(routine.name);
    setEditRoutineExercises(routine.workout_exercises?.map((we) => we.exercise_id) || []);
  }

  function openEditPlan(plan: WorkoutPlan) {
    setEditingPlan(plan);
    setEditPlanName(plan.name);
    const initialDays: { [day: number]: string | null } = {};
    for (let i = 0; i <= 6; i++) {
      const match = plan.workout_plan_days.find((d) => d.day_of_week === i);
      initialDays[i] = match ? match.workout_id : null;
    }
    setEditPlanDays(initialDays);
  }

  return (
    <div className="space-y-4 pb-12">
      {/* Tab Switcher */}
      <div className="flex gold-card p-1 rounded-xl">
        <button
          onClick={() => setActiveTab('routines')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
            activeTab === 'routines' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Routines ({routines.length})
        </button>
        <button
          onClick={() => setActiveTab('plans')}
          className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
            activeTab === 'plans' ? 'bg-emerald-600 text-white' : 'text-gray-400 hover:text-white'
          }`}
        >
          Weekly Plans ({plans.length})
        </button>
      </div>

      <div className="flex justify-between items-center pt-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {activeTab === 'routines' ? 'Workout Routines' : 'Weekly Plans'}
        </h1>
        <button
          onClick={() => activeTab === 'routines' ? setIsRoutineModalOpen(true) : setIsPlanModalOpen(true)}
          className="flex items-center space-x-1 gold-btn text-white px-3 py-1.5 rounded-lg text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          <span>New {activeTab === 'routines' ? 'Routine' : 'Plan'}</span>
        </button>
      </div>

      {/* Content Lists */}
      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading...</div>
      ) : activeTab === 'routines' ? (
        <div className="space-y-3">
          {routines.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">No standalone routines created yet.</div>
          ) : (
            routines.map((routine) => (
              <div
                key={routine.id}
                onClick={() => openEditRoutine(routine)}
                className="gold-card p-4 rounded-2xl flex items-center justify-between cursor-pointer hover:border-gray-700 transition"
              >
                <div className="space-y-1">
                  <h3 className="font-semibold text-amber-400">{routine.name}</h3>
                  <p className="text-xs text-gray-500">
                    {routine.workout_exercises?.length || 0} exercise(s) included
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <Edit3 className="w-4 h-4 text-gray-500" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRoutine(routine.id);
                    }}
                    className="text-gray-600 hover:text-red-400 transition p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {plans.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">No 7-day weekly plans created yet.</div>
          ) : (
            plans.map((plan) => (
              <div
                key={plan.id}
                onClick={() => openEditPlan(plan)}
                className="gold-card p-4 rounded-2xl space-y-3 cursor-pointer hover:border-gray-700 transition"
              >
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-amber-400 text-base">{plan.name}</h3>
                  <div className="flex items-center space-x-2">
                    <Edit3 className="w-4 h-4 text-gray-500" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePlan(plan.id);
                      }}
                      className="text-gray-600 hover:text-red-400 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-1.5 pt-1 border-t border-gray-800">
                  {DAYS_OF_WEEK.map((dayName, idx) => {
                    const matchedDay = plan.workout_plan_days?.find((d) => d.day_of_week === idx);
                    const routineName = matchedDay?.workouts?.name;
                    return (
                      <div key={idx} className="bg-gray-950 border border-gray-800/60 px-3 py-2 rounded-xl flex items-center justify-between">
                        <span className="text-xs text-gray-400 font-medium w-24">{dayName}</span>
                        {routineName ? (
                          <span className="text-xs font-semibold text-emerald-400 truncate text-right">
                            {routineName}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-gray-500 flex items-center space-x-1.5">
                            <Moon className="w-3.5 h-3.5 text-indigo-400" />
                            <span>Rest</span>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Routine Creation Modal */}
      {isRoutineModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="gold-card w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">New Routine</h2>
              <button onClick={() => setIsRoutineModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRoutine} className="space-y-3 flex-1 flex flex-col overflow-hidden">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Routine Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Push Day"
                  value={routineName}
                  onChange={(e) => setRoutineName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                <label className="block text-xs text-gray-400 mb-1">Select Exercises (1+)</label>
                {exerciseLibrary.map((item) => {
                  const isSelected = selectedRoutineExercises.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedRoutineExercises(selectedRoutineExercises.filter((id) => id !== item.id));
                        } else {
                          setSelectedRoutineExercises([...selectedRoutineExercises, item.id]);
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-sm cursor-pointer transition flex justify-between items-center ${
                        isSelected ? 'bg-emerald-950/30 border-emerald-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-300'
                      }`}
                    >
                      <span>{item.exercise.name}</span>
                      {isSelected && <Check className="w-4 h-4 text-emerald-500" />}
                    </div>
                  );
                })}
              </div>

              <div className="flex space-x-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsRoutineModalOpen(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 gold-btn text-white py-2 rounded-xl text-sm font-medium transition"
                >
                  Save Routine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Routine Editing Modal */}
      {editingRoutine && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="gold-card w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">Edit Routine</h2>
              <button onClick={() => setEditingRoutine(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateRoutine} className="space-y-3 flex-1 flex flex-col overflow-hidden">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Routine Name</label>
                <input
                  type="text"
                  required
                  value={editRoutineName}
                  onChange={(e) => setEditRoutineName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                <label className="block text-xs text-gray-400 mb-1">Modify Exercises</label>
                {exerciseLibrary.map((item) => {
                  const isSelected = editRoutineExercises.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (isSelected) {
                          setEditRoutineExercises(editRoutineExercises.filter((id) => id !== item.id));
                        } else {
                          setEditRoutineExercises([...editRoutineExercises, item.id]);
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-sm cursor-pointer transition flex justify-between items-center ${
                        isSelected ? 'bg-emerald-950/30 border-emerald-500 text-white' : 'bg-gray-950 border-gray-800 text-gray-300'
                      }`}
                    >
                      <span>{item.exercise.name}</span>
                      {isSelected && <Check className="w-4 h-4 text-emerald-500" />}
                    </div>
                  );
                })}
              </div>

              <div className="flex space-x-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setEditingRoutine(null)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 gold-btn text-white py-2 rounded-xl text-sm font-medium transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7-Day Plan Creation Modal */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="gold-card w-full max-w-md rounded-2xl p-5 space-y-4 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">New 7-Day Weekly Plan</h2>
              <button onClick={() => setIsPlanModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="space-y-3 flex-1 flex flex-col overflow-hidden">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Plan Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Push/Pull/Legs Split"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                <label className="block text-xs text-gray-400 mb-1">Assign Routine per Day (0-6)</label>
                {DAYS_OF_WEEK.map((dayName, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-950 border border-gray-800 p-2.5 rounded-xl">
                    <span className="text-xs font-semibold text-gray-300 w-24">{dayName}</span>
                    <select
                      value={planDays[idx] || 'rest'}
                      onChange={(e) => setPlanDays({ ...planDays, [idx]: e.target.value === 'rest' ? null : e.target.value })}
                      className="flex-1 gold-card rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="rest">🛌 Rest Day</option>
                      {routines.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex space-x-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 gold-btn text-white py-2 rounded-xl text-sm font-medium transition"
                >
                  Save Plan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7-Day Plan Editing Modal */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="gold-card w-full max-w-md rounded-2xl p-5 space-y-4 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">Edit 7-Day Weekly Plan</h2>
              <button onClick={() => setEditingPlan(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdatePlan} className="space-y-3 flex-1 flex flex-col overflow-hidden">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Plan Name</label>
                <input
                  type="text"
                  required
                  value={editPlanName}
                  onChange={(e) => setEditPlanName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                <label className="block text-xs text-gray-400 mb-1">Modify Schedule (0-6)</label>
                {DAYS_OF_WEEK.map((dayName, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-gray-950 border border-gray-800 p-2.5 rounded-xl">
                    <span className="text-xs font-semibold text-gray-300 w-24">{dayName}</span>
                    <select
                      value={editPlanDays[idx] || 'rest'}
                      onChange={(e) => setEditPlanDays({ ...editPlanDays, [idx]: e.target.value === 'rest' ? null : e.target.value })}
                      className="flex-1 gold-card rounded-lg px-2 py-1.5 text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="rest">🛌 Rest Day</option>
                      {routines.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex space-x-2 pt-2 border-t border-gray-800">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-xl text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 gold-btn text-white py-2 rounded-xl text-sm font-medium transition"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}