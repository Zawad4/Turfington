import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, User, AlertCircle, Loader2, ArrowRight, Building2, Sparkles, Check } from 'lucide-react';
import { GoogleAuthProvider, signInWithPopup, signInWithCredential, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../services/firebase';
import { apiFetchProfile, apiFetchProfileByEmail, apiCreateProfile, apiCheckUsernameUnique, apiGetEmailByUsername, apiUpdateProfile } from '../services/db';
import { ensureUserProfile } from '../services/chatService';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';

const SPOTIFY_SPORTS_OPTIONS = [
  { id: 'football', name: 'Football', icon: '⚽', desc: 'Turf 7v7, 5v5 & League matches', bg: 'from-emerald-900/30 via-emerald-950/60 to-black', border: 'border-emerald-500/40', accent: 'text-emerald-400', ring: 'ring-emerald-500/50' },
  { id: 'cricket', name: 'Cricket', icon: '🏏', desc: 'Box cricket, Leather ball & Nets', bg: 'from-amber-900/30 via-amber-950/60 to-black', border: 'border-amber-500/40', accent: 'text-amber-400', ring: 'ring-amber-500/50' },
  { id: 'badminton', name: 'Badminton', icon: '🏸', desc: 'Wooden & Synthetic indoor courts', bg: 'from-indigo-900/30 via-indigo-950/60 to-black', border: 'border-indigo-500/40', accent: 'text-indigo-400', ring: 'ring-indigo-500/50' },
  { id: 'basketball', name: 'Basketball', icon: '🏀', desc: 'Full court 5v5 & Streetball 3x3', bg: 'from-orange-900/30 via-orange-950/60 to-black', border: 'border-orange-500/40', accent: 'text-orange-400', ring: 'ring-orange-500/50' },
  { id: 'tennis', name: 'Tennis', icon: '🎾', desc: 'Clay, Hard court & Singles/Doubles', bg: 'from-lime-900/30 via-lime-950/60 to-black', border: 'border-lime-500/40', accent: 'text-lime-400', ring: 'ring-lime-500/50' },
  { id: 'table_tennis', name: 'Table Tennis', icon: '🏓', desc: 'Ping pong matches & Tournaments', bg: 'from-rose-900/30 via-rose-950/60 to-black', border: 'border-rose-500/40', accent: 'text-rose-400', ring: 'ring-rose-500/50' },
  { id: 'volleyball', name: 'Volleyball', icon: '🏐', desc: 'Indoor & Beach volleyball courts', bg: 'from-cyan-900/30 via-cyan-950/60 to-black', border: 'border-cyan-500/40', accent: 'text-cyan-400', ring: 'ring-cyan-500/50' },
  { id: 'pickleball', name: 'Pickleball', icon: '🎾', desc: 'Fastest growing racket sport', bg: 'from-fuchsia-900/30 via-fuchsia-950/60 to-black', border: 'border-fuchsia-500/40', accent: 'text-fuchsia-400', ring: 'ring-fuchsia-500/50' },
  { id: 'bowling', name: 'Bowling', icon: '🎳', desc: '10-pin lanes & Arcade challenges', bg: 'from-violet-900/30 via-violet-950/60 to-black', border: 'border-violet-500/40', accent: 'text-violet-400', ring: 'ring-violet-500/50' },
  { id: 'swimming', name: 'Swimming', icon: '🏊', desc: 'Lap pools & Aquatic training', bg: 'from-sky-900/30 via-sky-950/60 to-black', border: 'border-sky-500/40', accent: 'text-sky-400', ring: 'ring-sky-500/50' }
];

const GoogleLogo = () => (
  <svg width="20" height="20" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/>
    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
    <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71 0-.593.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z"/>
    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
  </svg>
);

const Input = ({ label, icon: Icon, type = 'text', value, onChange, placeholder, error, right }) => (
  <div className="space-y-1.5 text-left w-full">
    {label && <label className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">{label}</label>}
    <div className={`relative flex items-center bg-white/[0.04] border rounded-xl px-4 py-3 transition-colors ${
      error ? 'border-rose-500/50' : 'border-white/8 focus-within:border-indigo-500/50'
    }`}>
      {Icon && <Icon className="w-4 h-4 text-neutral-500 flex-shrink-0 mr-3" />}
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="flex-grow w-full bg-transparent text-sm text-white placeholder-neutral-600 focus:outline-none"
      />
      {right}
    </div>
    {error && <p className="text-xs text-rose-400 flex items-center gap-1 mt-1"><AlertCircle className="w-3 h-3" />{error}</p>}
  </div>
);

const Card = ({ children, className = '' }) => (
  <div className={`bg-[#111111] border border-white/8 rounded-3xl shadow-2xl ${className}`}>
    {children}
  </div>
);

const Divider = ({ label = 'or' }) => (
  <div className="flex items-center gap-3 my-2">
    <div className="flex-grow h-px bg-white/8" />
    <span className="text-[11px] text-neutral-600 font-medium">{label}</span>
    <div className="flex-grow h-px bg-white/8" />
  </div>
);

export default function Auth({ onLogin }) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Form Fields
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Onboarding Phase
  const [onboardingUser, setOnboardingUser] = useState(null); // The Firebase user needing a profile
  const [onboardingUsername, setOnboardingUsername] = useState('');
  
  // New State for Role & Sports Onboarding
  const [onboardingRoleProfile, setOnboardingRoleProfile] = useState(null);
  const [onboardingStep, setOnboardingStep] = useState('role'); // 'role' | 'sports'
  const [selectedSports, setSelectedSports] = useState(['Football', 'Cricket']);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      if (u) {
        let p = await apiFetchProfile(u.uid);
        if (!p && u.email) {
          p = await apiFetchProfileByEmail(u.email);
        }
        if (p) {
          // If profile exists or user is not explicitly signing up, log in immediately!
          if (p.role || !isSignUp) {
            const completed = {
              ...p,
              role: p.role || 'player',
              is_profile_complete: true
            };
            onLogin(completed);
            return;
          }
          if (!p.is_profile_complete && isSignUp) {
            setOnboardingRoleProfile(p);
          }
        }
      }
    });
    return () => unsubscribe();
  }, [isSignUp, onLogin]);

  const validateUsername = async (u) => {
    if (!u) return 'Username is required';
    if (u.length < 3 || u.length > 20) return 'Must be 3-20 characters';
    if (!/^[a-zA-Z0-9_.]+$/.test(u)) return 'Only letters, numbers, _, and . allowed';
    const isUnique = await apiCheckUsernameUnique(u);
    if (!isUnique) return 'Username is taken';
    return null;
  };

  const handleGoogleSubmit = async () => {
    try {
      setLoading(true);
      setErrors({});
      let result;

      if (Capacitor.isNativePlatform()) {
        const authResult = await FirebaseAuthentication.signInWithGoogle();
        const credential = GoogleAuthProvider.credential(authResult.credential?.idToken);
        result = await signInWithCredential(auth, credential);
      } else {
        const provider = new GoogleAuthProvider();
        result = await signInWithPopup(auth, provider);
      }
      
      if (!result || !result.user) {
        setLoading(false);
        return;
      }

      const googleEmail = result.user.email ? result.user.email.trim().toLowerCase() : '';
      const googleName = result.user.displayName || 'Sports Athlete';

      // 1. Fetch profile from server/Firestore/cache
      let profile = await apiFetchProfile(result.user.uid);
      if (!profile && googleEmail) {
        profile = await apiFetchProfileByEmail(googleEmail);
      }

      // ── EXISTING ACCOUNT: Log in immediately without re-prompting preferences! ──
      if (profile && (profile.role || !isSignUp)) {
        const completeExisting = {
          ...profile,
          role: profile.role || 'player',
          auth_provider: 'google',
          is_google_user: true,
          is_profile_complete: true,
          sports_interests: profile.sports_interests || ['Football', 'Cricket'],
          interests: profile.interests || [
            { sport: 'Football', level: 'Player', icon: '⚽' },
            { sport: 'Cricket', level: 'Player', icon: '🏏' }
          ]
        };

        apiUpdateProfile(completeExisting.id, { 
          role: completeExisting.role, 
          auth_provider: 'google',
          is_google_user: true,
          is_profile_complete: true 
        }).catch(() => {});

        ensureUserProfile({
          ...completeExisting,
          uid: result.user.uid,
          displayName: completeExisting.full_name || completeExisting.name,
          email: googleEmail,
          avatarUrl: completeExisting.avatar || completeExisting.avatar_url
        }).catch(() => {});

        try {
          localStorage.setItem('turfington_current_profile', JSON.stringify(completeExisting));
          localStorage.setItem('turfington_active_user', JSON.stringify(completeExisting));
        } catch {}

        setLoading(false);
        onLogin(completeExisting);
        return;
      }

      // ── BRAND NEW GOOGLE USER: Only now create and show onboarding ──
      if (!profile) {
        const googlePhoto = result.user.photoURL || '';

        const googleProfile = {
          id: result.user.uid,
          uid: result.user.uid,
          firebase_uid: result.user.uid,
          full_name: googleName,
          displayName: googleName,
          email: googleEmail || 'googleuser@turfington.com',
          username: (googleEmail || 'user').split('@')[0] + Math.floor(Math.random() * 1000),
          avatar: googlePhoto,
          avatar_url: googlePhoto,
          auth_provider: 'google',
          is_google_user: true,
          role: null,
          is_profile_complete: false,
          stats: [
            { name: 'Matches', value: '0' },
            { name: 'Followers', value: '0' },
            { name: 'Following', value: '0' },
            { name: 'Win Rate', value: '0%' }
          ],
          streak: 0,
          achievements: [],
          history: []
        };
        const created = await apiCreateProfile(googleProfile);
        if (!created.success) {
          setLoading(false);
          await auth.signOut().catch(() => {});
          setErrors({ global: created.error || 'account already exist' });
          return;
        }
        profile = created.profile || googleProfile;

        ensureUserProfile({
          ...profile,
          uid: result.user.uid,
          displayName: googleName,
          email: googleEmail,
          avatarUrl: googlePhoto
        }).catch(() => {});

        // Brand new account onboarding
        setLoading(false);
        setOnboardingRoleProfile(profile);
        return;
      }

      // Auto-detect GPS location
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          let city = 'Chennai';
          try {
            const geo = await fetchEnglishReverseGeocode(lat, lng, 10);
            city = geo.city || 'Chennai';
          } catch {}
          const safeCity = sanitizeLocationToEnglish(city);
          apiUpdateProfile(profile.id || profile.firebase_uid, {
            lat,
            lng,
            city: safeCity,
            location: `${safeCity}, Tamil Nadu`
          });
        }, () => {}, { timeout: 8000 });
      }

      try {
        localStorage.setItem('turfington_current_profile', JSON.stringify(profile));
        localStorage.setItem('turfington_active_user', JSON.stringify(profile));
      } catch {}

      setLoading(false);
      onLogin(profile);
    } catch (error) {
      setLoading(false);
      if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        return;
      }
      if (error.code === 'auth/account-exists-with-different-credential' || error.code === 'auth/email-already-in-use') {
        const existingProf = await apiFetchProfileByEmail(email.trim());
        if (existingProf?.role === 'player') {
          setErrors({ global: 'account already exist as player' });
        } else if (existingProf?.role === 'owner') {
          setErrors({ global: 'account already exist as venue owner' });
        } else {
          setErrors({ global: 'account already exist' });
        }
        return;
      }
      setErrors({ global: error.message || 'Google login failed. Please try again.' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    const errs = {};

    if (isSignUp) {
      if (!name.trim()) errs.name = 'Enter your name';
      const uErr = await validateUsername(username);
      if (uErr) errs.username = uErr;
      if (!email || !email.includes('@')) errs.email = 'Valid email required';
    } else {
      if (!email) errs.email = 'Email or Username required';
    }
    
    if (!password || password.length < 6) errs.password = 'Min 6 chars';

    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    try {
      setLoading(true);
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (isSignUp) {
        const targetEmail = email.replace(/[\u200B-\u200D\uFEFF]/g, '').trim().toLowerCase();
        if (!emailRegex.test(targetEmail)) {
          setErrors({ email: 'Please enter a valid email address (e.g. name@example.com)' });
          setLoading(false);
          return;
        }

        const existingProf = await apiFetchProfileByEmail(targetEmail);
        if (existingProf) {
          setLoading(false);
          if (existingProf.role === 'player') {
            setErrors({ global: 'account already exist as player' });
          } else if (existingProf.role === 'owner') {
            setErrors({ global: 'account already exist as venue owner' });
          } else {
            setErrors({ global: 'account already exist' });
          }
          return;
        }

        const cred = await createUserWithEmailAndPassword(auth, targetEmail, password);

        const { success, profile, error } = await apiCreateProfile({
          firebase_uid: cred.user.uid,
          username,
          full_name: name,
          email: targetEmail,
          avatar: '',
          avatar_url: ''
        });
        if (success) {
          setLoading(false);
          setOnboardingRoleProfile(profile);
        } else {
          setErrors({ global: error || 'account already exist' });
          setLoading(false);
        }
      } else {
        let rawInput = email.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
        if (rawInput.startsWith('@')) {
          rawInput = rawInput.slice(1).trim();
        }

        let loginEmail = rawInput.toLowerCase();

        // If it doesn't look like an email, assume it's a username
        if (!emailRegex.test(loginEmail)) {
          const fetchedEmail = await apiGetEmailByUsername(rawInput);
          if (fetchedEmail && emailRegex.test(fetchedEmail)) {
            loginEmail = fetchedEmail;
          } else if (!loginEmail.includes('@')) {
            setErrors({ email: 'Username not found. Please enter your registered email.' });
            setLoading(false);
            return;
          } else {
            setErrors({ email: 'Please enter a valid email address (e.g. name@example.com)' });
            setLoading(false);
            return;
          }
        }

        const cred = await signInWithEmailAndPassword(auth, loginEmail, password);
        let profile = await apiFetchProfile(cred.user.uid);
        if (!profile && loginEmail) {
          profile = await apiFetchProfileByEmail(loginEmail);
        }

        // ── EXISTING ACCOUNT SIGN IN: Skip role & sports preferences completely! ──
        const existingRole = profile?.role || 'player';
        const completeProfile = {
          id: profile?.id || cred.user.uid,
          firebase_uid: cred.user.uid,
          email: loginEmail,
          full_name: profile?.full_name || profile?.name || cred.user.displayName || loginEmail.split('@')[0],
          username: profile?.username || loginEmail.split('@')[0],
          avatar: profile?.avatar || profile?.avatar_url || cred.user.photoURL || '',
          avatar_url: profile?.avatar || profile?.avatar_url || cred.user.photoURL || '',
          role: existingRole,
          sports_interests: profile?.sports_interests || profile?.interests?.map(i => i.sport) || ['Football', 'Cricket'],
          interests: profile?.interests || [
            { sport: 'Football', level: 'Player', icon: '⚽' },
            { sport: 'Cricket', level: 'Player', icon: '🏏' }
          ],
          is_profile_complete: true,
          ...(profile || {})
        };

        apiUpdateProfile(completeProfile.id, {
          role: existingRole,
          is_profile_complete: true
        }).catch(() => {});

        try {
          localStorage.setItem('turfington_current_profile', JSON.stringify(completeProfile));
          localStorage.setItem('turfington_active_user', JSON.stringify(completeProfile));
        } catch {}

        setLoading(false);
        onLogin(completeProfile);
      }
    } catch (error) {
      setLoading(false);
      const code = error?.code || '';
      if (code === 'auth/email-already-in-use' || code === 'auth/account-exists-with-different-credential') {
        const existingProf = await apiFetchProfileByEmail(email.trim());
        if (existingProf?.role === 'player') {
          setErrors({ global: 'account already exist as player' });
        } else if (existingProf?.role === 'owner') {
          setErrors({ global: 'account already exist as venue owner' });
        } else {
          setErrors({ global: 'account already exist' });
        }
      } else if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setErrors({ global: 'Incorrect email or password.' });
      } else if (code === 'auth/invalid-email') {
        setErrors({ global: 'Invalid email format. Please enter a valid email address (e.g. name@example.com).' });
      } else if (code === 'auth/user-disabled') {
        setErrors({ global: 'This account has been disabled. Please contact support.' });
      } else if (code === 'auth/too-many-requests') {
        setErrors({ global: 'Too many attempts. Please wait a moment and try again.' });
      } else if (code === 'auth/network-request-failed') {
        setErrors({ global: 'Network error. Please check your internet connection.' });
      } else {
        const msg = (error?.message || '').replace(/^Firebase:\s*Error\s*\((auth\/[^)]+)\)\.?/i, '$1');
        setErrors({ global: msg || 'An error occurred during authentication.' });
      }
    }
  };

  const handleOnboardingSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    const uErr = await validateUsername(onboardingUsername);
    if (uErr) {
      setErrors({ username: uErr });
      setLoading(false);
      return;
    }

    const onboardingName = onboardingUser.displayName || onboardingUsername || 'User';
    const fallbackAvatar = onboardingUser.photoURL || '';

    const { success, profile, error } = await apiCreateProfile({
      firebase_uid: onboardingUser.uid,
      username: onboardingUsername,
      full_name: onboardingName,
      email: onboardingUser.email,
      avatar: fallbackAvatar,
      avatar_url: fallbackAvatar
    });

    if (success) {
      setLoading(false);
      setOnboardingRoleProfile(profile);
      setOnboardingUser(null);
    } else {
      setErrors({ global: error });
      setLoading(false);
    }
  };

  const [selectedRoleLoading, setSelectedRoleLoading] = useState(null);

  const handleRoleSelect = async (selectedRole) => {
    try {
      setSelectedRoleLoading(selectedRole);
      setErrors({});

      const existingRole = onboardingRoleProfile?.role;
      if (existingRole && existingRole !== selectedRole) {
        if (existingRole === 'player') {
          setErrors({ global: 'account already exist as player' });
          setSelectedRoleLoading(null);
          return;
        } else if (existingRole === 'owner') {
          setErrors({ global: 'account already exist as venue owner' });
          setSelectedRoleLoading(null);
          return;
        }
      }

      // If user selected 'player', proceed to Spotify-style Sports Preference onboarding!
      if (selectedRole === 'player') {
        setOnboardingStep('sports');
        setSelectedRoleLoading(null);
        return;
      }

      // If venue owner, finish onboarding immediately
      const targetProfile = onboardingRoleProfile || {
        id: 'prof_' + Date.now(),
        firebase_uid: auth.currentUser?.uid || 'usr_new',
        email: auth.currentUser?.email || '',
        full_name: auth.currentUser?.displayName || 'Owner',
        avatar_url: auth.currentUser?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Owner'
      };

      const updated = {
        ...targetProfile,
        role: selectedRole,
        is_profile_complete: true
      };

      apiUpdateProfile(targetProfile.id, { role: selectedRole, is_profile_complete: true }).catch(() => {});

      try {
        localStorage.setItem('turfington_current_profile', JSON.stringify(updated));
        localStorage.setItem('turfington_active_user', JSON.stringify(updated));
      } catch {}

      onLogin(updated);
    } catch (err) {
      console.error('Role selection error:', err);
      onLogin({
        ...(onboardingRoleProfile || {}),
        role: selectedRole,
        is_profile_complete: true
      });
    } finally {
      setSelectedRoleLoading(null);
    }
  };

  if (onboardingUser) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center p-4">
        <Card className="p-7 max-w-sm w-full space-y-5">
          <h2 className="text-xl font-bold text-white text-center">Choose your username</h2>
          <p className="text-xs text-neutral-400 text-center">One last step before you join.</p>
          <form onSubmit={handleOnboardingSubmit} className="space-y-4">
            <Input
              icon={User}
              value={onboardingUsername}
              onChange={e => setOnboardingUsername(e.target.value.toLowerCase())}
              placeholder="username"
              error={errors.username}
            />
            {errors.global && <p className="text-xs text-rose-500">{errors.global}</p>}
            <button disabled={loading} type="submit" className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl disabled:opacity-50">
              {loading ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Complete Profile'}
            </button>
          </form>
        </Card>
      </div>
    );
  }

  if (onboardingRoleProfile) {
    const userName = onboardingRoleProfile.full_name || onboardingRoleProfile.username || 'Friend';

    // STEP 2: Spotify-Style Sports Preference Selection (Only for Players)
    if (onboardingStep === 'sports') {
      return (
        <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
          {/* Ambient background glow orbs */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/4 left-1/3 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[150px]" />
            <div className="absolute bottom-1/4 right-1/3 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[140px]" />
          </div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.96, y: 15 }} 
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="relative z-10 w-full max-w-[840px] text-center space-y-6 my-6"
          >
            {/* Step Counter Badge */}
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Step 2 of 2 • Sports Preferences</span>
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl sm:text-4xl font-black font-display text-white tracking-tight">
                What sports do you play, <span className="text-indigo-400">{userName}</span>?
              </h2>
              <p className="text-xs sm:text-sm text-neutral-400 max-w-lg mx-auto font-light">
                Select your favorite sports so we can recommend matches, nearby turfs & list your <span className="text-white font-medium">SPORTS INTERESTS</span> on your profile.
              </p>
            </div>

            {/* Selection Counter & Actions */}
            <div className="flex justify-between items-center px-1 max-w-3xl mx-auto text-xs border-b border-white/5 pb-3">
              <span className="text-neutral-400 font-medium">
                Selected: <span className="text-indigo-400 font-extrabold">{selectedSports.length} {selectedSports.length === 1 ? 'Sport' : 'Sports'}</span>
              </span>
              <div className="space-x-3">
                <button 
                  type="button"
                  onClick={() => setSelectedSports(SPOTIFY_SPORTS_OPTIONS.map(s => s.name))}
                  className="text-xs text-indigo-400 hover:text-indigo-300 font-bold transition-colors cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-neutral-700">|</span>
                <button 
                  type="button"
                  onClick={() => setSelectedSports([])}
                  className="text-xs text-neutral-500 hover:text-neutral-300 font-bold transition-colors cursor-pointer"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Spotify-style Sports Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5 text-left max-w-3xl mx-auto">
              {SPOTIFY_SPORTS_OPTIONS.map(sport => {
                const isSelected = selectedSports.includes(sport.name);

                return (
                  <motion.button
                    key={sport.id}
                    type="button"
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedSports(prev => prev.filter(s => s !== sport.name));
                      } else {
                        setSelectedSports(prev => [...prev, sport.name]);
                      }
                    }}
                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between relative overflow-hidden cursor-pointer select-none min-h-[120px] bg-gradient-to-b ${sport.bg} ${
                      isSelected 
                        ? `${sport.border} ring-2 ${sport.ring} shadow-[0_0_20px_rgba(99,102,241,0.25)] scale-[1.02]` 
                        : 'border-white/10 hover:border-white/20 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <div className="flex justify-between items-start w-full">
                      <span className="text-3xl">{sport.icon}</span>
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                        isSelected ? 'bg-indigo-600 border-indigo-400 text-white scale-110' : 'bg-black/40 border-white/20 text-transparent'
                      }`}>
                        <Check className="w-3 h-3" />
                      </div>
                    </div>

                    <div className="mt-3">
                      <h4 className={`text-sm font-black font-display text-white ${isSelected ? sport.accent : ''}`}>
                        {sport.name}
                      </h4>
                      <p className="text-[10px] text-neutral-400 mt-0.5 font-light line-clamp-1">
                        {sport.desc}
                      </p>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            {/* Finish Action Button */}
            <div className="pt-4 max-w-sm mx-auto space-y-3">
              <button
                disabled={selectedSports.length === 0 || loading}
                onClick={async () => {
                  try {
                    setLoading(true);
                    const formattedInterests = selectedSports.map(s => {
                      const item = SPOTIFY_SPORTS_OPTIONS.find(sp => sp.name === s);
                      return { sport: s, level: 'Player', icon: item ? item.icon : '⚽' };
                    });

                    const targetProfile = onboardingRoleProfile || {
                      id: 'prof_' + Date.now(),
                      firebase_uid: auth.currentUser?.uid || 'usr_new',
                      email: auth.currentUser?.email || '',
                      full_name: auth.currentUser?.displayName || 'Player',
                      avatar_url: auth.currentUser?.photoURL || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Player'
                    };

                    const updated = {
                      ...targetProfile,
                      role: 'player',
                      sports_interests: selectedSports,
                      interests: formattedInterests,
                      is_profile_complete: true
                    };

                    await apiUpdateProfile(targetProfile.id, {
                      role: 'player',
                      sports_interests: selectedSports,
                      interests: formattedInterests,
                      is_profile_complete: true
                    }).catch(() => {});

                    try {
                      localStorage.setItem('turfington_current_profile', JSON.stringify(updated));
                      localStorage.setItem('turfington_active_user', JSON.stringify(updated));
                    } catch {}

                    setLoading(false);
                    onLogin(updated);
                  } catch (err) {
                    console.error('Save sports preferences error:', err);
                    setLoading(false);
                    onLogin({
                      ...(onboardingRoleProfile || {}),
                      role: 'player',
                      sports_interests: selectedSports,
                      is_profile_complete: true
                    });
                  }
                }}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_25px_rgba(99,102,241,0.4)] flex items-center justify-center space-x-2 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <span>Complete Profile & Enter Turfington</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              {selectedSports.length === 0 && (
                <p className="text-[11px] text-amber-400 font-medium">
                  Select at least 1 sport to complete your profile
                </p>
              )}
            </div>
          </motion.div>
        </div>
      );
    }

    // STEP 1: Role Selection Screen (Player vs Venue Owner)
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
        {/* Ambient background glow orbs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-indigo-600/10 rounded-full blur-[140px]" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-amber-600/10 rounded-full blur-[140px]" />
        </div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.96, y: 15 }} 
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="relative z-10 w-full max-w-[720px] text-center space-y-6"
        >
          {/* Logo Badge */}
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-1">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Step 1 of 2 • Welcome to Turfington</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl sm:text-4xl font-black font-display text-white tracking-tight">
              How will you use Turfington, <span className="text-indigo-400">{userName}</span>?
            </h2>
            <p className="text-xs sm:text-sm text-neutral-400 max-w-md mx-auto font-light">
              Choose your account type to personalize your experience and unlock tailored features.
            </p>
          </div>

          {errors.global && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center max-w-md mx-auto">
              {errors.global}
            </div>
          )}

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left pt-2">
            
            {/* Player Card */}
            <motion.div
              whileHover={{ y: -4, scale: 1.01 }}
              transition={{ duration: 0.2 }}
              className="glass-card p-6 border border-white/10 hover:border-indigo-500/40 bg-gradient-to-b from-indigo-500/[0.06] via-white/[0.02] to-transparent rounded-3xl flex flex-col justify-between space-y-6 shadow-2xl relative overflow-hidden group"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 group-hover:scale-110 transition-transform">
                    <User className="w-7 h-7" />
                  </div>
                  <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                    For Athletes
                  </span>
                </div>

                <div>
                  <h3 className="text-xl font-extrabold font-display text-white">I'm a Player</h3>
                  <p className="text-xs text-neutral-400 mt-1 font-light leading-relaxed">
                    Find games, book turfs in seconds, join open matches & connect with sports enthusiasts.
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-neutral-300">
                  <div className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                    <span>Instant slot booking & membership passes</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                    <span>Match finder & open player challenges</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                    <span>Personal rating & match stats</span>
                  </div>
                </div>
              </div>

              <button
                disabled={selectedRoleLoading !== null}
                onClick={() => handleRoleSelect('player')}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-extrabold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_20px_rgba(99,102,241,0.3)] flex items-center justify-center space-x-2 cursor-pointer"
              >
                {selectedRoleLoading === 'player' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Continue as Player</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.div>

            {/* Venue Owner Card */}
            <motion.div
              whileHover={{ y: -4, scale: 1.01 }}
              transition={{ duration: 0.2 }}
              className="glass-card p-6 border border-white/10 hover:border-amber-500/40 bg-gradient-to-b from-amber-500/[0.06] via-white/[0.02] to-transparent rounded-3xl flex flex-col justify-between space-y-6 shadow-2xl relative overflow-hidden group"
            >
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-14 h-14 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition-transform">
                    <Building2 className="w-7 h-7" />
                  </div>
                  <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    For Arena Owners
                  </span>
                </div>

                <div>
                  <h3 className="text-xl font-extrabold font-display text-white">I'm a Venue Owner</h3>
                  <p className="text-xs text-neutral-400 mt-1 font-light leading-relaxed">
                    List sports facilities, manage slot availability, approve booking requests & track revenue.
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-white/5 text-xs text-neutral-300">
                  <div className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span>Arena & turf slot availability manager</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span>Approve or reject booking requests with reasons</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Check className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                    <span>Weekly revenue analytics & occupancy charts</span>
                  </div>
                </div>
              </div>

              <button
                disabled={selectedRoleLoading !== null}
                onClick={() => handleRoleSelect('owner')}
                className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black font-extrabold text-xs uppercase tracking-widest rounded-2xl transition-all shadow-[0_0_20px_rgba(245,158,11,0.3)] flex items-center justify-center space-x-2 cursor-pointer"
              >
                {selectedRoleLoading === 'owner' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                ) : (
                  <>
                    <span>Continue as Venue Owner</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </motion.div>

          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center px-4 py-12 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-0 w-[600px] h-[600px] bg-indigo-600/6 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-violet-600/6 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 w-full max-w-[440px]">
        <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center space-x-3 mb-8">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-display font-black text-xl shadow-[0_0_24px_rgba(99,102,241,0.5)]">T</div>
          <span className="font-display font-black text-2xl text-white tracking-widest">TURFINGTON</span>
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div key="main" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <Card className="p-7 space-y-5">
              <div className="text-center">
                <h2 className="font-display font-black text-2xl text-white tracking-tight">
                  {isSignUp ? 'Create your account' : 'Welcome back'}
                </h2>
                <p className="text-neutral-400 text-xs mt-1.5 font-light">
                  {isSignUp ? 'Sign up to connect with players' : 'Sign in to continue'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleGoogleSubmit}
                className="w-full flex items-center justify-center gap-3 py-3.5 bg-white hover:bg-neutral-100 text-gray-800 font-bold text-sm rounded-full transition-all shadow-lg"
              >
                <GoogleLogo />
                <span>Continue with Google</span>
              </button>

              <Divider label="or" />

              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
                  <>
                    <Input
                      label="Full Name" icon={User}
                      value={name} onChange={e => setName(e.target.value)}
                      placeholder="Enter your name" error={errors.name}
                    />
                    <Input
                      label="Username" icon={User}
                      value={username} onChange={e => setUsername(e.target.value.toLowerCase())}
                      placeholder="Choose a username" error={errors.username}
                    />
                  </>
                )}

                <Input
                  label={isSignUp ? "Email" : "Email or Username"} icon={Mail} type={isSignUp ? "email" : "text"}
                  value={email} onChange={e => setEmail(e.target.value)}
                  placeholder={isSignUp ? "you@example.com" : "Email or username"} error={errors.email}
                />

                <Input
                  label="Password" icon={User} type="password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Minimum 6 characters" error={errors.password}
                />

                {errors.global && (
                  <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-xs text-rose-400">
                    {errors.global}
                  </div>
                )}

                <button type="submit" disabled={loading}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-widest rounded-full transition-all shadow-[0_0_20px_rgba(99,102,241,0.25)] flex items-center justify-center gap-2 cursor-pointer">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : isSignUp ? 'Create Account' : 'Sign In'}
                </button>
              </form>
            </Card>

            <div className="mt-8 text-center">
              <button onClick={() => setIsSignUp(!isSignUp)} className="text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer">
                {isSignUp ? (
                  <>Already have an account? <span className="text-white font-bold tracking-wider">Log In</span></>
                ) : (
                  <>Don't have an account? <span className="text-white font-bold tracking-wider">Sign Up</span></>
                )}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
