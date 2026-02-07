import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ThumbsUp, ThumbsDown, Clock, ShieldCheck, ShieldAlert, ArrowDownUp, Star } from 'lucide-react';
import { getFeed, voteRumor } from '../api';
import { useToast } from '../components/ToastContext';

const TrustBadge = ({ score }) => {
  if (score > 0.7) return (
    <span className="flex items-center gap-1 bg-green-500/10 text-green-400 text-[10px] font-bold px-2 py-1 rounded border border-green-500/20">
      <ShieldCheck size={12} /> VERIFIED ({score.toFixed(2)})
    </span>
  );
  if (score < 0.3) return (
    <span className="flex items-center gap-1 bg-red-500/10 text-red-400 text-[10px] font-bold px-2 py-1 rounded border border-red-500/20">
      <ShieldAlert size={12} /> DISPUTED ({score.toFixed(2)})
    </span>
  );
  return (
    <span className="bg-gray-800 text-gray-400 text-[10px] font-bold px-2 py-1 rounded border border-gray-700">
      NEUTRAL ({score.toFixed(2)})
    </span>
  );
};

export default function FeedPage() {
  const [sortBy, setSortBy] = useState('recent'); // 'recent' | 'rated'
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const user = JSON.parse(localStorage.getItem('anon_user'));

  // Refetch every 2 minutes (120,000ms) as requested
  const { data: feed, isLoading, isRefetching } = useQuery({ 
    queryKey: ['feed'], 
    queryFn: getFeed, 
    refetchInterval: 120000 
  });

  const voteMutation = useMutation({
    mutationFn: ({ id, vote }) => voteRumor(id, user.id, vote),
    onSuccess: () => {
      queryClient.invalidateQueries(['feed']);
      queryClient.invalidateQueries(['mana']);
      addToast('Vote cast successfully', 'success');
    },
    onError: (err) => addToast(err.response?.data?.error || 'Vote failed', 'error')
  });

  // Client-side sorting logic
  const sortedFeed = useMemo(() => {
    if (!feed) return [];
    const items = [...feed];
    if (sortBy === 'recent') {
      return items.sort((a, b) => b.timestamp - a.timestamp);
    } else {
      return items.sort((a, b) => b.score - a.score);
    }
  }, [feed, sortBy]);

  if (isLoading) return <div className="p-8 text-center text-gray-500 animate-pulse">Syncing with network...</div>;

  return (
    <div className="space-y-4 pb-20">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Global Rumor Feed</h2>
          {isRefetching && <p className="text-xs text-blue-400 animate-pulse">Updating feed...</p>}
        </div>

        {/* Sort Toggles */}
        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-800">
          <button
            onClick={() => setSortBy('recent')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              sortBy === 'recent' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Clock size={14} /> Most Recent
          </button>
          <button
            onClick={() => setSortBy('rated')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              sortBy === 'rated' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Star size={14} /> Highest Rated
          </button>
        </div>
      </div>
      
      {sortedFeed.length === 0 && (
        <div className="text-center p-12 border border-dashed border-gray-800 rounded-2xl bg-gray-900/50">
          <p className="text-gray-500">No rumors yet. Be the first to post!</p>
        </div>
      )}

      {sortedFeed.map(item => (
        <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 shadow-sm hover:border-gray-700 transition-colors group">
          <div className="flex justify-between items-start gap-4 mb-3">
            <p className="text-lg text-gray-100 leading-relaxed font-medium">{item.text}</p>
          </div>
          
          <div className="flex flex-wrap justify-between items-center gap-3 pt-3 border-t border-gray-800/50 mt-2">
            <div className="flex items-center gap-3">
              <TrustBadge score={item.score} />
              <div className="flex items-center gap-1 text-xs text-gray-500 font-mono">
                <span>{new Date(item.timestamp * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
              </div>
            </div>
            
            <div className="flex gap-2 opacity-100 sm:opacity-60 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={() => voteMutation.mutate({ id: item.id, vote: 1 })}
                disabled={voteMutation.isPending}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-green-900/30 text-gray-400 hover:text-green-400 rounded-lg transition text-xs font-bold uppercase tracking-wide border border-transparent hover:border-green-900/50"
              >
                <ThumbsUp size={14} /> Verify
              </button>
              <button 
                onClick={() => voteMutation.mutate({ id: item.id, vote: -1 })}
                disabled={voteMutation.isPending}
                className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-red-900/30 text-gray-400 hover:text-red-400 rounded-lg transition text-xs font-bold uppercase tracking-wide border border-transparent hover:border-red-900/50"
              >
                <ThumbsDown size={14} /> Dispute
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}