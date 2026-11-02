import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Search, 
  UserCheck, 
  UserPlus, 
  MessageSquare, 
  Copy, 
  Check, 
  Users, 
  Sparkles,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import UserAvatar from './UserAvatar';
import { isUserFollowing } from '../services/followService';

export default function FollowersListModal({
  isOpen,
  onClose,
  initialTab = 'followers',
  currentUser,
  followersList = [],
  followingList = [],
  onFollowToggle,
  onStartDirectChat,
  onNavigateDiscover
}) {
  const [activeTab, setActiveTab] = useState(initialTab); // 'followers' | 'following'
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const currentList = activeTab === 'followers' ? followersList : followingList;

  // Filter list by search query
  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return currentList;
    const q = searchQuery.toLowerCase().trim();
    return currentList.filter(athlete => {
      const name = String(athlete.name || athlete.full_name || '').toLowerCase();
      const handle = String(athlete.player_id || athlete.handle || '').toLowerCase();
      const email = String(athlete.email || '').toLowerCase();
      return name.includes(q) || handle.includes(q) || email.includes(q);
    });
  }, [currentList, searchQuery]);

  const handleCopyHandle = (handle, e) => {
    e.stopPropagation();
    if (!handle) return;
    try {
      navigator.clipboard.writeText(handle);
      setCopiedId(handle);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Dialog */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative bg-[#111116] border border-white/10 rounded-3xl w-full max-w-lg shadow-[0_25px_80px_rgba(0,0,0,0.9)] overflow-hidden z-10 flex flex-col max-h-[85vh] text-left"
      >
        {/* Header */}
        <div className="p-6 pb-4 border-b border-white/5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-2xl">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-display font-black text-white text-lg tracking-tight">
                  Athletes Network
                </h3>
                <p className="text-xs text-neutral-400">
                  Manage your sports connections and followers
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tab Switcher Pills */}
          <div className="flex bg-[#0a0a0e] p-1 rounded-2xl border border-white/5">
            <button
              onClick={() => setActiveTab('followers')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                activeTab === 'followers'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <span>Followers</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                activeTab === 'followers' ? 'bg-white/20 text-white' : 'bg-white/5 text-neutral-400'
              }`}>
                {followersList.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('following')}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center space-x-2 cursor-pointer ${
                activeTab === 'following'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              <span>Following</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                activeTab === 'following' ? 'bg-white/20 text-white' : 'bg-white/5 text-neutral-400'
              }`}>
                {followingList.length}
              </span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="w-4 h-4 text-neutral-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder={`Search ${activeTab}...`}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#18181f] border border-white/5 rounded-xl pl-10 pr-9 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500/50 transition-colors"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Athletes List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3 min-h-[260px] no-scrollbar">
          {filteredList.length === 0 ? (
            <div className="py-12 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-neutral-500">
                <Users className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-xs mx-auto">
                <p className="text-white font-bold text-sm">
                  {searchQuery 
                    ? `No matching athletes found for "${searchQuery}"`
                    : activeTab === 'followers'
                    ? 'No followers yet'
                    : 'Not following anyone yet'
                  }
                </p>
                <p className="text-xs text-neutral-400 font-light">
                  {searchQuery
                    ? 'Try searching with a different name or Player ID handle.'
                    : activeTab === 'followers'
                    ? 'Connect with players on Discover or share your Player ID to grow your sports circle!'
                    : 'Explore nearby athletes on Discover to follow players and arrange friendly matches!'
                  }
                </p>
              </div>

              {onNavigateDiscover && !searchQuery && (
                <button
                  onClick={onNavigateDiscover}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-full transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
                >
                  Explore Players
                </button>
              )}
            </div>
          ) : (
            filteredList.map((athlete) => {
              const athleteId = athlete.id || athlete.uid;
              const isFollowing = isUserFollowing(currentUser, athlete);
              const displayHandle = athlete.player_id || athlete.handle || (athleteId ? `@athlete_${String(athleteId).slice(-4)}` : '@athlete');

              return (
                <div
                  key={athleteId || athlete.email}
                  className="p-3.5 rounded-2xl bg-[#16161c] border border-white/5 hover:border-white/15 transition-all flex items-center justify-between gap-3 group"
                >
                  {/* Avatar & Athlete Details */}
                  <div className="flex items-center space-x-3 min-w-0">
                    <UserAvatar
                      user={athlete}
                      className="w-11 h-11 border border-white/10 shrink-0 text-sm"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <h4 className="text-white font-bold text-sm truncate group-hover:text-indigo-300 transition-colors">
                          {athlete.name || athlete.full_name || 'Athlete'}
                        </h4>
                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full border shrink-0 ${
                          athlete.role === 'owner'
                            ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                            : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                        }`}>
                          {athlete.role === 'owner' ? '🏟️ Owner' : '🏃 Player'}
                        </span>
                      </div>

                      {/* Player ID with Copy trigger */}
                      <button
                        onClick={(e) => handleCopyHandle(displayHandle, e)}
                        className="flex items-center space-x-1 text-[11px] text-indigo-300 font-mono hover:text-white transition-colors cursor-pointer"
                        title="Click to copy Player ID"
                      >
                        <span>{displayHandle}</span>
                        {copiedId === displayHandle ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center space-x-2 shrink-0">
                    {/* Message Button */}
                    {onStartDirectChat && (
                      <button
                        onClick={() => onStartDirectChat(athlete)}
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white border border-white/5 transition-all cursor-pointer"
                        title="Direct Message"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {/* Follow / Unfollow / Follow Back Button */}
                    {onFollowToggle && (
                      <button
                        onClick={() => onFollowToggle(athlete)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 cursor-pointer ${
                          isFollowing
                            ? 'bg-white/5 hover:bg-rose-500/20 text-neutral-300 hover:text-rose-400 border border-white/10 hover:border-rose-500/30'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
                        }`}
                      >
                        {isFollowing ? (
                          <>
                            <UserCheck className="w-3.5 h-3.5 text-indigo-400 group-hover:hidden" />
                            <span className="group-hover:hidden">Following</span>
                            <span className="hidden group-hover:inline text-rose-400">Unfollow</span>
                          </>
                        ) : (
                          <>
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>{activeTab === 'followers' ? '+ Follow Back' : '+ Follow'}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#0c0c10] border-t border-white/5 text-center">
          <p className="text-[11px] text-neutral-500 font-mono">
            Turfington Verified Social Connections • Real-Time Cloud Sync
          </p>
        </div>
      </motion.div>
    </div>
  );
}
