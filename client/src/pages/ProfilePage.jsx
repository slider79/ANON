import { useQuery } from '@tanstack/react-query';
import { User, Zap, BarChart3, LogOut, Trash2, Copy } from 'lucide-react';
import { getMana, getUser, deleteIdentity } from '../api';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../components/ToastContext';

export default function ProfilePage() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const user = JSON.parse(localStorage.getItem('anon_user'));
  
  const { data: userData } = useQuery({
    queryKey: ['user', user?.id], queryFn: () => getUser(user.id), enabled: !!user
  });

  const { data: manaData } = useQuery({
    queryKey: ['mana', user?.id], queryFn: () => getMana(user.id), enabled: !!user, refetchInterval: 10000
  });

  // 1. Logout: Just clears local storage
  const handleLogout = () => {
    localStorage.removeItem('anon_user');
    addToast('Logged out successfully', 'info');
    navigate('/onboarding');
  };

  // 2. Destroy: Deletes from DB + Clears local storage
  const handleDestroy = async () => {
    if(confirm('DANGER: This will permanently delete your identity from this node. You will lose all Mana and Reputation. Are you sure?')) {
      try {
        await deleteIdentity(user.id);
        localStorage.removeItem('anon_user');
        addToast('Identity permanently destroyed', 'success');
        navigate('/onboarding');
      } catch (err) {
        addToast('Failed to delete account', 'error');
      }
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(user.id);
    addToast('Node ID copied to clipboard', 'success');
  }

  if (!user) return null;

  return (
    <div className="space-y-6 pt-4">
      {/* Identity Card */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-2xl p-6 relative overflow-hidden shadow-lg">
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="bg-gray-700 p-2 rounded-full"><User size={24} className="text-gray-300" /></div>
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider font-bold">Anonymous Identity</p>
                <p className="text-sm text-gray-500">Local Node</p>
              </div>
            </div>
            <button onClick={copyId} className="p-2 hover:bg-gray-700 rounded-lg text-gray-400"><Copy size={16} /></button>
          </div>
          
          <div className="bg-black/30 rounded-lg p-3 font-mono text-xs text-green-400 break-all border border-green-900/30">
            {user.id}
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 text-yellow-500 mb-2">
            <Zap size={20} className="fill-yellow-500" /> <span className="font-bold text-sm tracking-wide text-gray-400">MANA</span>
          </div>
          <div className="flex items-baseline gap-1">
             <p className="text-3xl font-bold text-white">{manaData?.mana ?? '...'}</p>
             <span className="text-sm text-gray-600 font-medium">/ 100</span>
          </div>
          <p className="text-xs text-gray-600 mt-2">Regenerates 1 per minute</p>
        </div>
        
        <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl shadow-sm">
          <div className="flex items-center gap-2 text-purple-400 mb-2">
            <BarChart3 size={20} /> <span className="font-bold text-sm tracking-wide text-gray-400">REPUTATION</span>
          </div>
          <p className="text-3xl font-bold text-white">{(userData?.reputation ?? 0.1).toFixed(4)}</p>
          <p className="text-xs text-gray-600 mt-2">EigenTrust Score</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-1 gap-3 mt-4">
        <button 
          onClick={handleLogout} 
          className="w-full bg-gray-800 border border-gray-700 text-gray-300 py-3 rounded-xl hover:bg-gray-700 transition flex items-center justify-center gap-2 font-medium"
        >
          <LogOut size={18} /> Logout (Safe)
        </button>

        <button 
          onClick={handleDestroy} 
          className="w-full border border-red-900/50 text-red-500 py-3 rounded-xl hover:bg-red-950/30 transition flex items-center justify-center gap-2 font-medium"
        >
          <Trash2 size={18} /> Permanently Delete Account
        </button>
      </div>
    </div>
  );
}