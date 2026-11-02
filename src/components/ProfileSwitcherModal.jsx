import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, Building2, Check, Plus, X, ArrowLeftRight, 
  Loader2, Trash2, Mail, Lock, KeyRound, Sparkles 
} from 'lucide-react';
import { auth } from '../services/firebase';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { 
  apiFetchUserSavedProfiles, 
  apiSaveSavedProfile, 
  apiCreateProfile, 
  apiFetchProfile, 
  apiFetchProfileByEmail,
  apiDeleteUserSavedProfile, 
  apiUpdateProfile,
  getInterconnectedAccounts,
  saveInterconnectedAccount,
  removeInterconnectedAccount
} from '../services/db';
import { ensureUserProfile } from '../services/chatService';
import UserAvatar from './UserAvatar';
import SportIcon from './SportIcon';

const SPOTIFY_SPORTS_OPTIONS = [
  { id: 'football', name: 'Football', desc: 'Turf 7v7, 5v5 & League matches' },
  { id: 'cricket', name: 'Cricket', desc: 'Box cricket, Leather ball & Nets' },
  { id: 'badminton', name: 'Badminton', desc: 'Wooden & Synthetic indoor courts' },
  { id: 'basketball', name: 'Basketball', desc: 'Full court 5v5 & Streetball 3x3' },
  { id: 'tennis', name: 'Tennis', desc: 'Clay, Hard court & Singles/Doubles' },
  { id: 'table_tennis', name: 'Table Tennis', desc: 'Ping pong matches & Tournaments' },
  { id: 'volleyball', name: 'Volleyball', desc: 'Indoor & Beach volleyball courts' },
  { id: 'pickleball', name: 'Pickleball', desc: 'Fastest growing racket sport' },
  { id: 'bowling', name: 'Bowling', desc: '10-pin lanes & Arcade challenges' },
  { id: 'swimming', name: 'Swimming', desc: 'Lap pools & Aquatic training' }
];

export default function ProfileSwitcherModal({
  isOpen,
  onClose,
  activeUser,
  onSelectProfile
}) {
  const [profiles, setProfiles] = useState([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'

  // Loading & Error states
  const [authLoading, setAuthLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // New Account Onboarding States (Only for NEW Accounts!)
  const [onboardingNewProfile, setOnboardingNewProfile] = useState(null);
  const [onboardingStep, setOnboardingStep] = useState('role'); // 'role' | 'sports'
  const [onboardingRole, setOnboardingRole] = useState('player');
  const [onboardingSports, setOnboardingSports] = useState(['Football', 'Cricket']);

  // Load database-synced real profiles on mount or open
  useEffect(() => {
    if (!isOpen) return;
    async function loadDbProfiles() {
      setLoadingProfiles(true);
      // Ensure activeUser is registered into interconnected accounts
      if (activeUser) {
        saveInterconnectedAccount(activeUser);
      }

      const ownerKey = activeUser?.email || activeUser?.id;
      const dbProfiles = await apiFetchUserSavedProfiles(ownerKey);

      // Merge active user with all interconnected profiles without duplicates
      const map = new Map();
      if (activeUser) {
        const ak = String(activeUser.email || activeUser.id || '').trim().toLowerCase();
        if (ak) map.set(ak, activeUser);
      }
      dbProfiles.forEach(p => {
        const pk = String(p.email || p.id || '').trim().toLowerCase();
        if (pk) {
          if (map.has(pk)) {
            map.set(pk, { ...map.get(pk), ...p });
          } else {
            map.set(pk, p);
          }
        }
      });

      const list = Array.from(map.values());
      setProfiles(list);
      setLoadingProfiles(false);
    }
    loadDbProfiles();

    const handleAccountsUpdated = (e) => {
      if (e.detail && Array.isArray(e.detail)) {
        setProfiles(e.detail);
      }
    };
    window.addEventListener('turfington_accounts_updated', handleAccountsUpdated);
    return () => window.removeEventListener('turfington_accounts_updated', handleAccountsUpdated);
  }, [isOpen, activeUser]);

  if (!isOpen) return null;

  const handleSwitch = (prof) => {
    if (activeUser) {
      saveInterconnectedAccount(activeUser);
    }
    saveInterconnectedAccount(prof);
    onClose();
    setTimeout(() => {
      onSelectProfile(prof);
    }, 50);
  };

  // Remove Account from Saved Profiles & Firebase DB
  const handleRemoveAccount = async (e, targetProf) => {
    e.stopPropagation();
    if (confirm(`Remove account "${targetProf.full_name || targetProf.email}" from saved profiles?`)) {
      const ownerKey = activeUser?.email || activeUser?.id;
      await apiDeleteUserSavedProfile(targetProf.id || targetProf.email, ownerKey);
      removeInterconnectedAccount(targetProf.id || targetProf.email);
      setProfiles(prev => prev.filter(p => p.id !== targetProf.id && p.email !== targetProf.email));
    }
  };

  // Complete Onboarding for NEW Accounts
  const handleFinishOnboarding = async (chosenRole, chosenSports) => {
    if (!onboardingNewProfile) return;
    setAuthLoading(true);

    try {
      const formattedInterests = (chosenSports || []).map(s => {
        const item = SPOTIFY_SPORTS_OPTIONS.find(sp => sp.name === s);
        return { sport: s, level: 'Player' };
      });

      const completedProfile = {
        ...onboardingNewProfile,
        role: chosenRole,
        sports_interests: chosenSports || [],
        interests: formattedInterests,
        is_profile_complete: true,
        stats: chosenRole === 'owner' ? [
          { name: 'Hosted Events', value: '0' },
          { name: 'Followers', value: '0' },
          { name: 'Following', value: '0' },
          { name: 'Rating', value: '5.0' }
        ] : [
          { name: 'Matches', value: '0' },
          { name: 'Followers', value: '0' },
          { name: 'Following', value: '0' },
          { name: 'Win Rate', value: '0%' }
        ],
        streak: 0,
        achievements: [],
        history: []
      };

      if (activeUser) {
        saveInterconnectedAccount(activeUser);
      }
      await apiCreateProfile({ ...completedProfile, isNewRegistration: true });
      await apiSaveSavedProfile(completedProfile, activeUser?.email || activeUser?.id);
      saveInterconnectedAccount(completedProfile);

      const allAccounts = getInterconnectedAccounts();
      setProfiles(allAccounts);
      setAuthLoading(false);
      setOnboardingNewProfile(null);
      setShowAddForm(false);
      onSelectProfile(completedProfile);
      onClose();
    } catch (err) {
      console.error('Error completing onboarding:', err);
      setAuthLoading(false);
    }
  };

  // 1. Google Sign-In with Real Firebase Authentication
  const handleGoogleAddProfile = async () => {
    try {
      setErrorMsg('');
      setGoogleLoading(true);
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      if (result && result.user) {
        const googleEmail = result.user.email ? result.user.email.trim().toLowerCase() : '';
        const googleName = result.user.displayName || 'Sports Athlete';

        let profile = await apiFetchProfile(result.user.uid);
        if (!profile && googleEmail) {
          profile = await apiFetchProfileByEmail(googleEmail);
        }

        // IF EXISTING ACCOUNT -> SWITCH IMMEDIATELY! NO ONBOARDING STEPS!
        if (profile) {
          const finalRole = profile.role || 'player';
          const completeProfile = {
            ...profile,
            role: finalRole,
            auth_provider: 'google',
            is_google_user: true,
            is_profile_complete: true
          };
          apiUpdateProfile(completeProfile.id, { 
            role: finalRole, 
            auth_provider: 'google',
            is_google_user: true,
            is_profile_complete: true 
          }).catch(() => {});

          ensureUserProfile({
            ...completeProfile,
            uid: result.user.uid,
            displayName: completeProfile.full_name || completeProfile.name || googleName,
            email: googleEmail,
            avatarUrl: completeProfile.avatar || completeProfile.avatar_url || result.user.photoURL
          }).catch(() => {});

          if (activeUser) {
            saveInterconnectedAccount(activeUser);
          }
          await apiSaveSavedProfile(completeProfile, activeUser?.email || activeUser?.id);
          saveInterconnectedAccount(completeProfile);
          const allAccounts = getInterconnectedAccounts();
          setProfiles(allAccounts);
          setGoogleLoading(false);
          setShowAddForm(false);
          onSelectProfile(completeProfile);
          onClose();
          return;
        }

        // IF NEW ACCOUNT -> START ONBOARDING STEPS!
        const googlePhoto = result.user.photoURL || '';
        const newDraftProfile = {
          id: result.user.uid,
          uid: result.user.uid,
          firebase_uid: result.user.uid,
          full_name: googleName,
          displayName: googleName,
          email: result.user.email,
          username: (result.user.email || 'user').split('@')[0] + Math.floor(Math.random() * 1000),
          avatar: googlePhoto,
          avatar_url: googlePhoto,
          auth_provider: 'google',
          is_google_user: true,
          role: null,
          is_profile_complete: false
        };

        ensureUserProfile({
          ...newDraftProfile,
          uid: result.user.uid,
          displayName: googleName,
          email: googleEmail,
          avatarUrl: googlePhoto
        }).catch(() => {});

        setGoogleLoading(false);
        setOnboardingNewProfile(newDraftProfile);
        setOnboardingStep('role');
      }
    } catch (err) {
      setGoogleLoading(false);
      if (err.code !== 'auth/popup-closed-by-user') {
        setErrorMsg(err.message || 'Google Authentication failed');
      }
    }
  };

  // 2. Real Firebase Email/Password Sign-In & Sign-Up
  const handleFirebaseEmailAuth = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    try {
      setAuthLoading(true);
      let fbUserCredential;

      if (authMode === 'signup') {
        if (!fullName.trim()) {
          setErrorMsg('Full name is required for registration.');
          setAuthLoading(false);
          return;
        }

        const existingProf = await apiFetchProfileByEmail(email.trim());
        if (existingProf) {
          setAuthLoading(false);
          if (existingProf.role === 'player') {
            setErrorMsg('account already exist as player');
          } else if (existingProf.role === 'owner') {
            setErrorMsg('account already exist as venue owner');
          } else {
            setErrorMsg('account already exist');
          }
          return;
        }

        fbUserCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);

        // NEW ACCOUNT SIGN UP -> START ONBOARDING STEPS!
        const newDraftProfile = {
          id: fbUserCredential.user.uid,
          firebase_uid: fbUserCredential.user.uid,
          full_name: fullName.trim(),
          email: email.trim(),
          username: email.trim().split('@')[0] + Math.floor(Math.random() * 1000),
          role: null,
          avatar: '',
          avatar_url: '',
          is_profile_complete: false
        };

        setAuthLoading(false);
        setOnboardingNewProfile(newDraftProfile);
        setOnboardingStep('role');
      } else {
        // Sign into existing Firebase account
        fbUserCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
        let profile = await apiFetchProfile(fbUserCredential.user.uid);
        if (!profile) {
          profile = await apiFetchProfileByEmail(email.trim());
        }

        // ── EXISTING ACCOUNT: SWITCH IMMEDIATELY! NO ONBOARDING STEPS! ──
        const finalRole = profile?.role || 'player';
        const finalProfile = {
          ...(profile || {}),
          id: profile?.id || fbUserCredential.user.uid,
          firebase_uid: fbUserCredential.user.uid,
          email: email.trim(),
          full_name: profile?.full_name || profile?.name || email.trim().split('@')[0],
          username: profile?.username || email.trim().split('@')[0],
          role: finalRole,
          sports_interests: profile?.sports_interests || ['Football', 'Cricket'],
          interests: profile?.interests || [
            { sport: 'Football', level: 'Player',  },
            { sport: 'Cricket', level: 'Player',  }
          ],
          is_profile_complete: true
        };

        apiUpdateProfile(finalProfile.id, { role: finalRole, is_profile_complete: true }).catch(() => {});
        if (activeUser) {
          saveInterconnectedAccount(activeUser);
        }
        apiUpdateProfile(finalProfile.id, { role: finalRole, is_profile_complete: true }).catch(() => {});
        await apiSaveSavedProfile(finalProfile, activeUser?.email || activeUser?.id);
        saveInterconnectedAccount(finalProfile);
        const allAccounts = getInterconnectedAccounts();
        setProfiles(allAccounts);
        setAuthLoading(false);
        setShowAddForm(false);
        onSelectProfile(finalProfile);
        onClose();
        return;
      }
    } catch (err) {
      setAuthLoading(false);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setErrorMsg('Invalid email or password. Please check your credentials.');
      } else if (err.code === 'auth/email-already-in-use') {
        const existingProf = await apiFetchProfileByEmail(email.trim());
        if (existingProf?.role === 'player') {
          setErrorMsg('account already exist as player');
        } else if (existingProf?.role === 'owner') {
          setErrorMsg('account already exist as venue owner');
        } else {
          setErrorMsg('An account with this email already exists.');
        }
      } else {
        setErrorMsg(err.message || 'Firebase Authentication failed');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.8 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black backdrop-blur-sm"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative glass-card w-full max-w-[480px] p-6 border border-white/10 shadow-2xl text-left z-10"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/5">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display font-black text-base uppercase text-white tracking-wider">
                {onboardingNewProfile ? 'New Account Setup' : 'Switch Account'}
              </h3>
              <p className="text-[10px] text-neutral-400">
                {onboardingNewProfile ? 'Complete new user steps' : 'Firebase & Database Authenticated Accounts'}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── SCREEN 1: NEW ACCOUNT ONBOARDING (Role & Sports Preferences) ── */}
        {onboardingNewProfile ? (
          <div className="space-y-4 mt-4 text-left">
            {/* Step 1: Role Selection */}
            {onboardingStep === 'role' && (
              <div className="space-y-4">
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Step 1 of 2 • Select Account Role</span>
                </div>

                <div>
                  <h4 className="text-base font-black font-display text-white">
                    Choose role for <span className="text-indigo-400">{onboardingNewProfile.full_name || onboardingNewProfile.email}</span>
                  </h4>
                  <p className="text-xs text-neutral-400 mt-1 font-light">
                    Select your primary role on Turfington.
                  </p>
                </div>

                <div className="grid grid-cols-1 gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setOnboardingRole('player')}
                    className={`p-4 rounded-2xl border transition-all text-left flex items-start space-x-3.5 cursor-pointer ${
                      onboardingRole === 'player'
                        ? 'bg-indigo-600/20 border-indigo-500 ring-1 ring-indigo-500/50 text-white'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 mt-0.5">
                      <User className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-black text-white uppercase tracking-wider">Sports Player</h5>
                      <p className="text-[11px] text-neutral-400 mt-0.5 font-light">
                        Book turfs, join public matches, track sports stats & connect with athletes.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOnboardingRole('owner')}
                    className={`p-4 rounded-2xl border transition-all text-left flex items-start space-x-3.5 cursor-pointer ${
                      onboardingRole === 'owner'
                        ? 'bg-amber-500/20 border-amber-400 ring-1 ring-amber-400/50'
                        : 'bg-white/[0.02] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 mt-0.5">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h5 className="text-xs font-black text-white uppercase tracking-wider">Venue Owner</h5>
                      <p className="text-[11px] text-neutral-400 mt-0.5 font-light">
                        Host matches, list turfs/venues, manage slots & track revenue bookings.
                      </p>
                    </div>
                  </button>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setOnboardingNewProfile(null)}
                    className="px-4 py-2 text-xs font-bold text-neutral-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (onboardingRole === 'owner') {
                        handleFinishOnboarding('owner', []);
                      } else {
                        setOnboardingStep('sports');
                      }
                    }}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-full shadow-lg shadow-indigo-600/30 cursor-pointer"
                  >
                    {onboardingRole === 'owner' ? 'Complete & Switch' : 'Next: Sports Preferences →'}
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Sports Preferences (Only for Players) */}
            {onboardingStep === 'sports' && (
              <div className="space-y-4">
                <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Step 2 of 2 • Sports Preferences</span>
                </div>

                <div>
                  <h4 className="text-base font-black font-display text-white">
                    What sports do you play?
                  </h4>
                  <p className="text-xs text-neutral-400 mt-0.5 font-light">
                    Select your favorite sports to personalize recommendations & profile stats.
                  </p>
                </div>

                {/* Sports Grid */}
                <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1 no-scrollbar">
                  {SPOTIFY_SPORTS_OPTIONS.map(sp => {
                    const isSelected = onboardingSports.includes(sp.name);

                    return (
                      <button
                        key={sp.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setOnboardingSports(prev => prev.filter(s => s !== sp.name));
                          } else {
                            setOnboardingSports(prev => [...prev, sp.name]);
                          }
                        }}
                        className={`p-3 rounded-xl border text-left flex items-center justify-between cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-500'
                            : 'bg-white/[0.02] border-white/10 text-neutral-400 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <SportIcon sport={sp.name} size={18} className={isSelected ? 'text-white' : 'text-indigo-400'} />
                          <span className="text-xs font-bold">{sp.name}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <button
                    type="button"
                    onClick={() => setOnboardingStep('role')}
                    className="px-4 py-2 text-xs font-bold text-neutral-400 hover:text-white"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    disabled={onboardingSports.length === 0 || authLoading}
                    onClick={() => handleFinishOnboarding('player', onboardingSports)}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-full shadow-lg shadow-indigo-600/30 cursor-pointer disabled:opacity-50 flex items-center space-x-2"
                  >
                    {authLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <span>Complete & Switch Account</span>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : !showAddForm ? (
          /* ── SCREEN 2: SAVED ACCOUNTS LIST ── */
          <div className="space-y-3 mt-4">
            {loadingProfiles ? (
              <div className="py-8 text-center text-neutral-400 text-xs flex flex-col items-center justify-center space-y-2">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                <span>Syncing authenticated accounts from Database...</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1 no-scrollbar">
                {profiles.map((prof) => {
                  const isActive = activeUser && (activeUser.id === prof.id || activeUser.email === prof.email);

                  return (
                    <div
                      key={prof.id || prof.email}
                      onClick={() => handleSwitch(prof)}
                      className={`p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer flex items-center justify-between group ${
                        isActive
                          ? 'bg-indigo-600/15 border-indigo-500/50 shadow-lg shadow-indigo-950/40 ring-1 ring-indigo-500/30'
                          : 'bg-white/[0.02] border-white/5 hover:border-white/20 hover:bg-white/[0.05]'
                      }`}
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="relative flex-shrink-0">
                          <UserAvatar user={prof} className="w-10 h-10 text-sm" />
                          <span className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-black ${
                            prof.role === 'owner' ? 'bg-amber-400' : 'bg-indigo-400'
                          }`} />
                        </div>

                        <div className="min-w-0 text-left">
                          <div className="flex items-center space-x-2">
                            <p className="text-xs font-black text-white truncate group-hover:text-indigo-400 transition-colors">
                              {prof.full_name || 'Authenticated Member'}
                            </p>
                            <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${
                              prof.role === 'owner'
                                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                                : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/25'
                            }`}>
                              {prof.role === 'owner' ? 'Venue Owner' : 'Player'}
                            </span>
                          </div>
                          <p className="text-[10px] text-neutral-400 truncate mt-0.5">{prof.email}</p>
                        </div>
                      </div>

                      {/* Right Action Buttons */}
                      <div className="flex items-center space-x-2">
                        {isActive ? (
                          <div className="flex items-center space-x-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 px-2.5 py-1 rounded-full text-[10px] font-bold">
                            <Check className="w-3 h-3" />
                            <span>Active</span>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={(e) => handleRemoveAccount(e, prof)}
                              title="Remove saved account"
                              className="p-2 text-rose-400 hover:bg-rose-500/20 hover:text-rose-300 rounded-xl border border-rose-500/20 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            <button className="text-[10px] font-extrabold uppercase bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl border border-indigo-500/30 transition-all cursor-pointer shadow-md shadow-indigo-600/20">
                              Switch
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Actions */}
            <div className="pt-3 border-t border-white/5">
              <button
                type="button"
                onClick={() => { setShowAddForm(true); setErrorMsg(''); }}
                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold uppercase tracking-wider rounded-full transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-lg shadow-indigo-600/30"
              >
                <Plus className="w-4 h-4" />
                <span>Add Account</span>
              </button>
            </div>
          </div>
        ) : (
          /* ── SCREEN 3: AUTHENTICATE ADD ACCOUNT FORM ── */
          <div className="space-y-4 mt-4 text-left">
            {errorMsg && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 font-medium">
                {errorMsg}
              </div>
            )}

            {/* Google OAuth Button */}
            <button
              type="button"
              onClick={handleGoogleAddProfile}
              disabled={googleLoading || authLoading}
              className="w-full py-3 px-4 bg-white text-black font-extrabold text-xs rounded-xl hover:bg-neutral-200 transition-all flex items-center justify-center space-x-2.5 cursor-pointer shadow-md disabled:opacity-50"
            >
              {googleLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-black" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
              )}
              <span>{googleLoading ? 'Authenticating with Google...' : 'Continue with Google'}</span>
            </button>

            <div className="flex items-center my-3">
              <div className="flex-grow border-t border-white/10" />
              <span className="px-3 text-[10px] text-neutral-500 uppercase font-bold">Or Firebase Email Auth</span>
              <div className="flex-grow border-t border-white/10" />
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/40 border border-white/10 rounded-xl">
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setErrorMsg(''); }}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                  authMode === 'login' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Sign In to Account
              </button>
              <button
                type="button"
                onClick={() => { setAuthMode('signup'); setErrorMsg(''); }}
                className={`py-1.5 text-xs font-bold rounded-lg transition-all ${
                  authMode === 'signup' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-neutral-400 hover:text-white'
                }`}
              >
                Create New Account
              </button>
            </div>

            {/* Firebase Auth Form */}
            <form onSubmit={handleFirebaseEmailAuth} className="space-y-3">
              {authMode === 'signup' && (
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider">Full Name</label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 absolute left-3.5 top-3 text-neutral-500" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Ramesh Kumar"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 bg-neutral-900 border border-white/10 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider font-display">Email Address</label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-3.5 top-3 text-neutral-500" />
                  <input
                    type="email"
                    required
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-neutral-900 border border-white/10 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] text-neutral-400 uppercase font-bold tracking-wider font-display">Password</label>
                <div className="relative">
                  <KeyRound className="w-3.5 h-3.5 absolute left-3.5 top-3 text-neutral-500" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2.5 bg-neutral-900 border border-white/10 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAddForm(false); setErrorMsg(''); }}
                  className="flex-1 py-2.5 text-xs font-bold text-neutral-400 hover:text-white border border-white/10 rounded-xl cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex-1 py-2.5 text-xs font-black uppercase bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all cursor-pointer shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-1.5 disabled:opacity-50"
                >
                  {authLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span>{authMode === 'signup' ? 'Continue' : 'Sign In & Switch'}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </motion.div>
    </div>
  );
}
