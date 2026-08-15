'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/client';


export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      alert(error.message);
    } else {
      router.push('/');
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="max-w-xs mx-auto mt-20 space-y-4">
      <h1 className="text-xl font-bold text-center">Login to LiftTracker</h1>
      <form onSubmit={handleLogin} className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full gold-card rounded-lg px-3 py-2 text-sm text-gray-100"
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full gold-card rounded-lg px-3 py-2 text-sm text-gray-100"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full gold-btn text-white py-2 rounded-lg text-sm font-medium"
        >
          {loading ? 'Logging in...' : 'Log In'}
        </button>
      </form>
    </div>
  );
}