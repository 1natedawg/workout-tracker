'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/client';
import { Calendar, Dumbbell, Search, ArrowUpDown, ChevronRight, Trash2, X, Check } from 'lucide-react';

interface ExerciseItem {
  id: number;
  exercise: { name: string };
}

interface SetRecord {
  id: string;
  set_index: number;
  reps: number;
  weight_lb: number;
}

interface SessionExercise {
  id: string;
  exercise_id: number;
  exercise: { exercise: { name: string } };
  workout_session_sets: SetRecord[];
}

interface WorkoutSession {
  id: string;
  started_at: string;
  notes: string;
  workout_session_exercises: SessionExercise[];
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & Sorting
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [selectedExerciseFilter, setSelectedExerciseFilter] = useState<string>('all');
  
  // Selected session for editing/viewing
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [editSets, setEditSets] = useState<{ [setId: string]: { weight: number; reps: number } }>({});
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchHistoryData();
  }, [sortOrder, selectedExerciseFilter]);

  async function fetchHistoryData() {
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      window.location.href = '/login';
      return;
    }

    // 1. Fetch exercise library for the filter dropdown
    const { data: exData } = await supabase.from('exercise').select('id, exercise');
    if (exData) setExerciseLibrary(exData);

    // 2. Query workout sessions with relational joins
    let query = supabase
      .from('workout_sessions')
      .select(`
        id,
        started_at,
        notes,
        workout_session_exercises (
          id,
          exercise_id,
          exercise:exercise_id ( exercise ),
          workout_session_sets (
            id,
            set_index,
            reps,
            weight_lb
          )
        )
      `)
      .eq('user_id', session.user.id)
      .order('started_at', { ascending: sortOrder === 'asc' });

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching history:', error);
    } else if (data) {
      // If an exercise filter is selected, filter client-side or via relation
      let filtered = data as unknown as WorkoutSession[];
      if (selectedExerciseFilter !== 'all') {
        const exIdNum = Number(selectedExerciseFilter);
        filtered = filtered.filter((s) =>
          s.workout_session_exercises.some((ex) => ex.exercise_id === exIdNum)
        );
      }
      setSessions(filtered);
    }
    setLoading(false);
  }

  // Open session details and populate editable local state
  function handleOpenSession(session: WorkoutSession) {
    setActiveSession(session);
    const initialSetState: { [setId: string]: { weight: number; reps: number } } = {};
    session.workout_session_exercises.forEach((ex) => {
      ex.workout_session_sets.forEach((set) => {
        initialSetState[set.id] = { weight: set.weight_lb, reps: set.reps };
      });
    });
    setEditSets(initialSetState);
  }

  function handleSetChange(setId: string, field: 'weight' | 'reps', value: string) {
    const numVal = value === '' ? 0 : Number(value);
    setEditSets((prev) => ({
      ...prev,
      [setId]: {
        ...prev[setId],
        [field]: numVal,
      },
    }));
  }

  async function handleSaveChanges() {
    if (!activeSession) return;
    setIsUpdating(true);

    try {
      // Update each modified set in Supabase
      const supabase = createClient();
      for (const [setId, values] of Object.entries(editSets)) {
        const { error } = await supabase
          .from('workout_session_sets')
          .update({ weight_lb: values.weight, reps: values.reps })
          .eq('id', setId);

        if (error) throw error;
      }

      alert('Workout session updated successfully!');
      setActiveSession(null);
      fetchHistoryData();
    } catch (err: any) {
      console.error('Error updating session:', err);
      alert('Failed to update: ' + err.message);
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleDeleteSession(sessionId: string) {
    if (!confirm('Are you sure you want to delete this entire workout session?')) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('workout_sessions')
      .delete()
      .eq('id', sessionId);

    if (error) {
      alert('Error deleting session: ' + error.message);
    } else {
      setActiveSession(null);
      fetchHistoryData();
    }
  }

  return (
    <div className="space-y-4 pb-12">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">History</h1>
        
        {/* Sort Button */}
        <button
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          className="flex items-center space-x-1 bg-gray-900 border border-gray-800 text-gray-300 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-850 transition"
        >
          <ArrowUpDown className="w-3.5 h-3.5 text-emerald-500" />
          <span>{sortOrder === 'desc' ? 'Newest First' : 'Oldest First'}</span>
        </button>
      </div>

      {/* Exercise Filter Dropdown */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
        <select
          value={selectedExerciseFilter}
          onChange={(e) => setSelectedExerciseFilter(e.target.value)}
          className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500 appearance-none"
        >
          <option value="all">All Exercises (Filter history)</option>
          {exerciseLibrary.sort((a, b) => a.exercise.name.localeCompare(b.exercise.name)).map((item) => (
            <option key={item.id} value={item.id}>
              {item.exercise.name}
            </option>
          ))}
        </select>
      </div>

      {/* Sessions List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Loading history...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">No workout sessions found.</div>
        ) : (
          sessions.map((session) => {
            const dateStr = new Date(session.started_at).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });

            return (
              <div
                key={session.id}
                onClick={() => handleOpenSession(session)}
                className="bg-gray-900 border border-gray-800 p-4 rounded-2xl flex items-center justify-between cursor-pointer hover:border-gray-700 transition"
              >
                <div className="space-y-1">
                  <div className="flex items-center space-x-2 text-xs text-emerald-400 font-medium">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{dateStr}</span>
                  </div>
                  <div className="text-sm font-semibold text-gray-200">
                    {session.workout_session_exercises
                      .map((ex) => ex.exercise?.exercise?.name)
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                  <p className="text-xs text-gray-500">
                    {session.workout_session_exercises.length} exercise(s) performed
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-600" />
              </div>
            );
          })
        )}
      </div>

      {/* Session Detail & Edit Modal */}
      {activeSession && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-md rounded-2xl p-5 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
            
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <div>
                <h2 className="text-lg font-bold">Edit Workout Session</h2>
                <p className="text-xs text-gray-400">
                  {new Date(activeSession.started_at).toLocaleDateString()}
                </p>
              </div>
              <button onClick={() => setActiveSession(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {activeSession.workout_session_exercises.map((exItem) => (
                <div key={exItem.id} className="bg-gray-950 border border-gray-800 p-3 rounded-xl space-y-2">
                  <h4 className="font-semibold text-emerald-400 text-sm">
                    {exItem.exercise?.exercise?.name || 'Exercise'}
                  </h4>

                  <div className="space-y-1.5">
                    <div className="grid grid-cols-12 gap-2 text-[10px] text-gray-500 font-medium px-1">
                      <div className="col-span-3 text-center">SET</div>
                      <div className="col-span-4 text-center">LBS</div>
                      <div className="col-span-5 text-center">REPS</div>
                    </div>

                    {exItem.workout_session_sets.map((set, sIdx) => {
                      const currentVals = editSets[set.id] || { weight: set.weight_lb, reps: set.reps };
                      return (
                        <div key={set.id} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-3 text-center text-xs font-semibold text-gray-400">
                            Set {sIdx + 1}
                          </div>
                          <div className="col-span-4">
                            <input
                              type="number"
                              value={currentVals.weight}
                              onChange={(e) => handleSetChange(set.id, 'weight', e.target.value)}
                              className="w-full bg-gray-900 border border-gray-800 rounded-lg py-1.5 text-center text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                          <div className="col-span-5">
                            <input
                              type="number"
                              value={currentVals.reps}
                              onChange={(e) => handleSetChange(set.id, 'reps', e.target.value)}
                              className="w-full bg-gray-900 border border-gray-800 rounded-lg py-1.5 text-center text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex space-x-2 pt-2 border-t border-gray-800">
              <button
                type="button"
                onClick={() => handleDeleteSession(activeSession.id)}
                className="bg-red-950/40 hover:bg-red-900/40 border border-red-900/50 text-red-400 px-3 py-2 rounded-xl text-xs font-medium transition flex items-center justify-center space-x-1"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
              
              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={isUpdating}
                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-xl text-xs font-medium transition flex items-center justify-center space-x-1 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                <span>{isUpdating ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}