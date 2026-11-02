import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Award, 
  Calendar, 
  Trophy, 
  Users, 
  Star, 
  Settings, 
  MessageSquare, 
  Compass, 
  ShieldAlert, 
  Sparkles,
  X,
  Lock,
  ArrowLeftRight,
  Loader2,
  Camera,
  Check,
  Flame,
  ShieldCheck,
  Clock,
  Share2,
  Copy,
  Hash
} from 'lucide-react';
import { apiUpdateProfile, apiFetchPlayerReviews, getRatingColor } from '../services/db';
import { getFollowCounts, getLocalFollowing, getLocalFollowers } from '../services/followService';
import { calculateCompletedMatches } from '../utils/formatters';
import { useToast } from '../context';
import { auth } from '../services/firebase';
import UserAvatar from '../components/UserAvatar';
import PlayerReviewSection from '../components/PlayerReviewSection';

const ALL_AVAILABLE_SPORTS = ['Football', 'Cricket', 'Badminton', 'Basketball', 'Tennis', 'Table Tennis', 'Volleyball', 'Pickleball', 'Bowling', 'Swimming', 'Squash'];

const getSportEmoji = (name) => {
  const map = {
    'Football': '⚽',
    'Cricket': '🏏',
    'Badminton': '🏸',
    'Basketball': '🏀',
    'Tennis': '🎾',
    'Table Tennis': '🏓',
    'Volleyball': '🏐',
    'Pickleball': '🎾',
    'Bowling': '🎳',
    'Swimming': '🏊',
    'Squash': '💥'
  };
  return map[name] || '🏆';
};

/* ─── Interactive PFP Crop & Reposition Modal ───────────── */
function PfpCropModal({ imageSrc, onClose, onConfirm }) {
  const [scale, setScale] = useState(1);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });

  const handleStart = (clientX, clientY) => {
    setIsDragging(true);
    dragStart.current = { x: clientX, y: clientY, initialX: posX, initialY: posY };
  };

  const handleMove = (clientX, clientY) => {
    if (!isDragging) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    setPosX(dragStart.current.initialX + dx);
    setPosY(dragStart.current.initialY + dy);
  };

  const handleEnd = () => {
    setIsDragging(false);
  };

  const handleConfirm = () => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const size = 400; // Resolution 400x400
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Clip circle
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      // Dark background fill
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, size, size);

      // Viewport size is 260px, Circular Mask is 210px
      // Scale ratio to canvas: 400 / 210 = 1.9047
      const ratio = size / 210;

      const imgAspect = img.width / img.height;
      let baseW = 260;
      let baseH = 260;
      if (imgAspect >= 1) {
        baseW = 260;
        baseH = 260 / imgAspect;
      } else {
        baseH = 260;
        baseW = 260 * imgAspect;
      }

      ctx.save();
      ctx.translate(size / 2 + posX * ratio, size / 2 + posY * ratio);
      ctx.scale(scale, scale);

      const drawW = baseW * ratio;
      const drawH = baseH * ratio;
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();

      const croppedUrl = canvas.toDataURL('image/jpeg', 0.92);
      onConfirm(croppedUrl);
    };
    img.src = imageSrc;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onClose} className="fixed inset-0 bg-black/90 backdrop-blur-2xl" />
      <div className="relative bg-[#111116] border border-white/15 rounded-3xl p-6 max-w-sm w-full z-10 text-center space-y-5 shadow-[0_25px_80px_rgba(0,0,0,0.95)]">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="text-left">
            <h3 className="font-display font-extrabold text-white text-base">Crop Profile Picture</h3>
            <p className="text-[11px] text-neutral-400 mt-0.5">Drag & zoom full photo into the circle</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 text-neutral-400 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewport displaying the full photo with circular mask */}
        <div 
          onMouseDown={(e) => { e.preventDefault(); handleStart(e.clientX, e.clientY); }}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={(e) => e.touches.length && handleStart(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => e.touches.length && handleMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={handleEnd}
          className="w-[260px] h-[260px] mx-auto rounded-2xl overflow-hidden bg-neutral-950 border border-white/10 relative cursor-move select-none shadow-2xl"
        >
          {/* Full Uncropped Photo */}
          <div 
            className="w-full h-full flex items-center justify-center relative"
            style={{
              transform: `translate(${posX}px, ${posY}px) scale(${scale})`,
              transformOrigin: 'center'
            }}
          >
            <img 
              src={imageSrc} 
              alt="Full Photo" 
              className="max-w-full max-h-full object-contain pointer-events-none"
            />
          </div>

          {/* Circular Cutout Overlay Mask */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[210px] h-[210px] rounded-full border-2 border-indigo-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.7)] flex items-center justify-center">
              <span className="text-[9px] font-bold text-white/80 uppercase tracking-wider bg-black/60 px-2.5 py-1 rounded-full backdrop-blur-sm">Drag photo</span>
            </div>
          </div>
        </div>

        {/* Zoom Slider */}
        <div className="space-y-1.5 px-2">
          <div className="flex justify-between text-[10px] text-neutral-400 font-bold uppercase tracking-wider">
            <span>Zoom / Fit</span>
            <span>{scale.toFixed(2)}x</span>
          </div>
          <input 
            type="range" min="0.5" max="3.5" step="0.05" value={scale}
            onChange={(e) => setScale(parseFloat(e.target.value))}
            className="w-full accent-indigo-500 bg-neutral-800 rounded-lg cursor-pointer h-1.5"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-full text-xs font-bold text-neutral-400 hover:text-white bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            className="px-6 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>OK</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function loadUserBookings(userId) {
  try {
    const sU = userId ? localStorage.getItem(`turfington_user_bookings_${userId}`) : null;
    if (sU) {
      const parsed = JSON.parse(sU);
      if (Array.isArray(parsed)) return parsed;
    }
    const s1 = localStorage.getItem('turfington_user_bookings');
    if (s1) {
      const parsed = JSON.parse(s1);
      if (Array.isArray(parsed)) {
        return userId ? parsed.filter(b => b.user_id === userId || b.userId === userId) : parsed;
      }
    }
  } catch {}
  return [];
}

export default function Profile({ 
  user, 
  role, 
  bookings,
  onLogout, 
  onSwitchRole, 
  onOpenProfileSwitcher,
  onUpdateUser,
  setRole 
}) {
  const { toast } = useToast();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('Overview');
  const [isSaving, setIsSaving] = useState(false);

  // Edit Profile States (Simple WhatsApp / Instagram Style)
  const rawPlayerId = (typeof user?.player_id === 'string' && user.player_id)
    || (typeof user?.handle === 'string' && user.handle)
    || (typeof user?.username === 'string' && user.username)
    || '';
  const initialPlayerId = rawPlayerId
    ? (rawPlayerId.startsWith('@') ? rawPlayerId : `@${rawPlayerId}`)
    : `@${(user?.full_name || user?.name || user?.email?.split('@')[0] || 'player').toString().toLowerCase().replace(/[^a-z0-9]/g, '')}_${(user?.id || user?.firebase_uid || '9842').toString().slice(-4)}`;

  const [editName, setEditName] = useState(user?.full_name || user?.name || '');
  const [editTitle, setEditTitle] = useState(user?.title || (role === 'owner' ? 'Venue Owner' : 'Sports Player'));
  const [editAvatar, setEditAvatar] = useState(user?.avatar_url || user?.avatar || '');
  const [editPlayerId, setEditPlayerId] = useState(initialPlayerId);
  const [copiedId, setCopiedId] = useState(false);
  const [toastMessage, setToastMessage] = useState('');

  // Default Seed Written Reviews - only real reviews
  const DEFAULT_INITIAL_REVIEWS = [];

  // Player Reviews & Overall Rating Data
  const [reviewsData, setReviewsData] = useState({
    totalReviews: 0,
    avgPerformance: null,
    avgBehaviour: null,
    overallScore: null,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    reviews: []
  });
  const [showReviewsModal, setShowReviewsModal] = useState(false);

  const currentUserId = user?.id || user?.uid || user?.firebase_uid;

  // Real-time Follow Counts (Followers & Following)
  const [followCounts, setFollowCounts] = useState(() => ({
    followingCount: getLocalFollowing(currentUserId).length,
    followersCount: getLocalFollowers(currentUserId).length
  }));

  useEffect(() => {
    if (!currentUserId) return;
    const refreshFollow = () => {
      setFollowCounts({
        followingCount: getLocalFollowing(currentUserId).length,
        followersCount: getLocalFollowers(currentUserId).length
      });
      getFollowCounts(currentUserId).then(counts => {
        if (counts) setFollowCounts(counts);
      });
    };

    refreshFollow();
    window.addEventListener('turfington_follow_change', refreshFollow);
    return () => window.removeEventListener('turfington_follow_change', refreshFollow);
  }, [currentUserId]);

  // Real-time Matches Count from Slot Bookings
  // Only completed slots (where slot end time has passed) count towards Matches (+1).
  // Cancelled or rejected slots are excluded (-1).
  const [completedMatchesCount, setCompletedMatchesCount] = useState(() => {
    const local = loadUserBookings(currentUserId);
    const initialBookings = (bookings && bookings.length > 0) ? bookings : local;
    return calculateCompletedMatches(initialBookings);
  });

  useEffect(() => {
    const updateMatches = () => {
      const local = loadUserBookings(currentUserId);
      const allBookings = (bookings && bookings.length > 0) ? bookings : local;
      setCompletedMatchesCount(calculateCompletedMatches(allBookings));
    };

    updateMatches();

    // Check periodically so when a slot end time passes (e.g. 5:00 PM), it dynamically counts +1
    const interval = setInterval(updateMatches, 15000);
    window.addEventListener('storage', updateMatches);
    window.addEventListener('turfington_booking_updated', updateMatches);
    window.addEventListener('turfington_bookings_updated', updateMatches);

    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', updateMatches);
      window.removeEventListener('turfington_booking_updated', updateMatches);
      window.removeEventListener('turfington_bookings_updated', updateMatches);
    };
  }, [currentUserId, bookings]);

  useEffect(() => {
    const targetPlayerId = user?.id || user?.firebase_uid || user?.email || 'usr_me';
    apiFetchPlayerReviews(targetPlayerId).then(data => {
      if (data && data.success) {
        setReviewsData({
          totalReviews: data.totalReviews || (data.reviews?.length || 0),
          avgPerformance: data.avgPerformance,
          avgBehaviour: data.avgBehaviour,
          overallScore: data.overallScore,
          distribution: data.distribution || { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
          reviews: data.reviews || []
        });
      }
    });
  }, [user?.id, user?.firebase_uid, user?.email]);

  const ratingScore = reviewsData?.overallScore || (reviewsData?.totalReviews > 0 ? 5.0 : null);
  const ratingStyle = getRatingColor(ratingScore || 5.0);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3200);
  };

  // PFP Crop Modal State
  const [showCropModal, setShowCropModal] = useState(false);
  const [rawCropImage, setRawCropImage] = useState('');
  const avatarFileInputRef = useRef(null);

  useEffect(() => {
    if (user) {
      setEditName(user.full_name || user.name || '');
      setEditTitle(user.title || (role === 'owner' ? 'Venue Owner' : 'Sports Player'));
      setEditAvatar(user.avatar_url || user.avatar || '');
      const pid = (typeof user.player_id === 'string' && user.player_id)
        || (typeof user.handle === 'string' && user.handle)
        || (typeof user.username === 'string' && user.username)
        || '';
      setEditPlayerId(pid ? (pid.startsWith('@') ? pid : `@${pid}`) : initialPlayerId);
    }
  }, [user, role, initialPlayerId]);

  const handleAvatarFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setRawCropImage(reader.result);
        setShowCropModal(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCopyPlayerId = () => {
    const targetId = editPlayerId || initialPlayerId;
    navigator.clipboard.writeText(targetId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
    showToast(`✓ Player ID ${targetId} copied! Share it to connect.`);
  };

  const handleShareProfile = () => {
    const targetId = editPlayerId || initialPlayerId;
    const cleanHandle = targetId.replace(/^@/, '');
    const shareText = `Connect with me on Turfington! My Player ID is ${targetId} (https://turfington.app/player/${cleanHandle})`;

    if (navigator.share) {
      navigator.share({
        title: `${editName || 'Player'} on Turfington`,
        text: shareText,
        url: `https://turfington.app/player/${cleanHandle}`
      }).catch(() => {
        navigator.clipboard.writeText(shareText);
        showToast(`✓ Profile link & Player ID ${targetId} copied!`);
      });
    } else {
      navigator.clipboard.writeText(shareText);
      showToast(`✓ Profile link & Player ID ${targetId} copied!`);
    }
  };

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      const targetId = user?.id || user?.firebase_uid || user?.email || user?.username;
      const formattedPlayerId = (typeof editPlayerId === 'string' && editPlayerId.startsWith('@')) ? editPlayerId : `@${editPlayerId}`;

      if (targetId) {
        const { success, error } = await apiUpdateProfile(targetId, {
          full_name: editName,
          title: editTitle,
          avatar_url: editAvatar,
          avatar: editAvatar,
          player_id: formattedPlayerId,
          handle: formattedPlayerId
        });
        if (!success) {
          toast.error(error || 'Failed to save profile to database');
          setIsSaving(false);
          return;
        }
      }

      if (onUpdateUser) {
        onUpdateUser({
          full_name: editName,
          title: editTitle,
          avatar_url: editAvatar,
          avatar: editAvatar,
          player_id: formattedPlayerId,
          handle: formattedPlayerId
        });
      }
      setIsSettingsOpen(false);
      showToast('✓ Profile & Player ID updated!');
    } catch (err) {
      console.error('Failed to save profile:', err);
      toast.error('An error occurred while saving profile.');
    } finally {
      setIsSaving(false);
    }
  };

  // Dynamic profile statistics
  const userStats = role === 'owner' ? [
    { name: 'Hosted Events', value: String(completedMatchesCount) },
    { name: 'Followers', value: String(followCounts.followersCount) },
    { name: 'Following', value: String(followCounts.followingCount) },
    { name: 'Rating', value: ratingScore }
  ] : [
    { name: 'Matches', value: String(completedMatchesCount) },
    { name: 'Followers', value: String(followCounts.followersCount) },
    { name: 'Following', value: String(followCounts.followingCount) }
  ];

  const rawInterests = (Array.isArray(user?.sports_interests) && user.sports_interests.length > 0)
    ? user.sports_interests
    : (Array.isArray(user?.interests) && user.interests.length > 0)
      ? user.interests
      : ['Football', 'Cricket', 'Badminton'];

  const sportsInterestsList = rawInterests.map(i => {
    if (typeof i === 'string') return i;
    if (i && typeof i === 'object') return i.sport || i.name || 'Sports';
    return String(i || 'Sports');
  });

  const rawAvatar = (typeof user?.avatar_url === 'string' && user.avatar_url)
    || (typeof user?.avatar === 'string' && user.avatar)
    || '';
  const isCustomPhoto = Boolean(
    rawAvatar
    && typeof rawAvatar === 'string'
    && !rawAvatar.includes('ui-avatars.com')
    && (rawAvatar.startsWith('data:') || rawAvatar.startsWith('http'))
  );
  const fullNameStr = (user?.full_name || user?.name || user?.email || 'Player').toString();
  const firstInitial = fullNameStr.trim().charAt(0).toUpperCase() || 'P';

  const profile = {
    name: user?.full_name || user?.name || 'Turfington Player',
    title: user?.title || (role === 'owner' ? 'Venue Owner' : 'Sports Player'),
    avatar: isCustomPhoto ? rawAvatar : null,
    firstInitial,
    stats: userStats,
    interests: sportsInterestsList.map(s => ({ sport: s, level: 'Player', icon: getSportEmoji(s) }))
  };

  return (
    <div className="min-h-screen bg-transparent pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-left transition-colors duration-500">
      
      {/* 1. CENTERED WHATSAPP / INSTAGRAM STYLE HEADER (NO COVER PHOTO) */}
      <div className="glass-card overflow-hidden border border-white/5 relative mb-10 p-8 text-center flex flex-col items-center justify-center space-y-4">
        
        {/* Centered Profile Picture with Quick Edit Camera Trigger */}
        <div className="relative group cursor-pointer" onClick={() => avatarFileInputRef.current?.click()}>
          <UserAvatar user={user || profile} className="w-32 h-32 text-4xl shadow-2xl border-4 border-indigo-500/50" />
          
          <button 
            type="button"
            onClick={(e) => { e.stopPropagation(); avatarFileInputRef.current?.click(); }}
            className="absolute bottom-1 right-1 p-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-full border-2 border-[#0c0c0c] shadow-lg transition-transform hover:scale-110 cursor-pointer"
            title="Upload Profile Picture"
          >
            <Camera className="w-4 h-4" />
          </button>
        </div>

        {/* Hidden File Input for PFP upload */}
        <input 
          ref={avatarFileInputRef}
          type="file" 
          accept="image/*"
          onChange={handleAvatarFileSelect}
          className="hidden" 
        />

        {/* Centered Name, Player ID Badge, Role Tag & Bio */}
        <div className="space-y-2 max-w-lg mx-auto">
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-3xl font-black font-display tracking-tight text-white">{profile.name}</h1>
            <span className={`inline-flex items-center text-[10px] font-extrabold uppercase px-3 py-1 rounded-full border ${
              role === 'owner'
                ? 'bg-violet-500/15 text-violet-400 border-violet-500/25'
                : 'bg-indigo-500/15 text-indigo-400 border-indigo-500/25'
            }`}>
              {role === 'owner' ? '🏟️ Venue Owner' : '🏃 Player'}
            </span>
          </div>

          {/* Unique Player ID Badge with 1-Click Copy */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleCopyPlayerId}
              className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-mono font-extrabold transition-all cursor-pointer group shadow-sm"
              title="Click to copy Player ID"
            >
              <Hash className="w-3.5 h-3.5 text-indigo-400" />
              <span>{editPlayerId || initialPlayerId}</span>
              {copiedId ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 ml-0.5" />
              ) : (
                <Copy className="w-3 h-3 text-neutral-400 group-hover:text-white ml-0.5 transition-colors" />
              )}
            </button>
          </div>

          <p className="text-sm text-neutral-400 font-light leading-relaxed">{profile.title}</p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {onOpenProfileSwitcher && (
            <button
              onClick={onOpenProfileSwitcher}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-full transition-all flex items-center space-x-1.5 shadow-lg shadow-indigo-600/30 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Switch Profile</span>
            </button>
          )}
          <button
            onClick={handleShareProfile}
            className="px-5 py-2.5 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 font-bold text-xs uppercase tracking-widest rounded-full transition-all flex items-center space-x-1.5 cursor-pointer shadow-md"
            title="Share your Player ID & profile link"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share Profile</span>
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="px-5 py-2.5 bg-white text-black font-bold text-xs uppercase tracking-widest rounded-full hover:bg-neutral-200 transition-colors cursor-pointer"
          >
            Edit Profile
          </button>
        </div>
      </div>

      {/* 2. STATS BAR */}
      <div className={`grid grid-cols-2 ${profile.stats.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-4 mb-6`}>
        {profile.stats.map((stat, i) => (
          <div key={i} className="glass-card p-5 border border-white/5 space-y-1 text-center">
            <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-extrabold">{stat.name}</p>
            <p className="font-display font-black text-2xl text-white">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* 2.5 OVERALL RATING CARD (Only Overall Rating, with High=Green / Medium=Yellow / Low=Red) */}
      <div className="glass-card p-6 border border-white/5 mb-10 space-y-5 bg-neutral-900/40 rounded-3xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/5">
          <div className="flex items-center space-x-3">
            <div className={`p-2.5 rounded-2xl ${ratingStyle.bgMuted} border ${ratingStyle.border} ${ratingStyle.text}`}>
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">Verified Player Rating</span>
              <h3 className="font-display font-bold text-white text-lg tracking-tight">Overall Rating</h3>
            </div>
          </div>
          <div className={`flex items-center space-x-2 ${ratingStyle.bgMuted} border ${ratingStyle.border} px-3.5 py-1.5 rounded-full ${ratingStyle.text} text-xs font-semibold self-start`}>
            <Star className={`w-3.5 h-3.5 ${ratingStyle.starFill}`} />
            <span>{ratingScore} / 5.0 • {ratingStyle.label}</span>
          </div>
        </div>

        {/* Single Full-Width Minimalist Overall Rating Card */}
        <div 
          onClick={() => setShowReviewsModal(true)}
          className={`bg-neutral-900/70 border ${ratingStyle.borderLight} hover:border-white/20 rounded-2xl p-6 text-left transition-all cursor-pointer group hover:bg-white/[0.02] shadow-sm`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-mono uppercase tracking-wider text-neutral-400 font-bold">
                  Overall Rating
                </span>
                {reviewsData.totalReviews > 0 ? (
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${ratingStyle.border} ${ratingStyle.bgMuted} ${ratingStyle.text}`}>
                    {ratingStyle.label}
                  </span>
                ) : (
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-white/10 bg-white/5 text-neutral-400">
                    New Member
                  </span>
                )}
              </div>
              <div className="flex items-baseline space-x-3 pt-1">
                {reviewsData.totalReviews > 0 ? (
                  <>
                    <span className={`font-display font-black text-4xl tracking-tight transition-colors ${ratingStyle.text}`}>
                      {ratingScore}★
                    </span>
                    <span className="text-sm font-medium text-neutral-400">/ 5.0 Rating</span>
                    <span className="text-xs text-neutral-500">• Based on {reviewsData.totalReviews} verified match reviews</span>
                  </>
                ) : (
                  <>
                    <span className="font-display font-black text-2xl tracking-tight text-neutral-300">
                      No reviews yet
                    </span>
                    <span className="text-xs text-neutral-500">• Be the first teammate to leave a review</span>
                  </>
                )}
              </div>
            </div>

            {/* View Reviews Button */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowReviewsModal(true);
              }}
              className="self-start sm:self-center px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white border border-white/10 text-xs font-bold transition-all flex items-center space-x-2 group-hover:border-white/25 shadow-sm cursor-pointer"
            >
              <MessageSquare className="w-3.5 h-3.5 text-neutral-400 group-hover:text-white" />
              <span>View Reviews ({reviewsData.totalReviews ?? reviewsData.reviews?.length ?? 0}) →</span>
            </button>
          </div>

          {/* Dynamic Progress Bar: Green for High (>=4.0), Yellow for Medium (2.5-3.9), Red for Low (<2.5) */}
          <div className="w-full bg-neutral-800/80 h-2 rounded-full overflow-hidden mt-4">
            <div 
              className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${ratingStyle.gradient}`} 
              style={{ width: `${Math.min(100, Math.max(5, (ratingScore / 5) * 100))}%` }} 
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 text-[11px] text-neutral-400">
            <p className="font-light">
              Aggregated from teammate & opponent evaluations on match performance, sportsmanship, and on-field behaviour.
            </p>
            <span className="font-mono text-[10px] text-neutral-500 flex items-center gap-1.5 flex-shrink-0">
              <span className={`w-2 h-2 rounded-full ${ratingStyle.bg}`} />
              Rating: {ratingScore}/5.0
            </span>
          </div>
        </div>
      </div>

      {/* ── Interactive Written Player Reviews Modal ── */}
      <AnimatePresence>
        {showReviewsModal && (
          <div 
            onClick={() => setShowReviewsModal(false)}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md cursor-pointer"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-neutral-900 border border-white/10 rounded-3xl max-w-2xl w-full max-h-[85vh] min-h-[520px] flex flex-col overflow-hidden shadow-2xl cursor-default"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-white/10 flex items-center justify-between bg-neutral-900/90">
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-2xl ${ratingStyle.bgMuted} border ${ratingStyle.border} ${ratingStyle.text}`}>
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-white text-lg">
                      Written Player Reviews
                    </h3>
                    <p className="text-xs text-neutral-400">
                      Comments & feedback written by teammates and opponents for {profile.name}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowReviewsModal(false)}
                  className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Overall Rating Strip inside Modal */}
              <div className="px-6 py-3.5 bg-white/[0.02] border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className={`text-2xl font-black font-display ${ratingStyle.text}`}>
                    {ratingScore ? `${ratingScore}★` : '—'}
                  </span>
                  <div>
                    <p className="text-xs font-bold text-white">Overall Rating</p>
                    <p className="text-[10px] text-neutral-400">
                      {reviewsData.totalReviews || 0} verified peer endorsements
                    </p>
                  </div>
                </div>
                <div className={`px-3 py-1 rounded-full border ${ratingStyle.border} ${ratingStyle.bgMuted} ${ratingStyle.text} text-xs font-bold`}>
                  {reviewsData.totalReviews > 0 ? ratingStyle.label : 'New Member'}
                </div>
              </div>

              {/* Scrollable Reviews List with Written Comments */}
              <div className="p-6 space-y-4 overflow-y-auto flex-1">
                {(!reviewsData.reviews || reviewsData.reviews.length === 0) ? (
                  <div className="py-16 text-center text-neutral-400 space-y-3">
                    <MessageSquare className="w-10 h-10 mx-auto text-neutral-600 mb-2" />
                    <h4 className="font-display font-bold text-white text-base">No reviews yet</h4>
                    <p className="text-xs text-neutral-400 max-w-xs mx-auto">
                      No reviews yet for this athlete. Genuine peer reviews will appear here once written by fellow athletes.
                    </p>
                  </div>
                ) : (
                  reviewsData.reviews.map((rev) => {
                    const revScore = rev.performance_rating || 5;
                    const revStyle = getRatingColor(revScore);
                    return (
                      <div
                        key={rev.id}
                        className="p-5 rounded-2xl border border-white/5 bg-neutral-900/80 hover:border-white/15 space-y-3 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <img
                              src={rev.reviewer_avatar}
                              alt={rev.reviewer_name}
                              className="w-10 h-10 rounded-full object-cover border border-white/10 bg-neutral-800"
                            />
                            <div>
                              <div className="flex items-center space-x-2">
                                <h4 className="font-bold text-white text-sm">{rev.reviewer_name}</h4>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/5 text-neutral-300 border border-white/10">
                                  {rev.reviewer_sport || 'Football'}
                                </span>
                              </div>
                              <p className="text-[10px] text-neutral-500 font-light mt-0.5">
                                {rev.match_context || 'Verified Match'} • {new Date(rev.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                              </p>
                            </div>
                          </div>

                          <div className={`px-2.5 py-1 rounded-full border ${revStyle.border} ${revStyle.bgMuted} ${revStyle.text} text-xs font-bold flex items-center space-x-1`}>
                            <Star className={`w-3.5 h-3.5 ${revStyle.starFill}`} />
                            <span>{revScore}★</span>
                          </div>
                        </div>

                        {/* The Written Comment Quote */}
                        <div className="p-3.5 rounded-xl bg-white/[0.03] border-l-2 border-white/20">
                          <p className="text-xs text-neutral-200 leading-relaxed italic">
                            "{rev.comment}"
                          </p>
                        </div>

                        {/* Badges Awarded */}
                        {rev.badges && rev.badges.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {rev.badges.map((bName) => (
                              <span
                                key={bName}
                                className="text-[10px] px-2.5 py-0.5 rounded-lg bg-white/5 border border-white/10 text-neutral-300 font-medium"
                              >
                                🏅 {bName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Modal Footer with tab switcher button */}
              <div className="p-4 border-t border-white/10 bg-neutral-900/90 flex items-center justify-between">
                <span className="text-xs text-neutral-400">
                  Showing {reviewsData.reviews?.length || 0} written peer comments
                </span>
                <button
                  onClick={() => {
                    setShowReviewsModal(false);
                    setActiveTab('Reviews');
                  }}
                  className="px-4 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-bold transition-all cursor-pointer"
                >
                  Open Full Reviews & Write Review →
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 2.8 PROFILE TAB NAVIGATION (Overview vs Peer Reviews) */}
      <div className="flex items-center space-x-3 border-b border-white/10 pb-4 mb-8">
        <button
          onClick={() => setActiveTab('Overview')}
          className={`px-5 py-2.5 rounded-full text-xs font-extrabold uppercase tracking-wider flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === 'Overview'
              ? 'bg-white text-black shadow-lg shadow-white/10'
              : 'bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white'
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Overview</span>
        </button>

        <button
          onClick={() => setActiveTab('Reviews')}
          className={`px-5 py-2.5 rounded-full text-xs font-extrabold uppercase tracking-wider flex items-center space-x-2 transition-all cursor-pointer ${
            activeTab === 'Reviews'
              ? 'bg-gradient-to-r from-indigo-600 to-indigo-500 text-white shadow-lg shadow-indigo-600/30'
              : 'bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white'
          }`}
        >
          <Star className={`w-4 h-4 ${ratingStyle.starFill}`} />
          <span>Overall Reviews & Comments</span>
          <span className={`px-2 py-0.5 rounded-full ${ratingStyle.bgMuted} border ${ratingStyle.border} ${ratingStyle.text} text-[10px] font-black`}>
            {ratingScore}★
          </span>
        </button>
      </div>

      {/* 3. TAB CONTENT */}
      {activeTab === 'Reviews' ? (
        <PlayerReviewSection targetPlayer={user} currentUser={user} />
      ) : (
        /* OVERVIEW TAB CONTENT LAYOUT */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* LEFT COLUMN: Sports Interests */}
          <div className="space-y-8">
            <div className="glass-card p-6 border border-white/5 space-y-4">
              <h3 className="font-display font-extrabold text-sm uppercase tracking-wider pb-3 border-b border-white/5">
                Sports Interests
              </h3>
              <div className="flex flex-wrap gap-2.5">
                {profile.interests.map((item, i) => (
                  <div 
                    key={i} 
                    className="flex items-center space-x-2 px-3.5 py-2 bg-white/[0.03] border border-white/10 rounded-xl text-xs font-bold text-white"
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.sport}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Account Summary */}
          <div className="space-y-8">
            <div className="glass-card p-6 border border-white/5 space-y-4">
              <h3 className="font-display font-extrabold text-sm uppercase tracking-wider pb-3 border-b border-white/5">
                Account Summary
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-neutral-400 font-light">Account Type:</span>
                  <span className="font-bold text-white uppercase tracking-wider">{role === 'owner' ? 'Venue Owner' : 'Player'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-neutral-400 font-light">Email Address:</span>
                  <span className="font-bold text-neutral-300 truncate max-w-[160px]">{user?.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-white/5">
                  <span className="text-neutral-400 font-light">Player ID:</span>
                  <span className="font-bold text-indigo-400 font-mono text-xs">{editPlayerId || initialPlayerId}</span>
                </div>
              </div>
            </div>

            {/* Peer Reviews Teaser Card on Overview */}
            <div className="glass-card p-6 border border-amber-500/20 bg-amber-500/[0.02] rounded-3xl space-y-3.5 text-left">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Peer Reputation
                </span>
                <span className="text-xs font-bold text-white">4.9★</span>
              </div>
              <h4 className="font-display font-bold text-white text-sm">
                Athletic Performance & Behaviour Feedback
              </h4>
              <p className="text-xs text-neutral-400 font-light leading-relaxed">
                Teammates and opponents have rated your on-pitch skill, clutch mindset, and respect for referees.
              </p>
              <button
                onClick={() => setActiveTab('Reviews')}
                className="w-full py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-extrabold uppercase tracking-wider transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <span>Read Peer Reviews & Badges</span>
                <span>→</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 4. WHATSAPP / INSTAGRAM STYLE EDIT PROFILE MODAL */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)} className="fixed inset-0 bg-black/90 backdrop-blur-2xl" />
            
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[#111116] border border-white/15 rounded-3xl p-6 max-w-md w-full z-10 text-left space-y-6 shadow-[0_25px_80px_rgba(0,0,0,0.95)]">
              
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <div>
                  <h3 className="font-display font-extrabold text-white text-lg">Edit Profile</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">Edit picture, name, and bio</p>
                </div>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 rounded-full bg-white/5 text-neutral-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-5">
                
                {/* 1. UPLOAD & CROP PICTURE */}
                <div className="flex flex-col items-center justify-center space-y-3">
                  <div 
                    className="relative group cursor-pointer" 
                    onClick={() => avatarFileInputRef.current?.click()}
                  >
                    <div className="w-28 h-28 rounded-full border-2 border-indigo-500/80 overflow-hidden bg-neutral-900 shadow-xl relative">
                      {editAvatar ? (
                        <img src={editAvatar} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-neutral-500 font-bold text-3xl">
                          {editName?.[0] || 'U'}
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-black/50 rounded-full flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera className="w-6 h-6 text-white" />
                      <span className="text-[9px] text-white font-bold uppercase mt-1">Change</span>
                    </div>
                  </div>

                  <button 
                    type="button"
                    onClick={() => {
                      if (editAvatar) {
                        setRawCropImage(editAvatar);
                        setShowCropModal(true);
                      } else {
                        avatarFileInputRef.current?.click();
                      }
                    }}
                    className="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                  >
                    {editAvatar ? 'Crop & Adjust Picture' : 'Upload Profile Picture'}
                  </button>
                </div>

                {/* 2. EDIT NAME */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Name</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    placeholder="Enter your name"
                    required
                    className="w-full bg-[#0d0d0d] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/60"
                  />
                </div>

                {/* 2.5 EDIT PLAYER ID / HANDLE */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Unique Player ID (@handle)</label>
                  <input 
                    type="text" 
                    value={editPlayerId}
                    onChange={e => {
                      let val = e.target.value;
                      if (val.trim() && !val.startsWith('@')) val = '@' + val;
                      setEditPlayerId(val);
                    }}
                    placeholder="@danish98"
                    required
                    className="w-full bg-[#0d0d0d] border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-indigo-400 placeholder-neutral-600 focus:outline-none focus:border-indigo-500/60"
                  />
                  <p className="text-[10px] text-neutral-500">Other players can search & connect with you using this ID.</p>
                </div>

                {/* 3. EDIT BIO */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Bio</label>
                  <textarea 
                    rows={3}
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    placeholder="Write a brief bio about yourself..."
                    className="w-full bg-[#0d0d0d] border border-white/10 rounded-xl p-3.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-indigo-500/60 resize-none"
                  />
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex items-center justify-end space-x-3 pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="px-5 py-2.5 rounded-full text-xs font-bold text-neutral-400 hover:text-white cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-6 py-2.5 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-indigo-600/30 flex items-center space-x-2"
                  >
                    {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Save Changes</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. INTERACTIVE CROP MODAL FOR PFP */}
      <AnimatePresence>
        {showCropModal && rawCropImage && (
          <PfpCropModal
            imageSrc={rawCropImage}
            onClose={() => setShowCropModal(false)}
            onConfirm={async (croppedUrl) => {
              setEditAvatar(croppedUrl);
              setShowCropModal(false);

              // Immediately update profile avatar in database and app state
              const targetId = user?.id || user?.firebase_uid || user?.email || user?.username;
              if (targetId) {
                await apiUpdateProfile(targetId, {
                  avatar_url: croppedUrl,
                  avatar: croppedUrl
                });
              }

              if (onUpdateUser) {
                onUpdateUser({
                  avatar_url: croppedUrl,
                  avatar: croppedUrl
                });
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* 5. FLOATING TOAST NOTIFICATION */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            className="fixed bottom-6 right-6 z-50 bg-indigo-600 text-white px-5 py-3 rounded-2xl shadow-2xl border border-indigo-400/30 text-xs font-bold flex items-center space-x-2"
          >
            <Check className="w-4 h-4 text-emerald-300" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
