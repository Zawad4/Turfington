import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
const { useState: _useState, useEffect: _useEffect, useCallback: _useCallback, useRef: _useRef, useMemo: _useMemo } = React;
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MapPin, Gamepad2, SlidersHorizontal, Calendar,
  Clock, Trophy, Users, Star, Lock, Loader2,
  UserPlus, UserCheck, MessageCircle, Medal, ChevronRight,
  Navigation, Wifi, WifiOff, RefreshCw, CreditCard, Check, Compass,
  Heart, Share2, MessageSquare, X, CheckCircle, XCircle
} from 'lucide-react';
import SportIcon from '../components/SportIcon';
import VenueImage from '../components/VenueImage';
import UserAvatar from '../components/UserAvatar';
import { apiFetchTurfs, apiFetchNearbyTurfs, apiCreateBooking, apiUpdateBookingStatus, apiFetchNearbyPlayers, apiSearchUsers, apiFollowUser, apiCreateDirectChat, apiSubscribeVenues, apiCreateHostedMatch, apiFetchHostedMatches, apiJoinHostedMatch, apiLeaveHostedMatch } from '../services/db';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { useToast } from '../context';
import { formatTime12Hour } from '../utils/formatters';
import { fetchEnglishReverseGeocode, sanitizeLocationToEnglish } from '../utils/locationHelper';
import { getLocalFollowing, toggleFollowUser } from '../services/followService';

/* ── Sport Capacity Presets & Rules ──────────────────────── */
export const SPORT_CAPACITY_PRESETS = [
  { sport: 'Badminton', label: 'Badminton (4)', defaultCap: 4, icon: '🏸', note: 'Standard Doubles (4 players) or Singles (2)' },
  { sport: 'Cricket', label: 'Cricket (11)', defaultCap: 11, icon: '🏏', note: 'Single Squad (11 players) or Full Match (22)' },
  { sport: 'Kabaddi', label: 'Kabaddi (14)', defaultCap: 14, icon: '🤼', note: 'Standard 7v7 Team Squad (14 players)' },
  { sport: 'Football', label: 'Football (10)', defaultCap: 10, icon: '⚽', note: '5v5 Futsal (10) or 7v7 Turf (14)' },
  { sport: 'Basketball', label: 'Basketball (10)', defaultCap: 10, icon: '🏀', note: '5v5 Full Court (10 players)' },
  { sport: 'Volleyball', label: 'Volleyball (12)', defaultCap: 12, icon: '🏐', note: 'Standard 6v6 Match (12 players)' },
  { sport: 'Table Tennis', label: 'Table Tennis (4)', defaultCap: 4, icon: '🏓', note: 'Doubles (4 players) or Singles (2)' },
  { sport: 'Pickleball', label: 'Pickleball (4)', defaultCap: 4, icon: '🥒', note: 'Doubles Match (4 players)' },
];

/* ── Haversine distance (km) ─────────────────────────────── */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return parseFloat((R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))).toFixed(1));
}

export default function Discovery({
  joinedMatches = [],
  matchRequests = [],
  onRequestJoinMatch,
  onRequestCancelMatch,
  onOpenHostManager,
  toggleJoinMatch,
  bookings,
  setBookings,
  user,
  initialSport = 'All',
  setInitialSport,
  venueOffers = [],
  setTab = null,
  onStartChat = null
}) {
  const { toast } = useToast();
  const [selectedDealsVenue, setSelectedDealsVenue] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [nearYouSubTab, setNearYouSubTab] = useState('venues'); // 'venues' | 'join_games'
  const [activeTab, setActiveTab] = useState('Near You');
  const [radiusKm, setRadiusKm] = useState(5); // Default 5 km radius; manual expansion by player
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Slot selection & Open Match player join state
  const [selectedSlotTurf, setSelectedSlotTurf] = useState(null);
  const [slotDateTab, setSlotDateTab] = useState(() => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNames[new Date().getDay()];
  });
  const [chosenSlot, setChosenSlot] = useState(null);
  const [bookingType, setBookingType] = useState('private');
  const [myExistingCount, setMyExistingCount] = useState(2);
  const [hostCapacity, setHostCapacity] = useState(10);
  const [selectedSportPreset, setSelectedSportPreset] = useState('Football');
  const [hostingSkillLevel, setHostingSkillLevel] = useState('All Levels Welcome');
  const [hostedMatchesList, setHostedMatchesList] = useState([]);
  const [bookingCelebrationData, setBookingCelebrationData] = useState(null);

  // Live session booked venues tracking (immediate reflection on card)
  const [sessionBookedVenues, setSessionBookedVenues] = useState(() => {
    try {
      const s = sessionStorage.getItem('turfington_recent_booked_venues');
      return s ? JSON.parse(s) : {};
    } catch {
      return {};
    }
  });

  // Local mirror of user bookings from localStorage and events
  const [localBookings, setLocalBookings] = useState([]);

  // Direct Contact Venue Owner with selected arena context
  const handleContactVenueOwner = (turf, slot = null) => {
    if (!turf) return;
    const venueName = turf.venue || turf.title || turf.name || 'Sports Arena';
    const ownerId = turf.owner_id || turf.ownerId || turf.owner_uid || ('owner_' + (turf.id || 'default'));
    const ownerName = turf.owner_name || turf.ownerName || `${venueName} Management`;
    const priceStr = turf.price || (turf.price_per_hr ? `₹${turf.price_per_hr}/hr` : 'Venue Slot');
    const slotInfo = slot ? ` for ${slot.time || slot.label || slot}` : '';
    const initialMsg = `Hi! I have some questions regarding bookings for ${venueName}${slotInfo}.`;

    const ownerTarget = {
      id: ownerId,
      uid: ownerId,
      firebase_uid: ownerId,
      name: ownerName,
      displayName: ownerName,
      full_name: ownerName,
      email: turf.owner_email || '',
      avatarUrl: turf.image || turf.image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
      avatar: turf.image || turf.image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
      role: 'owner',
      venueName: venueName,
      productName: venueName,
      productPrice: priceStr,
      productImage: turf.image || turf.image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
      productCondition: turf.address || turf.location || 'Venue Inquiry',
      initialMessage: initialMsg,
      contextBanner: {
        type: 'venue',
        title: venueName,
        price: priceStr,
        image: turf.image || turf.image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200',
        subtitle: 'Venue Booking Inquiry',
        initialMessage: initialMsg
      }
    };

    // Close any open slot modal
    setSelectedSlotTurf(null);
    setChosenSlot(null);

    try {
      localStorage.setItem('turfington_target_chat_user', JSON.stringify(ownerTarget));
      window.dispatchEvent(new CustomEvent('turfington_open_direct_chat_target', { detail: ownerTarget }));
    } catch {}

    if (typeof onStartChat === 'function') {
      onStartChat(ownerTarget);
    } else if (typeof setTab === 'function') {
      setTab('community');
    } else {
      window.dispatchEvent(new CustomEvent('turfington_navigate_tab', { detail: 'community' }));
    }
  };

  useEffect(() => {
    const syncBookings = () => {
      const currentUserId = user?.id || user?.uid || user?.firebase_uid;
      let combined = Array.isArray(bookings) ? [...bookings] : [];
      try {
        if (currentUserId) {
          const sU = localStorage.getItem(`turfington_user_bookings_${currentUserId}`);
          if (sU) {
            const parsed = JSON.parse(sU);
            if (Array.isArray(parsed)) combined = [...combined, ...parsed];
          }
        }
        const s1 = localStorage.getItem('turfington_user_bookings');
        if (s1) {
          const parsed = JSON.parse(s1);
          if (Array.isArray(parsed)) combined = [...combined, ...parsed];
        }
        const s2 = localStorage.getItem('turfington_bookings');
        if (s2) {
          const parsed = JSON.parse(s2);
          if (Array.isArray(parsed)) combined = [...combined, ...parsed];
        }
      } catch {}

      const map = new Map();
      combined.forEach(b => {
        if (b && b.id) map.set(String(b.id), b);
      });
      setLocalBookings(Array.from(map.values()));
    };

    syncBookings();
    window.addEventListener('turfington_booking_created', syncBookings);
    window.addEventListener('turfington_booking_updated', syncBookings);
    return () => {
      window.removeEventListener('turfington_booking_created', syncBookings);
      window.removeEventListener('turfington_booking_updated', syncBookings);
    };
  }, [user?.id, user?.uid, user?.firebase_uid, bookings]);

  const effectiveBookings = localBookings.length > 0 ? localBookings : (bookings || []);

  const findTurfBooking = (turf) => {
    if (!turf) return null;
    const currentUserId = user?.id || user?.uid || user?.firebase_uid;
    const turfIdStr = String(turf.id || '').trim();
    const turfClean = String(turf.venue || turf.title || turf.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Session bookings
    if (sessionBookedVenues) {
      if (turfIdStr && sessionBookedVenues[turfIdStr]) return sessionBookedVenues[turfIdStr];
      if (turfClean && sessionBookedVenues[turfClean]) return sessionBookedVenues[turfClean];
    }

    // 2. All combined bookings
    for (const b of effectiveBookings) {
      if (!b) continue;
      const st = String(b.status || '').toLowerCase();
      if (st.includes('cancel') || st.includes('reject')) continue;

      const bUid = b.user_id || b.userId;
      const isMine = !currentUserId || !bUid || bUid === 'usr_guest' || bUid === currentUserId || (user?.firebase_uid && bUid === user.firebase_uid) || (user?.id && bUid === user.id);
      if (!isMine) continue;

      const bVid = String(b.venue_id || b.turf_id || b.venueId || '').trim();
      if (turfIdStr && bVid && turfIdStr === bVid) return b;

      const bClean = String(b.venue || b.venue_name || b.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (turfClean && bClean && (turfClean === bClean || turfClean.includes(bClean) || bClean.includes(turfClean))) {
        return b;
      }
    }
    return null;
  };

  // Auto-detect sport preset and auto-select date when user opens turf slot picker
  useEffect(() => {
    if (selectedSlotTurf) {
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const todayShort = dayNames[new Date().getDay()];
      setSlotDateTab(todayShort);
      setChosenSlot(null);

      const sName = String(selectedSlotTurf.sport || selectedSlotTurf.category || '').toLowerCase();
      let defaultCap = 10;
      let matchedSport = 'Football';
      if (sName.includes('badminton')) {
        defaultCap = 4;
        matchedSport = 'Badminton';
      } else if (sName.includes('cricket')) {
        defaultCap = 11;
        matchedSport = 'Cricket';
      } else if (sName.includes('kabaddi')) {
        defaultCap = 14;
        matchedSport = 'Kabaddi';
      } else if (sName.includes('volleyball')) {
        defaultCap = 12;
        matchedSport = 'Volleyball';
      } else if (sName.includes('table tennis') || sName.includes('tt')) {
        defaultCap = 4;
        matchedSport = 'Table Tennis';
      } else if (sName.includes('pickleball')) {
        defaultCap = 4;
        matchedSport = 'Pickleball';
      } else if (sName.includes('basketball')) {
        defaultCap = 10;
        matchedSport = 'Basketball';
      } else if (sName.includes('football')) {
        defaultCap = 10;
        matchedSport = 'Football';
      }
      setHostCapacity(defaultCap);
      setSelectedSportPreset(matchedSport);
      setMyExistingCount(Math.max(1, Math.min(defaultCap - 1, Math.floor(defaultCap / 2))));
    }
  }, [selectedSlotTurf]);

  // Sync hosted matches across the app
  useEffect(() => {
    const syncHosted = () => {
      apiFetchHostedMatches().then(list => {
        if (Array.isArray(list)) setHostedMatchesList(list);
      });
    };
    syncHosted();
    window.addEventListener('turfington_hosted_matches_updated', syncHosted);
    return () => window.removeEventListener('turfington_hosted_matches_updated', syncHosted);
  }, []);

  const getBookingDays = () => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const today = new Date();
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dayShort = dayNames[d.getDay()];
      days.push({
        index: i,
        dayShort,
        dateLabel: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fullLabel: `${dayShort.toUpperCase()}`,
        isAdvanceRestricted: i >= 3 // Beyond 3 days limit
      });
    }
    return days;
  };

  const getSlotsForTurf = (turf, dayShort) => {
    const rawMap = turf?.slots?.[dayShort] || {};
    const times = [
      '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
      '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
      '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
      '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
    ];

    const sName = String(turf?.sport || turf?.category || '').toLowerCase();
    const defaultSportCap = sName.includes('badminton') ? 4 : sName.includes('cricket') ? 11 : sName.includes('kabaddi') ? 14 : (turf?.defaultCapacity || 10);

    const slots = times.map((t, idx) => {
      let rawStatus = rawMap[t] || 'available';
      
      // Keep initial demo feel if no custom slot state saved yet
      if (!turf?.slots && (idx === 7 || idx === 11 || idx === 14)) {
        rawStatus = 'booked';
      }

      // Check if there is an active hosted match for this venue & slot
      const matchedHosted = hostedMatchesList.find(m => 
        (String(m.turf_id) === String(turf?.id) || m.venue === (turf?.venue || turf?.name)) &&
        (m.slot_id === `slot_${turf?.id || 1}_${dayShort}_${t}` || (m.time && m.time.includes(t)))
      );

      const statusVal = matchedHosted
        ? (matchedHosted.players_joined >= matchedHosted.players_total ? 'booked' : 'open_match')
        : (typeof rawStatus === 'object' ? rawStatus.status : rawStatus);
      const capVal = matchedHosted
        ? matchedHosted.players_total
        : (typeof rawStatus === 'object' ? (rawStatus.capacity || defaultSportCap) : (rawMap[`${t}_cap`] || defaultSportCap));
      const currentVal = matchedHosted
        ? matchedHosted.players_joined
        : (typeof rawStatus === 'object' ? (rawStatus.currentPlayers || 1) : 0);
      const hostVal = matchedHosted
        ? matchedHosted.host_name
        : (typeof rawStatus === 'object' ? rawStatus.hostName : null);

      return {
        id: `slot_${turf?.id || 1}_${dayShort}_${t}`,
        time: t,
        status: statusVal,
        capacity: capVal,
        currentPlayers: currentVal,
        neededPlayers: Math.max(0, capVal - currentVal),
        hostName: hostVal,
        sport: matchedHosted ? matchedHosted.sport : (turf?.sport || 'Sports'),
        price: parseFloat(String(turf?.price || turf?.price_per_hr || 600).replace(/[^\d.]/g, '')) || 600,
        bookedBy: statusVal === 'booked' ? (matchedHosted ? 'Full Squad' : 'Booked') : hostVal
      };
    });

    // CRITICAL: Blocked slots are completely hidden from players!
    let filtered = slots.filter(s => s.status !== 'blocked');

    // Real-Time Past Slot Hiding for Today:
    // Hide any slots that have already passed based on current local time
    const bookingDays = getBookingDays();
    const todayDayShort = bookingDays[0]?.dayShort;

    if (dayShort === todayDayShort) {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const nowTotalMinutes = currentHour * 60 + currentMinute;

      filtered = filtered.filter(s => {
        const [h, m] = s.time.split(':').map(Number);
        const slotStartMinutes = h * 60 + (m || 0);
        // Only show upcoming slots starting after the current time
        return slotStartMinutes > nowTotalMinutes;
      });
    }

    return filtered;
  };

  // Map refs
  const mapRef = useRef(null);
  const leafletMapRef = useRef(null);



  // Map markers mapping coordinates to base activities
  const mapMarkers = [
    { id: 1, x: 30, y: 40, sport: 'Football',     title: 'Football Turf Session',       venue: 'VK Multi Sports Turf', price: '₹600/hr' },
    { id: 2, x: 55, y: 65, sport: 'Table Tennis', title: 'TT Doubles Match',            venue: 'A.s 360 Turf Academy',  price: '₹100/hr' },
    { id: 3, x: 75, y: 35, sport: 'Bowling',      title: 'Bowling Tournament Practice', venue: 'Bowling in vr mall',   price: '₹375/hr' },
    { id: 4, x: 45, y: 25, sport: 'Badminton',    title: 'Badminton Morning Doubles',   venue: 'Tlk turf for badminton',          price: '₹175/hr' },
    { id: 5, x: 20, y: 70, sport: 'Cricket',      title: 'Box Cricket T10',             venue: 'Clash on turf',     price: '₹300/hr' },
  ];

  // Filters State
  const [selectedSport, setSelectedSport] = useState(initialSport);
  const [selectedDistance, setSelectedDistance] = useState('10');
  const [selectedSkill, setSelectedSkill] = useState('All');

  // Set initial sport filter if coming via a link
  useEffect(() => {
    if (initialSport && initialSport !== 'All') {
      setSelectedSport(initialSport);
      if (setInitialSport) {
        setInitialSport('All');
      }
    }
  }, [initialSport, setInitialSport]);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  // Location Access State - Read cached device coordinates if available
  const [locationStatus, setLocationStatus] = useState(() => {
    try {
      const saved = localStorage.getItem('turfington_last_known_gps');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.lat && parsed?.lng) return 'granted';
      }
    } catch {}
    return 'prompt';
  });
  const [userCoordinates, setUserCoordinates] = useState(() => {
    try {
      const saved = localStorage.getItem('turfington_last_known_gps');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.lat && parsed?.lng) {
          const lat = parseFloat(parsed.lat);
          const lng = parseFloat(parsed.lng);
          if (!isNaN(lat) && !isNaN(lng)) {
            return { lat, lng };
          }
        }
      }
    } catch {}
    return null;
  });

  // Prepaid Payment Dialog State
  const [activePrepaidVenue, setActivePrepaidVenue] = useState(null); // Venue details for payment
  const [isPaying, setIsPaying] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // ── Fetch dynamic venues from Firebase ──
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [rawActivities, setRawActivities] = useState([]);

  // Subscribe to real-time venue updates from Firebase and local events
  useEffect(() => {
    setActivitiesLoading(true);
    const unsubscribe = apiSubscribeVenues((turfs) => {
      // Map Firebase/API turfs to 'activities' shape expected by the UI
      const mapped = turfs.map(t => {
        let tLat = parseFloat(t.latitude ?? t.lat);
        let tLng = parseFloat(t.longitude ?? t.lng);
        if (isNaN(tLat) || isNaN(tLng) || tLat < 8 || tLat > 36 || tLng < 68 || tLng > 97) {
          tLat = 13.0827;
          tLng = 80.2707;
        }
        const isCustom = String(t.id).startsWith('venue_') || t.owner_id != null || t.isNew === true;
        const sportsList = Array.isArray(t.sports) && t.sports.length > 0 
          ? t.sports 
          : [t.category || t.sport || 'Sports'];
        return {
          id: t.id,
          title: t.name || t.venue || 'Sports Venue',
          name: t.name || t.venue || 'Sports Venue',
          sport: t.category || sportsList[0] || t.sport || 'Sports',
          category: t.category || sportsList[0] || t.sport || 'Sports',
          sports: sportsList,
          venue: t.name || t.venue || 'Sports Venue',
          lat: tLat,
          lng: tLng,
          latitude: tLat,
          longitude: tLng,
          time: t.is_open_24_hours ? '24 Hours' : 'Flexible',
          slots: 'Multiple slots',
          joined: 0,
          total: 10,
          skill: 'Any',
          price: t.price || (t.price_per_hr ? `₹${t.price_per_hr}/hr` : 'Contact for price'),
          rating: t.rating || 5.0,
          image: t.image_url || t.image,
          image_url: t.image_url || t.image,
          phone: t.phone,
          address: t.address || t.location || 'Chennai, Tamil Nadu',
          description: t.description || 'Modern synthetic sports venue.',
          isNew: isCustom,
          owner_id: t.owner_id
        };
      });
      setRawActivities(mapped);
      setActivitiesLoading(false);
    });

    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [user?.id, user?.role]);


  // ── Derived state: activities and players with real distances ──
  const [activities, setActivities] = useState([]);
  const [dbPlayersList, setDbPlayersList] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [selectedPlayerModal, setSelectedPlayerModal] = useState(null);
  const currentUserId = user?.id || user?.uid || user?.firebase_uid;
  const [followedPlayers, setFollowedPlayers] = useState(() => {
    return getLocalFollowing(currentUserId);
  });

  useEffect(() => {
    setFollowedPlayers(getLocalFollowing(currentUserId));
    const handleFollowChange = () => {
      setFollowedPlayers(getLocalFollowing(currentUserId));
    };
    window.addEventListener('turfington_follow_change', handleFollowChange);
    return () => window.removeEventListener('turfington_follow_change', handleFollowChange);
  }, [currentUserId]);

  const toggleFollow = async (id) => {
    if (!currentUserId || !id) return;
    await toggleFollowUser(currentUserId, id);
    setFollowedPlayers(getLocalFollowing(currentUserId));
  };

  // Fetch dynamic player profiles from Firebase Database on load or GPS/radius change
  useEffect(() => {
    async function loadDbPlayers() {
      setPlayersLoading(true);
      const lat = userCoordinates?.lat || 13.0827;
      const lng = userCoordinates?.lng || 80.2707;
      
      let fetched = [];
      if (searchQuery.trim()) {
        fetched = await apiSearchUsers(searchQuery, user?.id);
      } else {
        fetched = await apiFetchNearbyPlayers(lat, lng, radiusKm, user?.id);
      }

      setDbPlayersList(fetched);
      setPlayersLoading(false);
    }
    loadDbPlayers();
  }, [userCoordinates, radiusKm, searchQuery, user?.id]);

  // Update distances when GPS is obtained or when rawActivities load
  const applyRealDistances = useCallback((lat, lng, sourceActivities) => {
    const listToMap = sourceActivities || rawActivities;
    setActivities(
      listToMap
        .map(a => {
          const d = haversine(lat, lng, a.lat, a.lng);
          return {
            ...a,
            distanceNum: d,
            distance: d < 0.2 ? 'Nearby (< 200m)' : `${d} km`
          };
        })
        .sort((a, b) => (a.distanceNum ?? 0) - (b.distanceNum ?? 0))
    );
  }, [rawActivities]);

  // Real-time synchronization when GPS is updated anywhere across profiles or tabs
  useEffect(() => {
    const handleGpsUpdate = (e) => {
      if (e.detail?.lat && e.detail?.lng) {
        const lat = parseFloat(e.detail.lat);
        const lng = parseFloat(e.detail.lng);
        setUserCoordinates({ lat, lng });
        setLocationStatus('granted');
        applyRealDistances(lat, lng);
      }
    };
    window.addEventListener('turfington_gps_updated', handleGpsUpdate);
    return () => window.removeEventListener('turfington_gps_updated', handleGpsUpdate);
  }, [applyRealDistances]);

  // Effect to recalculate distances if rawActivities changes and we have location
  useEffect(() => {
    if (userCoordinates && rawActivities.length > 0) {
      applyRealDistances(userCoordinates.lat, userCoordinates.lng, rawActivities);
    } else if (rawActivities.length > 0) {
      setActivities(rawActivities.map(a => ({ ...a, distance: '? km' })));
    }
  }, [rawActivities, userCoordinates, applyRealDistances]);


  // Communities Data
  const communities = [
    { id: 1, name: 'VK Multi Sports Turf Club', members: '240 members', online: 32, image: 'https://images.unsplash.com/photo-1508098682722-e99c43a406b2?w=300', category: 'Football' },
    { id: 2, name: 'Tlk Badminton Club', members: '180 members', online: 15, image: 'https://images.unsplash.com/photo-1626224583764-f87db24ac4ea?w=300', category: 'Badminton' },
    { id: 3, name: 'VR Mall Bowlers Club', members: '120 members', online: 8, image: 'https://images.unsplash.com/photo-1541252260730-0412e8e2108e?w=300', category: 'Bowling' }
  ];

  // Filtered Activities (combines standard venues and active hosted matches)
  const combinedActivitiesList = [
    ...hostedMatchesList.map(m => ({
      id: m.id,
      title: m.title || `${m.sport} at ${m.venue}`,
      sport: m.sport || 'Sports',
      venue: m.venue,
      lat: m.lat || 13.0827,
      lng: m.lng || 80.2707,
      time: m.time || 'Upcoming Slot',
      slots: 'Open Match Session',
      joined: m.players_joined || 1,
      total: m.players_total || m.capacity || 10,
      skill: m.skill_level || 'All Levels',
      price: m.price || `₹${m.price_per_player || 150}/player`,
      rating: 5.0,
      image: m.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=600',
      isHosted: true,
      hostName: m.host_name,
      hostAvatar: m.host_avatar
    })),
    ...activities
  ];

  const filteredActivities = combinedActivitiesList.filter(act => {
    if (selectedSport !== 'All') {
      const targetSport = selectedSport.toLowerCase();
      const sMatch = (act.sport && act.sport.toLowerCase() === targetSport) ||
                     (act.category && act.category.toLowerCase() === targetSport) ||
                     (Array.isArray(act.sports) && act.sports.some(s => s && s.toLowerCase() === targetSport));
      if (!sMatch) return false;
    }
    if (selectedSkill !== 'All' && act.skill !== selectedSkill) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = (act.title && act.title.toLowerCase().includes(q)) ||
                         (act.venue && act.venue.toLowerCase().includes(q)) ||
                         (act.name && act.name.toLowerCase().includes(q));
      const sportMatch = (act.sport && act.sport.toLowerCase().includes(q)) ||
                         (act.category && act.category.toLowerCase().includes(q)) ||
                         (Array.isArray(act.sports) && act.sports.some(s => s && s.toLowerCase() === q));
      const addrMatch = (act.address && act.address.toLowerCase().includes(q)) ||
                        (act.location && act.location.toLowerCase().includes(q));
      if (!titleMatch && !sportMatch && !addrMatch) return false;
    }
    return true;
  });

  const [locationCity, setLocationCity] = useState('');
  const [locationError, setLocationError] = useState('');

  // Real GPS with Nominatim reverse geocoding
  const handleDetectLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }
    setLocationStatus('detecting');
    setLocationError('');

    const onPosSuccess = async (position) => {
      const latitude = parseFloat(position.coords.latitude.toFixed(6));
      const longitude = parseFloat(position.coords.longitude.toFixed(6));
      setUserCoordinates({ lat: latitude, lng: longitude });
      try {
        localStorage.setItem('turfington_last_known_gps', JSON.stringify({ lat: latitude, lng: longitude, timestamp: Date.now() }));
        window.dispatchEvent(new CustomEvent('turfington_gps_updated', { detail: { lat: latitude, lng: longitude } }));
      } catch {}
      applyRealDistances(latitude, longitude);
      // Strict English reverse geocode via Nominatim
      try {
        const geo = await fetchEnglishReverseGeocode(latitude, longitude, 10);
        setLocationCity(geo.city || 'Chennai');
      } catch {
        setLocationCity('Chennai'); // fail gracefully in English
      }
      setLocationStatus('granted');
    };

    const onPosError = (err) => {
      console.warn('High-accuracy GPS failed, falling back to standard accuracy...', err);
      navigator.geolocation.getCurrentPosition(
        onPosSuccess,
        (err2) => {
          setLocationStatus('prompt');
          setLocationError(
            err2.code === 1 ? 'Location permission denied. Please allow access in browser settings.'
            : err2.code === 2 ? 'Unable to determine location. Check your GPS signal.'
            : 'Location request timed out. Try again.'
          );
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    };

    navigator.geolocation.getCurrentPosition(onPosSuccess, onPosError, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    });
  };

  // Auto-request on mount
  useEffect(() => { handleDetectLocation(); }, []);

  // Slot status state updater
  const updateSlotState = (turfId, dayShort, slotTimeOrId, updater) => {
    setActivities(prev => prev.map(act => {
      if (act.id !== turfId) return act;
      const currentSlots = act.slots || {};
      const daySlots = currentSlots[dayShort] || {};
      const timeKey = String(slotTimeOrId).includes('_') ? String(slotTimeOrId).split('_').pop() : String(slotTimeOrId);
      const currentStatus = daySlots[timeKey] || 'available';
      const updatedRes = typeof updater === 'function' ? updater({ status: currentStatus }) : { status: 'booked' };
      const newStatus = updatedRes?.status || 'booked';
      return {
        ...act,
        slots: {
          ...currentSlots,
          [dayShort]: {
            ...daySlots,
            [timeKey]: newStatus
          }
        }
      };
    }));
  };

  // Confirm slot selection & proceed to checkout payment drawer
  const handleConfirmSlotBooking = (slot) => {
    if (!slot || !selectedSlotTurf) return;

    const slotTimeStr = slot.time || '06:00';
    const effectiveCapacity = bookingType === 'open_match' ? hostCapacity : (slot.capacity || 10);
    const venueBookingPayload = {
      id: selectedSlotTurf.id,
      venue: selectedSlotTurf.venue || selectedSlotTurf.title || selectedSlotTurf.name,
      sport: bookingType === 'open_match' ? selectedSportPreset : (selectedSlotTurf.sport || 'Sports'),
      time: `${slotDateTab}, ${formatTime12Hour(slotTimeStr)}`,
      price: `₹${slot.price || 600}`,
      image: selectedSlotTurf.image || selectedSlotTurf.image_url,
      owner_id: selectedSlotTurf.owner_id || selectedSlotTurf.ownerId || 'usr_venue_owner',
      owner_name: selectedSlotTurf.owner_name || selectedSlotTurf.ownerName || selectedSlotTurf.venue || selectedSlotTurf.title || selectedSlotTurf.name || 'Venue Owner',
      slotMeta: {
        turfId: selectedSlotTurf.id,
        dateKey: slotDateTab,
        slotId: slot.id || slotTimeStr,
        bookingType,
        myExistingCount: bookingType === 'open_match' ? myExistingCount : 1,
        capacity: effectiveCapacity,
        sportPreset: selectedSportPreset,
        skillLevel: hostingSkillLevel,
        currentStatus: slot.status,
        hostName: slot.hostName
      }
    };

    // Close slot picker modal
    setSelectedSlotTurf(null);
    setChosenSlot(null);

    // Trigger payment & booking creation drawer
    triggerPrepaidPayment(venueBookingPayload);
  };

  // Open booking confirmation drawer (Pay at Venue)
  const triggerPrepaidPayment = (venue) => {
    setActivePrepaidVenue(venue);
    setPaymentSuccess(false);
  };

  // Confirm booking with Pay at Venue (no prepaid online payment required)
  const handleConfirmVenueBooking = () => {
    if (!activePrepaidVenue) return;
    setIsPaying(true);

    if (activePrepaidVenue.slotMeta) {
      const { turfId, dateKey, slotId, bookingType, myExistingCount, capacity, currentStatus, sportPreset, skillLevel } = activePrepaidVenue.slotMeta;
      updateSlotState(turfId, dateKey, slotId, (s) => {
        if (currentStatus === 'open_match') {
          const newCount = (s.currentPlayers || 1) + 1;
          const isFull = newCount >= (s.capacity || capacity || 10);
          return {
            ...s,
            currentPlayers: newCount,
            neededPlayers: Math.max(0, (s.capacity || capacity || 10) - newCount),
            status: isFull ? 'booked' : 'open_match',
            bookedBy: isFull ? 'Full Squad' : s.bookedBy
          };
        } else if (bookingType === 'open_match') {
          return {
            ...s,
            status: 'open_match',
            capacity: capacity,
            currentPlayers: myExistingCount,
            neededPlayers: Math.max(0, capacity - myExistingCount),
            hostName: user?.full_name || 'You',
            sport: sportPreset || activePrepaidVenue.sport
          };
        } else {
          return {
            ...s,
            status: 'booked',
            bookedBy: user?.full_name || 'You'
          };
        }
      });

      // If hosting an open match, publish immediately to shared feed so other players can join
      if (bookingType === 'open_match') {
        const targetSport = sportPreset || activePrepaidVenue.sport || 'Sports';
        const targetVenueName = activePrepaidVenue.venue || activePrepaidVenue.name;
        const totalPriceNum = parseFloat(String(activePrepaidVenue.price).replace(/[^\d.]/g, '')) || 600;
        const splitPrice = Math.round(totalPriceNum / capacity);

        apiCreateHostedMatch({
          turf_id: turfId,
          venue: targetVenueName,
          sport: targetSport,
          time: activePrepaidVenue.time,
          date: dateKey,
          slot_id: slotId,
          capacity: capacity,
          existing_players_count: myExistingCount,
          host_id: user?.id || user?.firebase_uid || 'usr_curr',
          host_name: user?.full_name || user?.name || 'You',
          host_avatar: user?.avatar_url || user?.avatar,
          skill_level: skillLevel || 'All Levels Welcome',
          total_price: totalPriceNum,
          price_per_player: splitPrice,
          image: activePrepaidVenue.image
        });
      } else if (currentStatus === 'open_match') {
        // Player joins hosted match
        apiJoinHostedMatch(slotId, user);
      }
    }

    const bookingId = 'bk_' + Date.now();
    const venueTitle = activePrepaidVenue.venue || activePrepaidVenue.title || activePrepaidVenue.name || 'Sports Arena';
    const timeStr = activePrepaidVenue.time || `${slotDateTab || 'Today'}, Flexible Slot`;
    const dateStr = timeStr.includes(',') ? timeStr.split(',')[0].trim() : (slotDateTab || 'Today');
    const slotHour = timeStr.includes(',') ? timeStr.split(',').slice(1).join(',').trim() : timeStr;
    const priceStr = activePrepaidVenue.price || '₹600';
    const imageStr = activePrepaidVenue.image || activePrepaidVenue.image_url || 'https://images.unsplash.com/photo-1538388149142-f82611d4d6c4?q=80&w=400';

    const isHosted = activePrepaidVenue.slotMeta?.bookingType === 'open_match';
    const newBooking = {
      id: bookingId,
      venue_id: activePrepaidVenue.id || 'v_default',
      venue: venueTitle,
      venue_name: venueTitle,
      title: venueTitle,
      sport: activePrepaidVenue.sport || 'Sports Activity',
      date: dateStr,
      time: slotHour || timeStr,
      slot_time: timeStr,
      price: priceStr,
      image: imageStr,
      status: 'PENDING OWNER APPROVAL',
      paymentType: 'Pay at Venue',
      payment_type: 'pay_at_venue',
      paymentStatus: 'Pay on Arrival',
      payment_status: 'pending_at_venue',
      user_id: user?.id || user?.uid || user?.firebase_uid || 'usr_guest',
      user_name: user?.full_name || user?.name || 'Player',
      player_name: user?.full_name || user?.name || 'Player',
      player_phone: user?.phone || '',
      owner_id: activePrepaidVenue.owner_id || activePrepaidVenue.ownerId || 'usr_venue_owner',
      owner_name: activePrepaidVenue.owner_name || activePrepaidVenue.ownerName || venueTitle,
      isHosted,
      is_hosted: isHosted,
      capacity: activePrepaidVenue.slotMeta?.capacity || 10,
      joinedPlayers: activePrepaidVenue.slotMeta?.myExistingCount || 1,
      slotMeta: activePrepaidVenue.slotMeta,
      created_at: new Date().toISOString()
    };

    apiCreateBooking(newBooking).catch(err => console.warn('apiCreateBooking error:', err));

    const turfIdStr = String(activePrepaidVenue.id || '').trim();
    const turfClean = String(venueTitle).toLowerCase().replace(/[^a-z0-9]/g, '');
    setSessionBookedVenues(prev => {
      const updated = {
        ...prev,
        ...(turfIdStr ? { [turfIdStr]: newBooking } : {}),
        ...(turfClean ? { [turfClean]: newBooking } : {})
      };
      try { sessionStorage.setItem('turfington_recent_booked_venues', JSON.stringify(updated)); } catch {}
      return updated;
    });

    setLocalBookings(prev => [newBooking, ...(prev || []).filter(b => b.id !== newBooking.id)]);
    window.dispatchEvent(new CustomEvent('turfington_booking_updated', {
      detail: { booking: newBooking, status: 'confirmed' }
    }));

    setTimeout(() => {
      setIsPaying(false);
      setPaymentSuccess(true);
      if (setBookings) {
        setBookings(prev => [newBooking, ...(prev || []).filter(b => b.id !== newBooking.id)]);
      }
      setTimeout(() => {
        setActivePrepaidVenue(null);
        setPaymentSuccess(false);
        setBookingCelebrationData(newBooking);
      }, 500);
    }, 600);
  };

  // Cancel booking directly from discovery turf card
  const handleCancelUserBooking = async (booking, turf) => {
    if (!booking && !turf) return;
    const bId = booking?.id;
    const vName = booking?.venue || booking?.title || turf?.venue || turf?.name || 'this turf';
    const confirmCancel = window.confirm(`Cancel your booking for ${vName}?`);
    if (!confirmCancel) return;

    try {
      if (bId) {
        await apiUpdateBookingStatus(bId, 'cancelled', 'Cancelled by player');
      }
      if (setBookings && bId) {
        setBookings(prev => (prev || []).map(b => b.id === bId ? { ...b, status: 'cancelled' } : b));
      }
      setLocalBookings(prev => prev.map(b => (b && b.id === bId) ? { ...b, status: 'cancelled' } : b));

      setSessionBookedVenues(prev => {
        const copy = { ...prev };
        if (turf?.id) delete copy[String(turf.id).trim()];
        const turfClean = String(vName).toLowerCase().replace(/[^a-z0-9]/g, '');
        if (turfClean) delete copy[turfClean];
        try { sessionStorage.setItem('turfington_recent_booked_venues', JSON.stringify(copy)); } catch {}
        return copy;
      });

      if (booking?.slotMeta?.slotId) {
        apiLeaveHostedMatch(booking.slotMeta.slotId, user).catch(() => {});
      }
      if (bId) {
        window.dispatchEvent(new CustomEvent('turfington_booking_updated', {
          detail: { bookingId: bId, status: 'cancelled', rejectionReason: 'Cancelled by player' }
        }));
      }
    } catch (err) {
      console.warn('handleCancelUserBooking error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-transparent pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto flex flex-col h-full">
      
      {/* Location Access Indicator Banner */}
      <div className="mb-6 w-full flex items-center justify-between px-5 py-3 glass-card border border-white/5 text-xs">
        <div className="flex items-center space-x-2 flex-grow min-w-0">
          {locationStatus === 'detecting' && <Loader2 className="w-4 h-4 text-indigo-400 animate-spin flex-shrink-0" />}
          {locationStatus === 'granted'   && <Navigation className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
          {locationStatus === 'prompt'    && <MapPin className="w-4 h-4 text-neutral-500 flex-shrink-0" />}
          <span className="truncate">
            {locationStatus === 'prompt' && !locationError && 'Enable location to discover nearby turfs, people and activities.'}
            {locationStatus === 'detecting' && 'Detecting your location...'}
            {locationStatus === 'granted' && (
              <span className="text-emerald-400">
                {locationCity && <strong>{sanitizeLocationToEnglish(locationCity)}</strong>}
                {userCoordinates && ` (${userCoordinates.lat.toFixed(4)}, ${userCoordinates.lng.toFixed(4)})`}
                {' · '}{activities.length} venues sorted by distance
              </span>
            )}
            {locationError && <span className="text-rose-400">{locationError}</span>}
          </span>
        </div>
        {locationStatus !== 'granted' && (
          <button
            onClick={handleDetectLocation}
            disabled={locationStatus === 'detecting'}
            className="flex items-center gap-1.5 flex-shrink-0 ml-3 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-3.5 py-1.5 rounded-full transition-all cursor-pointer">
            <Navigation className="w-3 h-3" />
            {locationStatus === 'detecting' ? 'Locating...' : 'Allow Location'}
          </button>
        )}
        {locationStatus === 'granted' && (
          <button onClick={handleDetectLocation} title="Refresh location"
            className="ml-3 flex-shrink-0 p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-neutral-500 hover:text-white transition-colors">
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* 1. TOP LARGE SEARCH BAR WITH CLICKABLE SEARCH BUTTON & FILTER TOGGLE */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 w-full font-sans">
        <form 
          onSubmit={(e) => {
            e.preventDefault();
            setSearchQuery(searchInput.trim());
          }}
          className="relative flex-grow flex items-center"
        >
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-neutral-400">
            <Search className="w-5 h-5" />
          </div>
          <input 
            type="text" 
            placeholder="Search turfs, venues, sports, or games (e.g. Bridgestone, Basketball, Football)..."
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setSearchQuery(e.target.value);
            }}
            className="w-full pl-14 pr-36 py-5 bg-[#121212]/90 border border-white/5 rounded-full text-base font-light text-white placeholder-neutral-500 focus:outline-none focus:border-white/20 focus:ring-1 focus:ring-white/10 transition-all duration-300 shadow-[0_4px_30px_rgba(0,0,0,0.4)]"
          />
          <div className="absolute inset-y-0 right-3 flex items-center gap-2">
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSearchQuery('');
                }}
                className="p-1.5 text-neutral-400 hover:text-white transition-colors cursor-pointer rounded-full hover:bg-white/10"
                title="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              type="submit"
              className="px-5 py-2.5 bg-[#5842fe] hover:bg-[#4a35ea] text-white text-xs font-black uppercase tracking-wider rounded-full transition-all shadow-lg shadow-[#5842fe]/30 cursor-pointer flex items-center gap-1.5 active:scale-95"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search</span>
            </button>
          </div>
        </form>
        
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`px-6 py-4 md:py-0 rounded-full border transition-all flex items-center justify-center gap-2 text-sm font-bold uppercase tracking-wider ${
            showFilters
              ? 'bg-white text-black border-transparent shadow-[0_0_15px_rgba(255,255,255,0.25)]'
              : 'bg-[#121212] border-white/5 text-neutral-300 hover:text-white hover:border-white/15'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      {/* TABS SELECTOR: Consolidated into Near You, Players, and Map */}
      <div className="flex space-x-1.5 p-1 bg-[#121212] border border-white/5 rounded-full self-start mb-8 overflow-x-auto no-scrollbar max-w-full font-sans">
        {['Near You', 'Players', 'Map'].map(tab => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(tab);
              setSelectedMarker(null);
            }}
            className={`px-5 py-2 rounded-full text-xs font-bold transition-all duration-300 cursor-pointer ${
              activeTab === tab 
                ? 'bg-white text-black font-extrabold shadow-md' 
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            {tab === 'Near You' ? '🏟 Near You' : tab === 'Players' ? '🏃 Players' : '🗺️ Map'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-grow font-sans">
        
        {/* 2. FILTER PANEL (COLLAPSIBLE LEFT COLUMN) */}
        {showFilters && (
          <div className="lg:col-span-3 space-y-6 text-left">
            <div className="glass-card p-6 border border-white/5 space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-white/5">
                <span className="font-display font-extrabold text-sm uppercase tracking-wider">Filters</span>
                <SlidersHorizontal className="w-4 h-4 text-neutral-400" />
              </div>

              {/* Sport Filter */}
              <div className="space-y-2">
                <label className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Sport</label>
                <select 
                  value={selectedSport} 
                  onChange={(e) => setSelectedSport(e.target.value)}
                  className="w-full bg-[#0d0d0d] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-neutral-300 focus:outline-none focus:border-white/25"
                >
                  <option value="All">All Sports</option>
                  <option value="Football">Football</option>
                  <option value="Basketball">Basketball</option>
                  <option value="Badminton">Badminton</option>
                  <option value="Cricket">Cricket</option>
                  <option value="Table Tennis">Table Tennis</option>
                  <option value="Pickleball">Pickleball</option>
                  <option value="Bowling">Bowling</option>
                  <option value="Tennis">Tennis</option>
                  <option value="Volleyball">Volleyball</option>
                </select>
              </div>

              {/* Distance Filter */}
              <div className="space-y-3">
                <div className="flex justify-between text-xs font-medium">
                  <label className="text-neutral-400 uppercase tracking-widest font-bold">Max Distance</label>
                  <span className="text-white">{selectedDistance} km</span>
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="25" 
                  value={selectedDistance}
                  onChange={(e) => setSelectedDistance(e.target.value)}
                  className="w-full accent-white bg-neutral-800 rounded-lg cursor-pointer h-1.5"
                />
              </div>

              {/* Skill Filter */}
              <div className="space-y-2">
                <label className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Skill Level</label>
                <select 
                  value={selectedSkill} 
                  onChange={(e) => setSelectedSkill(e.target.value)}
                  className="w-full bg-[#0d0d0d] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-neutral-300 focus:outline-none focus:border-white/25"
                >
                  <option value="All">Any Level</option>
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>

              {/* Availability Date */}
              <div className="space-y-2">
                <label className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-3 w-4 h-4 text-neutral-500" />
                  <input 
                    type="date" 
                    className="w-full bg-[#0d0d0d] border border-white/5 rounded-xl pl-10 pr-3 py-2.5 text-xs text-neutral-300 focus:outline-none focus:border-white/25"
                  />
                </div>
              </div>

              {/* Price Filter */}
              <div className="space-y-2">
                <label className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Price range</label>
                <select className="w-full bg-[#0d0d0d] border border-white/5 rounded-xl px-3 py-2.5 text-xs text-neutral-300 focus:outline-none focus:border-white/25">
                  <option value="Any">Any Price</option>
                  <option value="Free">Free / Shared</option>
                  <option value="Low">Under $20/hr</option>
                  <option value="Med">$20 - $50/hr</option>
                  <option value="High">Above $50/hr</option>
                </select>
              </div>
              
              <button 
                onClick={() => {
                  setSelectedSport('All');
                  setSelectedDistance('10');
                  setSelectedSkill('All');
                  setSearchQuery('');
                }}
                className="w-full py-2.5 text-xs text-center border border-white/10 hover:bg-white/5 hover:border-white/20 transition-all rounded-full font-bold"
              >
                Reset Filters
              </button>
            </div>
          </div>
        )}

        <div className={`${showFilters ? 'lg:col-span-9' : 'lg:col-span-12'} gap-8 h-fit min-h-[720px]`}>
          {/* RESULTS COLUMN */}
          <div className="space-y-5 text-left h-full">
            
            {/* TABS CONTENT: 🏟 Near You (Venues first, Join Games next) */}
            {activeTab === 'Near You' && (() => {
              const userLat = userCoordinates?.lat || 13.0827; // Default Chennai center
              const userLng = userCoordinates?.lng || 80.2707;

              const nearbyList = activities
                .map(turf => {
                  const distNum = haversine(userLat, userLng, turf.lat || 13.0827, turf.lng || 80.2707);
                  const distanceText = distNum < 0.2 ? 'Nearby (< 200m)' : `${distNum} km away`;
                  return { ...turf, distanceNum: distNum, distanceText };
                })
                .filter(turf => {
                  if (selectedSport !== 'All') {
                    const targetSport = selectedSport.toLowerCase();
                    const sMatch = (turf.sport && turf.sport.toLowerCase() === targetSport) ||
                                   (turf.category && turf.category.toLowerCase() === targetSport) ||
                                   (Array.isArray(turf.sports) && turf.sports.some(s => s && s.toLowerCase() === targetSport));
                    if (!sMatch) return false;
                  }
                  if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase().trim();
                    const titleMatch = (turf.title && turf.title.toLowerCase().includes(q)) ||
                                       (turf.venue && turf.venue.toLowerCase().includes(q)) ||
                                       (turf.name && turf.name.toLowerCase().includes(q));
                    const sportMatch = (turf.sport && turf.sport.toLowerCase().includes(q)) ||
                                       (turf.category && turf.category.toLowerCase().includes(q)) ||
                                       (Array.isArray(turf.sports) && turf.sports.some(s => s && s.toLowerCase() === q));
                    const addrMatch = (turf.address && turf.address.toLowerCase().includes(q)) ||
                                      (turf.location && turf.location.toLowerCase().includes(q));
                    if (!titleMatch && !sportMatch && !addrMatch) return false;
                  }
                  if (radiusKm === 'All' || String(radiusKm) === 'All') return true;
                  return turf.distanceNum <= Number(radiusKm);
                })
                .sort((a, b) => (a.distanceNum || 0) - (b.distanceNum || 0));

              return (
                <div className="space-y-8">
                  {/* Sub-Section Navigation Switcher Bar */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 p-5 sm:p-6 bg-[#121218]/90 border border-white/10 rounded-3xl shadow-2xl backdrop-blur-xl">
                    <div className="flex items-center space-x-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-[#5842fe]/15 text-[#5842fe] border border-[#5842fe]/30 flex items-center justify-center shadow-lg shadow-[#5842fe]/20 flex-shrink-0">
                        <MapPin className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="font-display font-black text-white text-xl sm:text-2xl uppercase tracking-tight">Near You</h2>
                        <p className="text-xs sm:text-sm text-neutral-400 font-medium mt-0.5">Explore turf venues or jump directly into join-game matches</p>
                      </div>
                    </div>

                    {/* Sub-section Switcher: Venues vs Join Games */}
                    <div className="flex items-center gap-2 bg-[#09090e] p-2 rounded-2xl md:rounded-full border border-white/15 shadow-inner w-full md:w-auto">
                      <button
                        type="button"
                        onClick={() => setNearYouSubTab('venues')}
                        className={`flex-1 md:flex-initial px-6 py-3 rounded-xl md:rounded-full text-sm font-black transition-all cursor-pointer flex items-center justify-center gap-2.5 ${
                          nearYouSubTab === 'venues'
                            ? 'bg-gradient-to-r from-[#5842fe] to-[#6d55ff] text-white shadow-xl shadow-[#5842fe]/40 border border-white/20'
                            : 'text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <span className="text-base">🏟️</span>
                        <span className="tracking-wide">Venues</span>
                        <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${nearYouSubTab === 'venues' ? 'bg-white/25 text-white shadow-sm' : 'bg-white/10 text-neutral-300'}`}>
                          {nearbyList.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setNearYouSubTab('join_games')}
                        className={`flex-1 md:flex-initial px-6 py-3 rounded-xl md:rounded-full text-sm font-black transition-all cursor-pointer flex items-center justify-center gap-2.5 ${
                          nearYouSubTab === 'join_games'
                            ? 'bg-gradient-to-r from-[#5842fe] to-[#6d55ff] text-white shadow-xl shadow-[#5842fe]/40 border border-white/20'
                            : 'text-neutral-400 hover:text-white hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <span className="text-base">🎮</span>
                        <span className="tracking-wide">Join Games</span>
                        <span className={`text-xs font-black px-2.5 py-0.5 rounded-full ${nearYouSubTab === 'join_games' ? 'bg-white/25 text-white shadow-sm' : 'bg-white/10 text-neutral-300'}`}>
                          {filteredActivities.length}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* ─────────────────────────────────────────────────────────── */}
                  {/* SUB-SECTION 1: 🏟️ VENUES (FIRST)                            */}
                  {/* ─────────────────────────────────────────────────────────── */}
                  {nearYouSubTab === 'venues' && (
                    <div className="space-y-6">
                      {/* Header & Radius Filter Bar */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-5 border border-white/5 rounded-2xl">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xl">🏟️</span>
                            <h3 className="font-display font-black text-white text-lg uppercase tracking-tight">
                              Turf Venues ({nearbyList.length})
                            </h3>
                          </div>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            Showing venues {radiusKm === 'All' ? <span className="text-emerald-400 font-bold">across all distances</span> : <>within <span className="text-emerald-400 font-bold">{radiusKm} km</span> radius</>}
                            {userCoordinates ? ` of (${userCoordinates.lat.toFixed(4)}, ${userCoordinates.lng.toFixed(4)})` : ''}
                          </p>
                        </div>

                        {/* Radius Quick Selector */}
                        <div className="flex items-center space-x-2 bg-[#0a0a0a] p-1.5 rounded-full border border-white/10 self-start sm:self-auto overflow-x-auto no-scrollbar">
                          <span className="text-[10px] text-neutral-400 uppercase font-bold pl-3 pr-1">Radius:</span>
                          {[5, 10, 20, 30, 50, 'All'].map(r => (
                            <button
                              key={r}
                              onClick={() => setRadiusKm(r)}
                              className={`px-3.5 py-1.5 rounded-full text-xs font-black transition-all cursor-pointer flex-shrink-0 ${
                                (radiusKm === r || String(radiusKm) === String(r))
                                  ? 'bg-[#5842fe] text-white shadow-lg shadow-[#5842fe]/30'
                                  : 'text-neutral-400 hover:text-white'
                              }`}
                            >
                              {r === 'All' ? 'All' : `${r} km`}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Location Permission Prompt Banner if denied / missing */}
                      {locationStatus !== 'granted' && (
                        <div className="glass-card p-6 border border-indigo-500/30 bg-indigo-500/5 text-left flex flex-col md:flex-row items-center justify-between gap-4">
                          <div className="flex items-center space-x-4">
                            <div className="p-3 bg-indigo-500/20 rounded-2xl text-indigo-400 border border-indigo-500/30">
                              <Navigation className="w-6 h-6 animate-pulse" />
                            </div>
                            <div>
                              <h4 className="font-bold text-white text-sm">Request Location Permission</h4>
                              <p className="text-xs text-neutral-400 mt-1">
                                Grant location access to detect your exact GPS coordinates and view turfs nearest to you.
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleDetectLocation}
                            disabled={locationStatus === 'detecting'}
                            className="flex-shrink-0 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-full transition-all shadow-lg shadow-indigo-600/30 cursor-pointer"
                          >
                            {locationStatus === 'detecting' ? 'Detecting Location...' : 'Allow Location'}
                          </button>
                        </div>
                      )}

                      {/* Nearby Turfs Grid */}
                      {nearbyList.length === 0 ? (
                        <div className="glass-card p-12 text-center border border-dashed border-white/10 space-y-3">
                          <MapPin className="w-10 h-10 text-neutral-600 mx-auto" />
                          <h3 className="text-white font-bold text-base">No Turfs Found Within {radiusKm === 'All' ? 'This Filter' : `${radiusKm} km`}</h3>
                          <p className="text-neutral-500 text-xs max-w-md mx-auto">
                            There are no registered turfs in this immediate radius. Expand your radius filter to view more venues.
                          </p>
                          <div className="flex flex-wrap justify-center gap-2 pt-2">
                            <button
                              onClick={() => setRadiusKm(10)}
                              className="px-4 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full transition-all cursor-pointer"
                            >
                              Expand to 10 km
                            </button>
                            <button
                              onClick={() => setRadiusKm(20)}
                              className="px-4 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full transition-all cursor-pointer"
                            >
                              Expand to 20 km
                            </button>
                            <button
                              onClick={() => setRadiusKm(50)}
                              className="px-4 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-full transition-all cursor-pointer"
                            >
                              Expand to 50 km
                            </button>
                            <button
                              onClick={() => setRadiusKm('All')}
                              className="px-4 py-2 text-xs font-bold bg-[#5842fe] hover:bg-[#4a35ea] text-white rounded-full transition-all cursor-pointer shadow-lg shadow-[#5842fe]/30"
                            >
                              View All Venues ({activities.length})
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {nearbyList.map((turf) => {
                        const currentUserId = user?.id || user?.uid || user?.firebase_uid;
                        const turfTitle = String(turf.venue || turf.title || turf.name || '').toLowerCase().trim();
                        const turfIdStr = String(turf.id || '').trim();

                        // Find if current user has an active booking for this turf
                        const activeBookingForTurf = findTurfBooking(turf);

                        // Find if current user is hosting a match for this turf
                        const userHostedMatch = hostedMatchesList.find(m => {
                          if (!m) return false;
                          const isHost = (m.host_id === currentUserId || (user?.firebase_uid && m.host_id === user.firebase_uid) || (user?.full_name && m.host_name === user.full_name));
                          if (!isHost) return false;
                          const mTurfId = String(m.turf_id || '').trim();
                          const mVen = String(m.venue || '').toLowerCase().trim();
                          return (turfIdStr && mTurfId && turfIdStr === mTurfId) || (turfTitle && mVen && (turfTitle === mVen || turfTitle.includes(mVen) || mVen.includes(turfTitle)));
                        });

                        const isBooked = !!activeBookingForTurf || !!userHostedMatch;
                        const displaySlotTime = formatTime12Hour(activeBookingForTurf?.time || activeBookingForTurf?.slot_time || userHostedMatch?.time || 'Reserved Slot');
                        const isHosted = !!userHostedMatch || !!activeBookingForTurf?.isHosted;
                        const joinedCount = userHostedMatch ? (userHostedMatch.players_joined || userHostedMatch.existing_players_count || 1) : (activeBookingForTurf?.joinedPlayers || 1);
                        const totalCap = userHostedMatch ? (userHostedMatch.players_total || userHostedMatch.capacity || 10) : (activeBookingForTurf?.capacity || 10);

                        return (
                        <div
                          key={turf.id}
                          className={`glass-card overflow-hidden border transition-all duration-300 flex flex-col justify-between group ${
                            isBooked ? 'border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)] ring-1 ring-emerald-500/30' : 'border-white/5 hover:border-emerald-500/30'
                          }`}
                        >
                          <div>
                            {/* Turf Image with Distance Badge */}
                            <div className="w-full h-48 overflow-hidden relative bg-neutral-900 border-b border-white/5">
                              <VenueImage
                                src={turf.image || turf.image_url}
                                alt={turf.venue || turf.title}
                                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                              />
                              <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
                                <span className="bg-black/70 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-extrabold text-white border border-white/10 flex items-center gap-1.5">
                                  <SportIcon sport={turf.sport} size={13} className="text-emerald-400" />
                                  <span>{turf.sport}</span>
                                </span>
                                {turf.isNew && (
                                  <span className="bg-emerald-500 text-black px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-lg flex items-center gap-1 animate-pulse">
                                    ✨ NEW
                                  </span>
                                )}
                              </div>
                              <div className="absolute top-3 right-3 bg-[#5842fe]/90 text-white px-3 py-1 rounded-lg text-xs font-black shadow-lg flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                <span>{turf.distanceText}</span>
                              </div>
                              <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-black text-white border border-white/10">
                                {turf.price}
                              </div>
                            </div>

                            {/* Turf Details */}
                            <div className="p-5 space-y-3 text-left">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="font-display font-black text-white text-base leading-snug group-hover:text-emerald-400 transition-colors">
                                  {turf.venue || turf.title}
                                </h3>
                                <div className="flex items-center space-x-1 flex-shrink-0 bg-white/5 px-2 py-0.5 rounded border border-white/10 text-xs text-amber-400 font-bold">
                                  <Star className="w-3 h-3 fill-amber-400" />
                                  <span>{turf.rating || 4.8}</span>
                                </div>
                              </div>

                              <p className="text-xs text-neutral-400 flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-neutral-500 flex-shrink-0" />
                                <span className="truncate">{sanitizeLocationToEnglish(turf.address || turf.location || 'Chennai, Tamil Nadu')}</span>
                              </p>

                              {turf.description && (
                                <p className="text-[11px] text-neutral-500 line-clamp-2 font-light">
                                  {turf.description}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Footer Action */}
                          <div className="p-5 pt-0">
                            {isBooked ? (
                              <div className="space-y-2">
                                {isHosted && (
                                  <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                                    <div className="flex items-center gap-1.5 text-neutral-300 font-medium">
                                      <Users className="w-3.5 h-3.5 text-indigo-400" />
                                      <span>Hosting Match</span>
                                    </div>
                                    <span className="font-extrabold text-indigo-400">
                                      {joinedCount} / {totalCap} players joined
                                    </span>
                                  </div>
                                )}

                                {/* Side-by-Side: Status BOOKED on the left, Button "Book More" on the right */}
                                <div className="flex items-center gap-2">
                                  {/* Status: BOOKED */}
                                  <div className="flex-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 py-3 px-3 rounded-full flex items-center justify-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.15)] select-none">
                                    <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                    <span className="text-xs font-black uppercase tracking-wider">BOOKED</span>
                                  </div>

                                  {/* Button on the side: Book More */}
                                  <button
                                    onClick={() => setSelectedSlotTurf(turf)}
                                    className="flex-1 text-xs font-black uppercase tracking-wider bg-[#5842fe] hover:bg-[#4832ee] text-white py-3 px-3 rounded-full transition-all flex items-center justify-center space-x-1.5 shadow-[0_0_15px_rgba(88,66,254,0.35)] cursor-pointer hover:scale-[1.02]"
                                  >
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>Book More</span>
                                  </button>
                                </div>

                                {/* Slot details & Cancel option */}
                                <div className="flex justify-between items-center px-1 text-[11px] pt-0.5">
                                  <span className="text-neutral-400 truncate max-w-[120px]" title={displaySlotTime}>
                                    {displaySlotTime}
                                  </span>
                                  <div className="flex items-center gap-2.5">
                                    <button
                                      type="button"
                                      onClick={() => handleContactVenueOwner(turf)}
                                      className="text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 cursor-pointer font-semibold text-[11px]"
                                      title="Message Venue Owner"
                                    >
                                      <MessageSquare className="w-3 h-3 text-indigo-400" />
                                      <span>Contact</span>
                                    </button>
                                    <button
                                      onClick={() => handleCancelUserBooking(activeBookingForTurf || { id: userHostedMatch?.id, venue: turf.venue || turf.title || turf.name }, turf)}
                                      className="text-neutral-400 hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer font-semibold flex-shrink-0"
                                    >
                                      <XCircle className="w-3 h-3 text-rose-400" />
                                      <span>Cancel</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleContactVenueOwner(turf)}
                                  className="py-3.5 px-3.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white transition-all flex items-center justify-center space-x-1.5 cursor-pointer text-xs font-bold shrink-0"
                                  title="Contact Venue Owner"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>Contact Owner</span>
                                </button>
                                <button
                                  onClick={() => setSelectedSlotTurf(turf)}
                                  className="flex-1 text-xs font-extrabold uppercase tracking-widest bg-[#5842fe] hover:bg-[#4832ee] text-white py-3.5 rounded-full transition-all flex items-center justify-center space-x-2 shadow-[0_0_20px_rgba(88,66,254,0.35)] cursor-pointer hover:scale-[1.02]"
                                >
                                  <span>Select Slot & Book</span>
                                  <ChevronRight className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )})}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ─────────────────────────────────────────────────────────── */}
                  {/* SUB-SECTION 2: 🎮 JOIN GAMES (NEXT)                          */}
                  {/* ─────────────────────────────────────────────────────────── */}
                  {nearYouSubTab === 'join_games' && (
                    <div className="space-y-6 pt-2">
                      <div className="glass-card p-5 border border-white/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-xl">🎮</span>
                            <h3 className="font-display font-black text-white text-lg uppercase tracking-tight">
                              Join Games ({filteredActivities.length})
                            </h3>
                          </div>
                          <p className="text-xs text-neutral-400 mt-0.5">
                            Open matches, hosted games, and sports sessions looking for squad players
                          </p>
                        </div>
                      </div>

                      {filteredActivities.length === 0 ? (
                        <div className="glass-card p-8 text-center border border-dashed border-white/10 space-y-2">
                          <p className="text-neutral-400 font-bold text-sm">No active game sessions found.</p>
                          <p className="text-neutral-500 text-xs">Try selecting 'All Sports' or host your own match from any venue card above!</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                          {filteredActivities.map(act => {
                      const req = matchRequests.find(r => r.matchId === act.id && (r.userId === (user?.id || 'usr_curr') || r.userId === 'usr_amit_patel'));
                      const reqStatus = req ? req.status : (joinedMatches.includes(act.id) ? 'approved' : 'none');
                      const joined = reqStatus === 'approved';
                      return (
                        <div 
                          key={act.id} 
                          onClick={() => setSelectedMarker({ id: act.id, title: act.title, venue: act.venue, sport: act.sport, price: act.price })}
                          className={`glass-card overflow-hidden border cursor-pointer hover:border-white/20 transition-all duration-300 flex flex-col ${
                            selectedMarker && selectedMarker.id === act.id ? 'border-white/35 bg-white/[0.03]' : 'border-white/5'
                          }`}
                        >
                          {/* Large Venue Image Banner */}
                          {act.image && (
                            <div className="w-full h-44 overflow-hidden relative bg-neutral-900 border-b border-white/5 flex-shrink-0">
                              <img src={act.image} alt={act.venue} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
                              <div className="absolute top-3 left-3 flex gap-1">
                                <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-white bg-black/60 backdrop-blur-md border border-white/10 px-2.5 py-1 rounded-lg">
                                  <SportIcon sport={act.sport} size={12} className="text-white" />
                                  {act.sport}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onOpenHostManager && onOpenHostManager(act);
                                }}
                                className="absolute top-3 right-3 bg-indigo-600/90 hover:bg-indigo-500 text-white font-extrabold text-[9px] uppercase tracking-wider px-2.5 py-1 rounded-lg border border-indigo-400/30 backdrop-blur-md shadow-md"
                                title="Host Manager: Review Player Scores"
                              >
                                Host Review
                              </button>
                              <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-black text-white border border-white/10">
                                {act.price}
                              </div>
                            </div>
                          )}

                          <div className="p-5 space-y-4 flex-grow flex flex-col justify-between">
                            <div className="text-left space-y-2">
                              <h3 className="font-display font-black text-white text-base leading-snug">{act.title}</h3>
                              <p className="text-xs text-neutral-400 font-light flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-neutral-500" />
                                {act.venue}
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5 pt-3 border-t border-white/5 text-neutral-300 text-xs font-light">
                              <div className="flex items-center">
                                <MapPin className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                                <span>{act.distance} away</span>
                              </div>
                              <div className="flex items-center">
                                <Clock className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                                <span>{formatTime12Hour(act.time)}</span>
                              </div>
                              <div className="flex items-center">
                                <Users className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                                <span>{joined ? act.joined + 1 : act.joined}/{act.total} Joined</span>
                              </div>
                              <div className="flex items-center">
                                <Trophy className="w-3.5 h-3.5 mr-1.5 text-indigo-400" />
                                <span>Skill: {act.skill}</span>
                              </div>
                            </div>

                            {user?.role === 'owner' ? (
                              <div className="text-[10px] text-center text-neutral-500 font-semibold border border-white/5 rounded-xl py-2 bg-white/[0.01]">
                                View Only Mode
                              </div>
                            ) : (
                              <div className="flex space-x-2 pt-1">
                                {act.isHosted ? (
                                  (() => {
                                    const isJoinedHosted = joined || (Array.isArray(act.participants) && act.participants.some(p => (p.user_id === user?.id || p.user_id === user?.firebase_uid || p.user_name === (user?.name || user?.full_name))));
                                    const isFull = (act.players_joined || act.joined || 0) >= (act.players_total || act.total || 10);
                                    if (isJoinedHosted) {
                                      return (
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            await apiLeaveHostedMatch(act.id, user?.id || user?.firebase_uid);
                                            toggleJoinMatch(act.id);
                                          }}
                                          className="flex-grow text-xs font-bold py-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-rose-500/20 hover:text-rose-300 transition-all cursor-pointer shadow-sm"
                                        >
                                          ✓ Joined (Leave)
                                        </button>
                                      );
                                    }
                                    if (isFull) {
                                      return (
                                        <button
                                          disabled
                                          className="flex-grow text-xs font-bold py-2.5 rounded-full bg-neutral-800 text-neutral-500 border border-white/5 cursor-not-allowed"
                                        >
                                          Squad Full
                                        </button>
                                      );
                                    }
                                    return (
                                      <button
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          await apiJoinHostedMatch(act.id, user);
                                          toggleJoinMatch(act.id);
                                        }}
                                        className="flex-grow text-xs font-bold py-2.5 rounded-full bg-white text-black hover:bg-neutral-200 transition-all cursor-pointer shadow-md"
                                      >
                                        Join Match
                                      </button>
                                    );
                                  })()
                                ) : reqStatus === 'approved' ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRequestCancelMatch ? onRequestCancelMatch(act) : toggleJoinMatch(act.id);
                                    }}
                                    className="flex-grow text-xs font-bold py-2.5 rounded-full border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 hover:bg-rose-500/20 hover:text-rose-300 transition-all cursor-pointer shadow-sm"
                                    title="Click to request cancellation from host"
                                  >
                                    ✓ Joined (Leave)
                                  </button>
                                ) : reqStatus === 'pending_approval' ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRequestCancelMatch ? onRequestCancelMatch(act) : null;
                                    }}
                                    className="flex-grow text-xs font-bold py-2.5 rounded-full border border-amber-500/30 bg-amber-500/15 text-amber-300 transition-all cursor-pointer shadow-sm"
                                  >
                                    🕒 Pending Approval
                                  </button>
                                ) : reqStatus === 'cancellation_pending' ? (
                                  <button
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-grow text-xs font-bold py-2.5 rounded-full border border-rose-500/30 bg-rose-500/15 text-rose-300 transition-all cursor-pointer shadow-sm"
                                  >
                                    ⏳ Leave Pending
                                  </button>
                                ) : (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onRequestJoinMatch ? onRequestJoinMatch(act) : toggleJoinMatch(act.id);
                                    }}
                                    className="flex-grow text-xs font-bold py-2.5 rounded-full bg-white text-black border-transparent hover:bg-neutral-200 transition-all cursor-pointer shadow-md"
                                  >
                                    Join Match
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerPrepaidPayment(act);
                                  }}
                                  className="flex-shrink-0 text-xs font-bold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/25 px-3.5 py-2.5 rounded-full flex items-center space-x-1.5 transition-colors"
                                >
                                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Pay at Venue</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* TABS CONTENT: 🏃 Players Near You */}
            {activeTab === 'Players' && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-card p-5 border border-white/5 rounded-2xl">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xl">🏃</span>
                      <h2 className="font-display font-black text-white text-lg uppercase tracking-tight">
                        {searchQuery ? `Search Results for "${searchQuery}"` : 'Players Near You'}
                      </h2>
                    </div>
                    <p className="text-xs text-neutral-400 mt-0.5">
                      Showing all registered players ({dbPlayersList.length} athletes)
                    </p>
                  </div>

                  <div className="flex items-center space-x-2 bg-[#0a0a0a] p-1.5 rounded-full border border-white/10 self-start sm:self-auto overflow-x-auto no-scrollbar">
                    <span className="text-[10px] text-neutral-400 uppercase font-bold pl-3 pr-1">Max Distance:</span>
                    {[5, 10, 20, 30, 50].map(r => (
                      <button
                        key={r}
                        onClick={() => setRadiusKm(r)}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                          radiusKm === r
                            ? 'bg-indigo-600 text-white font-black shadow-md'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                      >
                        {r} km
                      </button>
                    ))}
                  </div>
                </div>

                {playersLoading ? (
                  <div className="glass-card p-12 text-center border border-white/5 flex items-center justify-center space-x-3 text-indigo-400">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="text-sm font-bold">Searching for registered players...</span>
                  </div>
                ) : dbPlayersList.length === 0 ? (
                  <div className="glass-card p-12 text-center border border-dashed border-white/10 space-y-3">
                    <Users className="w-10 h-10 text-neutral-600 mx-auto" />
                    <h3 className="text-white font-bold text-base">No users found</h3>
                    <p className="text-neutral-500 text-xs max-w-md mx-auto">
                      No matching registered player profiles found. Try searching by their Player ID (e.g. @handle) or name.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {dbPlayersList.map((player) => {
                      const isFollowing = followedPlayers.includes(player.id);
                      const displayPlayerId = player.player_id || player.handle || (player.username ? (player.username.startsWith('@') ? player.username : `@${player.username}`) : `@athlete_${String(player.id).slice(-4)}`);
                      return (
                        <div
                          key={player.id}
                          onClick={() => setSelectedPlayerModal(player)}
                          className="glass-card p-5 border border-white/5 hover:border-indigo-500/30 transition-all duration-300 cursor-pointer flex flex-col justify-between group"
                        >
                          <div className="space-y-4">
                            <div className="flex items-center space-x-3.5">
                              <UserAvatar
                                user={player}
                                className="w-13 h-13 text-base border-2 border-indigo-500/30 group-hover:border-indigo-400 transition-colors shrink-0"
                              />
                              <div className="text-left overflow-hidden">
                                <h3 className="font-bold text-white text-base truncate group-hover:text-indigo-400 transition-colors">
                                  {player.full_name || player.name || 'Sports Player'}
                                </h3>
                                <p className="text-xs text-indigo-300 font-mono font-bold truncate">
                                  {displayPlayerId}
                                </p>
                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border mt-1 inline-block ${
                                  player.role === 'owner' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                                }`}>
                                  {player.role === 'owner' ? '🏟️ Venue Owner' : '🏃 Player'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs pt-3 border-t border-white/5 text-neutral-400">
                              <span className="flex items-center gap-1 text-emerald-400 font-extrabold">
                                <MapPin className="w-3.5 h-3.5" />
                                {player.distanceText || 'Nearby'}
                              </span>
                              <span>{sanitizeLocationToEnglish(player.city || player.location || 'Chennai')}</span>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 flex items-center space-x-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFollow(player.id, player);
                              }}
                              className={`flex-1 py-2 text-xs font-bold rounded-xl border transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                                isFollowing
                                  ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-rose-500/15 hover:text-rose-400 hover:border-rose-500/30'
                                  : 'bg-indigo-600 hover:bg-indigo-500 text-white border-transparent shadow-md shadow-indigo-600/30'
                              }`}
                            >
                              {isFollowing ? <UserCheck className="w-3.5 h-3.5 text-indigo-400" /> : <UserPlus className="w-3.5 h-3.5" />}
                              <span>{isFollowing ? 'Following' : '+ Follow'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onStartChat) {
                                  onStartChat(player);
                                } else if (setTab) {
                                  try {
                                    localStorage.setItem('turfington_target_chat_user', JSON.stringify(player));
                                  } catch {}
                                  setTab('community');
                                }
                              }}
                              className="px-3.5 py-2 text-xs font-bold rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/10 transition-all flex items-center justify-center space-x-1 cursor-pointer"
                              title="Message & Chat"
                            >
                              <MessageCircle className="w-3.5 h-3.5 text-indigo-400" />
                              <span>Message</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TABS CONTENT: Map */}
            {activeTab === 'Map' && (
              <div className="w-full h-full min-h-[600px] rounded-2xl overflow-hidden border border-white/10 bg-neutral-900 relative">
                {loadError ? (
                  <div className="flex flex-col items-center justify-center h-[600px] w-full text-rose-400 p-6 text-center bg-black/40">
                    <p className="font-bold mb-2">Failed to load Google Maps</p>
                    <p className="text-sm font-light">Please check your VITE_GOOGLE_MAPS_API_KEY and network connection.</p>
                  </div>
                ) : !isLoaded ? (
                  <div className="flex items-center justify-center h-[600px] w-full">
                    <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
                  </div>
                ) : (
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '600px' }}
                    center={{
                      lat: userCoordinates?.lat || 13.0827,
                      lng: userCoordinates?.lng || 80.2707
                    }}
                    zoom={13}
                    onLoad={() => {
                      console.log('Fetched nearby turfs:', activities);
                    }}
                  >
                    {userCoordinates && (
                      <Marker 
                        position={{ lat: userCoordinates.lat, lng: userCoordinates.lng }} 
                        icon={{ url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png" }}
                        title="You are here"
                      />
                    )}
                    {activities.map((turf) => (
                      <Marker
                        key={turf.id}
                        position={{
                          lat: turf.lat,
                          lng: turf.lng
                        }}
                        onClick={() => setSelectedMarker(turf)}
                        title={turf.title}
                      />
                    ))}
                    {selectedMarker && selectedMarker.lat && selectedMarker.lng && (
                      <InfoWindow
                        position={{ lat: selectedMarker.lat, lng: selectedMarker.lng }}
                        onCloseClick={() => setSelectedMarker(null)}
                      >
                        <div className="text-black p-2 min-w-[210px]">
                          <h3 className="font-bold text-sm mb-1">{selectedMarker.title}</h3>
                          <p className="text-xs text-neutral-600 mb-2">{selectedMarker.price} • {selectedMarker.rating} ⭐</p>
                          <p className="text-xs text-indigo-600 font-bold mb-3">{selectedMarker.distance} away</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button 
                              onClick={async () => {
                                const ownerId = selectedMarker.owner_id || selectedMarker.ownerId || 'usr_venue_owner';
                                const ownerName = selectedMarker.ownerName || selectedMarker.venue || selectedMarker.title || 'Venue Owner';
                                await apiCreateDirectChat(user?.id || 'usr_me', ownerId);
                                toast.info(`Opening message channel with ${ownerName}...`, 'Direct Message');
                              }}
                              className="bg-neutral-800 hover:bg-neutral-900 text-white py-1.5 rounded text-xs font-bold cursor-pointer"
                            >
                              Contact
                            </button>
                            <button 
                              onClick={() => triggerPrepaidPayment(selectedMarker)}
                              className="bg-indigo-600 hover:bg-indigo-500 text-white py-1.5 rounded text-xs font-bold cursor-pointer"
                            >
                              Book Now
                            </button>
                          </div>
                        </div>
                      </InfoWindow>
                    )}
                  </GoogleMap>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* 3.5 SLOT SELECTION & OPEN MATCH PLAYER JOIN MODAL */}
      <AnimatePresence>
        {selectedSlotTurf && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              exit={{ opacity: 0 }}
              onClick={() => { setSelectedSlotTurf(null); setChosenSlot(null); }}
              className="absolute inset-0 bg-black backdrop-blur-sm"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative glass-card w-full max-w-[560px] p-6 border border-white/10 shadow-2xl text-left z-10 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-white/5">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xl">🏟️</span>
                    <h3 className="font-display font-black text-lg text-white uppercase tracking-tight">
                      {selectedSlotTurf.venue || selectedSlotTurf.name || selectedSlotTurf.title}
                    </h3>
                  </div>
                  <p className="text-xs text-neutral-400 mt-0.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-neutral-500" />
                    <span>{selectedSlotTurf.address || 'Chennai'}</span>
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <button 
                    type="button"
                    onClick={() => handleContactVenueOwner(selectedSlotTurf, chosenSlot)}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 font-bold text-xs cursor-pointer transition-all shadow-sm"
                    title="Message Venue Owner directly"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Contact Owner</span>
                  </button>
                  <button 
                    onClick={() => { setSelectedSlotTurf(null); setChosenSlot(null); }} 
                    className="p-2 rounded-full bg-white/5 border border-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <X className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>

              {/* Date Selector Tabs (Horizontal Pills matching uploaded UI design) */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block">
                    Select Day (Max 3 Days Advance Online)
                  </label>
                  <span className="text-[10px] text-emerald-400 font-extrabold">Online Booking Active</span>
                </div>
                
                <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-1">
                  {getBookingDays().map(day => {
                    const isSelected = slotDateTab === day.dayShort;
                    return (
                      <button
                        key={day.dayShort}
                        onClick={() => { setSlotDateTab(day.dayShort); setChosenSlot(null); }}
                        className={`flex-shrink-0 px-4 py-2.5 rounded-full text-xs font-mono font-extrabold uppercase tracking-wider transition-all cursor-pointer flex items-center space-x-1.5 border ${
                          isSelected
                            ? 'bg-white text-black border-transparent shadow-lg shadow-white/20'
                            : day.isAdvanceRestricted
                            ? 'bg-white/[0.02] border-white/8 text-neutral-500 hover:text-neutral-300'
                            : 'bg-white/5 border-white/10 text-neutral-300 hover:text-white hover:border-white/20'
                        }`}
                      >
                        <span>{day.index === 0 ? `TODAY (${day.fullLabel})` : day.fullLabel}</span>
                        {day.isAdvanceRestricted && <span className="text-[10px]" title="Beyond 3 days advance limit">🔒</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Check if Selected Day is Beyond 3-Day Limit */}
              {(() => {
                const currentDayObj = getBookingDays().find(d => d.dayShort === slotDateTab) || getBookingDays()[0];
                if (currentDayObj.isAdvanceRestricted) {
                  return (
                    <div className="mt-5 p-6 bg-indigo-950/40 border border-indigo-500/30 rounded-2xl text-center space-y-4 shadow-xl">
                      <div className="w-12 h-12 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-400 flex items-center justify-center mx-auto">
                        <Lock className="w-6 h-6 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="font-display font-extrabold text-white text-base">Advance Booking Notice (Beyond 3 Days)</h4>
                        <p className="text-xs text-neutral-300 mt-1.5 max-w-md mx-auto font-light leading-relaxed">
                          Online slot bookings can only be done up to 3 days in advance. To reserve slots for <strong>{currentDayObj.dateLabel} ({currentDayObj.dayShort})</strong>, please contact the venue owner directly.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleContactVenueOwner(selectedSlotTurf, null)}
                        className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-wider rounded-full transition-all flex items-center justify-center space-x-2 mx-auto shadow-lg shadow-indigo-600/30 cursor-pointer"
                      >
                        <MessageSquare className="w-4 h-4" />
                        <span>Contact Venue Owner Direct</span>
                      </button>
                    </div>
                  );
                }

                // Normal 3-Day Available Slots Grid matching exact uploaded file UI styling!
                const slotsList = getSlotsForTurf(selectedSlotTurf, slotDateTab);

                return (
                  <div className="mt-5 space-y-3">
                    {/* Legend */}
                    <div className="flex items-center justify-between border-t border-white/5 pt-3">
                      <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block">
                        Available Sessions ({currentDayObj.dateLabel})
                      </label>
                      <div className="flex items-center space-x-4 text-[10px] font-bold">
                        <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /><span className="text-emerald-400">Open Slots (Green)</span></span>
                        <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /><span className="text-rose-400">Booked (Red)</span></span>
                      </div>
                    </div>

                    {slotsList.length === 0 ? (
                      <div className="p-8 text-center glass-card border border-dashed border-white/10 text-neutral-500 text-xs">
                        No open sessions available for {currentDayObj.dateLabel}.
                      </div>
                    ) : (
                      /* Slot Grid matching exact GREEN open slots and RED booked slots requirement */
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-1">
                        {slotsList.map(slot => {
                          const isBooked = slot.status === 'booked';
                          const isSelected = chosenSlot?.id === slot.id;

                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => {
                                if (!isBooked) {
                                  setChosenSlot(slot);
                                  setBookingType('private');
                                }
                              }}
                              disabled={isBooked}
                              className={`px-3 py-3 rounded-xl border text-[10px] font-bold text-center transition-all cursor-pointer ${
                                isBooked
                                  ? 'bg-rose-950/70 border-rose-500/40 text-rose-300 opacity-80 cursor-not-allowed shadow-inner'
                                  : isSelected
                                  ? 'bg-emerald-600/40 border-emerald-400 text-white ring-2 ring-emerald-400/80 scale-105 shadow-lg shadow-emerald-600/40'
                                  : 'bg-emerald-950/50 border-emerald-500/40 text-emerald-400 hover:bg-emerald-900/60 hover:border-emerald-400 hover:scale-105'
                              }`}
                            >
                              <div className="font-mono text-xs font-black mb-0.5">{formatTime12Hour(slot.time)}</div>
                              <div className="uppercase tracking-widest text-[9px] font-black">
                                {isBooked ? 'BOOKED' : 'OPEN'}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* When a valid slot is selected */}
              {chosenSlot && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 pt-4 border-t border-white/10 space-y-4"
                >
                  {/* Booking Options: Private vs Host Open Match */}
                  {chosenSlot.status === 'available' && (
                    <div className="space-y-3">
                      <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block">
                        Select Booking Mode
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setBookingType('private')}
                          className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            bookingType === 'private'
                              ? 'bg-emerald-500/20 border-emerald-400 text-white font-bold'
                              : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                          }`}
                        >
                          <p className="font-bold text-white">🏆 Private Booking</p>
                          <p className="text-[10px] text-neutral-400 mt-0.5">Book full turf for your team</p>
                        </button>

                        <button
                          type="button"
                          onClick={() => setBookingType('open_match')}
                          className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                            bookingType === 'open_match'
                              ? 'bg-amber-500/20 border-amber-400 text-white font-bold'
                              : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white'
                          }`}
                        >
                          <p className="font-bold text-amber-300">👥 Host Open Match</p>
                          <p className="text-[10px] text-neutral-400 mt-0.5">Need more players to join your game!</p>
                        </button>
                      </div>

                      {/* If Host Open Match selected, choose sport presets and dynamic player capacity */}
                      {bookingType === 'open_match' && (
                        <div className="space-y-3.5 pt-1">
                          {/* 1. Sport Presets */}
                          <div>
                            <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block mb-2">
                              Sport & Squad Requirements
                            </label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                              {SPORT_CAPACITY_PRESETS.map((p) => {
                                const isSel = selectedSportPreset === p.sport && hostCapacity === p.defaultCap;
                                return (
                                  <button
                                    key={p.sport}
                                    type="button"
                                    onClick={() => {
                                      setSelectedSportPreset(p.sport);
                                      setHostCapacity(p.defaultCap);
                                      setMyExistingCount(Math.max(1, Math.min(p.defaultCap - 1, Math.floor(p.defaultCap / 2))));
                                    }}
                                    className={`p-2 rounded-xl border text-xs font-medium flex items-center justify-between transition-all cursor-pointer ${
                                      isSel
                                        ? 'bg-white text-black border-white shadow-sm'
                                        : 'bg-white/[0.03] border-white/10 text-neutral-300 hover:border-white/20 hover:text-white'
                                    }`}
                                  >
                                    <span className="flex items-center gap-1.5 truncate">
                                      <span>{p.icon}</span>
                                      <span className="truncate">{p.sport}</span>
                                    </span>
                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isSel ? 'bg-black/10 text-black font-bold' : 'bg-white/10 text-neutral-400'}`}>
                                      {p.defaultCap}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* 2. Squad Capacity & Players with You Stepper */}
                          <div className="p-4 rounded-2xl bg-neutral-900/80 border border-white/10 space-y-3 text-left">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <span className="text-xs font-bold text-white block">Total Players Needed (Capacity)</span>
                                <span className="text-[10px] text-neutral-400 font-light block mt-0.5">
                                  {selectedSportPreset === 'Badminton' ? '🏸 Badminton: 4 players for doubles (2v2) or 2 for singles' :
                                   selectedSportPreset === 'Cricket' ? '🏏 Cricket: 11 squad players or 22 for full 11v11 match' :
                                   selectedSportPreset === 'Kabaddi' ? '🤼 Kabaddi: 14 players required (7v7 match squad)' :
                                   selectedSportPreset === 'Football' ? '⚽ Football: 10 players for 5v5 or 14 for 7v7 turf' :
                                   `${selectedSportPreset}: Select squad size needed for this match`}
                                </span>
                              </div>
                              <div className="flex items-center space-x-1.5 bg-black/60 border border-white/10 rounded-xl p-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Math.max(2, hostCapacity - 1);
                                    setHostCapacity(next);
                                    if (myExistingCount >= next) setMyExistingCount(next - 1);
                                  }}
                                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-white flex items-center justify-center font-bold text-sm cursor-pointer"
                                >
                                  −
                                </button>
                                <span className="w-8 text-center font-mono font-bold text-sm text-white">{hostCapacity}</span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = Math.min(32, hostCapacity + 1);
                                    setHostCapacity(next);
                                  }}
                                  className="w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-white flex items-center justify-center font-bold text-sm cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Stepper for players host already has */}
                            <div className="flex items-center justify-between pt-2.5 border-t border-white/5 text-xs">
                              <span className="text-neutral-300">Players you already have with you:</span>
                              <div className="flex items-center space-x-1.5 bg-black/60 border border-white/10 rounded-xl p-1 flex-shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setMyExistingCount(Math.max(1, myExistingCount - 1))}
                                  className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/15 text-white flex items-center justify-center font-bold text-xs cursor-pointer"
                                >
                                  −
                                </button>
                                <span className="w-7 text-center font-mono font-semibold text-xs text-white">{myExistingCount}</span>
                                <button
                                  type="button"
                                  onClick={() => setMyExistingCount(Math.min(hostCapacity - 1, myExistingCount + 1))}
                                  className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/15 text-white flex items-center justify-center font-bold text-xs cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Open spots & split summary */}
                            <div className="grid grid-cols-2 gap-2 pt-1 text-left">
                              <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl">
                                <span className="text-[10px] text-neutral-400 block font-medium">Spots for Others:</span>
                                <span className="text-xs font-bold text-neutral-200 mt-0.5 block">{hostCapacity - myExistingCount} Players Needed</span>
                              </div>
                              <div className="p-2.5 bg-white/[0.02] border border-white/5 rounded-xl">
                                <span className="text-[10px] text-neutral-400 block font-medium">Per Player Split:</span>
                                <span className="text-xs font-bold text-neutral-200 mt-0.5 block">₹{Math.round(chosenSlot.price / hostCapacity)} / player</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Joining an Open Match Session */}
                  {chosenSlot.status === 'open_match' && (
                    <div className="p-4 bg-neutral-900/80 border border-white/10 rounded-2xl space-y-2 text-xs text-left">
                      <div className="flex justify-between items-center font-bold">
                        <span className="text-white flex items-center gap-1.5">
                          <span>👥</span> Open Match Hosted by {chosenSlot.hostName || 'Fellow Athlete'}
                        </span>
                        <span className="text-neutral-300 font-mono text-[11px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10">
                          {chosenSlot.currentPlayers || 1}/{chosenSlot.capacity || 10} Joined
                        </span>
                      </div>
                      <p className="text-neutral-400 font-light text-[11px]">
                        {chosenSlot.neededPlayers || ((chosenSlot.capacity || 10) - (chosenSlot.currentPlayers || 1))} more players needed to complete squad. Other players can join instantly!
                      </p>
                    </div>
                  )}

                  {/* Proceed to Payment Action Button */}
                  <button
                    onClick={() => handleConfirmSlotBooking(chosenSlot)}
                    className={`w-full py-4 rounded-full font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg flex items-center justify-center space-x-2 ${
                      chosenSlot.status === 'open_match'
                        ? 'bg-white text-black hover:bg-neutral-200 shadow-md'
                        : bookingType === 'open_match'
                        ? 'bg-white text-black hover:bg-neutral-200 shadow-md'
                        : 'bg-[#5842fe] hover:bg-[#4832ee] text-white shadow-[0_0_20px_rgba(88,66,254,0.35)]'
                    }`}
                  >
                    <span>
                      {chosenSlot.status === 'open_match'
                        ? `Join Match & Pay Split (₹${Math.round(chosenSlot.price / (chosenSlot.capacity || 10))})`
                        : bookingType === 'open_match'
                        ? `Host Match (${hostCapacity - myExistingCount} Spots Open) • Pay at Venue (₹${chosenSlot.price})`
                        : `Book ${formatTime12Hour(chosenSlot.time)} (₹${chosenSlot.price})`}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </motion.div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. PREPAID PAYMENT MODAL */}
      <AnimatePresence>
        {activePrepaidVenue && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              exit={{ opacity: 0 }}
              onClick={() => setActivePrepaidVenue(null)}
              className="absolute inset-0 bg-black"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative glass-card w-full max-w-[400px] p-6 border border-white/10 shadow-2xl text-left z-10"
            >
              <div className="space-y-5">
                <div className="flex items-center space-x-2 pb-3 border-b border-white/5">
                  <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                    <Check className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div>
                    <h3 className="font-display font-black text-sm uppercase">Confirm Venue Booking</h3>
                    <p className="text-[9px] text-emerald-400 font-medium">No Prepaid Online Payment Required • Pay at Venue</p>
                  </div>
                </div>

                {/* Booking description summary */}
                <div className="space-y-3 bg-white/[0.02] border border-white/5 rounded-xl p-4 text-xs font-light">
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Venue / Session</span>
                    <span className="font-bold text-white">{activePrepaidVenue.venue || activePrepaidVenue.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Sport Category</span>
                    <span className="text-neutral-300 font-medium">{activePrepaidVenue.sport}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-neutral-400">Time Window</span>
                    <span className="text-neutral-300 font-medium">{formatTime12Hour(activePrepaidVenue.time)}</span>
                  </div>
                  <div className="flex justify-between pt-2.5 border-t border-white/5 font-bold text-sm">
                    <span>Payable at Turf Counter</span>
                    <span className="font-display text-white">{activePrepaidVenue.price}</span>
                  </div>
                </div>

                {/* Payment Option Notice */}
                <div className="space-y-2">
                  <label className="text-[9px] text-neutral-400 uppercase tracking-widest font-bold">Payment Terms</label>
                  <div className="flex items-center justify-between p-3.5 bg-neutral-900 border border-emerald-500/20 rounded-xl text-xs">
                    <div className="flex items-center space-x-2.5">
                      <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <div>
                        <p className="text-white font-bold text-xs">Pay at Venue (Cash / UPI / Card)</p>
                        <p className="text-[10px] text-neutral-400">0% advance • Settle bill upon arrival</p>
                      </div>
                    </div>
                    <span className="text-[9px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase font-bold tracking-wider">No Advance</span>
                  </div>
                </div>

                {/* CTA actions */}
                <div className="flex items-center space-x-3 pt-2">
                  <button 
                    onClick={() => setActivePrepaidVenue(null)}
                    className="flex-1 py-3 text-xs border border-white/10 hover:bg-white/5 rounded-full font-bold text-neutral-400 hover:text-white transition-all text-center"
                  >
                    Cancel
                  </button>

                  <button 
                    onClick={handleConfirmVenueBooking}
                    disabled={isPaying || paymentSuccess}
                    className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black uppercase tracking-wider rounded-full transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  >
                    {isPaying ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Reserving...</span>
                      </>
                    ) : paymentSuccess ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Booked!</span>
                      </>
                    ) : (
                      <span>Confirm Booking</span>
                    )}
                  </button>
                </div>

                <p className="text-[9px] text-center text-neutral-500 font-light leading-relaxed">
                  Your reservation is guaranteed. Please arrive 10 minutes prior to slot start time to check in at the reception counter.
                </p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DEALS AND MEMBERSHIPS PASSES MODAL */}
      <AnimatePresence>
        {selectedDealsVenue && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDealsVenue(null)}
              className="absolute inset-0 bg-black"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative glass-card w-full max-w-[460px] p-6 border border-white/10 shadow-2xl text-left z-10"
            >
              <div className="space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-white/5">
                  <div className="flex items-center space-x-2">
                    <div className="p-2 bg-indigo-500/10 border border-indigo-500/25 rounded-full text-indigo-400">
                      <Trophy className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h3 className="font-display font-black text-sm uppercase">Deals & Memberships</h3>
                      <p className="text-[9px] text-neutral-500">Exclusives for {selectedDealsVenue.venue}</p>
                    </div>
                  </div>
                  <button onClick={() => setSelectedDealsVenue(null)} className="p-1.5 hover:bg-white/5 border border-white/10 rounded-full text-neutral-400 hover:text-white transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Booking discounts section */}
                <div className="space-y-3">
                  <h4 className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Claim Booking Discount</h4>
                  {venueOffers.filter(o => o.venueId === selectedDealsVenue.id && o.type === 'booking').length === 0 ? (
                    <p className="text-[11px] text-neutral-500 italic font-light">No active booking offers for this venue.</p>
                  ) : (
                    <div className="space-y-2">
                      {venueOffers.filter(o => o.venueId === selectedDealsVenue.id && o.type === 'booking').map(offer => (
                        <div key={offer.id} className="p-3 bg-indigo-600/5 border border-indigo-500/15 rounded-xl flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white">{offer.title}</p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">{offer.description}</p>
                          </div>
                          <button 
                            onClick={() => {
                              const discountPct = parseFloat(offer.discount.replace(/[^\d]/g, '')) || 15;
                              const currentVal = parseFloat(selectedDealsVenue.price.replace(/[^\d]/g, ''));
                              const calculated = Math.round(currentVal * (1 - discountPct / 100));
                              
                              setSelectedDealsVenue(null);
                              triggerPrepaidPayment({
                                ...selectedDealsVenue,
                                price: `₹${calculated.toLocaleString('en-IN')}/hr (Discount Applied)`
                              });
                            }}
                            className="flex-shrink-0 text-[10px] font-black uppercase bg-indigo-600 text-white px-3.5 py-1.5 rounded-full hover:bg-indigo-500 transition-all"
                          >
                            Apply {offer.discount}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Membership packages section */}
                <div className="space-y-3 pt-3 border-t border-white/5">
                  <h4 className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Monthly Membership Passes</h4>
                  {venueOffers.filter(o => o.venueId === selectedDealsVenue.id && o.type === 'membership').length === 0 ? (
                    <p className="text-[11px] text-neutral-500 italic font-light">No membership packages currently offered.</p>
                  ) : (
                    <div className="space-y-2">
                      {venueOffers.filter(o => o.venueId === selectedDealsVenue.id && o.type === 'membership').map(pass => (
                        <div key={pass.id} className="p-3 bg-emerald-600/5 border border-emerald-500/15 rounded-xl flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white">{pass.title}</p>
                            <p className="text-[10px] text-neutral-400 mt-0.5">{pass.benefits}</p>
                          </div>
                          <button 
                            onClick={() => {
                              alert(`Congratulations! You have subscribed to the "${pass.title}" package at ${pass.price}. Subscriptions receipt has been sent to your email!`);
                              setSelectedDealsVenue(null);
                            }}
                            className="flex-shrink-0 text-[10px] font-black uppercase bg-[#5842fe] hover:bg-[#4832ee] text-white px-3.5 py-1.5 rounded-full transition-all shadow-md"
                          >
                            Buy {pass.price}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 3.6 PUBLIC PLAYER PROFILE CARD MODAL */}
      <AnimatePresence>
        {selectedPlayerModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.8 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPlayerModal(null)}
              className="absolute inset-0 bg-black backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative glass-card w-full max-w-[480px] border border-white/10 shadow-2xl text-left z-10 overflow-hidden rounded-3xl"
            >
              {/* Cover Banner */}
              <div className="w-full h-32 bg-gradient-to-r from-indigo-600 to-purple-800 relative">
                <button
                  onClick={() => setSelectedPlayerModal(null)}
                  className="absolute top-3 right-3 p-2 rounded-full bg-black/40 border border-white/10 text-white hover:bg-black/70 transition-all cursor-pointer z-10"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Player Info Body */}
              <div className="p-6 pt-0 relative">
                <div className="flex items-end justify-between -mt-14 mb-4">
                  <UserAvatar
                    user={selectedPlayerModal}
                    className="w-22 h-22 text-2xl border-4 border-[#080808] shadow-xl shrink-0"
                  />

                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${
                    selectedPlayerModal.role === 'owner' ? 'bg-amber-500/10 text-amber-300 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
                  }`}>
                    {selectedPlayerModal.role === 'owner' ? '🏟️ Venue Owner' : '🏃 Player'}
                  </span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-xl font-display font-black text-white">
                    {selectedPlayerModal.full_name || 'Sports Player'}
                  </h3>
                  <p className="text-xs text-indigo-400 font-mono">
                    @{selectedPlayerModal.username || 'player'}
                  </p>
                </div>

                <div className="flex items-center space-x-3 text-xs text-neutral-400 mt-3 pt-3 border-t border-white/5">
                  <span className="flex items-center gap-1 text-emerald-400 font-extrabold">
                    <MapPin className="w-3.5 h-3.5" />
                    {selectedPlayerModal.distanceText || '1.2 km away'}
                  </span>
                  <span>•</span>
                  <span>{sanitizeLocationToEnglish(selectedPlayerModal.city || selectedPlayerModal.location || 'Chennai')}</span>
                </div>

                {selectedPlayerModal.bio && (
                  <p className="text-xs text-neutral-300 font-light mt-3 leading-relaxed">
                    {selectedPlayerModal.bio}
                  </p>
                )}

                <div className="mt-6 pt-4 border-t border-white/10 flex space-x-3">
                  <button
                    onClick={() => {
                      if (onStartChat) {
                        onStartChat(selectedPlayerModal);
                      } else if (setTab) {
                        try {
                          localStorage.setItem('turfington_target_chat_user', JSON.stringify(selectedPlayerModal));
                        } catch {}
                        setTab('community');
                      }
                      setSelectedPlayerModal(null);
                    }}
                    className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-indigo-600/30"
                  >
                    <MessageSquare className="w-4 h-4 text-emerald-300" />
                    <span>Message</span>
                  </button>

                  <button
                    onClick={async () => {
                      await toggleFollow(selectedPlayerModal.id, selectedPlayerModal);
                    }}
                    className={`py-2.5 px-5 text-xs font-bold rounded-xl border transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                      followedPlayers.includes(selectedPlayerModal.id)
                        ? 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-rose-500/15 hover:text-rose-400 hover:border-rose-500/30'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white border-transparent shadow-md shadow-indigo-600/30'
                    }`}
                  >
                    {followedPlayers.includes(selectedPlayerModal.id) ? (
                      <>
                        <UserCheck className="w-4 h-4 text-indigo-400" />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>+ Follow</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BOOKING DONE CELEBRATION MODAL */}
      <AnimatePresence>
        {bookingCelebrationData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.85 }}
              exit={{ opacity: 0 }}
              onClick={() => setBookingCelebrationData(null)}
              className="absolute inset-0 bg-black backdrop-blur-md"
            />

            <motion.div 
              initial={{ opacity: 0, scale: 0.85, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", stiffness: 350, damping: 25 }}
              className="relative glass-card w-full max-w-md p-6 sm:p-7 border border-emerald-500/30 shadow-[0_0_50px_rgba(16,185,129,0.2)] text-center z-10 rounded-3xl overflow-hidden"
            >
              {/* Glowing decorative background circle */}
              <div className="absolute -top-24 -left-24 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

              {/* Animated Success Icon */}
              <div className="relative mx-auto w-20 h-20 mb-4 flex items-center justify-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 400 }}
                    className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.5)]"
                  >
                    <Check className="w-8 h-8 text-black stroke-[3]" />
                  </motion.div>
                </motion.div>
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: -20, x: -30 }}
                  transition={{ delay: 0.3, duration: 0.6 }}
                  className="absolute text-lg"
                >
                  ✨
                </motion.span>
                <motion.span
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: -25, x: 30 }}
                  transition={{ delay: 0.35, duration: 0.6 }}
                  className="absolute text-lg"
                >
                  🎉
                </motion.span>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25 }}
              >
                <h3 className="font-display font-black text-2xl text-white tracking-tight">
                  Booking Confirmed!
                </h3>
                <p className="text-xs text-emerald-400 font-semibold mt-1">
                  Your turf slot has been successfully reserved
                </p>
              </motion.div>

              {/* Booking Summary Box */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="mt-5 p-4 rounded-2xl bg-white/[0.04] border border-white/10 text-left space-y-2.5 text-xs"
              >
                <div className="flex justify-between items-center pb-2 border-b border-white/5">
                  <span className="text-neutral-400">Turf Venue</span>
                  <span className="font-bold text-white text-sm truncate max-w-[200px]">
                    {bookingCelebrationData.venue || bookingCelebrationData.venue_name}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-400">Sport</span>
                  <span className="text-neutral-200 font-medium flex items-center gap-1.5">
                    <SportIcon sport={bookingCelebrationData.sport} size={14} className="text-emerald-400" />
                    <span>{bookingCelebrationData.sport}</span>
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-neutral-400">Reserved Slot</span>
                  <span className="text-indigo-400 font-bold">
                    {formatTime12Hour(bookingCelebrationData.time || bookingCelebrationData.slot_time)}
                  </span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-white/5">
                  <span className="text-neutral-400">Payment Term</span>
                  <span className="font-extrabold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 text-[11px]">
                    Pay on Arrival ({bookingCelebrationData.price})
                  </span>
                </div>

                {bookingCelebrationData.isHosted && (
                  <div className="mt-2 p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-[11px] text-indigo-300">
                    👥 <strong>Match Open to Players:</strong> Other players can now discover and join your match in the Community feed!
                  </div>
                )}
              </motion.div>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
                className="mt-6 flex flex-col sm:flex-row gap-2.5"
              >
                <button
                  onClick={() => {
                    setBookingCelebrationData(null);
                    if (setTab) setTab('dashboard');
                  }}
                  className="flex-1 py-3 bg-[#5842fe] hover:bg-[#4832ee] text-white font-extrabold text-xs uppercase tracking-wider rounded-full shadow-[0_0_20px_rgba(88,66,254,0.35)] transition-all cursor-pointer"
                >
                  View in My Bookings
                </button>
                <button
                  onClick={() => setBookingCelebrationData(null)}
                  className="flex-1 py-3 bg-white/10 hover:bg-white/15 text-white font-bold text-xs uppercase tracking-wider rounded-full border border-white/10 transition-all cursor-pointer"
                >
                  Done
                </button>
              </motion.div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
