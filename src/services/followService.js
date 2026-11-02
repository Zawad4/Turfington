import { db } from './firebase';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD ? '' : 'http://localhost:5000');

/**
 * Returns list of user IDs that `userId` is following
 */
export function getLocalFollowing(userId) {
  if (!userId) return [];
  try {
    const rawFollowing = localStorage.getItem(`turfington_following_${userId}`);
    if (rawFollowing) return JSON.parse(rawFollowing);
    // Legacy fallback check
    const rawFriends = localStorage.getItem(`turfington_friends_${userId}`);
    if (rawFriends) return JSON.parse(rawFriends);
  } catch {}
  return [];
}

/**
 * Returns list of user IDs following `userId`
 */
export function getLocalFollowers(userId) {
  if (!userId) return [];
  try {
    const rawFollowers = localStorage.getItem(`turfington_followers_${userId}`);
    if (rawFollowers) return JSON.parse(rawFollowers);
  } catch {}
  return [];
}

/**
 * Checks if current user is following target user
 */
export function isUserFollowing(currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId) return false;
  const following = getLocalFollowing(currentUserId);
  return following.includes(targetUserId);
}

/**
 * Toggles follow / unfollow between current user and target user
 */
export async function toggleFollowUser(currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    return false;
  }

  const followingList = getLocalFollowing(currentUserId);
  const isCurrentlyFollowing = followingList.includes(targetUserId);
  const targetFollowers = getLocalFollowers(targetUserId);

  let updatedFollowing;
  let updatedFollowers;
  let newStatus;

  if (isCurrentlyFollowing) {
    // Unfollow
    updatedFollowing = followingList.filter(id => id !== targetUserId);
    updatedFollowers = targetFollowers.filter(id => id !== currentUserId);
    newStatus = false;
  } else {
    // Follow
    updatedFollowing = [...new Set([...followingList, targetUserId])];
    updatedFollowers = [...new Set([...targetFollowers, currentUserId])];
    newStatus = true;
  }

  // 1. Immediately update localStorage for instant reactive UI
  try {
    localStorage.setItem(`turfington_following_${currentUserId}`, JSON.stringify(updatedFollowing));
    localStorage.setItem(`turfington_friends_${currentUserId}`, JSON.stringify(updatedFollowing));
    localStorage.setItem(`turfington_followers_${targetUserId}`, JSON.stringify(updatedFollowers));
  } catch {}

  // 2. Broadcast change event across tabs and components
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('turfington_follow_change', {
      detail: {
        followerId: currentUserId,
        targetUserId,
        isFollowing: newStatus,
        followingCount: updatedFollowing.length,
        followersCount: updatedFollowers.length
      }
    }));
  }

  // 3. Asynchronously sync with Backend API
  try {
    const endpoint = newStatus ? 'follow' : 'unfollow';
    fetch(`${API_BASE}/api/users/${encodeURIComponent(targetUserId)}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ followerId: currentUserId })
    }).catch(() => {});
  } catch {}

  // 4. Asynchronously sync with Firestore
  try {
    const docId = `${currentUserId}_${targetUserId}`;
    if (newStatus) {
      setDoc(doc(db, 'follows', docId), {
        follower_id: currentUserId,
        following_id: targetUserId,
        createdAt: serverTimestamp()
      }).catch(() => {});
    } else {
      deleteDoc(doc(db, 'follows', docId)).catch(() => {});
    }
  } catch {}

  return newStatus;
}

/**
 * Gets real-time follow counts for a user
 */
export async function getFollowCounts(userId) {
  if (!userId) return { followersCount: 0, followingCount: 0 };

  const localFollowing = getLocalFollowing(userId);
  const localFollowers = getLocalFollowers(userId);

  let counts = {
    followersCount: localFollowers.length,
    followingCount: localFollowing.length
  };

  // Asynchronously query backend for authoritative counts
  try {
    const res = await fetch(`${API_BASE}/api/users/${encodeURIComponent(userId)}/follow-counts`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.success) {
        counts.followersCount = Math.max(localFollowers.length, data.followersCount || 0);
        counts.followingCount = Math.max(localFollowing.length, data.followingCount || 0);
        if (Array.isArray(data.followerIds)) {
          localStorage.setItem(`turfington_followers_${userId}`, JSON.stringify([...new Set([...localFollowers, ...data.followerIds])]));
        }
        if (Array.isArray(data.followingIds)) {
          localStorage.setItem(`turfington_following_${userId}`, JSON.stringify([...new Set([...localFollowing, ...data.followingIds])]));
        }
      }
    }
  } catch {}

  return counts;
}

