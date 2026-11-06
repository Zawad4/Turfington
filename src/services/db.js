import { sanitizeLocationToEnglish } from '../utils/locationHelper.js';
import { db, auth, storage } from './firebase.js';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 

  deleteUser, 
  signOut, 
  reauthenticateWithPopup, 
  reauthenticateWithCredential,
  GoogleAuthProvider, 
  EmailAuthProvider 
} from 'firebase/auth';

/* ── Timeout Helper ─────────────────────────────────────────── */
async function withTimeout(promise, ms = 2000) {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ isTimeout: true }), ms);
  });
  try {
    const res = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timer);
    if (res && res.isTimeout) {
      return { data: null, error: { message: 'Request timed out' } };
    }
    return { data: res, error: null };
  } catch (err) {
    clearTimeout(timer);
    return { data: null, error: err };
  }
}

/* ── Local Profile Cache Helpers ────────────────────────────── */
const getLocalProfile = (firebaseUid) => {
  try {
    const stored = localStorage.getItem('turfington_profile_' + firebaseUid);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const setLocalProfile = (profile) => {
  if (!profile) return;
  try {
    const serialized = JSON.stringify(profile);
    if (profile.firebase_uid) {
      localStorage.setItem('turfington_profile_' + profile.firebase_uid, serialized);
    }
    if (profile.id) {
      localStorage.setItem('turfington_profile_' + profile.id, serialized);
    }
    localStorage.setItem('turfington_current_profile', serialized);
    localStorage.setItem('turfington_active_user', serialized);
    localStorage.setItem('turfington_user', serialized);

    // Sync into turfington_accounts
    const accStr = localStorage.getItem('turfington_accounts');
    if (accStr && profile.email) {
      const accounts = JSON.parse(accStr);
      accounts[profile.email.trim().toLowerCase()] = profile;
      localStorage.setItem('turfington_accounts', JSON.stringify(accounts));
    }
  } catch (err) {
    console.warn('setLocalProfile error:', err);
  }
};

// -- 1. Profiles ---------------------------------------------

export async function apiFetchProfile(firebaseUid) {
  if (!firebaseUid) return null;

  // 1. Check local cache first for instant load
  const cached = getLocalProfile(firebaseUid);
  
  // 2. Query Express backend server (shared cross-device database on localhost)
  try {
    const res = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(firebaseUid)}`);
    if (res.ok) {
      const serverProfile = await res.json();
      if (serverProfile) {
        setLocalProfile(serverProfile);
        return serverProfile;
      }
    }
  } catch (e) {}

  // 3. Query Firestore
  try {
    const docRef = doc(db, 'profiles', firebaseUid);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = { id: snap.id, ...snap.data() };
      setLocalProfile(data);
      return data;
    }

    const q = query(collection(db, 'profiles'), where('firebase_uid', '==', firebaseUid), limit(1));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const firstDoc = querySnap.docs[0];
      const data = { id: firstDoc.id, ...firstDoc.data() };
      setLocalProfile(data);
      return data;
    }
  } catch (err) {
    console.warn('Firestore apiFetchProfile error:', err);
  }

  // Fallback to cached
  if (cached) return cached;
  
  try {
    const current = localStorage.getItem('turfington_current_profile');
    if (current) {
      const p = JSON.parse(current);
      if (p.firebase_uid === firebaseUid || p.id === firebaseUid) return p;
    }
  } catch {}
  
  return null;
}

export async function apiFetchProfileByEmail(email) {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();

  // 1. Query Express backend server
  try {
    const res = await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(cleanEmail)}`);
    if (res.ok) {
      const serverProfile = await res.json();
      if (serverProfile) {
        setLocalProfile(serverProfile);
        return serverProfile;
      }
    }
  } catch (e) {}

  // 2. Query Firestore
  try {
    const q = query(collection(db, 'profiles'), where('email', '==', cleanEmail), limit(1));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const firstDoc = querySnap.docs[0];
      const data = { id: firstDoc.id, ...firstDoc.data() };
      setLocalProfile(data);
      return data;
    }
  } catch (err) {
    console.warn('Firestore apiFetchProfileByEmail error:', err);
  }

  // 3. Check local saved profiles fallback
  try {
    const s = localStorage.getItem('turfington_accounts');
    if (s) {
      const accounts = JSON.parse(s);
      const matched = accounts[cleanEmail];
      if (matched) return matched;
    }
  } catch {}

  return null;
}

export async function apiCreateProfile(profileData) {
  const profileId = profileData.firebase_uid || profileData.id || ('usr_' + Date.now());
  const email = profileData.email ? profileData.email.trim().toLowerCase() : '';

  if (email && email !== 'googleuser@turfington.com') {
    const existing = await apiFetchProfileByEmail(email);
    if (existing && existing.id !== profileId && existing.firebase_uid !== profileId) {
      if (profileData.isNewRegistration) {
        const roleMsg = existing.role === 'player'
          ? 'account already exist as player'
          : existing.role === 'owner'
          ? 'account already exist as venue owner'
          : 'account already exist';
        return { success: false, error: roleMsg };
      } else {
        const mergedProfile = {
          ...existing,
          ...profileData,
          id: existing.id || profileId,
          firebase_uid: profileId,
          is_profile_complete: existing.is_profile_complete !== undefined ? existing.is_profile_complete : true
        };

        // Persist to server.js
        fetch(`${API_BASE}/api/profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mergedProfile)
        }).catch(() => {});

        try {
          const userRef = doc(db, 'profiles', mergedProfile.id);
          await setDoc(userRef, { ...mergedProfile, updatedAt: serverTimestamp() }, { merge: true });
        } catch {}
        setLocalProfile(mergedProfile);
        return { success: true, profile: mergedProfile };
      }
    }
  }

  const profileToSave = {
    id: profileId,
    firebase_uid: profileId,
    created_at: new Date().toISOString(),
    is_profile_complete: profileData.is_profile_complete !== undefined 
      ? profileData.is_profile_complete 
      : (profileData.role ? true : false),
    role: profileData.role || null,
    ...profileData
  };

  // Persist to server.js
  fetch(`${API_BASE}/api/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profileToSave)
  }).catch(() => {});

  // Persist to Firestore (both profiles and users collections)
  try {
    const userRef = doc(db, 'profiles', profileId);
    await setDoc(userRef, {
      ...profileToSave,
      updatedAt: serverTimestamp()
    }, { merge: true });

    const rootUserRef = doc(db, 'users', profileId);
    await setDoc(rootUserRef, {
      uid: profileId,
      id: profileId,
      displayName: profileToSave.full_name || profileToSave.name || 'Athlete',
      name: profileToSave.full_name || profileToSave.name || 'Athlete',
      email: profileToSave.email || '',
      avatarUrl: profileToSave.avatar || profileToSave.avatar_url || '',
      role: profileToSave.role || 'player',
      sport: profileToSave.sport || 'Football',
      location: profileToSave.location || 'Chennai, India',
      auth_provider: profileToSave.auth_provider || (profileToSave.email?.includes('gmail') ? 'google' : 'email'),
      is_google_user: !!(profileToSave.auth_provider === 'google' || profileToSave.is_google_user || profileToSave.email?.includes('gmail') || profileToSave.avatar?.includes('googleusercontent')),
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.warn('Firestore apiCreateProfile error:', err);
  }

  setLocalProfile(profileToSave);
  return { success: true, profile: profileToSave };
}

export async function apiUpdateProfile(profileId, updates) {
  let existing = null;
  try {
    const cachedStr = localStorage.getItem('turfington_profile_' + profileId) || localStorage.getItem('turfington_current_profile');
    if (cachedStr) existing = JSON.parse(cachedStr);
  } catch {}

  const updatedProfile = {
    ...(existing || {}),
    ...updates,
    id: profileId,
    updated_at: new Date().toISOString()
  };

  setLocalProfile(updatedProfile);

  // Persist to Express server.js
  fetch(`${API_BASE}/api/profiles/${encodeURIComponent(profileId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updatedProfile)
  }).catch(() => {});

  // Firestore update (both profiles and users collections)
  try {
    const userRef = doc(db, 'profiles', profileId);
    setDoc(userRef, {
      ...updates,
      updatedAt: serverTimestamp()
    }, { merge: true }).catch(err => console.warn('Firestore apiUpdateProfile warning:', err));

    const rootUserRef = doc(db, 'users', profileId);
    setDoc(rootUserRef, {
      ...updates,
      updatedAt: serverTimestamp()
    }, { merge: true }).catch(() => {});
  } catch (e) {}

  return { success: true, data: updatedProfile };
}

export function calculateAndUpdateDailyStreak(user) {
  return user;
}

export const CONNECTED_ACCOUNTS_KEY = 'turfington_connected_accounts';

/**
 * Returns all interconnected accounts stored on this browser/client.
 * Scans unified storage, legacy keys, active user, and merges them deduplicated.
 */
export function getInterconnectedAccounts() {
  const map = new Map();

  // 1. Read master unified accounts list
  try {
    const raw = localStorage.getItem(CONNECTED_ACCOUNTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        parsed.forEach(p => {
          if (!p) return;
          const k = String(p.email || p.id || p.firebase_uid || '').trim().toLowerCase();
          if (k) map.set(k, p);
        });
      }
    }
  } catch {}

  // 2. Scan any legacy turfington_saved_profiles_* keys and merge them
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('turfington_saved_profiles') || key === 'turfington_all_profiles' || key === 'turfington_profiles')) {
        try {
          const val = JSON.parse(localStorage.getItem(key));
          if (Array.isArray(val)) {
            val.forEach(p => {
              if (!p) return;
              const k = String(p.email || p.id || p.firebase_uid || '').trim().toLowerCase();
              if (k && !map.has(k)) map.set(k, p);
            });
          }
        } catch {}
      }
    }
  } catch {}

  // 3. Include currently active user if stored
  try {
    const rawUser = localStorage.getItem('turfington_user');
    if (rawUser) {
      const cur = JSON.parse(rawUser);
      if (cur) {
        const k = String(cur.email || cur.id || cur.firebase_uid || '').trim().toLowerCase();
        if (k) {
          map.set(k, { ...(map.get(k) || {}), ...cur });
        }
      }
    }
  } catch {}

  return Array.from(map.values());
}

/**
 * Saves or updates an account in the interconnected accounts store.
 * Synchronizes across master key and all legacy user keys so every account sees all other accounts.
 */
export function saveInterconnectedAccount(profileData) {
  if (!profileData) return getInterconnectedAccounts();
  const existing = getInterconnectedAccounts();
  const k = String(profileData.email || profileData.id || profileData.firebase_uid || '').trim().toLowerCase();
  if (!k) return existing;

  const sanitized = {
    ...profileData,
    id: profileData.id || profileData.firebase_uid || ('usr_' + Date.now()),
    firebase_uid: profileData.firebase_uid || profileData.id || '',
    full_name: profileData.full_name || profileData.name || 'Member',
    email: profileData.email || '',
    role: profileData.role || 'player',
    is_profile_complete: true,
    updated_at: new Date().toISOString()
  };

  const map = new Map();
  // Put updated profile first
  map.set(k, sanitized);
  existing.forEach(p => {
    const pk = String(p.email || p.id || p.firebase_uid || '').trim().toLowerCase();
    if (pk && pk !== k) {
      map.set(pk, p);
    }
  });

  const updatedList = Array.from(map.values());

  try {
    // 1. Save to master unified interconnected accounts key
    localStorage.setItem(CONNECTED_ACCOUNTS_KEY, JSON.stringify(updatedList));

    // 2. Also broadcast/mirror to all connected accounts' individual keys
    updatedList.forEach(p => {
      if (p.email) {
        localStorage.setItem('turfington_saved_profiles_' + p.email, JSON.stringify(updatedList));
      }
      if (p.id) {
        localStorage.setItem('turfington_saved_profiles_' + p.id, JSON.stringify(updatedList));
      }
    });
  } catch {}

  // 3. Real-time window event dispatch for profile switcher
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_accounts_updated', { detail: updatedList }));
  }

  return updatedList;
}

/**
 * Removes an account from the interconnected accounts list
 */
export function removeInterconnectedAccount(profileIdOrEmail) {
  if (!profileIdOrEmail) return getInterconnectedAccounts();
  const target = String(profileIdOrEmail).trim().toLowerCase();
  const existing = getInterconnectedAccounts();
  const filtered = existing.filter(p => {
    const id = String(p.id || '').trim().toLowerCase();
    const email = String(p.email || '').trim().toLowerCase();
    const uid = String(p.firebase_uid || '').trim().toLowerCase();
    return id !== target && email !== target && uid !== target;
  });

  try {
    localStorage.setItem(CONNECTED_ACCOUNTS_KEY, JSON.stringify(filtered));
    filtered.forEach(p => {
      if (p.email) localStorage.setItem('turfington_saved_profiles_' + p.email, JSON.stringify(filtered));
      if (p.id) localStorage.setItem('turfington_saved_profiles_' + p.id, JSON.stringify(filtered));
    });
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_accounts_updated', { detail: filtered }));
  }

  return filtered;
}

export async function apiFetchUserSavedProfiles(ownerEmailOrUid) {
  // 1. Get all interconnected accounts from local storage (instant zero latency)
  const localAccounts = getInterconnectedAccounts();
  const map = new Map();
  localAccounts.forEach(p => {
    const k = String(p.email || p.id || p.firebase_uid || '').trim().toLowerCase();
    if (k) map.set(k, p);
  });

  // 2. Query Firestore profiles if owner identifier is provided
  try {
    if (ownerEmailOrUid) {
      const q1 = query(collection(db, 'profiles'), where('owner_email', '==', ownerEmailOrUid));
      const snap1 = await getDocs(q1);
      snap1.docs.forEach(d => {
        const data = { id: d.id, ...d.data() };
        const k = String(data.email || data.id || data.firebase_uid || '').trim().toLowerCase();
        if (k && !map.has(k)) map.set(k, data);
      });

      const q2 = query(collection(db, 'profiles'), where('email', '==', ownerEmailOrUid));
      const snap2 = await getDocs(q2);
      snap2.docs.forEach(d => {
        const data = { id: d.id, ...d.data() };
        const k = String(data.email || data.id || data.firebase_uid || '').trim().toLowerCase();
        if (k && !map.has(k)) map.set(k, data);
      });
    }
  } catch (err) {
    console.warn('apiFetchUserSavedProfiles Firestore notice:', err);
  }

  const unified = Array.from(map.values());
  try {
    localStorage.setItem(CONNECTED_ACCOUNTS_KEY, JSON.stringify(unified));
  } catch {}

  return unified;
}

export async function apiSaveSavedProfile(profileData, ownerEmailOrUid) {
  if (!profileData) return null;

  // Save to interconnected accounts store across all keys
  saveInterconnectedAccount(profileData);

  const record = {
    ...profileData,
    owner_email: ownerEmailOrUid || profileData.email || profileData.firebase_uid,
    updated_at: new Date().toISOString()
  };

  const pId = record.id || ('prof_' + Date.now());
  setDoc(doc(db, 'profiles', pId), record, { merge: true }).catch(() => {});
  fetch(`${API_BASE}/api/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(record)
  }).catch(() => {});

  return record;
}

export async function apiDeleteUserSavedProfile(profileId, ownerEmailOrUid) {
  removeInterconnectedAccount(profileId);
  deleteDoc(doc(db, 'profiles', profileId)).catch(() => {});
  deleteDoc(doc(db, 'users', profileId)).catch(() => {});
  fetch(`${API_BASE}/api/profiles/${encodeURIComponent(profileId)}`, { method: 'DELETE' }).catch(() => {});
}

export async function apiDeleteAccount(userOrIdentifier, confirmPassword = null) {
  if (!userOrIdentifier) return { success: false, error: 'No user or identifier provided' };

  // 1. Collect all distinct user identifiers
  const uids = new Set();
  const emails = new Set();
  const usernames = new Set();

  if (typeof userOrIdentifier === 'object' && userOrIdentifier !== null) {
    if (userOrIdentifier.id) uids.add(String(userOrIdentifier.id).trim());
    if (userOrIdentifier.firebase_uid) uids.add(String(userOrIdentifier.firebase_uid).trim());
    if (userOrIdentifier.uid) uids.add(String(userOrIdentifier.uid).trim());
    if (userOrIdentifier.email) emails.add(String(userOrIdentifier.email).trim().toLowerCase());
    if (userOrIdentifier.username) usernames.add(String(userOrIdentifier.username).trim().toLowerCase());
  } else if (typeof userOrIdentifier === 'string' && userOrIdentifier.trim()) {
    const raw = userOrIdentifier.trim();
    if (raw.includes('@')) {
      emails.add(raw.toLowerCase());
    } else {
      uids.add(raw);
    }
  }

  // Also include current Firebase Auth user's identifiers if present
  if (auth.currentUser) {
    if (auth.currentUser.uid) uids.add(String(auth.currentUser.uid).trim());
    if (auth.currentUser.email) emails.add(String(auth.currentUser.email).trim().toLowerCase());
  }

  console.log('🗑️ Completely purging account and logs for identifiers:', {
    uids: Array.from(uids),
    emails: Array.from(emails),
    usernames: Array.from(usernames)
  });

  const allTargets = [
    ...Array.from(uids),
    ...Array.from(emails),
    ...Array.from(usernames)
  ];

  // 2. CRITICAL: Purge from Express backend server database (turfington_db.json)
  try {
    await fetch(`${API_BASE}/api/users/purge-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers: allTargets })
    }).catch(() => {});

    for (const target of allTargets) {
      await fetch(`${API_BASE}/api/profiles/${encodeURIComponent(target)}`, {
        method: 'DELETE'
      }).catch(() => {});
    }
  } catch (backendErr) {
    console.warn('Backend server database purge notice:', backendErr);
  }

  // 3. CRITICAL: Delete from Firestore Database across ALL collections while authenticated
  try {
    // 3a. 'profiles' collection
    for (const uid of uids) {
      await deleteDoc(doc(db, 'profiles', uid)).catch(() => {});
      const qUid = query(collection(db, 'profiles'), where('firebase_uid', '==', uid));
      const sUid = await getDocs(qUid).catch(() => null);
      if (sUid && !sUid.empty) {
        for (const d of sUid.docs) await deleteDoc(doc(db, 'profiles', d.id)).catch(() => {});
      }
    }

    for (const email of emails) {
      const qEm = query(collection(db, 'profiles'), where('email', '==', email));
      const sEm = await getDocs(qEm).catch(() => null);
      if (sEm && !sEm.empty) {
        for (const d of sEm.docs) await deleteDoc(doc(db, 'profiles', d.id)).catch(() => {});
      }
    }

    for (const uname of usernames) {
      const qUn1 = query(collection(db, 'profiles'), where('username_lowercase', '==', uname));
      const sUn1 = await getDocs(qUn1).catch(() => null);
      if (sUn1 && !sUn1.empty) {
        for (const d of sUn1.docs) await deleteDoc(doc(db, 'profiles', d.id)).catch(() => {});
      }
      const qUn2 = query(collection(db, 'profiles'), where('username', '==', uname));
      const sUn2 = await getDocs(qUn2).catch(() => null);
      if (sUn2 && !sUn2.empty) {
        for (const d of sUn2.docs) await deleteDoc(doc(db, 'profiles', d.id)).catch(() => {});
      }
    }

    // 3b. 'users' collection
    for (const uid of uids) {
      await deleteDoc(doc(db, 'users', uid)).catch(() => {});
      const qU = query(collection(db, 'users'), where('firebase_uid', '==', uid));
      const sU = await getDocs(qU).catch(() => null);
      if (sU && !sU.empty) {
        for (const d of sU.docs) await deleteDoc(doc(db, 'users', d.id)).catch(() => {});
      }
    }

    for (const email of emails) {
      const qUem = query(collection(db, 'users'), where('email', '==', email));
      const sUem = await getDocs(qUem).catch(() => null);
      if (sUem && !sUem.empty) {
        for (const d of sUem.docs) await deleteDoc(doc(db, 'users', d.id)).catch(() => {});
      }
    }

    // 3c. 'bookings' collection
    for (const uid of uids) {
      const qB1 = query(collection(db, 'bookings'), where('userId', '==', uid));
      const sB1 = await getDocs(qB1).catch(() => null);
      if (sB1 && !sB1.empty) {
        for (const d of sB1.docs) await deleteDoc(doc(db, 'bookings', d.id)).catch(() => {});
      }
      const qB2 = query(collection(db, 'bookings'), where('user_id', '==', uid));
      const sB2 = await getDocs(qB2).catch(() => null);
      if (sB2 && !sB2.empty) {
        for (const d of sB2.docs) await deleteDoc(doc(db, 'bookings', d.id)).catch(() => {});
      }
    }
    for (const email of emails) {
      const qB3 = query(collection(db, 'bookings'), where('email', '==', email));
      const sB3 = await getDocs(qB3).catch(() => null);
      if (sB3 && !sB3.empty) {
        for (const d of sB3.docs) await deleteDoc(doc(db, 'bookings', d.id)).catch(() => {});
      }
    }

    // 3d. 'posts' collection
    for (const uid of uids) {
      const qP1 = query(collection(db, 'posts'), where('userId', '==', uid));
      const sP1 = await getDocs(qP1).catch(() => null);
      if (sP1 && !sP1.empty) {
        for (const d of sP1.docs) await deleteDoc(doc(db, 'posts', d.id)).catch(() => {});
      }
      const qP2 = query(collection(db, 'posts'), where('created_by', '==', uid));
      const sP2 = await getDocs(qP2).catch(() => null);
      if (sP2 && !sP2.empty) {
        for (const d of sP2.docs) await deleteDoc(doc(db, 'posts', d.id)).catch(() => {});
      }
      const qP3 = query(collection(db, 'posts'), where('author_id', '==', uid));
      const sP3 = await getDocs(qP3).catch(() => null);
      if (sP3 && !sP3.empty) {
        for (const d of sP3.docs) await deleteDoc(doc(db, 'posts', d.id)).catch(() => {});
      }
    }

    // 3e. 'player_reviews' collection
    for (const uid of uids) {
      const qR1 = query(collection(db, 'player_reviews'), where('player_id', '==', uid));
      const sR1 = await getDocs(qR1).catch(() => null);
      if (sR1 && !sR1.empty) {
        for (const d of sR1.docs) await deleteDoc(doc(db, 'player_reviews', d.id)).catch(() => {});
      }
      const qR2 = query(collection(db, 'player_reviews'), where('reviewer_id', '==', uid));
      const sR2 = await getDocs(qR2).catch(() => null);
      if (sR2 && !sR2.empty) {
        for (const d of sR2.docs) await deleteDoc(doc(db, 'player_reviews', d.id)).catch(() => {});
      }
    }
    for (const email of emails) {
      const qR3 = query(collection(db, 'player_reviews'), where('player_email', '==', email));
      const sR3 = await getDocs(qR3).catch(() => null);
      if (sR3 && !sR3.empty) {
        for (const d of sR3.docs) await deleteDoc(doc(db, 'player_reviews', d.id)).catch(() => {});
      }
      const qR4 = query(collection(db, 'player_reviews'), where('reviewer_email', '==', email));
      const sR4 = await getDocs(qR4).catch(() => null);
      if (sR4 && !sR4.empty) {
        for (const d of sR4.docs) await deleteDoc(doc(db, 'player_reviews', d.id)).catch(() => {});
      }
    }
    for (const uname of usernames) {
      const qR5 = query(collection(db, 'player_reviews'), where('player_handle', '==', uname));
      const sR5 = await getDocs(qR5).catch(() => null);
      if (sR5 && !sR5.empty) {
        for (const d of sR5.docs) await deleteDoc(doc(db, 'player_reviews', d.id)).catch(() => {});
      }
    }

    // 3f. 'hosted_matches' collection
    for (const uid of uids) {
      const qH1 = query(collection(db, 'hosted_matches'), where('host_id', '==', uid));
      const sH1 = await getDocs(qH1).catch(() => null);
      if (sH1 && !sH1.empty) {
        for (const d of sH1.docs) await deleteDoc(doc(db, 'hosted_matches', d.id)).catch(() => {});
      }
      const qH2 = query(collection(db, 'hosted_matches'), where('hostId', '==', uid));
      const sH2 = await getDocs(qH2).catch(() => null);
      if (sH2 && !sH2.empty) {
        for (const d of sH2.docs) await deleteDoc(doc(db, 'hosted_matches', d.id)).catch(() => {});
      }
    }
    for (const email of emails) {
      const qH3 = query(collection(db, 'hosted_matches'), where('host_email', '==', email));
      const sH3 = await getDocs(qH3).catch(() => null);
      if (sH3 && !sH3.empty) {
        for (const d of sH3.docs) await deleteDoc(doc(db, 'hosted_matches', d.id)).catch(() => {});
      }
    }

    // 3g. 'friendships' and 'follows'
    for (const uid of uids) {
      const qF1 = query(collection(db, 'friendships'), where('sender_id', '==', uid));
      const sF1 = await getDocs(qF1).catch(() => null);
      if (sF1 && !sF1.empty) {
        for (const d of sF1.docs) await deleteDoc(doc(db, 'friendships', d.id)).catch(() => {});
      }
      const qF2 = query(collection(db, 'friendships'), where('receiver_id', '==', uid));
      const sF2 = await getDocs(qF2).catch(() => null);
      if (sF2 && !sF2.empty) {
        for (const d of sF2.docs) await deleteDoc(doc(db, 'friendships', d.id)).catch(() => {});
      }

      const qFol1 = query(collection(db, 'follows'), where('follower_id', '==', uid));
      const sFol1 = await getDocs(qFol1).catch(() => null);
      if (sFol1 && !sFol1.empty) {
        for (const d of sFol1.docs) await deleteDoc(doc(db, 'follows', d.id)).catch(() => {});
      }
      const qFol2 = query(collection(db, 'follows'), where('following_id', '==', uid));
      const sFol2 = await getDocs(qFol2).catch(() => null);
      if (sFol2 && !sFol2.empty) {
        for (const d of sFol2.docs) await deleteDoc(doc(db, 'follows', d.id)).catch(() => {});
      }
    }

    // 3h. 'conversations' collection
    for (const uid of uids) {
      const qC1 = query(collection(db, 'conversations'), where('creatorUid', '==', uid));
      const sC1 = await getDocs(qC1).catch(() => null);
      if (sC1 && !sC1.empty) {
        for (const d of sC1.docs) await deleteDoc(doc(db, 'conversations', d.id)).catch(() => {});
      }
      const qC2 = query(collection(db, 'conversations'), where('created_by', '==', uid));
      const sC2 = await getDocs(qC2).catch(() => null);
      if (sC2 && !sC2.empty) {
        for (const d of sC2.docs) await deleteDoc(doc(db, 'conversations', d.id)).catch(() => {});
      }
      // Remove from participant arrays in conversations
      const qC3 = query(collection(db, 'conversations'), where('participants', 'array-contains', uid));
      const sC3 = await getDocs(qC3).catch(() => null);
      if (sC3 && !sC3.empty) {
        for (const d of sC3.docs) {
          await updateDoc(doc(db, 'conversations', d.id), {
            participants: arrayRemove(uid),
            members: arrayRemove(uid)
          }).catch(() => {});
        }
      }
    }

    // 3i. 'reports' and 'notifications'
    for (const uid of uids) {
      const qRep1 = query(collection(db, 'reports'), where('reported_by', '==', uid));
      const sRep1 = await getDocs(qRep1).catch(() => null);
      if (sRep1 && !sRep1.empty) {
        for (const d of sRep1.docs) await deleteDoc(doc(db, 'reports', d.id)).catch(() => {});
      }
      const qRep2 = query(collection(db, 'reports'), where('target_user_id', '==', uid));
      const sRep2 = await getDocs(qRep2).catch(() => null);
      if (sRep2 && !sRep2.empty) {
        for (const d of sRep2.docs) await deleteDoc(doc(db, 'reports', d.id)).catch(() => {});
      }

      const qNot1 = query(collection(db, 'notifications'), where('userId', '==', uid));
      const sNot1 = await getDocs(qNot1).catch(() => null);
      if (sNot1 && !sNot1.empty) {
        for (const d of sNot1.docs) await deleteDoc(doc(db, 'notifications', d.id)).catch(() => {});
      }
    }
  } catch (firestoreErr) {
    console.error('Error during Firestore account deletion:', firestoreErr);
  }

  // 4. Delete user completely from Firebase Authentication
  let authDeleted = false;
  try {
    if (auth.currentUser) {
      // 4a. If password supplied and user has password provider, re-authenticate first
      if (confirmPassword && auth.currentUser.email) {
        try {
          const cred = EmailAuthProvider.credential(auth.currentUser.email, confirmPassword);
          await reauthenticateWithCredential(auth.currentUser, cred);
          console.log('✅ Re-authenticated with password before deletion.');
        } catch (pwReauthErr) {
          console.warn('Password re-authentication warning:', pwReauthErr);
        }
      }

      // 4b. Direct delete attempt
      try {
        await deleteUser(auth.currentUser);
        authDeleted = true;
        console.log('✅ Firebase Authentication user deleted successfully.');
      } catch (authErr) {
        if (authErr.code === 'auth/requires-recent-login') {
          console.warn('⚠️ Requires recent login to delete Firebase Auth user.');
          const isGoogleUser = auth.currentUser.providerData?.some(p => p.providerId === 'google.com');
          if (isGoogleUser) {
            try {
              const provider = new GoogleAuthProvider();
              await reauthenticateWithPopup(auth.currentUser, provider);
              await deleteUser(auth.currentUser);
              authDeleted = true;
              console.log('✅ Firebase Auth user deleted after Google re-auth.');
            } catch (reauthErr) {
              console.warn('Google re-authentication error:', reauthErr);
            }
          }
        } else {
          console.warn('Direct deleteUser warning:', authErr);
        }

        // 4c. REST API fallback if not yet deleted
        if (!authDeleted && auth.currentUser) {
          try {
            const idToken = await auth.currentUser.getIdToken(true).catch(() => null);
            if (idToken) {
              const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${(typeof import.meta !== 'undefined' && import.meta.env?.VITE_FIREBASE_API_KEY) || ''}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
              });
              if (res.ok) {
                authDeleted = true;
                console.log('✅ Firebase Auth user deleted via REST API.');
              }
            }
          } catch (restErr) {
            console.warn('REST API auth deletion warning:', restErr);
          }
        }
      }
    } else {
      console.log('No active auth.currentUser found in Firebase Auth session.');
    }
  } catch (finalAuthErr) {
    console.warn('Firebase Auth deletion handled safely:', finalAuthErr);
  } finally {
    try { await signOut(auth); } catch {}
  }

  // 5. Completely purge localStorage and cached sessions
  try {
    const directKeys = [
      'turfington_current_profile',
      'turfington_active_user',
      'turfington_user',
      'userRole',
      'turfington_auth_user',
      'turfington_bookings',
      'turfington_joined_matches',
      'turfington_match_requests',
      'turfington_liked_products',
      'turfington_cart'
    ];
    directKeys.forEach(k => localStorage.removeItem(k));

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('turfington_profile_')) {
        keysToRemove.push(key);
      } else if (key.startsWith('turfington_saved_profiles_')) {
        const str = localStorage.getItem(key);
        if (str) {
          try {
            const list = JSON.parse(str);
            const filtered = list.filter(p => {
              const pId = p.id || p.firebase_uid;
              const pEmail = (p.email || '').toLowerCase();
              return !uids.has(String(pId)) && !emails.has(pEmail);
            });
            localStorage.setItem(key, JSON.stringify(filtered));
          } catch {}
        }
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    // Also remove from saved accounts list
    const accountsStr = localStorage.getItem('turfington_accounts');
    if (accountsStr) {
      try {
        const accounts = JSON.parse(accountsStr);
        Object.keys(accounts).forEach(k => {
          const acc = accounts[k];
          if (
            uids.has(String(acc.id)) ||
            uids.has(String(acc.firebase_uid)) ||
            emails.has((acc.email || '').toLowerCase()) ||
            usernames.has((acc.username || '').toLowerCase()) ||
            emails.has(k.toLowerCase())
          ) {
            delete accounts[k];
          }
        });
        localStorage.setItem('turfington_accounts', JSON.stringify(accounts));
      } catch {}
    }

    try { sessionStorage.clear(); } catch {}
  } catch (lsErr) {
    console.warn('LocalStorage cleanup error:', lsErr);
  }

  return { success: true, authDeleted };
}

export async function apiCheckUsernameUnique(username) {
  if (!username) return true;
  const cleanUsername = username.trim().toLowerCase();

  try {
    const q = query(collection(db, 'profiles'), where('username_lowercase', '==', cleanUsername), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) return false;

    const q2 = query(collection(db, 'profiles'), where('username', '==', username.trim()), limit(1));
    const snap2 = await getDocs(q2);
    return snap2.empty;
  } catch (err) {
    console.error('Check username unique error:', err);
    return true;
  }
}

// Known NPC test user IDs and inaccessible fake bots that should NEVER appear in the app
export const NPC_TEST_USER_IDS = new Set([
  'usr_rahul',
  'usr_priya',
  'usr_vikram',
  'usr_sneha',
  'usr_karthik',
  'usr_amit_patel',
  'usr_7332uo2et',
  'usr_txb1xcvak',
  'jbTOjOIRIdS8Le6pt79ZxX9AWT53',
  'owner123@gmail.cpm'
]);

export async function apiSearchUsers(queryStr, currentUserId = null) {
  if (!queryStr || !queryStr.trim()) return [];
  const rawQ = queryStr.trim().toLowerCase();
  const cleanQ = rawQ.replace(/^@/, '');

  const userMap = new Map();
  const currentUidStr = typeof currentUserId === 'object' && currentUserId !== null ? (currentUserId.id || currentUserId.uid) : currentUserId;

  const addCandidate = (u) => {
    if (!u) return;
    const uid = u.id || u.firebase_uid || u.uid;
    if (!uid) return;
    if (NPC_TEST_USER_IDS.has(uid)) return; // Exclude test NPCs and bots completely!
    if (currentUidStr && (uid === currentUidStr || u.firebase_uid === currentUidStr)) return;

    const email = (u.email || '').toLowerCase().trim();
    if (email === 'owner123@gmail.cpm' || email === 'owner123@gmail.com' || email.startsWith('owner123')) return;

    // Strict requirement: ONLY accounts created by Google or active users with valid email
    const isGoogle = !!(
      u.auth_provider === 'google' ||
      u.is_google_user ||
      email.endsWith('@gmail.com') ||
      (u.avatar && u.avatar.includes('googleusercontent.com')) ||
      (u.avatarUrl && u.avatarUrl.includes('googleusercontent.com')) ||
      (u.avatar_url && u.avatar_url.includes('googleusercontent.com'))
    );
    const isActive = !!(u.is_active_user || (email && email.includes('@')));
    if (!isGoogle && !isActive) return;
    if (!email && !isGoogle) return;

    const phone = (u.phone || '').trim();
    const fName = (u.full_name || u.name || u.displayName || '').toLowerCase().trim();
    const uName = (u.username || '').toLowerCase().trim();
    const pId = (u.player_id || u.handle || (uName ? `@${uName}` : '')).toLowerCase().trim();
    const cleanPid = pId.replace(/^@/, '');

    // Match query against Name, Player ID / Handle, Username, Email, Phone
    const matches = 
      fName.includes(cleanQ) ||
      uName.includes(cleanQ) ||
      cleanPid.includes(cleanQ) ||
      pId.includes(rawQ) ||
      (email && email.includes(cleanQ)) ||
      (phone && phone.includes(cleanQ)) ||
      uid.toLowerCase().includes(cleanQ);

    if (matches) {
      const formattedPlayerId = pId 
        ? (pId.startsWith('@') ? pId : `@${pId}`) 
        : `@${(fName || 'player').replace(/[^a-z0-9]/g, '')}_${String(uid).slice(-4)}`;

      userMap.set(uid, {
        id: uid,
        uid: uid,
        firebase_uid: uid,
        name: u.full_name || u.displayName || u.name || (email ? email.split('@')[0] : 'Athlete'),
        full_name: u.full_name || u.displayName || u.name || (email ? email.split('@')[0] : 'Athlete'),
        displayName: u.displayName || u.full_name || u.name || 'Athlete',
        player_id: formattedPlayerId,
        handle: formattedPlayerId,
        username: u.username || cleanPid || (email ? email.split('@')[0] : 'athlete'),
        email: email,
        phone: phone,
        avatar: u.avatar || u.avatarUrl || u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
        avatarUrl: u.avatarUrl || u.avatar || u.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
        role: u.role || 'player',
        sport: u.sport || (Array.isArray(u.sports_interests) ? u.sports_interests[0] : 'Multi-Sport'),
        location: u.location || u.city || 'Chennai, India',
        city: u.city || 'Chennai',
        auth_provider: u.auth_provider || 'email',
        is_google_user: !!(u.is_google_user || u.auth_provider === 'google' || (email && email.endsWith('@gmail.com')))
      });
    }
  };

  // 1. Search local accounts and profiles
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const rawAccounts = localStorage.getItem('turfington_accounts');
      if (rawAccounts) {
        Object.values(JSON.parse(rawAccounts)).forEach(addCandidate);
      }
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('turfington_saved_profiles') || key === 'turfington_all_profiles')) {
          try {
            const arr = JSON.parse(localStorage.getItem(key) || '[]');
            if (Array.isArray(arr)) arr.forEach(addCandidate);
          } catch {}
        }
      }
    }
  } catch {}

  // 2. Search Express backend
  try {
    const res = await fetch(`${API_BASE}/api/users`);
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (data.users || []);
      list.forEach(addCandidate);
    }
  } catch {}

  // 3. Search Firestore profiles collection
  try {
    const snap = await getDocs(collection(db, 'profiles'));
    snap.docs.forEach(d => addCandidate({ id: d.id, ...d.data() }));
  } catch (err) {}

  // 4. Search Firestore users collection
  try {
    const snap = await getDocs(collection(db, 'users'));
    snap.docs.forEach(d => addCandidate({ id: d.id, ...d.data() }));
  } catch (err) {}

  return Array.from(userMap.values());
}

export async function apiFetchNearbyPlayers(lat, lng, radiusKm = 50, currentUserId = null) {
  const userLat = lat || 13.0827;
  const userLng = lng || 80.2707;

  try {
    // 1. Fetch ALL registered athletes and user accounts across Firestore, Express backend, and localStorage
    const allUsers = await apiFetchAthletes(currentUserId);

    const toRad = (v) => (v * Math.PI) / 180;
    const haversineDist = (lat1, lon1, lat2, lon2) => {
      const R = 6371; // km
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return parseFloat((R * c).toFixed(1));
    };

    // Calculate distance for all registered users
    const mapped = allUsers.map((p, idx) => {
      const pLat = parseFloat(p.lat || p.latitude) || (userLat + (idx * 0.01 + 0.01));
      const pLng = parseFloat(p.lng || p.longitude) || (userLng + (idx * 0.01 + 0.01));
      const distNum = haversineDist(userLat, userLng, pLat, pLng);
      return {
        ...p,
        lat: pLat,
        lng: pLng,
        distanceNum: distNum,
        distanceText: p.location ? `${p.location}` : `${distNum} km away`
      };
    });

    // Sort by distance (closest first)
    mapped.sort((a, b) => (a.distanceNum || 0) - (b.distanceNum || 0));

    return mapped;
  } catch (err) {
    console.warn('apiFetchNearbyPlayers error:', err);
    return [];
  }
}


// -- 2. Friendships & Follows --------------------------------

export async function apiFollowUser(followerId, followingId) {
  try {
    const docId = `${followerId}_${followingId}`;
    await setDoc(doc(db, 'follows', docId), {
      follower_id: followerId,
      following_id: followingId,
      createdAt: serverTimestamp()
    });
    return { success: true };
  } catch (err) {
    console.error('apiFollowUser error:', err);
    return { success: false, error: err.message };
  }
}

export async function apiUnfollowUser(followerId, followingId) {
  try {
    const docId = `${followerId}_${followingId}`;
    await deleteDoc(doc(db, 'follows', docId));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function apiFetchFriends(userId) {
  try {
    const q1 = query(collection(db, 'friendships'), where('sender_id', '==', userId));
    const q2 = query(collection(db, 'friendships'), where('receiver_id', '==', userId));

    const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
    const allDocs = [...snap1.docs, ...snap2.docs];

    const friends = [];
    const incomingRequests = [];
    const sentRequests = [];

    allDocs.forEach(d => {
      const f = { id: d.id, ...d.data() };
      const isSender = f.sender_id === userId;
      const friendProfile = isSender ? f.receiver : f.sender;
      const item = {
        id: f.id,
        friendship_id: f.id,
        status: f.status,
        isSender,
        sender: f.sender,
        receiver: f.receiver,
        ...(friendProfile || {})
      };

      if (f.status === 'accepted') {
        friends.push(item);
      } else if (f.status === 'pending') {
        if (isSender) {
          sentRequests.push(item);
        } else {
          incomingRequests.push(item);
        }
      }
    });

    return { friends, incomingRequests, sentRequests };
  } catch (err) {
    console.error("Error in apiFetchFriends:", err);
    return { friends: [], incomingRequests: [], sentRequests: [] };
  }
}

export async function apiSendFriendRequest(senderId, receiverId) {
  try {
    const docId = `fr_${senderId}_${receiverId}`;
    await setDoc(doc(db, 'friendships', docId), {
      sender_id: senderId,
      receiver_id: receiverId,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export async function apiRespondFriendRequest(friendshipId, status) {
  try {
    if (status === 'deleted') {
      await deleteDoc(doc(db, 'friendships', friendshipId));
    } else {
      await updateDoc(doc(db, 'friendships', friendshipId), { status });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}


// -- 3. Real-Time Communication System ----------------------
export * from './chatService';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD ? '' : 'http://localhost:5000');

export const DEFAULT_SYSTEM_GROUP_IDS = new Set([
  'group_football_chennai',
  'group_box_cricket',
  'group_badminton_smashers',
  'group_pickleball_chennai',
  'group_pickleball_padel',
  'group_table_tennis',
  'group_table_tennis_warriors',
  'group_strike_bowling',
  'group_bowling_strikes'
]);

export const DEFAULT_COMMUNITY_GROUPS = [];

/**
 * Ensures default sports groups exist in Firestore permanently
 */
export async function apiEnsureDefaultSportsGroups() {
  return true;
}

/**
 * Real-time continuous listener for all conversations involving a user
 */
export function subscribeToUserConversations(userId, onUpdate) {
  if (!userId) return () => {};

  let directChats = [];
  let groupChats = [];

  const notify = () => {
    const map = new Map();
    // Default fallback groups in case Firestore is connecting
    DEFAULT_COMMUNITY_GROUPS.forEach(g => map.set(g.id, { ...g }));

    // Overlay real group chats
    groupChats.forEach(g => map.set(g.id, g));

    // Overlay direct chats
    directChats.forEach(d => map.set(d.id, d));

    const merged = Array.from(map.values()).sort((a, b) => {
      const tA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : new Date(a.lastMessageTime || a.createdAt || 0).getTime();
      const tB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : new Date(b.lastMessageTime || b.createdAt || 0).getTime();
      return tB - tA;
    });

    onUpdate(merged);
  };

  try {
    // 1. Direct chats where user is a participant
    const directQuery = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', userId)
    );
    const unsubDirect = onSnapshot(directQuery, (snap) => {
      directChats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      notify();
    }, (err) => console.warn('direct conversations sub notice:', err));

    // 2. Public Sports Groups
    const groupQuery = query(
      collection(db, 'conversations'),
      where('type', '==', 'group')
    );
    const unsubGroup = onSnapshot(groupQuery, (snap) => {
      groupChats = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(g => 
          !DEFAULT_SYSTEM_GROUP_IDS.has(g.id) &&
          !DEFAULT_SYSTEM_GROUP_IDS.has(g.groupId) &&
          g.creatorUid !== 'turfington_official' &&
          g.created_by !== 'turfington_official'
        );
      notify();
    }, (err) => console.warn('group conversations sub notice:', err));

    return () => {
      unsubDirect();
      unsubGroup();
    };
  } catch (err) {
    console.warn('subscribeToUserConversations error:', err);
    notify();
    return () => {};
  }
}

export async function apiFetchChats(userId) {
  try {
    const q = query(collection(db, 'conversations'), where('participants', 'array-contains', userId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // Express backend fallback
    const res = await fetch(`${API_BASE}/api/chats?userId=${userId}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.chats) return json.chats;
    }
  } catch (err) {
    console.warn("apiFetchChats error:", err);
  }
  return DEFAULT_COMMUNITY_GROUPS;
}

export async function apiCreateDirectChat(user1, user2) {
  const u1Id = typeof user1 === 'string' ? user1 : (user1.id || user1.uid || user1.firebase_uid);
  const u2Id = typeof user2 === 'string' ? user2 : (user2.id || user2.uid || user2.firebase_uid);
  const u1Name = typeof user1 === 'object' ? (user1.full_name || user1.name || 'Athlete') : 'Athlete';
  const u2Name = typeof user2 === 'object' ? (user2.full_name || user2.name || 'Athlete') : 'Athlete';
  const u1Avatar = typeof user1 === 'object' ? (user1.avatar || user1.avatar_url || '') : '';
  const u2Avatar = typeof user2 === 'object' ? (user2.avatar || user2.avatar_url || '') : '';

  const deterministicId = 'dm_' + [u1Id, u2Id].sort().join('_');
  try {
    const convRef = doc(db, 'conversations', deterministicId);
    const snap = await getDoc(convRef);
    if (snap.exists()) {
      return { success: true, chat: { id: snap.id, ...snap.data() } };
    }

    const chatData = {
      id: deterministicId,
      type: 'direct',
      created_by: u1Id,
      name: u2Name,
      avatar: u2Avatar,
      participants: [u1Id, u2Id],
      participantDetails: {
        [u1Id]: { id: u1Id, name: u1Name, avatar: u1Avatar },
        [u2Id]: { id: u2Id, name: u2Name, avatar: u2Avatar }
      },
      unreadCounts: {
        [u1Id]: 0,
        [u2Id]: 0
      },
      lastMessage: null,
      lastMessageText: '',
      lastMessageTime: new Date().toISOString(),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp()
    };

    await setDoc(convRef, chatData);
    return { success: true, chat: chatData };
  } catch (e) {
    console.warn("apiCreateDirectChat Firestore notice:", e);
  }

  return {
    success: true,
    chat: {
      id: deterministicId,
      type: 'direct',
      name: u2Name,
      avatar: u2Avatar,
      participants: [u1Id, u2Id],
      participantDetails: {
        [u1Id]: { id: u1Id, name: u1Name, avatar: u1Avatar },
        [u2Id]: { id: u2Id, name: u2Name, avatar: u2Avatar }
      },
      unreadCounts: { [u1Id]: 0, [u2Id]: 0 }
    }
  };
}

export async function apiCreateGroupChat({ name, avatar, createdBy, memberIds, sport = 'Football', description = '', type = 'group' }) {
  try {
    const allMembers = Array.from(new Set([createdBy, ...(memberIds || [])].filter(Boolean)));
    const groupId = 'group_' + Date.now();
    const groupData = {
      id: groupId,
      name,
      sport,
      description,
      avatar: avatar || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=600',
      type,
      is_public: true,
      created_by: createdBy,
      participants: allMembers,
      members_count: allMembers.length,
      unreadCounts: {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = doc(db, 'conversations', groupId);
    await setDoc(docRef, groupData);
    return { success: true, chat: groupData };
  } catch (e) {
    console.warn("apiCreateGroupChat Firestore error:", e);
    return { success: false };
  }
}

export async function apiJoinGroup(conversationId, user) {
  const userId = user?.id || user?.uid || user?.firebase_uid;
  if (!userId) return { success: false };
  try {
    const convRef = doc(db, 'conversations', conversationId);
    await updateDoc(convRef, {
      participants: arrayUnion(userId),
      members_count: increment(1)
    });

    const memberRef = doc(db, 'conversations', conversationId, 'members', userId);
    await setDoc(memberRef, {
      userId,
      name: user.full_name || user.name || 'Athlete',
      avatar: user.avatar || user.avatar_url || '',
      joinedAt: serverTimestamp(),
      role: 'member'
    }, { merge: true });

    return { success: true };
  } catch (err) {
    console.warn('apiJoinGroup Firestore error:', err);
    return { success: false, error: err.message };
  }
}

export async function apiLeaveGroup(conversationId, user) {
  const userId = user?.id || user?.uid || user?.firebase_uid;
  if (!userId) return { success: false };
  try {
    const convRef = doc(db, 'conversations', conversationId);
    await updateDoc(convRef, {
      participants: arrayRemove(userId),
      members_count: increment(-1)
    });

    const memberRef = doc(db, 'conversations', conversationId, 'members', userId);
    await deleteDoc(memberRef).catch(() => {});
    return { success: true };
  } catch (err) {
    console.warn('apiLeaveGroup Firestore error:', err);
    return { success: false, error: err.message };
  }
}

export async function apiCreateEntityChat({ type, entityId, createdBy, targetUserId, title, avatar, metadata }) {
  try {
    const q = query(
      collection(db, 'conversations'),
      where('type', '==', type),
      where('entity_id', '==', String(entityId)),
      where('created_by', '==', createdBy),
      limit(1)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const existingDoc = snap.docs[0];
      return { success: true, chat: { id: existingDoc.id, ...existingDoc.data() } };
    }

    const members = Array.from(new Set([createdBy, targetUserId].filter(Boolean)));
    const chatData = {
      type,
      entity_id: String(entityId),
      title,
      avatar_url: avatar,
      created_by: createdBy,
      participants: members,
      metadata: metadata || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, 'conversations'), chatData);
    return { success: true, chat: { id: docRef.id, ...chatData } };
  } catch (e) {
    console.warn("apiCreateEntityChat error:", e);
    return { success: false };
  }
}

export async function apiFetchMessages(conversationId) {
  try {
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {
    console.warn("apiFetchMessages Firestore notice:", err);
  }

  // Server fallback
  try {
    const res = await fetch(`${API_BASE}/api/messages?chatId=${conversationId}`);
    if (res.ok) {
      const json = await res.json();
      return json.messages || [];
    }
  } catch (err) {
    console.error("apiFetchMessages server error:", err);
  }

  return [];
}

export async function apiSendMessage(conversationId, senderId, content, replyToId = null, attachments = [], idempotencyKey = null, senderInfo = null) {
  try {
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const senderName = senderInfo?.name || senderInfo?.full_name || senderInfo?.user || 'Athlete';
    const senderAvatar = senderInfo?.avatar || senderInfo?.avatar_url || '';

    const msgData = {
      conversation_id: conversationId,
      sender_id: senderId,
      user: senderName,
      avatar: senderAvatar,
      sender: {
        id: senderId,
        full_name: senderName,
        avatar_url: senderAvatar
      },
      content,
      text: content,
      reply_to_id: replyToId,
      status: 'sent',
      idempotency_key: idempotencyKey,
      attachments: attachments || [],
      reactions: [],
      createdAt: serverTimestamp(),
      created_at: new Date().toISOString()
    };

    const docRef = await addDoc(messagesRef, msgData);
    const newMsg = { id: docRef.id, ...msgData };

    // Update conversation document: last message, unread counts, updatedAt
    const convRef = doc(db, 'conversations', conversationId);
    try {
      const convSnap = await getDoc(convRef);
      if (convSnap.exists()) {
        const convData = convSnap.data();
        const participants = convData.participants || [];
        const unreadUpdates = {};
        participants.forEach(pUid => {
          if (pUid !== senderId) {
            unreadUpdates[`unreadCounts.${pUid}`] = increment(1);
          }
        });

        await updateDoc(convRef, {
          lastMessage: {
            text: content,
            sender_id: senderId,
            sender_name: senderName,
            timestamp: Date.now()
          },
          lastMessageText: content,
          lastMessageSender: senderName,
          lastMessageTime: new Date().toISOString(),
          updatedAt: serverTimestamp(),
          ...unreadUpdates
        });
      }
    } catch (updateErr) {
      console.warn("Conversation doc update notice:", updateErr);
    }

    // Express backend sync
    fetch(`${API_BASE}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversationId,
        senderId,
        content,
        senderName,
        senderAvatar,
        attachments
      })
    }).catch(() => {});

    return { success: true, message: newMsg };
  } catch (e) {
    console.warn("apiSendMessage Firestore error:", e);
    // Express backend fallback
    try {
      const res = await fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          senderId,
          content,
          senderName: senderInfo?.name || 'Athlete',
          senderAvatar: senderInfo?.avatar,
          attachments
        })
      });
      if (res.ok) {
        const data = await res.json();
        return { success: true, message: data.message };
      }
    } catch (backErr) {}
    return { success: false };
  }
}

export async function apiAddMessageReaction(messageId, userId, reaction) {
  try {
    const reactionRef = doc(db, 'reactions', `${messageId}_${userId}_${reaction}`);
    const snap = await getDoc(reactionRef);

    if (snap.exists()) {
      await deleteDoc(reactionRef);
    } else {
      await setDoc(reactionRef, {
        message_id: messageId,
        user_id: userId,
        reaction,
        createdAt: serverTimestamp()
      });
    }

    return { success: true };
  } catch (e) {
    console.error("apiAddMessageReaction error:", e);
    return { success: false };
  }
}

export async function apiEditMessage(messageId, userId, newContent) {
  try {
    const q = query(collection(db, 'conversations'));
    const snap = await getDocs(q);

    for (const convDoc of snap.docs) {
      const msgRef = doc(db, 'conversations', convDoc.id, 'messages', messageId);
      const msgSnap = await getDoc(msgRef);
      if (msgSnap.exists()) {
        await updateDoc(msgRef, {
          content: newContent,
          edited_at: new Date().toISOString()
        });
        return { success: true };
      }
    }

    return { success: true };
  } catch (e) {
    console.error("apiEditMessage error:", e);
    return { success: false };
  }
}

export async function apiDeleteMessage(messageId, userId) {
  try {
    const q = query(collection(db, 'conversations'));
    const snap = await getDocs(q);

    for (const convDoc of snap.docs) {
      const msgRef = doc(db, 'conversations', convDoc.id, 'messages', messageId);
      const msgSnap = await getDoc(msgRef);
      if (msgSnap.exists()) {
        await updateDoc(msgRef, {
          content: 'This message was deleted',
          deleted_at: new Date().toISOString(),
          deleted_by: userId
        });
        return { success: true };
      }
    }

    return { success: true };
  } catch (e) {
    console.error("apiDeleteMessage error:", e);
    return { success: false };
  }
}

export async function apiMarkMessagesAsRead(conversationId, userId) {
  if (!conversationId || !userId) return { success: false };
  try {
    const convRef = doc(db, 'conversations', conversationId);
    await updateDoc(convRef, {
      [`unreadCounts.${userId}`]: 0
    }).catch(() => {});

    const memberRef = doc(db, 'conversations', conversationId, 'members', userId);
    await setDoc(memberRef, { last_read_at: new Date().toISOString() }, { merge: true }).catch(() => {});
    return { success: true };
  } catch (e) {
    return { success: false };
  }
}

export async function apiFetchAthletes(currentUserId) {
  try {
    const seenMap = new Map();

    const addOrUpdateUser = (userData) => {
      if (!userData) return;
      const uid = userData.firebase_uid || userData.id || userData.uid;
      if (!uid) return;
      if (NPC_TEST_USER_IDS.has(uid)) return; // Exclude test NPCs completely!

      const email = (userData.email || '').toLowerCase().trim();
      // Exclude only the test mock owner123
      if (email === 'owner123@gmail.cpm' || email === 'owner123@gmail.com' || email.startsWith('owner123')) return;

      // Do not list current user as their own nearby athlete
      const currentUidStr = typeof currentUserId === 'object' && currentUserId !== null ? (currentUserId.id || currentUserId.uid) : currentUserId;
      if (currentUidStr && (uid === currentUidStr || userData.firebase_uid === currentUidStr)) return;

      const lookupKey = uid || email;
      if (!lookupKey) return;

      const isGoogle = !!(
        userData.auth_provider === 'google' ||
        userData.is_google_user ||
        (email && (email.endsWith('@gmail.com') || email.includes('google'))) ||
        (userData.avatar && userData.avatar.includes('googleusercontent.com')) ||
        (userData.avatarUrl && userData.avatarUrl.includes('googleusercontent.com')) ||
        (userData.avatar_url && userData.avatar_url.includes('googleusercontent.com'))
      );
      const isActive = !!(userData.is_active_user || (email && email.includes('@')));

      // Strict requirement: ONLY accounts created by Google or real active users with valid email
      if (!isGoogle && !isActive) return;
      if (!email && !isGoogle) return;

      const fName = userData.full_name || userData.displayName || userData.name || (email ? email.split('@')[0] : 'Athlete');
      const uName = userData.username || (userData.name ? userData.name.toLowerCase().replace(/[^a-z0-9_]/g, '') : (email ? email.split('@')[0] : 'athlete'));
      const pId = userData.player_id || userData.handle || (uName ? `@${uName.replace(/[^a-z0-9_]/g, '')}` : `@athlete_${String(uid).slice(-4)}`);
      const formattedPlayerId = pId.startsWith('@') ? pId : `@${pId}`;

      const normalized = {
        id: uid,
        uid: uid,
        firebase_uid: uid,
        name: fName,
        full_name: fName,
        displayName: fName,
        player_id: formattedPlayerId,
        handle: formattedPlayerId,
        username: uName,
        email: email,
        phone: userData.phone || '',
        avatar: userData.avatar || userData.avatarUrl || userData.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
        avatarUrl: userData.avatarUrl || userData.avatar || userData.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
        role: userData.role || 'player',
        sport: userData.sport || (Array.isArray(userData.sports_interests) ? userData.sports_interests[0] : 'Multi-Sport'),
        location: sanitizeLocationToEnglish(userData.location || userData.city || 'Chennai, India'),
        city: sanitizeLocationToEnglish(userData.city || 'Chennai'),
        auth_provider: isGoogle ? 'google' : (userData.auth_provider || 'email'),
        is_google_user: isGoogle,
        lastActive: userData.updatedAt || userData.updated_at || new Date().toISOString()
      };

      if (seenMap.has(lookupKey)) {
        const existing = seenMap.get(lookupKey);
        seenMap.set(lookupKey, { ...existing, ...normalized, is_google_user: existing.is_google_user || isGoogle });
      } else {
        seenMap.set(lookupKey, normalized);
      }
    };
    
    // 1. Fetch from Firestore profiles collection
    try {
      const snapProfiles = await getDocs(collection(db, 'profiles'));
      snapProfiles.docs.forEach(d => addOrUpdateUser({ id: d.id, ...d.data() }));
    } catch (e) {}

    // 2. Fetch from Firestore users collection
    try {
      const snapUsers = await getDocs(collection(db, 'users'));
      snapUsers.docs.forEach(d => addOrUpdateUser({ id: d.id, ...d.data() }));
    } catch (e) {}

    // 3. Fetch from Express backend
    try {
      const res = await fetch(`${API_BASE}/api/users`);
      if (res.ok) {
        const data = await res.json();
        const users = Array.isArray(data) ? data : (data.users || []);
        users.forEach(u => addOrUpdateUser(u));
      }
    } catch {}

    // 4. Aggregate accounts saved in localStorage (from ProfileSwitcher & device auth)
    try {
      if (typeof getInterconnectedAccounts === 'function') {
        const connected = getInterconnectedAccounts();
        if (Array.isArray(connected)) connected.forEach(acc => addOrUpdateUser(acc));
      }
      if (typeof window !== 'undefined' && window.localStorage) {
        // Multi-accounts map
        const rawAccounts = localStorage.getItem('turfington_accounts');
        if (rawAccounts) {
          const parsed = JSON.parse(rawAccounts);
          Object.values(parsed).forEach(acc => addOrUpdateUser(acc));
        }

        // Active saved profiles by owner
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('turfington_saved_profiles') || key === 'turfington_all_profiles')) {
            try {
              const items = JSON.parse(localStorage.getItem(key) || '[]');
              if (Array.isArray(items)) {
                items.forEach(it => addOrUpdateUser(it));
              }
            } catch {}
          }
        }
      }
    } catch {}

    // Real registered athletes and accounts connected to Google (excluding test NPCs and owner123)
    const currentUidStr = typeof currentUserId === 'object' && currentUserId !== null ? (currentUserId.id || currentUserId.uid) : currentUserId;
    const finalUsers = Array.from(seenMap.values()).filter(u => {
      const matchId = currentUidStr && (u.id === currentUidStr || u.firebase_uid === currentUidStr);
      const email = (u.email || '').toLowerCase().trim();
      const isMockOwner = email === 'owner123@gmail.cpm' || email === 'owner123@gmail.com' || email.startsWith('owner123');
      return !matchId && !NPC_TEST_USER_IDS.has(u.id) && !isMockOwner;
    });

    // Prioritize Google-signed-in users first
    finalUsers.sort((a, b) => {
      if (a.is_google_user && !b.is_google_user) return -1;
      if (!a.is_google_user && b.is_google_user) return 1;
      return (a.name || '').localeCompare(b.name || '');
    });

    return finalUsers;
  } catch (e) {
    console.warn('apiFetchAthletes notice:', e);
    return [];
  }
}

export async function apiSearchGoogleAthletes(searchQuery, currentUserId) {
  const all = await apiFetchAthletes(currentUserId);
  if (!searchQuery || !searchQuery.trim()) return all;

  const q = searchQuery.toLowerCase().trim();
  const filtered = all.filter(u => 
    (u.name && u.name.toLowerCase().includes(q)) ||
    (u.full_name && u.full_name.toLowerCase().includes(q)) ||
    (u.email && u.email.toLowerCase().includes(q)) ||
    (u.sport && u.sport.toLowerCase().includes(q)) ||
    (u.location && u.location.toLowerCase().includes(q))
  );

  // If searching by email and not in the pre-loaded list, attempt live Firestore lookup
  if (q.includes('@') && !filtered.some(u => (u.email || '').toLowerCase() === q)) {
    if (q === 'owner123@gmail.cpm' || q === 'owner123@gmail.com' || q.startsWith('owner')) {
      return filtered;
    }
    try {
      const qUsers = query(collection(db, 'users'), where('email', '==', q));
      const snapUsers = await getDocs(qUsers);
      if (!snapUsers.empty) {
        snapUsers.forEach(d => {
          const dData = d.data() || {};
          const dRole = (dData.role || dData.userRole || dData.user_role || '').toLowerCase().trim();
          if (dRole === 'owner' || dRole === 'venue_owner' || dRole === 'turf_owner' || !!dData.is_owner || !!dData.venue_owner) return;
          filtered.push({
            id: d.id,
            uid: d.id,
            firebase_uid: d.id,
            ...dData,
            auth_provider: 'google',
            is_google_user: true
          });
        });
      } else {
        // Direct email invite representation - only for non-owner emails
        const sanitizedId = 'usr_email_' + q.replace(/[^a-zA-Z0-9]/g, '_');
        filtered.push({
          id: sanitizedId,
          uid: sanitizedId,
          firebase_uid: sanitizedId,
          name: q.split('@')[0],
          full_name: q.split('@')[0],
          displayName: q.split('@')[0],
          email: q,
          auth_provider: 'google',
          is_google_user: true,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${q}`,
          sport: 'Google Athlete',
          location: 'Direct Recipient',
          isDirectEmailTarget: true
        });
      }
    } catch {}
  }

  return filtered;
}

export async function apiBlockUser(blockerId, blockedId, action = 'block') {
  try {
    const blockId = `${blockerId}_${blockedId}`;
    if (action === 'block') {
      await setDoc(doc(db, 'blocks', blockId), { blocker_id: blockerId, blocked_id: blockedId, createdAt: serverTimestamp() });
    } else {
      await deleteDoc(doc(db, 'blocks', blockId));
    }
    return { success: true };
  } catch (e) {
    return { success: false };
  }
}

export async function apiSubmitReport({ reporterId, reportedUserId, messageId, conversationId, reason, description }) {
  try {
    await addDoc(collection(db, 'reports'), {
      reporter_id: reporterId,
      reported_user_id: reportedUserId,
      message_id: messageId || null,
      conversation_id: conversationId || null,
      reason: reason || 'Inappropriate behavior',
      description: description || '',
      createdAt: serverTimestamp()
    });
    return { success: true };
  } catch (e) {
    return { success: false };
  }
}

export async function apiUploadChatAttachment(file, conversationId) {
  try {
    const fileExt = file.name ? file.name.split('.').pop() : 'jpg';
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.${fileExt}`;
    const storageRef = ref(storage, `chat-attachments/${conversationId}/${fileName}`);
    
    const snapshot = await uploadBytes(storageRef, file);
    const downloadUrl = await getDownloadURL(snapshot.ref);

    return {
      success: true,
      storage_path: snapshot.ref.fullPath,
      url: downloadUrl,
      file_name: file.name || 'Attachment',
      file_type: file.type || 'image/jpeg',
      file_size: file.size || 0
    };
  } catch (e) {
    console.warn("Attachment upload to Firebase Storage failed, using FileReader fallback:", e);
  }

  // Fallback to FileReader data URL
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        success: true,
        storage_path: 'local_data_url',
        url: reader.result,
        file_name: file.name || 'Attachment',
        file_type: file.type || 'image/jpeg',
        file_size: file.size || 0
      });
    };
    reader.onerror = () => resolve({ success: false });
    reader.readAsDataURL(file);
  });
}

// ─── Real-Time Subscriptions & Ephemeral Channels ───────────

export function subscribeToConversationRealtime(conversationId, { onMessage, onReaction, onTyping, onPresence }) {
  const unsubscribes = [];

  try {
    // 1. Messages Real-Time Listener
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    const msgUnsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (onMessage) {
          onMessage({
            eventType: change.type.toUpperCase(),
            new: { id: change.doc.id, ...change.doc.data() }
          });
        }
      });
    }, (err) => console.warn('Firestore messages subscription notice:', err));

    unsubscribes.push(msgUnsub);

    // 2. Typing Indicator Listener
    const typingRef = collection(db, 'conversations', conversationId, 'typing');
    const typingUnsub = onSnapshot(typingRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (onTyping) onTyping(change.doc.data());
      });
    }, () => {});

    unsubscribes.push(typingUnsub);

    // 3. Presence Listener
    const presenceRef = collection(db, 'conversations', conversationId, 'presence');
    const presenceUnsub = onSnapshot(presenceRef, (snapshot) => {
      if (onPresence) {
        const state = {};
        snapshot.docs.forEach(doc => {
          state[doc.id] = [doc.data()];
        });
        onPresence(state);
      }
    }, () => {});

    unsubscribes.push(presenceUnsub);
  } catch (err) {
    console.warn("subscribeToConversationRealtime setup error:", err);
  }

  const sendTypingStatus = (userObj, isTyping) => {
    try {
      const userKey = userObj.id || 'usr_me';
      setDoc(doc(db, 'conversations', conversationId, 'typing', userKey), {
        user: userObj,
        isTyping,
        timestamp: Date.now()
      }, { merge: true }).catch(() => {});
    } catch {}
  };

  const trackPresence = (userObj) => {
    try {
      const userKey = userObj.id || 'usr_me';
      setDoc(doc(db, 'conversations', conversationId, 'presence', userKey), {
        user_id: userObj.id || 'usr_me',
        username: userObj.name || userObj.full_name || 'Athlete',
        online_at: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    } catch {}
  };

  return {
    unsubscribe: () => {
      unsubscribes.forEach(unsub => typeof unsub === 'function' && unsub());
    },
    sendTypingStatus,
    trackPresence
  };
}

export function subscribeToMessages(conversationId, callback) {
  try {
    const messagesRef = collection(db, 'conversations', conversationId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));

    return onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          callback({ id: change.doc.id, ...change.doc.data() });
        }
      });
    }, (err) => console.warn('subscribeToMessages error:', err));
  } catch (e) {
    return () => {};
  }
}


// -- 4. Venues & Turfs ---------------------------------------

export function resolveVenueImageUrl(pathOrUrl, bucket = 'venue-images') {
  if (!pathOrUrl) return null;
  if (typeof pathOrUrl !== 'string') return null;
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://') || pathOrUrl.startsWith('data:')) {
    return pathOrUrl;
  }
  return pathOrUrl;
}

const DEFAULT_TURFS = [];

// Clean fresh start purge of legacy test venues & hosted matches
if (typeof window !== 'undefined') {
  try {
    const purgeKey = 'turfington_venues_fresh_start_v2';
    if (!localStorage.getItem(purgeKey)) {
      localStorage.removeItem('turfington_custom_venues');
      localStorage.removeItem('turfington_hosted_matches');
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('turfington_venue_slots_') || k.startsWith('turfington_owner_venues_')) {
          localStorage.removeItem(k);
        }
      });
      localStorage.setItem(purgeKey, 'true');
    }
  } catch {}
}

export async function apiFetchVenues(filters = {}) {
  let customVenues = [];
  try {
    const s = localStorage.getItem('turfington_custom_venues');
    if (s) {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) customVenues = parsed;
    }
  } catch {}

  // Check owner-specific storage keys
  const ownerCandidates = new Set();
  const addCand = (val) => {
    if (val && typeof val === 'string' && val.trim()) {
      ownerCandidates.add(val.trim().toLowerCase());
    }
  };
  addCand(filters.ownerId);
  addCand(filters.owner_id);
  addCand(filters.ownerUid);
  addCand(filters.ownerEmail);
  addCand(filters.owner_email);
  addCand(filters.ownerName);
  addCand(filters.owner_name);

  if (filters.ownerId) {
    try {
      const s = localStorage.getItem(`turfington_owner_venues_${filters.ownerId}`);
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) customVenues = [...customVenues, ...parsed];
      }
    } catch {}
  }
  if (filters.ownerEmail) {
    try {
      const s = localStorage.getItem(`turfington_owner_venues_${filters.ownerEmail}`);
      if (s) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) customVenues = [...customVenues, ...parsed];
      }
    } catch {}
  }

  let apiVenues = [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${API_BASE}/api/venues`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data.venues && Array.isArray(data.venues)) {
        apiVenues = data.venues;
      }
    }
  } catch {}

  let dbVenues = [];
  try {
    const snap = await getDocs(collection(db, 'venues'));
    if (!snap.empty) {
      dbVenues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {
    console.warn('apiFetchVenues Firestore notice:', err);
  }

  let dbTurfs = [];
  try {
    const snapTurfs = await getDocs(collection(db, 'turfs'));
    if (!snapTurfs.empty) {
      dbTurfs = snapTurfs.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch {}

  const map = new Map();
  // Custom venues take highest priority
  [...customVenues, ...apiVenues, ...dbVenues, ...dbTurfs, ...DEFAULT_TURFS].forEach(v => {
    if (!v || (!v.id && !v.name)) return;
    const key = String(v.id || v.name);
    if (map.has(key)) return;

    const resolvedImage = resolveVenueImageUrl(v.storage_path || v.image_url || v.image);
    const lat = parseFloat(v.latitude ?? v.lat) || 13.0827;
    const lng = parseFloat(v.longitude ?? v.lng) || 80.2707;
    const sportsList = Array.isArray(v.sports) && v.sports.length > 0 
      ? v.sports 
      : [v.sport || v.category || 'Sports'];

    map.set(key, {
      ...v,
      id: v.id || key,
      name: v.name || 'Sports Arena',
      venue: v.name || 'Sports Arena',
      sport: v.sport || sportsList[0] || 'Sports',
      category: v.category || v.sport || sportsList[0] || 'Sports',
      sports: sportsList,
      lat,
      lng,
      latitude: lat,
      longitude: lng,
      price: v.price || (v.price_per_hr ? `₹${v.price_per_hr}/hr` : '₹1,000/hr'),
      price_per_hr: Number(v.price_per_hr) || 1000,
      image_url: resolvedImage,
      image: resolvedImage,
      rating: v.rating || 5.0,
      owner_id: v.owner_id || v.ownerId || null,
      owner_uid: v.owner_uid || null,
      owner_email: v.owner_email || null,
      owner_name: v.owner_name || v.ownerName || null,
      isNew: v.isNew ?? (String(v.id).startsWith('venue_') || v.owner_id != null)
    });
  });

  let allVenues = Array.from(map.values());
  if (ownerCandidates.size > 0) {
    allVenues = allVenues.filter(v => {
      if (!v) return false;
      const vOwnerId = String(v.owner_id || v.ownerId || '').trim().toLowerCase();
      const vOwnerUid = String(v.owner_uid || '').trim().toLowerCase();
      const vOwnerEmail = String(v.owner_email || '').trim().toLowerCase();
      const vOwnerName = String(v.owner_name || v.ownerName || '').trim().toLowerCase();
      
      if (vOwnerId && ownerCandidates.has(vOwnerId)) return true;
      if (vOwnerUid && ownerCandidates.has(vOwnerUid)) return true;
      if (vOwnerEmail && ownerCandidates.has(vOwnerEmail)) return true;
      if (vOwnerName && ownerCandidates.has(vOwnerName)) return true;

      // Special check for Ayesha Khaan
      const isAyeshaSearch = Array.from(ownerCandidates).some(c => c.includes('ayesha') || c === 'owner123@gmail.cpm' || c === 'owner123@gmail.com');
      if (isAyeshaSearch) {
        if (vOwnerId === 'ayesha_khaan_owner' || vOwnerName.includes('ayesha') || String(v.name || '').toLowerCase().includes('bridgestone')) {
          return true;
        }
      }

      return false;
    });
  }
  return allVenues;
}

export async function apiFetchTurfs() {
  let customVenues = [];
  try {
    const s = localStorage.getItem('turfington_custom_venues');
    if (s) customVenues = JSON.parse(s);
  } catch {}

  let apiVenues = [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${API_BASE}/api/venues`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      const data = await res.json();
      if (data.venues && Array.isArray(data.venues)) {
        apiVenues = data.venues;
      }
    }
  } catch {}

  let dbVenues = [];
  try {
    const snapVenues = await getDocs(collection(db, 'venues'));
    if (!snapVenues.empty) {
      dbVenues = snapVenues.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch {}

  let dbTurfs = [];
  try {
    const snapTurfs = await getDocs(collection(db, 'turfs'));
    if (!snapTurfs.empty) {
      dbTurfs = snapTurfs.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch {}

  const map = new Map();
  // Order: custom venues first, then API venues, then Firestore, then DEFAULT_TURFS
  [...customVenues, ...apiVenues, ...dbVenues, ...dbTurfs, ...DEFAULT_TURFS].forEach(t => {
    if (!t || (!t.id && !t.name)) return;
    const key = String(t.id || t.name);
    if (map.has(key)) return;

    const resolvedImage = resolveVenueImageUrl(t.storage_path || t.image_url || t.image);
    const lat = parseFloat(t.latitude ?? t.lat) || 13.0827;
    const lng = parseFloat(t.longitude ?? t.lng) || 80.2707;
    const sportsList = Array.isArray(t.sports) && t.sports.length > 0 
      ? t.sports 
      : [t.sport || t.category || 'Sports'];

    let vSlots = t.slots;
    try {
      const savedS = localStorage.getItem('turfington_venue_slots_' + (t.id || key));
      if (savedS) vSlots = JSON.parse(savedS);
    } catch {}

    map.set(key, {
      ...t,
      slots: vSlots,
      id: t.id || key,
      name: t.name || 'Sports Arena',
      venue: t.name || 'Sports Arena',
      sport: t.sport || sportsList[0] || 'Sports',
      category: t.category || t.sport || sportsList[0] || 'Sports',
      sports: sportsList,
      lat,
      lng,
      latitude: lat,
      longitude: lng,
      price: t.price || (t.price_per_hr ? `₹${t.price_per_hr}/hr` : '₹1,000/hr'),
      price_per_hr: Number(t.price_per_hr) || 1000,
      image_url: resolvedImage,
      image: resolvedImage,
      rating: t.rating || 5.0,
      is_open_24_hours: t.is_open_24_hours ?? true,
      isNew: t.isNew ?? (String(t.id).startsWith('venue_') || t.owner_id != null),
      owner_id: t.owner_id || t.ownerId || null,
      owner_name: t.owner_name || t.ownerName || null
    });
  });

  return Array.from(map.values());
}

export function apiSubscribeVenues(callback) {
  if (typeof callback !== 'function') return () => {};

  // 1. Immediately emit current cached/loaded venues
  apiFetchTurfs().then(turfs => callback(turfs));

  // 2. Window event listener for intra-app updates
  const handleUpdate = () => {
    apiFetchTurfs().then(turfs => callback(turfs));
  };
  window.addEventListener('turfington_venues_updated', handleUpdate);

  // 3. Storage event listener for cross-tab localStorage updates
  const handleStorage = (e) => {
    if (e.key === 'turfington_custom_venues' || e.key === 'turfington_venues_timestamp') {
      apiFetchTurfs().then(turfs => callback(turfs));
    }
  };
  window.addEventListener('storage', handleStorage);

  // 4. Cross-tab BroadcastChannel
  let channel = null;
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('turfington_venues_channel');
      channel.onmessage = (msg) => {
        if (msg.data?.type === 'VENUES_UPDATED') {
          apiFetchTurfs().then(turfs => callback(turfs));
        }
      };
    }
  } catch {}

  // 5. Firestore real-time onSnapshot listeners
  let unsubVenues = null;
  let unsubTurfs = null;
  try {
    unsubVenues = onSnapshot(collection(db, 'venues'), (snap) => {
      if (snap && snap.docs) {
        const liveVenues = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        try {
          const s = localStorage.getItem('turfington_custom_venues');
          const existing = s ? JSON.parse(s) : [];
          const map = new Map();
          liveVenues.forEach(v => map.set(String(v.id || v.name), v));
          existing.forEach(v => {
            const k = String(v.id || v.name);
            if (!map.has(k)) map.set(k, v);
          });
          localStorage.setItem('turfington_custom_venues', JSON.stringify(Array.from(map.values())));
        } catch {}
      }
      apiFetchTurfs().then(turfs => callback(turfs));
    }, (err) => {
      console.warn('venues onSnapshot error:', err);
    });
  } catch {}

  try {
    unsubTurfs = onSnapshot(collection(db, 'turfs'), () => {
      apiFetchTurfs().then(turfs => callback(turfs));
    }, () => {});
  } catch {}

  // 6. Return comprehensive cleanup function
  return () => {
    window.removeEventListener('turfington_venues_updated', handleUpdate);
    window.removeEventListener('storage', handleStorage);
    if (channel) {
      channel.close();
    }
    if (unsubVenues) unsubVenues();
    if (unsubTurfs) unsubTurfs();
  };
}

export async function apiFetchNearbyTurfs(playerLat, playerLng, radiusKm = 'All') {
  const allTurfs = await apiFetchTurfs();
  if (!playerLat || !playerLng) return allTurfs;

  const R = 6371;
  const filtered = allTurfs
    .map(t => {
      const lat1 = playerLat;
      const lon1 = playerLng;
      const lat2 = t.latitude || t.lat;
      const lon2 = t.longitude || t.lng;
      if (lat2 == null || lon2 == null) return null;
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) ** 2;
      const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return {
        ...t,
        distance_km: parseFloat(dist.toFixed(1))
      };
    })
    .filter(Boolean)
    .filter(t => radiusKm === 'All' || String(radiusKm) === 'All' || t.distance_km <= Number(radiusKm))
    .sort((a, b) => a.distance_km - b.distance_km);

  return filtered;
}

export async function apiCreateTurf(turfData) {
  try {
    const docRef = await addDoc(collection(db, 'turfs'), {
      ...turfData,
      createdAt: serverTimestamp()
    });
    return { success: true, turf: { id: docRef.id, ...turfData } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

export async function apiCreateVenue(venueData) {
  let venueLat = parseFloat(venueData.lat ?? venueData.latitude) || 13.0827;
  let venueLng = parseFloat(venueData.lng ?? venueData.longitude) || 80.2707;
  if (isNaN(venueLat) || isNaN(venueLng) || venueLat < 8 || venueLat > 36 || venueLng < 68 || venueLng > 97) {
    venueLat = 13.0827;
    venueLng = 80.2707;
  }
  const sportsArr = Array.isArray(venueData.sports) && venueData.sports.length > 0 
    ? venueData.sports 
    : [venueData.sport || 'Sports'];
  let resolvedImg = venueData.image || venueData.image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=800';
  if (resolvedImg && resolvedImg.startsWith('data:image') && resolvedImg.length > 250000) {
    try {
      resolvedImg = await compressDataUrlOrFile(resolvedImg, 1000, 0.78);
    } catch {}
  }

  const currentAuthUid = auth.currentUser?.uid || '';
  const ownerUid = venueData.owner_uid || currentAuthUid || '';
  const ownerId = venueData.owner_id || venueData.ownerId || currentAuthUid || 'usr_venue_owner';
  const ownerEmail = (venueData.owner_email || auth.currentUser?.email || '').toLowerCase().trim();

  const bookingMode = venueData.booking_mode || venueData.booking_type || (venueData.requires_approval ? 'request' : 'direct');
  const requiresApproval = venueData.requires_approval ?? (bookingMode === 'request');

  const isOpen24 = Boolean(venueData.is_open_24_hours === true || venueData.operating_hours === '24 Hours');
  const operatingHours = venueData.operating_hours || (venueData.opening_time && venueData.closing_time ? `${formatTime12Hour(venueData.opening_time)} - ${formatTime12Hour(venueData.closing_time)}` : (isOpen24 ? '24 Hours' : '06:00 AM - 11:00 PM'));

  const customVenue = {
    id: venueData.id || ('venue_' + Date.now()),
    name: venueData.name,
    venue: venueData.name,
    category: venueData.sport || sportsArr[0] || 'Sports',
    sport: venueData.sport || sportsArr[0] || 'Sports',
    sports: sportsArr,
    address: sanitizeLocationToEnglish(venueData.address || venueData.location || 'Chennai, Tamil Nadu'),
    location: sanitizeLocationToEnglish(venueData.address || venueData.location || 'Chennai, Tamil Nadu'),
    city: sanitizeLocationToEnglish(venueData.city || 'Chennai'),
    latitude: venueLat,
    longitude: venueLng,
    lat: venueLat,
    lng: venueLng,
    price: venueData.price_per_hr ? `₹${venueData.price_per_hr}/hr` : '₹1,000/hr',
    price_per_hr: Number(venueData.price_per_hr) || 1000,
    rating: 5.0,
    reviewsCount: 1,
    image_url: resolvedImg,
    image: resolvedImg,
    booking_mode: bookingMode,
    booking_type: bookingMode,
    requires_approval: requiresApproval,
    description: venueData.description || 'Newly added sports venue on Turfington.',
    operating_hours: operatingHours,
    opening_time: venueData.opening_time || '06:00',
    closing_time: venueData.closing_time || '23:00',
    time: operatingHours,
    is_open_24_hours: isOpen24,
    isNew: true,
    owner_id: ownerId,
    owner_uid: ownerUid,
    ownerUid: ownerUid,
    ownerId: ownerId,
    user_id: ownerUid || ownerId,
    userId: ownerUid || ownerId,
    creatorUid: ownerUid,
    creator_id: ownerId,
    owner_email: ownerEmail,
    owner_name: venueData.owner_name || 'Venue Owner',
    created_at: new Date().toISOString()
  };

  // 1. Local Storage save for zero-latency local availability
  try {
    const existingStr = localStorage.getItem('turfington_custom_venues');
    const existing = existingStr ? JSON.parse(existingStr) : [];
    const updated = [customVenue, ...existing.filter(v => v.name !== customVenue.name && v.id !== customVenue.id)];
    localStorage.setItem('turfington_custom_venues', JSON.stringify(updated));
    localStorage.setItem('turfington_venues_timestamp', Date.now().toString());

    // Also persist under owner specific keys
    if (customVenue.owner_id) {
      localStorage.setItem(`turfington_owner_venues_${customVenue.owner_id}`, JSON.stringify(updated));
    }
    if (customVenue.owner_uid) {
      localStorage.setItem(`turfington_owner_venues_${customVenue.owner_uid}`, JSON.stringify(updated));
    }
    if (customVenue.owner_email) {
      localStorage.setItem(`turfington_owner_venues_${customVenue.owner_email}`, JSON.stringify(updated));
    }
  } catch {}

  // 2. Dispatch real-time window events (intra-tab)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_venues_updated', { detail: customVenue }));
  }

  // 3. BroadcastChannel across all browser tabs
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('turfington_venues_channel');
      bc.postMessage({ type: 'VENUES_UPDATED', venue: customVenue });
      bc.close();
    }
  } catch {}

  // 4. Send POST to Express API server in background
  try {
    fetch(`${API_BASE}/api/venues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(customVenue)
    }).catch(() => {});
  } catch {}

  // 5. Firestore sync using deterministic document ID
  try {
    await Promise.allSettled([
      setDoc(doc(db, 'venues', customVenue.id), customVenue, { merge: true }),
      setDoc(doc(db, 'turfs', customVenue.id), customVenue, { merge: true })
    ]);
  } catch (err) {
    console.warn('Firestore setDoc notice:', err);
  }

  return { success: true, venue: customVenue };
}


export async function apiUpdateVenue(venueId, updatedData) {
  const cleanId = String(venueId || updatedData.id || '').trim();
  let venueLat = parseFloat(updatedData.lat ?? updatedData.latitude) || 13.0827;
  let venueLng = parseFloat(updatedData.lng ?? updatedData.longitude) || 80.2707;
  if (isNaN(venueLat) || isNaN(venueLng) || venueLat < 8 || venueLat > 36 || venueLng < 68 || venueLng > 97) {
    venueLat = 13.0827;
    venueLng = 80.2707;
  }
  const sportsArr = Array.isArray(updatedData.sports) && updatedData.sports.length > 0 
    ? updatedData.sports 
    : [updatedData.sport || 'Sports'];
  let resolvedImg = updatedData.image || updatedData.image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=800';
  if (resolvedImg && resolvedImg.startsWith('data:image') && resolvedImg.length > 250000) {
    try {
      resolvedImg = await compressDataUrlOrFile(resolvedImg, 1000, 0.78);
    } catch {}
  }

  const bookingMode = updatedData.booking_mode || updatedData.booking_type || (updatedData.requires_approval ? 'request' : 'direct');
  const requiresApproval = updatedData.requires_approval ?? (bookingMode === 'request');
  const pricePerHour = Number(updatedData.price_per_hr || updatedData.pricePerHour) || 1000;

  const isOpen24 = Boolean(updatedData.is_open_24_hours === true || updatedData.operating_hours === '24 Hours');
  const operatingHours = updatedData.operating_hours || (updatedData.opening_time && updatedData.closing_time ? `${formatTime12Hour(updatedData.opening_time)} - ${formatTime12Hour(updatedData.closing_time)}` : (isOpen24 ? '24 Hours' : '06:00 AM - 11:00 PM'));

  const patch = {
    ...updatedData,
    id: cleanId,
    name: updatedData.name,
    venue: updatedData.name,
    category: updatedData.sport || sportsArr[0] || 'Sports',
    sport: updatedData.sport || sportsArr[0] || 'Sports',
    sports: sportsArr,
    address: sanitizeLocationToEnglish(updatedData.address || updatedData.location || 'Chennai, Tamil Nadu'),
    location: sanitizeLocationToEnglish(updatedData.address || updatedData.location || 'Chennai, Tamil Nadu'),
    city: sanitizeLocationToEnglish(updatedData.city || 'Chennai'),
    latitude: venueLat,
    longitude: venueLng,
    lat: venueLat,
    lng: venueLng,
    price: `₹${pricePerHour}/hr`,
    price_per_hr: pricePerHour,
    pricePerHour: pricePerHour,
    image_url: resolvedImg,
    image: resolvedImg,
    fitMode: updatedData.fitMode || 'cover',
    booking_mode: bookingMode,
    booking_type: bookingMode,
    requires_approval: requiresApproval,
    description: updatedData.description || '',
    phone: updatedData.phone || '',
    operating_hours: operatingHours,
    opening_time: updatedData.opening_time || '06:00',
    closing_time: updatedData.closing_time || '23:00',
    time: operatingHours,
    is_open_24_hours: isOpen24,
    updated_at: new Date().toISOString()
  };

  // 1. Update localStorage
  try {
    const existingStr = localStorage.getItem('turfington_custom_venues');
    if (existingStr) {
      const existing = JSON.parse(existingStr);
      const updated = existing.map(v => (String(v.id) === cleanId || v.name === patch.name) ? { ...v, ...patch } : v);
      localStorage.setItem('turfington_custom_venues', JSON.stringify(updated));
      localStorage.setItem('turfington_venues_timestamp', Date.now().toString());
    }

    const ownerKeys = [patch.owner_id, patch.ownerId, patch.owner_uid, patch.owner_email].filter(Boolean);
    ownerKeys.forEach(k => {
      try {
        const kStr = localStorage.getItem(`turfington_owner_venues_${k}`);
        if (kStr) {
          const arr = JSON.parse(kStr);
          if (Array.isArray(arr)) {
            const upd = arr.map(v => (String(v.id) === cleanId || v.name === patch.name) ? { ...v, ...patch } : v);
            localStorage.setItem(`turfington_owner_venues_${k}`, JSON.stringify(upd));
          }
        }
      } catch {}
    });
  } catch (err) {
    console.warn('apiUpdateVenue localStorage notice:', err);
  }

  // 2. Dispatch real-time events intra-app
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_venues_updated', { detail: patch }));
  }

  // 3. Broadcast across tabs
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('turfington_venues_channel');
      bc.postMessage({ type: 'VENUES_UPDATED', venue: patch });
      bc.close();
    }
  } catch {}

  // 4. Update Firestore collections 'venues' and 'turfs'
  try {
    await Promise.allSettled([
      setDoc(doc(db, 'venues', cleanId), patch, { merge: true }),
      setDoc(doc(db, 'turfs', cleanId), patch, { merge: true })
    ]);
  } catch (err) {
    console.warn('apiUpdateVenue Firestore notice:', err);
  }

  return { success: true, venue: patch };
}

export async function apiDeleteVenue(venueInput, venueDataInput = null) {
  const targetId = typeof venueInput === 'object' && venueInput !== null 
    ? (venueInput.id || venueInput.venueId || venueInput.name)
    : venueInput;
  const venueObj = typeof venueInput === 'object' ? venueInput : (venueDataInput || {});
  const cleanId = String(targetId || '').trim();
  const venueName = String(venueObj.name || venueObj.venue || venueObj.title || '').trim();

  // 1. Delete from local storage custom venues
  try {
    const existingStr = localStorage.getItem('turfington_custom_venues');
    if (existingStr) {
      const existing = JSON.parse(existingStr);
      const updated = existing.filter(v => {
        const vid = String(v.id || '').trim();
        const vname = String(v.name || v.venue || '').trim();
        return vid !== cleanId && (!venueName || vname !== venueName);
      });
      localStorage.setItem('turfington_custom_venues', JSON.stringify(updated));
      localStorage.setItem('turfington_venues_timestamp', Date.now().toString());
    }

    // Clean up owner-specific venue lists
    const ownerKeys = [venueObj.owner_id, venueObj.ownerId, venueObj.owner_uid, venueObj.owner_email].filter(Boolean);
    ownerKeys.forEach(k => {
      try {
        const kStr = localStorage.getItem(`turfington_owner_venues_${k}`);
        if (kStr) {
          const arr = JSON.parse(kStr);
          if (Array.isArray(arr)) {
            const upd = arr.filter(v => String(v.id) !== cleanId && v.name !== venueName);
            localStorage.setItem(`turfington_owner_venues_${k}`, JSON.stringify(upd));
          }
        }
      } catch {}
    });

    // Remove slot cache
    if (cleanId) {
      localStorage.removeItem(`turfington_venue_slots_${cleanId}`);
    }
  } catch (err) {
    console.warn('apiDeleteVenue localStorage notice:', err);
  }

  // 2. Dispatch real-time events intra-app
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_venues_updated', { detail: { deletedId: cleanId, deletedName: venueName } }));
  }

  // 3. Broadcast across tabs
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('turfington_venues_channel');
      bc.postMessage({ type: 'VENUES_UPDATED', deletedId: cleanId, deletedName: venueName });
      bc.close();
    }
  } catch {}

  // 4. API Backend deletion
  try {
    if (cleanId) {
      fetch(`${API_BASE}/api/venues/${encodeURIComponent(cleanId)}`, { method: 'DELETE' }).catch(() => {});
    }
  } catch {}

  // 5. Firestore deletion: Direct document deletion from both 'venues' and 'turfs'
  const firestorePromises = [];
  if (cleanId) {
    try {
      firestorePromises.push(deleteDoc(doc(db, 'venues', cleanId)));
    } catch {}
    try {
      firestorePromises.push(deleteDoc(doc(db, 'turfs', cleanId)));
    } catch {}
  }

  // 6. Firestore deletion: Query-based cleanup in case document has auto-generated ID or matches by name/id field
  try {
    if (cleanId) {
      const qVId = query(collection(db, 'venues'), where('id', '==', cleanId));
      const snapVId = await getDocs(qVId);
      snapVId.docs.forEach(d => {
        firestorePromises.push(deleteDoc(doc(db, 'venues', d.id)));
      });

      const qTId = query(collection(db, 'turfs'), where('id', '==', cleanId));
      const snapTId = await getDocs(qTId);
      snapTId.docs.forEach(d => {
        firestorePromises.push(deleteDoc(doc(db, 'turfs', d.id)));
      });
    }
  } catch (err) {
    console.warn('Firestore venue ID query cleanup notice:', err);
  }

  if (venueName) {
    try {
      const qVName = query(collection(db, 'venues'), where('name', '==', venueName));
      const snapVName = await getDocs(qVName);
      snapVName.docs.forEach(d => {
        firestorePromises.push(deleteDoc(doc(db, 'venues', d.id)));
      });

      const qTName = query(collection(db, 'turfs'), where('name', '==', venueName));
      const snapTName = await getDocs(qTName);
      snapTName.docs.forEach(d => {
        firestorePromises.push(deleteDoc(doc(db, 'turfs', d.id)));
      });
    } catch (err) {
      console.warn('Firestore venue name query cleanup notice:', err);
    }
  }

  try {
    await Promise.allSettled(firestorePromises);
  } catch (err) {
    console.warn('Firestore deleteDoc notice:', err);
  }

  return { success: true };
}

export async function apiUpdateVenueBookingMode(venueId, newMode) {
  const isRequest = newMode === 'request';
  try {
    const existingStr = localStorage.getItem('turfington_custom_venues');
    if (existingStr) {
      const existing = JSON.parse(existingStr);
      const updated = existing.map(v => (v.id === venueId || v.name === venueId) ? { ...v, booking_mode: newMode, booking_type: newMode, requires_approval: isRequest } : v);
      localStorage.setItem('turfington_custom_venues', JSON.stringify(updated));
    }
  } catch {}

  try {
    const vIdStr = String(venueId);
    await Promise.allSettled([
      setDoc(doc(db, 'venues', vIdStr), { booking_mode: newMode, booking_type: newMode, requires_approval: isRequest }, { merge: true }),
      setDoc(doc(db, 'turfs', vIdStr), { booking_mode: newMode, booking_type: newMode, requires_approval: isRequest }, { merge: true })
    ]);
  } catch (e) {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_venues_updated'));
  }
  return { success: true, booking_mode: newMode };
}


// -- 5. Bookings ---------------------------------------------

export async function apiFetchBookings(userId) {
  const targetUserId = typeof userId === 'object' && userId !== null 
    ? (userId.userId || userId.user_id || userId.id || userId.uid) 
    : userId;

  let localBookings = [];
  if (targetUserId) {
    try {
      const sU = localStorage.getItem(`turfington_user_bookings_${targetUserId}`);
      if (sU) {
        const pU = JSON.parse(sU);
        if (Array.isArray(pU)) localBookings = [...pU];
      }
    } catch {}
  }

  try {
    const s1 = localStorage.getItem('turfington_user_bookings');
    if (s1) {
      const p1 = JSON.parse(s1);
      if (Array.isArray(p1)) {
        const filtered = targetUserId ? p1.filter(b => b.user_id === targetUserId || b.userId === targetUserId) : p1;
        localBookings = [...localBookings, ...filtered];
      }
    }
  } catch {}

  try {
    const s2 = localStorage.getItem('turfington_bookings');
    if (s2) {
      const p2 = JSON.parse(s2);
      if (Array.isArray(p2)) {
        const filtered = targetUserId ? p2.filter(b => b.user_id === targetUserId || b.userId === targetUserId) : p2;
        localBookings = [...localBookings, ...filtered];
      }
    }
  } catch {}

  let dbBookings = [];
  if (targetUserId && typeof targetUserId === 'string' && targetUserId.trim() !== '') {
    try {
      const q = query(collection(db, 'bookings'), where('user_id', '==', targetUserId.trim()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        dbBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    } catch (err) {
      console.warn('apiFetchBookings Firestore error:', err);
    }
  }

  const map = new Map();
  [...dbBookings, ...localBookings].forEach(b => {
    if (b && b.id) {
      if (!targetUserId || b.user_id === targetUserId || b.userId === targetUserId) {
        map.set(String(b.id), b);
      }
    }
  });
  return Array.from(map.values());
}

export async function apiCreateBooking(bookingData) {
  const bookingId = bookingData.id || 'bk_' + Date.now();
  const venueTitle = bookingData.venue || bookingData.venue_name || bookingData.title || 'Sports Arena';
  const rawTime = bookingData.time || bookingData.slot_time || 'Today, Flexible Slot';
  const rawDate = bookingData.date || (rawTime.includes(',') ? rawTime.split(',')[0].trim() : 'Today');

  const defaultStatus = (bookingData.booking_mode === 'request' || bookingData.requires_approval) 
    ? 'PENDING OWNER APPROVAL' 
    : (bookingData.status || 'CONFIRMED');

  const newBooking = {
    id: bookingId,
    created_at: bookingData.created_at || new Date().toISOString(),
    status: bookingData.status || defaultStatus,
    booking_mode: bookingData.booking_mode || ((bookingData.status === 'PENDING OWNER APPROVAL' || bookingData.requires_approval) ? 'request' : 'direct'),
    rejection_reason: bookingData.rejection_reason || null,
    venue: venueTitle,
    venue_name: venueTitle,
    title: venueTitle,
    sport: bookingData.sport || 'Football',
    time: rawTime,
    slot_time: rawTime,
    date: rawDate,
    price: bookingData.price || '₹1,200',
    image: bookingData.image || bookingData.image_url || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=400',
    user_id: bookingData.user_id || bookingData.userId || 'usr_guest',
    user_name: bookingData.user_name || bookingData.player_name || 'Player',
    player_name: bookingData.player_name || bookingData.user_name || 'Player',
    player_phone: bookingData.player_phone || '',
    owner_id: bookingData.owner_id || bookingData.ownerId || 'usr_venue_owner',
    owner_name: bookingData.owner_name || bookingData.ownerName || venueTitle,
    payment_type: bookingData.payment_type || bookingData.paymentType || 'pay_at_venue',
    payment_status: bookingData.payment_status || bookingData.paymentStatus || 'pending_at_venue',
    ...bookingData
  };

  if (newBooking.user_id) {
    try {
      const uKey = `turfington_user_bookings_${newBooking.user_id}`;
      const sU = localStorage.getItem(uKey);
      const existingU = sU ? JSON.parse(sU) : [];
      const updatedU = [newBooking, ...existingU.filter(b => b.id !== newBooking.id)];
      localStorage.setItem(uKey, JSON.stringify(updatedU));
    } catch {}
  }

  try {
    const s = localStorage.getItem('turfington_user_bookings');
    const existing = s ? JSON.parse(s) : [];
    const updated = [newBooking, ...existing.filter(b => b.id !== newBooking.id)];
    localStorage.setItem('turfington_user_bookings', JSON.stringify(updated));
  } catch {}

  try {
    const s2 = localStorage.getItem('turfington_bookings');
    const existing2 = s2 ? JSON.parse(s2) : [];
    const updated2 = [newBooking, ...existing2.filter(b => b.id !== newBooking.id)];
    localStorage.setItem('turfington_bookings', JSON.stringify(updated2));
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('turfington_booking_created', { detail: newBooking }));
  } catch {}

  addDoc(collection(db, 'bookings'), {
    ...newBooking,
    createdAt: serverTimestamp()
  }).catch(() => {});

  return { success: true, data: newBooking };
}

export async function apiUpdateBookingStatus(bookingId, status, rejectionReason = null) {
  try {
    // 1. Update in local storage
    const s = localStorage.getItem('turfington_user_bookings');
    if (s) {
      const existing = JSON.parse(s);
      const updated = existing.map(b => {
        if (b.id === bookingId) {
          return { ...b, status, rejection_reason: rejectionReason, updated_at: new Date().toISOString() };
        }
        return b;
      });
      localStorage.setItem('turfington_user_bookings', JSON.stringify(updated));
    }
  } catch {}

  try {
    const s2 = localStorage.getItem('turfington_bookings');
    if (s2) {
      const existing2 = JSON.parse(s2);
      const updated2 = existing2.map(b => {
        if (b.id === bookingId) {
          return { ...b, status, rejection_reason: rejectionReason, updated_at: new Date().toISOString() };
        }
        return b;
      });
      localStorage.setItem('turfington_bookings', JSON.stringify(updated2));
    }
  } catch {}

  try {
    window.dispatchEvent(new CustomEvent('turfington_booking_updated', { detail: { bookingId, status, rejectionReason } }));
  } catch {}

  // 2. Update Firestore
  try {
    const q = query(collection(db, 'bookings'), where('id', '==', bookingId));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const docRef = doc(db, 'bookings', snap.docs[0].id);
      await updateDoc(docRef, {
        status,
        rejection_reason: rejectionReason,
        updatedAt: serverTimestamp()
      });
    }
  } catch (err) {
    console.warn('apiUpdateBookingStatus Firestore error:', err);
  }

  return { success: true };
}

export async function apiFetchOwnerBookings(ownerQuery) {
  const ownerCandidates = new Set();
  const addCand = (val) => {
    if (val && typeof val === 'string' && val.trim()) {
      ownerCandidates.add(val.trim().toLowerCase());
    }
  };

  if (typeof ownerQuery === 'object' && ownerQuery !== null) {
    addCand(ownerQuery.ownerId);
    addCand(ownerQuery.owner_id);
    addCand(ownerQuery.ownerUid);
    addCand(ownerQuery.ownerEmail);
    addCand(ownerQuery.owner_email);
    addCand(ownerQuery.ownerName);
    addCand(ownerQuery.owner_name);
    addCand(ownerQuery.id);
    addCand(ownerQuery.uid);
  } else if (typeof ownerQuery === 'string') {
    addCand(ownerQuery);
  }

  // Collect all venues owned by this owner
  const ownerVenues = await apiFetchVenues(typeof ownerQuery === 'object' ? ownerQuery : { ownerId: ownerQuery });
  const ownerVenueIds = new Set(ownerVenues.map(v => String(v.id).toLowerCase()));
  const ownerVenueNames = new Set(ownerVenues.map(v => String(v.name || v.venue || '').toLowerCase().trim()));

  let localBookings = [];
  try {
    const s1 = localStorage.getItem('turfington_user_bookings');
    if (s1) {
      const p1 = JSON.parse(s1);
      if (Array.isArray(p1)) localBookings = [...localBookings, ...p1];
    }
  } catch {}

  try {
    const s2 = localStorage.getItem('turfington_bookings');
    if (s2) {
      const p2 = JSON.parse(s2);
      if (Array.isArray(p2)) localBookings = [...localBookings, ...p2];
    }
  } catch {}

  // Check owner specific bookings storage
  ownerCandidates.forEach(cand => {
    try {
      const sO = localStorage.getItem(`turfington_owner_bookings_${cand}`);
      if (sO) {
        const pO = JSON.parse(sO);
        if (Array.isArray(pO)) localBookings = [...localBookings, ...pO];
      }
    } catch {}
  });

  let dbBookings = [];
  try {
    const snap = await getDocs(collection(db, 'bookings'));
    if (!snap.empty) {
      dbBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {}

  const map = new Map();
  [...dbBookings, ...localBookings].forEach(b => {
    if (!b || !b.id) return;
    const bOwnerId = String(b.owner_id || b.ownerId || '').trim().toLowerCase();
    const bOwnerUid = String(b.owner_uid || '').trim().toLowerCase();
    const bOwnerEmail = String(b.owner_email || '').trim().toLowerCase();
    const bOwnerName = String(b.owner_name || b.ownerName || '').trim().toLowerCase();
    const bVenueId = String(b.venue_id || b.venueId || '').trim().toLowerCase();
    const bVenueName = String(b.venue || b.venue_name || b.title || '').trim().toLowerCase();

    let matches = false;
    if (ownerCandidates.size > 0) {
      if (bOwnerId && ownerCandidates.has(bOwnerId)) matches = true;
      if (bOwnerUid && ownerCandidates.has(bOwnerUid)) matches = true;
      if (bOwnerEmail && ownerCandidates.has(bOwnerEmail)) matches = true;
      if (bOwnerName && ownerCandidates.has(bOwnerName)) matches = true;
      if (bVenueId && ownerVenueIds.has(bVenueId)) matches = true;
      if (bVenueName && ownerVenueNames.has(bVenueName)) matches = true;

      // Also check special case for Ayesha Khaan
      const isAyeshaSearch = Array.from(ownerCandidates).some(c => c.includes('ayesha') || c === 'owner123@gmail.cpm' || c === 'owner123@gmail.com');
      if (isAyeshaSearch) {
        if (bOwnerId === 'ayesha_khaan_owner' || bOwnerName.includes('ayesha') || bVenueName.includes('bridgestone')) {
          matches = true;
        }
      }
    } else {
      matches = true;
    }

    if (matches) {
      map.set(String(b.id), b);
    }
  });

  return Array.from(map.values()).sort((a, b) => {
    return new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0);
  });
}

// ----------------------------------------------------------------------

export async function apiFetchClubs() {
  try {
    const snap = await getDocs(collection(db, 'clubs'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    return [];
  }
}

export async function apiCreateClub(clubData) {
  try {
    const docRef = await addDoc(collection(db, 'clubs'), {
      ...clubData,
      createdAt: serverTimestamp()
    });
    return { success: true, club: { id: docRef.id, ...clubData } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

export async function apiFetchStories() {
  try {
    const q = query(collection(db, 'stories'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    return [];
  }
}

export async function apiCreateStory(storyData) {
  try {
    const docRef = await addDoc(collection(db, 'stories'), {
      ...storyData,
      createdAt: serverTimestamp()
    });
    return { success: true, story: { id: docRef.id, ...storyData } };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

const DEFAULT_FEED_POSTS = [
  {
    id: 'post_501',
    author: 'Rahul Sharma',
    avatar: '',
    time: '2 hours ago',
    content: 'Just booked the main court at Vanguard Arena for 7 PM tomorrow. We need 3 more players for a 5v5 friendly. Skill level: Intermediate. Let me know if you want in!',
    image: '/turf_story_highlight.png',
    likes: 18,
    comments: 6,
    liked_by: [],
    createdAt: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  },
  {
    id: 'post_502',
    author: 'Vanguard Sports Arena',
    avatar: 'https://api.dicebear.com/7.x/identicon/svg?seed=Vanguard',
    time: '4 hours ago',
    content: '🔥 WET SLOTS AVAILABLE TONIGHT: Astroturf Court 2 has open slots between 9 PM and 11 PM. Flat 15% discount for bookings made in the next hour! Contact us now to reserve.',
    image: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=600',
    likes: 45,
    comments: 11,
    liked_by: ['usr_rahul'],
    createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString()
  }
];

export async function apiFetchPosts() {
  let localPosts = [];
  try {
    const s = localStorage.getItem('turfington_feed_posts');
    localPosts = s ? JSON.parse(s) : DEFAULT_FEED_POSTS;
  } catch {
    localPosts = DEFAULT_FEED_POSTS;
  }

  // 1. Fetch from Express backend server (cross-account shared DB on localhost)
  let serverPosts = [];
  try {
    const res = await fetch(`${API_BASE}/api/posts`);
    if (res.ok) {
      const data = await res.json();
      serverPosts = Array.isArray(data) ? data : (Array.isArray(data?.posts) ? data.posts : []);
    }
  } catch (e) {}

  // 2. Fetch from Firestore if available
  let firestorePosts = [];
  try {
    const q = query(collection(db, 'posts'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    if (!snap.empty) {
      firestorePosts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  } catch (err) {}

  // 3. Deduplicate and merge by post ID
  const map = new Map();
  if (Array.isArray(DEFAULT_FEED_POSTS)) DEFAULT_FEED_POSTS.forEach(p => map.set(String(p.id), p));
  if (Array.isArray(localPosts)) localPosts.forEach(p => map.set(String(p.id), { ...map.get(String(p.id)), ...p }));
  if (Array.isArray(serverPosts)) serverPosts.forEach(p => map.set(String(p.id), { ...map.get(String(p.id)), ...p }));
  if (Array.isArray(firestorePosts)) firestorePosts.forEach(p => map.set(String(p.id), { ...map.get(String(p.id)), ...p }));

  const merged = Array.from(map.values()).sort((a, b) => {
    const timeA = new Date(a.createdAt || a.created_at || 0).getTime();
    const timeB = new Date(b.createdAt || b.created_at || 0).getTime();
    return timeB - timeA;
  });

  try {
    localStorage.setItem('turfington_feed_posts', JSON.stringify(merged));
  } catch {}

  return merged;
}

export async function apiCreatePost(postData) {
  const postId = postData.id || `post_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const now = new Date().toISOString();
  const formattedPost = {
    ...postData,
    id: postId,
    likes: postData.likes || 0,
    comments: postData.comments || 0,
    liked_by: postData.liked_by || [],
    time: postData.time || 'Just now',
    createdAt: now,
    created_at: now,
    user_id: postData.author_id || postData.user_id || 'usr_anonymous',
    created_by: postData.author_id || postData.user_id || 'usr_anonymous'
  };

  // 1. Immediately persist to shared localStorage (accessible across all accounts in this browser)
  try {
    const existingStr = localStorage.getItem('turfington_feed_posts');
    const existing = existingStr ? JSON.parse(existingStr) : DEFAULT_FEED_POSTS;
    const updated = [formattedPost, ...existing.filter(p => String(p.id) !== String(postId))];
    localStorage.setItem('turfington_feed_posts', JSON.stringify(updated));
  } catch (e) {}

  // 2. Persist to Express backend server
  try {
    fetch(`${API_BASE}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formattedPost)
    }).catch(() => {});
  } catch (e) {}

  // 3. Persist to Firestore
  try {
    addDoc(collection(db, 'posts'), {
      ...formattedPost,
      createdAt: serverTimestamp()
    }).catch(() => {});
  } catch (e) {}

  return { success: true, post: formattedPost };
}

export async function apiLikePost(postId, userId) {
  // 1. Update shared localStorage
  try {
    const existingStr = localStorage.getItem('turfington_feed_posts');
    const existing = existingStr ? JSON.parse(existingStr) : DEFAULT_FEED_POSTS;
    const updated = existing.map(p => {
      if (String(p.id) === String(postId)) {
        const likedBy = p.liked_by || [];
        const isLiked = likedBy.includes(userId);
        const newLikedBy = isLiked ? likedBy.filter(u => u !== userId) : [...likedBy, userId];
        const newLikes = isLiked ? Math.max(0, (p.likes || 1) - 1) : (p.likes || 0) + 1;
        return { ...p, liked_by: newLikedBy, likes: newLikes };
      }
      return p;
    });
    localStorage.setItem('turfington_feed_posts', JSON.stringify(updated));
  } catch (e) {}

  // 2. Update Express server
  try {
    fetch(`${API_BASE}/api/posts/${postId}/like`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    }).catch(() => {});
  } catch (e) {}

  return { success: true };
}

const MOCK_MARKETPLACE_IDS = new Set(['mp_item_1', 'mp_item_2', 'mp_item_3', 'mp_item_4']);
const MOCK_SELLER_NAMES = new Set(['Kabir Verma', 'Rohan Sharma', 'Priya Iyer', 'Aditya Nair']);

const INITIAL_MARKETPLACE_ITEMS = [];

export async function apiFetchMarketplaceItems() {
  let localItems = [];
  try {
    const s = localStorage.getItem('turfington_marketplace_items');
    if (s) {
      const parsed = JSON.parse(s);
      localItems = Array.isArray(parsed) ? parsed : [];
    }
  } catch {
    localItems = [];
  }

  // Strictly filter out mock items
  localItems = (localItems || []).filter(item => 
    item && typeof item === 'object' && item.id &&
    !MOCK_MARKETPLACE_IDS.has(item.id) &&
    !MOCK_SELLER_NAMES.has(item.sellerName) &&
    !MOCK_SELLER_NAMES.has(item.seller_name)
  );

  try {
    const snap = await getDocs(collection(db, 'marketplace_items'));
    if (!snap.empty) {
      const dbItems = snap.docs.map(item => ({ id: item.id, ...item.data() }));
      const cleanDbItems = dbItems.filter(item => 
        item && typeof item === 'object' && item.id &&
        !MOCK_MARKETPLACE_IDS.has(item.id) &&
        !MOCK_SELLER_NAMES.has(item.sellerName) &&
        !MOCK_SELLER_NAMES.has(item.seller_name)
      );
      const map = new Map();
      localItems.forEach(item => {
        if (item && item.id) map.set(item.id, item);
      });
      cleanDbItems.forEach(item => {
        if (item && item.id) map.set(item.id, { ...(map.get(item.id) || {}), ...item });
      });
      const merged = Array.from(map.values());
      try {
        localStorage.setItem('turfington_marketplace_items', JSON.stringify(merged));
      } catch {}
      return merged;
    }
  } catch (err) {
    console.warn('apiFetchMarketplaceItems remote fetch warning:', err);
  }

  return localItems;
}

/**
 * Safely compress raw base64 data URLs or File objects using HTML5 Canvas
 * Prevents Firestore 1MB document size limit rejections (reduces 10MB raw photos to ~50KB)
 */
export function compressDataUrlOrFile(fileOrDataUrl, maxDim = 800, quality = 0.75) {
  return new Promise((resolve) => {
    if (!fileOrDataUrl) return resolve('');
    if (typeof fileOrDataUrl === 'string' && !fileOrDataUrl.startsWith('data:image')) {
      return resolve(fileOrDataUrl);
    }
    if (typeof document === 'undefined') return resolve(fileOrDataUrl);

    const img = new Image();
    img.onload = () => {
      try {
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
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      } catch {
        resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
      }
    };
    img.onerror = () => {
      resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
    };

    if (typeof fileOrDataUrl === 'string') {
      img.src = fileOrDataUrl;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target?.result; };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}

export function apiSubscribeMarketplaceItems(callback) {
  if (typeof callback !== 'function') return () => {};

  // 1. Initial cached/remote load
  apiFetchMarketplaceItems().then(items => callback(items));

  // Auto-compress and sync any locally-listed gear to Firestore so phone can fetch them immediately!
  try {
    const localStr = localStorage.getItem('turfington_marketplace_items');
    if (localStr) {
      const localItems = JSON.parse(localStr);
      if (Array.isArray(localItems) && localItems.length > 0) {
        localItems.forEach(async (item) => {
          if (item && item.id && !MOCK_MARKETPLACE_IDS.has(item.id)) {
            let itemImg = item.image || item.image_url;
            if (itemImg && itemImg.startsWith('data:image') && itemImg.length > 200000) {
              itemImg = await compressDataUrlOrFile(itemImg, 800, 0.75);
              item.image = itemImg;
              item.image_url = itemImg;
            }
            await setDoc(doc(db, 'marketplace_items', item.id), {
              ...item,
              image: itemImg,
              image_url: itemImg,
              createdAt: serverTimestamp()
            }, { merge: true }).catch(err => console.warn('Sync local item to firestore notice:', err));
          }
        });
      }
    }
  } catch {}

  // 2. Window event listener
  const handleUpdate = () => {
    apiFetchMarketplaceItems().then(items => callback(items));
  };
  window.addEventListener('turfington_marketplace_updated', handleUpdate);

  // 3. Firestore onSnapshot real-time listener
  let unsubFirestore = null;
  try {
    unsubFirestore = onSnapshot(collection(db, 'marketplace_items'), (snap) => {
      const dbItems = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => item && item.id && !MOCK_MARKETPLACE_IDS.has(item.id));
      
      // Merge with any freshly added local items so they aren't lost during async sync
      let mergedItems = dbItems;
      try {
        const localStr = localStorage.getItem('turfington_marketplace_items');
        if (localStr) {
          const localParsed = JSON.parse(localStr);
          if (Array.isArray(localParsed)) {
            const map = new Map();
            localParsed.forEach(it => { if (it && it.id) map.set(it.id, it); });
            dbItems.forEach(it => { if (it && it.id) map.set(it.id, it); });
            mergedItems = Array.from(map.values());
          }
        }
        localStorage.setItem('turfington_marketplace_items', JSON.stringify(mergedItems));
      } catch {}
      callback(mergedItems);
    }, (err) => {
      console.warn('marketplace onSnapshot warning:', err);
    });
  } catch {}

  return () => {
    window.removeEventListener('turfington_marketplace_updated', handleUpdate);
    if (typeof unsubFirestore === 'function') unsubFirestore();
  };
}

export async function apiCreateMarketplaceItem(itemData) {
  const currentUid = auth.currentUser?.uid || itemData.seller_id || itemData.sellerId || 'usr_' + Date.now();
  let img = itemData.image_url || itemData.image || 'https://images.unsplash.com/photo-1511067007398-7e4b90cfa4bc?q=80&w=400';
  if (img && img.startsWith('data:image') && img.length > 200000) {
    try {
      img = await compressDataUrlOrFile(img, 800, 0.75);
    } catch {}
  }

  const newItem = {
    id: itemData.id || ('mp_' + Date.now()),
    name: itemData.name || 'Sports Equipment',
    category: itemData.category || 'Equipment',
    price: Number(itemData.price) || 0,
    condition: itemData.condition || 'New (Sealed Pack)',
    tag: itemData.condition || 'New (Sealed Pack)',
    description: itemData.description || '',
    image: img,
    image_url: img,
    seller_id: itemData.seller_id || currentUid,
    sellerId: itemData.seller_id || currentUid,
    seller_uid: itemData.seller_id || currentUid,
    userId: itemData.seller_id || currentUid,
    sellerName: typeof itemData.sellerName === 'string' ? itemData.sellerName : 'Community Athlete',
    sellerAvatar: itemData.sellerAvatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Athlete',
    isUserCreated: true,
    created_at: new Date().toISOString()
  };

  try {
    const existingStr = localStorage.getItem('turfington_marketplace_items');
    let existing = [];
    if (existingStr) {
      const parsed = JSON.parse(existingStr);
      existing = Array.isArray(parsed) ? parsed : [];
    } else {
      existing = [];
    }
    const updated = [newItem, ...existing.filter(i => i && i.id !== newItem.id)];
    localStorage.setItem('turfington_marketplace_items', JSON.stringify(updated));
  } catch (err) {
    console.warn('localStorage save item warning:', err);
  }

  // Deterministic setDoc to Firestore
  try {
    await setDoc(doc(db, 'marketplace_items', newItem.id), {
      ...itemData,
      ...newItem,
      image: img,
      image_url: img,
      createdAt: serverTimestamp()
    }, { merge: true });
  } catch (firestoreErr) {
    console.warn('apiCreateMarketplaceItem Firestore notice:', firestoreErr);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_marketplace_updated', { detail: newItem }));
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('turfington_marketplace_channel');
      bc.postMessage({ type: 'MARKETPLACE_UPDATED', item: newItem });
      bc.close();
    }
  } catch {}

  return { success: true, item: newItem };
}

export async function apiUpdateMarketplaceItem(itemId, updatedData) {
  let patch = { ...updatedData };
  if (patch.image && patch.image.startsWith('data:image') && patch.image.length > 200000) {
    try {
      const comp = await compressDataUrlOrFile(patch.image, 800, 0.75);
      patch.image = comp;
      patch.image_url = comp;
    } catch {}
  }

  try {
    const existingStr = localStorage.getItem('turfington_marketplace_items');
    let existing = [];
    if (existingStr) {
      const parsed = JSON.parse(existingStr);
      existing = Array.isArray(parsed) ? parsed : [];
    } else {
      existing = [];
    }
    const updated = existing.map(item => item && item.id === itemId ? { ...item, ...patch } : item);
    localStorage.setItem('turfington_marketplace_items', JSON.stringify(updated));
  } catch (err) {
    console.warn('localStorage update warning:', err);
  }

  try {
    await setDoc(doc(db, 'marketplace_items', itemId), patch, { merge: true });
  } catch {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_marketplace_updated', { detail: { id: itemId, ...updatedData } }));
  }

  return { success: true };
}

export async function apiDeleteMarketplaceItem(itemId) {
  try {
    const existingStr = localStorage.getItem('turfington_marketplace_items');
    let existing = [];
    if (existingStr) {
      const parsed = JSON.parse(existingStr);
      existing = Array.isArray(parsed) ? parsed : [];
    }
    const updated = existing.filter(item => item && item.id !== itemId);
    localStorage.setItem('turfington_marketplace_items', JSON.stringify(updated));
  } catch (err) {
    console.warn('localStorage delete warning:', err);
  }

  try {
    await deleteDoc(doc(db, 'marketplace_items', itemId));
  } catch (e) {
    console.warn('apiDeleteMarketplaceItem Firestore notice:', e);
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_marketplace_updated', { detail: { id: itemId, deleted: true } }));
  }
  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('turfington_marketplace_channel');
      bc.postMessage({ type: 'MARKETPLACE_UPDATED', item: { id: itemId, deleted: true } });
      bc.close();
    }
  } catch {}

  return { success: true };
}


export async function apiGetEmailByUsername(username) {
  if (!username) return null;
  const cleanU = String(username).trim().toLowerCase().replace(/^@/, '');

  // 1. Check local storage profiles & accounts
  try {
    const pKeys = ['turfington_saved_profiles', 'turfington_profiles', 'turfington_accounts', 'turfington_registered_users'];
    for (const key of pKeys) {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        const list = Array.isArray(parsed) ? parsed : Object.values(parsed);
        const match = list.find(p => String(p?.username || '').trim().toLowerCase() === cleanU && p?.email);
        if (match && match.email) return match.email.trim().toLowerCase();
      }
    }
  } catch {}

  // 2. Check Firestore
  try {
    const q = query(collection(db, 'profiles'), where('username', '==', cleanU), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs[0].data().email?.trim()?.toLowerCase();
    }
  } catch (err) {}

  try {
    const q2 = query(collection(db, 'profiles'), where('username', '==', username.trim()), limit(1));
    const snap2 = await getDocs(q2);
    if (!snap2.empty) {
      return snap2.docs[0].data().email?.trim()?.toLowerCase();
    }
  } catch (err) {}

  return null;
}

// ── 15. PEER REVIEWS & PERFORMANCE / BEHAVIOUR RATINGS ──────────
export async function apiFetchPlayerReviews(playerId) {
  const cacheKey = 'turfington_player_reviews_' + playerId;
  try {
    const res = await fetch(`${API_BASE}/api/players/${encodeURIComponent(playerId)}/reviews`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch {}
        return data;
      }
    }
  } catch (err) {
    console.warn('Backend player reviews fetch error, falling back to cache:', err.message);
  }

  // Local storage fallback
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}

  // When no reviews exist yet for this user in the database or cache, return clean empty state
  return {
    success: true,
    playerId,
    totalReviews: 0,
    avgPerformance: 5.0,
    avgBehaviour: 5.0,
    overallScore: 5.0,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
    badgeCounts: {},
    reviews: []
  };
}

// Color coding helper for player ratings: High (Green), Medium (Yellow), Low (Red)
export function getRatingColor(rating) {
  const num = parseFloat(rating) || 0;
  if (num >= 4.0) {
    return {
      level: 'high',
      colorName: 'green',
      text: 'text-emerald-400',
      textMuted: 'text-emerald-300',
      bg: 'bg-emerald-500',
      bgMuted: 'bg-emerald-500/15',
      border: 'border-emerald-500/30',
      borderLight: 'border-emerald-500/20',
      starFill: 'fill-emerald-400 text-emerald-400',
      gradient: 'from-emerald-500 to-green-400',
      glow: 'shadow-emerald-500/20',
      label: 'High Rating'
    };
  }
  if (num >= 2.5) {
    return {
      level: 'medium',
      colorName: 'yellow',
      text: 'text-amber-400',
      textMuted: 'text-amber-300',
      bg: 'bg-amber-500',
      bgMuted: 'bg-amber-500/15',
      border: 'border-amber-500/30',
      borderLight: 'border-amber-500/20',
      starFill: 'fill-amber-400 text-amber-400',
      gradient: 'from-amber-500 to-yellow-400',
      glow: 'shadow-amber-500/20',
      label: 'Medium Rating'
    };
  }
  return {
    level: 'low',
    colorName: 'red',
    text: 'text-rose-500',
    textMuted: 'text-rose-400',
    bg: 'bg-rose-500',
    bgMuted: 'bg-rose-500/15',
    border: 'border-rose-500/30',
    borderLight: 'border-rose-500/20',
    starFill: 'fill-rose-500 text-rose-500',
    gradient: 'from-rose-600 to-red-400',
    glow: 'shadow-rose-500/20',
    label: 'Low Rating'
  };
}

export async function apiSubmitPlayerReview(playerId, reviewData) {
  const cacheKey = 'turfington_player_reviews_' + playerId;
  let serverReview = null;

  try {
    const res = await fetch(`${API_BASE}/api/players/${encodeURIComponent(playerId)}/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewData)
    });
    if (res.ok) {
      const json = await res.json();
      serverReview = json.review;
    }
  } catch (err) {
    console.warn('Backend player review submit notice:', err.message);
  }

  const reviewToSave = serverReview || {
    id: 'rev_' + Date.now(),
    player_id: playerId,
    reviewer_id: reviewData.reviewer_id || 'usr_anonymous',
    reviewer_name: reviewData.reviewer_name || 'Anonymous Athlete',
    reviewer_avatar: reviewData.reviewer_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=Athlete',
    reviewer_sport: reviewData.reviewer_sport || 'Football',
    performance_rating: Number(reviewData.performance_rating) || 5,
    behaviour_rating: Number(reviewData.behaviour_rating) || 5,
    badges: Array.isArray(reviewData.badges) ? reviewData.badges : [],
    comment: reviewData.comment || '',
    match_context: reviewData.match_context || 'Verified Match',
    helpful_count: 0,
    helpful_users: [],
    created_at: new Date().toISOString()
  };

  // Update local storage cache
  try {
    const cached = localStorage.getItem(cacheKey);
    const data = cached ? JSON.parse(cached) : { reviews: [] };
    data.reviews = [reviewToSave, ...(data.reviews || [])];
    data.totalReviews = data.reviews.length;
    
    let pSum = 0;
    let bSum = 0;
    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    const bCounts = {};
    data.reviews.forEach(r => {
      pSum += Number(r.performance_rating) || 5;
      bSum += Number(r.behaviour_rating) || 5;
      const p = Math.min(5, Math.max(1, Math.round(Number(r.performance_rating) || 5)));
      dist[p] = (dist[p] || 0) + 1;
      (r.badges || []).forEach(b => { bCounts[b] = (bCounts[b] || 0) + 1; });
    });
    data.avgPerformance = parseFloat((pSum / data.totalReviews).toFixed(1));
    data.avgBehaviour = parseFloat((bSum / data.totalReviews).toFixed(1));
    data.overallScore = parseFloat(((data.avgPerformance + data.avgBehaviour) / 2).toFixed(1));
    data.distribution = dist;
    data.badgeCounts = bCounts;
    localStorage.setItem(cacheKey, JSON.stringify(data));
  } catch {}

  return { success: true, review: reviewToSave };
}

export async function apiToggleReviewHelpful(reviewId, userId) {
  try {
    const res = await fetch(`${API_BASE}/api/reviews/${encodeURIComponent(reviewId)}/helpful`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId })
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return { success: true };
}

// ── HOSTED MATCHES API HELPERS ──────────────────────────────────────────
export async function apiFetchHostedMatches() {
  let serverMatches = [];
  try {
    const res = await fetch(`${API_BASE}/api/hosted-matches`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && Array.isArray(data.matches)) {
        serverMatches = data.matches;
      }
    }
  } catch {}

  let localMatches = [];
  try {
    const raw = localStorage.getItem('turfington_hosted_matches');
    if (raw) localMatches = JSON.parse(raw);
  } catch {}

  // Merge server and local matches (server takes precedence for matching IDs)
  const map = new Map();
  localMatches.forEach(m => map.set(m.id, m));
  serverMatches.forEach(m => map.set(m.id, m));
  const merged = Array.from(map.values());

  try {
    localStorage.setItem('turfington_hosted_matches', JSON.stringify(merged));
  } catch {}

  return merged;
}

export async function apiCreateHostedMatch(matchData) {
  let createdMatch = null;
  try {
    const res = await fetch(`${API_BASE}/api/hosted-matches`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(matchData)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        createdMatch = data.match;
      }
    }
  } catch {}

  if (!createdMatch) {
    const totalCap = Math.max(2, Number(matchData.capacity) || 10);
    const initialJoined = Math.min(totalCap - 1, Math.max(1, Number(matchData.existing_players_count) || 1));
    createdMatch = {
      id: 'match_host_' + Date.now(),
      turf_id: matchData.turf_id || 'v_default',
      venue: matchData.venue || 'Local Turf Arena',
      title: `${matchData.sport || 'Sports'} Match at ${matchData.venue || 'Turf Arena'}`,
      sport: matchData.sport || 'Football',
      time: matchData.time || 'Today, Flexible Slot',
      date: matchData.date || 'Today',
      slot_id: matchData.slot_id || '',
      capacity: totalCap,
      players_total: totalCap,
      players_joined: initialJoined,
      open_spots: totalCap - initialJoined,
      skill_level: matchData.skill_level || 'All Levels Welcome',
      price_per_player: Number(matchData.price_per_player) || (matchData.total_price ? Math.round(Number(matchData.total_price) / totalCap) : 150),
      price: `₹${Number(matchData.price_per_player) || (matchData.total_price ? Math.round(Number(matchData.total_price) / totalCap) : 150)}/player`,
      image: matchData.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=600',
      host_id: matchData.host_id || 'usr_host',
      host_name: matchData.host_name || 'Match Host',
      host_avatar: matchData.host_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(matchData.host_name || 'Host')}`,
      status: (totalCap - initialJoined) <= 0 ? 'full' : 'open_match',
      notes: matchData.notes || '',
      participants: [
        {
          user_id: matchData.host_id || 'usr_host',
          user_name: matchData.host_name || 'Match Host',
          user_avatar: matchData.host_avatar,
          role: 'host',
          joined_at: new Date().toISOString()
        }
      ],
      created_at: new Date().toISOString()
    };
  }

  try {
    const raw = localStorage.getItem('turfington_hosted_matches');
    const list = raw ? JSON.parse(raw) : [];
    const updated = [createdMatch, ...list.filter(m => m.id !== createdMatch.id)];
    localStorage.setItem('turfington_hosted_matches', JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('turfington_hosted_matches_updated', { detail: createdMatch }));
  } catch {}

  return { success: true, match: createdMatch };
}

export async function apiJoinHostedMatch(matchId, user) {
  let updatedMatch = null;
  const payload = {
    user_id: user?.id || user?.firebase_uid || 'usr_curr',
    user_name: user?.full_name || user?.name || 'Fellow Player',
    user_avatar: user?.avatar_url || user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user?.full_name || 'Player')}`
  };

  try {
    const res = await fetch(`${API_BASE}/api/hosted-matches/${encodeURIComponent(matchId)}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        updatedMatch = data.match;
      }
    }
  } catch {}

  try {
    const raw = localStorage.getItem('turfington_hosted_matches');
    let list = raw ? JSON.parse(raw) : [];
    list = list.map(m => {
      if (m.id === matchId) {
        if (!m.participants) m.participants = [];
        const exists = m.participants.some(p => p.user_id === payload.user_id);
        if (!exists) {
          m.participants.push({ ...payload, role: 'player', joined_at: new Date().toISOString() });
          m.players_joined = m.participants.length;
          m.open_spots = Math.max(0, m.players_total - m.players_joined);
          if (m.players_joined >= m.players_total) m.status = 'full';
        }
        if (!updatedMatch) updatedMatch = m;
      }
      return m;
    });
    localStorage.setItem('turfington_hosted_matches', JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('turfington_hosted_matches_updated', { detail: updatedMatch }));
  } catch {}

  return { success: true, match: updatedMatch };
}

export async function apiLeaveHostedMatch(matchId, userId) {
  try {
    await fetch(`${API_BASE}/api/hosted-matches/${encodeURIComponent(matchId)}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId })
    });
  } catch {}

  try {
    const raw = localStorage.getItem('turfington_hosted_matches');
    let list = raw ? JSON.parse(raw) : [];
    list = list.map(m => {
      if (m.id === matchId) {
        if (!m.participants) m.participants = [];
        m.participants = m.participants.filter(p => p.user_id !== userId);
        m.players_joined = Math.max(1, m.participants.length);
        m.open_spots = Math.max(0, m.players_total - m.players_joined);
        m.status = 'open_match';
      }
      return m;
    });
    localStorage.setItem('turfington_hosted_matches', JSON.stringify(list));
    window.dispatchEvent(new CustomEvent('turfington_hosted_matches_updated'));
  } catch {}

  return { success: true };
}


// ============================================================================
// POST COMMENTS & REPLIES SERVICES
// ============================================================================

export const DEFAULT_POST_COMMENTS = {
  post_501: [
    {
      id: 'comm_501_1',
      postId: 'post_501',
      author: 'Karthik Raja',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100',
      content: 'Incredible batting display! What was the final score in the last over?',
      time: '3 hours ago',
      createdAt: new Date(Date.now() - 3600 * 3000).toISOString(),
      likes: 4,
      liked_by: [],
      replies: [
        {
          id: 'comm_501_1_r1',
          postId: 'post_501',
          author: 'Tamil Nadu Box Cricket Club',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
          content: 'We needed 14 off the last over and finished it with 2 balls to spare!',
          time: '2 hours ago',
          createdAt: new Date(Date.now() - 3600 * 2000).toISOString(),
          likes: 3,
          liked_by: [],
          parentId: 'comm_501_1',
          replyToAuthor: 'Karthik Raja'
        }
      ]
    },
    {
      id: 'comm_501_2',
      postId: 'post_501',
      author: 'Suresh Kumar',
      avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100',
      content: 'Are you guys organizing another championship next month?',
      time: '1 hour ago',
      createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      likes: 1,
      liked_by: [],
      replies: []
    }
  ],
  post_502: [
    {
      id: 'comm_502_1',
      postId: 'post_502',
      author: 'Rohan Sharma',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100',
      content: 'Is the floodlit football slot open for this Saturday night after 10 PM?',
      time: '2 hours ago',
      createdAt: new Date(Date.now() - 3600 * 2000).toISOString(),
      likes: 2,
      liked_by: [],
      replies: [
        {
          id: 'comm_502_1_r1',
          postId: 'post_502',
          author: 'Vanguard Sports Arena',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100',
          content: 'Yes Rohan! 10-11 PM slot is available. You can book directly in Venues tab with the flat 15% discount!',
          time: '1 hour ago',
          createdAt: new Date(Date.now() - 3600 * 1000).toISOString(),
          likes: 2,
          liked_by: [],
          parentId: 'comm_502_1',
          replyToAuthor: 'Rohan Sharma'
        }
      ]
    }
  ]
};

export async function apiFetchPostComments(postId) {
  if (!postId) return [];
  try {
    const key = `turfington_post_comments_${postId}`;
    const raw = localStorage.getItem(key);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch (e) {}

  if (DEFAULT_POST_COMMENTS[postId]) {
    try {
      localStorage.setItem(`turfington_post_comments_${postId}`, JSON.stringify(DEFAULT_POST_COMMENTS[postId]));
    } catch (e) {}
    return DEFAULT_POST_COMMENTS[postId];
  }
  return [];
}

export async function apiAddPostComment(postId, commentData) {
  if (!postId || !commentData || !commentData.content?.trim()) {
    return { success: false, error: 'Content required' };
  }

  const nowIso = new Date().toISOString();
  const commentId = `comm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  
  const newComment = {
    id: commentId,
    postId,
    author: commentData.author || 'Athlete',
    authorId: commentData.authorId || commentData.userId || 'usr_anonymous',
    avatar: commentData.avatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(commentData.author || 'User')}`,
    content: commentData.content.trim(),
    time: 'Just now',
    createdAt: nowIso,
    likes: 0,
    liked_by: [],
    parentId: commentData.parentId || null,
    replyToAuthor: commentData.replyToAuthor || null,
    replies: []
  };

  const key = `turfington_post_comments_${postId}`;
  const existing = await apiFetchPostComments(postId);

  let updatedList = [];
  if (newComment.parentId) {
    let added = false;
    updatedList = existing.map(c => {
      if (c.id === newComment.parentId) {
        added = true;
        return {
          ...c,
          replies: [...(c.replies || []), newComment]
        };
      }
      return c;
    });
    if (!added) {
      // If parentId is a nested reply, attach to that root comment thread
      updatedList = existing.map(c => {
        if (c.replies && c.replies.some(r => r.id === newComment.parentId)) {
          added = true;
          return {
            ...c,
            replies: [...(c.replies || []), newComment]
          };
        }
        return c;
      });
    }
    if (!added) {
      updatedList = [...existing, newComment];
    }
  } else {
    updatedList = [...existing, newComment];
  }

  const totalCount = updatedList.reduce((acc, c) => acc + 1 + (c.replies ? c.replies.length : 0), 0);

  try {
    localStorage.setItem(key, JSON.stringify(updatedList));
  } catch (e) {}

  try {
    const postsRaw = localStorage.getItem('turfington_feed_posts');
    if (postsRaw) {
      const posts = JSON.parse(postsRaw);
      const updatedPosts = posts.map(p => {
        if (String(p.id) === String(postId)) {
          return {
            ...p,
            comments: totalCount,
            commentsCount: totalCount
          };
        }
        return p;
      });
      localStorage.setItem('turfington_feed_posts', JSON.stringify(updatedPosts));
    }
  } catch (e) {}

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_post_comment_added', {
      detail: { postId, comment: newComment, totalCount }
    }));
  }

  try {
    addDoc(collection(db, 'posts', postId, 'comments'), {
      ...newComment,
      createdAt: serverTimestamp()
    }).catch(() => {});
  } catch (e) {}

  return { success: true, comment: newComment, totalCount, comments: updatedList };
}

export async function apiLikePostComment(postId, commentId, userId) {
  if (!postId || !commentId) return { success: false };
  const existing = await apiFetchPostComments(postId);
  
  const toggleLike = (item) => {
    const likedBy = item.liked_by || [];
    const isLiked = likedBy.includes(userId);
    const newLikedBy = isLiked ? likedBy.filter(u => u !== userId) : [...likedBy, userId];
    const newLikes = isLiked ? Math.max(0, (item.likes || 1) - 1) : (item.likes || 0) + 1;
    return { ...item, liked_by: newLikedBy, likes: newLikes };
  };

  const updatedList = existing.map(c => {
    if (c.id === commentId) {
      return toggleLike(c);
    }
    if (c.replies && c.replies.length > 0) {
      return {
        ...c,
        replies: c.replies.map(r => r.id === commentId ? toggleLike(r) : r)
      };
    }
    return c;
  });

  try {
    localStorage.setItem(`turfington_post_comments_${postId}`, JSON.stringify(updatedList));
  } catch (e) {}

  return { success: true, comments: updatedList };
}


// ── TOURNAMENTS API ─────────────────────────────────────────────────────────

export function purgeLegacyTestTournaments() {
  if (typeof window === 'undefined') return;
  try {
    const testTitles = [
      'vanguard weekend football gold cup',
      'championship table tennis open',
      'smash club badminton pro series',
      'hyperbowl league night championship',
      'vanguard summer football cup',
      'weekend football gold cup'
    ];
    const testIds = [1, 2, 3, 4, 101, 301, 302, '1', '2', '3', '4', '101', '301', '302'];

    const sRegs = localStorage.getItem('turfington_registered_tournaments');
    if (sRegs) {
      const pRegs = JSON.parse(sRegs);
      if (Array.isArray(pRegs)) {
        const filtered = pRegs.filter(id => !testIds.includes(id));
        localStorage.setItem('turfington_registered_tournaments', JSON.stringify(filtered));
      }
    }

    const sTournaments = localStorage.getItem('turfington_tournaments');
    if (sTournaments) {
      const pTournaments = JSON.parse(sTournaments);
      if (Array.isArray(pTournaments)) {
        const filtered = pTournaments.filter(t => {
          if (!t) return false;
          if (testIds.includes(t.id)) return false;
          const title = String(t.title || '').trim().toLowerCase();
          if (testTitles.includes(title)) return false;
          const creatorId = t.creator_id || t.creatorUid || t.userId || t.owner_id;
          if (!creatorId) return false;
          return true;
        });
        localStorage.setItem('turfington_tournaments', JSON.stringify(filtered));
      }
    }
  } catch (e) {}
}

export async function apiFetchTournaments() {
  purgeLegacyTestTournaments();

  const testTitles = [
    'vanguard weekend football gold cup',
    'championship table tennis open',
    'smash club badminton pro series',
    'hyperbowl league night championship',
    'vanguard summer football cup',
    'weekend football gold cup'
  ];
  const testIds = [1, 2, 3, 4, 101, 301, 302, '1', '2', '3', '4', '101', '301', '302'];

  let list = [];
  try {
    const snap = await getDocs(collection(db, 'tournaments'));
    if (!snap.empty) {
      snap.forEach(d => {
        const data = d.data();
        const id = d.id;
        if (testIds.includes(id)) return;
        const titleLower = String(data.title || '').toLowerCase().trim();
        if (testTitles.includes(titleLower)) return;
        const creatorId = data.creator_id || data.creatorUid || data.userId || data.owner_id;
        // Strictly only show tournaments created by authenticated users
        if (creatorId && creatorId !== 'usr_guest') {
          list.push({ id, ...data });
        }
      });
    }
  } catch (err) {
    console.warn('apiFetchTournaments Firestore notice:', err);
  }

  // Merge with locally created tournaments
  if (typeof window !== 'undefined') {
    try {
      const s = localStorage.getItem('turfington_tournaments');
      if (s) {
        const localList = JSON.parse(s);
        if (Array.isArray(localList)) {
          localList.forEach(t => {
            if (!t || testIds.includes(t.id)) return;
            const titleLower = String(t.title || '').toLowerCase().trim();
            if (testTitles.includes(titleLower)) return;
            const creatorId = t.creator_id || t.creatorUid || t.userId || t.owner_id;
            if (creatorId && creatorId !== 'usr_guest' && !list.some(x => x.id === t.id)) {
              list.push(t);
            }
          });
        }
      }
    } catch (e) {}
  }

  // Sort by created date descending
  list.sort((a, b) => {
    const timeA = new Date(a.createdAt || a.created_at || 0).getTime();
    const timeB = new Date(b.createdAt || b.created_at || 0).getTime();
    return timeB - timeA;
  });

  return list;
}

export async function apiCreateTournament(tournamentData, user) {
  const creatorId = user?.uid || user?.firebase_uid || user?.id;
  if (!creatorId || creatorId === 'usr_guest') {
    throw new Error('You must be signed in with an authenticated account to create a tournament.');
  }

  const tournamentId = 'trn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  const nowIso = new Date().toISOString();

  const newTournament = {
    id: tournamentId,
    title: tournamentData.title?.trim() || 'Untitled Tournament',
    sport: tournamentData.sport || 'Football',
    image: tournamentData.banner || tournamentData.image || tournamentData.pfp || '',
    banner: tournamentData.banner || tournamentData.image || '',
    pfp: tournamentData.pfp || tournamentData.banner || tournamentData.image || '',
    prizePool: tournamentData.prizePool ? (String(tournamentData.prizePool).startsWith('₹') ? tournamentData.prizePool : `₹${tournamentData.prizePool}`) : '₹0',
    prizeRaw: parseInt(String(tournamentData.prizePool || 0).replace(/\D/g, ''), 10) || 0,
    entryFee: tournamentData.entryFee ? (String(tournamentData.entryFee).startsWith('₹') ? tournamentData.entryFee : `₹${tournamentData.entryFee}`) : '₹0',
    entryFeeRaw: parseInt(String(tournamentData.entryFee || 0).replace(/\D/g, ''), 10) || 0,
    date: tournamentData.date || (tournamentData.startDate ? `${tournamentData.startDate}${tournamentData.endDate ? ' – ' + tournamentData.endDate : ''}` : 'Upcoming'),
    startDate: tournamentData.startDate || '',
    endDate: tournamentData.endDate || '',
    registrationDeadline: tournamentData.registrationDeadline || '',
    venue: tournamentData.venue?.trim() || 'Sports Arena',
    city: tournamentData.city?.trim() || 'City Arena',
    slots: parseInt(tournamentData.slots, 10) || 16,
    filled: 0,
    status: 'Open',
    format: tournamentData.format || 'Knockout',
    level: tournamentData.level || 'All Levels',
    teamSize: tournamentData.teamSize || '1',
    organizer: tournamentData.organizer || user?.full_name || user?.name || user?.displayName || 'Tournament Host',
    creator_id: creatorId,
    creatorUid: creatorId,
    creator_uid: user?.uid || user?.firebase_uid || creatorId,
    creator_email: user?.email || '',
    creator_name: user?.full_name || user?.name || user?.displayName || 'Tournament Host',
    creator_role: user?.role || 'owner',
    owner_id: creatorId,
    user_id: creatorId,
    contactPhone: tournamentData.contactPhone || user?.phone || '',
    contactEmail: tournamentData.contactEmail || user?.email || '',
    rules: tournamentData.rules || '',
    description: tournamentData.description || '',
    registrations: [],
    registered: false,
    createdAt: nowIso,
    created_at: nowIso
  };

  // 1. Write to Firestore
  try {
    await setDoc(doc(db, 'tournaments', tournamentId), newTournament);
  } catch (err) {
    console.warn('apiCreateTournament Firestore write warning:', err);
  }

  // 2. Cache in localStorage
  if (typeof window !== 'undefined') {
    try {
      const s = localStorage.getItem('turfington_tournaments');
      const existing = s ? JSON.parse(s) : [];
      const updated = [newTournament, ...existing.filter(t => t.id !== tournamentId)];
      localStorage.setItem('turfington_tournaments', JSON.stringify(updated));
    } catch (e) {}

    try {
      window.dispatchEvent(new CustomEvent('turfington_tournament_created', { detail: newTournament }));
    } catch (e) {}
  }

  return newTournament;
}

export async function apiRegisterTournament(tournamentId, user, registrationData = {}) {
  const currentUid = user?.uid || user?.id || user?.firebase_uid;
  if (!currentUid) throw new Error('Authentication required to register for tournament');

  const passId = `TRN-${Math.floor(100000 + Math.random() * 900000)}`;
  const nowIso = new Date().toISOString();

  const regEntry = {
    passId,
    name: registrationData.captainName || user?.full_name || user?.name || 'Athlete',
    team: registrationData.teamName || 'Solo Competitor',
    uid: currentUid,
    userId: currentUid,
    paid: true,
    amount: registrationData.totalAmount || 0,
    registeredAt: nowIso
  };

  // 1. Update Firestore
  try {
    const trnRef = doc(db, 'tournaments', tournamentId);
    await updateDoc(trnRef, {
      filled: increment(1),
      registrations: arrayUnion(regEntry)
    });
  } catch (err) {
    console.warn('apiRegisterTournament Firestore update warning:', err);
  }

  // 2. Update localStorage tournaments
  if (typeof window !== 'undefined') {
    try {
      const sRegs = localStorage.getItem('turfington_registered_tournaments');
      const regs = sRegs ? JSON.parse(sRegs) : [];
      if (!regs.includes(tournamentId)) {
        regs.push(tournamentId);
        localStorage.setItem('turfington_registered_tournaments', JSON.stringify(regs));
      }

      const sTournaments = localStorage.getItem('turfington_tournaments');
      if (sTournaments) {
        const list = JSON.parse(sTournaments);
        const updated = list.map(t => {
          if (t.id === tournamentId) {
            const currentRegs = Array.isArray(t.registrations) ? t.registrations : [];
            return {
              ...t,
              filled: (t.filled || 0) + 1,
              registrations: [...currentRegs, regEntry],
              registered: true
            };
          }
          return t;
        });
        localStorage.setItem('turfington_tournaments', JSON.stringify(updated));
      }
    } catch (e) {}

    // 3. Create user booking pass in user bookings
    try {
      const uKey = `turfington_user_bookings_${currentUid}`;
      const sUserBookings = localStorage.getItem(uKey);
      const userBookings = sUserBookings ? JSON.parse(sUserBookings) : [];
      const tournamentBooking = {
        id: passId,
        booking_id: passId,
        type: 'tournament',
        title: registrationData.tournamentTitle || 'Tournament Entry',
        venue: registrationData.venue || 'Sports Arena',
        venue_name: registrationData.venue || 'Sports Arena',
        date: registrationData.date || 'Upcoming',
        time: registrationData.time || '09:00 AM',
        slot_time: registrationData.time || '09:00 AM',
        sport: registrationData.sport || 'Sports Activity',
        teamName: registrationData.teamName || 'Solo',
        captainName: registrationData.captainName || user?.full_name || user?.name || 'Athlete',
        price: registrationData.totalAmount || 0,
        amount: registrationData.totalAmount || 0,
        amount_paid: registrationData.totalAmount || 0,
        status: 'confirmed',
        is_prepaid: true,
        user_id: currentUid,
        createdAt: nowIso
      };
      userBookings.unshift(tournamentBooking);
      localStorage.setItem(uKey, JSON.stringify(userBookings));

      // Also append to global user bookings
      const sAll = localStorage.getItem('turfington_user_bookings');
      if (sAll) {
        const all = JSON.parse(sAll);
        localStorage.setItem('turfington_user_bookings', JSON.stringify([tournamentBooking, ...all.filter(b => b.id !== passId)]));
      }
    } catch (e) {}

    try {
      window.dispatchEvent(new CustomEvent('turfington_tournament_updated', {
        detail: { tournamentId, registration: regEntry }
      }));
      window.dispatchEvent(new CustomEvent('turfington_booking_created', { detail: { id: passId } }));
    } catch (e) {}
  }

  return { success: true, passId, regEntry };
}

export async function apiDeleteTournament(tournamentId, userId) {
  if (!tournamentId) return { success: false };

  try {
    await deleteDoc(doc(db, 'tournaments', tournamentId));
  } catch (err) {
    console.warn('apiDeleteTournament Firestore delete warning:', err);
  }

  if (typeof window !== 'undefined') {
    try {
      const s = localStorage.getItem('turfington_tournaments');
      if (s) {
        const list = JSON.parse(s);
        const filtered = list.filter(t => t.id !== tournamentId);
        localStorage.setItem('turfington_tournaments', JSON.stringify(filtered));
      }
      window.dispatchEvent(new CustomEvent('turfington_tournament_deleted', { detail: { tournamentId } }));
    } catch (e) {}
  }

  return { success: true };
}
