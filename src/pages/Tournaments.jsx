import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
const { useState: _useState, useEffect: _useEffect, useMemo: _useMemo, useRef: _useRef, useCallback: _useCallback } = React;
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Plus, Users, Calendar, IndianRupee, Clock, ChevronRight,
  Flame, Shield, Star, MapPin, Filter, CheckCircle, X, Edit3, Trash2,
  ArrowRight, Crown, Medal, Swords, AlertCircle, Phone, FileText, Target,
  ShieldCheck, QrCode, CreditCard, Smartphone, Building2
} from 'lucide-react';
import SportIcon from '../components/SportIcon';
import { formatTime12Hour } from '../utils/formatters';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD ? '' : 'http://localhost:5000');

/* ─── Static Data ─────────────────────────────────────── */
const SPORTS_TABS = ['All', 'Football', 'Badminton', 'Table Tennis', 'Bowling', 'Cricket'];

const DEFAULT_SPORT_IMAGES = {
  Football: '/trophy.png',
  Badminton: '/smash_club_badminton.jpg',
  'Table Tennis': 'https://images.unsplash.com/photo-1511067007398-7e4b90cfa4bc?q=80&w=800',
  Bowling: '/bowling.jpg',
  Cricket: 'https://images.unsplash.com/photo-1531415074968-036ba1b575da?q=80&w=800'
};

const TOURNAMENTS = [
  {
    id: 1,
    title: 'Vanguard Weekend Football Gold Cup',
    sport: 'Football',
    image: '/trophy.png',
    banner: '/trophy.png',
    pfp: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=300',
    prizePool: '₹5,000',
    prizeRaw: 5000,
    entryFee: '₹249',
    date: 'June 14–15, 2026',
    venue: 'Vanguard Sports Arena, Chennai',
    slots: 16,
    filled: 11,
    status: 'Open',
    format: 'Knockout',
    level: 'Intermediate',
    organizer: 'Vanguard FC',
    registered: false,
  },
  {
    id: 2,
    title: 'Championship Table Tennis Open',
    sport: 'Table Tennis',
    image: 'https://images.unsplash.com/photo-1511067007398-7e4b90cfa4bc?q=80&w=800',
    banner: 'https://images.unsplash.com/photo-1511067007398-7e4b90cfa4bc?q=80&w=800',
    pfp: 'https://images.unsplash.com/photo-1534158914592-062992fbe900?q=80&w=300',
    prizePool: '₹2,500',
    prizeRaw: 2500,
    entryFee: '₹149',
    date: 'June 21, 2026',
    venue: 'Elite Courts, Chennai',
    slots: 32,
    filled: 28,
    status: 'Open',
    format: 'Round Robin + Knockout',
    level: 'Advanced',
    organizer: 'TT Masters League',
    registered: true,
  },
  {
    id: 3,
    title: 'Smash Club Badminton Pro Series',
    sport: 'Badminton',
    image: '/smash_club_badminton.jpg',
    banner: '/smash_club_badminton.jpg',
    pfp: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?q=80&w=300',
    prizePool: '₹4,000',
    prizeRaw: 4000,
    entryFee: '₹199',
    date: 'July 5–6, 2026',
    venue: 'Smash Club, Chennai',
    slots: 24,
    filled: 10,
    status: 'Open',
    format: 'League + Knockout',
    level: 'All Levels',
    organizer: 'Badminton Elite Doubles',
    registered: false,
  },
  {
    id: 4,
    title: 'HyperBowl League Night Championship',
    sport: 'Bowling',
    image: '/bowling.jpg',
    banner: '/bowling.jpg',
    pfp: 'https://images.unsplash.com/photo-1545803928-8e6d97e59c56?q=80&w=300',
    prizePool: '₹3,000',
    prizeRaw: 3000,
    entryFee: '₹99',
    date: 'June 28, 2026',
    venue: 'Apex Bowling & Games, Chennai',
    slots: 20,
    filled: 20,
    status: 'Full',
    format: 'League',
    level: 'Beginner Friendly',
    organizer: 'Bowling League Syndicate',
    registered: false,
  },
];

/* Owner's managed tournaments */
const MY_TOURNAMENTS = [
  {
    id: 101,
    title: 'Vanguard Summer Football Cup',
    sport: 'Football',
    image: '/trophy.png',
    prizePool: '₹5,000',
    entryFee: '₹299',
    date: 'July 12–13, 2026',
    venue: 'Vanguard Sports Arena, Chennai',
    slots: 16,
    filled: 7,
    status: 'Draft',
    registrations: [
      { name: 'Rahul Sharma', team: 'Alpha FC', paid: true },
      { name: 'Sonia Verma', team: 'Star Strikers', paid: true },
      { name: 'Amit Patel', team: 'Thunder United', paid: false },
    ],
  },
];

const LEVEL_COLORS = {
  'Advanced': 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  'Intermediate': 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  'All Levels': 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'Beginner Friendly': 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
};

const SPORT_COLORS = {
  Football:      { color: 'emerald' },
  Badminton:     { color: 'indigo' },
  'Table Tennis':{ color: 'rose' },
  Bowling:       { color: 'cyan' },
  Cricket:       { color: 'amber' },
};

/* ─── Tournament Registration & Verification Modal ────────────────────── */
function TournamentRegistrationModal({ tournament, user, onClose, onSuccess }) {
  const [step, setStep] = useState('form'); // 'form' | 'verify' | 'payment' | 'processing' | 'success'

  // Prefill user details if available
  const profileName = user?.full_name || user?.name || user?.displayName || (user?.email ? user.email.split('@')[0] : '');
  const profilePhone = user?.phone || user?.phoneNumber || '';
  const profileEmail = user?.email || '';

  const [formData, setFormData] = useState({
    teamName: profileName ? `${profileName}'s Squad` : '',
    captainName: profileName,
    phone: profilePhone,
    email: profileEmail,
    category: 'Open Division',
    roster: profileName ? `${profileName} (Captain)` : '',
    acceptRules: false,
  });

  React.useEffect(() => {
    if (user) {
      const uName = user.full_name || user.name || user.displayName || (user.email ? user.email.split('@')[0] : '');
      const uPhone = user.phone || user.phoneNumber || '';
      const uEmail = user.email || '';
      setFormData(prev => ({
        ...prev,
        teamName: prev.teamName || (uName ? `${uName}'s Squad` : ''),
        captainName: prev.captainName || uName,
        phone: prev.phone || uPhone,
        email: prev.email || uEmail,
        roster: prev.roster || (uName ? `${uName} (Captain)` : '')
      }));
    }
  }, [user]);

  const [paymentMethod, setPaymentMethod] = useState('upi'); // 'upi' | 'card' | 'netbanking'
  const [upiId, setUpiId] = useState('player@upi');
  const [cardNumber, setCardNumber] = useState('4111 •••• •••• 9842');
  const [ticketPassId, setTicketPassId] = useState('');
  const [errors, setErrors] = useState({});

  const numericFee = parseInt(String(tournament?.entryFee || '249').replace(/[^0-9]/g, ''), 10) || 249;
  const gst = Math.round(numericFee * 0.18);
  const totalAmount = numericFee + gst;

  const handleValidateForm = (e) => {
    e.preventDefault();
    const errs = {};
    if (!formData.teamName.trim()) errs.teamName = 'Team name is required';
    if (!formData.captainName.trim()) errs.captainName = 'Captain name is required';
    if (!formData.phone.trim()) errs.phone = 'Phone number is required';
    if (!formData.email.trim()) errs.email = 'Email address is required';
    if (!formData.acceptRules) errs.acceptRules = 'You must accept regulations & fair play policy';

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep('verify');
  };

  const handleProceedToPayment = () => {
    setStep('payment');
  };

  const handlePayNow = () => {
    setStep('processing');
    const passId = `TRN-${Math.floor(100000 + Math.random() * 900000)}`;
    setTicketPassId(passId);

    // Save tournament registration and user booking
    try {
      const currentRegs = JSON.parse(localStorage.getItem('turfington_registered_tournaments') || '[]');
      if (!currentRegs.includes(tournament?.id)) {
        currentRegs.push(tournament?.id);
        localStorage.setItem('turfington_registered_tournaments', JSON.stringify(currentRegs));
      }
      const uid = user?.uid || user?.id || user?.firebase_uid;
      if (uid) {
        const uKey = `turfington_user_bookings_${uid}`;
        const userBookings = JSON.parse(localStorage.getItem(uKey) || '[]');
        const tournamentBooking = {
          id: passId,
          booking_id: passId,
          type: 'tournament',
          title: tournament?.title || 'Tournament',
          venue: tournament?.venue || 'Venue',
          venue_name: tournament?.venue || 'Venue',
          date: tournament?.date || 'Upcoming',
          time: tournament?.time || '09:00 AM',
          slot_time: tournament?.time || '09:00 AM',
          sport: tournament?.sport || 'Football',
          teamName: formData.teamName,
          captainName: formData.captainName,
          price: totalAmount,
          amount: totalAmount,
          amount_paid: totalAmount,
          status: 'confirmed',
          is_prepaid: true,
          createdAt: new Date().toISOString()
        };
        userBookings.unshift(tournamentBooking);
        localStorage.setItem(uKey, JSON.stringify(userBookings));

        // Sync with API backend
        fetch(`${API_BASE}/api/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: passId,
            user_id: uid,
            userId: uid,
            userName: formData.captainName || user?.displayName || 'Athlete',
            venue: tournament?.venue || 'Venue',
            sport: tournament?.sport || 'Football',
            date: tournament?.date || 'Upcoming',
            time: tournament?.time || '09:00 AM',
            price: totalAmount,
            amount: totalAmount,
            status: 'confirmed',
            type: 'tournament'
          })
        }).catch(err => console.warn('Sync tournament booking notice:', err));
      }
    } catch (e) {
      console.warn('Error saving tournament booking:', e);
    }

    setTimeout(() => {
      setStep('success');
      if (typeof onSuccess === 'function') {
        onSuccess(tournament?.id);
      }
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto pt-10 pb-10">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 bg-black/90 backdrop-blur-2xl" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative bg-[#111116] border border-white/15 shadow-[0_25px_80px_rgba(0,0,0,0.95)] w-full max-w-[540px] p-6 sm:p-8 z-10 text-left my-auto rounded-3xl"
      >
        <div className="relative h-28 -mx-6 -mt-6 sm:-mx-8 sm:-mt-8 mb-5 overflow-hidden rounded-t-3xl bg-neutral-900 border-b border-white/10">
          <img
            src={tournament?.banner || tournament?.image}
            alt=""
            className="w-full h-full object-cover brightness-75"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#111116] via-black/40 to-black/20" />
          <button onClick={onClose} className="absolute top-3.5 right-3.5 z-20 p-2 rounded-full bg-black/60 backdrop-blur-md border border-white/20 hover:bg-black/80 text-neutral-300 hover:text-white transition-all cursor-pointer">
            <X className="w-4 h-4" />
          </button>
          <div className="absolute bottom-3 left-6 sm:left-8 flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl overflow-hidden border-2 border-white/30 shadow-xl bg-neutral-900 flex-shrink-0">
              <img
                src={tournament?.pfp || tournament?.image || tournament?.banner}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
            <div>
              <span className="text-[9px] uppercase font-black text-indigo-300 tracking-wider px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30">
                {tournament?.sport}
              </span>
            </div>
          </div>
        </div>

        {/* Step Header Indicator */}
        <div className="mb-6">
          <div className="flex items-center space-x-2 text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Tournament Registration</span>
          </div>
          <h3 className="font-display font-black text-white text-xl leading-tight">{tournament.title}</h3>
          <p className="text-xs text-neutral-400 mt-1 flex items-center gap-2">
            <span>{tournament.date}</span>
            <span>•</span>
            <span className="text-indigo-300">{tournament.venue}</span>
          </p>

          {/* Progress Bar Steps */}
          <div className="grid grid-cols-4 gap-1.5 mt-5">
            {[
              { id: 'form', label: '1. Details' },
              { id: 'verify', label: '2. Verify' },
              { id: 'payment', label: '3. Prepaid Pay' },
              { id: 'success', label: '4. Pass' },
            ].map((s) => {
              const stepOrder = ['form', 'verify', 'payment', 'processing', 'success'];
              const currentIdx = stepOrder.indexOf(step === 'processing' ? 'payment' : step);
              const thisIdx = stepOrder.indexOf(s.id);
              const isActive = s.id === (step === 'processing' ? 'payment' : step);
              const isDone = thisIdx < currentIdx;

              return (
                <div key={s.id} className="flex flex-col gap-1">
                  <div className={`h-1.5 rounded-full transition-all duration-300 ${
                    isActive ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : isDone ? 'bg-emerald-500' : 'bg-white/10'
                  }`} />
                  <span className={`text-[10px] font-bold text-center ${
                    isActive ? 'text-indigo-400' : isDone ? 'text-emerald-400' : 'text-neutral-500'
                  }`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── STEP 1: REGISTRATION FORM ───────────────────── */}
        {step === 'form' && (
          <form onSubmit={handleValidateForm} className="space-y-4">
            <div className="bg-indigo-950/40 border border-indigo-500/25 rounded-2xl p-4 mb-2">
              <p className="text-xs text-neutral-300 flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                <span>Fill in your squad/player details accurately. Details will be verified before match allocation.</span>
              </p>
            </div>

            <div>
              <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-extrabold mb-1 block">Team / Player Name *</label>
              <input
                type="text"
                value={formData.teamName}
                onChange={e => setFormData({ ...formData, teamName: e.target.value })}
                placeholder="e.g. Phoenix Strikers FC"
                className="w-full bg-[#181822] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
              />
              {errors.teamName && <p className="text-rose-400 text-[11px] mt-1">{errors.teamName}</p>}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-extrabold mb-1 block">Captain Name *</label>
                <input
                  type="text"
                  value={formData.captainName}
                  onChange={e => setFormData({ ...formData, captainName: e.target.value })}
                  placeholder="Full Name"
                  className="w-full bg-[#181822] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                />
                {errors.captainName && <p className="text-rose-400 text-[11px] mt-1">{errors.captainName}</p>}
              </div>

              <div>
                <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-extrabold mb-1 block">Division / Category</label>
                <select
                  value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  className="w-full bg-[#181822] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Open Division">Open Division</option>
                  <option value="Amateur Level">Amateur Level</option>
                  <option value="Semi-Pro / Elite">Semi-Pro / Elite</option>
                  <option value="Under-21 Youth">Under-21 Youth</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-extrabold mb-1 block">Phone Number *</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+91 9876543210"
                  className="w-full bg-[#181822] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                />
                {errors.phone && <p className="text-rose-400 text-[11px] mt-1">{errors.phone}</p>}
              </div>

              <div>
                <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-extrabold mb-1 block">Email Address *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  placeholder="captain@example.com"
                  className="w-full bg-[#181822] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                />
                {errors.email && <p className="text-rose-400 text-[11px] mt-1">{errors.email}</p>}
              </div>
            </div>

            <div>
              <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-extrabold mb-1 block">Squad Roster / Player Names</label>
              <textarea
                rows={2}
                value={formData.roster}
                onChange={e => setFormData({ ...formData, roster: e.target.value })}
                placeholder="List players (e.g. Rahul S, Danish K, Amit P, Vignesh M)"
                className="w-full bg-[#181822] border border-white/10 rounded-xl px-4 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="pt-2">
              <label className="flex items-start space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.acceptRules}
                  onChange={e => setFormData({ ...formData, acceptRules: e.target.checked })}
                  className="mt-0.5 rounded border-white/20 bg-neutral-800 text-indigo-600 focus:ring-0"
                />
                <span className="text-xs text-neutral-300 leading-tight">
                  I agree to tournament regulations, match reporting times, and fair play code of conduct.
                </span>
              </label>
              {errors.acceptRules && <p className="text-rose-400 text-[11px] mt-1">{errors.acceptRules}</p>}
            </div>

            <button type="submit"
              className="w-full py-3.5 mt-4 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-full transition-colors flex items-center justify-center space-x-2 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
              <span>Verify Registration Details</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* ── STEP 2: VERIFICATION SUMMARY ───────────────────── */}
        {step === 'verify' && (
          <div className="space-y-5">
            <div className="bg-[#181822] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-white/10">
                <span className="text-xs text-neutral-400 uppercase tracking-wider font-extrabold">Verification Summary</span>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2.5 py-0.5 rounded-full font-bold">
                  {formData.category}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">Team Name</span>
                  <span className="text-white font-bold text-sm">{formData.teamName}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">Captain Name</span>
                  <span className="text-white font-bold text-sm">{formData.captainName}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">Contact Phone</span>
                  <span className="text-neutral-300 font-medium">{formData.phone}</span>
                </div>
                <div>
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold">Contact Email</span>
                  <span className="text-neutral-300 font-medium truncate block">{formData.email}</span>
                </div>
              </div>

              {formData.roster && (
                <div className="pt-2 border-t border-white/5 text-xs">
                  <span className="text-neutral-500 block text-[10px] uppercase font-bold mb-1">Squad Roster</span>
                  <p className="text-neutral-300 bg-[#12121a] p-2.5 rounded-xl border border-white/5">{formData.roster}</p>
                </div>
              )}

              {/* Fee breakdown */}
              <div className="bg-[#12121a] rounded-xl p-3.5 space-y-2 text-xs border border-white/5">
                <div className="flex justify-between"><span className="text-neutral-400">Tournament Entry Fee</span><span className="text-white font-bold">₹{numericFee}</span></div>
                <div className="flex justify-between"><span className="text-neutral-400">GST (18%)</span><span className="text-white font-bold">₹{gst}</span></div>
                <div className="h-px bg-white/10 my-1" />
                <div className="flex justify-between items-center">
                  <span className="text-white font-bold text-sm">Total Payable</span>
                  <span className="text-indigo-400 font-black text-lg">₹{totalAmount}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('form')}
                className="w-1/3 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 font-bold text-xs uppercase tracking-wider rounded-full transition-all">
                Edit Details
              </button>
              <button onClick={handleProceedToPayment}
                className="w-2/3 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-full transition-all flex items-center justify-center space-x-2 shadow-[0_0_20px_rgba(99,102,241,0.3)]">
                <IndianRupee className="w-4 h-4" />
                <span>Pay ₹{totalAmount} & Register</span>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: PREPAID PAYMENT GATEWAY ───────────────────── */}
        {step === 'payment' && (
          <div className="space-y-5">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-3.5 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-amber-300">Prepaid Entry Required for Tournaments</p>
                <p className="text-[11px] text-neutral-300 leading-relaxed mt-0.5">
                  Tournament slots & bracket seeds are locked strictly upon upfront prepaid confirmation. (Regular casual turf bookings do not require prepayment).
                </p>
              </div>
            </div>

            <div className="bg-[#181822] border border-white/10 rounded-2xl p-4">
              <div className="flex justify-between items-center mb-3">
                <div>
                  <span className="text-xs text-neutral-400 font-bold uppercase tracking-wider block">Prepaid Payment Method</span>
                  <span className="text-[10px] text-emerald-400 font-bold">100% Advance Confirmation</span>
                </div>
                <span className="text-indigo-400 font-black text-base">₹{totalAmount}</span>
              </div>

              <div className="space-y-2">
                {[
                  { id: 'upi', label: 'UPI / GPay / PhonePe', icon: Smartphone, subtitle: 'Instant 1-Click Payment' },
                  { id: 'card', label: 'Credit / Debit Card', icon: CreditCard, subtitle: 'Visa, Mastercard, RuPay' },
                  { id: 'netbanking', label: 'Net Banking', icon: Building2, subtitle: 'All Major Indian Banks' },
                ].map(m => (
                  <label key={m.id} onClick={() => setPaymentMethod(m.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all ${
                      paymentMethod === m.id ? 'bg-indigo-500/10 border-indigo-500' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'
                    }`}>
                    <div className="flex items-center space-x-3">
                      <div className={`p-2 rounded-lg ${paymentMethod === m.id ? 'bg-indigo-500 text-white' : 'bg-white/5 text-neutral-400'}`}>
                        <m.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">{m.label}</p>
                        <p className="text-[10px] text-neutral-400">{m.subtitle}</p>
                      </div>
                    </div>
                    <input type="radio" name="payMethod" checked={paymentMethod === m.id} onChange={() => {}} className="text-indigo-600 focus:ring-0" />
                  </label>
                ))}
              </div>

              {/* Payment Details Input Preview */}
              <div className="mt-4 pt-3 border-t border-white/5">
                {paymentMethod === 'upi' && (
                  <div>
                    <label className="text-[10px] text-neutral-400 uppercase font-bold block mb-1">Enter VPA / UPI ID</label>
                    <input type="text" value={upiId} onChange={e => setUpiId(e.target.value)} className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-xs text-white" />
                  </div>
                )}
                {paymentMethod === 'card' && (
                  <div>
                    <label className="text-[10px] text-neutral-400 uppercase font-bold block mb-1">Card Number</label>
                    <input type="text" value={cardNumber} onChange={e => setCardNumber(e.target.value)} className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-xs text-white" />
                  </div>
                )}
                {paymentMethod === 'netbanking' && (
                  <div>
                    <label className="text-[10px] text-neutral-400 uppercase font-bold block mb-1">Popular Banks</label>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      {['HDFC', 'ICICI', 'SBI', 'Axis', 'Kotak', 'Others'].map(b => (
                        <button key={b} className="py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-white font-semibold">{b}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setStep('verify')}
                className="w-1/3 py-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 font-bold text-xs uppercase tracking-wider rounded-full transition-all">
                Back
              </button>
              <button onClick={handlePayNow}
                className="w-2/3 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-full transition-all flex items-center justify-center space-x-2 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                <CheckCircle className="w-4 h-4" />
                <span>Confirm & Pay Prepaid ₹{totalAmount}</span>
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3.5: PROCESSING ───────────────────── */}
        {step === 'processing' && (
          <div className="flex flex-col items-center py-10 space-y-4 text-center">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
              <ShieldCheck className="w-7 h-7 text-indigo-400 absolute inset-0 m-auto" />
            </div>
            <div>
              <p className="text-white font-black text-base font-display">Processing Payment & Registration...</p>
              <p className="text-neutral-400 text-xs mt-1">Verifying with payment gateway & locking slot for <span className="text-indigo-300 font-bold">{formData.teamName}</span></p>
            </div>
          </div>
        )}

        {/* ── STEP 4: SUCCESS TICKET PASS ───────────────────── */}
        {step === 'success' && (
          <div className="space-y-5 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.2)]">
              <CheckCircle className="w-8 h-8" />
            </div>

            <div>
              <h3 className="font-display font-black text-2xl text-white">Registration Confirmed!</h3>
              <p className="text-xs text-neutral-400 mt-1">You are officially registered for the tournament.</p>
            </div>

            {/* Official Tournament Pass Card */}
            <div className="bg-gradient-to-br from-indigo-950/60 to-purple-950/40 border border-indigo-500/30 rounded-2xl p-5 text-left relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 right-0 bg-emerald-500 text-black font-extrabold text-[9px] uppercase tracking-widest px-3 py-1 rounded-bl-xl">
                VERIFIED PASS
              </div>

              <div className="flex items-center space-x-2 text-[10px] text-indigo-300 uppercase tracking-widest font-extrabold mb-2">
                <QrCode className="w-3.5 h-3.5" />
                <span>Pass ID: {ticketPassId}</span>
              </div>

              <h4 className="font-display font-bold text-white text-base leading-tight mb-3">{tournament.title}</h4>

              <div className="grid grid-cols-2 gap-2 text-xs border-t border-b border-white/10 py-3 mb-3">
                <div>
                  <span className="text-[9px] text-neutral-400 uppercase block font-bold">Team Name</span>
                  <span className="text-emerald-400 font-extrabold">{formData.teamName}</span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-400 uppercase block font-bold">Captain</span>
                  <span className="text-white font-bold">{formData.captainName}</span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-400 uppercase block font-bold">Date</span>
                  <span className="text-neutral-300">{tournament.date}</span>
                </div>
                <div>
                  <span className="text-[9px] text-neutral-400 uppercase block font-bold">Venue</span>
                  <span className="text-neutral-300 truncate block">{tournament.venue}</span>
                </div>
              </div>

              {/* Barcode / QR Simulation */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center space-x-1 font-mono text-[9px] text-neutral-400">
                  <span className="w-1 h-6 bg-white/60"></span>
                  <span className="w-2 h-6 bg-white/80"></span>
                  <span className="w-0.5 h-6 bg-white/40"></span>
                  <span className="w-1.5 h-6 bg-white"></span>
                  <span className="w-1 h-6 bg-white/50"></span>
                  <span className="w-2.5 h-6 bg-white/90"></span>
                  <span className="w-1 h-6 bg-white/30"></span>
                  <span className="ml-2 font-sans text-neutral-400">SLOT-CONFIRMED</span>
                </div>
                <span className="text-indigo-400 font-extrabold text-xs">₹{totalAmount} PAID</span>
              </div>
            </div>

            <button onClick={onClose}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-full transition-colors shadow-[0_0_20px_rgba(99,102,241,0.3)]">
              Done & View Tournaments
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ─── Create Tournament Form (Owner) ─────────────────── */
function CreateTournamentForm({ onClose, onCreated }) {
  const [form, setForm] = useState({
    title: '', sport: 'Football', startDate: '', endDate: '', venue: '', city: '',
    prizePool: '', entryFee: '', slots: '16', format: 'Knockout', level: 'All Levels',
    teamSize: '1', registrationDeadline: '', contactPhone: '', contactEmail: '',
    rules: '', description: '', image: '', banner: '', pfp: ''
  });

  const fileInputRef = useRef(null);
  const pfpFileInputRef = useRef(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const compressImage = (file, maxDim = 1200) => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(loadEvent.target?.result || '');
        img.src = loadEvent.target?.result;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const handleMainPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const dataUrl = await compressImage(file, 1200);
      if (dataUrl) {
        setForm(prev => ({
          ...prev,
          image: dataUrl,
          banner: dataUrl,
          pfp: prev.pfp || dataUrl
        }));
      }
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSeparatePfpUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImage(file, 400);
      if (dataUrl) {
        setForm(prev => ({
          ...prev,
          pfp: dataUrl
        }));
      }
    } catch {}
  };

  const handleRemovePhoto = () => {
    setForm(prev => ({
      ...prev,
      image: '',
      banner: '',
      pfp: ''
    }));
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (pfpFileInputRef.current) pfpFileInputRef.current.value = '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreated(form);
    onClose();
  };

  const inputClass = "w-full bg-[#181822] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500/50 transition-colors";
  const labelClass = "text-[10px] text-neutral-400 uppercase tracking-widest font-bold mb-1.5 block";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 md:pt-20 overflow-y-auto">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="fixed inset-0 bg-black/90 backdrop-blur-2xl" />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        className="relative bg-[#111116] w-full max-w-[600px] border border-white/15 shadow-[0_25px_80px_rgba(0,0,0,0.95)] z-10 text-left mb-8 rounded-3xl overflow-hidden">

        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <div>
            <h3 className="font-display font-black text-white text-lg uppercase tracking-tight flex items-center gap-2">
              <Trophy className="w-5 h-5 text-indigo-400" />
              <span>Create Tournament</span>
            </h3>
            <p className="text-[10px] text-neutral-500 mt-0.5">Upload a photo to set your tournament banner & PFP</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/5 border border-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          {/* Tournament Photo (Banner & PFP) Upload Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Tournament Photo (Banner & PFP) *</label>
              {(form.banner || form.image) && (
                <span className="text-[10px] text-emerald-400 font-extrabold flex items-center gap-1">
                  <Check className="w-3 h-3" /> Photo Attached
                </span>
              )}
            </div>

            <div className="relative rounded-2xl border-2 border-dashed border-white/15 hover:border-indigo-500/50 transition-all bg-[#14141c] overflow-hidden group">
              {form.banner || form.image ? (
                <div className="relative">
                  {/* Banner Preview */}
                  <div className="relative h-44 w-full overflow-hidden bg-neutral-900">
                    <img
                      src={form.banner || form.image}
                      alt="Tournament Banner Preview"
                      className="w-full h-full object-cover brightness-90"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/20" />

                    {/* Action buttons over banner */}
                    <div className="absolute top-3 right-3 flex items-center space-x-2 z-20">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-black/70 hover:bg-black/90 backdrop-blur-md border border-white/20 text-white rounded-full text-xs font-bold transition-all flex items-center space-x-1.5 cursor-pointer shadow-lg"
                      >
                        <Camera className="w-3.5 h-3.5 text-indigo-400" />
                        <span>Change Photo</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleRemovePhoto}
                        className="p-1.5 bg-rose-600/80 hover:bg-rose-600 backdrop-blur-md text-white rounded-full transition-all cursor-pointer shadow-lg"
                        title="Remove Photo"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md border border-white/15 px-2.5 py-1 rounded-full text-[9px] font-extrabold text-indigo-300 uppercase tracking-wider">
                      Tournament Banner
                    </div>
                  </div>

                  {/* Overlapping PFP Preview */}
                  <div className="absolute bottom-3 left-4 flex items-center space-x-3 z-10">
                    <div className="relative w-14 h-14 rounded-2xl overflow-hidden border-2 border-white/40 shadow-2xl bg-neutral-900 flex-shrink-0 group/pfp">
                      <img
                        src={form.pfp || form.image}
                        alt="Tournament PFP"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => pfpFileInputRef.current?.click()}
                        className="absolute inset-0 bg-black/70 opacity-0 group-hover/pfp:opacity-100 transition-opacity flex flex-col items-center justify-center cursor-pointer text-[8px] font-bold text-white"
                        title="Change PFP specifically"
                      >
                        <Camera className="w-3.5 h-3.5 mb-0.5 text-indigo-300" />
                        <span>Edit</span>
                      </button>
                    </div>
                    <div>
                      <p className="text-xs font-black text-white uppercase tracking-tight flex items-center gap-1.5">
                        <span>Tournament PFP</span>
                        <span className="text-[8px] text-emerald-400 font-extrabold px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30">Auto-Linked</span>
                      </p>
                      <p className="text-[10px] text-neutral-400">Used as avatar & public tournament badge</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="py-10 px-6 flex flex-col items-center justify-center text-center cursor-pointer hover:bg-white/[0.02] transition-colors"
                >
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(99,102,241,0.15)]">
                    <Upload className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-white mb-1">
                    Upload Tournament Photo
                  </p>
                  <p className="text-[11px] text-neutral-400 max-w-xs">
                    PNG, JPG, or WEBP. Uploading a photo will automatically format as your tournament's <strong className="text-neutral-200">banner</strong> and <strong className="text-neutral-200">profile picture (PFP)</strong>.
                  </p>
                  <span className="mt-4 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-neutral-300 text-[11px] font-bold group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-500 transition-all cursor-pointer">
                    Browse File
                  </span>
                </div>
              )}

              {/* Hidden file inputs */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleMainPhotoUpload}
                className="hidden"
              />
              <input
                ref={pfpFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleSeparatePfpUpload}
                className="hidden"
              />
            </div>
          </div>

          {/* Tournament name */}
          <div>
            <label className={labelClass}>Tournament Name *</label>
            <input value={form.title} onChange={e => setForm({...form, title: e.target.value})} required
              placeholder="e.g. Summer Football Gold Cup" className={inputClass} />
          </div>

          {/* Sport + Format */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Sport *</label>
              <select value={form.sport} onChange={e => setForm({...form, sport: e.target.value})} className={inputClass}>
                {['Football','Badminton','Table Tennis','Bowling','Cricket'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Format *</label>
              <select value={form.format} onChange={e => setForm({...form, format: e.target.value})} className={inputClass}>
                {['Knockout','Round Robin','League + Knockout','Round Robin + Knockout','Swiss System'].map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>

          {/* Prize + Entry Fee */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Prize Pool (₹) *</label>
              <input value={form.prizePool} onChange={e => setForm({...form, prizePool: e.target.value})} required
                placeholder="e.g. 1,00,000" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Entry Fee (₹) *</label>
              <input value={form.entryFee} onChange={e => setForm({...form, entryFee: e.target.value})} required
                placeholder="e.g. 499" className={inputClass} />
            </div>
          </div>

          {/* Team size + slots */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Team / Player Size</label>
              <select value={form.teamSize} onChange={e => setForm({...form, teamSize: e.target.value})} className={inputClass}>
                {['1','2','3','4','5','6','7','8','11','15'].map(n => <option key={n} value={n}>{n === '1' ? 'Individual' : `${n} per team`}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Total Slots *</label>
              <select value={form.slots} onChange={e => setForm({...form, slots: e.target.value})} className={inputClass}>
                {['8','12','16','24','32','48','64'].map(n => <option key={n} value={n}>{n} Teams/Players</option>)}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Start Date *</label>
              <input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>End Date</label>
              <input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Registration Deadline</label>
            <input type="date" value={form.registrationDeadline} onChange={e => setForm({...form, registrationDeadline: e.target.value})} className={inputClass} />
          </div>

          {/* Venue */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Venue Name *</label>
              <input value={form.venue} onChange={e => setForm({...form, venue: e.target.value})} required
                placeholder="e.g. Vanguard Sports Arena" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>City</label>
              <input value={form.city} onChange={e => setForm({...form, city: e.target.value})}
                placeholder="e.g. Chennai" className={inputClass} />
            </div>
          </div>

          {/* Skill level */}
          <div>
            <label className={labelClass}>Skill Level</label>
            <select value={form.level} onChange={e => setForm({...form, level: e.target.value})} className={inputClass}>
              {['All Levels','Beginner Friendly','Intermediate','Advanced','Elite'].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Contact Phone</label>
              <input value={form.contactPhone} onChange={e => setForm({...form, contactPhone: e.target.value})}
                placeholder="+91 98765 43210" className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Contact Email</label>
              <input type="email" value={form.contactEmail} onChange={e => setForm({...form, contactEmail: e.target.value})}
                placeholder="organizer@email.com" className={inputClass} />
            </div>
          </div>

          {/* Rules */}
          <div>
            <label className={labelClass}>Rules & Format Details</label>
            <textarea value={form.rules} onChange={e => setForm({...form, rules: e.target.value})}
              rows={3} placeholder="e.g. Each team must have min 7 players. No studs allowed on astroturf..." className={`${inputClass} resize-none`} />
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Tournament Description</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              rows={2} placeholder="Brief overview, prizes, special awards..." className={`${inputClass} resize-none`} />
          </div>

          <button type="submit"
            className="w-full py-4 bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-full transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-violet-600/30">
            <Trophy className="w-4 h-4" />
            <span>Publish Tournament</span>
          </button>
        </form>
      </motion.div>
    </div>
  );
}

/* ─── Main Component ─────────────────────────────────── */
export default function Tournaments({ role, user }) {
  const [activeFilter, setActiveFilter] = useState('All');
  const [tournaments, setTournaments] = useState(() => {
    try {
      const savedRegs = JSON.parse(localStorage.getItem('turfington_registered_tournaments') || '[]');
      return TOURNAMENTS.map(t => savedRegs.includes(t.id) ? { ...t, registered: true, filled: Math.min(t.slots, t.filled + 1) } : t);
    } catch {
      return TOURNAMENTS;
    }
  });
  const [myTournaments, setMyTournaments] = useState(MY_TOURNAMENTS);
  const [payModal, setPayModal] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedOwnerTournament, setExpandedOwnerTournament] = useState(null);

  const isOwner = role === 'owner';

  const filtered = tournaments.filter(t =>
    activeFilter === 'All' || t.sport === activeFilter
  );

  const handleRegistered = (id) => {
    setTournaments(prev => prev.map(t => t.id === id ? { ...t, registered: true, filled: t.filled + 1 } : t));
  };

  const handleCreate = (form) => {
    const newT = {
      id: Date.now(),
      title: form.title,
      sport: form.sport,
      image: `https://images.unsplash.com/photo-1508098682722-e99c43a406b2?q=80&w=800`,
      prizePool: `₹${form.prizePool}`,
      entryFee: `₹${form.entryFee}`,
      date: form.date,
      slots: parseInt(form.slots),
      filled: 0,
      status: 'Draft',
      registrations: [],
    };
    setMyTournaments(prev => [newT, ...prev]);
  };

  return (
    <div className="min-h-screen bg-transparent pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">

      {/* ── Header ───────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <Trophy className="w-5 h-5 text-indigo-400" />
            <span className="text-[10px] text-indigo-400 uppercase font-extrabold tracking-widest">
              {isOwner ? 'Tournament Management' : 'Compete & Win'}
            </span>
          </div>
          <h1 className="text-3xl font-black font-display tracking-tight uppercase text-white">
            {isOwner ? 'Your Tournaments' : 'Tournaments'}
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            {isOwner
              ? 'Create, manage and track all your hosted tournaments'
              : 'Register for upcoming tournaments and win prize money in ₹'}
          </p>
        </div>

        {isOwner && (
          <button
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center space-x-2 px-6 py-3.5 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-all shadow-[0_0_20px_rgba(139,92,246,0.2)]"
          >
            <Plus className="w-4 h-4" />
            <span>Create Tournament</span>
          </button>
        )}
      </div>

      {/* ── OWNER: My Tournaments Section ────────────── */}
      {isOwner && (
        <div className="mb-12">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-400 mb-5">My Hosted Tournaments</h2>
          <div className="space-y-4">
            {myTournaments.length === 0 ? (
              <div className="glass-card p-10 text-center border border-dashed border-white/10">
                <Trophy className="w-8 h-8 text-neutral-600 mx-auto mb-3" />
                <p className="text-neutral-500 text-sm">No tournaments yet. Create your first one!</p>
              </div>
            ) : (
              myTournaments.map(t => (
                <motion.div key={t.id} layout className="glass-card border border-white/5 overflow-hidden">
                  <div className="flex flex-col md:flex-row md:items-center gap-4 p-5">
                    <div className="w-full md:w-28 h-20 rounded-xl overflow-hidden flex-shrink-0">
                      <img src={t.image} alt={t.title} className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-grow">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="text-[9px] uppercase font-extrabold px-2.5 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400">
                          {t.status}
                        </span>
                        <span className="text-[9px] text-neutral-500">{t.sport}</span>
                      </div>
                      <h3 className="font-display font-bold text-white text-base">{t.title}</h3>
                      <div className="flex flex-wrap gap-4 mt-2 text-xs text-neutral-400">
                        <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" />{t.date}</span>
                        <span className="flex items-center"><Users className="w-3 h-3 mr-1" />{t.filled}/{t.slots} Registered</span>
                        <span className="flex items-center"><IndianRupee className="w-3 h-3 mr-0.5" />{t.prizePool.replace('₹','')}</span>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                      <button
                        onClick={() => setExpandedOwnerTournament(expandedOwnerTournament === t.id ? null : t.id)}
                        className="text-xs px-4 py-2 rounded-full bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all font-bold"
                      >
                        {expandedOwnerTournament === t.id ? 'Collapse' : 'View Registrations'}
                      </button>
                      <button className="p-2 rounded-full bg-white/5 border border-white/10 text-neutral-400 hover:text-violet-400 transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button className="p-2 rounded-full bg-white/5 border border-white/10 text-neutral-400 hover:text-rose-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Registrations Drawer */}
                  <AnimatePresence>
                    {expandedOwnerTournament === t.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/5 overflow-hidden"
                      >
                        <div className="p-5">
                          <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400 mb-4">
                            Registered Participants ({t.registrations.length})
                          </h4>
                          {t.registrations.length === 0 ? (
                            <p className="text-neutral-600 text-xs">No registrations yet.</p>
                          ) : (
                            <div className="space-y-2">
                              {t.registrations.map((r, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-white/[0.02] border border-white/5 rounded-xl text-xs">
                                  <div>
                                    <span className="font-bold text-white">{r.name}</span>
                                    <span className="text-neutral-500 ml-2">{r.team}</span>
                                  </div>
                                  <span className={`text-[9px] font-extrabold uppercase px-2.5 py-0.5 rounded-full border ${
                                    r.paid ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                  }`}>
                                    {r.paid ? 'Paid' : 'Pending'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── Sport Filter Tabs ─────────────────────────── */}
      <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-2 mb-8">
        {SPORTS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveFilter(tab)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 border ${
              activeFilter === tab
                ? 'bg-white text-black border-transparent'
                : 'bg-white/[0.03] text-neutral-400 border-white/8 hover:border-white/20 hover:text-white'
            }`}
          >
            {tab !== 'All' && <SportIcon sport={tab} size={12} />}
            {tab}
          </button>
        ))}
      </div>

      {/* ── Tournament Cards Grid ─────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-400">
            {isOwner ? 'All Upcoming Tournaments' : 'Open Tournaments'}
            <span className="ml-2 text-neutral-600">({filtered.length})</span>
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6">
          {filtered.map((t, i) => {
            const sportMeta = SPORT_COLORS[t.sport] || { icon: '🏆', color: 'indigo' };
            const fillPct = Math.round((t.filled / t.slots) * 100);
            const isFull = t.status === 'Full';

            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="glass-card overflow-hidden border border-white/5 hover:border-white/10 transition-all duration-300 group"
              >
                {/* Image */}
                <div className="relative h-44 overflow-hidden">
                  <img src={t.image} alt={t.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500 brightness-75" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />

                  {/* Prize badge */}
                  <div className="absolute top-4 left-4 bg-black/60 backdrop-blur-md border border-white/10 rounded-xl px-3 py-2">
                    <p className="text-[8px] text-neutral-300 uppercase font-bold tracking-widest">Prize Pool</p>
                    <p className="text-lg font-black text-white font-display">{t.prizePool}</p>
                  </div>

                  {/* Status & Prepaid badge */}
                  <div className="absolute top-4 right-4 flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider border backdrop-blur-md bg-amber-500/20 text-amber-300 border-amber-500/30">
                      Prepaid
                    </span>
                    <div className={`px-2.5 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider border backdrop-blur-md ${
                      isFull ? 'bg-neutral-900/80 text-neutral-400 border-white/10' : 'bg-indigo-600/80 text-white border-indigo-500/30'
                    }`}>
                      {isFull ? '🔴 Full' : '🟢 Open'}
                    </div>
                  </div>

                  {/* Registered check */}
                  {t.registered && (
                    <div className="absolute bottom-4 left-4 flex items-center space-x-1.5 bg-emerald-600/80 backdrop-blur-md px-2.5 py-1 rounded-full">
                      <CheckCircle className="w-3 h-3 text-white" />
                      <span className="text-[9px] text-white font-extrabold uppercase tracking-wider">Registered</span>
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <h3 className="font-display font-bold text-white text-base leading-tight">{t.title}</h3>
                      <p className="text-xs text-neutral-400 mt-0.5 flex items-center">
                        <MapPin className="w-3 h-3 mr-1 text-neutral-500" />{t.venue}
                      </p>
                    </div>
                  </div>

                  {/* Meta tags */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    <span className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded border ${LEVEL_COLORS[t.level] || 'text-neutral-400 bg-white/5 border-white/10'}`}>
                      {t.level}
                    </span>
                    <span className="text-[10px] font-bold text-neutral-400 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded uppercase">
                      {t.format}
                    </span>
                    <span className="text-[10px] font-bold text-neutral-400 bg-white/5 border border-white/10 px-2.5 py-0.5 rounded uppercase flex items-center gap-1.5">
                      <SportIcon sport={t.sport} size={11} />
                      {t.sport}
                    </span>
                  </div>

                  {/* Info row */}
                  <div className="flex flex-wrap gap-4 text-xs text-neutral-400 mb-4">
                    <span className="flex items-center"><Calendar className="w-3 h-3 mr-1" />{t.date}</span>
                    <span className="flex items-center"><Users className="w-3 h-3 mr-1" />{t.filled}/{t.slots}</span>
                    <span className="flex items-center font-semibold text-white">Entry: {t.entryFee}</span>
                  </div>

                  {/* Slots progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-[9px] text-neutral-500 mb-1.5">
                      <span>{t.filled} registered</span>
                      <span>{t.slots - t.filled} slots left</span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${fillPct >= 90 ? 'bg-rose-500' : fillPct >= 60 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                        style={{ width: `${fillPct}%` }}
                      />
                    </div>
                  </div>

                  {/* CTA */}
                  {!isOwner && (
                    <button
                      onClick={() => !isFull && !t.registered && setPayModal(t)}
                      disabled={isFull || t.registered}
                      className={`w-full py-3 rounded-full text-xs font-extrabold uppercase tracking-widest transition-all duration-300 ${
                        t.registered
                          ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 cursor-default'
                          : isFull
                          ? 'bg-white/5 border border-white/10 text-neutral-600 cursor-not-allowed'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.2)]'
                      }`}
                    >
                      {t.registered ? '✓ You\'re In' : isFull ? 'Tournament Full' : `Prepaid Register — ${t.entryFee}`}
                    </button>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ── Modals ───────────────────────────────────── */}
      <AnimatePresence>
        {payModal && (
          <TournamentRegistrationModal
            tournament={payModal}
            user={user}
            onClose={() => setPayModal(null)}
            onSuccess={handleRegistered}
          />
        )}
        {createOpen && (
          <CreateTournamentForm
            onClose={() => setCreateOpen(false)}
            onCreated={handleCreate}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
