import React, { useState, useEffect } from 'react';

/**
 * UserAvatar component:
 * 1. Custom uploaded PFP or Google photo URL (starts with http/data:) is rendered if present.
 * 2. If no photo or image fails to load, renders an initial letter avatar badge (first letter of user's name or email).
 * 3. Never renders static preset stock photos or robot avatars.
 */
export default function UserAvatar({ user, className = "w-10 h-10 text-sm", alt = "" }) {
  const [imgError, setImgError] = useState(false);
  
  let rawAvatar = user?.avatar_url || user?.avatar || user?.photoURL || '';

  // Look up real uploaded or Google profile photo from stored accounts/profiles
  if (!rawAvatar || rawAvatar.includes('dicebear.com') || rawAvatar.includes('bottts')) {
    try {
      const uId = String(user?.uid || user?.id || user?.otherUid || user?.senderUid || user?.sender_id || '').trim().toLowerCase();
      const uEmail = (user?.email || '').trim().toLowerCase();
      const uName = (user?.full_name || user?.name || user?.displayName || user?.title || user?.user || '').trim().toLowerCase();
      
      const checkCandidate = (cand) => {
        if (!cand) return null;
        const av = cand.avatar || cand.avatar_url || cand.photoURL;
        if (av && !av.includes('dicebear.com') && !av.includes('bottts') && (av.startsWith('http') || av.startsWith('data:'))) {
          const cId = String(cand.id || cand.uid || cand.firebase_uid || '').trim().toLowerCase();
          const cEmail = String(cand.email || '').trim().toLowerCase();
          const cName = String(cand.full_name || cand.name || cand.displayName || '').trim().toLowerCase();
          if (
            (uId && cId && uId === cId) ||
            (uEmail && cEmail && uEmail === cEmail) ||
            (uName && cName && uName === cName)
          ) {
            return av;
          }
        }
        return null;
      };

      if (typeof localStorage !== 'undefined') {
        // 1. Check unified connected accounts
        const connRaw = localStorage.getItem('turfington_connected_accounts');
        if (connRaw) {
          const connList = JSON.parse(connRaw);
          if (Array.isArray(connList)) {
            for (const a of connList) {
              const matchedAv = checkCandidate(a);
              if (matchedAv) { rawAvatar = matchedAv; break; }
            }
          }
        }

        // 2. Check active user
        if (!rawAvatar || rawAvatar.includes('dicebear.com') || rawAvatar.includes('bottts')) {
          const userRaw = localStorage.getItem('turfington_user');
          if (userRaw) {
            const matchedAv = checkCandidate(JSON.parse(userRaw));
            if (matchedAv) rawAvatar = matchedAv;
          }
        }

        // 3. Check legacy accounts map
        if (!rawAvatar || rawAvatar.includes('dicebear.com') || rawAvatar.includes('bottts')) {
          const accStr = localStorage.getItem('turfington_accounts');
          if (accStr) {
            const accs = Object.values(JSON.parse(accStr));
            for (const a of accs) {
              const matchedAv = checkCandidate(a);
              if (matchedAv) { rawAvatar = matchedAv; break; }
            }
          }
        }

        // 4. Check profile store
        if (!rawAvatar || rawAvatar.includes('dicebear.com') || rawAvatar.includes('bottts')) {
          const profStr = localStorage.getItem('turfington_profile');
          if (profStr) {
            const matchedAv = checkCandidate(JSON.parse(profStr));
            if (matchedAv) rawAvatar = matchedAv;
          }
        }
      }
    } catch {}
  }

  // Reset image error state whenever avatar URL changes so new PFP renders instantly
  useEffect(() => {
    setImgError(false);
  }, [rawAvatar]);

  const isPhoto = rawAvatar 
    && !imgError 
    && (rawAvatar.startsWith('data:') || rawAvatar.startsWith('http')) 
    && !rawAvatar.includes('ui-avatars.com')
    && !rawAvatar.includes('dicebear.com')
    && !rawAvatar.includes('bottts');

  const nameCandidate = (
    user?.full_name ||
    user?.name ||
    user?.displayName ||
    user?.title ||
    user?.email ||
    user?.username ||
    (user?.uid || user?.id ? 'Athlete' : 'U')
  ).trim();
  const initial = nameCandidate.charAt(0).toUpperCase() || 'A';

  // Dynamic gradient based on initial letter
  const gradients = [
    'from-indigo-600 via-indigo-700 to-violet-900',
    'from-emerald-600 via-teal-700 to-green-900',
    'from-amber-600 via-orange-700 to-yellow-900',
    'from-rose-600 via-pink-700 to-red-900',
    'from-cyan-600 via-blue-700 to-indigo-900',
    'from-fuchsia-600 via-purple-700 to-violet-900'
  ];
  const charCode = initial.charCodeAt(0) || 0;
  const gradient = gradients[charCode % gradients.length];

  if (isPhoto) {
    return (
      <img
        src={rawAvatar}
        alt={alt || user?.full_name || 'User Avatar'}
        onError={() => setImgError(true)}
        className={`rounded-full object-cover shrink-0 ${className}`}
      />
    );
  }

  return (
    <div
      className={`rounded-full bg-gradient-to-br ${gradient} text-white font-black flex items-center justify-center select-none shrink-0 shadow-md ${className}`}
    >
      <span>{initial}</span>
    </div>
  );
}
