import { db } from './firebase';
import { collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, serverTimestamp } from 'firebase/firestore';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD ? '' : 'http://localhost:5000');

const ALL_FOLLOWS_STORAGE_KEY = 'turfington_all_follows';

/**
 * Universal helper to extract all known aliases and profile info for a user
 */
export function extractUserIdentifiers(u) {
  if (!u) {
    return { id: '', uid: '', email: '', name: '', avatar: '', handle: '', role: '', allKeys: [] };
  }

  if (typeof u === 'string') {
    const s = u.trim();
    // Try to resolve string identifier from known local accounts
    const known = findKnownAccount(s);
    if (known) return extractUserIdentifiers(known);

    const isEmail = s.includes('@') && s.includes('.');
    return {
      id: s,
      uid: s,
      email: isEmail ? s.toLowerCase() : '',
      name: isEmail ? s.split('@')[0] : 'Athlete',
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${s}`,
      handle: s.startsWith('@') ? s : `@athlete_${s.slice(-4)}`,
      role: 'player',
      allKeys: [s.toLowerCase()]
    };
  }

  const id = String(u.id || u.uid || u.firebase_uid || '').trim();
  const uid = String(u.firebase_uid || u.uid || u.id || '').trim();
  const email = String(u.email || '').toLowerCase().trim();
  const name = String(u.full_name || u.name || u.displayName || (email ? email.split('@')[0] : 'Athlete')).trim();
  const avatar = u.avatar || u.avatar_url || u.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${id || uid || email || 'athlete'}`;
  const handle = u.player_id || u.handle || (u.username ? (u.username.startsWith('@') ? u.username : `@${u.username}`) : (id ? `@athlete_${id.slice(-4)}` : '@athlete'));
  const role = u.role || 'player';

  const rawKeys = [id, uid, email, handle.replace('@', '')].filter(Boolean);
  const allKeys = Array.from(new Set(rawKeys.map(k => String(k).toLowerCase().trim())));

  return { id, uid, email, name, avatar, handle, role, allKeys };
}

/**
 * Helper to find a known account from localStorage multi-account pools
 */
function findKnownAccount(searchKey) {
  if (!searchKey || typeof window === 'undefined') return null;
  const k = String(searchKey).toLowerCase().trim();
  try {
    // 1. Check turfington_accounts
    const rawAcc = localStorage.getItem('turfington_accounts');
    if (rawAcc) {
      const parsed = JSON.parse(rawAcc);
      const values = Array.isArray(parsed) ? parsed : Object.values(parsed);
      for (const acc of values) {
        if (!acc) continue;
        const aid = String(acc.id || acc.uid || acc.firebase_uid || '').toLowerCase().trim();
        const aEmail = String(acc.email || '').toLowerCase().trim();
        const aHandle = String(acc.player_id || acc.handle || acc.username || '').toLowerCase().replace('@', '').trim();
        if (aid === k || aEmail === k || aHandle === k) return acc;
      }
    }

    // 2. Check active user
    const rawActive = localStorage.getItem('turfington_active_user');
    if (rawActive) {
      const act = JSON.parse(rawActive);
      const aid = String(act.id || act.uid || act.firebase_uid || '').toLowerCase().trim();
      const aEmail = String(act.email || '').toLowerCase().trim();
      if (aid === k || aEmail === k) return act;
    }
  } catch {}
  return null;
}

/**
 * Returns all stored follows from localStorage
 */
export function getAllStoredFollows() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(ALL_FOLLOWS_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

/**
 * Persists all stored follows into localStorage and updates legacy alias keys
 */
export function saveAllStoredFollows(follows) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ALL_FOLLOWS_STORAGE_KEY, JSON.stringify(follows));
  } catch {}
}

/**
 * Returns list of user IDs that `userId` is following
 */
export function getLocalFollowing(userId) {
  if (!userId) return [];
  const me = extractUserIdentifiers(userId);
  const allFollows = getAllStoredFollows();

  const followingIds = new Set();
  allFollows.forEach(f => {
    const followerKeys = f.followerKeys || [f.followerId, f.followerUid, f.followerEmail, f.follower_id, f.follower_uid, f.follower_email].filter(Boolean).map(s => String(s).toLowerCase().trim());
    if (me.allKeys.some(k => followerKeys.includes(k))) {
      const targetId = f.followingId || f.following_id || f.followingUid || f.following_uid;
      if (targetId) followingIds.add(targetId);
    }
  });

  // Merge with legacy keys for backwards safety
  me.allKeys.forEach(k => {
    try {
      const raw = localStorage.getItem(`turfington_following_${k}`);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) arr.forEach(id => followingIds.add(id));
      }
    } catch {}
  });

  return Array.from(followingIds);
}

/**
 * Returns list of user IDs following `userId`
 */
export function getLocalFollowers(userId) {
  if (!userId) return [];
  const me = extractUserIdentifiers(userId);
  const allFollows = getAllStoredFollows();

  const followerIds = new Set();
  allFollows.forEach(f => {
    const followingKeys = f.followingKeys || [f.followingId, f.followingUid, f.followingEmail, f.following_id, f.following_uid, f.following_email].filter(Boolean).map(s => String(s).toLowerCase().trim());
    if (me.allKeys.some(k => followingKeys.includes(k))) {
      const sourceId = f.followerId || f.follower_id || f.followerUid || f.follower_uid;
      if (sourceId) followerIds.add(sourceId);
    }
  });

  // Merge with legacy keys
  me.allKeys.forEach(k => {
    try {
      const raw = localStorage.getItem(`turfington_followers_${k}`);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) arr.forEach(id => followerIds.add(id));
      }
    } catch {}
  });

  return Array.from(followerIds);
}

/**
 * Checks if current user is following target user
 */
export function isUserFollowing(currentUserInput, targetUserInput) {
  if (!currentUserInput || !targetUserInput) return false;
  const me = extractUserIdentifiers(currentUserInput);
  const target = extractUserIdentifiers(targetUserInput);

  const allFollows = getAllStoredFollows();
  return allFollows.some(f => {
    const followerKeys = f.followerKeys || [f.followerId, f.followerUid, f.followerEmail, f.follower_id, f.follower_uid, f.follower_email].filter(Boolean).map(s => String(s).toLowerCase().trim());
    const followingKeys = f.followingKeys || [f.followingId, f.followingUid, f.followingEmail, f.following_id, f.following_uid, f.following_email].filter(Boolean).map(s => String(s).toLowerCase().trim());
    return me.allKeys.some(k => followerKeys.includes(k)) && target.allKeys.some(k => followingKeys.includes(k));
  });
}

/**
 * Toggles follow / unfollow between current user and target user
 */
export async function toggleFollowUser(currentUserInput, targetUserInput) {
  if (!currentUserInput || !targetUserInput) return false;

  const follower = extractUserIdentifiers(currentUserInput);
  const following = extractUserIdentifiers(targetUserInput);

  if (!follower.id || !following.id) return false;
  // Cannot follow oneself
  if (follower.allKeys.some(k => following.allKeys.includes(k))) return false;

  let allFollows = getAllStoredFollows();

  // Check if relation already exists
  const existingIdx = allFollows.findIndex(f => {
    const fKeys = f.followerKeys || [f.followerId, f.followerUid, f.followerEmail, f.follower_id, f.follower_uid, f.follower_email].filter(Boolean).map(s => String(s).toLowerCase().trim());
    const targetKeys = f.followingKeys || [f.followingId, f.followingUid, f.followingEmail, f.following_id, f.following_uid, f.following_email].filter(Boolean).map(s => String(s).toLowerCase().trim());
    return follower.allKeys.some(k => fKeys.includes(k)) && following.allKeys.some(k => targetKeys.includes(k));
  });

  let newStatus;
  const docId = `${follower.id || follower.uid}_${following.id || following.uid}`;

  if (existingIdx >= 0) {
    // ── UNFOLLOW ──
    allFollows.splice(existingIdx, 1);
    newStatus = false;

    // Delete from Firestore
    try {
      deleteDoc(doc(db, 'follows', docId)).catch(() => {});
    } catch {}

    // Delete from API backend
    try {
      fetch(`${API_BASE}/api/users/${encodeURIComponent(following.id || following.uid)}/unfollow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ followerId: follower.id || follower.uid })
      }).catch(() => {});
    } catch {}
  } else {
    // ── FOLLOW ──
    newStatus = true;
    const newRecord = {
      id: docId,
      docId,
      followerId: follower.id || follower.uid,
      followerUid: follower.uid,
      followerEmail: follower.email,
      followerName: follower.name,
      followerAvatar: follower.avatar,
      followerHandle: follower.handle,
      followerRole: follower.role,
      followerKeys: follower.allKeys,

      followingId: following.id || following.uid,
      followingUid: following.uid,
      followingEmail: following.email,
      followingName: following.name,
      followingAvatar: following.avatar,
      followingHandle: following.handle,
      followingRole: following.role,
      followingKeys: following.allKeys,

      createdAt: new Date().toISOString()
    };
    allFollows.unshift(newRecord);

    // Persist to Firestore with full user profile payload
    try {
      setDoc(doc(db, 'follows', docId), {
        follower_id: follower.id || follower.uid,
        follower_uid: follower.uid,
        follower_email: follower.email,
        follower_name: follower.name,
        follower_avatar: follower.avatar,
        follower_handle: follower.handle,
        follower_role: follower.role,
        follower_keys: follower.allKeys,

        following_id: following.id || following.uid,
        following_uid: following.uid,
        following_email: following.email,
        following_name: following.name,
        following_avatar: following.avatar,
        following_handle: following.handle,
        following_role: following.role,
        following_keys: following.allKeys,

        createdAt: serverTimestamp()
      }).catch(console.warn);
    } catch (e) {
      console.warn('Firestore setDoc follows notice:', e);
    }

    // Persist to API backend
    try {
      fetch(`${API_BASE}/api/users/${encodeURIComponent(following.id || following.uid)}/follow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followerId: follower.id || follower.uid,
          followerData: follower,
          followingData: following
        })
      }).catch(() => {});
    } catch {}
  }

  // 1. Save updated master follows list
  saveAllStoredFollows(allFollows);

  // 2. Synchronize legacy per-user localStorage keys for all alias variations
  try {
    const updatedFollowingList = getLocalFollowing(follower.id);
    follower.allKeys.forEach(k => {
      localStorage.setItem(`turfington_following_${k}`, JSON.stringify(updatedFollowingList));
      localStorage.setItem(`turfington_friends_${k}`, JSON.stringify(updatedFollowingList));
    });

    const updatedFollowersList = getLocalFollowers(following.id);
    following.allKeys.forEach(k => {
      localStorage.setItem(`turfington_followers_${k}`, JSON.stringify(updatedFollowersList));
    });
  } catch {}

  // 3. Broadcast real-time change event
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_follow_change', {
      detail: {
        followerId: follower.id,
        follower,
        targetUserId: following.id,
        following,
        isFollowing: newStatus,
        followingCount: getLocalFollowing(follower.id).length,
        followersCount: getLocalFollowers(following.id).length
      }
    }));
  }

  return newStatus;
}

/**
 * Returns the list of followers (with full user profile data) for `userInput`
 */
export async function getFollowersList(userInput) {
  if (!userInput) return [];
  const me = extractUserIdentifiers(userInput);

  // 1. Fetch live snapshot from Firestore follows collection
  try {
    const snap = await getDocs(collection(db, 'follows'));
    if (!snap.empty) {
      let allFollows = getAllStoredFollows();
      const map = new Map(allFollows.map(f => [f.id || f.docId, f]));

      snap.docs.forEach(d => {
        const data = d.data();
        const fKey = d.id;
        map.set(fKey, {
          id: fKey,
          docId: fKey,
          followerId: data.follower_id || data.followerId,
          followerUid: data.follower_uid || data.followerUid,
          followerEmail: data.follower_email || data.followerEmail,
          followerName: data.follower_name || data.followerName,
          followerAvatar: data.follower_avatar || data.followerAvatar,
          followerHandle: data.follower_handle || data.followerHandle,
          followerRole: data.follower_role || data.followerRole,
          followerKeys: data.follower_keys || [data.follower_id, data.follower_uid, data.follower_email].filter(Boolean),

          followingId: data.following_id || data.followingId,
          followingUid: data.following_uid || data.followingUid,
          followingEmail: data.following_email || data.followingEmail,
          followingName: data.following_name || data.followingName,
          followingAvatar: data.following_avatar || data.followingAvatar,
          followingHandle: data.following_handle || data.followingHandle,
          followingRole: data.following_role || data.followingRole,
          followingKeys: data.following_keys || [data.following_id, data.following_uid, data.following_email].filter(Boolean),

          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.created_at || new Date().toISOString())
        });
      });

      allFollows = Array.from(map.values());
      saveAllStoredFollows(allFollows);
    }
  } catch (err) {
    console.warn('Sync follows from Firestore notice:', err);
  }

  // 2. Filter records where 'me' is being followed
  const allFollows = getAllStoredFollows();
  const followers = [];
  const seenFollowerKeys = new Set();

  allFollows.forEach(f => {
    const targetKeys = f.followingKeys || [f.followingId, f.followingUid, f.followingEmail, f.following_id, f.following_uid, f.following_email].filter(Boolean).map(s => String(s).toLowerCase().trim());
    if (me.allKeys.some(k => targetKeys.includes(k))) {
      const fId = f.followerId || f.follower_id || f.followerUid || f.follower_uid;
      const fEmail = f.followerEmail || f.follower_email || '';
      const dedupeKey = (fId || fEmail || f.followerName).toLowerCase();
      if (seenFollowerKeys.has(dedupeKey)) return;
      seenFollowerKeys.add(dedupeKey);

      followers.push({
        id: fId,
        uid: f.followerUid || f.follower_uid || fId,
        email: fEmail,
        name: f.followerName || f.follower_name || 'Sports Athlete',
        full_name: f.followerName || f.follower_name || 'Sports Athlete',
        avatar: f.followerAvatar || f.follower_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${fId}`,
        avatar_url: f.followerAvatar || f.follower_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${fId}`,
        player_id: f.followerHandle || f.follower_handle || (fId ? `@athlete_${String(fId).slice(-4)}` : '@athlete'),
        handle: f.followerHandle || f.follower_handle || (fId ? `@athlete_${String(fId).slice(-4)}` : '@athlete'),
        role: f.followerRole || f.follower_role || 'player',
        created_at: f.createdAt
      });
    }
  });

  return followers;
}

/**
 * Returns the list of users (with full user profile data) that `userInput` is following
 */
export async function getFollowingList(userInput) {
  if (!userInput) return [];
  const me = extractUserIdentifiers(userInput);

  const allFollows = getAllStoredFollows();
  const following = [];
  const seenKeys = new Set();

  allFollows.forEach(f => {
    const followerKeys = f.followerKeys || [f.followerId, f.followerUid, f.followerEmail, f.follower_id, f.follower_uid, f.follower_email].filter(Boolean).map(s => String(s).toLowerCase().trim());
    if (me.allKeys.some(k => followerKeys.includes(k))) {
      const targetId = f.followingId || f.following_id || f.followingUid || f.following_uid;
      const targetEmail = f.followingEmail || f.following_email || '';
      const dedupeKey = (targetId || targetEmail || f.followingName).toLowerCase();
      if (seenKeys.has(dedupeKey)) return;
      seenKeys.add(dedupeKey);

      following.push({
        id: targetId,
        uid: f.followingUid || f.following_uid || targetId,
        email: targetEmail,
        name: f.followingName || f.following_name || 'Sports Athlete',
        full_name: f.followingName || f.following_name || 'Sports Athlete',
        avatar: f.followingAvatar || f.following_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetId}`,
        avatar_url: f.followingAvatar || f.following_avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetId}`,
        player_id: f.followingHandle || f.following_handle || (targetId ? `@athlete_${String(targetId).slice(-4)}` : '@athlete'),
        handle: f.followingHandle || f.following_handle || (targetId ? `@athlete_${String(targetId).slice(-4)}` : '@athlete'),
        role: f.followingRole || f.following_role || 'player',
        created_at: f.createdAt
      });
    }
  });

  return following;
}

/**
 * Gets real-time follow counts for a user
 */
export async function getFollowCounts(userInput) {
  if (!userInput) return { followersCount: 0, followingCount: 0 };
  const me = extractUserIdentifiers(userInput);

  let followersCount = getLocalFollowers(me.id).length;
  let followingCount = getLocalFollowing(me.id).length;

  try {
    // 1. Sync from Firestore
    const snap = await getDocs(collection(db, 'follows'));
    if (!snap.empty) {
      let fsFollowers = 0;
      let fsFollowing = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        const fKeys = (data.follower_keys || [data.follower_id, data.follower_uid, data.follower_email]).filter(Boolean).map(s => String(s).toLowerCase().trim());
        const tKeys = (data.following_keys || [data.following_id, data.following_uid, data.following_email]).filter(Boolean).map(s => String(s).toLowerCase().trim());
        if (me.allKeys.some(k => tKeys.includes(k))) fsFollowers++;
        if (me.allKeys.some(k => fKeys.includes(k))) fsFollowing++;
      });
      followersCount = Math.max(followersCount, fsFollowers);
      followingCount = Math.max(followingCount, fsFollowing);
    }
  } catch {}

  // 2. Query Backend API
  try {
    const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(me.id || me.uid)}/follow-counts`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        followersCount = Math.max(followersCount, data.followersCount || 0);
        followingCount = Math.max(followingCount, data.followingCount || 0);
      }
    }
  } catch {}

  return { followersCount, followingCount };
}

/**
 * Real-time listener for Firestore follows collection
 */
export function subscribeToFollows(callback) {
  try {
    return onSnapshot(collection(db, 'follows'), (snap) => {
      let allFollows = getAllStoredFollows();
      const map = new Map(allFollows.map(f => [f.id || f.docId, f]));

      snap.docs.forEach(d => {
        const data = d.data();
        const fKey = d.id;
        map.set(fKey, {
          id: fKey,
          docId: fKey,
          followerId: data.follower_id || data.followerId,
          followerUid: data.follower_uid || data.followerUid,
          followerEmail: data.follower_email || data.followerEmail,
          followerName: data.follower_name || data.followerName,
          followerAvatar: data.follower_avatar || data.followerAvatar,
          followerHandle: data.follower_handle || data.followerHandle,
          followerRole: data.follower_role || data.followerRole,
          followerKeys: data.follower_keys || [data.follower_id, data.follower_uid, data.follower_email].filter(Boolean),

          followingId: data.following_id || data.followingId,
          followingUid: data.following_uid || data.followingUid,
          followingEmail: data.following_email || data.followingEmail,
          followingName: data.following_name || data.followingName,
          followingAvatar: data.following_avatar || data.followingAvatar,
          followingHandle: data.following_handle || data.followingHandle,
          followingRole: data.following_role || data.followingRole,
          followingKeys: data.following_keys || [data.following_id, data.following_uid, data.following_email].filter(Boolean),

          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : (data.created_at || new Date().toISOString())
        });
      });

      allFollows = Array.from(map.values());
      saveAllStoredFollows(allFollows);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('turfington_follow_change'));
      }

      if (typeof callback === 'function') {
        callback(allFollows);
      }
    }, (err) => {
      console.warn('Follows snapshot error:', err);
    });
  } catch (err) {
    return () => {};
  }
}
