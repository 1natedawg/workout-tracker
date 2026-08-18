'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/client';
import { Edit3, Trash2, Plus, X, Check, Dumbbell } from 'lucide-react';

interface ExerciseLibraryItem {
  id: number;
  exercise: { name: string; target_sets?: number };
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Editing Session Modal State
  const [editingSession, setEditingSession] = useState<any | null>(null);
  const [sessionExercises, setSessionExercises] = useState<any[]>([]);
  const [exerciseLibrary, setExerciseLibrary] = useState<ExerciseLibraryItem[]>([]);
  const [isAddingExercise, setIsAddingExercise] = useState(false);

  useEffect(() => {
    fetchHistory();
    fetchExerciseLibrary();
  }, []);

  async function fetchHistory() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('workout_sessions')
      .select(`
        id,
        started_at,
        workout_session_exercises (
          id,
          exercise_id,
          position,
          exercise:exercise_id ( exercise ),
          workout_session_sets ( id, weight_lb, reps, set_index )
        )
      `)
      .order('started_at', { ascending: false });

    if (data) {
      setSessions(data);
    }
    setLoading(false);
  }

  async function fetchExerciseLibrary() {
    const supabase = createClient();
    const { data } = await supabase
      .from('exercise')
      .select('id, exercise')
      .order('exercise->>name', { ascending: true });
    if (data) setExerciseLibrary(data);
  }

  function openEditModal(session: any) {
    // Deep clone session exercises for local editing state
    const clonedExercises = (session.workout_session_exercises || []).map((ex: any) => ({
      ...ex,
      exerciseName: ex.exercise?.exercise?.name || 'Exercise',
      workout_session_sets: [...(ex.workout_session_sets || [])].sort((a, b) => a.set_index - b.set_index)
    })).sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

    setEditingSession(session);
    setSessionExercises(clonedExercises);
    setIsAddingExercise(false);
  }

  // --- SET OPERATIONS ---
  function updateSetField(exIdx: number, setIdx: number, field: 'weight_lb' | 'reps', val: string) {
    const updated = [...sessionExercises];
    updated[exIdx].workout_session_sets[setIdx][field] = val === '' ? '' : Number(val);
    setSessionExercises(updated);
  }

  function addSetToExercise(exIdx: number) {
    const updated = [...sessionExercises];
    const sets = updated[exIdx].workout_session_sets;
    const lastSet = sets[sets.length - 1];
    sets.push({
      id: null, // New set indicator
      set_index: sets.length,
      weight_lb: lastSet ? lastSet.weight_lb : '',
      reps: lastSet ? lastSet.reps : ''
    });
    setSessionExercises(updated);
  }

  function removeSet(exIdx: number, setIdx: number) {
    const updated = [...sessionExercises];
    updated[exIdx].workout_session_sets = updated[exIdx].workout_session_sets.filter((_: any, idx: number) => idx !== setIdx);
    // Re-index remaining sets
    updated[exIdx].workout_session_sets.forEach((s: any, idx: number) => { s.set_index = idx; });
    setSessionExercises(updated);
  }

  // --- EXERCISE OPERATIONS ---
  function removeExercise(exIdx: number) {
    setSessionExercises(sessionExercises.filter((_, idx) => idx !== exIdx));
  }

  function addExerciseToSession(item: ExerciseLibraryItem) {
    const newEx = {
      id: null, // New session exercise indicator
      exercise_id: item.id,
      exerciseName: item.exercise.name,
      position: sessionExercises.length,
      workout_session_sets: [
        { id: null, set_index: 0, weight_lb: '', reps: '' },
        { id: null, set_index: 1, weight_lb: '', reps: '' }
      ]
    };
    setSessionExercises([...sessionExercises, newEx]);
    setIsAddingExercise(false);
  }

  // --- DELETE SESSION ---
  async function handleDeleteSession(sessionId: string) {
    if (!confirm('Are you sure you want to delete this entire workout session?')) return;
    const supabase = createClient();
    const { error } = await supabase.from('workout_sessions').delete().eq('id', sessionId);
    if (error) {
      alert('Error deleting session: ' + error.message);
    } else {
      setEditingSession(null);
      fetchHistory();
    }
  }

  // --- SAVE SESSION CHANGES ---
  async function handleSaveSessionChanges() {
    if (!editingSession) return;
    const supabase = createClient();

    try {
      // 1. Get current exercises in DB for this session to reconcile additions/deletions
      const { data: existingExs } = await supabase
        .from('workout_session_exercises')
        .select('id')
        .eq('workout_session_id', editingSession.id);

      const existingExIds = new Set((existingExs || []).map((e: any) => e.id));
      const currentExIds = new Set(sessionExercises.filter(e => e.id).map(e => e.id));

      // Delete exercises removed by user
      const exIdsToDelete = Array.from(existingExIds).filter(id => !currentExIds.has(id));
      if (exIdsToDelete.length > 0) {
        await supabase.from('workout_session_exercises').delete().in('id', exIdsToDelete);
      }

      // 2. Upsert / Insert exercises and update sets
      for (let i = 0; i < sessionExercises.length; i++) {
        const ex = sessionExercises[i];
        let sessionExerciseId = ex.id;

        if (!sessionExerciseId) {
          // Insert new session exercise
          const { data: newExData, error: newExErr } = await supabase
            .from('workout_session_exercises')
            .insert([{
              workout_session_id: editingSession.id,
              exercise_id: ex.exercise_id,
              position: i
            }])
            .select()
            .single();
          if (newExErr) throw newExErr;
          sessionExerciseId = newExData.id;
        } else {
          // Update position
          await supabase
            .from('workout_session_exercises')
            .update({ position: i })
            .eq('id', sessionExerciseId);
        }

        // 3. Handle sets for this exercise: Delete existing sets for this exercise and re-insert fresh
        await supabase
          .from('workout_session_sets')
          .delete()
          .eq('workout_session_exercise_id', sessionExerciseId);

        const setsPayload = ex.workout_session_sets
          .filter((s: any) => s.weight_lb !== '' && s.reps !== '')
          .map((s: any, sIdx: number) => ({
            workout_session_exercise_id: sessionExerciseId,
            set_index: sIdx,
            weight_lb: Number(s.weight_lb),
            reps: Number(s.reps)
          }));

        if (setsPayload.length > 0) {
          const { error: setsErr } = await supabase
            .from('workout_session_sets')
            .insert(setsPayload);
          if (setsErr) throw setsErr;
        }
      }

      alert('Workout session updated successfully!');
      setEditingSession(null);
      fetchHistory();
    } catch (err: any) {
      alert('Error updating session: ' + err.message);
    }
  }

  return (
    <div className="space-y-6 pb-32 px-4 pt-4 max-w-md mx-auto">
      <h1 className="text-2xl font-bold">History</h1>

      {loading ? (
        <div className="text-center py-12 text-gray-500 text-sm">Loading history...</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-12 text-gray-500 text-sm">No workout sessions logged yet.</div>
      ) : (
        sessions.map((session) => {
          const dateKey = new Date(session.started_at).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric'
          });

          return (
            <div key={session.id} className="gold-card p-4 space-y-4">
              <div className="flex justify-between items-center border-b border-white/5 pb-2">
                <span className="text-sm font-semibold text-amber-500">{dateKey}</span>
                <button
                  onClick={() => openEditModal(session)}
                  className="flex items-center space-x-1 text-xs text-gray-400 hover:text-amber-400 bg-gray-900 px-2.5 py-1 rounded-lg border border-gray-800 transition"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Edit Session</span>
                </button>
              </div>

              <div className="space-y-4">
                {(session.workout_session_exercises || []).map((ex: any) => {
                  const sortedSets = [...(ex.workout_session_sets || [])].sort(
                    (a: any, b: any) => a.set_index - b.set_index
                  );

                  return (
                    <div key={ex.id} className="space-y-1.5 border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                      <span className="ex-name font-medium text-stone-200 block text-xs tracking-wide">
                        {ex.exercise?.exercise?.name}
                      </span>

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
          );
        })
      )}

      {/* --- EDIT SESSION MODAL --- */}
      {editingSession && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="gold-card w-full max-w-lg rounded-2xl p-5 space-y-4 shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-gray-800 pb-3">
              <h2 className="text-lg font-bold text-amber-400">
                Edit Session ({new Date(editingSession.started_at).toLocaleDateString()})
              </h2>
              <button onClick={() => setEditingSession(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Exercises List inside Modal */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {sessionExercises.length === 0 ? (
                <p className="text-center text-sm text-gray-500 py-6">No exercises in this session.</p>
              ) : (
                sessionExercises.map((ex, exIdx) => (
                  <div key={exIdx} className="bg-gray-950 border border-gray-800 p-3 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                      <h4 className="font-semibold text-sm text-gray-200">{ex.exerciseName}</h4>
                      <button
                        onClick={() => removeExercise(exIdx)}
                        className="text-gray-500 hover:text-red-400 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Sets Editor */}
                    <div className="space-y-2">
                      {ex.workout_session_sets.map((set: any, setIdx: number) => (
                        <div key={setIdx} className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500 w-12 font-medium">Set {setIdx + 1}</span>
                          <input
                            type="number"
                            placeholder="Lbs"
                            value={set.weight_lb}
                            onChange={(e) => updateSetField(exIdx, setIdx, 'weight_lb', e.target.value)}
                            className="flex-1 bg-gray-900 border border-gray-800 rounded-lg py-1 px-2 text-center text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                          />
                          <span className="text-gray-600">×</span>
                          <input
                            type="number"
                            placeholder="Reps"
                            value={set.reps}
                            onChange={(e) => updateSetField(exIdx, setIdx, 'reps', e.target.value)}
                            className="flex-1 bg-gray-900 border border-gray-800 rounded-lg py-1 px-2 text-center text-xs text-gray-100 focus:outline-none focus:border-emerald-500"
                          />
                          <button
                            onClick={() => removeSet(exIdx, setIdx)}
                            className="text-gray-600 hover:text-red-400 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => addSetToExercise(exIdx)}
                      className="w-full py-1 bg-gray-900 hover:bg-gray-850 border border-gray-800 rounded-lg text-xs text-gray-400 font-medium transition"
                    >
                      + Add Set
                    </button>
                  </div>
                ))
              )}

              {/* Add Exercise Button / Picker */}
              {isAddingExercise ? (
                <div className="bg-gray-950 border border-gray-800 p-3 rounded-xl space-y-2">
                  <div className="flex justify-between items-center text-xs font-semibold text-gray-400">
                    <span>Select Exercise to Add</span>
                    <button onClick={() => setIsAddingExercise(false)} className="text-gray-500 hover:text-white">Cancel</button>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {exerciseLibrary.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => addExerciseToSession(item)}
                        className="w-full text-left bg-gray-900 hover:bg-gray-850 px-3 py-2 rounded-lg text-xs text-gray-200 transition"
                      >
                        {item.exercise.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingExercise(true)}
                  className="w-full py-2.5 bg-gray-950 hover:bg-gray-900 border border-dashed border-gray-800 rounded-xl text-xs font-medium text-amber-400 flex items-center justify-center space-x-1 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Exercise to Session</span>
                </button>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-gray-800">
              <button
                onClick={() => handleDeleteSession(editingSession.id)}
                className="flex items-center space-x-1 bg-red-950/40 hover:bg-red-900/50 text-red-400 border border-red-900/50 px-3 py-2 rounded-xl text-xs font-medium transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Session</span>
              </button>

              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded-xl text-xs font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSessionChanges}
                  className="gold-btn text-white px-4 py-2 rounded-xl text-xs font-semibold transition"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}