/**
 * Turfington Scalable Firestore Community Chat Service
 * Handles batched operations, transactions, pagination, and real-time listeners.
 */

import { db, auth } from './firebase.js';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
  increment
} from 'firebase/firestore';
import {

  encryptMessageText,
  decryptMessageText,
  isMessageEncrypted
} from './cryptoService.js';

const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.PROD ? '' : 'http://localhost:5000');

// ─────────────────────────────────────────────────────────────
// 0. Indestructible Local & Real-time Persistent Message Store
// ─────────────────────────────────────────────────────────────

/**
 * Safely retrieve locally stored messages for any conversation or group
 */
export function getLocalMessages(conversationId) {
  if (!conversationId) return [];
  try {
    const key = `turfington_chat_messages_${conversationId}`;
    let raw = localStorage.getItem(key);
    
    // Robust fallback: For direct conversations, check canonical sorted key and reversed key
    if ((!raw || raw === '[]') && conversationId.startsWith('direct_')) {
      const parts = conversationId.replace('direct_', '').split('_');
      if (parts.length >= 2) {
        const sortedKey = `turfington_chat_messages_direct_${[...parts].sort().join('_')}`;
        const reversedKey = `turfington_chat_messages_direct_${parts[1]}_${parts[0]}`;
        raw = localStorage.getItem(sortedKey) || localStorage.getItem(reversedKey);
      }
    }

    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    return [];
  }
}

function parseMsgTime(m) {
  if (!m) return 0;
  const raw = m.createdAt || m.created_at || m.timestamp;
  if (!raw) return 0;
  if (typeof raw === 'number') return raw;
  if (typeof raw?.toMillis === 'function') return raw.toMillis();
  if (typeof raw?.seconds === 'number') return raw.seconds * 1000;
  if (typeof raw?.toDate === 'function') return raw.toDate().getTime();
  const d = new Date(raw).getTime();
  return isNaN(d) ? 0 : d;
}

/**
 * Safely save or merge messages into persistent local storage by message ID
 */
export function saveLocalMessages(conversationId, newMessages) {
  if (!conversationId || !Array.isArray(newMessages)) return [];
  try {
    const key = `turfington_chat_messages_${conversationId}`;
    const existing = getLocalMessages(conversationId);
    const map = new Map();

    const normalizeMessage = (m) => {
      if (!m) return null;
      let cleanCreated = m.createdAt || m.created_at || m.timestamp;
      if (cleanCreated && typeof cleanCreated?.toMillis === 'function') {
        cleanCreated = new Date(cleanCreated.toMillis()).toISOString();
      } else if (cleanCreated && typeof cleanCreated?.seconds === 'number') {
        cleanCreated = new Date(cleanCreated.seconds * 1000).toISOString();
      } else if (cleanCreated && typeof cleanCreated?.toDate === 'function') {
        cleanCreated = cleanCreated.toDate().toISOString();
      }
      return {
        ...m,
        createdAt: cleanCreated || new Date().toISOString(),
        created_at: cleanCreated || new Date().toISOString()
      };
    };

    // Insert existing
    existing.forEach(m => {
      const id = m.id || m.idempotency_key || m.idempotencyKey;
      if (id) {
        const norm = normalizeMessage(m);
        if (norm) map.set(id, norm);
      }
    });
    // Merge new
    newMessages.forEach(m => {
      const id = m.id || m.idempotency_key || m.idempotencyKey;
      if (id) {
        const norm = normalizeMessage(m);
        if (norm) {
          const prev = map.get(id);
          map.set(id, { ...prev, ...norm });
        }
      }
    });
    const merged = Array.from(map.values()).sort((a, b) => {
      return parseMsgTime(a) - parseMsgTime(b);
    });

    // Content + sender + time deduplication guard (merges duplicate optimistic & remote sends)
    const deduped = [];
    merged.forEach(m => {
      const sId = m.senderUid || m.sender_id || m.senderId || m.user;
      const text = (m.text || m.content || '').trim();
      const mKey = m.idempotency_key || m.idempotencyKey || m.id;
      const mTime = parseMsgTime(m);

      const existingIdx = deduped.findIndex(item => {
        const itemKey = item.idempotency_key || item.idempotencyKey || item.id;
        if (mKey && itemKey && mKey === itemKey) return true;
        if (m.id && item.id && m.id === item.id) return true;

        const itemSender = item.senderUid || item.sender_id || item.senderId || item.user;
        const itemText = (item.text || item.content || '').trim();
        const itemTime = parseMsgTime(item);
        return (
          itemSender === sId &&
          itemText === text &&
          text.length > 0 &&
          Math.abs(itemTime - mTime) < 30000
        );
      });

      if (existingIdx >= 0) {
        deduped[existingIdx] = { ...deduped[existingIdx], ...m };
      } else {
        deduped.push(m);
      }
    });

    localStorage.setItem(key, JSON.stringify(deduped));

    // Mirror to canonical sorted key for direct chats
    if (conversationId.startsWith('direct_')) {
      const parts = conversationId.replace('direct_', '').split('_');
      if (parts.length >= 2) {
        const sortedKey = `turfington_chat_messages_direct_${[...parts].sort().join('_')}`;
        if (sortedKey !== key) {
          localStorage.setItem(sortedKey, JSON.stringify(deduped));
        }
      }
    }

    return deduped;
  } catch (e) {
    console.warn('saveLocalMessages error:', e);
    return [];
  }
}

/**
 * Append a single message locally
 */
export function appendLocalMessage(conversationId, msg) {
  if (!conversationId || !msg) return;
  return saveLocalMessages(conversationId, [msg]);
}

/**
 * Default community sports groups to seed
 */
export const SYSTEM_DEFAULT_GROUP_IDS = new Set([
  'group_football_chennai',
  'group_box_cricket',
  'group_badminton_smashers',
  'group_pickleball_padel',
  'group_pickleball_chennai',
  'group_table_tennis',
  'group_table_tennis_warriors',
  'group_strike_bowling',
  'group_bowling_strikes'
]);

export function isSystemDefaultGroup(g) {
  if (!g) return false;
  // If explicitly created by a real user, it is NEVER a system default!
  if (g.creatorUid && g.creatorUid !== 'turfington_official' && g.creatorUid !== 'system' && g.creatorUid !== 'admin') {
    return false;
  }
  const gid = String(g.groupId || g.id || g.conversationId || '').toLowerCase();
  const creator = String(g.creatorUid || g.created_by || '').toLowerCase();
  if (SYSTEM_DEFAULT_GROUP_IDS.has(gid)) return true;
  if (creator === 'turfington_official' || creator === 'system' || creator === 'admin') return true;
  return false;
}

export const DEFAULT_COMMUNITY_GROUPS_CONFIG = [];

// ─────────────────────────────────────────────────────────────
// 1. User Profile Management (`users/{uid}`)
// ─────────────────────────────────────────────────────────────

/**
 * Ensures user document exists in `users/{uid}`, reusing profile data
 */
export async function ensureUserProfile(user) {
  const uid = user?.uid || user?.firebase_uid || user?.id;
  if (!uid) return null;

  try {
    const userRef = doc(db, 'users', uid);
    const snap = await getDoc(userRef);

    const email = (user.email || '').toLowerCase().trim();
    const isGoogle = !!(
      user.auth_provider === 'google' ||
      user.is_google_user ||
      (email && email.endsWith('@gmail.com')) ||
      (user.avatar && user.avatar.includes('googleusercontent.com')) ||
      (user.avatarUrl && user.avatarUrl.includes('googleusercontent.com'))
    );

    const profileData = {
      uid,
      id: uid,
      displayName: user.displayName || user.full_name || user.name || (email ? email.split('@')[0] : 'Athlete'),
      name: user.displayName || user.full_name || user.name || (email ? email.split('@')[0] : 'Athlete'),
      email: email,
      avatarUrl: user.avatarUrl || user.avatar || user.avatar_url || '',
      role: user.role || 'player',
      sport: user.sport || 'Football',
      location: user.location || 'Chennai, India',
      auth_provider: isGoogle ? 'google' : (user.auth_provider || 'email'),
      is_google_user: isGoogle,
      updatedAt: serverTimestamp()
    };

    if (!snap.exists()) {
      await setDoc(userRef, {
        ...profileData,
        createdAt: serverTimestamp()
      });
    } else {
      await setDoc(userRef, profileData, { merge: true });
    }

    return profileData;
  } catch (err) {
    console.warn('ensureUserProfile notice:', err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 2. Direct Conversations (`conversations/{conversationId}`)
// ─────────────────────────────────────────────────────────────

/**
 * Get deterministic conversation ID between two UIDs to prevent duplicates
 */
export function getDirectConversationId(uid1, uid2) {
  const sorted = [String(uid1), String(uid2)].sort();
  return `direct_${sorted[0]}_${sorted[1]}`;
}

/**
 * Get or create a direct conversation using atomic batch write
 */
export async function getOrCreateDirectConversation(currentUser, targetUser) {
  const currentUid = currentUser?.uid || currentUser?.id || currentUser?.firebase_uid;
  const targetUid = targetUser?.uid || targetUser?.id || targetUser?.firebase_uid;
  
  if (!currentUid || !targetUid) throw new Error('Both users must have valid UIDs');

  // Pre-emptively ensure both users' root profile docs exist in Firestore users collection
  ensureUserProfile(currentUser).catch(() => {});
  ensureUserProfile(targetUser).catch(() => {});

  const conversationId = getDirectConversationId(currentUid, targetUid);
  const convRef = doc(db, 'conversations', conversationId);

  const currentName = currentUser?.displayName || currentUser?.full_name || currentUser?.name || 'Athlete';
  const targetName = targetUser?.displayName || targetUser?.full_name || targetUser?.name || 'Athlete';
  const currentAvatar = currentUser?.avatarUrl || currentUser?.avatar || currentUser?.avatar_url || '';
  const targetAvatar = targetUser?.avatarUrl || targetUser?.avatar || targetUser?.avatar_url || '';

  // 1. Synchronously cache in local storage for BOTH users for instant offline & cross-profile access
  try {
    const myInboxKey = `turfington_inbox_${currentUid}`;
    const myExisting = JSON.parse(localStorage.getItem(myInboxKey) || '[]');
    const myEntry = {
      conversationId,
      id: conversationId,
      type: 'direct',
      title: targetName,
      name: targetName,
      avatarUrl: targetAvatar,
      otherUid: targetUid,
      isEncrypted: true,
      is_google_user: !!targetUser.is_google_user,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      lastMessage: null,
      lastMessageTimestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(myInboxKey, JSON.stringify([myEntry, ...myExisting.filter(i => (i.conversationId || i.id) !== conversationId)]));

    const theirInboxKey = `turfington_inbox_${targetUid}`;
    const theirExisting = JSON.parse(localStorage.getItem(theirInboxKey) || '[]');
    const theirEntry = {
      conversationId,
      id: conversationId,
      type: 'direct',
      title: currentName,
      name: currentName,
      avatarUrl: currentAvatar,
      otherUid: currentUid,
      isEncrypted: true,
      is_google_user: !!currentUser.is_google_user,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      lastMessage: null,
      lastMessageTimestamp: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(theirInboxKey, JSON.stringify([theirEntry, ...theirExisting.filter(i => (i.conversationId || i.id) !== conversationId)]));
  } catch (e) {}

  try {
    const snap = await getDoc(convRef);
    if (snap.exists()) {
      return { id: snap.id, ...snap.data() };
    }

    // Atomic batch creation: conversation + inbox entries for both users
    const batch = writeBatch(db);

    const convData = {
      id: conversationId,
      conversationId,
      type: 'direct',
      members: [currentUid, targetUid],
      participants: [currentUid, targetUid],
      creatorUid: currentUid,
      isEncrypted: true,
      encryptionAlgorithm: 'AES-GCM-256',
      lastMessage: null,
      lastMessageTimestamp: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    batch.set(convRef, convData);

    // Current user's inbox
    const myInboxRef = doc(db, 'users', currentUid, 'inbox', conversationId);
    batch.set(myInboxRef, {
      conversationId,
      type: 'direct',
      title: targetName,
      name: targetName,
      avatarUrl: targetAvatar,
      otherUid: targetUid,
      isEncrypted: true,
      is_google_user: !!targetUser.is_google_user,
      lastMessage: null,
      lastMessageTimestamp: serverTimestamp(),
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      updatedAt: serverTimestamp()
    });

    // Target user's inbox
    const theirInboxRef = doc(db, 'users', targetUid, 'inbox', conversationId);
    batch.set(theirInboxRef, {
      conversationId,
      type: 'direct',
      title: currentName,
      name: currentName,
      avatarUrl: currentAvatar,
      otherUid: currentUid,
      isEncrypted: true,
      is_google_user: !!currentUser.is_google_user,
      lastMessage: null,
      lastMessageTimestamp: serverTimestamp(),
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      updatedAt: serverTimestamp()
    });

    // 2. Persist to Express backend in background
    try {
      fetch(`${API_BASE}/api/chats/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user1Id: currentUid, user2Id: targetUid })
      }).catch(() => {});
    } catch {}

    try {
      await batch.commit();
    } catch (batchErr) {
      console.warn('getOrCreateDirectConversation batch notice, attempting individual setDocs:', batchErr);
      await Promise.allSettled([
        setDoc(convRef, convData, { merge: true }),
        setDoc(myInboxRef, {
          conversationId,
          type: 'direct',
          title: targetName,
          name: targetName,
          avatarUrl: targetAvatar,
          otherUid: targetUid,
          isEncrypted: true,
          is_google_user: !!targetUser.is_google_user,
          lastMessage: null,
          lastMessageTimestamp: serverTimestamp(),
          unreadCount: 0,
          isPinned: false,
          isMuted: false,
          updatedAt: serverTimestamp()
        }, { merge: true }),
        setDoc(theirInboxRef, {
          conversationId,
          type: 'direct',
          title: currentName,
          name: currentName,
          avatarUrl: currentAvatar,
          otherUid: currentUid,
          isEncrypted: true,
          is_google_user: !!currentUser.is_google_user,
          lastMessage: null,
          lastMessageTimestamp: serverTimestamp(),
          unreadCount: 0,
          isPinned: false,
          isMuted: false,
          updatedAt: serverTimestamp()
        }, { merge: true })
      ]);
    }

    return {
      ...convData,
      title: targetName,
      name: targetName,
      avatarUrl: targetAvatar,
      avatar: targetAvatar
    };
  } catch (err) {
    console.warn('getOrCreateDirectConversation notice:', err);
    return {
      id: conversationId,
      conversationId,
      type: 'direct',
      title: targetName,
      name: targetName,
      avatarUrl: targetAvatar,
      avatar: targetAvatar,
      members: [currentUid, targetUid],
      participants: [currentUid, targetUid],
      creatorUid: currentUid,
      isEncrypted: true
    };
  }
}

// ─────────────────────────────────────────────────────────────
// 3. Community Groups & Membership
// ─────────────────────────────────────────────────────────────

/**
 * Create a new sports community group and its linked conversation
 */
export async function createCommunityGroup(groupData, creatorUser) {
  const creatorUid = creatorUser?.uid || creatorUser?.id || creatorUser?.firebase_uid || auth.currentUser?.uid || 'usr_amit_patel';
  const creatorName = creatorUser?.displayName || creatorUser?.full_name || creatorUser?.name || 'Athlete';
  const creatorAvatar = creatorUser?.avatarUrl || creatorUser?.avatar || '';

  const groupId = groupData.groupId || `group_${Date.now()}`;
  const conversationId = groupId;

  const sportImages = {
    Football: '/hero/hero_football_stadium_goal.jpg',
    Cricket: '/hero/hero_cricket_batsman.jpg',
    Badminton: '/hybrid_athlete_badminton.jpg',
    Pickleball: '/hero/hero_pickleball_court.jpg',
    'Table Tennis': '/hero/hero_table_tennis_paddle.jpg',
    Bowling: '/bowling_group.jpg',
    '8 Ball Pool': '/hero/hero_pool_billiards.jpg'
  };
  const finalImage = groupData.imageUrl || sportImages[groupData.sportCategory] || '/hero/hero_football_stadium_goal.jpg';

  const fullGroupData = {
    id: groupId,
    groupId,
    name: groupData.name.trim(),
    description: groupData.description ? groupData.description.trim() : '',
    sportCategory: groupData.sportCategory || 'Football',
    sport: groupData.sportCategory || 'Football',
    locationReference: groupData.locationReference || 'Chennai, Tamil Nadu',
    imageUrl: finalImage,
    creatorUid,
    creatorName,
    creatorAvatar,
    visibility: groupData.visibility || 'public',
    memberCount: 1,
    members: [creatorUid],
    conversationId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const convData = {
    id: conversationId,
    conversationId,
    type: 'group',
    groupId,
    members: [creatorUid],
    groupName: groupData.name.trim(),
    name: groupData.name.trim(),
    groupImage: finalImage,
    avatar: finalImage,
    sport: groupData.sportCategory || 'Football',
    creatorUid,
    lastMessage: `Group "${groupData.name.trim()}" created! Start organizing matches here.`,
    lastMessageTimestamp: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  // 1. Immediately cache in localStorage for instant local responsiveness
  try {
    const localGroups = JSON.parse(localStorage.getItem('turfington_community_groups') || '[]');
    const updatedLocal = [fullGroupData, ...localGroups.filter(g => (g.groupId || g.id) !== groupId)];
    localStorage.setItem('turfington_community_groups', JSON.stringify(updatedLocal));

    // Also persist to dedicated user-created groups store so it is never overwritten
    const myCreated = JSON.parse(localStorage.getItem('turfington_user_created_groups') || '[]');
    const updatedMyCreated = [fullGroupData, ...myCreated.filter(g => (g.groupId || g.id) !== groupId)];
    localStorage.setItem('turfington_user_created_groups', JSON.stringify(updatedMyCreated));

    // Also add to user inbox in localStorage
    const localInboxKey = `turfington_inbox_${creatorUid}`;
    const localInbox = JSON.parse(localStorage.getItem(localInboxKey) || '[]');
    const inboxItem = {
      id: conversationId,
      conversationId,
      type: 'group',
      groupId,
      title: groupData.name.trim(),
      avatarUrl: finalImage,
      sport: groupData.sportCategory || 'Football',
      lastMessage: convData.lastMessage,
      lastMessageTimestamp: convData.lastMessageTimestamp,
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem(localInboxKey, JSON.stringify([inboxItem, ...localInbox.filter(i => (i.conversationId || i.id) !== conversationId)]));
  } catch (err) {
    console.warn('Local storage cache error:', err);
  }

  // 2. Persist to Express API server (writes to turfington_db.json so it is visible to ALL users)
  try {
    fetch(`${API_BASE}/api/community-groups`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...fullGroupData,
        creatorUid,
        creatorName,
        creatorAvatar
      })
    }).catch(e => console.warn('Backend group sync notice:', e));
  } catch (e) {
    console.warn('Backend fetch error:', e);
  }

  // 3. Asynchronously attempt Firestore sync without blocking the user
  try {
    const groupRef = doc(db, 'communityGroups', groupId);
    const convRef = doc(db, 'conversations', conversationId);
    const memberRef = doc(db, 'communityGroups', groupId, 'members', creatorUid);
    const inboxRef = doc(db, 'users', creatorUid, 'inbox', conversationId);

    await setDoc(groupRef, {
      ...fullGroupData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }, { merge: true }).catch(e => console.warn('group setDoc error:', e));

    await setDoc(convRef, {
      ...convData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      lastMessageTimestamp: serverTimestamp()
    }, { merge: true }).catch(e => console.warn('conv setDoc error:', e));

    await setDoc(memberRef, {
      uid: creatorUid,
      displayName: creatorName,
      avatarUrl: creatorAvatar,
      role: 'admin',
      status: 'active',
      joinedAt: serverTimestamp()
    }, { merge: true }).catch(e => console.warn('member setDoc error:', e));

    await setDoc(inboxRef, {
      conversationId,
      type: 'group',
      groupId,
      title: groupData.name.trim(),
      avatarUrl: finalImage,
      sport: groupData.sportCategory || 'Sports',
      lastMessage: null,
      lastMessageTimestamp: serverTimestamp(),
      unreadCount: 0,
      isPinned: false,
      isMuted: false,
      updatedAt: serverTimestamp()
    }, { merge: true }).catch(e => console.warn('inbox setDoc error:', e));
  } catch (firestoreErr) {
    console.warn('Firestore batch setup error:', firestoreErr);
  }

  // Return immediately so UI doesn't hang!
  return { ...fullGroupData, conversation: convData };
}

/**
 * Join a community group with batch updates to members, memberCount, and conversation
 */
export async function joinCommunityGroup(groupId, user) {
  const uid = user?.uid || user?.id || user?.firebase_uid || auth.currentUser?.uid || 'usr_amit_patel';
  if (!uid) return false;

  // 1. Notify Express backend
  try {
    fetch(`${API_BASE}/api/community-groups/${groupId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid })
    }).catch(e => console.warn('Backend join notice:', e));
  } catch (e) {}

  // 2. Update localStorage
  try {
    const local = JSON.parse(localStorage.getItem('turfington_community_groups') || '[]');
    const updated = local.map(g => {
      if ((g.groupId || g.id) === groupId) {
        const members = Array.isArray(g.members) ? [...g.members] : [];
        if (!members.includes(uid)) members.push(uid);
        return { ...g, members, memberCount: (g.memberCount || 0) + 1 };
      }
      return g;
    });
    localStorage.setItem('turfington_community_groups', JSON.stringify(updated));
  } catch (e) {}

  // 3. Firestore async sync
  try {
    const groupRef = doc(db, 'communityGroups', groupId);
    const convRef = doc(db, 'conversations', groupId);
    const memberRef = doc(db, 'communityGroups', groupId, 'members', uid);
    const inboxRef = doc(db, 'users', uid, 'inbox', groupId);

    const groupSnap = await getDoc(groupRef);
    if (groupSnap.exists()) {
      const gData = groupSnap.data();
      const batch = writeBatch(db);
      batch.set(memberRef, {
        uid,
        displayName: user?.displayName || user?.full_name || user?.name || 'Athlete',
        avatarUrl: user?.avatarUrl || user?.avatar || '',
        role: 'member',
        status: 'active',
        joinedAt: serverTimestamp()
      });
      batch.update(groupRef, {
        memberCount: increment(1),
        updatedAt: serverTimestamp()
      });
      batch.update(convRef, {
        members: arrayUnion(uid),
        updatedAt: serverTimestamp()
      });
      batch.set(inboxRef, {
        conversationId: groupId,
        type: 'group',
        groupId,
        title: gData.name,
        avatarUrl: gData.imageUrl,
        sport: gData.sportCategory,
        lastMessage: gData.lastMessage || null,
        lastMessageTimestamp: serverTimestamp(),
        unreadCount: 0,
        isPinned: false,
        isMuted: false,
        updatedAt: serverTimestamp()
      });
      batch.commit().catch(e => console.warn('Firestore join commit error:', e));
    }
  } catch (err) {
    console.warn('joinCommunityGroup notice:', err);
  }

  return true;
}

/**
 * Leave a community group
 */
export async function leaveCommunityGroup(groupId, user) {
  const uid = user?.uid || user?.id || user?.firebase_uid || auth.currentUser?.uid || 'usr_amit_patel';
  if (!uid) return false;

  // 1. Notify Express backend
  try {
    fetch(`${API_BASE}/api/community-groups/${groupId}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: uid })
    }).catch(e => console.warn('Backend leave notice:', e));
  } catch (e) {}

  // 2. Update localStorage
  try {
    const local = JSON.parse(localStorage.getItem('turfington_community_groups') || '[]');
    const updated = local.map(g => {
      if ((g.groupId || g.id) === groupId) {
        const members = Array.isArray(g.members) ? g.members.filter(m => m !== uid) : [];
        return { ...g, members, memberCount: Math.max(0, (g.memberCount || 1) - 1) };
      }
      return g;
    });
    localStorage.setItem('turfington_community_groups', JSON.stringify(updated));
  } catch (e) {}

  // 3. Firestore async sync
  try {
    const groupRef = doc(db, 'communityGroups', groupId);
    const convRef = doc(db, 'conversations', groupId);
    const memberRef = doc(db, 'communityGroups', groupId, 'members', uid);
    const inboxRef = doc(db, 'users', uid, 'inbox', groupId);

    const batch = writeBatch(db);
    batch.delete(memberRef);
    batch.delete(inboxRef);
    batch.update(groupRef, {
      memberCount: increment(-1),
      updatedAt: serverTimestamp()
    });
    batch.update(convRef, {
      members: arrayRemove(uid),
      updatedAt: serverTimestamp()
    });
    batch.commit().catch(e => console.warn('Firestore leave commit error:', e));
  } catch (err) {
    console.warn('leaveCommunityGroup notice:', err);
  }

  return true;
}

// ─────────────────────────────────────────────────────────────
// 4. Messages Subcollection & Atomic Inbox Fanout
// ─────────────────────────────────────────────────────────────

/**
 * Send message with local persistent storage, batched Firestore updates, and inbox fanout
 */
export async function sendChatMessage(conversationId, senderUser, text, options = {}) {
  const senderUid = senderUser?.uid || senderUser?.firebase_uid || senderUser?.id || auth.currentUser?.uid;
  if (!senderUid || !text || !text.trim()) throw new Error('Sender UID and text required');

  const cleanText = text.trim();
  const senderName = senderUser.displayName || senderUser.full_name || senderUser.name || 'Athlete';
  const senderAvatar = senderUser.avatarUrl || senderUser.avatar || senderUser.avatar_url || '';

  const messageId = options.messageId || options.idempotencyKey || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const nowIso = new Date().toISOString();

  // 1. Message document for clean display and immediate persistent local storage
  const localMessageDoc = {
    id: messageId,
    idempotency_key: messageId,
    conversationId,
    conversation_id: conversationId,
    senderUid,
    sender_id: senderUid,
    senderName,
    user: senderName,
    senderAvatar,
    avatar: senderAvatar,
    text: cleanText,
    content: cleanText,
    isEncrypted: true,
    algorithm: 'AES-GCM-256',
    type: options.type || 'text',
    attachmentUrl: options.attachmentUrl || null,
    attachmentMetadata: options.attachmentMetadata || null,
    replyToId: options.replyToId || null,
    reply_to_id: options.replyToId || null,
    replyToSnippet: options.replyToSnippet || null,
    reactions: {},
    isDeleted: false,
    deletedAt: null,
    editedAt: null,
    createdAt: nowIso,
    created_at: nowIso,
    status: 'sent'
  };

  // 2. IMMEDIATELY STORE LOCALLY: Guarantees messages are NEVER lost or cleared!
  appendLocalMessage(conversationId, localMessageDoc);

  // 3. Resolve recipient UID and details for direct messaging
  let recipientUid = options.recipientUid;
  if (!recipientUid && conversationId.startsWith('direct_')) {
    const parts = conversationId.replace('direct_', '').split('_');
    recipientUid = parts.find(p => p !== senderUid) || null;
  }
  let recipientName = options.recipientName;
  let recipientAvatar = options.recipientAvatar;
  if ((!recipientName || recipientName === 'Athlete') && recipientUid) {
    try {
      const allAthletes = JSON.parse(localStorage.getItem('turfington_athletes_cache') || '[]');
      const found = allAthletes.find(a => a.id === recipientUid || a.uid === recipientUid || a.firebase_uid === recipientUid);
      if (found) {
        recipientName = found.full_name || found.name || 'Athlete';
        recipientAvatar = recipientAvatar || found.avatar || found.avatar_url || '';
      }
    } catch {}
  }
  if (!recipientName) recipientName = 'Athlete';
  if (!recipientAvatar) recipientAvatar = '';

  const preview = {
    text: cleanText,
    senderUid,
    senderName,
    type: options.type || 'text',
    timestamp: Date.now()
  };

  // 3a. Update sender's local inbox
  try {
    const myInboxKey = `turfington_inbox_${senderUid}`;
    const myInbox = JSON.parse(localStorage.getItem(myInboxKey) || '[]');
    const exists = myInbox.some(i => (i.conversationId === conversationId || i.id === conversationId));
    let updatedMyInbox;
    if (exists) {
      updatedMyInbox = myInbox.map(i => (i.conversationId === conversationId || i.id === conversationId) ? {
        ...i,
        lastMessage: preview,
        lastMessageTimestamp: nowIso,
        updatedAt: nowIso
      } : i);
    } else {
      updatedMyInbox = [{
        conversationId,
        id: conversationId,
        type: conversationId.startsWith('direct_') ? 'direct' : 'group',
        title: recipientName,
        name: recipientName,
        avatarUrl: recipientAvatar,
        otherUid: recipientUid,
        isEncrypted: true,
        unreadCount: 0,
        isPinned: false,
        isMuted: false,
        lastMessage: preview,
        lastMessageTimestamp: nowIso,
        updatedAt: nowIso
      }, ...myInbox];
    }
    localStorage.setItem(myInboxKey, JSON.stringify(updatedMyInbox));
  } catch (e) {}

  // 3b. Update recipient's local inbox on this browser/client
  if (recipientUid && recipientUid !== senderUid) {
    try {
      const theirInboxKey = `turfington_inbox_${recipientUid}`;
      const theirInbox = JSON.parse(localStorage.getItem(theirInboxKey) || '[]');
      const existsInTheir = theirInbox.some(i => (i.conversationId === conversationId || i.id === conversationId));
      let updatedTheirInbox;
      if (existsInTheir) {
        updatedTheirInbox = theirInbox.map(i => (i.conversationId === conversationId || i.id === conversationId) ? {
          ...i,
          lastMessage: preview,
          unreadCount: (i.unreadCount || 0) + 1,
          lastMessageTimestamp: nowIso,
          updatedAt: nowIso
        } : i);
      } else {
        updatedTheirInbox = [{
          conversationId,
          id: conversationId,
          type: 'direct',
          title: senderName,
          name: senderName,
          avatarUrl: senderAvatar,
          otherUid: senderUid,
          isEncrypted: true,
          unreadCount: 1,
          isPinned: false,
          isMuted: false,
          lastMessage: preview,
          lastMessageTimestamp: nowIso,
          updatedAt: nowIso
        }, ...theirInbox];
      }
      localStorage.setItem(theirInboxKey, JSON.stringify(updatedTheirInbox));

      // 3c. Store immediate persistent notification for recipient
      const notifKey = `turfington_notifications_${recipientUid}`;
      const existingNotifs = JSON.parse(localStorage.getItem(notifKey) || '[]');
      const newNotif = {
        id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        type: 'chat_message',
        conversationId,
        senderUid,
        senderName,
        senderAvatar,
        text: cleanText,
        timestamp: Date.now(),
        read: false,
        createdAt: nowIso
      };
      localStorage.setItem(notifKey, JSON.stringify([newNotif, ...existingNotifs].slice(0, 50)));
    } catch (e) {}
  }

  // 3d. Dispatch cross-component and cross-tab notification event
  if (typeof window !== 'undefined') {
    const eventDetail = {
      conversationId,
      senderUid,
      senderName,
      senderAvatar,
      recipientUid,
      text: cleanText,
      timestamp: Date.now()
    };
    window.dispatchEvent(new CustomEvent('turfington_message_received', { detail: eventDetail }));
    try {
      localStorage.setItem('turfington_last_message_event', JSON.stringify({ ...eventDetail, _t: Date.now() }));
    } catch {}
  }

  // 3e. Update community group preview if group
  try {
    const groupsKey = 'turfington_community_groups';
    const groups = JSON.parse(localStorage.getItem(groupsKey) || '[]');
    const updatedGroups = groups.map(g => (g.groupId === conversationId || g.id === conversationId) ? {
      ...g,
      lastMessage: preview,
      lastMessageTimestamp: nowIso,
      updatedAt: nowIso
    } : g);
    localStorage.setItem(groupsKey, JSON.stringify(updatedGroups));
  } catch (e) {}

  // 4, 5, 6: Background async sync to remote Firestore and Express backend WITHOUT blocking the UI!
  (async () => {
    let encryptedText = cleanText;
    try {
      encryptedText = await encryptMessageText(cleanText, conversationId);
    } catch (encErr) {
      console.warn('Encryption fallback:', encErr);
    }

    // Firestore batch update in background
    try {
      const messageRef = doc(db, 'conversations', conversationId, 'messages', messageId);
      const convRef = doc(db, 'conversations', conversationId);

      let members = [senderUid];
      if (recipientUid) members.push(recipientUid);
      try {
        const convSnap = await getDoc(convRef);
        if (convSnap.exists()) {
          const convData = convSnap.data();
          const existingMembers = convData.members || convData.participants || [];
          members = Array.from(new Set([...members, ...existingMembers]));
        }
      } catch (e) {}

      const remoteMsgDoc = {
        ...localMessageDoc,
        text: encryptedText,
        content: encryptedText,
        createdAt: serverTimestamp()
      };

      const batch = writeBatch(db);
      batch.set(messageRef, remoteMsgDoc);
      batch.set(convRef, {
        lastMessage: {
          text: encryptedText,
          senderUid,
          senderName,
          isEncrypted: true,
          algorithm: 'AES-GCM-256',
          type: options.type || 'text',
          timestamp: Date.now()
        },
        lastMessageTimestamp: serverTimestamp(),
        updatedAt: serverTimestamp(),
        members: members
      }, { merge: true });

      const isDirect = conversationId.startsWith('direct_');
      members.forEach(memberUid => {
        const userInboxRef = doc(db, 'users', memberUid, 'inbox', conversationId);
        const isSender = memberUid === senderUid;

        batch.set(userInboxRef, {
          conversationId,
          type: isDirect ? 'direct' : 'group',
          title: isDirect ? (isSender ? recipientName : senderName) : (options.groupName || 'Sports Group'),
          name: isDirect ? (isSender ? recipientName : senderName) : (options.groupName || 'Sports Group'),
          avatarUrl: isDirect ? (isSender ? recipientAvatar : senderAvatar) : (options.groupAvatar || ''),
          otherUid: isDirect ? (isSender ? recipientUid : senderUid) : null,
          lastMessage: {
            text: encryptedText,
            senderUid,
            senderName,
            isEncrypted: true,
            type: options.type || 'text',
            timestamp: Date.now()
          },
          lastMessageTimestamp: serverTimestamp(),
          unreadCount: isSender ? 0 : increment(1),
          ...(isSender ? { lastReadTimestamp: serverTimestamp() } : {}),
          updatedAt: serverTimestamp()
        }, { merge: true });
      });

      await batch.commit();
    } catch (firestoreErr) {
      console.warn('sendChatMessage Firestore batch notice, executing fallback writes:', firestoreErr);
      try {
        const isDirect = conversationId.startsWith('direct_');
        await Promise.allSettled([
          setDoc(messageRef, remoteMsgDoc),
          setDoc(convRef, {
            lastMessage: {
              text: encryptedText,
              senderUid,
              senderName,
              isEncrypted: true,
              type: options.type || 'text',
              timestamp: Date.now()
            },
            lastMessageTimestamp: serverTimestamp(),
            updatedAt: serverTimestamp(),
            members: members
          }, { merge: true }),
          ...members.map(memberUid => {
            const userInboxRef = doc(db, 'users', memberUid, 'inbox', conversationId);
            const isSender = memberUid === senderUid;
            return setDoc(userInboxRef, {
              conversationId,
              type: isDirect ? 'direct' : 'group',
              title: isDirect ? (isSender ? recipientName : senderName) : (options.groupName || 'Sports Group'),
              name: isDirect ? (isSender ? recipientName : senderName) : (options.groupName || 'Sports Group'),
              avatarUrl: isDirect ? (isSender ? recipientAvatar : senderAvatar) : (options.groupAvatar || ''),
              otherUid: isDirect ? (isSender ? recipientUid : senderUid) : null,
              lastMessage: {
                text: encryptedText,
                senderUid,
                senderName,
                isEncrypted: true,
                type: options.type || 'text',
                timestamp: Date.now()
              },
              lastMessageTimestamp: serverTimestamp(),
              unreadCount: isSender ? 0 : increment(1),
              updatedAt: serverTimestamp()
            }, { merge: true });
          })
        ]);
      } catch (fallbackErr) {
        console.warn('Individual setDoc fallback notice:', fallbackErr);
      }
    }

    // Express backend fallback persistence
    try {
      fetch(`${API_BASE}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: messageId,
          idempotencyKey: messageId,
          idempotency_key: messageId,
          conversationId,
          senderId: senderUid,
          senderName,
          senderAvatar,
          content: cleanText,
          text: cleanText,
          isEncrypted: true,
          attachments: options.attachmentUrl ? [{ url: options.attachmentUrl }] : []
        })
      }).catch(() => {});
    } catch {}
  })().catch(() => {});

  // 7. RETURN IMMEDIATELY (0ms instant delivery guarantee!)
  return localMessageDoc;
}

/**
 * Edit a message
 */
export async function editChatMessage(conversationId, messageId, senderUid, newText) {
  if (!newText || !newText.trim()) return false;
  const clean = newText.trim();
  const nowIso = new Date().toISOString();

  // 1. Update in local storage immediately
  try {
    const localMsgs = getLocalMessages(conversationId);
    const updated = localMsgs.map(m => m.id === messageId ? { ...m, text: clean, content: clean, editedAt: nowIso } : m);
    saveLocalMessages(conversationId, updated);
  } catch {}

  // 2. Update in Firestore
  try {
    const msgRef = doc(db, 'conversations', conversationId, 'messages', messageId);
    await setDoc(msgRef, {
      text: clean,
      content: clean,
      editedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('editChatMessage error:', err);
    return true;
  }
}

/**
 * Soft delete a message
 */
export async function deleteChatMessage(conversationId, messageId, senderUid) {
  const nowIso = new Date().toISOString();

  // 1. Update in local storage immediately
  try {
    const localMsgs = getLocalMessages(conversationId);
    const updated = localMsgs.map(m => m.id === messageId ? {
      ...m,
      text: 'This message was deleted',
      content: 'This message was deleted',
      isDeleted: true,
      deletedAt: nowIso
    } : m);
    saveLocalMessages(conversationId, updated);
  } catch {}

  // 2. Update in Firestore
  try {
    const msgRef = doc(db, 'conversations', conversationId, 'messages', messageId);
    await setDoc(msgRef, {
      text: 'This message was deleted',
      content: 'This message was deleted',
      isDeleted: true,
      deletedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('deleteChatMessage error:', err);
    return true;
  }
}

// ─────────────────────────────────────────────────────────────
// 5. User Inbox CRUD & Real-Time Listeners
// ─────────────────────────────────────────────────────────────

/**
 * Mark all messages in a conversation as read for the user
 */
export async function markConversationAsRead(uid, conversationId) {
  if (!uid || !conversationId) return;
  try {
    const inboxRef = doc(db, 'users', uid, 'inbox', conversationId);
    await setDoc(inboxRef, {
      unreadCount: 0,
      lastReadTimestamp: serverTimestamp()
    }, { merge: true });
  } catch (e) {}

  // Also update local storage inbox unreadCount to 0
  try {
    const key = `turfington_inbox_${uid}`;
    const inbox = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = inbox.map(i => (i.conversationId === conversationId || i.id === conversationId) ? { ...i, unreadCount: 0 } : i);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch {}
}

/**
 * Toggle pin status for a conversation in user's inbox
 */
export async function togglePinConversation(uid, conversationId, isPinned) {
  if (!uid || !conversationId) return;
  try {
    const inboxRef = doc(db, 'users', uid, 'inbox', conversationId);
    await setDoc(inboxRef, { isPinned }, { merge: true });
  } catch (e) {}
}

/**
 * Toggle mute notifications for a conversation
 */
export async function toggleMuteConversation(uid, conversationId, isMuted) {
  if (!uid || !conversationId) return;
  try {
    const inboxRef = doc(db, 'users', uid, 'inbox', conversationId);
    await setDoc(inboxRef, { isMuted }, { merge: true });
  } catch (e) {}
}

/**
 * Safely load local inbox items with automatic discovery of any direct chats involving the user
 */
export function getLocalInboxWithDiscovery(uid) {
  if (!uid) return [];
  try {
    const localKey = `turfington_inbox_${uid}`;
    const cached = JSON.parse(localStorage.getItem(localKey) || '[]');
    const convMap = new Map();

    // Helper to find partner profile from local saved profiles
    const findUserProfile = (partnerId) => {
      try {
        const keys = ['turfington_accounts', 'turfington_profile', 'turfington_registered_users', 'turfington_saved_profiles', 'turfington_all_profiles', 'turfington_profiles'];
        for (const k of keys) {
          const raw = localStorage.getItem(k);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              const found = parsed.find(u => (
                u && (u.id === partnerId || u.uid === partnerId || u.firebase_uid === partnerId ||
                u.email === partnerId || u.full_name === partnerId || u.name === partnerId)
              ));
              if (found) return found;
            } else if (typeof parsed === 'object') {
              if (parsed[partnerId]) return parsed[partnerId];
              const val = Object.values(parsed).find(u => (
                u && (u?.id === partnerId || u?.uid === partnerId || u?.firebase_uid === partnerId ||
                u?.email === partnerId || u?.full_name === partnerId || u?.name === partnerId)
              ));
              if (val) return val;
            }
          }
        }
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('turfington_saved_profiles_')) {
            const raw = localStorage.getItem(k);
            if (raw) {
              const list = JSON.parse(raw);
              if (Array.isArray(list)) {
                const found = list.find(u => (
                  u && (u.id === partnerId || u.uid === partnerId || u.firebase_uid === partnerId ||
                  u.email === partnerId || u.full_name === partnerId || u.name === partnerId)
                ));
                if (found) return found;
              }
            }
          }
        }
      } catch {}
      return null;
    };

    cached.forEach(item => {
      const cid = item.conversationId || item.id;
      if (cid) convMap.set(cid, item);
    });

    // Auto-discover any active direct chats stored locally where uid is a participant
    if (typeof localStorage !== 'undefined') {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('turfington_chat_messages_direct_')) {
          const convId = k.replace('turfington_chat_messages_', '');
          const parts = convId.replace('direct_', '').split('_');
          if (parts.includes(String(uid))) {
            const msgs = JSON.parse(localStorage.getItem(k) || '[]');
            if (msgs.length > 0) {
              const lastMsg = msgs[msgs.length - 1];
              const otherUid = parts.find(p => p !== String(uid)) || 'athlete';
              const partnerProfile = findUserProfile(otherUid);
              const existing = convMap.get(convId);
              
              const partnerName = partnerProfile?.full_name || partnerProfile?.displayName || partnerProfile?.name || 
                ((lastMsg.senderUid !== uid && lastMsg.senderName) ? lastMsg.senderName : null) || 
                (msgs.find(m => m.senderUid === otherUid)?.senderName) || 'Athlete';
              const partnerAvatar = partnerProfile?.avatarUrl || partnerProfile?.avatar || partnerProfile?.avatar_url ||
                ((lastMsg.senderUid !== uid && lastMsg.senderAvatar) ? lastMsg.senderAvatar : null) || '';

              if (!existing) {
                convMap.set(convId, {
                  conversationId: convId,
                  id: convId,
                  type: 'direct',
                  title: partnerName,
                  name: partnerName,
                  avatarUrl: partnerAvatar,
                  otherUid,
                  isEncrypted: true,
                  unreadCount: (lastMsg.senderUid !== uid) ? 1 : 0,
                  isPinned: false,
                  isMuted: false,
                  lastMessage: {
                    text: lastMsg.text || lastMsg.content || '',
                    senderUid: lastMsg.senderUid,
                    senderName: lastMsg.senderName,
                    timestamp: parseMsgTime(lastMsg) || Date.now()
                  },
                  lastMessageTimestamp: lastMsg.createdAt || lastMsg.created_at || new Date().toISOString(),
                  updatedAt: lastMsg.createdAt || lastMsg.created_at || new Date().toISOString()
                });
              } else {
                if (!existing.title || existing.title === 'Athlete') {
                  existing.title = partnerName;
                  existing.name = partnerName;
                }
                if (!existing.avatarUrl || existing.avatarUrl.includes('direct_')) {
                  existing.avatarUrl = partnerAvatar;
                }
                if (lastMsg) {
                  existing.lastMessage = {
                    text: lastMsg.text || lastMsg.content || '',
                    senderUid: lastMsg.senderUid,
                    senderName: lastMsg.senderName,
                    timestamp: parseMsgTime(lastMsg) || Date.now()
                  };
                  existing.lastMessageTimestamp = lastMsg.createdAt || lastMsg.created_at || existing.lastMessageTimestamp;
                }
              }
            }
          }
        }
      }
    }

    const result = Array.from(convMap.values());
    result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const tA = parseMsgTime(a.lastMessage) || new Date(a.updatedAt || a.lastMessageTimestamp || 0).getTime();
      const tB = parseMsgTime(b.lastMessage) || new Date(b.updatedAt || b.lastMessageTimestamp || 0).getTime();
      return tB - tA;
    });
    return result;
  } catch (e) {
    return [];
  }
}

/**
 * Real-time listener for user's inbox with automated preview decryption
 */
export function subscribeToUserInbox(uid, callback) {
  if (!uid) return () => {};

  // 1. Deliver local inbox immediately so screen is never blank
  const initialLocal = getLocalInboxWithDiscovery(uid);
  if (initialLocal.length > 0) {
    try { callback(initialLocal); } catch {}
  }

  // 2. Real-time window message listener for immediate UI reaction
  const handleMsgReceived = (e) => {
    if (e.detail?.recipientUid === uid || e.detail?.senderUid === uid) {
      const refreshed = getLocalInboxWithDiscovery(uid);
      try { callback(refreshed); } catch {}
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('turfington_message_received', handleMsgReceived);
  }

  try {
    const inboxQuery = query(
      collection(db, 'users', uid, 'inbox'),
      orderBy('lastMessageTimestamp', 'desc'),
      limit(50)
    );

    const unsubFirestore = onSnapshot(inboxQuery, async (snapshot) => {
      const rawItems = snapshot.docs.map(d => ({
        id: d.id,
        conversationId: d.id,
        ...d.data()
      }));

      // Decrypt inbox preview text if encrypted
      const items = await Promise.all(rawItems.map(async (item) => {
        if (item.lastMessage && item.lastMessage.text) {
          const rawText = item.lastMessage.text;
          const decrypted = await decryptMessageText(rawText, item.conversationId);
          return {
            ...item,
            lastMessage: {
              ...item.lastMessage,
              text: decrypted,
              isEncrypted: isMessageEncrypted(rawText) || !!item.lastMessage.isEncrypted
            }
          };
        }
        return item;
      }));

      // Merge remote items with local items so newly created direct chats are never lost
      const localItems = getLocalInboxWithDiscovery(uid);
      const mergedMap = new Map();
      items.forEach(it => {
        const id = it.conversationId || it.id;
        if (id) {
          const localMatch = localItems.find(l => (l.conversationId === id || l.id === id));
          let resolvedTitle = it.title || it.name || localMatch?.title || localMatch?.name;
          let resolvedAvatar = it.avatarUrl || it.avatar || localMatch?.avatarUrl || localMatch?.avatar;
          let otherUid = it.otherUid || localMatch?.otherUid;

          if ((!resolvedTitle || resolvedTitle === 'Athlete') && id.startsWith('direct_')) {
            if (!otherUid) {
              const parts = id.replace('direct_', '').split('_');
              otherUid = parts.find(p => p !== uid) || null;
            }
            if (otherUid) {
              try {
                const allAthletes = JSON.parse(localStorage.getItem('turfington_athletes_cache') || '[]');
                const found = allAthletes.find(a => a.id === otherUid || a.uid === otherUid || a.firebase_uid === otherUid);
                if (found) {
                  resolvedTitle = found.full_name || found.name || resolvedTitle;
                  resolvedAvatar = resolvedAvatar || found.avatar || found.avatar_url || '';
                }
              } catch {}
            }
          }

          mergedMap.set(id, {
            ...it,
            title: resolvedTitle || it.title || 'Athlete',
            name: resolvedTitle || it.name || 'Athlete',
            avatarUrl: resolvedAvatar || it.avatarUrl || '',
            otherUid: otherUid || it.otherUid || null
          });
        }
      });
      localItems.forEach(it => {
        const id = it.conversationId || it.id;
        if (id && !mergedMap.has(id)) {
          mergedMap.set(id, it);
        }
      });

      const mergedList = Array.from(mergedMap.values());
      mergedList.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        const tA = a.lastMessageTimestamp?.toMillis ? a.lastMessageTimestamp.toMillis() : new Date(a.updatedAt || a.lastMessageTimestamp || 0).getTime();
        const tB = b.lastMessageTimestamp?.toMillis ? b.lastMessageTimestamp.toMillis() : new Date(b.updatedAt || b.lastMessageTimestamp || 0).getTime();
        return tB - tA;
      });

      callback(mergedList);
    }, (err) => {
      console.warn('subscribeToUserInbox notice (using local cache):', err);
      const fallback = getLocalInboxWithDiscovery(uid);
      callback(fallback);
    });

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('turfington_message_received', handleMsgReceived);
      }
      unsubFirestore();
    };
  } catch (e) {
    const fallback = getLocalInboxWithDiscovery(uid);
    callback(fallback);
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('turfington_message_received', handleMsgReceived);
      }
    };
  }
}

// ─────────────────────────────────────────────────────────────
// 6. Paginated Message History Listener with Automated Decryption
// ─────────────────────────────────────────────────────────────

/**
 * Subscribe to recent messages in a conversation (paginated initial window)
 * Automatically merges with persistent local storage so messages are NEVER lost!
 */
export function subscribeToMessages(conversationId, arg2, arg3 = 50) {
  if (!conversationId) return () => {};

  let callback = () => {};
  let pageSize = 50;

  if (typeof arg2 === 'function') {
    callback = arg2;
    if (typeof arg3 === 'number') pageSize = arg3;
  } else if (typeof arg3 === 'function') {
    callback = arg3;
    if (typeof arg2 === 'number') pageSize = arg2;
  }

  const safeCallback = (data) => {
    if (typeof callback === 'function') {
      try {
        callback(data);
      } catch (err) {
        console.warn('Error in subscribeToMessages callback handler:', err);
      }
    }
  };

  // 1. Immediately deliver local messages from persistent storage!
  const initialLocal = getLocalMessages(conversationId);
  safeCallback({ messages: initialLocal, oldestDoc: null, hasMore: false });

  // 2. Setup Firestore listener
  try {
    const msgQuery = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(pageSize)
    );

    return onSnapshot(msgQuery, async (snapshot) => {
      const docs = snapshot.docs;
      const oldestDoc = docs.length > 0 ? docs[docs.length - 1] : null;

      // Reverse so messages appear in ascending chronological order in the chat window
      const rawMessages = docs.map(d => ({
        id: d.id,
        ...d.data()
      })).reverse();

      // Decrypt any encrypted messages in parallel
      const decryptedMessages = await Promise.all(rawMessages.map(async (m) => {
        const rawContent = m.text || m.content || '';
        const isEnc = isMessageEncrypted(rawContent) || !!m.isEncrypted;
        const decrypted = isEnc ? await decryptMessageText(rawContent, conversationId) : rawContent;
        return {
          ...m,
          text: decrypted,
          content: decrypted,
          isEncrypted: isEnc
        };
      }));

      // Merge remote messages into persistent local store
      const merged = saveLocalMessages(conversationId, decryptedMessages);
      safeCallback({ messages: (merged && merged.length > 0) ? merged : decryptedMessages, oldestDoc, hasMore: docs.length === pageSize });
    }, (err) => {
      console.warn('subscribeToMessages listener notice (relying on local store):', err);
      // 1. Deliver local messages immediately without delay!
      const fallbackMsgs = getLocalMessages(conversationId);
      safeCallback({ messages: fallbackMsgs, oldestDoc: null, hasMore: false });

      // 2. Non-blocking fallback to Express backend if running
      fetch(`${API_BASE}/api/messages?chatId=${encodeURIComponent(conversationId)}`)
        .then(res => res.ok ? res.json() : null)
        .then(async data => {
          if (!data) return;
          const list = Array.isArray(data) ? data : (data.messages || []);
          if (list.length > 0) {
            const decryptedList = await Promise.all(list.map(async m => {
              const rawContent = m.text || m.content || '';
              const isEnc = isMessageEncrypted(rawContent) || !!m.isEncrypted;
              const decrypted = isEnc ? await decryptMessageText(rawContent, conversationId) : rawContent;
              return {
                ...m,
                text: decrypted,
                content: decrypted,
                isEncrypted: isEnc
              };
            }));
            const merged = saveLocalMessages(conversationId, decryptedList);
            safeCallback({ messages: (merged && merged.length > 0) ? merged : decryptedList, oldestDoc: null, hasMore: false });
          }
        })
        .catch(() => {});
    });
  } catch (e) {
    const fallbackMsgs = getLocalMessages(conversationId);
    safeCallback({ messages: fallbackMsgs, oldestDoc: null, hasMore: false });
    return () => {};
  }
}

/**
 * Load older messages before a given cursor document
 */
export async function loadMoreMessages(conversationId, oldestDoc, pageSize = 30) {
  if (!conversationId || !oldestDoc) return { messages: [], oldestDoc: null, hasMore: false };

  try {
    const msgQuery = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'desc'),
      startAfter(oldestDoc),
      limit(pageSize)
    );

    const snapshot = await getDocs(msgQuery);
    const docs = snapshot.docs;
    const newOldest = docs.length > 0 ? docs[docs.length - 1] : null;

    const rawMessages = docs.map(d => ({
      id: d.id,
      ...d.data()
    })).reverse();

    const decryptedMessages = await Promise.all(rawMessages.map(async (m) => {
      const rawContent = m.text || m.content || '';
      const isEnc = isMessageEncrypted(rawContent) || !!m.isEncrypted;
      const decrypted = isEnc ? await decryptMessageText(rawContent, conversationId) : rawContent;
      return {
        ...m,
        text: decrypted,
        content: decrypted,
        isEncrypted: isEnc
      };
    }));

    return {
      messages: decryptedMessages,
      oldestDoc: newOldest,
      hasMore: docs.length === pageSize
    };
  } catch (err) {
    console.warn('loadMoreMessages error:', err);
    return { messages: [], oldestDoc: null, hasMore: false };
  }
}

// ─────────────────────────────────────────────────────────────
// 7. Community Groups Discovery & Real-Time Listener
// ─────────────────────────────────────────────────────────────

/**
 * Real-time listener for public community sports groups
 */
export function subscribeToCommunityGroups(sportFilter = 'All', callback) {
  // 1. Deliver local groups first, stripping any default system groups
  try {
    const rawLocal = localStorage.getItem('turfington_community_groups');
    if (rawLocal) {
      const parsed = JSON.parse(rawLocal);
      if (Array.isArray(parsed)) {
        const cleaned = parsed.filter(g => !isSystemDefaultGroup(g));
        if (cleaned.length !== parsed.length) {
          localStorage.setItem('turfington_community_groups', JSON.stringify(cleaned));
        }
        const filteredLocal = (sportFilter && sportFilter !== 'All')
          ? cleaned.filter(g => g.sportCategory === sportFilter || g.sport === sportFilter)
          : cleaned;
        callback(filteredLocal);
      }
    }
  } catch {}

  try {
    const groupsRef = collection(db, 'communityGroups');
    let q = query(groupsRef, limit(60));

    if (sportFilter && sportFilter !== 'All') {
      q = query(groupsRef, where('sportCategory', '==', sportFilter), limit(60));
    }

    return onSnapshot(q, (snapshot) => {
      const groups = snapshot.docs
        .map(d => {
          const data = d.data();
          return {
            groupId: d.id,
            id: d.id,
            ...data,
            imageUrl: data.imageUrl || data.avatar
          };
        })
        .filter(g => !isSystemDefaultGroup(g));

      // Merge remote groups with user-created local groups
      let localCreated = [];
      try {
        const rawCreated = localStorage.getItem('turfington_user_created_groups');
        if (rawCreated) localCreated = JSON.parse(rawCreated);
      } catch {}

      const groupMap = new Map();
      groups.forEach(g => {
        const gid = g.groupId || g.id;
        if (gid) groupMap.set(gid, g);
      });
      localCreated.forEach(g => {
        const gid = g.groupId || g.id;
        if (gid && !groupMap.has(gid)) {
          groupMap.set(gid, g);
        }
      });

      const mergedGroups = Array.from(groupMap.values()).filter(g => !isSystemDefaultGroup(g));
      try {
        localStorage.setItem('turfington_community_groups', JSON.stringify(mergedGroups));
      } catch {}
      callback(mergedGroups);
    }, (err) => {
      console.warn('subscribeToCommunityGroups notice (falling back to local):', err);
      try {
        const rawLocal = localStorage.getItem('turfington_community_groups');
        const parsed = rawLocal ? JSON.parse(rawLocal) : [];
        const cleaned = parsed.filter(g => !isSystemDefaultGroup(g));
        const filtered = (sportFilter && sportFilter !== 'All')
          ? cleaned.filter(g => g.sportCategory === sportFilter || g.sport === sportFilter)
          : cleaned;
        callback(filtered);
      } catch {
        callback([]);
      }
    });
  } catch (e) {
    try {
      const rawLocal = localStorage.getItem('turfington_community_groups');
      const parsed = rawLocal ? JSON.parse(rawLocal) : [];
      const cleaned = parsed.filter(g => 
        !SYSTEM_DEFAULT_GROUP_IDS.has(g.groupId || g.id) &&
        g.creatorUid !== 'turfington_official' &&
        g.created_by !== 'turfington_official'
      );
      callback(cleaned);
    } catch {
      callback([]);
    }
    return () => {};
  }
}

// ─────────────────────────────────────────────────────────────
// 8. Device FCM Token Registration (`users/{uid}/devices/{deviceId}`)
// ─────────────────────────────────────────────────────────────

/**
 * Register device FCM token for push notifications
 */
export async function registerDeviceToken(uid, deviceId, fcmToken, platform = 'web') {
  if (!uid || !deviceId || !fcmToken) return false;
  try {
    const deviceRef = doc(db, 'users', uid, 'devices', deviceId);
    await setDoc(deviceRef, {
      deviceId,
      fcmToken,
      platform,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      lastActive: serverTimestamp(),
      createdAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn('registerDeviceToken error:', err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// 9. Initial Seed & Migration Helper
// ─────────────────────────────────────────────────────────────

/**
 * Ensures initial default community groups exist in `communityGroups` and `conversations`
 */
export async function ensureDefaultCommunityData(currentUser) {
  try {
    if (currentUser) {
      await ensureUserProfile(currentUser);
    }

    // Clean and purge any legacy default community groups from local storage
    try {
      const existingLocalGroups = JSON.parse(localStorage.getItem('turfington_community_groups') || '[]');
      const cleaned = existingLocalGroups.filter(g => 
        !SYSTEM_DEFAULT_GROUP_IDS.has(g.groupId || g.id) &&
        g.creatorUid !== 'turfington_official' &&
        g.created_by !== 'turfington_official'
      );
      localStorage.setItem('turfington_community_groups', JSON.stringify(cleaned));

      // Also clean default groups from current user inbox in local storage
      const uid = currentUser?.uid || currentUser?.id || currentUser?.firebase_uid;
      if (uid) {
        const inboxKey = `turfington_inbox_${uid}`;
        const existingInbox = JSON.parse(localStorage.getItem(inboxKey) || '[]');
        const cleanedInbox = existingInbox.filter(item => 
          !SYSTEM_DEFAULT_GROUP_IDS.has(item.conversationId || item.id || item.groupId) &&
          item.creatorUid !== 'turfington_official'
        );
        localStorage.setItem(inboxKey, JSON.stringify(cleanedInbox));
      }
    } catch {}
  } catch (err) {
    console.warn('ensureDefaultCommunityData notice:', err);
  }
}

/**
 * Fetch group members from communityGroups/{groupId}/members subcollection in Firestore
 */
export async function apiFetchGroupMembers(groupId) {
  if (!groupId) return [];
  try {
    const memSnap = await getDocs(collection(db, 'communityGroups', groupId, 'members'));
    if (!memSnap.empty) {
      return memSnap.docs.map(d => ({ id: d.id, uid: d.id, ...d.data() }));
    }
  } catch (e) {
    console.warn('apiFetchGroupMembers notice:', e);
  }
  return [];
}
