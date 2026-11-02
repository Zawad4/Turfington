import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MapPin, Users, Clock, Award, Star, Calendar, MessageSquare, Heart, Share2, Compass, Plus, Flame } from 'lucide-react';
import { apiCreateDirectChat, apiSubscribeVenues, apiFetchHostedMatches, apiJoinHostedMatch, apiLeaveHostedMatch, apiCreateBooking, apiFetchTournaments } from '../services/db';
import { useToast } from '../context';
import { formatTime12Hour } from '../utils/formatters';

export default function Home({ 
  setTab, 
  joinedMatches = [], 
  matchRequests = [],
  onRequestJoinMatch,
  onRequestCancelMatch,
  onOpenHostManager,
  toggleJoinMatch, 
  bookings, 
  setBookings,
  user,
  role
}) {
  const { toast } = useToast();
  // Static lists representing items that can be joined
  const [sessions, setSessions] = useState([]);

  // Load and sync open matches hosted across the app
  useEffect(() => {
    const syncHostedSessions = async () => {
      try {
        const hosted = await apiFetchHostedMatches();
        if (Array.isArray(hosted) && hosted.length > 0) {
          const mappedHosted = hosted.map(m => ({
            id: m.id,
            title: m.title || `${m.sport} at ${m.venue}`,
            venue: m.venue,
            sport: m.sport || 'Sports',
            image: m.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=600',
            distance: m.distance || '1.1 km away',
            time: m.time || 'Upcoming Slot',
            playersJoined: m.players_joined || 1,
            playersTotal: m.players_total || m.capacity || 10,
            skillLevel: m.skill_level || 'All Levels',
            hostName: m.host_name || 'Match Host',
            hostAvatar: m.host_avatar,
            hostId: m.host_id,
            isLive: true,
            isHosted: true,
            price: m.price
          }));

          setSessions(prev => {
            const seen = new Set();
            const combined = [...mappedHosted, ...prev].filter(item => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });
            return combined;
          });
        }
      } catch {}
    };

    syncHostedSessions();
    window.addEventListener('turfington_hosted_matches_updated', syncHostedSessions);
    return () => window.removeEventListener('turfington_hosted_matches_updated', syncHostedSessions);
  }, []);

  const handleJoinHostedMatchClick = async (session) => {
    const isAlreadyJoined = joinedMatches.includes(session.id);
    if (isAlreadyJoined) {
      await apiLeaveHostedMatch(session.id, user?.id || 'usr_curr');
      toggleJoinMatch(session.id);
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, playersJoined: Math.max(1, (s.playersJoined || 1) - 1) } : s));
    } else {
      await apiJoinHostedMatch(session.id, user);
      toggleJoinMatch(session.id);
      setSessions(prev => prev.map(s => s.id === session.id ? { ...s, playersJoined: Math.min(s.playersTotal, (s.playersJoined || 0) + 1) } : s));
    }
  };

  const [venues, setVenues] = useState([]);

  // Subscribe to real-time venue updates
  useEffect(() => {
    const unsub = apiSubscribeVenues((loadedTurfs) => {
      if (loadedTurfs && loadedTurfs.length > 0) {
        const mapped = loadedTurfs.map(t => {
          const isCustom = String(t.id).startsWith('venue_') || t.owner_id != null;
          const sportsList = Array.isArray(t.sports) && t.sports.length > 0 
            ? t.sports 
            : [t.category || t.sport || 'Sports'];
          return {
            id: t.id,
            name: t.name,
            image: t.image_url || t.image || 'https://images.unsplash.com/photo-1565992441121-4367fe2034cf?q=80&w=800',
            rating: t.rating || 5.0,
            distance: t.distance_km ? `${t.distance_km} km` : '1.4 km',
            sports: sportsList,
            slots: 'Active slots open',
            price: t.price || (t.price_per_hr ? `₹${t.price_per_hr}/hr` : '₹1,000/hr'),
            isNew: isCustom
          };
        });
        setVenues(mapped);
      }
    });

    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  const [tournaments, setTournaments] = useState([]);
  const [timers, setTimers] = useState({});

  useEffect(() => {
    let isMounted = true;
    const loadRealTournaments = async () => {
      try {
        const list = await apiFetchTournaments();
        if (isMounted) {
          setTournaments(list);
          const initialTimers = {};
          list.forEach(t => {
            const h = t.initialHours || 48;
            const m = t.initialMinutes || 0;
            const s = t.initialSeconds || 0;
            initialTimers[t.id] = h * 3600 + m * 60 + s;
          });
          setTimers(initialTimers);
        }
      } catch (e) {}
    };

    loadRealTournaments();

    const handleCreated = () => { loadRealTournaments(); };
    window.addEventListener('turfington_tournament_created', handleCreated);
    window.addEventListener('turfington_tournament_updated', handleCreated);
    window.addEventListener('turfington_tournament_deleted', handleCreated);

    return () => {
      isMounted = false;
      window.removeEventListener('turfington_tournament_created', handleCreated);
      window.removeEventListener('turfington_tournament_updated', handleCreated);
      window.removeEventListener('turfington_tournament_deleted', handleCreated);
    };
  }, []);

  useEffect(() => {
    if (tournaments.length === 0) return;

    const interval = setInterval(() => {
      setTimers(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          if (next[id] > 0) next[id] -= 1;
        });
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatTimer = (secondsLeft) => {
    if (!secondsLeft && secondsLeft !== 0) return '00:00:00';
    const hrs = Math.floor(secondsLeft / 3600);
    const mins = Math.floor((secondsLeft % 3600) / 60);
    const secs = secondsLeft % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleBookVenue = (venue) => {
    const bookingId = 'bk_' + Date.now();
    const venueName = venue.name || venue.title || 'Sports Arena';
    const sportName = Array.isArray(venue.sports) && venue.sports.length > 0 ? venue.sports[0] : (venue.sport || 'Football');
    const priceVal = venue.price || '₹1,200';
    const imageVal = venue.image || venue.image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=400';

    const newBooking = {
      id: bookingId,
      venue_id: venue.id || 'v_default',
      title: venueName,
      venue: venueName,
      venue_name: venueName,
      sport: sportName,
      time: 'Tomorrow, 5:00 PM',
      slot_time: 'Tomorrow, 5:00 PM',
      date: 'Tomorrow',
      price: priceVal,
      image: imageVal,
      status: 'PENDING OWNER APPROVAL',
      paymentType: 'Pay at Venue',
      payment_type: 'pay_at_venue',
      paymentStatus: 'Pay on Arrival',
      payment_status: 'pending_at_venue',
      user_id: user?.id || user?.uid || user?.firebase_uid || 'usr_guest',
      user_name: user?.full_name || user?.name || 'Player',
      player_name: user?.full_name || user?.name || 'Player',
      player_phone: user?.phone || '',
      owner_id: venue.owner_id || venue.ownerId || 'usr_venue_owner',
      owner_name: venue.owner_name || venue.ownerName || venueName,
      created_at: new Date().toISOString()
    };

    apiCreateBooking(newBooking).catch(() => {});
    if (setBookings) {
      setBookings(prev => [newBooking, ...(prev || [])]);
    }
    toast.success(`Successfully booked slots at ${venueName}! View it anytime under 'Your Bookings'.`, 'Booking Confirmed');
  };

  // Helper to color-code sports accents
  const getSportColors = (sport) => {
    switch (sport) {
      case 'Football':
        return {
          text: 'text-emerald-400',
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/20 text-emerald-400',
          dot: 'bg-emerald-400'
        };
      case 'Badminton':
        return {
          text: 'text-indigo-400',
          bg: 'bg-indigo-500/10',
          border: 'border-indigo-500/20 text-indigo-400',
          dot: 'bg-indigo-400'
        };
      case 'Bowling':
        return {
          text: 'text-cyan-400',
          bg: 'bg-cyan-500/10',
          border: 'border-cyan-500/20 text-cyan-400',
          dot: 'bg-cyan-400'
        };
      case 'Cricket':
        return {
          text: 'text-amber-400',
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/20 text-amber-400',
          dot: 'bg-amber-400'
        };
      case 'Table Tennis':
      default:
        return {
          text: 'text-rose-400',
          bg: 'bg-rose-500/10',
          border: 'border-rose-500/20 text-rose-400',
          dot: 'bg-rose-400'
        };
    }
  };

  return (
    <div className="min-h-screen bg-transparent pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
      


      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* LEFT COLUMN: Activity Sessions, Bookings, Venues, Tournaments */}
        <div className="lg:col-span-8 space-y-12">
          
          {role === 'owner' ? (
            /* OWNER SLOTS & MANAGEMENT HUB */
            <div className="space-y-12">
              {/* Slot Management & Organizer Shortcuts */}
              <div>
                <h2 className="text-2xl font-black font-display tracking-tight uppercase">Venue Manager Hub</h2>
                <p className="text-xs text-neutral-500 mt-1">Control your arena bookings, schedule slots, host tournaments and list marketplace products.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                  {/* Action 1: Create & Manage Slots */}
                  <div 
                    onClick={() => setTab('venue-manager')}
                    className="glass-card p-5 border border-white/5 hover:border-violet-500/20 hover:bg-white/[0.02] transition-all cursor-pointer text-left group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-400 border border-violet-500/25 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-all">📅</div>
                    <h3 className="font-display font-bold text-white text-base">Manage Slots & Bookings</h3>
                    <p className="text-xs text-neutral-400 mt-1">Create time windows, view weekly/monthly reservations, and monitor active player slots.</p>
                  </div>

                  {/* Action 2: Organize Tournament */}
                  <div 
                    onClick={() => setTab('tournaments')}
                    className="glass-card p-5 border border-white/5 hover:border-indigo-500/20 hover:bg-white/[0.02] transition-all cursor-pointer text-left group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-all">🏆</div>
                    <h3 className="font-display font-bold text-white text-base">Host Tournaments</h3>
                    <p className="text-xs text-neutral-400 mt-1">Publish competitive brackets, declare prize pools, collect entries and verify registrations.</p>
                  </div>

                  {/* Action 3: Sell Gear & Products */}
                  <div 
                    onClick={() => setTab('marketplace')}
                    className="glass-card p-5 border border-white/5 hover:border-amber-500/20 hover:bg-white/[0.02] transition-all cursor-pointer text-left group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/25 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-all">💰</div>
                    <h3 className="font-display font-bold text-white text-base">Sell Products</h3>
                    <p className="text-xs text-neutral-400 mt-1">List gear, racket strings, turf shoes, or sports accessories on the live store page.</p>
                  </div>

                  {/* Action 4: Revenue & Bookings Overview */}
                  <div 
                    onClick={() => setTab('dashboard')}
                    className="glass-card p-5 border border-white/5 hover:border-emerald-500/20 hover:bg-white/[0.02] transition-all cursor-pointer text-left group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 flex items-center justify-center font-bold mb-3 group-hover:scale-105 transition-all">📊</div>
                    <h3 className="font-display font-bold text-white text-base">Bookings & Revenue</h3>
                    <p className="text-xs text-neutral-400 mt-1">Review revenue analytics, confirmed bookings, and player attendance records.</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* PLAYER BOOKINGS & ACTIVITIES SESSIONS */
            <>
              {/* 2. NEARBY ACTIVITY SESSIONS */}
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black font-display tracking-tight uppercase">Nearby Activity Sessions</h2>
                    <p className="text-xs text-neutral-500 mt-1">Jump into active games happening in your area right now</p>
                  </div>
                  <button 
                    onClick={() => setTab('discovery')}
                    className="text-xs hover:text-neutral-400 font-semibold border-b border-white/20 pb-0.5"
                  >
                    View Map
                  </button>
                </div>

                <div className="overflow-x-auto no-scrollbar flex space-x-6 pb-4">
                  {sessions.length === 0 ? (
                    <div className="w-full glass-card p-8 text-center border border-dashed border-white/10 rounded-2xl">
                      <Users className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                      <p className="text-xs text-neutral-400 font-medium">No open join games currently hosted.</p>
                      <button
                        onClick={() => setTab('discovery')}
                        className="mt-3 px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-[11px] font-bold border border-white/10 transition-colors cursor-pointer"
                      >
                        Host or Find Games
                      </button>
                    </div>
                  ) : sessions.map(s => {
                    const req = matchRequests.find(r => r.matchId === s.id && (r.userId === (user?.id || 'usr_curr') || r.userId === 'usr_amit_patel'));
                    const reqStatus = req ? req.status : (joinedMatches.includes(s.id) ? 'approved' : 'none');
                    const joined = reqStatus === 'approved';
                    const colors = getSportColors(s.sport);
                    return (
                      <div 
                        key={s.id}
                        className="flex-shrink-0 w-[300px] glass-card p-5 relative overflow-hidden group hover:scale-[1.01] hover:border-white/10 transition-all duration-300"
                      >
                        <div className="absolute top-4 left-4 z-10 flex gap-1">
                          {s.isLive && (
                            <div className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-black/85 text-indigo-400 border border-indigo-500/20 font-black text-[9px] uppercase tracking-wider">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                              <span>LIVE</span>
                            </div>
                          )}
                          <button
                            onClick={() => onOpenHostManager && onOpenHostManager(s)}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-indigo-600/90 hover:bg-indigo-500 text-white font-black text-[9px] uppercase tracking-wider cursor-pointer shadow-md"
                            title="Host Manager: Review Player Scores & Approve Requests"
                          >
                            <span>Host Review</span>
                          </button>
                        </div>

                        <div className="h-36 rounded-2xl overflow-hidden mb-4 relative">
                          <img 
                            src={s.image} 
                            alt={s.title} 
                            className="w-full h-full object-cover brightness-95 group-hover:scale-105 transition-all duration-500"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                          <span className={`absolute bottom-3 right-3 text-[10px] bg-black/80 backdrop-blur-md px-2.5 py-1 rounded-md font-extrabold border ${colors.border}`}>
                            {s.sport}
                          </span>
                        </div>

                        <h3 className="font-display font-bold text-white text-base truncate">{s.title}</h3>
                        
                        {s.hostName && (
                          <div className="flex items-center space-x-1.5 text-[10px] text-neutral-300 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full mt-1.5 self-start">
                            <Users className="w-3 h-3 text-neutral-400" />
                            <span>Hosted by <strong className="text-white font-medium">{s.hostName}</strong></span>
                          </div>
                        )}

                        <div className="space-y-1.5 mt-3">
                          <div className="flex items-center text-xs text-neutral-400">
                            <MapPin className="w-3.5 h-3.5 mr-1.5 text-neutral-500" />
                            <span>{s.distance}</span>
                          </div>
                          <div className="flex items-center text-xs text-neutral-400">
                            <Clock className="w-3.5 h-3.5 mr-1.5 text-neutral-500" />
                            <span>{formatTime12Hour(s.time)}</span>
                          </div>
                          <div className="flex items-center text-xs text-neutral-400">
                            <Users className="w-3.5 h-3.5 mr-1.5 text-neutral-500" />
                            <span>{joined ? s.playersJoined + 1 : s.playersJoined}/{s.playersTotal} Joined</span>
                            <span className="ml-1 text-[10px] text-neutral-400 font-mono">
                              ({Math.max(0, s.playersTotal - (joined ? s.playersJoined + 1 : s.playersJoined))} spots left)
                            </span>
                          </div>
                        </div>

                        <div className="flex justify-between items-center mt-5 pt-3 border-t border-white/5">
                          <span className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded border ${colors.bg} ${colors.text} ${colors.border}`}>
                            {s.skillLevel}
                          </span>
                          
                          {s.isHosted ? (
                            joinedMatches.includes(s.id) ? (
                              <button
                                onClick={() => handleJoinHostedMatchClick(s)}
                                className="text-xs font-bold px-3.5 py-1.5 rounded-full border border-white/20 bg-white/10 text-white hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 transition-all cursor-pointer shadow-sm"
                                title="Click to leave hosted match"
                              >
                                ✓ Joined (Leave)
                              </button>
                            ) : s.playersJoined >= s.playersTotal ? (
                              <span className="text-xs font-semibold px-3 py-1.5 rounded-full bg-neutral-800 text-neutral-500">
                                Squad Full
                              </span>
                            ) : (
                              <button
                                onClick={() => handleJoinHostedMatchClick(s)}
                                className="text-xs font-bold px-4 py-1.5 rounded-full bg-white text-black hover:bg-neutral-200 transition-all cursor-pointer shadow-md"
                              >
                                Join Match
                              </button>
                            )
                          ) : reqStatus === 'approved' ? (
                            <button
                              onClick={() => onRequestCancelMatch ? onRequestCancelMatch(s) : toggleJoinMatch(s.id)}
                              className="text-xs font-extrabold px-3.5 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40 transition-all cursor-pointer shadow-sm"
                              title="Click to submit cancellation request to host"
                            >
                              ✓ Joined (Leave)
                            </button>
                          ) : reqStatus === 'pending_approval' ? (
                            <button
                              onClick={() => onRequestCancelMatch ? onRequestCancelMatch(s) : null}
                              className="text-xs font-extrabold px-3 py-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-300 transition-all cursor-pointer shadow-sm"
                            >
                              🕒 Pending Host
                            </button>
                          ) : reqStatus === 'cancellation_pending' ? (
                            <button
                              className="text-xs font-extrabold px-3 py-1.5 rounded-full border border-rose-500/30 bg-rose-500/15 text-rose-300 transition-all cursor-pointer shadow-sm"
                            >
                              ⏳ Leave Pending
                            </button>
                          ) : (
                            <button
                              onClick={() => onRequestJoinMatch ? onRequestJoinMatch(s) : toggleJoinMatch(s.id)}
                              className="text-xs font-extrabold px-4 py-1.5 rounded-full bg-white text-black border-transparent hover:bg-neutral-200 transition-all cursor-pointer shadow-md"
                            >
                              Join Match
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. CONTINUE PLAYING */}
              <div>
                <h2 className="text-2xl font-black font-display tracking-tight uppercase mb-6">Continue Playing</h2>
                {bookings.length === 0 ? (
                  <div className="glass-card p-8 text-center border border-dashed border-white/10">
                    <p className="text-neutral-500 text-sm">No upcoming matches or venue bookings scheduled.</p>
                    <button 
                      onClick={() => setTab('discovery')}
                      className="mt-4 text-xs font-bold bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-full px-5 py-2.5 transition-all"
                    >
                      Book Your First Slot
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {bookings.map(booking => (
                      <div key={booking.id} className="glass-card p-5 flex items-center justify-between border border-white/5">
                        <div className="flex items-center space-x-4">
                          <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                            <img src={booking.image} alt={booking.title} className="w-full h-full object-cover" />
                          </div>
                          <div className="text-left">
                            <h4 className="font-bold text-white text-sm font-display truncate max-w-[180px]">{booking.title}</h4>
                            <p className="text-xs text-neutral-400 mt-0.5">{booking.sport}</p>
                            <p className="text-[10px] text-neutral-500 mt-1 flex items-center">
                              <Clock className="w-3 h-3 mr-1" /> {formatTime12Hour(booking.time)}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs font-bold px-3.5 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400">
                          Confirmed
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4. NEARBY VENUES */}
              <div>
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-black font-display tracking-tight uppercase">Nearby Venues</h2>
                    <p className="text-xs text-neutral-500 mt-1">Reserve luxury arenas and pitches instantly</p>
                  </div>
                </div>

                {venues.length === 0 ? (
                  <div className="glass-card p-8 text-center border border-dashed border-white/10 rounded-2xl">
                    <MapPin className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                    <p className="text-xs text-neutral-400 font-medium">No turf venues registered yet.</p>
                    <button
                      onClick={() => setTab('discovery')}
                      className="mt-3 px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-[11px] font-bold border border-white/10 transition-colors cursor-pointer"
                    >
                      Explore Discovery
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {venues.map(v => (
                    <div key={v.id} className="glass-card overflow-hidden group border border-white/5 hover:border-white/10 transition-all duration-300">
                      <div className="h-44 overflow-hidden relative">
                        <img 
                          src={v.image} 
                          alt={v.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-all duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                        {v.isNew && (
                          <div className="absolute top-4 left-4 bg-emerald-500 text-black px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1 animate-pulse">
                            ✨ NEW
                          </div>
                        )}
                        <div className="absolute top-4 right-4 flex items-center bg-black/60 backdrop-blur-md px-2.5 py-1 rounded text-xs border border-white/5 text-amber-400">
                          <Star className="w-3 h-3 mr-1 fill-amber-400 text-amber-400" />
                          <span className="font-bold">{v.rating}</span>
                        </div>
                      </div>

                      <div className="p-5 text-left">
                        <h3 className="font-bold font-display text-white text-base truncate">{v.name}</h3>
                        <p className="text-xs text-neutral-400 mt-1 flex items-center">
                          <MapPin className="w-3.5 h-3.5 mr-1 text-neutral-500" /> {v.distance}
                        </p>
                        
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {v.sports.map(s => {
                            const style = getSportColors(s);
                            return (
                              <span key={s} className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded border ${style.bg} ${style.text} ${style.border}`}>
                                {s}
                              </span>
                            );
                          })}
                        </div>

                        <div className="flex justify-between items-center mt-5 pt-3 border-t border-white/5 gap-2">
                          <div>
                            <p className="text-xs text-neutral-500 font-light">Price</p>
                            <p className="text-sm font-bold text-white mt-0.5">{v.price}</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button 
                              onClick={() => {
                                const venueName = v.venue || v.name || 'Sports Venue';
                                const ownerNameStr = v.ownerName || v.owner_name || `${venueName} Management`;
                                const ownerId = v.owner_id || v.ownerId || v.owner_uid || `owner_${venueName.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                                const priceStr = v.price || (v.price_per_hr ? `₹${v.price_per_hr}/hr` : 'Venue Slot');
                                const initialMsg = `Hi! I have some questions regarding bookings for ${venueName}.`;

                                const ownerTarget = {
                                  id: ownerId,
                                  firebase_uid: ownerId,
                                  full_name: ownerNameStr,
                                  name: ownerNameStr,
                                  displayName: ownerNameStr,
                                  avatar: v.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
                                  avatarUrl: v.image || '',
                                  role: 'owner',
                                  venueName: venueName,
                                  productName: venueName,
                                  productPrice: priceStr || 'Venue Slot',
                                  productImage: v.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
                                  productCondition: v.location || 'Venue Inquiry',
                                  initialMessage: initialMsg,
                                  contextBanner: {
                                    type: 'venue',
                                    title: venueName,
                                    price: priceStr || 'Venue Slot',
                                    image: v.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
                                    subtitle: v.location || 'Venue Inquiry'
                                  }
                                };

                                try {
                                  localStorage.setItem('turfington_target_chat_user', JSON.stringify(ownerTarget));
                                  window.dispatchEvent(new CustomEvent('turfington_open_direct_chat_target', { detail: ownerTarget }));
                                } catch {}

                                if (typeof setTab === 'function') {
                                  setTab('community');
                                }
                              }}
                              className="text-xs font-bold bg-white/10 hover:bg-white/20 border border-white/10 text-white px-3 py-2 rounded-full transition-colors flex items-center gap-1 cursor-pointer"
                              title="Message venue owner directly"
                            >
                              <MessageSquare className="w-3 h-3 text-indigo-400" />
                              <span>Contact Owner</span>
                            </button>
                            <button 
                              onClick={() => handleBookVenue(v)}
                              className="text-xs font-bold bg-white text-black px-4 py-2 rounded-full hover:bg-neutral-200 transition-colors shadow-sm cursor-pointer"
                            >
                              Book Now
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  </div>
                )}
              </div>
            </>
          )}

        </div>

        {/* RIGHT COLUMN: Sports Feed, Tournament Countdown */}
        <div className="lg:col-span-4 space-y-12">
          


          {/* 6. EVENTS NEAR YOU */}
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-black font-display tracking-tight uppercase">Events Near You</h2>
              <button onClick={() => setTab('tournaments')} className="text-xs text-indigo-400 font-bold hover:underline cursor-pointer">
                View All
              </button>
            </div>
            {tournaments.length === 0 ? (
              <div className="glass-card p-6 text-center border border-white/5 rounded-2xl">
                <Award className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
                <p className="text-xs text-neutral-400 font-medium">No upcoming tournaments scheduled right now.</p>
                <button 
                  onClick={() => setTab('tournaments')}
                  className="mt-3 px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-white text-[11px] font-bold border border-white/10 transition-colors cursor-pointer"
                >
                  Explore Tournaments
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {tournaments.map(t => (
                  <div 
                    key={t.id}
                    className="glass-card overflow-hidden border border-white/5 hover:border-white/10 transition-all text-left relative"
                  >
                    <div className="h-32 overflow-hidden relative">
                      <img src={t.banner || t.image || t.pfp || '/trophy.png'} alt={t.title} className="w-full h-full object-cover brightness-85" />
                      <div className="absolute inset-0 bg-black/20" />
                      
                      <div className="absolute top-4 left-4 bg-indigo-600/90 backdrop-blur-md border border-indigo-500/20 rounded px-2.5 py-1">
                        <p className="text-[8px] text-neutral-200 uppercase tracking-widest font-bold">Prize Pool</p>
                        <p className="text-sm font-black text-white">{t.prizePool}</p>
                      </div>
                    </div>

                    <div className="p-5">
                      <h3 className="font-bold text-white font-display text-base leading-snug">{t.title}</h3>
                      <p className="text-xs text-neutral-400 mt-1">{t.date}</p>

                      {/* Countdown Timer */}
                      <div className="mt-5 p-3.5 bg-white/[0.02] border border-white/5 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-[8px] text-neutral-500 uppercase tracking-widest font-bold">Starts In</p>
                          <p className="text-base font-black text-indigo-400 font-display mt-0.5 tracking-wider">
                            {formatTimer(timers[t.id])}
                          </p>
                        </div>
                        <button 
                          onClick={() => setTab('tournaments')}
                          className="text-xs font-bold bg-white text-black px-4 py-2 rounded-full hover:bg-neutral-200 transition-colors shadow-md cursor-pointer"
                        >
                          Register
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>



    </div>
  );
}
