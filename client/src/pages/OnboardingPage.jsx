import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerEmail, onboard, getUser } from '../api';
import { Shield, ArrowRight, Mail, KeyRound, Lock } from 'lucide-react';
import { useToast } from '../components/ToastContext';

export default function OnboardingPage() {
  const [mode, setMode] = useState('join'); // 'join' or 'login'
  const [email, setEmail] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { addToast } = useToast();

  const handleJoin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Get Token
      const regRes = await registerEmail(email);
      const token = regRes.data.token;
      
      // 2. Generate Key
      const publicKey = `pk-${Math.random().toString(36).slice(2)}-${Date.now()}`;
      
      // 3. Onboard
      const onboardRes = await onboard(publicKey, token);
      const user = onboardRes.data;
      
      localStorage.setItem('anon_user', JSON.stringify(user));
      addToast('Identity established. Welcome.', 'success');
      navigate('/');
    } catch (err) {
      addToast(err.response?.data?.error || 'Join failed.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Try to fetch user with this ID (The "Secret Key")
      const user = await getUser(secretKey.trim());
      
      if (user && user.id) {
        localStorage.setItem('anon_user', JSON.stringify(user));
        addToast('Account restored successfully.', 'success');
        navigate('/');
      } else {
        throw new Error("Invalid Key");
      }
    } catch (err) {
      addToast('Could not find an account with that ID.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-950 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-green-500/5 rounded-full blur-[100px]" />
         <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="w-full max-w-md text-center space-y-8 relative z-10">
        <div className="flex justify-center mb-6">
          <div className="bg-gray-900 p-6 rounded-3xl ring-1 ring-gray-800 shadow-[0_0_50px_rgba(0,0,0,0.5)]">
            <Shield size={64} className="text-green-500" />
          </div>
        </div>
        
        <div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">ANON</h1>
          <p className="text-gray-400 text-lg">Truth through consensus.</p>
        </div>

        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-800 shadow-xl overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b border-gray-800">
            <button 
              onClick={() => setMode('join')}
              className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${mode === 'join' ? 'bg-gray-800 text-green-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              New Identity
            </button>
            <button 
              onClick={() => setMode('login')}
              className={`flex-1 py-4 text-sm font-bold uppercase tracking-wider transition-colors ${mode === 'login' ? 'bg-gray-800 text-blue-400' : 'text-gray-500 hover:text-gray-300'}`}
            >
              Restore Account
            </button>
          </div>

          <div className="p-8">
            {mode === 'join' ? (
              <form onSubmit={handleJoin} className="space-y-4">
                <div className="relative group">
                  <Mail className="absolute left-4 top-3.5 text-gray-500 group-focus-within:text-green-500 transition-colors" size={20} />
                  <input 
                    type="email" 
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="Enter university email"
                    className="w-full bg-black/40 border border-gray-700 rounded-xl py-3 pl-12 pr-4 text-white focus:ring-2 focus:ring-green-500/50 focus:border-green-500 outline-none transition-all placeholder-gray-600"
                    required
                  />
                </div>
                
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Join Network'} 
                  {!loading && <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />}
                </button>
                <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                  We use a blind-token protocol. Your email is hashed and discarded after verification.
                </p>
              </form>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="relative group">
                  <KeyRound className="absolute left-4 top-3.5 text-gray-500 group-focus-within:text-blue-500 transition-colors" size={20} />
                  <input 
                    type="text" 
                    value={secretKey}
                    onChange={e => setSecretKey(e.target.value)}
                    placeholder="Paste your Secret Key (Node ID)"
                    className="w-full bg-black/40 border border-gray-700 rounded-xl py-3 pl-12 pr-4 text-white focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition-all placeholder-gray-600 font-mono text-xs"
                    required
                  />
                </div>
                
                <button 
                  type="submit" 
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl transition-all flex items-center justify-center gap-2 group disabled:opacity-50"
                >
                  {loading ? 'Restoring...' : 'Log In'} 
                  {!loading && <Lock size={18} />}
                </button>
                <p className="text-xs text-gray-500 mt-4 leading-relaxed">
                  If you lost your local data, paste your original Node ID here to recover your session.
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}