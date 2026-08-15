'use client';

import Link from 'next/link';
import { Dumbbell, History, PlusCircle, Trophy } from 'lucide-react'; // Make sure to install lucide-react or use standard icons
import { usePathname } from 'next/navigation';

export default function BottomNav() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 border-t border-gray-800 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16">
        <Link href="/" className={`flex flex-col items-center hover:text-white ${isActive('/') ? 'text-amber-400' : 'text-stone-400'}`}>
          <PlusCircle className="w-6 h-6" />
          <span className="text-xs mt-1">Log</span>
        </Link>
        <Link href="/plans" className={`flex flex-col items-center hover:text-white ${isActive('/plans') ? 'text-amber-400' : 'text-stone-400'}`}>
          <Dumbbell className="w-6 h-6" />
          <span className="text-xs mt-1">Workout Plans</span>
        </Link>
        <Link href="/history" className={`flex flex-col items-center hover:text-white ${isActive('/history') ? 'text-amber-400' : 'text-stone-400'}`}>
          <History className="w-6 h-6" />
          <span className="text-xs mt-1">History</span>
        </Link>
        <Link href="/exercises" className={`flex flex-col items-center hover:text-white ${isActive('/exercises') ? 'text-amber-400' : 'text-stone-400'}`}>
          <Dumbbell className="w-6 h-6" />
          <span className="text-xs mt-1">Exercises</span>
        </Link>
        <Link href="/stats" className={`flex flex-col items-center hover:text-white ${isActive('/stats') ? 'text-amber-400' : 'text-stone-400'}`}>
  <Trophy className="w-5 h-5" />
  <span className="text-xs">Stats</span>
</Link>
      </div>
    </nav>
  );
}