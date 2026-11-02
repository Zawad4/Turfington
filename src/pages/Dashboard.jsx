import UserAvatar from '../components/UserAvatar';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Calendar, Clock, Users, Trophy, MapPin, CheckCircle,
  XCircle, IndianRupee, TrendingUp, TrendingDown, BarChart2,
  AlertTriangle, Star, Zap, Activity, Building2, ChevronRight,
  ArrowUpRight, Shield, MessageSquare, Send, X
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { apiFetchBookings, apiFetchOwnerBookings, apiFetchVenues, apiCreateDirectChat, apiFetchMessages, apiSendMessage, apiUpdateBookingStatus } from '../services/db';
import { formatTime12Hour } from '../utils/formatters';

/* ════════════════════════════════════════════════════════════
   PLAYER DASHBOARD
   ════════════════════════════════════════════════════════════ */

const PLAYER_BOOKINGS = [
  { id: 101, venue: 'Vanguard Sports Arena', sport: 'Football', date: 'Tomorrow, 27 May', time: '06:00 PM – 07:00 PM', price: 3750, status: 'PENDING OWNER APPROVAL', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=200' },
  { id: 1, venue: 'Vanguard Sports Arena', sport: 'Football', date: 'Mon, 26 May', time: '06:00 PM – 07:00 PM', price: 3750, status: 'confirmed', image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=200' },
  { id: 2, venue: 'Smash Club Badminton',  sport: 'Badminton', date: 'Wed, 28 May', time: '07:00 AM – 08:00 AM', price: 2500, status: 'rejected', rejection_reason: 'Court under scheduled maintenance', image: '/smash_club_badminton.jpg' },
  { id: 3, venue: 'Arena Cricket Hub',      sport: 'Cricket',   date: 'Thu, 29 May', time: '06:00 AM – 07:00 AM', price: 1800, status: 'confirmed', image: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=200' }
];

const WEEK_ACTIVITY = [
  { day: 'Mon', sessions: 1 }, { day: 'Tue', sessions: 0 }, { day: 'Wed', sessions: 1 },
  { day: 'Thu', sessions: 1 }, { day: 'Fri', sessions: 0 }, { day: 'Sat', sessions: 1 }, { day: 'Sun', sessions: 1 },
];

const MONTH_ACTIVITY = [
  { week: 'W1', sessions: 3 }, { week: 'W2', sessions: 5 },
  { week: 'W3', sessions: 2 }, { week: 'W4', sessions: 5 },
];

const SPORT_COLORS_PLAYER = {
  Football:      { ring: 'ring-emerald-500/30', badge: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400' },
  Badminton:     { ring: 'ring-indigo-500/30',  badge: 'bg-indigo-500/15 text-indigo-400',  dot: 'bg-indigo-400' },
  Cricket:       { ring: 'ring-amber-500/30',   badge: 'bg-amber-500/15 text-amber-400',   dot: 'bg-amber-400' },
  Bowling:       { ring: 'ring-cyan-500/30',    badge: 'bg-cyan-500/15 text-cyan-400',     dot: 'bg-cyan-400' },
  'Table Tennis':{ ring: 'ring-rose-500/30',    badge: 'bg-rose-500/15 text-rose-400',     dot: 'bg-rose-400' },
};

/* ─── Contact Venue Owner Chat Modal ───────────────────── */
function ContactOwnerModal({ booking, user, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [chatId, setChatId] = useState(null);
  const messagesEndRef = useRef(null);

  const ownerId = booking.owner_id || booking.ownerId || 'usr_venue_owner';
  const ownerName = booking.owner_name || booking.venue || 'Venue Owner';

  useEffect(() => {
    async function initChat() {
      const res = await apiCreateDirectChat(user?.id || 'usr_me', ownerId);
      if (res && res.id) {
        setChatId(res.id);
        const msgs = await apiFetchMessages(res.id);
        if (msgs && msgs.length > 0) {
          setMessages(msgs);
        } else {
          setMessages([
            {
              id: 'msg_welcome',
              sender_id: ownerId,
              sender_name: ownerName,
              content: `Hello! Thanks for your booking request for ${booking.venue} (${booking.date}, ${booking.time}). Feel free to message me here regarding your booking status or any questions!`,
              created_at: new Date().toISOString()
            }
          ]);
        }
      }
    }
    initChat();
  }, [booking, user, ownerId, ownerName]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    const textToSend = inputText.trim();
    setInputText('');
    setSending(true);

    const newMsg = {
      id: 'msg_' + Date.now(),
      sender_id: user?.id || 'usr_me',
      sender_name: user?.full_name || 'You',
      content: textToSend,
      created_at: new Date().toISOString()
    };

    setMessages(prev => [...prev, newMsg]);

    if (chatId) {
      await apiSendMessage(chatId, user?.id || 'usr_me', textToSend);
    }
    setSending(false);
  };

  const handleQuickPreset = (presetText) => {
    setInputText(presetText);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/85 backdrop-blur-md" />
      
      <div className="relative glass-card border border-white/10 rounded-3xl w-full max-w-lg z-10 text-left flex flex-col h-[520px] shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-white/10 bg-white/[0.02] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 flex items-center justify-center text-white font-bold text-sm border border-white/20">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-display font-extrabold text-white text-sm leading-tight">Chat with Venue Owner</h3>
              <p className="text-[11px] text-neutral-400 mt-0.5">{booking.venue} • {booking.sport}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Booking Context Pill */}
        <div className="px-4 py-2 bg-indigo-500/10 border-b border-indigo-500/20 flex items-center justify-between text-[11px] text-indigo-300">
          <span className="flex items-center gap-1 font-medium">
            <Clock className="w-3 h-3 text-amber-400" /> Pending Approval: {booking.date} ({booking.time})
          </span>
          <span className="font-bold text-white">₹{booking.price}</span>
        </div>

        {/* Messages Body */}
        <div className="flex-grow p-4 overflow-y-auto space-y-3 bg-[#080808]/50 text-xs">
          {messages.map((m) => {
            const isMe = m.sender_id === (user?.id || 'usr_me');
            return (
              <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <span className="text-[9px] text-neutral-500 font-bold mb-1 px-1">
                  {isMe ? 'You' : m.sender_name || ownerName}
                </span>
                <div className={`max-w-[80%] p-3 rounded-2xl text-xs font-light leading-relaxed ${
                  isMe 
                    ? 'bg-indigo-600 text-white rounded-tr-none shadow-md' 
                    : 'bg-white/10 text-neutral-200 border border-white/10 rounded-tl-none'
                }`}>
                  {m.content}
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Quick Presets */}
        <div className="px-3 py-2 bg-[#0c0c0c] border-t border-white/5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button 
            type="button"
            onClick={() => handleQuickPreset(`Hi! Checking in regarding my booking for ${booking.date} (${booking.time}).`)}
            className="text-[10px] font-bold text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer"
          >
            👋 Check on Approval
          </button>
          <button 
            type="button"
            onClick={() => handleQuickPreset("Do you provide sports equipment or footballs at the venue?")}
            className="text-[10px] font-bold text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer"
          >
            ⚽ Equipment Query
          </button>
          <button 
            type="button"
            onClick={() => handleQuickPreset("Can we enter 10 minutes early to warm up?")}
            className="text-[10px] font-bold text-neutral-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded-full whitespace-nowrap transition-colors cursor-pointer"
          >
            ⏱️ Warm-up Query
          </button>
        </div>

        {/* Message Input Form */}
        <form onSubmit={handleSend} className="p-3 border-t border-white/10 bg-[#0c0c0c] flex items-center space-x-2">
          <input 
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type your message to venue owner..."
            className="flex-grow bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500/60"
          />
          <button
            type="submit"
            disabled={sending || !inputText.trim()}
            className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl transition-all cursor-pointer flex-shrink-0 shadow-lg shadow-indigo-600/30"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function formatBookingItem(b) {
  if (!b) return null;
  const rawPrice = b.price != null ? b.price : (b.amount != null ? b.amount : (b.amount_paid != null ? b.amount_paid : 1200));
  const numPrice = typeof rawPrice === 'number' 
    ? rawPrice 
    : (parseInt(String(rawPrice).replace(/\D/g, ''), 10) || 1200);

  // Normalize status
  let status = b.status || 'PENDING OWNER APPROVAL';
  const upperStatus = String(status).toUpperCase();
  if (upperStatus.includes('CONFIRM') || upperStatus.includes('APPROV')) {
    status = 'confirmed';
  } else if (upperStatus.includes('CANCEL')) {
    status = 'cancelled';
  } else if (upperStatus.includes('REJECT')) {
    status = 'rejected';
  } else if (upperStatus.includes('PENDING')) {
    status = 'PENDING OWNER APPROVAL';
  }

  const rawTime = b.time || b.slot_time || 'Today, 08:00 PM - 09:00 PM';
  let date = b.date;
  let time = rawTime;
  if (!date) {
    if (rawTime.includes(',')) {
      const parts = rawTime.split(',');
      date = parts[0].trim();
      time = parts.slice(1).join(',').trim();
    } else {
      date = 'Today';
    }
  }
  time = formatTime12Hour(time);

  return {
    id: b.id,
    venue: b.venue || b.venue_name || b.title || 'Sports Arena',
    venue_name: b.venue || b.venue_name || b.title || 'Sports Arena',
    sport: b.sport || 'Football',
    date: date,
    time: time,
    slot_time: time,
    price: numPrice,
    status: status,
    fine: b.fine || 0,
    rejection_reason: b.rejection_reason || b.rejectionReason || null,
    image: b.image || b.image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=200',
    user_id: b.user_id || b.userId || null,
    userId: b.user_id || b.userId || null,
    isHosted: b.isHosted || b.is_hosted || b.bookingType === 'open_match',
    joinedPlayers: b.joinedPlayers || b.joined_players || b.currentPlayers || b.existing_players_count || 1,
    capacity: b.capacity || 10,
    owner_id: b.owner_id || b.ownerId || 'usr_venue_owner',
    owner_name: b.owner_name || b.ownerName || b.venue || b.venue_name || 'Venue Owner',
    created_at: b.created_at || b.createdAt
  };
}

function PlayerDashboard({ user, appBookings, setAppBookings, setTab }) {
  const handleContactOwner = (booking) => {
    if (!booking) return;
    const venueName = booking.venue || booking.venue_name || booking.title || 'Sports Arena';
    const ownerNameStr = booking.owner_name || booking.ownerName || `${venueName} Host`;
    const ownerId = booking.owner_id || booking.ownerId || booking.venue_owner_id || `owner_${venueName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const slotTimeStr = booking.time || booking.slot_time || 'Scheduled Slot';
    const dateStr = booking.date || 'Upcoming Date';
    const priceStr = booking.price != null ? `₹${booking.price}` : (booking.amount != null ? `₹${booking.amount}` : '');

    const initialMsg = `Hi ${ownerNameStr}! I am reaching out regarding my booking for ${venueName} on ${dateStr} at ${slotTimeStr}${priceStr ? ` (${priceStr})` : ''}. I want to discuss and have queries about my booking.`;

    const ownerTarget = {
      id: ownerId,
      firebase_uid: ownerId,
      full_name: ownerNameStr,
      name: ownerNameStr,
      displayName: ownerNameStr,
      avatar: booking.owner_avatar || booking.ownerAvatar || booking.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
      avatarUrl: booking.owner_avatar || booking.ownerAvatar || '',
      role: 'owner',
      venueName: venueName,
      productName: venueName,
      productPrice: priceStr || 'Booked Slot',
      productImage: booking.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
      productCondition: `${dateStr} • ${slotTimeStr}`,
      initialMessage: initialMsg,
      contextBanner: {
        type: 'venue',
        title: venueName,
        price: priceStr || 'Booked Slot',
        image: booking.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
        subtitle: `${dateStr} • ${slotTimeStr}`
      }
    };

    try {
      localStorage.setItem('turfington_target_chat_user', JSON.stringify(ownerTarget));
      window.dispatchEvent(new CustomEvent('turfington_open_direct_chat_target', { detail: ownerTarget }));
    } catch {}

    if (typeof setTab === 'function') {
      setTab('community');
    }
  };
  const [view, setView] = useState('week'); // 'week' | 'month'
  const [bookings, setBookings] = useState(() => {
    try {
      const currentUserId = user?.id || user?.uid || user?.firebase_uid;
      const sU = currentUserId ? localStorage.getItem(`turfington_user_bookings_${currentUserId}`) : null;
      if (sU) {
        const pU = JSON.parse(sU);
        if (Array.isArray(pU) && pU.length > 0) return pU.map(formatBookingItem);
      }
      const s1 = localStorage.getItem('turfington_user_bookings');
      if (s1) {
        const p1 = JSON.parse(s1);
        if (Array.isArray(p1)) {
          const userOnly = currentUserId ? p1.filter(b => b.user_id === currentUserId || b.userId === currentUserId) : [];
          if (userOnly.length > 0) return userOnly.map(formatBookingItem);
        }
      }
    } catch {}
    return [];
  });
  const [cancelTarget, setCancelTarget] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [contactingBooking, setContactingBooking] = useState(null);

  const loadUserDbBookings = async () => {
    const currentUserId = user?.id || user?.uid || user?.firebase_uid;
    if (!currentUserId) {
      setBookings([]);
      if (setAppBookings) setAppBookings([]);
      return;
    }
    const dbBookings = await apiFetchBookings(currentUserId);

    let localU = [];
    try {
      const sU = localStorage.getItem(`turfington_user_bookings_${currentUserId}`);
      if (sU) localU = JSON.parse(sU);
    } catch {}

    const isUserBooking = (b) => {
      if (!b) return false;
      const bUid = b.user_id || b.userId;
      if (!bUid) return false;
      return bUid === currentUserId || (user?.firebase_uid && bUid === user.firebase_uid) || (user?.id && bUid === user.id);
    };

    let local1 = [];
    try {
      const s1 = localStorage.getItem('turfington_user_bookings');
      if (s1) {
        const p1 = JSON.parse(s1);
        if (Array.isArray(p1)) local1 = p1.filter(isUserBooking);
      }
    } catch {}

    const appUserBookings = (appBookings || []).filter(isUserBooking);
    const combined = [...(dbBookings || []), ...localU, ...local1, ...appUserBookings];
    const map = new Map();
    combined.forEach(b => {
      if (b && b.id) {
        const item = formatBookingItem(b);
        if (item) map.set(String(b.id), item);
      }
    });

    const list = Array.from(map.values());
    setBookings(list);
    if (setAppBookings) setAppBookings(list);
  };

  useEffect(() => {
    loadUserDbBookings();

    const handleCreated = () => { loadUserDbBookings(); };
    const handleUpdated = () => { loadUserDbBookings(); };
    window.addEventListener('turfington_booking_created', handleCreated);
    window.addEventListener('turfington_booking_updated', handleUpdated);

    return () => {
      window.removeEventListener('turfington_booking_created', handleCreated);
      window.removeEventListener('turfington_booking_updated', handleUpdated);
    };
  }, [user?.id, user?.uid, user?.firebase_uid, appBookings]);

  const confirmed = bookings.filter(b => b.status === 'confirmed');
  const pending = bookings.filter(b => b.status === 'PENDING OWNER APPROVAL');
  const cancelled = bookings.filter(b => b.status === 'cancelled');
  const totalSpent = confirmed.reduce((s, b) => s + b.price, 0);
  const totalFines = cancelled.reduce((s, b) => s + (b.fine || 0), 0);

  const handleCancelRequest = (booking) => {
    setCancelTarget(booking);
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async () => {
    if (!cancelTarget) return;
    const fine = Math.round(cancelTarget.price * 0.10);
    const updated = bookings.map(b =>
      b.id === cancelTarget.id ? { ...b, status: 'cancelled', fine } : b
    );
    setBookings(updated);
    if (setAppBookings) setAppBookings(updated);
    await apiUpdateBookingStatus(cancelTarget.id, 'cancelled', 'Cancelled by player');
    window.dispatchEvent(new CustomEvent('turfington_booking_updated', {
      detail: { bookingId: cancelTarget.id, status: 'cancelled' }
    }));
    setShowCancelModal(false);
    setCancelTarget(null);
  };

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-5 h-5 text-indigo-400" />
            <span className="text-[10px] text-indigo-400 uppercase font-extrabold tracking-widest">Your Bookings</span>
          </div>
          <h1 className="text-3xl font-black font-display tracking-tight uppercase text-white">
            Hey, {user?.name?.split(' ')[0] || 'Player'} 👋
          </h1>
          <p className="text-xs text-neutral-500 mt-1">Your sessions, bookings and activity</p>
        </div>

        {/* Period toggle */}
        <div className="flex bg-white/[0.04] border border-white/8 rounded-full p-1 self-start">
          {['week', 'month'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-5 py-2 text-xs font-bold uppercase tracking-wider rounded-full transition-all ${
                view === v ? 'bg-indigo-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
              }`}>
              This {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: view === 'week' ? 'Bookings (Week)' : 'Bookings (Month)', value: confirmed.length, icon: <CheckCircle className="w-4 h-4" />, color: 'indigo', sub: 'confirmed sessions' },
          { label: 'Pending Approval',  value: pending.length,    icon: <Clock className="w-4 h-4" />,        color: 'amber',  sub: 'awaiting counter review' },
          { label: 'Canceled Bookings', value: cancelled.length,  icon: <XCircle className="w-4 h-4" />,      color: 'rose',   sub: 'released slots' },
          { label: 'Fines Paid',        value: `₹${totalFines.toLocaleString('en-IN')}`, icon: <AlertTriangle className="w-4 h-4" />, color: 'amber', sub: 'cancellation penalty' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="glass-card p-5 border border-white/5">
            <div className={`inline-flex p-2 rounded-xl mb-3 ${
              s.color === 'indigo'  ? 'bg-indigo-500/10 text-indigo-400' :
              s.color === 'rose'    ? 'bg-rose-500/10 text-rose-400' :
              'bg-amber-500/10 text-amber-400'
            }`}>{s.icon}</div>
            <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">{s.label}</p>
            <p className="text-2xl font-black text-white font-display mt-1">{s.value}</p>
            <p className="text-[10px] text-neutral-600 mt-0.5">{s.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Activity chart */}
      <div className="glass-card p-6 border border-white/5">
        <h3 className="font-display font-bold text-white text-sm uppercase tracking-wider mb-5">
          {view === 'week' ? 'Daily Sessions — This Week' : 'Weekly Sessions — This Month'}
        </h3>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={view === 'week' ? WEEK_ACTIVITY : MONTH_ACTIVITY} barSize={28}>
            <XAxis dataKey={view === 'week' ? 'day' : 'week'} tick={{ fill: '#525252', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 11 }} />
            <Bar dataKey="sessions" fill="url(#playerGrad)" radius={[6, 6, 0, 0]} />
            <defs>
              <linearGradient id="playerGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.3} />
              </linearGradient>
            </defs>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Bookings list */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-white text-sm uppercase tracking-wider">
            Your Bookings
          </h3>
          <span className="text-xs text-neutral-400 font-medium">
            {bookings.length} {bookings.length === 1 ? 'Booking' : 'Bookings'}
          </span>
        </div>

        {bookings.length === 0 ? (
          <div className="glass-card p-12 text-center border border-dashed border-white/10 rounded-2xl">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3">
              <Calendar className="w-6 h-6 text-indigo-400" />
            </div>
            <h4 className="font-bold text-white text-base font-display">No turf bookings yet</h4>
            <p className="text-xs text-neutral-400 mt-1 max-w-sm mx-auto">
              You haven't reserved any slots yet. Browse nearby football, badminton, and cricket turfs to book your next session.
            </p>
            {setTab && (
              <button 
                type="button"
                onClick={() => setTab('discovery')}
                className="mt-4 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-full transition-all cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                Discover & Book Turfs
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {bookings.map((b, i) => {
              const sc = SPORT_COLORS_PLAYER[b.sport] || {};
              return (
                <motion.div key={b.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                  className={`glass-card flex flex-col justify-between p-4.5 border transition-all ${
                    b.status === 'cancelled' ? 'border-rose-500/15 opacity-60' : 'border-white/5 hover:border-white/12'
                  }`}>
                  <div className="flex items-start gap-3.5 mb-3">
                    {/* Venue image */}
                    <img src={b.image} alt={b.venue} className="w-16 h-16 rounded-2xl object-cover border border-white/10 flex-shrink-0" />

                    {/* Info */}
                    <div className="flex-grow min-w-0 text-left">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h4 className="font-bold text-white text-sm truncate">{b.venue}</h4>
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full ${sc.badge || 'bg-white/5 text-neutral-400'}`}>
                          {b.sport}
                        </span>
                      </div>
                      <p className="text-[11px] text-neutral-400 mt-1 flex flex-col gap-0.5">
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-indigo-400" />{b.date}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-indigo-400" />{formatTime12Hour(b.time)}</span>
                      </p>
                      {b.status === 'cancelled' && b.fine ? (
                        <p className="text-[10px] text-rose-400 mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Cancelled · ₹{b.fine} fine
                        </p>
                      ) : null}
                      {(b.status === 'rejected' || b.status === 'REJECTED') && (
                        <div className="mt-2 p-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[10px] text-rose-300">
                          <span className="font-bold">Owner Rejection Reason:</span> {b.rejection_reason || b.rejectionReason || 'Court unavailable at requested time'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Price + action bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-white/5">
                    <span className="font-black text-white text-base font-display">₹{Number(b.price || b.amount || 0).toLocaleString('en-IN')}</span>
                    
                    {b.status === 'confirmed' || b.status === 'CONFIRMED' || b.status === 'approved' ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button 
                          type="button"
                          onClick={() => handleContactOwner(b)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 text-[10px] font-bold rounded-full transition-all cursor-pointer"
                          title="Chat with venue owner"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Contact Owner</span>
                        </button>

                        <span className="text-[9px] font-bold uppercase text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <CheckCircle className="w-2.5 h-2.5" /> Confirmed
                        </span>
                        <button onClick={() => handleCancelRequest(b)}
                          className="text-[10px] text-rose-400 hover:text-rose-300 font-bold transition-colors cursor-pointer">
                          Cancel
                        </button>
                      </div>
                    ) : (b.status === 'PENDING OWNER APPROVAL' || b.status === 'pending' || b.status === 'PENDING') ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button 
                          type="button"
                          onClick={() => handleContactOwner(b)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/35 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-bold rounded-full transition-all cursor-pointer shadow-sm"
                          title="Chat directly with venue owner while pending approval"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Contact Owner</span>
                        </button>

                        <span className="text-[9px] font-bold uppercase text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5 text-amber-400" /> Pending Approval
                        </span>
                        <button onClick={() => handleCancelRequest(b)}
                          className="text-[10px] text-rose-400 hover:text-rose-300 font-bold transition-colors cursor-pointer">
                          Cancel
                        </button>
                      </div>
                    ) : (b.status === 'rejected' || b.status === 'REJECTED') ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button 
                          type="button"
                          onClick={() => handleContactOwner(b)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 text-[10px] font-bold rounded-full transition-all cursor-pointer"
                          title="Contact owner regarding rejected booking"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-neutral-400" />
                          <span>Contact Owner</span>
                        </button>
                        <span className="text-[9px] font-bold uppercase text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                          <XCircle className="w-2.5 h-2.5" /> Rejected by Owner
                        </span>
                      </div>
                    ) : (
                      <span className="text-[9px] font-bold uppercase text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-full flex items-center gap-1">
                        <XCircle className="w-2.5 h-2.5" /> Cancelled
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cancel confirmation modal */}
      {showCancelModal && cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div onClick={() => setShowCancelModal(false)} className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="relative glass-card w-full max-w-sm p-6 border border-rose-500/20 shadow-2xl text-left">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-rose-400" />
            </div>
            <h3 className="font-display font-black text-white text-lg mb-1">Cancel Booking?</h3>
            <p className="text-xs text-neutral-400 font-light mb-4">
              Cancelling <strong className="text-white">{cancelTarget.venue}</strong> on {cancelTarget.date} will incur a{' '}
              <strong className="text-rose-400">10% cancellation fine of ₹{Math.round(cancelTarget.price * 0.10).toLocaleString('en-IN')}</strong>.
            </p>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 mb-5 text-xs text-amber-300">
              Venue bookings are pay-at-venue upon arrival. Cancellation will release your reserved slot for other players.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelModal(false)}
                className="flex-1 py-3 border border-white/10 text-neutral-300 font-bold text-xs rounded-full hover:bg-white/5 transition-colors">
                Keep Booking
              </button>
              <button onClick={handleConfirmCancel}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-full transition-colors">
                Cancel & Pay Fine
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Contact Venue Owner Modal */}
      {contactingBooking && (
        <ContactOwnerModal
          booking={contactingBooking}
          user={user}
          onClose={() => setContactingBooking(null)}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   OWNER DASHBOARD
   ════════════════════════════════════════════════════════════ */

const OWNER_BOOKINGS_WEEK = [
  { day: 'Mon', bookings: 8,  cancelled: 1, revenue: 30000  },
  { day: 'Tue', bookings: 12, cancelled: 2, revenue: 45000  },
  { day: 'Wed', bookings: 10, cancelled: 0, revenue: 37500  },
  { day: 'Thu', bookings: 15, cancelled: 3, revenue: 56250  },
  { day: 'Fri', bookings: 18, cancelled: 1, revenue: 67500  },
  { day: 'Sat', bookings: 24, cancelled: 2, revenue: 90000  },
  { day: 'Sun', bookings: 22, cancelled: 1, revenue: 82500  },
];

const SPORT_COLORS = {
  Football: '#10b981',
  Badminton: '#6366f1',
  Cricket: '#f59e0b',
  Basketball: '#f97316',
  Tennis: '#06b6d4',
  'Table Tennis': '#f43f5e',
  Kabaddi: '#8b5cf6',
  Volleyball: '#ec4899',
  Pickleball: '#14b8a6',
  Bowling: '#eab308'
};

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function OwnerDashboard({ user }) {
  const [recentBookings, setRecentBookings] = useState([]);
  const [ownerVenues, setOwnerVenues] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadOwnerData = async () => {
      const ownerId = user?.id || user?.uid || user?.firebase_uid;
      const ownerEmail = user?.email;
      const ownerName = user?.full_name || user?.name;

      if (!ownerId && !ownerEmail) {
        if (isMounted) {
          setRecentBookings([]);
          setOwnerVenues([]);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      const [bks, vns] = await Promise.all([
        apiFetchOwnerBookings({ ownerId, ownerUid: user?.firebase_uid, ownerEmail, ownerName }),
        apiFetchVenues({ ownerId, ownerUid: user?.firebase_uid, ownerEmail, ownerName })
      ]);

      if (isMounted) {
        setRecentBookings(Array.isArray(bks) ? bks : []);
        setOwnerVenues(Array.isArray(vns) ? vns : []);
        setLoading(false);
      }
    };

    loadOwnerData();
    const handleBookingCreated = () => { loadOwnerData(); };
    const handleBookingUpdated = () => { loadOwnerData(); };
    const handleVenuesUpdated = () => { loadOwnerData(); };

    window.addEventListener('turfington_booking_created', handleBookingCreated);
    window.addEventListener('turfington_booking_updated', handleBookingUpdated);
    window.addEventListener('turfington_venues_updated', handleVenuesUpdated);

    return () => {
      isMounted = false;
      window.removeEventListener('turfington_booking_created', handleBookingCreated);
      window.removeEventListener('turfington_booking_updated', handleBookingUpdated);
      window.removeEventListener('turfington_venues_updated', handleVenuesUpdated);
    };
  }, [user?.id, user?.uid, user?.firebase_uid, user?.email]);

  // Dynamic weekly chart data computed strictly from real bookings
  const weeklyChartData = React.useMemo(() => {
    const dayMap = {
      Mon: { day: 'Mon', bookings: 0, cancelled: 0, revenue: 0 },
      Tue: { day: 'Tue', bookings: 0, cancelled: 0, revenue: 0 },
      Wed: { day: 'Wed', bookings: 0, cancelled: 0, revenue: 0 },
      Thu: { day: 'Thu', bookings: 0, cancelled: 0, revenue: 0 },
      Fri: { day: 'Fri', bookings: 0, cancelled: 0, revenue: 0 },
      Sat: { day: 'Sat', bookings: 0, cancelled: 0, revenue: 0 },
      Sun: { day: 'Sun', bookings: 0, cancelled: 0, revenue: 0 },
    };

    recentBookings.forEach(b => {
      if (!b) return;
      let dayKey = null;
      const rawDate = String(b.date || b.time || b.created_at || '');
      for (const d of DAY_NAMES) {
        if (rawDate.includes(d)) {
          dayKey = d;
          break;
        }
      }
      if (!dayKey && b.created_at) {
        try {
          const dt = new Date(b.created_at);
          const idx = dt.getDay(); // 0 is Sunday
          dayKey = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][idx];
        } catch {}
      }
      if (!dayKey) dayKey = 'Mon';

      const p = typeof b.price === 'number' ? b.price : (parseInt(String(b.price || 0).replace(/\D/g, ''), 10) || 0);
      const isCancelled = b.status === 'cancelled' || b.status === 'REJECTED';

      if (isCancelled) {
        dayMap[dayKey].cancelled += 1;
      } else {
        dayMap[dayKey].bookings += 1;
        dayMap[dayKey].revenue += p;
      }
    });

    return DAY_NAMES.map(d => dayMap[d]);
  }, [recentBookings]);

  // Dynamic sport distribution computed strictly from actual bookings
  const dynamicSportSplit = React.useMemo(() => {
    if (recentBookings.length === 0) return [];

    const counts = {};
    let totalValid = 0;
    recentBookings.forEach(b => {
      const sp = b.sport || b.category || 'Football';
      counts[sp] = (counts[sp] || 0) + 1;
      totalValid++;
    });

    if (totalValid === 0) return [];

    return Object.entries(counts).map(([name, count]) => {
      const pct = Math.round((count / totalValid) * 100);
      return {
        name,
        count,
        value: pct,
        color: SPORT_COLORS[name] || '#6366f1'
      };
    }).sort((a, b) => b.value - a.value);
  }, [recentBookings]);

  const totalRevenue = recentBookings.reduce((s, b) => {
    const p = typeof b.price === 'number' ? b.price : (parseInt(String(b.price || 0).replace(/\D/g, ''), 10) || 0);
    return s + (b.status !== 'cancelled' && b.status !== 'REJECTED' ? p : 0);
  }, 0);
  const totalBookings = recentBookings.length;
  const totalCancelled = recentBookings.filter(b => b.status === 'cancelled' || b.status === 'REJECTED').length;
  const finesCollected = recentBookings.filter(b => b.status === 'cancelled').reduce((s, b) => s + (b.fine || 0), 0);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-5 h-5 text-violet-400" />
            <span className="text-[10px] text-violet-400 uppercase font-extrabold tracking-widest">Owner Dashboard</span>
          </div>
          <h1 className="text-3xl font-black font-display tracking-tight uppercase text-white">
            Venue Hub
          </h1>
          <p className="text-xs text-neutral-500 mt-1">Live booking analytics, revenue and cancellations for your venues</p>
        </div>
        <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5 rounded-full self-start">
          <span className={`w-2 h-2 rounded-full ${ownerVenues.length > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-500'}`} />
          <span className={`text-xs font-bold ${ownerVenues.length > 0 ? 'text-emerald-400' : 'text-neutral-400'}`}>
            {ownerVenues.length} {ownerVenues.length === 1 ? 'Venue' : 'Venues'} Active
          </span>
        </div>
      </div>

      {/* Revenue stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Weekly Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, icon: <IndianRupee className="w-4 h-4" />, color: 'emerald', sub: totalRevenue > 0 ? 'Across your active venues' : 'No revenue this week' },
          { label: 'Bookings This Week', value: totalBookings, icon: <CheckCircle className="w-4 h-4" />, color: 'indigo', sub: totalBookings > 0 ? 'Confirmed sessions' : 'No bookings yet' },
          { label: 'Cancellations', value: totalCancelled, icon: <XCircle className="w-4 h-4" />, color: 'rose', sub: totalBookings > 0 ? `${((totalCancelled/totalBookings)*100).toFixed(0)}% cancel rate` : '0% cancel rate' },
          { label: 'Fines Collected', value: `₹${finesCollected.toLocaleString('en-IN')}`, icon: <Shield className="w-4 h-4" />, color: 'amber', sub: 'From cancellations' },
        ].map((s, i) => (
          <motion.div key={s.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
            className="glass-card p-5 border border-white/5">
            <div className={`inline-flex p-2 rounded-xl mb-3 ${
              s.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' :
              s.color === 'indigo'  ? 'bg-indigo-500/10 text-indigo-400'  :
              s.color === 'rose'    ? 'bg-rose-500/10 text-rose-400'      :
              'bg-amber-500/10 text-amber-400'
            }`}>{s.icon}</div>
            <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">{s.label}</p>
            <p className="text-2xl font-black text-white font-display mt-1">{s.value}</p>
            <p className="text-[10px] text-neutral-600 mt-0.5">{s.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Revenue chart + Sport split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue chart */}
        <div className="lg:col-span-2 glass-card p-6 border border-white/5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-display font-bold text-white text-sm uppercase tracking-wider">
              Daily Revenue — This Week
            </h3>
            {totalRevenue === 0 && (
              <span className="text-[10px] text-neutral-500 font-medium">
                Live stream (₹0 this week)
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={weeklyChartData}>
              <defs>
                <linearGradient id="ownerRevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="day" tick={{ fill: '#525252', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v) => `₹${Number(v || 0).toLocaleString('en-IN')}`} contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 11 }} />
              <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} fill="url(#ownerRevGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Sport split */}
        <div className="glass-card p-6 border border-white/5 space-y-5">
          <h3 className="font-display font-bold text-white text-sm uppercase tracking-wider">Sport Split</h3>
          {dynamicSportSplit.length === 0 ? (
            <div className="py-8 text-center text-neutral-500 space-y-2">
              <div className="w-12 h-12 rounded-full border border-dashed border-white/10 flex items-center justify-center mx-auto text-neutral-600">
                <PieChart className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-neutral-400">No Booking Data Yet</p>
              <p className="text-[10px] text-neutral-600 max-w-[200px] mx-auto leading-relaxed">
                Sport distribution will update live as players reserve slots at your venues.
              </p>
            </div>
          ) : (
            <>
              <div className="flex justify-center">
                <PieChart width={140} height={140}>
                  <Pie data={dynamicSportSplit} cx={65} cy={65} innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {dynamicSportSplit.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </div>
              <div className="space-y-2">
                {dynamicSportSplit.map(s => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-neutral-400">{s.name}</span>
                    </div>
                    <span className="font-bold text-white">{s.value}% ({s.count})</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bookings vs Cancellations bar chart */}
      <div className="glass-card p-6 border border-white/5">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-white text-sm uppercase tracking-wider">
            Bookings vs Cancellations — This Week
          </h3>
          {totalBookings === 0 && (
            <span className="text-[10px] text-neutral-500 font-medium">
              Awaiting first booking
            </span>
          )}
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={weeklyChartData} barGap={4}>
            <XAxis dataKey="day" tick={{ fill: '#525252', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis hide />
            <Tooltip contentStyle={{ background: '#111', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, fontSize: 11 }} />
            <Bar dataKey="bookings"  name="Bookings"      fill="#6366f1" radius={[4,4,0,0]} />
            <Bar dataKey="cancelled" name="Cancellations" fill="#f43f5e" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-6 mt-3 text-[10px] font-bold text-neutral-500">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-indigo-500" />Bookings</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-rose-500" />Cancellations</span>
        </div>
      </div>

      {/* Recent Bookings table */}
      <div>
        <h3 className="font-display font-bold text-white text-sm uppercase tracking-wider mb-4">
          Recent Bookings
        </h3>
        <div className="glass-card border border-white/5 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  {['Player', 'Venue', 'Sport', 'Time', 'Amount', 'Status'].map(h => (
                    <th key={h} className="px-5 py-3.5 text-[10px] font-extrabold uppercase tracking-widest text-neutral-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentBookings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-neutral-500">
                      <p className="text-xs font-semibold">No recent bookings yet</p>
                      <p className="text-[11px] text-neutral-600 mt-1">When players reserve slots at your venues, their bookings will appear here in real time.</p>
                    </td>
                  </tr>
                ) : (
                  recentBookings.map((b) => {
                    const priceNum = typeof b.price === 'number' ? b.price : (parseInt(String(b.price || 0).replace(/\D/g, ''), 10) || 0);
                    const playerName = b.player_name || b.user_name || b.playerName || 'Player';
                    const venueTitle = b.venue || b.venue_name || b.title || 'Sports Arena';
                    const timeStr = b.time || b.slot_time || 'Scheduled Slot';
                    const isConfirmed = b.status === 'confirmed' || b.status === 'CONFIRMED' || b.status === 'APPROVED';
                    const isCancelled = b.status === 'cancelled' || b.status === 'REJECTED';
                    return (
                      <tr key={b.id} className={`border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors ${isCancelled ? 'opacity-50' : ''}`}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <UserAvatar
                              user={{
                                full_name: playerName,
                                name: playerName,
                                avatar: b.avatar,
                                avatar_url: b.player_avatar,
                                uid: b.user_id
                              }}
                              className="w-7 h-7 text-[10px]"
                            />
                            <span className="font-bold text-white">{playerName}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3.5 text-neutral-400">{venueTitle}</td>
                        <td className="px-5 py-3.5 text-neutral-400">{b.sport || 'Sports'}</td>
                        <td className="px-5 py-3.5 text-neutral-400">{timeStr}</td>
                        <td className="px-5 py-3.5 font-bold text-white">
                          ₹{priceNum.toLocaleString('en-IN')}
                          {b.fine ? <span className="block text-[10px] text-amber-400 font-normal">+₹{b.fine} fine</span> : null}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className={`text-[9px] font-extrabold uppercase px-2.5 py-1 rounded-full border ${
                            isConfirmed ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : isCancelled ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          }`}>{b.status || 'PENDING'}</span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN EXPORT — picks dashboard by role
   ════════════════════════════════════════════════════════════ */
export default function Dashboard({ user, role, bookings, setBookings, setTab }) {
  const effectiveRole = role || user?.role;

  return (
    <div className="min-h-screen bg-transparent pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-left">
      {effectiveRole === 'owner'
        ? <OwnerDashboard user={user} />
        : <PlayerDashboard 
            user={user} 
            appBookings={bookings} 
            setAppBookings={setBookings} 
            setTab={setTab} 
          />
      }
    </div>
  );
}
