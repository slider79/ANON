import { Outlet, NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Shield, Home, PlusSquare, User, Activity, Zap } from 'lucide-react';
import { getMana } from '../api';

const NavItem = ({ to, icon: Icon, label }) => (
  <NavLink to={to} className={({ isActive }) => `
    flex flex-col items-center gap-1 p-2 rounded-lg transition-colors
    ${isActive ? 'text-green-400 bg-gray-800' : 'text-gray-400 hover:text-gray-200'}
  `}>
    <Icon size={24} />
    <span className="text-[10px] uppercase tracking-wider font-bold">{label}</span>
  </NavLink>
);

export default function Layout() {
  const user = JSON.parse(localStorage.getItem('anon_user'));

  // Fetch Mana globally so it's always up to date
  const { data: manaData } = useQuery({
    queryKey: ['mana', user?.id],
    queryFn: () => getMana(user.id),
    enabled: !!user,
    refetchInterval: 10000 // Keep mana fresh every 10s
  });

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans pb-20 md:pb-0">
      {/* Top Bar with Mana */}
      <header className="sticky top-0 z-40 bg-gray-950/90 backdrop-blur border-b border-gray-800 px-4 py-3 shadow-md">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="text-green-500" size={24} />
            <h1 className="text-xl font-bold tracking-tight hidden sm:block">ANON</h1>
          </div>

          {/* Persistent Mana Bar */}
          {user && (
            <div className="flex items-center gap-2 bg-gray-900 border border-gray-800 rounded-full px-3 py-1.5">
               <Zap size={16} className="text-yellow-400 fill-yellow-400" />
               <div className="flex flex-col leading-none">
                 <span className="text-xs font-bold text-white tracking-wide">
                   {manaData?.mana ?? '...'} MANA
                 </span>
                 <span className="text-[9px] text-gray-500 font-medium">REGEN ACTIVE</span>
               </div>
            </div>
          )}
        </div>
      </header>

      {/* Page Content */}
      <main className="max-w-2xl mx-auto p-4">
        <Outlet />
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 px-6 py-2 z-50 safe-area-bottom">
        <div className="max-w-2xl mx-auto flex justify-between items-center">
          <NavItem to="/" icon={Home} label="Feed" />
          <NavItem to="/post" icon={PlusSquare} label="Post" />
          <NavItem to="/profile" icon={User} label="Identity" />
          <NavItem to="/network" icon={Activity} label="Status" />
        </div>
      </nav>
    </div>
  );
}