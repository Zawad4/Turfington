import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2, Plus, MapPin, IndianRupee, Clock, Users, Edit3, Trash2,
  X, CheckCircle, TrendingUp, Calendar, Shield, Star, ChevronDown,
  ToggleLeft, ToggleRight, Camera, Phone, Globe, Zap, AlertCircle,
  Navigation, Compass, Loader2, Check, Lock, ShieldAlert, MessageSquare,
  XCircle, Filter
} from 'lucide-react';
import { GoogleMap, useJsApiLoader, Marker } from '@react-google-maps/api';
import { 
  apiFetchVenues, 
  apiCreateVenue,
  apiUpdateVenue, 
  apiDeleteVenue, 
  apiFetchBookings, 
  apiUpdateBookingStatus, 
  apiFetchOwnerBookings, 
  apiUpdateVenueBookingMode, 
  apiCreateDirectChat,
  compressDataUrlOrFile
} from '../services/db';
import VenueImage from '../components/VenueImage';
import UserAvatar from '../components/UserAvatar';
import { useToast } from '../context';
import { formatTime12Hour } from '../utils/formatters';
import { fetchEnglishReverseGeocode, fetchEnglishSearchGeocode, sanitizeLocationToEnglish } from '../utils/locationHelper';

/* ─── Reject Booking Modal ────────────────────────────── */
function RejectBookingModal({ booking, onClose, onReject }) {
  const [reason, setReason] = useState('');
  const PRESET_REASONS = [
    'Court under scheduled maintenance',
    'Slot already reserved offline / phone call',
    'Unfavorable weather conditions',
    'Facility closed for private event'
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!reason.trim()) return;
    onReject(booking.id, reason.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative glass-card w-full max-w-md border border-white/10 p-6 z-10 text-left space-y-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div>
            <h3 className="font-display font-extrabold text-white text-base">Reject Booking Request</h3>
            <p className="text-[10px] text-neutral-400 mt-0.5">Player: {booking.player_name || booking.user_name || 'Player'} • {booking.title || booking.venue}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider block mb-2">Select or Type Rejection Reason</label>
            <div className="space-y-1.5 mb-3">
              {PRESET_REASONS.map(r => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setReason(r)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs border transition-all ${
                    reason === r ? 'bg-rose-500/15 border-rose-500/40 text-rose-300 font-bold' : 'bg-white/[0.02] border-white/5 text-neutral-300 hover:border-white/10'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
              rows={3}
              placeholder="Provide a detailed reason for the player..."
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl p-3 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-rose-500/50 resize-none"
            />
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-full text-xs font-bold text-neutral-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all"
            >
              Confirm Rejection
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Static seed data ───────────────────────────────── */
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const TIME_SLOTS = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00',
];

const INITIAL_VENUES = [];

/* Generate default slots: ALL OPEN / AVAILABLE for new venues/games */
export function generateSlots(defaultStatus = 'available') {
  const slots = {};
  DAYS.forEach(day => {
    slots[day] = {};
    TIME_SLOTS.forEach(time => {
      slots[day][time] = defaultStatus;
    });
  });
  return slots;
}

const SPORT_COLORS = {
  Football: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  Basketball: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  Pickleball: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  Badminton: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20',
  'Table Tennis': 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  Cricket: 'text-lime-400 bg-lime-500/10 border-lime-500/20',
};

/* ─── Add Venue Modal ────────────────────────────────── */
function AddVenueModal({ onClose, onAdd, venue = null }) {
  const { toast } = useToast();
  const getInitialCoords = () => {
    if (venue?.latitude && venue?.longitude) {
      const lat = parseFloat(venue.latitude);
      const lng = parseFloat(venue.longitude);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
    if (venue?.lat && venue?.lng) {
      const lat = parseFloat(venue.lat);
      const lng = parseFloat(venue.lng);
      if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
    }
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
    return { lat: 13.0827, lng: 80.2707 };
  };

  const initialCoords = getInitialCoords();
  const [isGpsLocked, setIsGpsLocked] = useState(Boolean(venue));
  const [form, setForm] = useState({
    name: venue?.name || '',
    location: venue?.location || venue?.address || '',
    latitude: (venue?.latitude || venue?.lat || initialCoords.lat).toString(),
    longitude: (venue?.longitude || venue?.lng || initialCoords.lng).toString(),
    sports: Array.isArray(venue?.sports) && venue.sports.length > 0 ? venue.sports : (venue?.sport ? [venue.sport] : []),
    pricePerHour: (venue?.pricePerHour || venue?.price_per_hr || '').toString(),
    phone: venue?.phone || '',
    description: venue?.description || '',
    image: venue?.image || venue?.image_url || '',
    fitMode: venue?.fitMode || 'cover',
    booking_mode: venue?.booking_mode || (venue?.requires_approval ? 'request' : 'direct'),
    opening_time: venue?.opening_time || '06:00',
    closing_time: venue?.closing_time || '23:00',
    operating_hours: venue?.operating_hours || venue?.time || '06:00 AM - 11:00 PM',
    is_open_24_hours: Boolean(venue?.is_open_24_hours && (venue?.operating_hours === '24 Hours' || venue?.time === '24 Hours'))
  });
  const [sportInput, setSportInput] = useState('');
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [locationFeedback, setLocationFeedback] = useState('⚡ Auto-Calculated');
  const [pickedCoords, setPickedCoords] = useState(initialCoords);
  const [mapPickedAddress, setMapPickedAddress] = useState('');
  const [isGeocodingAddress, setIsGeocodingAddress] = useState(false);

  const handleLocalFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressDataUrlOrFile(file, 1000, 0.75);
      setForm(f => ({ ...f, image: compressed }));
    } catch {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result;
        if (dataUrl) {
          setForm(f => ({ ...f, image: dataUrl }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  });

  const toggleSport = (s) => setForm(f => ({
    ...f, sports: f.sports.includes(s) ? f.sports.filter(x => x !== s) : [...f.sports, s]
  }));

  const AVAILABLE_SPORTS = ['Football','Badminton','Table Tennis','Basketball','Cricket','Bowling','Pickleball'];

  /* Automatic Geocoding when Address changes */
  const handleAddressChange = (addressValue) => {
    setForm(prev => ({ ...prev, location: addressValue }));

    // If the owner has locked exact GPS satellite coordinates or picked map pin, DO NOT overwrite with geocode centroid!
    if (isGpsLocked) {
      return;
    }
    if (!addressValue || addressValue.trim().length < 3) return;

    setIsGeocodingAddress(true);
    setLocationFeedback('Calculating coordinates...');

    // Debounce geocode fetch
    if (window._geocodeTimer) clearTimeout(window._geocodeTimer);
    window._geocodeTimer = setTimeout(async () => {
      try {
        const cleanVal = addressValue.trim();
        // Search geocoding strictly in English
        const queryWithContext = `${cleanVal}, Chennai, Tamil Nadu, India`;
        let data = await fetchEnglishSearchGeocode(queryWithContext);
        if (!data || data.length === 0) {
          data = await fetchEnglishSearchGeocode(cleanVal);
        }

        if (data && data.length > 0) {
          let lat = parseFloat(parseFloat(data[0].lat).toFixed(6));
          let lng = parseFloat(parseFloat(data[0].lon).toFixed(6));
          // Sanity check: ensure coordinates are valid
          if (!isNaN(lat) && !isNaN(lng) && lat >= 8 && lat <= 36 && lng >= 68 && lng <= 97) {
            setForm(prev => ({ ...prev, latitude: lat.toString(), longitude: lng.toString() }));
            setPickedCoords({ lat, lng });
            setLocationFeedback(`✓ Coordinates auto-calculated (${lat}°, ${lng}°)`);
          }
        }
      } catch (e) {
        console.warn('Address geocode error:', e);
      } finally {
        setIsGeocodingAddress(false);
      }
    }, 800);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser.");
      return;
    }
    if (window._geocodeTimer) {
      clearTimeout(window._geocodeTimer);
      window._geocodeTimer = null;
    }
    setIsDetectingGps(true);
    setLocationFeedback('Acquiring high-precision GPS...');

    const onGpsSuccess = async (pos) => {
      const lat = parseFloat(pos.coords.latitude.toFixed(6));
      const lng = parseFloat(pos.coords.longitude.toFixed(6));

      // Persist to shared localStorage so Discovery and other profiles immediately use the exact coordinates
      try {
        localStorage.setItem('turfington_last_known_gps', JSON.stringify({ lat, lng, timestamp: Date.now() }));
        window.dispatchEvent(new CustomEvent('turfington_gps_updated', { detail: { lat, lng } }));
      } catch {}

      setPickedCoords({ lat, lng });
      setForm(prev => ({
        ...prev,
        latitude: lat.toString(),
        longitude: lng.toString()
      }));
      setIsGpsLocked(true);
      setIsDetectingGps(false);
      setLocationFeedback(`✓ Exact GPS coordinates locked (${lat}°, ${lng}°)`);

      // Reverse geocode in English for human-readable textual location without altering coordinates
      try {
        const geo = await fetchEnglishReverseGeocode(lat, lng, 14);
        const resolvedAddr = geo.fullAddress || `${geo.city}, Tamil Nadu`;
        setForm(prev => ({ ...prev, location: resolvedAddr }));
      } catch (e) {
        console.warn('Reverse geocode warning:', e);
        setForm(prev => ({ ...prev, location: prev.location || `${lat}, ${lng}` }));
      }
    };

    const onGpsError = (err) => {
      console.warn('High-accuracy GPS failed or timed out, trying standard accuracy...', err);
      navigator.geolocation.getCurrentPosition(
        onGpsSuccess,
        (err2) => {
          console.error('GPS error:', err2);
          setIsDetectingGps(false);
          toast.warning("Unable to fetch exact GPS location. Please check browser permissions or choose from Map.");
          setLocationFeedback('⚠ GPS detection failed. Choose from Map');
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
      );
    };

    navigator.geolocation.getCurrentPosition(onGpsSuccess, onGpsError, {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 0
    });
  };

  const handleReverseGeocodePicked = async (lat, lng) => {
    try {
      const geo = await fetchEnglishReverseGeocode(lat, lng, 14);
      setMapPickedAddress(geo.fullAddress || `${geo.city}, Tamil Nadu`);
    } catch {
      setMapPickedAddress('Chennai, Tamil Nadu');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    let finalLat = parseFloat(form.latitude) || pickedCoords.lat || 13.0827;
    let finalLng = parseFloat(form.longitude) || pickedCoords.lng || 80.2707;
    if (isNaN(finalLat) || isNaN(finalLng) || finalLat < 8 || finalLat > 36 || finalLng < 68 || finalLng > 97) {
      finalLat = 13.0827;
      finalLng = 80.2707;
    }

    const resolvedOperatingHours = form.operating_hours || (form.is_open_24_hours ? '24 Hours' : (form.opening_time && form.closing_time ? `${formatTime12Hour(form.opening_time)} - ${formatTime12Hour(form.closing_time)}` : '06:00 AM - 11:00 PM'));

    const newVenue = {
      ...(venue || {}),
      id: venue?.id || Date.now(),
      ...form,
      latitude: finalLat,
      longitude: finalLng,
      lat: finalLat,
      lng: finalLng,
      pricePerHour: parseInt(form.pricePerHour) || 0,
      price_per_hr: parseInt(form.pricePerHour) || 0,
      booking_mode: form.booking_mode || 'direct',
      booking_type: form.booking_mode || 'direct',
      requires_approval: form.booking_mode === 'request',
      rating: venue?.rating || 5.0,
      totalSlots: venue?.totalSlots || 12,
      bookedToday: venue?.bookedToday || 0,
      revenue: venue?.revenue || { week: 0, month: 0 },
      slots: venue?.slots || generateSlots(),
      active: venue ? venue.active : true,
      operating_hours: resolvedOperatingHours,
      time: resolvedOperatingHours,
      opening_time: form.opening_time || '06:00',
      closing_time: form.closing_time || '23:00',
      is_open_24_hours: Boolean(form.is_open_24_hours)
    };
    onAdd(newVenue);
    onClose();
  };

  const inputClass = "w-full bg-[#131722] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-violet-500/50 transition-colors";
  const labelClass = "text-[10px] text-neutral-400 uppercase tracking-widest font-bold mb-1.5 block";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 overflow-y-auto">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.95 }} exit={{ opacity: 0 }}
        onClick={onClose} style={{ backgroundColor: 'rgba(0, 0, 0, 0.92)' }} className="fixed inset-0 bg-black/95 backdrop-blur-xl" />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        style={{ backgroundColor: '#0b0e17', opacity: 1 }}
        className="relative bg-[#0b0e17] w-full max-w-[580px] border border-white/15 rounded-3xl shadow-2xl shadow-black z-10 text-left mb-8 overflow-hidden">

        <div style={{ backgroundColor: '#0e121d' }} className="p-6 border-b border-white/10 flex items-center justify-between">
          <div>
            <h3 className="font-display font-black text-white text-lg uppercase tracking-tight">
              {venue ? 'Edit Turf / Venue Listing' : 'Add New Turf / Venue'}
            </h3>
            <p className="text-[10px] text-neutral-400 mt-0.5">
              {venue ? 'Update facility info, pricing, approval mode, or turf pictures' : 'List your sports facility on Turfington with automatic GPS location calculation'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-white/5 border border-white/10 text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className={labelClass}>Turf Name</label>
            <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required
              placeholder="e.g. Arena Football Turf" className={inputClass} />
          </div>

          {/* Location Picker Options */}
          <div className="space-y-3.5 p-4 bg-[#131722] border border-white/10 rounded-2xl">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Venue Location & GPS Auto-Calculation</label>
              {locationFeedback && (
                <span className="text-[10px] text-emerald-400 font-extrabold flex items-center gap-1">
                  {locationFeedback}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={isDetectingGps}
                onClick={handleUseCurrentLocation}
                className="py-3 px-3 bg-violet-600/20 hover:bg-violet-600/30 border border-violet-500/40 text-violet-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-sm active:scale-95"
              >
                {isDetectingGps ? (
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                ) : (
                  <>
                    <Navigation className="w-4 h-4 text-violet-400" />
                    <span>Use Current Location</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowMapPicker(true)}
                className="py-3 px-3 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-sm active:scale-95"
              >
                <Compass className="w-4 h-4 text-indigo-400" />
                <span>Choose from Map</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className={labelClass}>Address / Area Name</label>
                <div className="relative">
                  <input 
                    value={form.location} 
                    onChange={e => handleAddressChange(e.target.value)} 
                    required
                    placeholder="e.g. Anna Nagar, Chennai" 
                    className={inputClass} 
                  />
                  {isGeocodingAddress && (
                    <div className="absolute right-3 top-3">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className={labelClass}>Price / Hour (₹)</label>
                <input 
                  type="number" 
                  value={form.pricePerHour} 
                  onChange={e => setForm({...form, pricePerHour: e.target.value})} 
                  required
                  placeholder="e.g. 1200" 
                  className={inputClass} 
                />
              </div>
            </div>

            {/* Auto-Calculated Coordinates Badge Display (No Manual Typing Required) */}
            <div className="p-3.5 bg-violet-950/20 border border-violet-500/20 rounded-xl flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-neutral-400 font-extrabold uppercase tracking-wider">
                      {isGpsLocked ? 'Locked GPS Coordinates' : 'Calculated GPS Coordinates'}
                    </span>
                    {isGpsLocked ? (
                      <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 rounded flex items-center gap-1">
                        🔒 Exact GPS Locked
                      </span>
                    ) : (
                      <span className="text-[9px] text-emerald-400 font-bold bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.2 rounded">
                        Auto-Set
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-white font-mono font-bold mt-0.5 block">
                    {form.latitude && form.longitude
                      ? `${form.latitude}° N, ${form.longitude}° E`
                      : `${pickedCoords.lat}° N, ${pickedCoords.lng}° E`}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {isGpsLocked && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsGpsLocked(false);
                      setLocationFeedback('GPS unlocked - will update if address changes');
                    }}
                    className="text-[10px] font-bold text-neutral-400 hover:text-white underline uppercase tracking-wider"
                  >
                    Unlock
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowMapPicker(true)}
                  className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 underline uppercase tracking-wider"
                >
                  Adjust Pin
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Sports Available</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {AVAILABLE_SPORTS.map(s => (
                <button type="button" key={s} onClick={() => toggleSport(s)}
                  className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded-full border transition-all ${
                    form.sports.includes(s) ? 'bg-violet-600 border-violet-500 text-white' : 'bg-white/5 border-white/10 text-neutral-400 hover:border-white/20'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Contact Phone</label>
            <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}
              placeholder="+91 98765 43210" className={inputClass} />
          </div>

          {/* Operating Hours & Timing */}
          <div className="space-y-3 p-4 bg-[#131722] border border-white/10 rounded-2xl">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Operating Hours & Timings</label>
              <span className="text-[10px] text-indigo-400 font-extrabold flex items-center gap-1">
                <Clock className="w-3 h-3 text-indigo-400" />
                {form.operating_hours || '06:00 AM - 11:00 PM'}
              </span>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              {[
                { label: '06:00 AM - 11:00 PM', open: '06:00', close: '23:00', is24: false },
                { label: '05:00 AM - 12:00 AM', open: '05:00', close: '00:00', is24: false },
                { label: '07:00 AM - 10:00 PM', open: '07:00', close: '22:00', is24: false },
                { label: '24 Hours Open', open: '00:00', close: '23:59', is24: true }
              ].map(preset => {
                const isSelected = form.operating_hours === preset.label || (preset.is24 && form.is_open_24_hours);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        operating_hours: preset.label,
                        opening_time: preset.open,
                        closing_time: preset.close,
                        is_open_24_hours: preset.is24
                      }));
                    }}
                    className={`text-[10px] font-bold px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-500 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white hover:border-white/20'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Custom opening / closing time picker */}
            {!form.is_open_24_hours && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-white/5">
                <div>
                  <span className="text-[10px] text-neutral-400 font-medium block mb-1">Opens At</span>
                  <input
                    type="time"
                    value={form.opening_time || '06:00'}
                    onChange={(e) => {
                      const newOpen = e.target.value;
                      const formatted = `${formatTime12Hour(newOpen)} - ${formatTime12Hour(form.closing_time || '23:00')}`;
                      setForm(f => ({ ...f, opening_time: newOpen, operating_hours: formatted, is_open_24_hours: false }));
                    }}
                    className="w-full bg-[#0e121d] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-neutral-400 font-medium block mb-1">Closes At</span>
                  <input
                    type="time"
                    value={form.closing_time || '23:00'}
                    onChange={(e) => {
                      const newClose = e.target.value;
                      const formatted = `${formatTime12Hour(form.opening_time || '06:00')} - ${formatTime12Hour(newClose)}`;
                      setForm(f => ({ ...f, closing_time: newClose, operating_hours: formatted, is_open_24_hours: false }));
                    }}
                    className="w-full bg-[#0e121d] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Venue Image Upload & Alignment controls */}
          <div className="space-y-3 p-4 bg-[#131722] border border-white/10 rounded-2xl">
            <label className={labelClass}>Venue Image (Choose Local File)</label>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <label className="w-full py-3 px-4 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-sm">
                <Camera className="w-4 h-4 text-indigo-400" />
                <span>Upload / Choose Local Image File</span>
                <input 
                  type="file" 
                  accept="image/*" 
                  onChange={handleLocalFileUpload} 
                  className="hidden" 
                />
              </label>
            </div>

            {/* Image Fit & Alignment Selector */}
            {form.image && (
              <div className="space-y-2 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-neutral-400 font-bold uppercase">Image Alignment & Fit Mode</span>
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, fitMode: 'cover' }))}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                        form.fitMode === 'cover' ? 'bg-indigo-600 text-white font-extrabold' : 'bg-white/5 text-neutral-400 hover:text-white'
                      }`}
                    >
                      🖼 Cover / Center
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm(f => ({ ...f, fitMode: 'contain' }))}
                      className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase transition-all ${
                        form.fitMode === 'contain' ? 'bg-indigo-600 text-white font-extrabold' : 'bg-white/5 text-neutral-400 hover:text-white'
                      }`}
                    >
                      🔍 Fit Full Image
                    </button>
                  </div>
                </div>

                {/* Live Preview */}
                <div className="relative w-full h-36 rounded-xl overflow-hidden border border-white/10 bg-neutral-950">
                  <VenueImage 
                    src={form.image} 
                    alt="Preview" 
                    fitMode={form.fitMode} 
                    className="w-full h-full" 
                  />
                  <div className="absolute top-2 right-2 bg-black/70 backdrop-blur-md text-white text-[9px] font-extrabold px-2.5 py-0.5 rounded-full border border-white/10">
                    Live Preview ({form.fitMode === 'contain' ? 'Full Image Fit' : 'Centered Crop'})
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Booking Approval Type Selector */}
          <div className="space-y-3 p-4 bg-[#131722] border border-white/10 rounded-2xl">
            <div className="flex items-center justify-between">
              <label className={labelClass}>Booking Approval Type</label>
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                form.booking_mode === 'request'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              }`}>
                {form.booking_mode === 'request' ? '📩 Owner Approval Required' : '⚡ Direct Instant Booking'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, booking_mode: 'direct' }))}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  form.booking_mode === 'direct'
                    ? 'bg-emerald-500/15 border-emerald-500/60 shadow-lg shadow-emerald-500/10'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-black text-white flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-emerald-400" />
                    Direct Booking
                  </span>
                  {form.booking_mode === 'direct' && (
                    <CheckCircle className="w-4 h-4 text-emerald-400" />
                  )}
                </div>
                <p className="text-[10px] text-neutral-400 leading-relaxed">
                  Players can instantly reserve and confirm available slots without waiting for approval.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, booking_mode: 'request' }))}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  form.booking_mode === 'request'
                    ? 'bg-amber-500/15 border-amber-500/60 shadow-lg shadow-amber-500/10'
                    : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-black text-white flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Request to Owner
                  </span>
                  {form.booking_mode === 'request' && (
                    <CheckCircle className="w-4 h-4 text-amber-400" />
                  )}
                </div>
                <p className="text-[10px] text-neutral-400 leading-relaxed">
                  Players submit booking requests. You approve or reject before the slot is booked.
                </p>
              </button>
            </div>
          </div>

          <div>
            <label className={labelClass}>Description</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
              rows={3} placeholder="Describe your facilities, amenities, parking, etc." className={`${inputClass} resize-none`} />
          </div>

          <button type="submit"
            className="w-full py-4 bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-full transition-colors flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-violet-600/30">
            {venue ? <CheckCircle className="w-4 h-4" /> : <Building2 className="w-4 h-4" />}
            <span>{venue ? 'Update Venue Details' : 'Save Turf Location'}</span>
          </button>
        </form>
      </motion.div>

      {/* ── Choose from Map Picker Modal ─────────────────── */}
      <AnimatePresence>
        {showMapPicker && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} exit={{ opacity: 0 }}
              onClick={() => setShowMapPicker(false)} className="absolute inset-0 bg-black/85 backdrop-blur-md" />
            
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-[#121215] border border-white/12 rounded-3xl max-w-2xl w-full p-6 shadow-2xl z-10 text-left space-y-4">
              
              <div className="flex items-center justify-between border-b border-white/8 pb-3">
                <div>
                  <h3 className="font-display font-black text-white text-base flex items-center gap-2">
                    <Compass className="w-5 h-5 text-indigo-400" />
                    <span>Choose Venue Location from Map</span>
                  </h3>
                  <p className="text-xs text-neutral-400 mt-0.5">Click anywhere on the map to drop your venue pin & capture exact coordinates</p>
                </div>
                <button type="button" onClick={() => setShowMapPicker(false)} className="p-2 rounded-full bg-white/5 text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Map Canvas */}
              <div className="w-full h-72 rounded-2xl overflow-hidden border border-white/10 relative bg-neutral-900">
                {isLoaded ? (
                  <GoogleMap
                    mapContainerStyle={{ width: '100%', height: '100%' }}
                    center={pickedCoords.lat ? pickedCoords : { lat: 13.0827, lng: 80.2707 }}
                    zoom={13}
                    onClick={(e) => {
                      if (e.latLng) {
                        const lat = parseFloat(e.latLng.lat().toFixed(6));
                        const lng = parseFloat(e.latLng.lng().toFixed(6));
                        setPickedCoords({ lat, lng });
                        handleReverseGeocodePicked(lat, lng);
                      }
                    }}
                  >
                    {pickedCoords.lat && pickedCoords.lng && (
                      <Marker position={pickedCoords} title="Selected Venue Location" />
                    )}
                  </GoogleMap>
                ) : (
                  <div 
                    onClick={(e) => {
                      const rect = e.currentTarget.getBoundingClientRect();
                      const clickX = e.clientX - rect.left;
                      const clickY = e.clientY - rect.top;
                      const lat = parseFloat((13.0827 + (0.5 - clickY / rect.height) * 0.1).toFixed(6));
                      const lng = parseFloat((80.2707 + (clickX / rect.width - 0.5) * 0.1).toFixed(6));
                      setPickedCoords({ lat, lng });
                      handleReverseGeocodePicked(lat, lng);
                    }}
                    className="w-full h-full bg-gradient-to-br from-neutral-950 via-[#101322] to-neutral-900 relative cursor-crosshair flex flex-col items-center justify-center p-4 border border-indigo-500/20 select-none"
                  >
                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px]" />
                    
                    {pickedCoords.lat ? (
                      <div className="relative z-10 flex flex-col items-center space-y-1 text-center">
                        <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shadow-[0_0_20px_rgba(99,102,241,0.6)] animate-bounce">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-bold text-white bg-black/80 px-3 py-1 rounded-full border border-white/10">
                          Pinned: {pickedCoords.lat}°, {pickedCoords.lng}°
                        </span>
                      </div>
                    ) : (
                      <div className="relative z-10 text-center space-y-2">
                        <MapPin className="w-8 h-8 text-indigo-400 mx-auto animate-pulse" />
                        <p className="text-xs font-bold text-white">Click anywhere on this map canvas to set pin</p>
                        <p className="text-[10px] text-neutral-400">Generates latitude & longitude automatically</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Selection Summary & Confirm Button */}
              <div className="p-3.5 bg-white/[0.03] border border-white/8 rounded-2xl flex items-center justify-between text-xs">
                <div>
                  <span className="text-neutral-400 font-medium">Selected Coordinates:</span>
                  <p className="text-white font-mono font-bold mt-0.5">
                    {pickedCoords.lat ? `${pickedCoords.lat}° N, ${pickedCoords.lng}° E` : 'No location clicked yet'}
                  </p>
                  {mapPickedAddress && (
                    <p className="text-[10px] text-indigo-400 font-medium mt-0.5">{mapPickedAddress}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={!pickedCoords.lat}
                  onClick={() => {
                    setForm(prev => ({
                      ...prev,
                      latitude: pickedCoords.lat.toString(),
                      longitude: pickedCoords.lng.toString(),
                      location: sanitizeLocationToEnglish(mapPickedAddress || prev.location || 'Anna Nagar, Chennai')
                    }));
                    setIsGpsLocked(true);
                    setShowMapPicker(false);
                    setLocationFeedback(`✓ Map location set: ${pickedCoords.lat}°, ${pickedCoords.lng}°`);
                  }}
                  className="py-2.5 px-5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-lg cursor-pointer"
                >
                  Confirm Location
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Slot Grid ──────────────────────────────────────── */
function SlotGrid({ venue, onUpdateSlot, onBatchUpdateSlots }) {
  const { toast } = useToast();
  const [selectedDay, setSelectedDay] = useState('Everyday'); // 'Everyday' | 'Mon' | 'Tue' | ...
  const [timeFilter, setTimeFilter] = useState('all'); // 'all' | 'morning' | 'afternoon' | 'night'
  const [selectedSlotModal, setSelectedSlotModal] = useState(null);

  // Shop / Turf Operating Hours Quick Setup (default 11:00 AM to 09:00 PM)
  const [openHourStart, setOpenHourStart] = useState('11:00');
  const [openHourEnd, setOpenHourEnd] = useState('21:00');

  const ALL_DAY_TABS = ['Everyday', ...DAYS];

  const getSlotStatus = (time) => {
    if (selectedDay === 'Everyday') {
      const statuses = DAYS.map(d => venue.slots?.[d]?.[time] || 'available');
      if (statuses.every(s => s === statuses[0])) {
        return statuses[0];
      }
      return venue.slots?.['Mon']?.[time] || 'available';
    }
    return venue.slots?.[selectedDay]?.[time] || 'available';
  };

  const toggleSlot = (time) => {
    const current = getSlotStatus(time);
    let next = 'available';
    if (current === 'available' || current === 'open') {
      next = 'blocked';
    } else if (current === 'blocked') {
      next = 'booked';
    } else {
      next = 'available';
    }

    if (selectedDay === 'Everyday') {
      if (typeof onBatchUpdateSlots === 'function') {
        const newSlots = { ...(venue.slots || {}) };
        DAYS.forEach(d => {
          newSlots[d] = { ...(newSlots[d] || {}), [time]: next };
        });
        onBatchUpdateSlots(venue.id, newSlots);
      } else {
        DAYS.forEach(d => {
          onUpdateSlot(venue.id, d, time, next);
        });
      }
    } else {
      onUpdateSlot(venue.id, selectedDay, time, next);
    }
  };

  const handleSetAllStatus = (status) => {
    if (selectedDay === 'Everyday') {
      if (typeof onBatchUpdateSlots === 'function') {
        const newSlots = { ...(venue.slots || {}) };
        DAYS.forEach(d => {
          newSlots[d] = { ...(newSlots[d] || {}), ...(newSlots[d] || {}) };
          TIME_SLOTS.forEach(time => {
            newSlots[d][time] = status;
          });
        });
        onBatchUpdateSlots(venue.id, newSlots);
      } else {
        DAYS.forEach(d => {
          TIME_SLOTS.forEach(time => {
            onUpdateSlot(venue.id, d, time, status);
          });
        });
      }
    } else {
      TIME_SLOTS.forEach(time => {
        onUpdateSlot(venue.id, selectedDay, time, status);
      });
    }
  };

  const handleApplyOperatingHours = () => {
    const startHour = parseInt(openHourStart.split(':')[0], 10);
    const endHour = parseInt(openHourEnd.split(':')[0], 10);

    const targetDays = selectedDay === 'Everyday' ? DAYS : [selectedDay];
    const newSlots = { ...(venue.slots || {}) };

    targetDays.forEach(d => {
      newSlots[d] = { ...(newSlots[d] || {}) };
      TIME_SLOTS.forEach(t => {
        const h = parseInt(t.split(':')[0], 10);
        // E.g. 11am to 9pm (11:00 to 21:00): slots 11:00 through 20:00 (closing at 21:00)
        const isWithin = startHour < endHour 
          ? (h >= startHour && h < endHour) 
          : (h >= startHour || h < endHour);
        newSlots[d][t] = isWithin ? 'available' : 'blocked';
      });
    });

    if (typeof onBatchUpdateSlots === 'function') {
      onBatchUpdateSlots(venue.id, newSlots);
    } else {
      targetDays.forEach(d => {
        TIME_SLOTS.forEach(t => {
          onUpdateSlot(venue.id, d, t, newSlots[d][t]);
        });
      });
    }

    toast.success(`✓ Operating hours (${formatTime12Hour(openHourStart)} – ${formatTime12Hour(openHourEnd)}) applied to ${selectedDay === 'Everyday' ? 'Everyday (All 7 Days)' : selectedDay}!`);
  };

  const filteredSlots = TIME_SLOTS.filter(t => {
    const hour = parseInt(t.split(':')[0], 10);
    if (timeFilter === 'morning') return hour >= 6 && hour < 12;
    if (timeFilter === 'afternoon') return hour >= 12 && hour < 18;
    if (timeFilter === 'night') return hour >= 18 || hour < 6;
    return true; // 'all'
  });

  const slotColor = (status) => {
    if (status === 'booked') return 'bg-rose-950/60 border-rose-500/30 text-rose-400';
    if (status === 'blocked') return 'bg-amber-950/60 border-amber-500/30 text-amber-400';
    return 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400';
  };

  const slotLabel = (status) => {
    if (status === 'booked') return 'BOOKED';
    if (status === 'blocked') return 'BLOCKED';
    return 'OPEN';
  };

  return (
    <div className="space-y-4">
      {/* Day selector & Batch Action Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-1">
          {ALL_DAY_TABS.map(d => (
            <button key={d} onClick={() => setSelectedDay(d)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-mono font-extrabold uppercase tracking-wider transition-all border cursor-pointer ${
                selectedDay === d ? 'bg-white text-black border-transparent shadow-md font-black' : 'bg-white/5 border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
              }`}>
              {d === 'Everyday' ? 'Everyday' : d}
            </button>
          ))}
        </div>

        {/* Batch Status Controls */}
        <div className="flex items-center space-x-1.5 self-start sm:self-auto flex-wrap gap-1">
          <button
            type="button"
            onClick={() => handleSetAllStatus('available')}
            className="text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 transition-all cursor-pointer"
          >
            ✓ All OPEN {selectedDay === 'Everyday' ? '(All Days)' : ''}
          </button>
          <button
            type="button"
            onClick={() => handleSetAllStatus('blocked')}
            className="text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 transition-all cursor-pointer"
          >
            🚫 Block All {selectedDay === 'Everyday' ? '(All Days)' : ''}
          </button>
          <button
            type="button"
            onClick={() => handleSetAllStatus('booked')}
            className="text-[10px] font-extrabold uppercase px-3 py-1.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 transition-all cursor-pointer"
          >
            📌 Book All {selectedDay === 'Everyday' ? '(All Days)' : ''}
          </button>
        </div>
      </div>

      {/* Everyday Mode Indicator Banner */}
      {selectedDay === 'Everyday' && (
        <div className="flex items-center justify-between p-3 bg-violet-950/30 border border-violet-500/30 rounded-2xl text-xs">
          <div className="flex items-center space-x-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-400 animate-pulse" />
            <span className="font-extrabold text-white text-[11px] uppercase tracking-wider">Everyday Mode Active:</span>
            <span className="text-neutral-300 text-[11px]">Any slot changed or hours set here will automatically be applied to every day (Mon – Sun).</span>
          </div>
        </div>
      )}

      {/* Operating Hours Quick Setup Bar */}
      <div className="p-3.5 bg-gradient-to-r from-violet-950/40 to-indigo-950/30 border border-violet-500/25 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-300 border border-violet-500/30 flex items-center justify-center shrink-0">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <p className="font-bold text-white text-xs flex items-center gap-1.5">
              <span>Operating Hours Preset</span>
              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                {selectedDay === 'Everyday' ? 'Everyday (Mon – Sun)' : selectedDay}
              </span>
            </p>
            <p className="text-[10px] text-neutral-400 mt-0.5">
              Select shop / turf open timings (e.g. 11am to 9pm). Slots inside will stay OPEN; slots outside will be BLOCKED.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center space-x-1.5 bg-black/60 border border-white/10 rounded-xl px-2.5 py-1.5">
            <span className="text-[10px] text-neutral-400 font-mono font-bold uppercase">From</span>
            <select
              value={openHourStart}
              onChange={(e) => setOpenHourStart(e.target.value)}
              className="bg-transparent text-white font-mono text-xs font-bold outline-none cursor-pointer"
            >
              {TIME_SLOTS.map(t => (
                <option key={t} value={t} className="bg-neutral-900 text-white font-mono">
                  {formatTime12Hour(t)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center space-x-1.5 bg-black/60 border border-white/10 rounded-xl px-2.5 py-1.5">
            <span className="text-[10px] text-neutral-400 font-mono font-bold uppercase">To</span>
            <select
              value={openHourEnd}
              onChange={(e) => setOpenHourEnd(e.target.value)}
              className="bg-transparent text-white font-mono text-xs font-bold outline-none cursor-pointer"
            >
              {TIME_SLOTS.map(t => (
                <option key={t} value={t} className="bg-neutral-900 text-white font-mono">
                  {formatTime12Hour(t)}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleApplyOperatingHours}
            className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-[11px] uppercase tracking-wider transition-all shadow-lg shadow-violet-600/30 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            Apply {selectedDay === 'Everyday' ? 'to Everyday' : `to ${selectedDay}`}
          </button>
        </div>
      </div>

      {/* 24-Hour Time Filter Bar & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[10px] font-bold border-t border-white/5 pt-3">
        <div className="flex items-center space-x-1.5 bg-black/40 p-1 rounded-full border border-white/8">
          {[
            { key: 'all', label: 'All 24 Hours' },
            { key: 'morning', label: 'Morning (06-12)' },
            { key: 'afternoon', label: 'Afternoon (12-18)' },
            { key: 'night', label: 'Night (18-06)' },
          ].map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setTimeFilter(f.key)}
              className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
                timeFilter === f.key ? 'bg-white text-black font-black' : 'text-neutral-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-4">
          <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> <span className="text-emerald-400">Open</span></span>
          <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> <span className="text-amber-400">Blocked</span></span>
          <span className="flex items-center space-x-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> <span className="text-rose-400">Booked</span></span>
          <span className="text-indigo-400 font-bold bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
            {selectedDay === 'Everyday' ? '⚡ Clicking a slot applies to Everyday' : '⚡ Tap slot to cycle status'}
          </span>
        </div>
      </div>

      {/* Time slots grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 pt-1">
        {filteredSlots.map(time => {
          const status = getSlotStatus(time);
          return (
            <div key={time} className="relative group">
              <button
                type="button"
                onClick={() => toggleSlot(time)}
                className={`w-full px-3 py-2.5 rounded-xl border text-[10px] font-bold text-center transition-all hover:scale-105 active:scale-95 cursor-pointer select-none ${slotColor(status)}`}
              >
                <div className="font-mono text-xs font-black mb-0.5">{formatTime12Hour(time)}</div>
                <div className="uppercase tracking-widest text-[9px] font-extrabold">{slotLabel(status)}</div>
              </button>
            </div>
          );
        })}
      </div>

      {/* Manual Slot Action Picker Modal */}
      <AnimatePresence>
        {selectedSlotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedSlotModal(null)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative glass-card border border-white/10 rounded-3xl p-6 max-w-sm w-full z-10 text-left space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/8 pb-3">
                <div>
                  <h3 className="font-display font-black text-white text-base">Manage Slot Status</h3>
                  <p className="text-xs text-neutral-400 font-mono mt-0.5">
                    {selectedDay === 'Everyday' ? 'Everyday (All 7 Days)' : selectedDay}, {formatTime12Hour(selectedSlotModal.time)} • {venue.name}
                  </p>
                </div>
                <button type="button" onClick={() => setSelectedSlotModal(null)} className="p-1.5 rounded-full bg-white/5 text-neutral-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">
                  Select Status {selectedDay === 'Everyday' ? '(Applies to Everyday)' : ''}
                </p>
                
                {/* Option 1: Set OPEN */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDay === 'Everyday') {
                      if (typeof onBatchUpdateSlots === 'function') {
                        const newSlots = { ...(venue.slots || {}) };
                        DAYS.forEach(d => {
                          newSlots[d] = { ...(newSlots[d] || {}), [selectedSlotModal.time]: 'available' };
                        });
                        onBatchUpdateSlots(venue.id, newSlots);
                      } else {
                        DAYS.forEach(d => onUpdateSlot(venue.id, d, selectedSlotModal.time, 'available'));
                      }
                    } else {
                      onUpdateSlot(venue.id, selectedDay, selectedSlotModal.time, 'available');
                    }
                    setSelectedSlotModal(null);
                  }}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    selectedSlotModal.currentStatus === 'available'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold ring-1 ring-emerald-400/40'
                      : 'bg-emerald-950/30 border-emerald-500/20 text-neutral-300 hover:border-emerald-400'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                      <span>OPEN (Available Online)</span>
                    </p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Players can discover and book this slot online</p>
                  </div>
                  {selectedSlotModal.currentStatus === 'available' && <Check className="w-4 h-4 text-emerald-400" />}
                </button>

                {/* Option 2: Set BLOCKED */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDay === 'Everyday') {
                      if (typeof onBatchUpdateSlots === 'function') {
                        const newSlots = { ...(venue.slots || {}) };
                        DAYS.forEach(d => {
                          newSlots[d] = { ...(newSlots[d] || {}), [selectedSlotModal.time]: 'blocked' };
                        });
                        onBatchUpdateSlots(venue.id, newSlots);
                      } else {
                        DAYS.forEach(d => onUpdateSlot(venue.id, d, selectedSlotModal.time, 'blocked'));
                      }
                    } else {
                      onUpdateSlot(venue.id, selectedDay, selectedSlotModal.time, 'blocked');
                    }
                    setSelectedSlotModal(null);
                  }}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    selectedSlotModal.currentStatus === 'blocked'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold ring-1 ring-amber-400/40'
                      : 'bg-amber-950/30 border-amber-500/20 text-neutral-300 hover:border-amber-400'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                      <span>BLOCKED (Hidden from Players)</span>
                    </p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Hidden from online players (maintenance / private hold)</p>
                  </div>
                  {selectedSlotModal.currentStatus === 'blocked' && <Check className="w-4 h-4 text-amber-400" />}
                </button>

                {/* Option 3: Set BOOKED MANUALLY */}
                <button
                  type="button"
                  onClick={() => {
                    if (selectedDay === 'Everyday') {
                      if (typeof onBatchUpdateSlots === 'function') {
                        const newSlots = { ...(venue.slots || {}) };
                        DAYS.forEach(d => {
                          newSlots[d] = { ...(newSlots[d] || {}), [selectedSlotModal.time]: 'booked' };
                        });
                        onBatchUpdateSlots(venue.id, newSlots);
                      } else {
                        DAYS.forEach(d => onUpdateSlot(venue.id, d, selectedSlotModal.time, 'booked'));
                      }
                    } else {
                      onUpdateSlot(venue.id, selectedDay, selectedSlotModal.time, 'booked');
                    }
                    setSelectedSlotModal(null);
                  }}
                  className={`w-full p-3 rounded-2xl border text-left flex items-center justify-between transition-all cursor-pointer ${
                    selectedSlotModal.currentStatus === 'booked'
                      ? 'bg-rose-500/20 border-rose-400 text-rose-300 font-bold ring-1 ring-rose-400/40'
                      : 'bg-rose-950/30 border-rose-500/20 text-neutral-300 hover:border-rose-400'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-400"></span>
                      <span>BOOKED MANUALLY (Offline / Phone)</span>
                    </p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">Marked as booked manually for offline player reservations</p>
                  </div>
                  {selectedSlotModal.currentStatus === 'booked' && <Check className="w-4 h-4 text-rose-400" />}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Manage Offers & Packages Modal ───────────────────── */
function ManageOffersModal({ venue, onClose, venueOffers, setVenueOffers }) {
  const [type, setType] = useState('booking'); // 'booking' | 'membership'
  const [title, setTitle] = useState('');
  const [discount, setDiscount] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [benefits, setBenefits] = useState('');

  const currentOffers = venueOffers.filter(o => o.venueId === venue.id);

  const handleAddOffer = (e) => {
    e.preventDefault();
    if (!title.trim()) return;

    const newOffer = {
      id: Date.now(),
      venueId: venue.id,
      type,
      title,
      description: type === 'booking' ? description : '',
      discount: type === 'booking' ? discount : '',
      price: type === 'membership' ? price : '',
      benefits: type === 'membership' ? benefits : ''
    };

    setVenueOffers(prev => [...prev, newOffer]);
    setTitle('');
    setDiscount('');
    setPrice('');
    setDescription('');
    setBenefits('');
  };

  const handleDeleteOffer = (offerId) => {
    setVenueOffers(prev => prev.filter(o => o.id !== offerId));
  };

  const inputClass = "w-full bg-white/[0.03] border border-white/8 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 focus:outline-none focus:border-violet-500/50 transition-colors";
  const labelClass = "text-[10px] text-neutral-400 uppercase tracking-widest font-bold mb-1.5 block";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose} className="absolute inset-0" />
      <motion.div initial={{ opacity: 0, scale: 0.96, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative glass-card w-full max-w-4xl border border-white/15 rounded-3xl shadow-2xl z-10 text-left overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div>
            <div className="flex items-center space-x-3">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-400 text-[10px] font-black uppercase tracking-wider border border-indigo-500/30">
                PROMOTIONS
              </span>
              <h3 className="font-display font-black text-white text-xl uppercase tracking-tight">Offers & Packages</h3>
            </div>
            <p className="text-xs text-neutral-400 mt-1">Configure discounts, flash deals, and monthly memberships for <span className="text-white font-bold">{venue.name}</span></p>
          </div>
          <button onClick={onClose} className="p-2.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body: Comfortable 2-Column Desktop Grid */}
        <div className="p-6 overflow-y-auto flex-grow space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Column 1: Active Listings (5 Cols) */}
            <div className="lg:col-span-5 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs text-neutral-300 uppercase tracking-widest font-black">
                  Active Listings ({currentOffers.length})
                </h4>
              </div>
              
              {currentOffers.length === 0 ? (
                <div className="p-8 text-center border border-dashed border-white/10 rounded-2xl bg-white/[0.01] space-y-2">
                  <p className="text-xs text-neutral-400 font-medium">No offers or packages yet</p>
                  <p className="text-[11px] text-neutral-500 font-light">Create a booking discount or membership pass on the right to start attracting more players.</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {currentOffers.map(offer => (
                    <div key={offer.id} className="p-4 bg-white/[0.03] hover:bg-white/[0.05] border border-white/10 hover:border-white/20 rounded-2xl transition-all shadow-sm group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-grow">
                          <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md border ${
                            offer.type === 'booking' 
                              ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300' 
                              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          }`}>
                            {offer.type === 'booking' ? '⚡ Booking Discount' : '👑 Monthly Pass'}
                          </span>
                          <h5 className="text-sm font-bold text-white mt-2 leading-snug">{offer.title}</h5>
                          <p className="text-xs text-neutral-400 mt-1 font-light leading-relaxed">
                            {offer.type === 'booking' 
                              ? <span className="font-semibold text-indigo-400">{offer.discount} off <span className="text-neutral-400 font-normal">· {offer.description}</span></span>
                              : <span className="font-semibold text-emerald-400">{offer.price} <span className="text-neutral-400 font-normal">· {offer.benefits}</span></span>
                            }
                          </p>
                        </div>
                        <button 
                          onClick={() => handleDeleteOffer(offer.id)}
                          className="p-2 rounded-xl bg-white/5 hover:bg-rose-500/20 text-neutral-500 hover:text-rose-400 border border-transparent hover:border-rose-500/30 transition-all flex-shrink-0 cursor-pointer"
                          title="Delete offer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Column 2: Create New Package Form (7 Cols) */}
            <div className="lg:col-span-7 bg-white/[0.02] border border-white/10 rounded-2xl p-6 space-y-5">
              <div className="border-b border-white/5 pb-3">
                <h4 className="text-xs text-white uppercase tracking-wider font-extrabold">
                  Create New Promotion
                </h4>
                <p className="text-[11px] text-neutral-500 mt-0.5 font-light">Set custom pricing, percentage discounts, or player memberships</p>
              </div>

              {/* Form */}
              <form onSubmit={handleAddOffer} className="space-y-4">
                <div className="flex bg-[#0d0d0d] border border-white/10 p-1 rounded-2xl text-xs font-bold w-full">
                  <button type="button" onClick={() => setType('booking')}
                    className={`flex-1 py-2.5 rounded-xl text-center transition-all cursor-pointer ${
                      type === 'booking' ? 'bg-indigo-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
                    }`}>
                    ⚡ Booking Discount
                  </button>
                  <button type="button" onClick={() => setType('membership')}
                    className={`flex-1 py-2.5 rounded-xl text-center transition-all cursor-pointer ${
                      type === 'membership' ? 'bg-indigo-600 text-white shadow-md' : 'text-neutral-400 hover:text-white'
                    }`}>
                    👑 Membership Pass
                  </button>
                </div>

                <div>
                  <label className={labelClass}>{type === 'booking' ? 'Offer Title' : 'Membership Pass Name'}</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} required
                    placeholder={type === 'booking' ? "e.g. 15% Weekday discount" : "e.g. Silver Pass"} className={inputClass} />
                </div>

                {type === 'booking' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Discount Amount / %</label>
                      <input value={discount} onChange={e => setDiscount(e.target.value)} required
                        placeholder="e.g. 15% or Flat ₹300" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Short Description</label>
                      <input value={description} onChange={e => setDescription(e.target.value)} required
                        placeholder="e.g. Monday-Thursday 5pm to 8pm" className={inputClass} />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>Price (per Month)</label>
                      <input value={price} onChange={e => setPrice(e.target.value)} required
                        placeholder="e.g. ₹4,999/mo" className={inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>Benefits Summary</label>
                      <input value={benefits} onChange={e => setBenefits(e.target.value)} required
                        placeholder="e.g. Includes 4 peak slots per month" className={inputClass} />
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  <button type="submit"
                    className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 cursor-pointer">
                    <Plus className="w-4 h-4 stroke-[3]" />
                    <span>Publish {type === 'booking' ? 'Booking Discount' : 'Membership Pass'}</span>
                  </button>
                </div>
              </form>
            </div>

          </div>
        </div>

      </motion.div>
    </div>
  );
}

/* ─── Venue Card ─────────────────────────────────────── */
function VenueCard({ venue, onToggleActive, onToggleBookingMode, onUpdateSlot, onBatchUpdateSlots, onDelete, onEdit, venueOffers, setVenueOffers }) {
  const [expanded, setExpanded] = useState(false);
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const occupancy = venue.totalSlots > 0 ? Math.round((venue.bookedToday / venue.totalSlots) * 100) : 0;

  return (
    <motion.div layout className="glass-card border border-white/5 overflow-hidden">
      {/* Card Header */}
      <div className="flex flex-col md:flex-row gap-5 p-5">
        <div className="w-full md:w-36 h-28 rounded-2xl overflow-hidden flex-shrink-0 relative">
          <VenueImage src={venue.image || venue.image_url} alt={venue.name} fitMode={venue.fitMode || 'cover'} className="w-full h-full" />
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <span className={`px-2 py-0.5 rounded-full text-[8px] font-extrabold uppercase border shadow-md backdrop-blur-md ${
              venue.booking_mode === 'request' || venue.requires_approval
                ? 'bg-amber-400 text-black border-amber-300'
                : 'bg-emerald-400 text-black border-emerald-300'
            }`}>
              {venue.booking_mode === 'request' || venue.requires_approval ? '📩 Request Mode' : '⚡ Direct Booking'}
            </span>
          </div>
          <div className={`absolute bottom-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
            venue.active ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-neutral-800 border-white/10 text-neutral-500'
          }`}>
            {venue.active ? 'Active' : 'Inactive'}
          </div>
        </div>

        <div className="flex-grow">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-display font-bold text-white text-lg">{venue.name}</h3>
              <p className="text-xs text-neutral-400 flex items-center mt-0.5">
                <MapPin className="w-3 h-3 mr-1 text-neutral-500" />{venue.location}
              </p>
            </div>
            <div className="flex items-center space-x-1.5 flex-shrink-0">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span className="text-sm font-bold text-white">{venue.rating || '—'}</span>
            </div>
          </div>

          {/* Sport tags */}
          <div className="flex flex-wrap gap-1.5 my-3">
            {venue.sports.map(s => (
              <span key={s} className={`text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded border ${SPORT_COLORS[s] || 'text-neutral-400 bg-white/5 border-white/10'}`}>
                {s}
              </span>
            ))}
          </div>

          {/* Stats row */}
          <div className="flex flex-wrap gap-5 text-xs">
            <div>
              <p className="text-neutral-500 text-[10px] uppercase font-bold">Price/Hr</p>
              <p className="text-white font-bold mt-0.5 flex items-center">
                <IndianRupee className="w-3 h-3 mr-0.5" />{venue.pricePerHour.toLocaleString('en-IN')}
              </p>
            </div>
            <div>
              <p className="text-neutral-500 text-[10px] uppercase font-bold">Operating Hours</p>
              <p className="text-indigo-400 font-bold mt-0.5 flex items-center">
                <Clock className="w-3 h-3 mr-0.5" />{venue.operating_hours || venue.time || '06:00 AM - 11:00 PM'}
              </p>
            </div>
            <div>
              <p className="text-neutral-500 text-[10px] uppercase font-bold">Booked Today</p>
              <p className="text-white font-bold mt-0.5">{venue.bookedToday}/{venue.totalSlots}</p>
            </div>
            <div>
              <p className="text-neutral-500 text-[10px] uppercase font-bold">Weekly Revenue</p>
              <p className="text-emerald-400 font-bold mt-0.5 flex items-center">
                <IndianRupee className="w-3 h-3 mr-0.5" />{venue.revenue.week.toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Occupancy bar */}
          <div className="mt-3">
            <div className="flex justify-between text-[9px] text-neutral-500 mb-1">
              <span>Occupancy</span><span>{occupancy}%</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${occupancy}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 bg-white/[0.01] flex-wrap gap-2">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => onToggleActive(venue.id)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
              venue.active ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-rose-500/10 hover:border-rose-500/20 hover:text-rose-400' : 'bg-white/5 border-white/10 text-neutral-400 hover:bg-emerald-500/10 hover:text-emerald-400'
            }`}>
            {venue.active ? <><ToggleRight className="w-4 h-4" /><span>Active</span></> : <><ToggleLeft className="w-4 h-4" /><span>Inactive</span></>}
          </button>

          <button
            type="button"
            onClick={() => onToggleBookingMode ? onToggleBookingMode(venue.id) : null}
            title="Click to toggle between Direct Booking and Request Approval"
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
              venue.booking_mode === 'request' || venue.requires_approval
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
            }`}
          >
            {venue.booking_mode === 'request' || venue.requires_approval ? (
              <><Clock className="w-3.5 h-3.5 text-amber-400" /><span>Request Mode</span></>
            ) : (
              <><Zap className="w-3.5 h-3.5 text-emerald-400" /><span>Direct Booking</span></>
            )}
          </button>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onEdit && onEdit(venue)}
            title="Edit Venue Details"
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-violet-600/20 border border-violet-500/35 text-violet-300 hover:bg-violet-600/30 transition-all cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-violet-400" />
            <span>Edit Venue</span>
          </button>
          <button
            onClick={() => setShowOffersModal(true)}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-indigo-600/20 border border-indigo-500/35 text-indigo-400 hover:bg-indigo-600/30 transition-all cursor-pointer">
            <Zap className="w-3.5 h-3.5 animate-pulse" />
            <span>Offers & Passes</span>
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center space-x-1.5 px-4 py-1.5 rounded-full text-xs font-bold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all cursor-pointer">
            <Calendar className="w-3.5 h-3.5" />
            <span>{expanded ? 'Hide Slots' : 'Manage Slots'}</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <button 
            onClick={() => setShowDeleteConfirm(true)}
            title="Delete Venue Listing"
            className="flex items-center space-x-1 px-3 py-1.5 rounded-full bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-all text-xs font-bold cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Listing</span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {showOffersModal && (
          <ManageOffersModal 
            venue={venue} 
            onClose={() => setShowOffersModal(false)} 
            venueOffers={venueOffers}
            setVenueOffers={setVenueOffers}
          />
        )}
      </AnimatePresence>

      {/* Delete Venue Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.8 }} exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)} className="absolute inset-0 bg-black/85 backdrop-blur-md" />
            
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 15 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="relative glass-card border border-rose-500/30 rounded-3xl p-6 max-w-md w-full z-10 text-left space-y-4 shadow-2xl">
              
              <div className="flex items-center space-x-3 pb-3 border-b border-white/10">
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-full text-rose-400">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-display font-extrabold text-white text-base">Delete Venue Listing?</h3>
                  <p className="text-xs text-neutral-400 mt-0.5">This venue will be removed from your manager hub</p>
                </div>
              </div>

              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-2xl space-y-1 text-xs">
                <p className="font-bold text-white">{venue.name}</p>
                <p className="text-neutral-400">{venue.location} • ₹{venue.pricePerHour}/hr</p>
              </div>

              <p className="text-xs text-neutral-400 font-light leading-relaxed">
                Are you sure you want to delete this venue listing? Online players will no longer be able to book slots or discover this turf.
              </p>

              <div className="flex items-center justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-5 py-2.5 rounded-full text-xs font-bold text-neutral-400 hover:text-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(venue);
                    setShowDeleteConfirm(false);
                  }}
                  className="px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-lg shadow-rose-600/30"
                >
                  Delete Venue Listing
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Expanded: Slot Grid */}
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-white/5">
            <div className="p-5">
              <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-neutral-400 mb-4">
                Weekly Slot Availability — {venue.name}
              </h4>
              <SlotGrid venue={venue} onUpdateSlot={onUpdateSlot} onBatchUpdateSlots={onBatchUpdateSlots} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Main Page ──────────────────────────────────────── */
export default function VenueManager({ user, venueOffers, setVenueOffers, onBackToPlayer, onOpenProfileSwitcher }) {
  const [venues, setVenues] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState(null);

  const handleEditVenue = async (updatedVenueData) => {
    if (!editingVenue) return;
    const vId = editingVenue.id;
    const finalVenue = {
      ...editingVenue,
      ...updatedVenueData,
      id: vId,
      owner_id: editingVenue.owner_id || user?.id || user?.firebase_uid || user?.uid,
      owner_email: editingVenue.owner_email || user?.email || '',
      owner_name: editingVenue.owner_name || user?.full_name || user?.name || 'Venue Owner'
    };
    await apiUpdateVenue(vId, finalVenue);
    setVenues(prev => prev.map(v => (v.id === vId || v.name === finalVenue.name) ? { ...v, ...finalVenue } : v));
    toast.success(`Venue "${finalVenue.name || 'Listing'}" updated successfully!`);
    setEditingVenue(null);
  };

  // Incoming Player Booking Requests
  const [ownerBookings, setOwnerBookings] = useState([]);
  const [rejectingTarget, setRejectingTarget] = useState(null);
  const [activeSection, setActiveSection] = useState('venues'); // 'venues' | 'bookings'
  const [bookingFilter, setBookingFilter] = useState('all'); // 'all' | 'pending' | 'confirmed' | 'rejected'

  useEffect(() => {
    const handleSectionNav = (e) => {
      if (e.detail === 'venues' || e.detail === 'bookings') {
        setActiveSection(e.detail);
      }
    };
    window.addEventListener('turfington_venue_section', handleSectionNav);
    return () => window.removeEventListener('turfington_venue_section', handleSectionNav);
  }, []);

  useEffect(() => {
    const loadOwnerRequests = async () => {
      const ownerId = user?.id || user?.uid || user?.firebase_uid;
      const ownerEmail = user?.email;
      const ownerName = user?.full_name || user?.name;
      if (!ownerId && !ownerEmail) {
        setOwnerBookings([]);
        return;
      }
      const fetched = await apiFetchOwnerBookings({
        ownerId,
        ownerUid: user?.firebase_uid || user?.uid,
        ownerEmail,
        ownerName
      });
      setOwnerBookings(Array.isArray(fetched) ? fetched : []);
    };
    loadOwnerRequests();

    const handleCreated = () => { loadOwnerRequests(); };
    const handleUpdated = () => { loadOwnerRequests(); };
    window.addEventListener('turfington_booking_created', handleCreated);
    window.addEventListener('turfington_booking_updated', handleUpdated);

    return () => {
      window.removeEventListener('turfington_booking_created', handleCreated);
      window.removeEventListener('turfington_booking_updated', handleUpdated);
    };
  }, [user?.id, user?.uid, user?.firebase_uid, user?.email, user?.full_name, user?.name]);

  const handleApproveBooking = async (bookingId) => {
    await apiUpdateBookingStatus(bookingId, 'CONFIRMED');
    setOwnerBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'CONFIRMED' } : b));
    toast.success('Booking request approved and confirmed!');
  };

  const handleConfirmRejectBooking = async (bookingId, reason) => {
    await apiUpdateBookingStatus(bookingId, 'REJECTED', reason);
    setOwnerBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'REJECTED', rejection_reason: reason } : b));
    setRejectingTarget(null);
    toast.info('Booking request declined.');
  };

  const handleChatWithPlayer = async (booking) => {
    const currentOwnerId = user?.id || user?.uid || user?.firebase_uid;
    const playerId = booking.user_id || booking.userId;
    if (!playerId) {
      toast.info('Player profile ID not found.');
      return;
    }
    await apiCreateDirectChat(currentOwnerId, playerId, {
      player_name: booking.player_name || booking.user_name || 'Player',
      booking_id: booking.id,
      venue_name: booking.venue || booking.title
    });
    window.dispatchEvent(new CustomEvent('turfington_navigate_tab', { detail: 'community' }));
  };

  const handleToggleBookingMode = async (venueId) => {
    const venue = venues.find(v => v.id === venueId);
    if (!venue) return;
    const currentMode = venue.booking_mode || (venue.requires_approval ? 'request' : 'direct');
    const newMode = currentMode === 'direct' ? 'request' : 'direct';

    setVenues(prev => prev.map(v => v.id === venueId ? {
      ...v,
      booking_mode: newMode,
      booking_type: newMode,
      requires_approval: newMode === 'request'
    } : v));

    await apiUpdateVenueBookingMode(venueId, newMode);
    toast.success(newMode === 'request'
      ? `Venue "${venue.name}" now requires Owner Approval before confirmation.`
      : `Venue "${venue.name}" now set to Direct Instant Booking.`);
  };

  useEffect(() => {
    const loadOwnerVenues = async () => {
      const ownerId = user?.id || user?.uid || user?.firebase_uid;
      const ownerEmail = user?.email;
      const ownerName = user?.full_name || user?.name;
      if (!ownerId && !ownerEmail) {
        setVenues([]);
        return;
      }
      const dbVenues = await apiFetchVenues({
        ownerId,
        ownerUid: user?.firebase_uid || user?.uid,
        ownerEmail,
        ownerName
      });
      if (dbVenues && dbVenues.length > 0) {
        const formatted = dbVenues.map(v => ({
          id: v.id,
          owner_id: v.owner_id || ownerId,
          name: v.name,
          location: `${v.address || ''}, ${v.city || ''}`,
          sports: v.sports || [v.sport || 'Football'],
          rating: v.rating || 5.0,
          pricePerHour: v.price_per_hr || 1000,
          image: v.image,
          booking_mode: v.booking_mode || v.booking_type || (v.requires_approval ? 'request' : 'direct'),
          requires_approval: v.requires_approval ?? (v.booking_mode === 'request'),
          totalSlots: 24,
          bookedToday: 0,
          revenue: { week: 0, month: 0 },
          slots: (() => {
            try {
              const s = localStorage.getItem('turfington_venue_slots_' + v.id);
              if (s) return JSON.parse(s);
            } catch {}
            return v.slots || generateSlots();
          })(),
          active: true,
          description: v.surface || 'Synthetic Turf Venue'
        }));
        setVenues(formatted);
      } else {
        setVenues([]);
      }
    };
    loadOwnerVenues();

    const handleVenuesUpdated = () => { loadOwnerVenues(); };
    window.addEventListener('turfington_venues_updated', handleVenuesUpdated);
    return () => {
      window.removeEventListener('turfington_venues_updated', handleVenuesUpdated);
    };
  }, [user?.id, user?.uid, user?.firebase_uid, user?.email]);

  const handleAdd = async (newVenueData) => {
    const currentOwnerId = user?.id || user?.firebase_uid || user?.uid;
    const currentOwnerEmail = user?.email || '';
    const currentOwnerName = user?.full_name || user?.name || 'Venue Owner';
    if (!currentOwnerId && !currentOwnerEmail) {
      alert('Authentication required: please log in as a venue owner.');
      return;
    }
    const finalLat = parseFloat(newVenueData.latitude) || 13.0827;
    const finalLng = parseFloat(newVenueData.longitude) || 80.2707;
    const dbRes = await apiCreateVenue({
      owner_id: currentOwnerId,
      owner_uid: user?.firebase_uid || user?.uid || '',
      owner_email: currentOwnerEmail,
      owner_name: currentOwnerName,
      name: newVenueData.name,
      sport: newVenueData.sports?.[0] || 'Football',
      sports: newVenueData.sports || [newVenueData.sports?.[0] || 'Football'],
      address: sanitizeLocationToEnglish(newVenueData.location),
      location: sanitizeLocationToEnglish(newVenueData.location),
      lat: finalLat,
      lng: finalLng,
      latitude: finalLat,
      longitude: finalLng,
      city: user?.city || 'Chennai',
      price_per_hr: newVenueData.pricePerHour,
      image: newVenueData.image,
      booking_mode: newVenueData.booking_mode || 'direct',
      booking_type: newVenueData.booking_mode || 'direct',
      requires_approval: newVenueData.requires_approval
    });

    const newVenue = {
      id: dbRes?.venue?.id || ('venue_' + Date.now()),
      owner_id: currentOwnerId,
      owner_email: currentOwnerEmail,
      owner_name: currentOwnerName,
      name: newVenueData.name,
      location: newVenueData.location,
      latitude: newVenueData.latitude,
      longitude: newVenueData.longitude,
      sports: newVenueData.sports,
      rating: 5.0,
      pricePerHour: newVenueData.pricePerHour,
      image: newVenueData.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=600',
      booking_mode: newVenueData.booking_mode || 'direct',
      booking_type: newVenueData.booking_mode || 'direct',
      requires_approval: newVenueData.requires_approval,
      totalSlots: 24,
      bookedToday: 0,
      revenue: { week: 0, month: 0 },
      slots: generateSlots(),
      active: true
    };
    setVenues(prev => [newVenue, ...prev.filter(v => v.id !== newVenue.id)]);
  };

  const handleToggleActive = (id) => {
    setVenues(prev => prev.map(v => v.id === id ? { ...v, active: !v.active } : v));
  };

  const persistVenueSlots = (venueId, updatedSlots) => {
    try {
      localStorage.setItem('turfington_venue_slots_' + venueId, JSON.stringify(updatedSlots));
      const custStr = localStorage.getItem('turfington_custom_venues');
      if (custStr) {
        const cust = JSON.parse(custStr);
        const updated = cust.map(cv => (String(cv.id) === String(venueId) || cv.name === venueId) ? { ...cv, slots: updatedSlots } : cv);
        localStorage.setItem('turfington_custom_venues', JSON.stringify(updated));
      }
      window.dispatchEvent(new CustomEvent('turfington_venues_updated'));
    } catch {}
  };

  const handleUpdateSlot = (venueId, day, time, newStatus) => {
    setVenues(prev => prev.map(v => {
      if (v.id !== venueId) return v;
      let updatedSlots = { ...v.slots };
      if (day === 'Everyday' || day === 'everyday') {
        DAYS.forEach(d => {
          updatedSlots[d] = { ...(updatedSlots[d] || {}), [time]: newStatus };
        });
      } else {
        updatedSlots[day] = { ...(updatedSlots[day] || {}), [time]: newStatus };
      }
      persistVenueSlots(venueId, updatedSlots);
      return {
        ...v,
        slots: updatedSlots
      };
    }));
  };

  const handleBatchUpdateSlots = (venueId, updatedSlots) => {
    setVenues(prev => prev.map(v => {
      if (v.id !== venueId) return v;
      persistVenueSlots(venueId, updatedSlots);
      return {
        ...v,
        slots: updatedSlots
      };
    }));
  };

  const handleDelete = async (venueOrId) => {
    const vId = typeof venueOrId === 'object' ? venueOrId.id : venueOrId;
    const vObj = typeof venueOrId === 'object' ? venueOrId : venues.find(v => v.id === vId);
    await apiDeleteVenue(vId, vObj);
    setVenues(prev => prev.filter(v => v.id !== vId && (!vObj?.name || v.name !== vObj.name)));
    toast.success(`Venue "${vObj?.name || 'Listing'}" successfully deleted from Firestore and database.`);
  };

  if (!user || user.role !== 'owner') {
    return (
      <div className="min-h-screen bg-transparent pt-32 pb-16 px-4 flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full glass-card border border-rose-500/30 p-8 rounded-3xl text-center shadow-2xl relative overflow-hidden"
        >
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-rose-950/40">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-black text-white uppercase tracking-tight mb-2">Access Restricted</h2>
          <p className="text-sm text-neutral-400 mb-6 leading-relaxed">
            The Venue Management Portal requires verified facility owner authorization. Your current account ({user?.full_name || 'Athlete'}) does not have owner privileges.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => { if (typeof onBackToPlayer === 'function') { onBackToPlayer(); } else { window.dispatchEvent(new CustomEvent('turfington_navigate_tab', { detail: 'landing' })); } }}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-700 text-white text-xs font-bold uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/25"
            >
              Back to Player Home
            </button>
            {typeof onOpenProfileSwitcher === 'function' && (
              <button
                type="button"
                onClick={onOpenProfileSwitcher}
                className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 text-xs font-bold uppercase tracking-widest transition-all cursor-pointer"
              >
                Switch Account / Profile
              </button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  const totalVenues = venues.length;
  const totalSlots = venues.reduce((sum, v) => sum + (v.totalSlots || 0), 0);
  const totalBooked = venues.reduce((sum, v) => sum + (v.bookedToday || 0), 0);
  const totalRevenue = venues.reduce((sum, v) => sum + (v.revenue?.week || 0), 0);

  const pendingRequests = useMemo(() => {
    return ownerBookings.filter(b => b.status === 'PENDING OWNER APPROVAL' || b.status === 'PENDING' || b.status === 'pending');
  }, [ownerBookings]);

  const confirmedBookings = useMemo(() => {
    return ownerBookings.filter(b => b.status === 'CONFIRMED' || b.status === 'APPROVED' || b.status === 'confirmed');
  }, [ownerBookings]);

  const cancelledBookings = useMemo(() => {
    return ownerBookings.filter(b => b.status === 'REJECTED' || b.status === 'cancelled' || b.status === 'rejected');
  }, [ownerBookings]);

  const filteredBookings = useMemo(() => {
    if (bookingFilter === 'pending') return pendingRequests;
    if (bookingFilter === 'confirmed') return confirmedBookings;
    if (bookingFilter === 'rejected') return cancelledBookings;
    return ownerBookings;
  }, [ownerBookings, bookingFilter, pendingRequests, confirmedBookings, cancelledBookings]);

  const ownerTotalRevenue = useMemo(() => {
    return ownerBookings.reduce((sum, b) => {
      const p = typeof b.price === 'number' ? b.price : (parseInt(String(b.price || 0).replace(/\D/g, ''), 10) || 0);
      return sum + (b.status !== 'REJECTED' && b.status !== 'cancelled' ? p : 0);
    }, 0);
  }, [ownerBookings]);

  return (
    <div className="min-h-screen bg-transparent pt-24 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
        <div>
          <div className="flex items-center space-x-2 mb-2">
            <Building2 className="w-5 h-5 text-violet-400" />
            <span className="text-[10px] text-violet-400 uppercase font-extrabold tracking-widest">Facility Operations</span>
          </div>
          <h1 className="text-3xl font-black font-display tracking-tight uppercase text-white">
            Venues & Bookings
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Easily manage your facilities, court availability, pricing, and live player booking requests in one place.
          </p>
        </div>

        {/* ── TWO-SECTION SWITCHER BUTTONS ───────────────── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center p-1.5 bg-[#121217] border border-white/10 rounded-2xl shadow-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveSection('venues')}
              className={`flex items-center space-x-2.5 px-5 py-2.5 rounded-xl text-xs font-display font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                activeSection === 'venues'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30 scale-[1.02]'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>My Venues</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                activeSection === 'venues' ? 'bg-white/20 text-white' : 'bg-white/5 text-neutral-400'
              }`}>
                {venues.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSection('bookings')}
              className={`flex items-center space-x-2.5 px-5 py-2.5 rounded-xl text-xs font-display font-extrabold uppercase tracking-wider transition-all cursor-pointer ${
                activeSection === 'bookings'
                  ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30 scale-[1.02]'
                  : 'text-neutral-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Bookings & Requests</span>
              {pendingRequests.length > 0 ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-amber-400 text-black font-black animate-pulse shadow-md shadow-amber-400/30">
                  {pendingRequests.length} Pending
                </span>
              ) : (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                  activeSection === 'bookings' ? 'bg-white/20 text-white' : 'bg-white/5 text-neutral-400'
                }`}>
                  {ownerBookings.length}
                </span>
              )}
            </button>
          </div>

          {activeSection === 'venues' && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center justify-center space-x-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-[0_0_20px_rgba(139,92,246,0.25)] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Venue</span>
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          SECTION 1: 🏟️ MY VENUES
          ══════════════════════════════════════════════════════ */}
      {activeSection === 'venues' && (
        <div className="space-y-8">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Venues', value: venues.length, sub: `${venues.filter(v=>v.active).length} currently active`, icon: <Building2 className="w-4 h-4" />, color: 'indigo' },
              { label: 'Today\'s Occupancy', value: `${totalBooked}/${totalSlots}`, sub: `${Math.round(totalBooked/totalSlots*100)||0}% court slots`, icon: <Calendar className="w-4 h-4" />, color: 'violet' },
              { label: 'Weekly Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, sub: 'Across your venues', icon: <IndianRupee className="w-4 h-4" />, color: 'emerald' },
              { label: 'Avg Rating', value: (venues.reduce((s,v)=>s+(v.rating||0),0)/venues.length||0).toFixed(1), sub: 'Player reviews', icon: <Star className="w-4 h-4" />, color: 'amber' },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="glass-card p-5 border border-white/5">
                <div className={`inline-flex p-2 rounded-xl mb-3 ${
                  stat.color === 'indigo' ? 'bg-indigo-500/10 text-indigo-400' :
                  stat.color === 'violet' ? 'bg-violet-500/10 text-violet-400' :
                  stat.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' :
                  'bg-amber-500/10 text-amber-400'
                }`}>
                  {stat.icon}
                </div>
                <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">{stat.label}</p>
                <p className="text-xl font-black text-white font-display mt-1">{stat.value}</p>
                <p className="text-[10px] text-neutral-600 mt-0.5">{stat.sub}</p>
              </motion.div>
            ))}
          </div>

          {/* Venues List */}
          <div>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-neutral-400">
                Your Registered Venues <span className="text-neutral-600 ml-1">({venues.length})</span>
              </h2>
              <span className="text-xs text-neutral-500">
                Tip: Click on the booking mode pill to toggle between Direct Booking & Request Approval
              </span>
            </div>

            {venues.length === 0 ? (
              <div className="glass-card p-12 text-center border border-dashed border-white/10 rounded-3xl space-y-4">
                <Building2 className="w-12 h-12 text-neutral-600 mx-auto" />
                <div>
                  <h3 className="text-white font-bold text-lg font-display">No Venues Added Yet</h3>
                  <p className="text-neutral-500 text-xs mt-1 max-w-md mx-auto">
                    List your first sports facility to start accepting player bookings directly or with custom owner approval.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  className="inline-flex items-center space-x-2 px-6 py-3 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs uppercase tracking-wider rounded-full transition-all cursor-pointer shadow-lg shadow-violet-600/25"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add First Venue</span>
                </button>
              </div>
            ) : (
              <div className="space-y-5">
                {venues.map(venue => (
                  <VenueCard
                    key={venue.id}
                    venue={venue}
                    onToggleActive={handleToggleActive}
                    onToggleBookingMode={handleToggleBookingMode}
                    onUpdateSlot={handleUpdateSlot}
                    onBatchUpdateSlots={handleBatchUpdateSlots}
                    onDelete={handleDelete}
                    onEdit={(v) => setEditingVenue(v)}
                    venueOffers={venueOffers}
                    setVenueOffers={setVenueOffers}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          SECTION 2: 📋 BOOKINGS & REQUESTS
          ══════════════════════════════════════════════════════ */}
      {activeSection === 'bookings' && (
        <div className="space-y-8">
          {/* Bookings Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total Bookings', value: ownerBookings.length, sub: 'All recorded player sessions', icon: <Calendar className="w-4 h-4" />, color: 'indigo' },
              { label: 'Pending Requests', value: pendingRequests.length, sub: pendingRequests.length > 0 ? 'Action required by you' : 'Zero pending requests', icon: <Clock className="w-4 h-4" />, color: 'amber' },
              { label: 'Confirmed Sessions', value: confirmedBookings.length, sub: 'Approved player slots', icon: <CheckCircle className="w-4 h-4" />, color: 'emerald' },
              { label: 'Booking Revenue', value: `₹${ownerTotalRevenue.toLocaleString('en-IN')}`, sub: 'From confirmed sessions', icon: <IndianRupee className="w-4 h-4" />, color: 'violet' },
            ].map((stat, i) => (
              <motion.div key={stat.label} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="glass-card p-5 border border-white/5">
                <div className={`inline-flex p-2 rounded-xl mb-3 ${
                  stat.color === 'indigo' ? 'bg-indigo-500/10 text-indigo-400' :
                  stat.color === 'violet' ? 'bg-violet-500/10 text-violet-400' :
                  stat.color === 'emerald' ? 'bg-emerald-500/10 text-emerald-400' :
                  'bg-amber-500/10 text-amber-400'
                }`}>
                  {stat.icon}
                </div>
                <p className="text-[10px] text-neutral-500 uppercase font-bold tracking-wider">{stat.label}</p>
                <p className="text-xl font-black text-white font-display mt-1">{stat.value}</p>
                <p className="text-[10px] text-neutral-600 mt-0.5">{stat.sub}</p>
              </motion.div>
            ))}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-2 p-1.5 bg-[#121217] border border-white/10 rounded-2xl w-fit">
            {[
              { id: 'all', label: 'All Bookings', count: ownerBookings.length },
              { id: 'pending', label: '⏳ Needs Approval', count: pendingRequests.length, highlight: pendingRequests.length > 0 },
              { id: 'confirmed', label: '✓ Confirmed', count: confirmedBookings.length },
              { id: 'rejected', label: '✕ Rejected / Cancelled', count: cancelledBookings.length }
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setBookingFilter(f.id)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  bookingFilter === f.id
                    ? 'bg-violet-600 text-white shadow-md'
                    : 'text-neutral-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <span>{f.label}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                  f.highlight ? 'bg-amber-400 text-black font-black animate-pulse' : 'bg-white/10 text-neutral-300'
                }`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* ── Pending Booking Requests Highlights (if any) ── */}
          {pendingRequests.length > 0 && (bookingFilter === 'all' || bookingFilter === 'pending') && (
            <div className="glass-card p-6 border border-amber-500/30 rounded-3xl space-y-4 bg-gradient-to-br from-amber-500/[0.04] to-transparent">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                    <Clock className="w-5 h-5 animate-pulse" />
                  </div>
                  <div>
                    <h2 className="text-base font-display font-extrabold text-white uppercase tracking-tight">
                      Booking Requests Awaiting Your Approval ({pendingRequests.length})
                    </h2>
                    <p className="text-xs text-neutral-400">Review requests from players and approve or decline with a reason</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {pendingRequests.map(req => (
                  <div key={req.id} className="p-5 bg-black/40 border border-white/10 rounded-2xl space-y-4 shadow-xl">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <UserAvatar
                          user={{
                            full_name: req.player_name || req.user_name || 'Player',
                            name: req.player_name || req.user_name || 'Player',
                            avatar: req.avatar || req.player_avatar,
                            avatar_url: req.player_avatar,
                            uid: req.user_id
                          }}
                          className="w-10 h-10 border border-amber-500/30"
                        />
                        <div>
                          <h3 className="font-bold text-white text-sm">{req.player_name || req.user_name || 'Player'}</h3>
                          <p className="text-xs text-neutral-400">{req.player_phone || 'Phone on file'}</p>
                        </div>
                      </div>
                      <span className="text-xs font-mono font-extrabold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                        {req.price || `₹${req.amount_paid || 0}`}
                      </span>
                    </div>

                    <div className="p-3 bg-white/[0.03] border border-white/5 rounded-xl text-xs space-y-1">
                      <p className="font-bold text-white">{req.title || req.venue_name || req.venue || 'Sports Venue'}</p>
                      <div className="flex items-center space-x-3 text-neutral-400 text-[11px]">
                        <span className="flex items-center space-x-1"><Calendar className="w-3 h-3 text-neutral-500" /><span>{req.date || 'Today'}</span></span>
                        <span className="flex items-center space-x-1"><Clock className="w-3 h-3 text-neutral-500" /><span>{formatTime12Hour(req.time || req.slot_time || 'Slot Time')}</span></span>
                        <span className="text-indigo-400 font-bold">{req.sport || 'Sports'}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleApproveBooking(req.id)}
                        className="flex-1 py-2.5 px-3 bg-[#00df82] hover:bg-[#00c774] text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center space-x-1.5 cursor-pointer shadow-md shadow-[#00df82]/20"
                      >
                        <CheckCircle className="w-4 h-4 stroke-[2.5]" />
                        <span>Approve Request</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingTarget(req)}
                        className="py-2.5 px-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleChatWithPlayer(req)}
                        className="py-2.5 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-300 hover:text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center space-x-1 cursor-pointer"
                        title="Chat with requesting player"
                      >
                        <MessageSquare className="w-4 h-4 text-indigo-400" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Bookings Table / Cards */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display font-extrabold text-white text-sm uppercase tracking-wider">
                Bookings Records ({filteredBookings.length})
              </h3>
            </div>

            {filteredBookings.length === 0 ? (
              <div className="glass-card p-12 text-center border border-dashed border-white/10 rounded-3xl space-y-2">
                <Calendar className="w-10 h-10 text-neutral-600 mx-auto mb-2" />
                <h4 className="text-white font-bold text-base">No Bookings Found</h4>
                <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                  {bookingFilter !== 'all'
                    ? `No bookings match your selected filter (${bookingFilter}). Try switching to "All Bookings".`
                    : 'When players reserve or request slots at your venues, their bookings will appear here in real time.'}
                </p>
              </div>
            ) : (
              <div className="glass-card border border-white/5 overflow-hidden rounded-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        {['Player', 'Venue', 'Sport', 'Scheduled Slot', 'Amount', 'Status', 'Actions'].map(h => (
                          <th key={h} className="px-5 py-3.5 text-[10px] font-extrabold uppercase tracking-widest text-neutral-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBookings.map(b => {
                        const priceNum = typeof b.price === 'number' ? b.price : (parseInt(String(b.price || 0).replace(/\D/g, ''), 10) || 0);
                        const playerName = b.player_name || b.user_name || 'Player';
                        const venueTitle = b.venue || b.venue_name || b.title || 'Venue';
                        const timeStr = b.time || b.slot_time || 'Scheduled Slot';
                        const isPending = b.status === 'PENDING OWNER APPROVAL' || b.status === 'PENDING' || b.status === 'pending';
                        const isConfirmed = b.status === 'CONFIRMED' || b.status === 'APPROVED' || b.status === 'confirmed';
                        const isRejected = b.status === 'REJECTED' || b.status === 'cancelled' || b.status === 'rejected';

                        return (
                          <tr key={b.id} className={`border-b border-white/5 last:border-0 hover:bg-white/[0.02] transition-colors ${isRejected ? 'opacity-60' : ''}`}>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <UserAvatar
                                  user={{
                                    full_name: playerName,
                                    name: playerName,
                                    avatar: b.avatar || b.player_avatar,
                                    avatar_url: b.player_avatar,
                                    uid: b.user_id
                                  }}
                                  className="w-7 h-7 text-[10px]"
                                />
                                <div>
                                  <span className="font-bold text-white block">{playerName}</span>
                                  {b.player_phone && <span className="text-[10px] text-neutral-500 block">{b.player_phone}</span>}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 text-neutral-300 font-medium">{venueTitle}</td>
                            <td className="px-5 py-3.5 text-neutral-400">{b.sport || 'Sports'}</td>
                            <td className="px-5 py-3.5 text-neutral-300 font-mono">
                              {b.date ? `${b.date} • ` : ''}{formatTime12Hour(timeStr)}
                            </td>
                            <td className="px-5 py-3.5 font-bold text-white">
                              ₹{priceNum.toLocaleString('en-IN')}
                            </td>
                            <td className="px-5 py-3.5">
                              <span className={`text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1 ${
                                isPending ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' :
                                isConfirmed ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' :
                                'bg-rose-500/15 text-rose-300 border-rose-500/30'
                              }`}>
                                {isPending ? '⏳ Pending Approval' : isConfirmed ? '✓ Confirmed' : '✕ Rejected'}
                              </span>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center space-x-2">
                                {isPending ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleApproveBooking(b.id)}
                                      className="px-2.5 py-1 bg-[#00df82]/20 hover:bg-[#00df82]/30 border border-[#00df82]/40 text-[#00df82] text-[10px] font-extrabold uppercase rounded-lg transition-all cursor-pointer"
                                    >
                                      Approve
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setRejectingTarget(b)}
                                      className="px-2.5 py-1 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-[10px] font-extrabold uppercase rounded-lg transition-all cursor-pointer"
                                    >
                                      Decline
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleChatWithPlayer(b)}
                                    className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-all cursor-pointer"
                                    title="Message Player"
                                  >
                                    <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add Venue Modal ─────────────────────────────── */}
      <AnimatePresence>
        {addOpen && <AddVenueModal onClose={() => setAddOpen(false)} onAdd={handleAdd} />}
        {editingVenue && <AddVenueModal venue={editingVenue} onClose={() => setEditingVenue(null)} onAdd={handleEditVenue} />}
        {rejectingTarget && (
          <RejectBookingModal
            booking={rejectingTarget}
            onClose={() => setRejectingTarget(null)}
            onReject={handleConfirmRejectBooking}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
