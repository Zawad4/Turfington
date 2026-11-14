import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { apiFetchProfile, apiFetchProfileByEmail, ensureUserProfile, apiSaveSavedProfile, getAdminAvatar } from '../services/db';

const AuthContext = createContext(null);

const STORAGE_KEY = 'turfington_active_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return null;
      const parsed = JSON.parse(stored);
      // Self-heal any legacy bleed: non-admin accounts must never hold @admin handle or admin shield avatar
      if (parsed && parsed.role !== 'admin' && !parsed.is_admin) {
        if (parsed.player_id === '@admin') delete parsed.player_id;
        if (parsed.handle === '@admin') delete parsed.handle;
        if (parsed.username === 'admin') parsed.username = (parsed.email || 'user').split('@')[0];
        if (parsed.avatar && parsed.avatar.includes("circle cx='50' cy='50' r='48' fill='%2313131c'")) {
          parsed.avatar = '';
          parsed.avatar_url = '';
        }
      }
      return parsed;
    } catch {
      return null;
    }
  });

  const [firebaseUser, setFirebaseUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Sync to localStorage whenever user state changes
  useEffect(() => {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (err) {
      console.warn('Failed to persist user in storage:', err);
    }
  }, [user]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          let currentActive = null;
          try { currentActive = stored ? JSON.parse(stored) : null; } catch {}

          // If the user previously switched to a specific account, don't overwrite it with fbUser
          if (currentActive && currentActive.id && currentActive.id !== fbUser.uid && currentActive.email !== fbUser.email) {
            // Re-fetch latest verification state for current active account
            try {
              const activeProf = await apiFetchProfile(currentActive.id);
              if (activeProf && typeof activeProf.is_verified === 'boolean') {
                const refreshed = { ...currentActive, ...activeProf, is_verified: activeProf.is_verified };
                setUser(refreshed);
                localStorage.setItem(STORAGE_KEY, JSON.stringify(refreshed));
                setAuthLoading(false);
                return;
              }
            } catch {}
            setUser(currentActive);
            setAuthLoading(false);
            return;
          }

          let profile = await apiFetchProfile(fbUser.uid);
          if (!profile && fbUser.email) {
            profile = await apiFetchProfileByEmail(fbUser.email);
          }
          if (profile) {
            setUser((prev) => {
              const isSameUser = prev && (
                (prev.id && (prev.id === profile.id || prev.id === profile.firebase_uid)) ||
                (prev.firebase_uid && (prev.firebase_uid === profile.id || prev.firebase_uid === profile.firebase_uid)) ||
                (prev.email && profile.email && prev.email.toLowerCase() === profile.email.toLowerCase())
              );
              const base = isSameUser ? prev : {};
              const merged = { ...base, ...profile, is_verified: !!profile.is_verified };
              if (merged.role !== 'admin' && !merged.is_admin) {
                if (merged.player_id === '@admin') delete merged.player_id;
                if (merged.handle === '@admin') delete merged.handle;
                if (merged.username === 'admin') merged.username = (merged.email || 'user').split('@')[0];
                if (merged.avatar && merged.avatar.includes("circle cx='50' cy='50' r='48' fill='%2313131c'")) {
                  merged.avatar = '';
                  merged.avatar_url = '';
                }
              }
              return merged;
            });
            ensureUserProfile(profile).catch(() => {});
          } else {
            const fallbackProfile = {
              id: fbUser.uid,
              firebase_uid: fbUser.uid,
              full_name: fbUser.displayName || 'Athlete',
              email: fbUser.email || '',
              avatar: fbUser.photoURL || '',
              avatar_url: fbUser.photoURL || '',
              role: 'player',
              is_verified: false,
              auth_provider: fbUser.providerData?.some((p) => p.providerId === 'google.com') ? 'google' : 'email'
            };
            setUser(fallbackProfile);
            ensureUserProfile(fallbackProfile).catch(() => {});
          }
        } catch (err) {
          console.error('Error fetching user profile:', err);
        }
      } else {
        setFirebaseUser(null);
      }
      setAuthLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Real-time verification listener across tabs and components
  useEffect(() => {
    const handleVerifyEvent = (e) => {
      const { userId, isVerified } = e.detail || {};
      if (!userId) return;
      setUser(prev => {
        if (!prev) return prev;
        const myId = prev.id || prev.uid || prev.firebase_uid;
        if (myId === userId || prev.email === userId) {
          const updated = { ...prev, is_verified: !!isVerified };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            localStorage.setItem('turfington_current_profile', JSON.stringify(updated));
          } catch {}
          return updated;
        }
        return prev;
      });
    };
    window.addEventListener('turfington_user_verified', handleVerifyEvent);
    return () => window.removeEventListener('turfington_user_verified', handleVerifyEvent);
  }, []);

  const login = useCallback((userData) => {
    if (!userData) return;
    const isTargetAdmin = userData.role === 'admin' || userData.is_admin === true || (userData.email || '').toLowerCase() === 'admin@turfington.com';
    const sanitized = {
      id: userData.id || userData.firebase_uid || 'usr_' + Date.now(),
      firebase_uid: userData.firebase_uid || userData.id || '',
      full_name: userData.full_name || userData.name || (isTargetAdmin ? 'Turfington Support & Security' : 'Turfington Member'),
      email: userData.email || (isTargetAdmin ? 'admin@turfington.com' : ''),
      role: isTargetAdmin ? 'admin' : (userData.role || 'player'),
      avatar: userData.avatar || userData.avatar_url || (isTargetAdmin ? getAdminAvatar() : ''),
      avatar_url: userData.avatar_url || userData.avatar || (isTargetAdmin ? getAdminAvatar() : ''),
      is_profile_complete: true,
      is_verified: isTargetAdmin || !!userData.is_verified,
      ...userData
    };
    if (!isTargetAdmin) {
      if (sanitized.player_id === '@admin') delete sanitized.player_id;
      if (sanitized.handle === '@admin') delete sanitized.handle;
      if (sanitized.username === 'admin') sanitized.username = (sanitized.email || 'user').split('@')[0];
      if (sanitized.avatar && sanitized.avatar.includes("circle cx='50' cy='50' r='48' fill='%2313131c'")) {
        sanitized.avatar = '';
        sanitized.avatar_url = '';
      }
    }
    setUser(sanitized);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      localStorage.setItem('turfington_current_profile', JSON.stringify(sanitized));
      localStorage.setItem('turfington_user', JSON.stringify(sanitized));
    } catch {}
    apiSaveSavedProfile(sanitized, sanitized.email || sanitized.id).catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    try {
      await fbSignOut(auth).catch(() => {});
    } finally {
      setUser(null);
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const switchProfile = useCallback((selectedProfile) => {
    if (!selectedProfile) return;
    const isTargetAdmin = selectedProfile.role === 'admin' || selectedProfile.is_admin === true || (selectedProfile.email || '').toLowerCase() === 'admin@turfington.com';
    const sanitized = {
      id: selectedProfile.id || selectedProfile.firebase_uid || 'prof_' + Date.now(),
      firebase_uid: selectedProfile.firebase_uid || selectedProfile.id || '',
      full_name: selectedProfile.full_name || selectedProfile.name || (isTargetAdmin ? 'Turfington Support & Security' : 'Turfington Member'),
      email: selectedProfile.email || (isTargetAdmin ? 'admin@turfington.com' : 'user@turfington.com'),
      username: isTargetAdmin ? 'admin' : (selectedProfile.username !== 'admin' ? (selectedProfile.username || (selectedProfile.email || 'user').split('@')[0]) : (selectedProfile.email || 'user').split('@')[0]),
      role: isTargetAdmin ? 'admin' : (selectedProfile.role || 'player'),
      avatar: selectedProfile.avatar_url || selectedProfile.avatar || (isTargetAdmin ? getAdminAvatar() : ''),
      avatar_url: selectedProfile.avatar_url || selectedProfile.avatar || (isTargetAdmin ? getAdminAvatar() : ''),
      coverImage: selectedProfile.cover_image || selectedProfile.coverImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80',
      is_profile_complete: true,
      is_verified: isTargetAdmin || !!selectedProfile.is_verified,
      socials: selectedProfile.socials || {},
      ...selectedProfile
    };
    if (!isTargetAdmin) {
      if (sanitized.player_id === '@admin') delete sanitized.player_id;
      if (sanitized.handle === '@admin') delete sanitized.handle;
      if (sanitized.username === 'admin') sanitized.username = (sanitized.email || 'user').split('@')[0];
      if (sanitized.avatar && sanitized.avatar.includes("circle cx='50' cy='50' r='48' fill='%2313131c'")) {
        sanitized.avatar = '';
        sanitized.avatar_url = '';
      }
    }
    setUser(sanitized);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
      localStorage.setItem('turfington_current_profile', JSON.stringify(sanitized));
      localStorage.setItem('turfington_user', JSON.stringify(sanitized));
    } catch {}
    apiSaveSavedProfile(sanitized, sanitized.email || sanitized.id).catch(() => {});
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => {
      const merged = { ...prev, ...updates };
      if (merged.role !== 'admin' && !merged.is_admin) {
        if (merged.player_id === '@admin') delete merged.player_id;
        if (merged.handle === '@admin') delete merged.handle;
        if (merged.username === 'admin') merged.username = (merged.email || 'user').split('@')[0];
        if (merged.avatar && merged.avatar.includes("circle cx='50' cy='50' r='48' fill='%2313131c'")) {
          merged.avatar = '';
          merged.avatar_url = '';
        }
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        localStorage.setItem('turfington_current_profile', JSON.stringify(merged));
        localStorage.setItem('turfington_user', JSON.stringify(merged));
      } catch {}
      apiSaveSavedProfile(merged, merged.email || merged.id).catch(() => {});
      return merged;
    });
  }, []);

  const isOwner = user?.role === 'owner';
  const isAdmin = user?.role === 'admin' || user?.is_admin === true;

  const value = {
    user,
    firebaseUser,
    authLoading,
    isOwner,
    isAdmin,
    login,
    logout,
    switchProfile,
    updateUser
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

