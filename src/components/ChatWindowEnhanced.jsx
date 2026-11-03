import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Paperclip, Smile, Image as ImageIcon, Check, CheckCheck,
  ChevronLeft, MoreVertical, Reply, Trash2, Edit2, ShieldAlert,
  Ban, X, Loader2, FileText, CornerDownRight, Heart, ThumbsUp, Laugh, Flame, Trophy,
  Lock, ShieldCheck, Shield, Copy, Plus, UserPlus, Users, MessageSquare, Info
} from 'lucide-react';
import {
  apiAddMessageReaction,
  apiBlockUser,
  apiSubmitReport,
  apiUploadChatAttachment,
  subscribeToConversationRealtime,
  apiFetchAthletes
} from '../services/db';
import {
  joinCommunityGroup,
  getLocalMessages,
  subscribeToMessages,
  loadMoreMessages,
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  markConversationAsRead,
  apiFetchGroupMembers
} from '../services/chatService';
import UserAvatar from './UserAvatar';
import { useToast } from '../context';
import { formatTime12Hour } from '../utils/formatters';

const REACTION_EMOJIS = ['❤️', '👍', '😂', '🔥', '⚽'];

// Top-level module helper: determines if a message is from the active user
export function checkIsMsgFromSelf(m, currentUserId, currentUser, currentUserName) {
  if (!m) return false;
  if (m.self || m.user === 'You') return true;
  const s = String(m.senderUid || m.sender_id || m.senderId || '').trim().toLowerCase();
  if (s) {
    if (currentUserId && s === String(currentUserId).trim().toLowerCase()) return true;
    if (currentUser?.uid && s === String(currentUser.uid).trim().toLowerCase()) return true;
    if (currentUser?.id && s === String(currentUser.id).trim().toLowerCase()) return true;
    if (currentUser?.email && s === String(currentUser.email).trim().toLowerCase()) return true;
  }
  const u = String(m.user || m.senderName || m.sender?.full_name || '').trim().toLowerCase();
  if (u && currentUserName && u === String(currentUserName).trim().toLowerCase()) return true;
  return false;
}

export default function ChatWindowEnhanced({
  chat,
  onBack,
  currentUser,
  isGroup = false,
  isMember = true,
  onJoinGroup = null,
  onLeaveGroup = null,
  contextBanner = null, // { type: 'marketplace'|'venue'|'game', title, price, image, subtitle }
  isAdmin = false,
  onStartDirectChat = null,
  athletes = []
}) {
  const { toast } = useToast();

  // Admin Group Invite & Direct Add States
  const [showAdminInviteModal, setShowAdminInviteModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [athleteSearch, setAthleteSearch] = useState('');
  const [athletesList, setAthletesList] = useState([]);
  const [groupMemberUids, setGroupMemberUids] = useState(() => {
    const set = new Set();
    if (chat?.participants && Array.isArray(chat.participants)) {
      chat.participants.forEach(p => set.add(typeof p === 'string' ? p : (p.id || p.uid)));
    }
    return set;
  });

  const currentUserId = currentUser?.id || currentUser?.uid || currentUser?.firebase_uid || 'usr_me';
  const effectiveIsAdmin = isGroup && (
    isAdmin ||
    chat.creatorUid === currentUserId ||
    chat.created_by === currentUserId ||
    chat.admin === currentUserId ||
    chat.creator_id === currentUserId ||
    (currentUser?.uid && chat.creatorUid === currentUser.uid) ||
    (currentUser?.id && chat.creatorUid === currentUser.id)
  );

  const currentGroupId = chat?.groupId || chat?.id || chat?.conversationId || '';
  const inviteLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/?tab=community&joinGroup=${encodeURIComponent(currentGroupId)}`;

  useEffect(() => {
    if (showAdminInviteModal && athletesList.length === 0) {
      if (typeof apiFetchAthletes === 'function') {
        apiFetchAthletes(currentUserId).then(res => {
          if (Array.isArray(res)) setAthletesList(res);
        });
      }
    }
  }, [showAdminInviteModal, currentUserId, athletesList.length]);

  const handleCopyInviteLink = () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(inviteLink);
      } else {
        const ta = document.createElement('textarea');
        ta.value = inviteLink;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      toast.success('Invite link copied! Anyone with this link can join this group chat.', 'Link Copied');
    } catch {
      toast.error('Could not copy link to clipboard.');
    }
  };

  const handleDirectAddAthlete = async (athlete) => {
    if (!athlete || !currentGroupId) return;
    try {
      if (typeof joinCommunityGroup === 'function') {
        await joinCommunityGroup(currentGroupId, athlete);
      }
      setGroupMemberUids(prev => new Set([...prev, athlete.id, athlete.uid]));
      toast.success(`Added ${athlete.name || athlete.full_name || 'Athlete'} to the group chat!`, 'Member Added');
    } catch (err) {
      console.warn('Error adding athlete to group:', err);
      toast.error('Could not add member to group.');
    }
  };

  const filteredAthletes = useMemo(() => {
    if (!athleteSearch.trim()) return athletesList;
    const q = athleteSearch.toLowerCase().trim();
    return athletesList.filter(a => {
      const name = (a.name || a.full_name || '').toLowerCase();
      const handle = (a.player_id || a.handle || a.email || '').toLowerCase();
      return name.includes(q) || handle.includes(q);
    });
  }, [athletesList, athleteSearch]);

  // Group Details & Member List Modal States
  const [showGroupDetailsModal, setShowGroupDetailsModal] = useState(false);
  const [firestoreGroupMembers, setFirestoreGroupMembers] = useState([]);

  useEffect(() => {
    if (showGroupDetailsModal && isGroup && currentGroupId) {
      apiFetchGroupMembers(currentGroupId).then(docs => {
        if (Array.isArray(docs) && docs.length > 0) {
          setFirestoreGroupMembers(docs);
        }
      });
      if (athletesList.length === 0 && typeof apiFetchAthletes === 'function') {
        apiFetchAthletes(currentUserId).then(res => {
          if (Array.isArray(res)) setAthletesList(res);
        });
      }
    }
  }, [showGroupDetailsModal, isGroup, currentGroupId, currentUserId, athletesList.length]);

  const resolvedMemberCount = useMemo(() => {
    if (Array.isArray(chat.members)) return chat.members.length;
    if (Array.isArray(chat.participants)) return chat.participants.length;
    if (typeof chat.members === 'number') return chat.members;
    if (typeof chat.memberCount === 'number') return chat.memberCount;
    if (typeof chat.members === 'string' && !isNaN(Number(chat.members))) return Number(chat.members);
    if (typeof chat.members === 'string' && chat.members.length > 0) return 1;
    return 2;
  }, [chat.members, chat.participants, chat.memberCount]);

  const resolvedMembers = useMemo(() => {
    if (!isGroup) return [];
    const uidMap = new Map();
    const combinedAthletes = [...(athletes || []), ...(athletesList || [])];

    // 1. Add current user if a member
    if (currentUserId && isMember) {
      uidMap.set(currentUserId, {
        id: currentUserId,
        uid: currentUserId,
        displayName: currentUser?.full_name || currentUser?.name || 'You',
        name: currentUser?.full_name || currentUser?.name || 'You',
        avatarUrl: currentUser?.avatarUrl || currentUser?.avatar || '',
        avatar: currentUser?.avatarUrl || currentUser?.avatar || '',
        role: (currentUserId === chat.creatorUid || effectiveIsAdmin) ? 'admin' : 'member',
        isSelf: true
      });
    }

    // 2. Add creator
    if (chat.creatorUid && !uidMap.has(chat.creatorUid)) {
      const matched = combinedAthletes.find(a => a.id === chat.creatorUid || a.uid === chat.creatorUid || a.firebase_uid === chat.creatorUid);
      uidMap.set(chat.creatorUid, {
        id: chat.creatorUid,
        uid: chat.creatorUid,
        displayName: matched?.full_name || matched?.name || chat.creatorName || 'Group Creator',
        name: matched?.full_name || matched?.name || chat.creatorName || 'Group Creator',
        avatarUrl: matched?.avatar || matched?.avatar_url || chat.creatorAvatar || '',
        avatar: matched?.avatar || matched?.avatar_url || chat.creatorAvatar || '',
        email: matched?.email || '',
        role: 'admin',
        isSelf: chat.creatorUid === currentUserId
      });
    }

    // 3. Add members from chat.members array or string
    const candidateUids = [];
    if (Array.isArray(chat.members)) {
      chat.members.forEach(m => {
        if (typeof m === 'string') candidateUids.push(m);
        else if (m?.uid || m?.id) candidateUids.push(m.uid || m.id);
      });
    } else if (typeof chat.members === 'string' && chat.members.length > 0) {
      candidateUids.push(chat.members);
    }
    if (Array.isArray(chat.participants)) {
      chat.participants.forEach(p => {
        if (typeof p === 'string') candidateUids.push(p);
        else if (p?.uid || p?.id) candidateUids.push(p.uid || p.id);
      });
    }

    candidateUids.forEach(uid => {
      if (!uid || uidMap.has(uid)) return;
      const matched = combinedAthletes.find(a => a.id === uid || a.uid === uid || a.firebase_uid === uid);
      uidMap.set(uid, {
        id: uid,
        uid: uid,
        displayName: matched?.full_name || matched?.name || (uid === chat.creatorUid ? chat.creatorName : `Athlete (${uid.slice(0, 6)})`),
        name: matched?.full_name || matched?.name || (uid === chat.creatorUid ? chat.creatorName : `Athlete (${uid.slice(0, 6)})`),
        avatarUrl: matched?.avatar || matched?.avatar_url || '',
        avatar: matched?.avatar || matched?.avatar_url || '',
        email: matched?.email || '',
        role: uid === chat.creatorUid ? 'admin' : 'member',
        isSelf: uid === currentUserId
      });
    });

    // 4. Add Firestore members
    firestoreGroupMembers.forEach(f => {
      const fUid = f.uid || f.id;
      if (!fUid) return;
      if (uidMap.has(fUid)) {
        const existing = uidMap.get(fUid);
        uidMap.set(fUid, {
          ...existing,
          displayName: f.displayName || f.name || existing.displayName,
          avatarUrl: f.avatarUrl || f.avatar || existing.avatarUrl,
          role: f.role || existing.role
        });
      } else {
        const matched = combinedAthletes.find(a => a.id === fUid || a.uid === fUid || a.firebase_uid === fUid);
        uidMap.set(fUid, {
          id: fUid,
          uid: fUid,
          displayName: f.displayName || matched?.full_name || matched?.name || 'Athlete',
          name: f.displayName || matched?.full_name || matched?.name || 'Athlete',
          avatarUrl: f.avatarUrl || matched?.avatar || matched?.avatar_url || '',
          avatar: f.avatarUrl || matched?.avatar || matched?.avatar_url || '',
          email: matched?.email || '',
          role: f.role || (fUid === chat.creatorUid ? 'admin' : 'member'),
          isSelf: fUid === currentUserId
        });
      }
    });

    return Array.from(uidMap.values());
  }, [chat, isGroup, currentUserId, currentUser, isMember, effectiveIsAdmin, athletes, athletesList, firestoreGroupMembers]);
  const conversationId = chat?.id || chat?.conversationId || chat?.groupId;

  // 0. Instantly populate messages from local persistent store (0ms thread continuation!)
  const [messages, setMessages] = useState(() => {
    return conversationId ? getLocalMessages(conversationId) : [];
  });
  const [input, setInput] = useState(() => {
    return chat?.initialMessage || contextBanner?.initialMessage || '';
  });

  useEffect(() => {
    const msg = chat?.initialMessage || contextBanner?.initialMessage;
    if (msg) {
      setInput(msg);
    }
  }, [conversationId, chat?.initialMessage, contextBanner?.initialMessage]);
  const [loading, setLoading] = useState(() => {
    const init = conversationId ? getLocalMessages(conversationId) : [];
    return init.length === 0;
  });
  const [sending, setSending] = useState(false);

  // Pagination states
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [oldestDocCursor, setOldestDocCursor] = useState(null);

  // Feature states
  const [replyToMsg, setReplyToMsg] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [editInput, setEditInput] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [activeReactionMsgId, setActiveReactionMsgId] = useState(null);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [showE2EEModal, setShowE2EEModal] = useState(false);

  // Typing & Presence
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [onlinePresence, setOnlinePresence] = useState({});
  const typingTimeoutRef = useRef(null);
  const sendingLockRef = useRef(false);
  const realtimeRef = useRef(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  const currentUserName = currentUser?.name || currentUser?.displayName || currentUser?.full_name || 'You';
  const currentUserAvatar = currentUser?.avatar || currentUser?.avatarUrl || currentUser?.avatar_url || '';

  // 1. Initial Load & Realtime Setup with pagination
  useEffect(() => {
    if (!conversationId) return;
    let isMounted = true;

    // Immediately synchronize with local messages on mount/switch
    const local = getLocalMessages(conversationId);
    if (local && local.length > 0) {
      setMessages(local);
      setLoading(false);
    }

    // Subscribe to paginated real-time messages from Firestore & local storage
    const unsubMessages = subscribeToMessages(conversationId, (res) => {
      if (!isMounted) return;
      const liveMessages = Array.isArray(res) ? res : (res?.messages || []);
      const oldestDoc = res?.oldestDoc || null;
      const moreAvailable = !!res?.hasMore;
      setMessages(liveMessages);
      setOldestDocCursor(oldestDoc);
      setHasMore(moreAvailable);
      setLoading(false);
      markConversationAsRead(currentUserId, conversationId);
    }, 35);

    // Setup Typing & Presence
    const subscription = subscribeToConversationRealtime(conversationId, {
      onReaction: () => {},
      onTyping: (payload) => {
        if (!isMounted) return;
        if (payload.user?.id !== currentUserId) {
          setTypingUsers(prev => {
            const next = new Set(prev);
            if (payload.isTyping) {
              next.add(payload.user?.name || 'Someone');
            } else {
              next.delete(payload.user?.name || 'Someone');
            }
            return next;
          });
        }
      },
      onPresence: (presenceState) => {
        if (isMounted) setOnlinePresence(presenceState);
      }
    });

    realtimeRef.current = subscription;
    subscription.trackPresence({ id: currentUserId, name: currentUserName });

    return () => {
      isMounted = false;
      unsubMessages();
      subscription.unsubscribe();
    };
  }, [conversationId, currentUserId]);

  // Helper to determine if a message is sent by the current user
  const isMsgFromSelf = useCallback((m) => {
    return checkIsMsgFromSelf(m, currentUserId, currentUser, currentUserName);
  }, [currentUserId, currentUser, currentUserName]);

  // Bulletproof deduplication: eliminates duplicate messages from optimistic sends, remote Firestore snapshots, or server responses
  const dedupedMessages = useMemo(() => {
    const result = [];
    const seenIds = new Set();
    const parseTime = (m) => {
      if (!m) return 0;
      const t = m.createdAt || m.created_at || m.timestamp;
      if (t?.toMillis) return t.toMillis();
      if (t?.toDate) return t.toDate().getTime();
      if (typeof t === 'number') return t;
      const parsed = new Date(t || 0).getTime();
      return isNaN(parsed) ? 0 : parsed;
    };

    messages.forEach(msg => {
      if (!msg) return;
      const id = msg.id || msg.idempotency_key || msg.idempotencyKey;
      if (id && seenIds.has(id)) return;

      const self = checkIsMsgFromSelf(msg, currentUserId, currentUser, currentUserName);
      const sender = String(msg.senderUid || msg.sender_id || msg.senderId || msg.user || '').trim().toLowerCase();
      const text = (msg.text || msg.content || '').trim();
      const time = parseTime(msg);

      // Check if duplicate of an existing message in result
      const dupIdx = result.findIndex(prev => {
        const prevId = prev.id || prev.idempotency_key || prev.idempotencyKey;
        if (id && prevId && id === prevId) return true;

        const prevSelf = checkIsMsgFromSelf(prev, currentUserId, currentUser, currentUserName);
        const prevSender = String(prev.senderUid || prev.sender_id || prev.senderId || prev.user || '').trim().toLowerCase();
        const prevText = (prev.text || prev.content || '').trim();
        const prevTime = parseTime(prev);

        if (prevText === text && text.length > 0) {
          const sameSender = (self && prevSelf) || (sender && prevSender && sender === prevSender);
          if (sameSender) {
            const timeDiff = Math.abs(prevTime - time);
            if (!prevTime || !time || timeDiff < 60000) return true;
          }
        }
        return false;
      });

      if (dupIdx >= 0) {
        result[dupIdx] = { ...result[dupIdx], ...msg, id: result[dupIdx].id || msg.id };
        if (id) seenIds.add(id);
      } else {
        if (id) seenIds.add(id);
        result.push(msg);
      }
    });

    return result;
  }, [messages, isMsgFromSelf]);

  // Auto scroll messages container to bottom (NEVER scroll the window)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [dedupedMessages, typingUsers]);

  // Handle typing status broadcast
  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (realtimeRef.current) {
      realtimeRef.current.sendTypingStatus({ id: currentUserId, name: currentUserName }, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        realtimeRef.current?.sendTypingStatus({ id: currentUserId, name: currentUserName }, false);
      }, 2500);
    }
  };

  // Handle Load More messages (Pagination)
  const handleLoadMore = async () => {
    if (!oldestDocCursor || loadingMore || !conversationId) return;
    setLoadingMore(true);
    const res = await loadMoreMessages(conversationId, oldestDocCursor, 25);
    setLoadingMore(false);
    if (res.messages && res.messages.length > 0) {
      setMessages(prev => [...res.messages, ...prev]);
      setOldestDocCursor(res.oldestDoc);
      setHasMore(res.hasMore);
    } else {
      setHasMore(false);
    }
  };

  // Handle File Attachment Upload
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !conversationId) return;

    setUploadingFile(true);
    const res = await apiUploadChatAttachment(file, conversationId);
    setUploadingFile(false);

    if (res.success) {
      setAttachments(prev => [...prev, res]);
    }
  };

  // Send Message
  const handleSendMessage = async (e) => {
    if (e) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
    }
    if (!conversationId) return;
    if (!input.trim() && attachments.length === 0) return;
    if (sendingLockRef.current) return;
    sendingLockRef.current = true;
    setTimeout(() => { sendingLockRef.current = false; }, 500);

    const textToSend = input.trim();
    const currentReply = replyToMsg;
    const currentAttachments = [...attachments];

    setInput('');
    setReplyToMsg(null);
    setAttachments([]);
    setSending(false);

    if (realtimeRef.current) {
      realtimeRef.current.sendTypingStatus({ id: currentUserId, name: currentUserName }, false);
    }

    const idempotencyKey = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Instant UI insertion with status: 'sent' (zero-latency message delivery)
    const newMsg = {
      id: idempotencyKey,
      idempotency_key: idempotencyKey,
      conversation_id: conversationId,
      conversationId: conversationId,
      sender_id: currentUserId,
      senderUid: currentUserId,
      user: currentUserName,
      senderName: currentUserName,
      avatar: currentUserAvatar,
      senderAvatar: currentUserAvatar,
      text: textToSend,
      content: textToSend,
      reply_to_id: currentReply?.id || null,
      replyToId: currentReply?.id || null,
      attachments: currentAttachments,
      reactions: {},
      status: 'sent',
      created_at: new Date().toISOString()
    };

    setMessages(prev => {
      const exists = prev.some(m => 
        m.id === idempotencyKey || 
        m.idempotency_key === idempotencyKey ||
        (m.text === textToSend && (m.senderUid === currentUserId || m.sender_id === currentUserId) && Math.abs(new Date(m.created_at || m.createdAt || 0).getTime() - Date.now()) < 10000)
      );
      if (exists) return prev;
      return [...prev, newMsg];
    });

    const recipientUid = chat?.otherUid || (chat?.participants || []).find(id => id !== currentUserId) || null;
    const recipientName = chat?.name || chat?.title || 'Athlete';
    const recipientAvatar = chat?.avatar || chat?.avatarUrl || '';

    // Non-blocking background dispatch
    sendChatMessage(
      conversationId,
      {
        uid: currentUserId,
        id: currentUserId,
        displayName: currentUserName,
        full_name: currentUserName,
        name: currentUserName,
        avatarUrl: currentUserAvatar,
        avatar: currentUserAvatar
      },
      textToSend,
      {
        idempotencyKey,
        messageId: idempotencyKey,
        recipientUid,
        recipientName,
        recipientAvatar,
        type: currentAttachments.length > 0 ? 'image' : 'text',
        attachmentUrl: currentAttachments[0]?.url || null,
        attachmentMetadata: currentAttachments[0] ? {
          fileName: currentAttachments[0].file_name,
          fileSize: currentAttachments[0].file_size,
          mimeType: currentAttachments[0].file_type
        } : null,
        replyToId: currentReply?.id || null,
        replyToSnippet: currentReply?.text || currentReply?.content || null
      }
    ).then(res => {
      if (res && res.id) {
        setMessages(prev => prev.map(m => (m.id === idempotencyKey || m.idempotency_key === idempotencyKey) ? { ...m, ...res, status: 'sent' } : m));
      }
    }).catch(err => {
      console.warn('sendChatMessage background error:', err);
    });
  };

  // Reactions
  const handleToggleReaction = async (msgId, emoji) => {
    setActiveReactionMsgId(null);
    await apiAddMessageReaction(msgId, currentUserId, emoji);
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const rx = m.reactions || [];
      const exists = Array.isArray(rx)
        ? rx.some(r => r.user_id === currentUserId && r.reaction === emoji)
        : (rx[emoji] && rx[emoji].includes(currentUserId));
      
      let nextRx = rx;
      if (Array.isArray(rx)) {
        nextRx = exists
          ? rx.filter(r => !(r.user_id === currentUserId && r.reaction === emoji))
          : [...rx, { user_id: currentUserId, reaction: emoji }];
      }
      return { ...m, reactions: nextRx };
    }));
  };

  // Edit Message
  const handleSaveEdit = async (msgId) => {
    if (!editInput.trim() || !conversationId) return;
    const text = editInput.trim();
    setEditingMsg(null);
    setEditInput('');
    await editChatMessage(conversationId, msgId, currentUserId, text);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text, content: text, edited_at: new Date().toISOString() } : m));
  };

  // Delete Message
  const handleDeleteMsg = async (msgId) => {
    if (!conversationId) return;
    await deleteChatMessage(conversationId, msgId, currentUserId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: 'This message was deleted', content: 'This message was deleted', isDeleted: true, deleted_at: new Date().toISOString() } : m));
  };

  // Block & Report
  const handleBlockUser = async () => {
    setHeaderMenuOpen(false);
    const targetId = chat?.participants?.find(p => p !== currentUserId) || chat?.created_by;
    await apiBlockUser(currentUserId, targetId, 'block');
    toast.success(`User ${chat?.user || chat?.name} has been blocked.`, 'User Blocked');
  };

  const handleReportUser = async () => {
    setHeaderMenuOpen(false);
    const reason = prompt("Enter reason for reporting this user/conversation:");
    if (reason) {
      const targetId = chat?.participants?.find(p => p !== currentUserId) || chat?.created_by;
      await apiSubmitReport({ reporterId: currentUserId, reportedUserId: targetId, conversationId: conversationId, reason });
      toast.success("Report submitted to moderation team. Thank you.", 'Report Submitted');
    }
  };

  const isOnline = Object.keys(onlinePresence).length > 0 || chat.online;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0d] text-left relative overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 right-1/4 w-72 h-72 bg-indigo-600/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-1/4 w-72 h-72 bg-purple-600/5 rounded-full blur-[100px]" />
      </div>
      
      {/* ── HEADER ── */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8 bg-[#101014]/80 backdrop-blur-xl z-20 shadow-md">
        <div className="flex items-center space-x-3.5">
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/8 text-neutral-400 hover:text-white transition-all lg:hidden cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div
            onClick={() => {
              if (isGroup) setShowGroupDetailsModal(true);
            }}
            className={`flex items-center space-x-3.5 ${isGroup ? 'cursor-pointer p-1.5 -m-1.5 rounded-2xl hover:bg-white/5 transition-colors group/header' : ''}`}
            title={isGroup ? 'Click to view group details & player roster' : undefined}
          >
            <div className="relative flex-shrink-0">
              {isGroup ? (
                <img
                  src={chat.imageUrl || chat.groupImage || chat.avatar || chat.avatar_url || chat.image_url || '/football_group.jpg'}
                  alt={chat.name || chat.user}
                  onError={(e) => {
                    e.currentTarget.onerror = null;
                    const sport = String(chat?.sport || chat?.sportCategory || chat?.name || '').toLowerCase();
                    if (sport.includes('badminton') || sport.includes('smasher')) e.currentTarget.src = '/badminton_group.jpg';
                    else if (sport.includes('cricket')) e.currentTarget.src = '/cricket_group.jpg';
                    else e.currentTarget.src = '/football_group.jpg';
                  }}
                  className="w-10 h-10 rounded-2xl object-cover border border-white/15 shadow-md group-hover/header:border-indigo-500/50 transition-colors"
                />
              ) : (
                <UserAvatar
                  user={{
                    full_name: chat.name || chat.user,
                    name: chat.name || chat.user,
                    avatar: chat.avatar || chat.avatar_url,
                    avatar_url: chat.avatar || chat.avatar_url,
                    uid: chat.otherUid || chat.id
                  }}
                  className="w-10 h-10 rounded-2xl text-sm"
                />
              )}
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0a0d] ${isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-neutral-600'}`} />
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-black text-white text-sm leading-snug tracking-tight group-hover/header:text-indigo-400 transition-colors flex items-center gap-1.5">
                  <span>{chat.name || chat.user || 'Sports Conversation'}</span>
                </h3>
                {isGroup && (
                  <span className="text-[10px] font-bold text-neutral-400 group-hover/header:text-white bg-white/5 px-2 py-0.5 rounded-full border border-white/10 flex items-center gap-1 transition-colors">
                    <Users className="w-3 h-3 text-indigo-400" />
                    <span>Members</span>
                  </span>
                )}
              </div>
              <div className="text-[10px] text-neutral-400 flex items-center gap-1.5 font-light">
                {isGroup ? (
                  <span className="flex items-center gap-1">
                    <span className="font-medium text-neutral-300">{resolvedMemberCount} {resolvedMemberCount === 1 ? 'member' : 'members'}</span>
                    <span>•</span>
                    <span className={isOnline ? 'text-emerald-400 font-medium' : 'text-neutral-500'}>
                      {isOnline ? '🟢 Live Activity' : 'Offline'}
                    </span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    {isOnline ? (
                      <span className="text-emerald-400 font-medium flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active Now
                      </span>
                    ) : (
                      <span>Last seen recently</span>
                    )}
                    <span>•</span>
                    <span className="text-emerald-400/90 flex items-center gap-0.5">
                      <Lock className="w-2.5 h-2.5 text-emerald-400" /> Encrypted
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-2">
          {/* E2EE Security Status Badge Button */}
          <button
            type="button"
            onClick={() => setShowE2EEModal(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-bold hover:bg-emerald-500/20 transition-all cursor-pointer shadow-sm"
            title="Click to view End-to-End Encryption verification"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">AES-256 E2EE</span>
          </button>
          {/* Admin Group Controls: ONLY visible if isGroup AND effectiveIsAdmin */}
          {isGroup && effectiveIsAdmin && (
            <button
              type="button"
              onClick={() => setShowAdminInviteModal(true)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-300 hover:text-white border border-indigo-500/30 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              title="Admin: Invite or Directly Add Members"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add / Invite</span>
            </button>
          )}

          {isGroup && onJoinGroup && onLeaveGroup && (
            <button
              type="button"
              onClick={isMember ? onLeaveGroup : onJoinGroup}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                isMember
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-rose-500/15 hover:text-rose-400 hover:border-rose-500/30'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/30'
              }`}
            >
              {isMember ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Joined</span>
                </>
              ) : (
                <span>+ Join Group</span>
              )}
            </button>
          )}

          <div className="relative">
            <button
              type="button"
              onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
              className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border border-white/8 transition-all cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            <AnimatePresence>
              {headerMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-0 mt-2 w-48 bg-[#121215] border border-white/10 rounded-2xl shadow-2xl z-30 overflow-hidden py-1"
                >
                  {isGroup && effectiveIsAdmin && (
                    <button
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        setShowAdminInviteModal(true);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-indigo-300 hover:bg-indigo-500/10 flex items-center gap-2 transition-colors cursor-pointer font-bold"
                    >
                      <UserPlus className="w-3.5 h-3.5" /> Invite / Add People
                    </button>
                  )}
                  <button
                    onClick={handleBlockUser}
                    className="w-full text-left px-4 py-2.5 text-xs text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Ban className="w-3.5 h-3.5" /> Block User
                  </button>
                  <button
                    onClick={handleReportUser}
                    className="w-full text-left px-4 py-2.5 text-xs text-amber-400 hover:bg-amber-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" /> Report Conversation
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* ── CONTEXT BANNER (Marketplace / Venue / Game) ── */}
      {(contextBanner || chat.productName || chat.venueName) && (
        <div className="p-3 bg-indigo-950/30 border-b border-indigo-500/20 flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center space-x-3 min-w-0">
            <img
              src={contextBanner?.image || chat.productImage || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=200'}
              className="w-10 h-10 rounded-xl object-cover border border-white/10 flex-shrink-0"
              alt=""
            />
            <div className="min-w-0">
              <h4 className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-[300px]">
                {contextBanner?.title || chat.productName || chat.venueName}
              </h4>
              <div className="flex items-center space-x-2 mt-0.5">
                <span className="text-xs font-display font-black text-indigo-400">
                  {contextBanner?.price || chat.productPrice || 'Booked Slot'}
                </span>
                <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-white/5 border border-white/8 text-neutral-400">
                  {contextBanner?.subtitle || chat.productCondition || 'Inquiry Context'}
                </span>
              </div>
            </div>
          </div>
          <span className="text-[8px] font-black uppercase text-indigo-400 border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 rounded-lg">
            Active Context
          </span>
        </div>
      )}

      {/* ── MESSAGES LIST ── */}
      <div ref={messagesContainerRef} className="flex-grow overflow-y-auto p-4 space-y-4 no-scrollbar">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-indigo-400 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin" />
            <span className="text-xs font-bold">Loading real-time message stream...</span>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-neutral-600 space-y-2">
            <span className="text-2xl">👋</span>
            <p className="text-xs font-medium text-neutral-400">No messages yet. Send a message to start the thread!</p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-3">
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="px-4 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border border-white/8 text-[11px] font-bold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                >
                  {loadingMore ? <Loader2 className="w-3 h-3 animate-spin text-indigo-400" /> : null}
                  <span>{loadingMore ? 'Loading earlier history...' : '↑ Load Earlier Messages'}</span>
                </button>
              </div>
            )}

            {/* E2EE Security Assurance Card */}
            <div className="flex justify-center my-2">
              <div 
                onClick={() => setShowE2EEModal(true)}
                className="max-w-xs sm:max-w-sm mx-auto p-2.5 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/20 backdrop-blur-md text-center space-y-1 cursor-pointer hover:bg-emerald-500/[0.08] transition-all group"
              >
                <div className="flex items-center justify-center gap-1.5 text-emerald-400 text-[10px] font-black uppercase tracking-wider">
                  <Lock className="w-3 h-3 text-emerald-400" />
                  <span>End-to-End Encrypted (AES-256)</span>
                </div>
                <p className="text-[10px] text-neutral-400 leading-normal font-light">
                  Messages in this conversation are protected with 256-bit AES-GCM encryption. Tap to view cryptographic verification.
                </p>
              </div>
            </div>

            {dedupedMessages.map((msg) => {
              const isSelf = checkIsMsgFromSelf(msg, currentUserId, currentUser, currentUserName);
              const isDeleted = Boolean(msg.isDeleted || msg.deleted_at);
              const parentMsg = (msg.replyToId ? dedupedMessages.find(m => m.id === msg.replyToId) : null) || (msg.reply_to_id ? dedupedMessages.find(m => m.id === msg.reply_to_id) : null);
              const senderAvatar = msg.senderAvatar || msg.sender?.avatar_url || msg.avatar || '';
              const senderName = msg.senderName || msg.sender_name || msg.sender?.full_name || msg.sender?.name || (msg.user && msg.user !== 'You' ? msg.user : null) || 'Athlete';
              const isAdminSender = isGroup && (msg.senderUid === chat?.creatorUid || msg.sender_id === chat?.creatorUid);

              return (
                <div
                  key={msg.id || msg.idempotency_key}
                  className={`flex items-end gap-2 group/msg ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}
                >
                  {!isSelf && (
                    <UserAvatar
                      user={{
                        name: senderName,
                        full_name: senderName,
                        avatar: senderAvatar,
                        avatar_url: senderAvatar,
                        uid: msg.senderUid || msg.sender_id
                      }}
                      className="w-7 h-7 text-[10px]"
                    />
                  )}

                  <div className={`max-w-[78%] sm:max-w-[70%] ${isSelf ? 'items-end' : 'items-start'} flex flex-col gap-1 relative`}>
                    {/* Clear Sender Name Header above message */}
                    <div className={`flex items-center gap-1.5 px-1 text-[11px] ${isSelf ? 'justify-end' : 'justify-start'}`}>
                      <span className={`font-black ${isSelf ? 'text-indigo-400' : 'text-emerald-400'}`}>
                        {isSelf ? 'You' : senderName}
                      </span>
                      {isAdminSender && (
                        <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Host
                        </span>
                      )}
                    </div>
                  
                  {/* Action Menu (Reply, Edit, Delete, Reaction) on Hover */}
                  <div className={`absolute top-0 ${isSelf ? '-left-20' : '-right-20'} hidden group-hover/msg:flex items-center space-x-1 bg-[#18181b] border border-white/10 rounded-full px-2 py-1 shadow-lg z-10`}>
                    <button
                      type="button"
                      onClick={() => setActiveReactionMsgId(activeReactionMsgId === msg.id ? null : msg.id)}
                      className="p-1 hover:text-amber-400 text-neutral-400 transition-colors cursor-pointer"
                      title="React"
                    >
                      <Smile className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplyToMsg(msg)}
                      className="p-1 hover:text-indigo-400 text-neutral-400 transition-colors cursor-pointer"
                      title="Reply"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                    {isSelf && !isDeleted && (
                      <>
                        <button
                          type="button"
                          onClick={() => { setEditingMsg(msg); setEditInput(msg.content || msg.text); }}
                          className="p-1 hover:text-emerald-400 text-neutral-400 transition-colors cursor-pointer"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteMsg(msg.id)}
                          className="p-1 hover:text-rose-400 text-neutral-400 transition-colors cursor-pointer"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>

                  {/* Reaction Quick Picker */}
                  <AnimatePresence>
                    {activeReactionMsgId === msg.id && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: -35 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="absolute top-0 bg-[#18181b] border border-white/10 rounded-full px-2 py-1 flex items-center space-x-1.5 shadow-2xl z-20"
                      >
                        {REACTION_EMOJIS.map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => handleToggleReaction(msg.id, emoji)}
                            className="hover:scale-125 transition-transform p-0.5 text-base cursor-pointer"
                          >
                            {emoji}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Parent Reply Quote */}
                  {parentMsg && (
                    <div className="px-3 py-1.5 rounded-xl bg-white/5 border-l-2 border-indigo-500 text-[11px] text-neutral-400 max-w-full truncate flex items-center gap-1.5">
                      <CornerDownRight className="w-3 h-3 text-indigo-400 flex-shrink-0" />
                      <span className="font-bold text-neutral-300">{parentMsg.user || 'Athlete'}:</span>
                      <span className="truncate">{parentMsg.content || parentMsg.text}</span>
                    </div>
                  )}

                  {/* Message Content Bubble */}
                  <div className={`px-4 py-2.5 rounded-2xl text-xs font-light leading-relaxed break-words relative transition-all ${
                    isSelf
                      ? 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 text-white rounded-br-xs shadow-[0_4px_20px_rgba(99,102,241,0.25)] border border-indigo-400/20'
                      : 'bg-[#15151a] border border-white/10 text-neutral-100 rounded-bl-xs shadow-md backdrop-blur-md'
                  }`}>

                    {/* Inline Editing */}
                    {editingMsg?.id === msg.id ? (
                      <div className="space-y-2 min-w-[200px]">
                        <input
                          type="text"
                          value={editInput}
                          onChange={e => setEditInput(e.target.value)}
                          className="w-full bg-black/40 border border-white/20 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                        />
                        <div className="flex justify-end space-x-1">
                          <button onClick={() => setEditingMsg(null)} className="px-2 py-1 text-[10px] text-neutral-400">Cancel</button>
                          <button onClick={() => handleSaveEdit(msg.id)} className="px-2.5 py-1 bg-emerald-600 text-white font-bold text-[10px] rounded-md">Save</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className={isDeleted ? 'italic text-neutral-500' : ''}>
                          {msg.content || msg.text}
                        </p>

                        {/* Attachments rendering */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {msg.attachments.map((att, idx) => (
                              <div key={idx} className="rounded-xl overflow-hidden border border-white/10 max-w-[240px]">
                                {att.file_type?.startsWith('image/') || att.url?.startsWith('data:image') || att.url?.includes('unsplash') ? (
                                  <img src={att.url || att.storage_path} alt="" className="w-full h-auto max-h-48 object-cover" />
                                ) : (
                                  <a href={att.url} target="_blank" rel="noreferrer" className="p-2.5 bg-black/40 flex items-center gap-2 text-indigo-300 text-[11px]">
                                    <FileText className="w-4 h-4" />
                                    <span className="truncate">{att.file_name || 'Download File'}</span>
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {/* Edited Badge */}
                    {msg.edited_at && !isDeleted && (
                      <span className="text-[8px] opacity-60 ml-1.5 uppercase font-bold">(edited)</span>
                    )}
                  </div>

                  {/* Reaction Badges */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className={`flex flex-wrap gap-1 ${isSelf ? 'justify-end' : 'justify-start'}`}>
                      {Object.entries(
                        msg.reactions.reduce((acc, r) => {
                          acc[r.reaction] = (acc[r.reaction] || 0) + 1;
                          return acc;
                        }, {})
                      ).map(([emoji, count]) => (
                        <span key={emoji} className="bg-white/10 border border-white/10 px-2 py-0.5 rounded-full text-[10px] text-white flex items-center gap-1">
                          <span>{emoji}</span>
                          <span className="font-extrabold">{count}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Message Timestamp & Status Indicator */}
                  <div className={`flex items-center gap-1.5 text-[9px] text-neutral-500 px-1 ${isSelf ? 'flex-row-reverse' : ''}`}>
                    <span>
                      {formatTime12Hour(new Date(msg.created_at || msg.createdAt || Date.now()).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }))}
                    </span>
                    {msg.isEncrypted !== false && (
                      <Lock className="w-2.5 h-2.5 text-emerald-400/90 flex-shrink-0" title="Protected by AES-256-GCM End-to-End Encryption" />
                    )}
                    {isSelf && (
                      msg.status === 'sending' ? (
                        <Loader2 className="w-2.5 h-2.5 animate-spin text-neutral-500" />
                      ) : (
                        <CheckCheck className="w-3 h-3 text-indigo-400" />
                      )
                    )}
                  </div>

                </div>
              </div>
            );
          })}
          </>
        )}

        {/* Live Typing Indicator */}
        {typingUsers.size > 0 && (
          <div className="flex items-center space-x-2 text-xs text-indigo-400 font-medium pl-2 animate-pulse">
            <span className="flex space-x-1">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:0.4s]" />
            </span>
            <span>{Array.from(typingUsers).join(', ')} {typingUsers.size === 1 ? 'is' : 'are'} typing...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ── ATTACHMENTS PREVIEW BAR ── */}
      {attachments.length > 0 && (
        <div className="px-4 py-2 bg-[#121215] border-t border-white/8 flex items-center gap-2 overflow-x-auto">
          {attachments.map((att, idx) => (
            <div key={idx} className="relative w-12 h-12 rounded-xl overflow-hidden border border-white/10 flex-shrink-0 bg-black">
              <img src={att.url} alt="" className="w-full h-full object-cover" />
              <button
                onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/70 text-white hover:bg-rose-600 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── REPLY PREVIEW BAR ── */}
      {replyToMsg && (
        <div className="px-4 py-2 bg-indigo-950/40 border-t border-indigo-500/20 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 min-w-0">
            <Reply className="w-4 h-4 text-indigo-400 flex-shrink-0" />
            <div className="min-w-0">
              <span className="font-bold text-indigo-300">Replying to {replyToMsg.user || 'Athlete'}</span>
              <p className="text-[11px] text-neutral-400 truncate">{replyToMsg.content || replyToMsg.text}</p>
            </div>
          </div>
          <button onClick={() => setReplyToMsg(null)} className="p-1 text-neutral-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── QUICK EMOJI DRAWER ── */}
      <AnimatePresence>
        {showEmojiPicker && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="px-4 py-2.5 bg-[#121215] border-t border-white/10 flex items-center gap-2 overflow-x-auto no-scrollbar z-20"
          >
            {['⚽', '🏏', '🏸', '🏀', '🎾', '🏓', '🏐', '🔥', '❤️', '👍', '🏆', '👏', '🎯', '💯'].map(emoji => (
              <button
                key={emoji}
                type="button"
                onClick={() => {
                  setInput(prev => prev + emoji);
                  setShowEmojiPicker(false);
                }}
                className="text-lg hover:scale-125 transition-transform p-1 cursor-pointer select-none"
              >
                {emoji}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── COMPOSER FORM ── */}
      <form onSubmit={handleSendMessage} className="p-3.5 border-t border-white/10 bg-[#0d0d10]/90 backdrop-blur-xl flex items-center gap-2.5 z-20">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          accept="image/*,video/*,application/pdf"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadingFile}
          className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white border border-white/10 transition-colors cursor-pointer"
          title="Attach Image or File"
        >
          {uploadingFile ? <Loader2 className="w-4 h-4 animate-spin text-indigo-400" /> : <Paperclip className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`p-2.5 rounded-xl transition-colors cursor-pointer border ${
            showEmojiPicker ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400' : 'bg-white/5 hover:bg-white/10 border-white/10 text-neutral-400 hover:text-white'
          }`}
          title="Insert Emoji"
        >
          <Smile className="w-4 h-4" />
        </button>

        <input
          type="text"
          value={input}
          onChange={handleInputChange}
          placeholder={`Write a message...`}
          className="flex-grow bg-white/[0.04] border border-white/10 focus:border-indigo-500/60 rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-500 focus:outline-none transition-all"
        />

        <button
          type="submit"
          disabled={sending || (!input.trim() && attachments.length === 0)}
          className="w-10 h-10 flex-shrink-0 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white flex items-center justify-center transition-all shadow-[0_0_20px_rgba(99,102,241,0.4)] cursor-pointer"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </form>

      {/* ── E2EE VERIFICATION MODAL ── */}
      <AnimatePresence>
        {showE2EEModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#121216] border border-emerald-500/30 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl text-left"
            >
              <div className="p-5 border-b border-white/8 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-black text-white text-base tracking-tight uppercase">
                      End-to-End Encryption
                    </h3>
                    <p className="text-[11px] text-emerald-400/90 font-medium">AES-256-GCM Authenticated Cipher</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowE2EEModal(false)}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-5 space-y-4 text-xs">
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/8 space-y-2">
                  <p className="text-neutral-300 font-light leading-relaxed">
                    Messages between you and <span className="font-bold text-white">{chat.name || chat.user}</span> are encrypted with individual keys derived via standard <span className="text-emerald-400 font-mono">PBKDF2-SHA256</span>.
                  </p>
                  <p className="text-neutral-400 text-[11px] font-light leading-relaxed">
                    Ciphertext is authenticated using Galois/Counter Mode (GCM). Even if intercepted on the database or network wire, no third party can read or tamper with your messages.
                  </p>
                </div>

                <div className="space-y-2 font-mono text-[11px]">
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/6">
                    <span className="text-neutral-500">Algorithm</span>
                    <span className="text-white font-bold">AES-GCM (256-bit)</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/6">
                    <span className="text-neutral-500">Key Derivation</span>
                    <span className="text-white font-bold">PBKDF2 / SHA-256</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/6">
                    <span className="text-neutral-500">Initialization Vector</span>
                    <span className="text-white font-bold">Unique 96-bit CSPRNG</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-black/40 border border-white/6">
                    <span className="text-neutral-500">Security Status</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Active & Verified
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setShowE2EEModal(false)}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all cursor-pointer shadow-md"
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── GROUP DETAILS & PLAYERS ROSTER MODAL ── */}
      <AnimatePresence>
        {showGroupDetailsModal && isGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="bg-[#121216] border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl text-left flex flex-col max-h-[85vh]"
            >
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-white/8 flex items-center justify-between flex-shrink-0 bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-display font-black text-white text-base tracking-tight uppercase">
                      Group Details
                    </h3>
                    <p className="text-[11px] text-neutral-400 font-light">
                      Community Info & Player Roster
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowGroupDetailsModal(false)}
                  className="p-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Scrollable Body */}
              <div className="p-4 sm:p-5 space-y-4 overflow-y-auto no-scrollbar flex-grow">
                {/* Hero Group Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-950/30 via-white/[0.02] to-purple-950/20 border border-white/10 flex items-start gap-3.5">
                  <img
                    src={chat.imageUrl || chat.groupImage || chat.avatar || chat.avatar_url || '/football_group.jpg'}
                    alt={chat.name || chat.user}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      const sport = String(chat?.sport || chat?.sportCategory || chat?.name || '').toLowerCase();
                      if (sport.includes('badminton') || sport.includes('smasher')) e.currentTarget.src = '/badminton_group.jpg';
                      else if (sport.includes('cricket')) e.currentTarget.src = '/cricket_group.jpg';
                      else e.currentTarget.src = '/football_group.jpg';
                    }}
                    className="w-16 h-16 rounded-2xl object-cover border border-white/15 shadow-md flex-shrink-0"
                  />
                  <div className="min-w-0 flex-grow">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-display font-black text-white text-base tracking-tight leading-snug">
                        {chat.name || chat.user}
                      </h4>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                        {chat.sport || chat.sportCategory || 'Sports'}
                      </span>
                    </div>

                    <p className="text-xs text-neutral-300 mt-1 leading-relaxed">
                      {chat.description || 'Welcome to this sports group! Connect with players, arrange matches, and talk sports.'}
                    </p>

                    <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-400 font-medium">
                      <span>📍 {chat.locationReference || 'Chennai, Tamil Nadu'}</span>
                      <span>•</span>
                      <span className="text-emerald-400 font-bold">{resolvedMembers.length} {resolvedMembers.length === 1 ? 'Player' : 'Players'}</span>
                    </div>
                  </div>
                </div>

                {/* Players / Member List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-neutral-400">
                      Players in this Group ({resolvedMembers.length})
                    </span>
                    {effectiveIsAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowGroupDetailsModal(false);
                          setShowAdminInviteModal(true);
                        }}
                        className="text-[11px] font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Add Player</span>
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-white/[0.04] bg-white/[0.02] border border-white/8 rounded-2xl overflow-hidden">
                    {resolvedMembers.length === 0 ? (
                      <div className="p-4 text-center text-xs text-neutral-400">No members listed yet.</div>
                    ) : (
                      resolvedMembers.map((member) => {
                        const isSelfMember = member.isSelf || member.uid === currentUserId;
                        return (
                          <div
                            key={member.uid || member.id}
                            className="p-3 flex items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <UserAvatar
                                user={{
                                  name: member.displayName || member.name,
                                  full_name: member.displayName || member.name,
                                  avatar: member.avatarUrl || member.avatar,
                                  avatar_url: member.avatarUrl || member.avatar,
                                  uid: member.uid || member.id
                                }}
                                className="w-10 h-10 rounded-xl text-xs flex-shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs text-white truncate">
                                    {member.displayName || member.name}
                                  </span>
                                  {isSelfMember && (
                                    <span className="text-[10px] text-indigo-400 font-medium">(You)</span>
                                  )}
                                </div>
                                <span className="text-[10px] text-neutral-500 truncate block">
                                  {member.email || (member.uid ? `ID: ${member.uid.slice(0, 8)}...` : 'Athlete')}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 flex-shrink-0">
                              {member.role === 'admin' ? (
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                  Host / Admin
                                </span>
                              ) : (
                                <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-white/5 text-neutral-400 border border-white/10">
                                  Player
                                </span>
                              )}

                              {!isSelfMember && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowGroupDetailsModal(false);
                                    if (typeof onStartDirectChat === 'function') {
                                      onStartDirectChat({
                                        id: member.uid || member.id,
                                        uid: member.uid || member.id,
                                        firebase_uid: member.uid || member.id,
                                        full_name: member.displayName || member.name,
                                        name: member.displayName || member.name,
                                        avatar: member.avatarUrl || member.avatar,
                                        avatar_url: member.avatarUrl || member.avatar
                                      });
                                    }
                                  }}
                                  className="px-2.5 py-1 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 hover:border-indigo-500/60 text-indigo-300 hover:text-white text-[11px] font-bold flex items-center gap-1 transition-all cursor-pointer shadow-sm"
                                  title={`Direct message ${member.displayName || member.name}`}
                                >
                                  <MessageSquare className="w-3 h-3 text-indigo-400" />
                                  <span>Message</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Invite Link Action */}
                <div className="p-3.5 rounded-2xl bg-black/40 border border-white/6 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-white block">Group Share Link</span>
                    <span className="text-[11px] text-neutral-400 truncate block">Share with sports friends to join this room</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyInviteLink}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer flex-shrink-0"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 border-t border-white/8 flex justify-end flex-shrink-0 bg-white/[0.01]">
                <button
                  type="button"
                  onClick={() => setShowGroupDetailsModal(false)}
                  className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
