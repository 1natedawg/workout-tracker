'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/utils/client';
import { Plus, Search, Dumbbell, X } from 'lucide-react';

interface ExerciseData {
    name: string;
    target_sets: number;
    image: string;
    video: string;
    muscle_groups: string[];
    target_max_reps: number;
    target_min_reps: number;
}

interface ExerciseRecord {
    id: string;
    exercise: ExerciseData;
}

export default function ExercisesPage() {
    const [exercises, setExercises] = useState<ExerciseRecord[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    // Form states matching your JSON keys
    const [name, setName] = useState('');
    const [sets, setSets] = useState(3);
    const [image, setImage] = useState('');
    const [video, setVideo] = useState('');
    const [muscleGroupsInput, setMuscleGroupsInput] = useState('Chest, Triceps');
    const [targetMinReps, setTargetMinReps] = useState(8);
    const [targetMaxReps, setTargetMaxReps] = useState(12);

    useEffect(() => {
        fetchExercises();
    }, []);

    async function fetchExercises() {
        const supabase = createClient();
        // Check if we have an active session first
        const { data: { session } } = await supabase.auth.getSession();

        if (!session) {
            window.location.href = '/login';
            return;
        }

        const { data, error } = await supabase
            .from('exercise')
            .select('*')
            .order('id', { ascending: true });

        if (error) {
            console.error('Error fetching exercises:', error);
        } else if (data) {
            setExercises(data);
        }
    }

    async function handleAddExercise(e: React.FormEvent) {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);

        // Build the JSONB payload
        const exercisePayload: ExerciseData = {
            name,
            target_sets: Number(sets),
            image,
            video,
            muscle_groups: muscleGroupsInput.split(',').map((s) => s.trim()).filter(Boolean),
            target_min_reps: Number(targetMinReps),
            target_max_reps: Number(targetMaxReps),
        };

        const supabase = createClient();
        const { data, error } = await supabase
            .from('exercise')
            .insert([{ exercise: exercisePayload }])
            .select();

        if (error) {
            console.error('Error adding exercise:', error);
            alert('Error adding exercise: ' + error.message);
        } else if (data) {
            setExercises([data[0], ...exercises]);
            // Reset form
            setName('');
            setSets(3);
            setImage('');
            setVideo('');
            setMuscleGroupsInput('Chest, Triceps');
            setTargetMinReps(8);
            setTargetMaxReps(12);
            setIsModalOpen(false);
        }
        setLoading(false);
    }

    // Filter based on name or muscle groups inside the JSON blob
  const filteredExercises = exercises.filter((item) => {
    const ex = item.exercise;
    const matchesName = ex.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMuscle = ex.muscle_groups.some((mg) =>
      mg.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return matchesName || matchesMuscle;
  });

  return (
    <div className="space-y-4">
      {/* Header & Add Button */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold tracking-tight">Exercises</h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center space-x-1 bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" />
          <span>Add New</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
        <input
          type="text"
          placeholder="Search by name or muscle group..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-gray-900 border border-gray-800 rounded-lg pl-9 pr-4 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
        />
      </div>

      {/* Exercises List */}
      <div className="space-y-2">
        {filteredExercises.length === 0 ? (
          <div className="text-center py-12 text-gray-500 text-sm">
            No exercises found. Add your first lift!
          </div>
        ) : (
          filteredExercises.map((item) => {
            const ex = item.exercise;
            return (
              <div
                key={item.id}
                className="bg-gray-900 border border-gray-800/80 p-3.5 rounded-xl flex items-center justify-between"
              >
                <div>
                  <h3 className="font-medium text-gray-200">{ex.name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {ex.muscle_groups?.join(', ')} • Target: {ex.target_min_reps}-{ex.target_max_reps} reps ({ex.target_sets} sets)
                  </p>
                </div>
                <Dumbbell className="w-5 h-5 text-gray-600" />
              </div>
            );
          })
        )}
      </div>

      {/* Add Exercise Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-sm rounded-2xl p-5 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">New Exercise</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleAddExercise} className="space-y-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Barbell Bench Press"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Default Target Sets</label>
                  <input
                    type="number"
                    value={sets}
                    onChange={(e) => setSets(Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Muscle Groups (comma separated)</label>
                  <input
                    type="text"
                    value={muscleGroupsInput}
                    onChange={(e) => setMuscleGroupsInput(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Min Reps</label>
                  <input
                    type="number"
                    value={targetMinReps}
                    onChange={(e) => setTargetMinReps(Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Max Reps</label>
                  <input
                    type="number"
                    value={targetMaxReps}
                    onChange={(e) => setTargetMaxReps(Number(e.target.value))}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Image URL (Optional)</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={image}
                  onChange={(e) => setImage(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Video URL (Optional)</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={video}
                  onChange={(e) => setVideo(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 py-2 rounded-lg text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}