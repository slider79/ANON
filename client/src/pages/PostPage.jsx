import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Send, AlertTriangle, Zap } from 'lucide-react';
import { postRumor } from '../api';
import { useToast } from '../components/ToastContext';

export default function PostPage() {
  const [text, setText] = useState('');
  const navigate = useNavigate();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const user = JSON.parse(localStorage.getItem('anon_user'));

  const mutation = useMutation({
    mutationFn: (txt) => postRumor(user.id, txt),
    onSuccess: () => {
      addToast('Rumor broadcast to network', 'success');
      queryClient.invalidateQueries(['feed']);
      queryClient.invalidateQueries(['mana']);
      navigate('/');
    },
    onError: (err) => addToast(err.response?.data?.error || 'Failed to post', 'error')
  });

  return (
    <div className="max-w-lg mx-auto pt-6">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-xl">
        <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
          <Send className="text-blue-500" size={24} /> New Rumor
        </h2>
        
        <div className="bg-blue-900/20 border border-blue-500/20 p-4 rounded-lg mb-6 flex gap-3 text-sm text-blue-200">
          <Zap size={20} className="shrink-0 text-yellow-400 fill-yellow-400" />
          <p>
            Posting costs <strong>50 Mana</strong>. 
            <br/><span className="text-blue-300/70 text-xs">Ensure your rumor is accurate; low reputation reduces your future influence.</span>
          </p>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={6}
          placeholder="What's happening on campus?"
          className="w-full bg-black/40 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none mb-2 outline-none transition-all"
        />
        
        <div className="flex justify-between items-center mt-2">
          <span className={`text-xs ${text.length > 450 ? 'text-red-400' : 'text-gray-500'}`}>
            {text.length}/500
          </span>
          <button
            onClick={() => mutation.mutate(text)}
            disabled={!text.trim() || mutation.isPending}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-bold transition flex items-center gap-2"
          >
            {mutation.isPending ? 'Broadcasting...' : 'Broadcast Rumor'}
          </button>
        </div>
      </div>
    </div>
  );
}