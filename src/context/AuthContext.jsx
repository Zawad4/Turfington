import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '../services/firebase';
import { apiFetchProfile, apiFetchProfileByEmail, ensureUserProfile, apiSaveSavedProfile } from '../services/db';

const AuthContext = createContext(null);

const STORAGE_KEY = 'turfington_active_user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
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
            setUser(currentActive);
            setAuthLoading(false);
            return;
          }

          let profile = await apiFetchProfile(fbUser.uid);
          if (!profile && fbUser.email) {
            profile = await apiFetchProfileByEmail(fbUser.email);
          }
          if (profile) {
            setUser((prev) => ({ ...prev, ...profile }));
            ensureUserProfile(profile).catch(() => {});
          } else {
            const fallbackProfile = {
              id: fbUser.uid,
              firebase_uid: fbUser.uid,
              full_name: fbUser.displayName || 'Athlete',
              email: fbUser.email || '',
              avatar: fbUser.photoURL || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
              role: 'player',
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

  const login = useCallback((userData) => {
    if (!userData) return;
    const sanitized = {
      id: userData.id || userData.firebase_uid || 'usr_' + Date.now(),
      firebase_uid: userData.firebase_uid || userData.id || '',
      full_name: userData.full_name || userData.name || 'Turfington Member',
      email: userData.email || '',
      role: userData.role || 'player',
      avatar: userData.avatar || userData.avatar_url || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
      is_profile_complete: true,
      ...userData
    };
    setUser(sanitized);
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
    const sanitized = {
      id: selectedProfile.id || selectedProfile.firebase_uid || 'prof_' + Date.now(),
      firebase_uid: selectedProfile.firebase_uid || selectedProfile.id || '',
      full_name: selectedProfile.full_name || selectedProfile.name || 'Turfington Member',
      email: selectedProfile.email || 'user@turfington.com',
      username: selectedProfile.username || (selectedProfile.email || 'user').split('@')[0],
      role: selectedProfile.role || 'player',
      avatar: selectedProfile.avatar_url || selectedProfile.avatar || 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200',
      coverImage: selectedProfile.cover_image || selectedProfile.coverImage || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&q=80',
      is_profile_complete: true,
      socials: selectedProfile.socials || {}
    };
    setUser(sanitized);
    apiSaveSavedProfile(sanitized, sanitized.email || sanitized.id).catch(() => {});
  }, []);

  const updateUser = useCallback((updates) => {
    setUser((prev) => {
      const merged = { ...prev, ...updates };
      apiSaveSavedProfile(merged, merged.email || merged.id).catch(() => {});
      return merged;
    });
  }, []);

  const isOwner = user?.role === 'owner';

  const value = {
    user,
    firebaseUser,
    authLoading,
    isOwner,
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

