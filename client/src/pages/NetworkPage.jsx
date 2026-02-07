import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getNetworkStatus, connectPeer } from '../api';
import { Share2, Activity, Globe, Plus, Link as LinkIcon } from 'lucide-react';
import { useToast } from '../components/ToastContext';

export default function NetworkPage() {
  const [peerUrl, setPeerUrl] = useState('');
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ['network'], queryFn: getNetworkStatus, refetchInterval: 5000
  });

  const connectMutation = useMutation({
    mutationFn: (url) => connectPeer(url),
    onSuccess: () => {
      addToast('Connection request sent!', 'success');
      setPeerUrl('');
      // Force a refresh after 1s to show the new peer
      setTimeout(() => queryClient.invalidateQueries(['network']), 1000);
    },
    onError: (err) => addToast('Failed to connect. Check URL.', 'error')
  });

  const handleConnect = (e) => {
    e.preventDefault();
    if (!peerUrl) return;
    connectMutation.mutate(peerUrl);
  };

  return (
    <div className="space-y-6 pt-4">
      
      {/* Connect Box */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 shadow-lg">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Plus size={16} /> Manually Connect
        </h3>
        <form onSubmit={handleConnect} className="flex gap-2">
          <div className="relative flex-1">
            <LinkIcon className="absolute left-3 top-3 text-gray-500" size={16} />
            <input 
              type="text" 
              value={peerUrl}
              onChange={(e) => setPeerUrl(e.target.value)}
              placeholder="ws://192.168.1.X:5001/p2p"
              className="w-full bg-black/40 border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm font-mono"
            />
          </div>
          <button 
            type="submit" 
            disabled={connectMutation.isPending || !peerUrl}
            className="bg-blue-600 hover:bg-blue-500 text-white px-4 rounded-lg font-bold text-sm transition disabled:opacity-50"
          >
            {connectMutation.isPending ? 'Connecting...' : 'Connect'}
          </button>
        </form>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* ... (Keep existing stats code) ... */}
         <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex items-center gap-4">
          <div className="bg-green-900/20 p-3 rounded-full text-green-500"><Activity /></div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Status</p>
            <p className="font-bold text-green-400">Online</p>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex items-center gap-4">
          <div className="bg-blue-900/20 p-3 rounded-full text-blue-500"><Share2 /></div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Peers</p>
            <p className="text-xl font-bold text-white">{status?.peers?.length || 0}</p>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl flex items-center gap-4">
          <div className="bg-purple-900/20 p-3 rounded-full text-purple-500"><Globe /></div>
          <div>
            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Active Sockets</p>
            <p className="text-xl font-bold text-white">{status?.connections?.length || 0}</p>
          </div>
        </div>
      </div>

      {/* Peer List */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          Known Nodes <span className="bg-gray-800 text-xs px-2 py-0.5 rounded-full text-gray-500">{status?.peers?.length || 0}</span>
        </h3>
        
        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
          {(!status?.peers || status.peers.length === 0) ? (
            <div className="text-center py-8 text-gray-600 italic border border-dashed border-gray-800 rounded-lg">
              No peers discovered yet.
            </div>
          ) : (
            status?.peers?.map((p, i) => (
              <div key={i} className="flex items-center gap-3 bg-black/20 p-3 rounded-lg border border-gray-800/50">
                <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                <span className="font-mono text-sm text-gray-300 truncate">{p.peerId}</span>
                <span className="text-xs text-gray-600 ml-auto bg-gray-900 px-2 py-1 rounded">{p.url || 'Gossip Discovery'}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}