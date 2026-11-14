import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, ShieldCheck, ShieldAlert, Users, UserCheck, UserX,
  Search, Filter, Check, X, MessageSquare, AlertTriangle,
  Building2, Trophy, ShoppingBag, Clock, Mail, Phone,
  ExternalLink, ChevronRight, Activity, Ban, RefreshCw,
  Sparkles, CheckCircle2, Lock, Radio, MapPin
} from 'lucide-react';
import UserAvatar from '../components/UserAvatar';
import SportIcon from '../components/SportIcon';
import {
  apiFetchAllUsersForAdmin,
  apiToggleUserVerification,
  apiToggleUserSuspension,
  apiFetchAdminSecurityMetrics,
  apiFetchBookings,
  apiFetchTournaments,
  apiFetchMarketplaceItems
} from '../services/db';

export default function AdminSecurity({ user, setTab, onOpenProfileSwitcher }) {
  const [activeSubTab, setActiveSubTab] = useState('verification'); // 'verification' | 'activity' | 'support'
  const [usersList, setUsersList] = useState([]);
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    verifiedUsers: 0,
    pendingUsers: 0,
    playersCount: 0,
    ownersCount: 0,
    totalVenues: 0,
    totalTournaments: 0,
    totalListings: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'player' | 'owner'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'pending' | 'verified' | 'suspended'
  const [actionInProgress, setActionInProgress] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);

  // Activity Feed Data
  const [recentActivity, setRecentActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Load Admin Data
  const loadAdminData = async () => {
    setLoading(true);
    try {
      const [allUsers, stats] = await Promise.all([
        apiFetchAllUsersForAdmin(),
        apiFetchAdminSecurityMetrics()
      ]);
      setUsersList(allUsers);
      setMetrics(stats);
    } catch (err) {
      console.warn('loadAdminData error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();

    // Listen for real-time verification changes
    const handleVerifyEvent = () => loadAdminData();
    window.addEventListener('turfington_user_verified', handleVerifyEvent);
    window.addEventListener('turfington_user_suspended', handleVerifyEvent);
    return () => {
      window.removeEventListener('turfington_user_verified', handleVerifyEvent);
      window.removeEventListener('turfington_user_suspended', handleVerifyEvent);
    };
  }, []);

  // Load Activity Data when tab is switched
  useEffect(() => {
    if (activeSubTab === 'activity') {
      setActivityLoading(true);
      Promise.all([
        apiFetchTournaments().catch(() => []),
        apiFetchMarketplaceItems().catch(() => [])
      ]).then(([tourneys, marketplace]) => {
        const events = [];

        (tourneys || []).forEach(t => {
          events.push({
            id: 'tourney_' + t.id,
            type: 'tournament',
            title: `Tournament Hosted: ${t.title || 'Competition'}`,
            subtitle: `Venue: ${t.venue || 'Sports Complex'} • Organizer: ${t.organizer || 'Owner'}`,
            timestamp: t.createdAt || t.created_at || new Date().toISOString(),
            badge: 'Tournament',
            badgeColor: 'indigo'
          });
        });

        (marketplace || []).forEach(m => {
          events.push({
            id: 'market_' + m.id,
            type: 'marketplace',
            title: `Gear Listed: ${m.name || 'Sports Item'}`,
            subtitle: `Seller: ${m.sellerName || 'Member'} • Price: ₹${m.price}`,
            timestamp: m.createdAt || m.created_at || new Date().toISOString(),
            badge: 'Marketplace',
            badgeColor: 'emerald'
          });
        });

        events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        setRecentActivity(events);
        setActivityLoading(false);
      });
    }
  }, [activeSubTab]);

  const showNotification = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Toggle Verification Handler
  const handleToggleVerification = async (targetUser) => {
    const newStatus = !targetUser.is_verified;
    const uid = targetUser.id || targetUser.uid;
    setActionInProgress(uid);

    try {
      await apiToggleUserVerification(uid, newStatus);
      setUsersList(prev => prev.map(u => (u.id === uid || u.uid === uid) ? {
        ...u,
        is_verified: newStatus,
        verified_at: newStatus ? new Date().toISOString() : null
      } : u));
      setMetrics(prev => ({
        ...prev,
        verifiedUsers: newStatus ? prev.verifiedUsers + 1 : Math.max(0, prev.verifiedUsers - 1),
        pendingUsers: newStatus ? Math.max(0, prev.pendingUsers - 1) : prev.pendingUsers + 1
      }));
      showNotification(`${targetUser.full_name} is now ${newStatus ? 'VERIFIED ✓' : 'UNVERIFIED'}`);
    } catch (err) {
      console.warn('handleToggleVerification error:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  // Toggle Suspension Handler
  const handleToggleSuspension = async (targetUser) => {
    const newStatus = !targetUser.is_suspended;
    const uid = targetUser.id || targetUser.uid;
    setActionInProgress(uid);

    try {
      await apiToggleUserSuspension(uid, newStatus);
      setUsersList(prev => prev.map(u => (u.id === uid || u.uid === uid) ? {
        ...u,
        is_suspended: newStatus
      } : u));
      showNotification(`${targetUser.full_name} account ${newStatus ? 'SUSPENDED' : 'RESTORED'}`);
    } catch (err) {
      console.warn('handleToggleSuspension error:', err);
    } finally {
      setActionInProgress(null);
    }
  };

  // Open Direct Support Chat with user
  const handleContactUserForVerification = (targetUser) => {
    const targetUid = targetUser.id || targetUser.uid || targetUser.firebase_uid;
    const targetName = targetUser.full_name || targetUser.name || 'Member';
    const initialMsg = `Hello ${targetName}! This is Turfington Customer Support & Security. We are reaching out regarding your account verification and platform safety checks. Please confirm your profile details.`;

    const chatTarget = {
      id: targetUid,
      firebase_uid: targetUid,
      full_name: targetName,
      name: targetName,
      displayName: targetName,
      avatar: targetUser.avatar || '',
      avatarUrl: targetUser.avatarUrl || targetUser.avatar || '',
      role: targetUser.role || 'player',
      initialMessage: initialMsg,
      contextBanner: {
        type: 'support',
        title: 'Customer Support & Verification Desk',
        price: 'Official Staff',
        image: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=200',
        subtitle: `Verifying: ${targetName} (${targetUser.role === 'owner' ? 'Venue Owner' : 'Player'})`
      }
    };

    try {
      localStorage.setItem('turfington_target_chat_user', JSON.stringify(chatTarget));
    } catch {}

    if (typeof setTab === 'function') {
      setTab('community');
    }

    setTimeout(() => {
      try {
        window.dispatchEvent(new CustomEvent('turfington_open_direct_chat_target', { detail: chatTarget }));
      } catch {}
    }, 60);
  };

  // Filtered Users
  const filteredUsers = useMemo(() => {
    return usersList.filter(u => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (u.full_name || u.name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const phone = (u.phone || '').toLowerCase();
        const city = (u.city || u.location || '').toLowerCase();
        const sport = (u.sport || '').toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !phone.includes(q) && !city.includes(q) && !sport.includes(q)) {
          return false;
        }
      }

      // 2. Role Filter
      if (roleFilter !== 'all') {
        if (roleFilter === 'owner' && u.role !== 'owner') return false;
        if (roleFilter === 'player' && u.role !== 'player') return false;
      }

      // 3. Status Filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'verified' && !u.is_verified) return false;
        if (statusFilter === 'pending' && u.is_verified) return false;
        if (statusFilter === 'suspended' && !u.is_suspended) return false;
      }

      return true;
    });
  }, [usersList, searchQuery, roleFilter, statusFilter]);

  return (
    <div className="pt-24 sm:pt-28 min-h-screen bg-[#070709] text-white pb-24 font-sans antialiased">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        
        {/* ── TOP HEADER WITH ADMIN SECURITY BADGE ────────────── */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-950/40 via-[#101018] to-[#0a0a0f] border border-purple-500/20 p-6 md:p-8 shadow-2xl">
          <div className="absolute top-0 right-0 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-black uppercase tracking-widest shadow-sm">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
                <span>Admin & Security Control Center</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-black tracking-tight text-white">
                Customer Support & Verification Desk
              </h1>
              <p className="text-sm text-neutral-400 max-w-2xl leading-relaxed">
                Monitor platform operations, verify athlete & venue owner credentials, review marketplace items, and conduct official in-app support communication.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={loadAdminData}
                disabled={loading}
                className="px-4 py-2.5 rounded-2xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/10 text-xs font-bold text-neutral-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer shadow-sm"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-400' : ''}`} />
                <span>Sync Data</span>
              </button>

              <button
                type="button"
                onClick={onOpenProfileSwitcher}
                className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg shadow-purple-600/25 cursor-pointer"
              >
                <Radio className="w-3.5 h-3.5 text-purple-200" />
                <span>Switch Account</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── NOTIFICATION TOAST ──────────────────────────────── */}
        <AnimatePresence>
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-24 right-6 z-50 px-5 py-3 rounded-2xl bg-purple-600 text-white text-xs font-bold flex items-center gap-2.5 shadow-2xl border border-purple-400/40"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-300" />
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── KEY PLATFORM SECURITY & VERIFICATION METRICS ─────── */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-3xl bg-[#111117] border border-white/8 space-y-2 shadow-lg">
            <div className="flex items-center justify-between text-neutral-400">
              <span className="text-xs font-bold uppercase tracking-wider">Registered Profiles</span>
              <Users className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl lg:text-3xl font-display font-black text-white">
              {metrics.totalUsers}
            </div>
            <p className="text-[11px] text-neutral-500">
              {metrics.playersCount} Players • {metrics.ownersCount} Venue Owners
            </p>
          </div>

          <div className="p-5 rounded-3xl bg-[#111117] border border-white/8 space-y-2 shadow-lg">
            <div className="flex items-center justify-between text-neutral-400">
              <span className="text-xs font-bold uppercase tracking-wider">Verified Accounts</span>
              <UserCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl lg:text-3xl font-display font-black text-emerald-400 flex items-center gap-2">
              <span>{metrics.verifiedUsers}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {metrics.totalUsers > 0 ? Math.round((metrics.verifiedUsers / metrics.totalUsers) * 100) : 0}%
              </span>
            </div>
            <p className="text-[11px] text-neutral-500">
              {metrics.pendingUsers} profiles pending review
            </p>
          </div>

          <div className="p-5 rounded-3xl bg-[#111117] border border-white/8 space-y-2 shadow-lg">
            <div className="flex items-center justify-between text-neutral-400">
              <span className="text-xs font-bold uppercase tracking-wider">Monitored Facilities</span>
              <Building2 className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl lg:text-3xl font-display font-black text-white">
              {metrics.totalVenues}
            </div>
            <p className="text-[11px] text-neutral-500">
              Active sports turf locations
            </p>
          </div>

          <div className="p-5 rounded-3xl bg-[#111117] border border-white/8 space-y-2 shadow-lg">
            <div className="flex items-center justify-between text-neutral-400">
              <span className="text-xs font-bold uppercase tracking-wider">Tournaments & Gear</span>
              <Trophy className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl lg:text-3xl font-display font-black text-white">
              {metrics.totalTournaments + metrics.totalListings}
            </div>
            <p className="text-[11px] text-neutral-500">
              {metrics.totalTournaments} Tournaments • {metrics.totalListings} Market Items
            </p>
          </div>
        </div>

        {/* ── SECTION NAVIGATION TABS ─────────────────────────── */}
        <div className="flex items-center space-x-2 border-b border-white/8 pb-2">
          <button
            type="button"
            onClick={() => setActiveSubTab('verification')}
            className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'verification'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Profile Verification Desk</span>
            <span className="px-1.5 py-0.5 rounded-full bg-white/20 text-[10px]">
              {filteredUsers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('activity')}
            className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'activity'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Platform Activity Monitoring</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('support')}
            className={`px-5 py-2.5 rounded-2xl text-xs font-extrabold transition-all cursor-pointer flex items-center gap-2 ${
              activeSubTab === 'support'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Support Messaging Desk</span>
          </button>
        </div>

        {/* ── TAB 1: PROFILE VERIFICATION DESK ────────────────── */}
        {activeSubTab === 'verification' && (
          <div className="space-y-6">
            
            {/* Search & Filter Bar */}
            <div className="p-4 rounded-3xl bg-[#111117] border border-white/8 flex flex-col md:flex-row items-center justify-between gap-4">
              {/* Search input */}
              <div className="relative w-full md:w-96">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search user name, email, phone, city..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/10 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-purple-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white text-xs"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                <div className="flex items-center space-x-1 p-1 bg-white/[0.03] rounded-2xl border border-white/8 text-[11px] font-bold">
                  <button
                    onClick={() => setRoleFilter('all')}
                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                      roleFilter === 'all' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    All Roles
                  </button>
                  <button
                    onClick={() => setRoleFilter('player')}
                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                      roleFilter === 'player' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Players
                  </button>
                  <button
                    onClick={() => setRoleFilter('owner')}
                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                      roleFilter === 'owner' ? 'bg-purple-600 text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Venue Owners
                  </button>
                </div>

                <div className="flex items-center space-x-1 p-1 bg-white/[0.03] rounded-2xl border border-white/8 text-[11px] font-bold">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                      statusFilter === 'all' ? 'bg-white/10 text-white' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    All Status
                  </button>
                  <button
                    onClick={() => setStatusFilter('pending')}
                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                      statusFilter === 'pending' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Pending Review
                  </button>
                  <button
                    onClick={() => setStatusFilter('verified')}
                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer ${
                      statusFilter === 'verified' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Verified Only
                  </button>
                </div>
              </div>
            </div>

            {/* User Cards Grid */}
            {loading ? (
              <div className="p-16 text-center text-neutral-500 space-y-3">
                <RefreshCw className="w-8 h-8 mx-auto animate-spin text-purple-400" />
                <p className="text-sm font-bold">Loading member credentials from secure database...</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-16 rounded-3xl bg-[#111117] border border-white/8 text-center space-y-3 text-neutral-500">
                <UserX className="w-10 h-10 mx-auto text-neutral-600" />
                <h3 className="text-base font-bold text-white">No Profiles Found</h3>
                <p className="text-xs text-neutral-400">No member accounts matched your search and filter criteria.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredUsers.map((u) => {
                  const uid = u.id || u.uid;
                  const isBusy = actionInProgress === uid;
                  const isOwner = u.role === 'owner';

                  return (
                    <motion.div
                      key={uid}
                      layout
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`p-5 rounded-3xl bg-[#111117] border transition-all duration-200 space-y-4 shadow-xl relative overflow-hidden flex flex-col justify-between ${
                        u.is_suspended
                          ? 'border-rose-500/40 bg-rose-950/10'
                          : u.is_verified
                          ? 'border-emerald-500/30'
                          : 'border-white/8 hover:border-white/15'
                      }`}
                    >
                      {/* Top Header Row */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center space-x-3 min-w-0">
                          <div className="relative flex-shrink-0">
                            <UserAvatar user={u} className="w-12 h-12 text-base" />
                            <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#111117] ${
                              isOwner ? 'bg-amber-400' : 'bg-indigo-400'
                            }`} />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5">
                              <h3 className="font-display font-black text-white text-sm truncate max-w-[140px] sm:max-w-[170px]">
                                {u.full_name || u.name || 'Member'}
                              </h3>
                              {u.is_verified && (
                                <span title="Verified Profile">
                                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-neutral-400 truncate mt-0.5">
                              {u.email || 'No email registered'}
                            </p>
                          </div>
                        </div>

                        {/* Status pill */}
                        <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-full border shrink-0 ${
                          u.is_suspended
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                            : u.is_verified
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}>
                          {u.is_suspended ? 'Suspended' : u.is_verified ? 'Verified ✓' : 'Pending Review'}
                        </span>
                      </div>

                      {/* Details Meta */}
                      <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/5 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between text-neutral-400">
                          <span>Role:</span>
                          <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] uppercase border ${
                            isOwner ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20'
                          }`}>
                            {isOwner ? 'Venue Owner' : 'Player'}
                          </span>
                        </div>

                        {u.phone && (
                          <div className="flex items-center justify-between text-neutral-400">
                            <span>Phone:</span>
                            <span className="font-mono text-white text-[11px]">{u.phone}</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between text-neutral-400">
                          <span>Primary Sport:</span>
                          <span className="text-white font-medium flex items-center gap-1 text-[11px]">
                            <SportIcon sport={u.sport || 'Football'} size={12} />
                            {u.sport || 'Multi-Sport'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-neutral-400">
                          <span>Location:</span>
                          <span className="text-neutral-300 text-[11px] flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-neutral-500" />
                            {u.city || u.location || 'Chennai'}
                          </span>
                        </div>
                      </div>

                      {/* Actions Toolbar */}
                      <div className="pt-2 border-t border-white/5 flex items-center gap-2">
                        {/* Verify / Revoke Button */}
                        <button
                          type="button"
                          onClick={() => handleToggleVerification(u)}
                          disabled={isBusy}
                          className={`flex-1 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm ${
                            u.is_verified
                              ? 'bg-white/5 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 text-neutral-400 hover:text-rose-300'
                              : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                          }`}
                        >
                          {isBusy ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : u.is_verified ? (
                            <>
                              <X className="w-3.5 h-3.5" />
                              <span>Revoke</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Verify Profile</span>
                            </>
                          )}
                        </button>

                        {/* Customer Support Message Button */}
                        <button
                          type="button"
                          onClick={() => handleContactUserForVerification(u)}
                          title="Open Customer Support Chat with this User"
                          className="p-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 hover:text-white transition-all cursor-pointer"
                        >
                          <MessageSquare className="w-4 h-4" />
                        </button>

                        {/* Flag / Suspend Toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleSuspension(u)}
                          title={u.is_suspended ? 'Restore Account' : 'Flag / Suspend Account'}
                          className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                            u.is_suspended
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/30'
                              : 'bg-white/5 hover:bg-rose-500/20 text-neutral-400 hover:text-rose-300 border-white/10 hover:border-rose-500/30'
                          }`}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── TAB 2: LIVE PLATFORM ACTIVITY MONITORING ────────── */}
        {activeSubTab === 'activity' && (
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-[#111117] border border-white/8 space-y-4">
              <div className="flex items-center justify-between pb-4 border-b border-white/8">
                <div>
                  <h3 className="font-display font-black text-white text-lg">Real-Time Platform Event Log</h3>
                  <p className="text-xs text-neutral-400">Monitoring tournament announcements, gear listings, and customer bookings</p>
                </div>
                <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Stream Active
                </span>
              </div>

              {activityLoading ? (
                <div className="p-12 text-center text-neutral-500 space-y-2">
                  <RefreshCw className="w-6 h-6 mx-auto animate-spin text-purple-400" />
                  <p className="text-xs">Aggregating real-time operations...</p>
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="p-12 text-center text-neutral-500 space-y-2">
                  <Activity className="w-8 h-8 mx-auto text-neutral-600" />
                  <p className="text-xs">No recent platform activities recorded in this session.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map(ev => (
                    <div
                      key={ev.id}
                      className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-between gap-4 hover:bg-white/[0.04] transition-colors"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300">
                          {ev.type === 'tournament' ? <Trophy className="w-4 h-4" /> : <ShoppingBag className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{ev.title}</h4>
                          <p className="text-[11px] text-neutral-400 truncate">{ev.subtitle}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 shrink-0">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-neutral-300">
                          {ev.badge}
                        </span>
                        <span className="text-[10px] text-neutral-500 font-mono">
                          {new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── TAB 3: CUSTOMER SUPPORT & SECURITY DESK ─────────── */}
        {activeSubTab === 'support' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Box 1: Support Messages Hub */}
              <div className="p-6 rounded-3xl bg-[#111117] border border-white/8 space-y-4 shadow-xl">
                <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-2xl w-fit text-purple-400">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <h3 className="font-display font-black text-white text-lg">In-App Customer Support DMs</h3>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  As the Official Admin & Security agent, you can message any user, player, or venue owner directly from inside the app with full end-to-end encryption.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (typeof setTab === 'function') setTab('community');
                  }}
                  className="w-full py-3 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-600/30 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Open Support Messages Inbox</span>
                </button>
              </div>

              {/* Box 2: Verification Standards Checklist */}
              <div className="p-6 rounded-3xl bg-[#111117] border border-white/8 space-y-4 shadow-xl">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl w-fit text-emerald-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="font-display font-black text-white text-lg">Verification Standards</h3>
                <ul className="space-y-2 text-xs text-neutral-400">
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Venue Owners must supply valid court address & photos</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Players must have authenticated Google or verified mobile number</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Tournament organizers must declare fair-play terms & prize transparency</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span>Marketplace sellers must confirm accurate gear condition photos</span>
                  </li>
                </ul>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}

