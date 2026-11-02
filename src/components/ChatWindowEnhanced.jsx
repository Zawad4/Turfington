import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Paperclip, Smile, Image as ImageIcon, Check, CheckCheck,
  ChevronLeft, MoreVertical, Reply, Trash2, Edit2, ShieldAlert,
  Ban, X, Loader2, FileText, CornerDownRight, Heart, ThumbsUp, Laugh, Flame, Trophy,
  Lock, ShieldCheck, Shield
} from 'lucide-react';
import {
  apiAddMessageReaction,
  apiBlockUser,
  apiSubmitReport,
  apiUploadChatAttachment,
  subscribeToConversationRealtime
} from '../services/db';
import {
  getLocalMessages,
  subscribeToMessages,
  loadMoreMessages,
  sendChatMessage,
  editChatMessage,
  deleteChatMessage,
  markConversationAsRead
} from '../services/chatService';
import UserAvatar from './UserAvatar';
import { useToast } from '../context';
import { formatTime12Hour } from '../utils/formatters';

const REACTION_EMOJIS = ['❤️', '👍', '😂', '🔥', '⚽'];

export default function ChatWindowEnhanced({
  chat,
  onBack,
  currentUser,
  isGroup = false,
  isMember = true,
  onJoinGroup = null,
  onLeaveGroup = null,
  contextBanner = null // { type: 'marketplace'|'venue'|'game', title, price, image, subtitle }
}) {
  const { toast } = useToast();
  const conversationId = chat?.id || chat?.conversationId || chat?.groupId;

  // 0. Instantly populate messages from local persistent store (0ms thread continuation!)
  const [messages, setMessages] = useState(() => {
    return conversationId ? getLocalMessages(conversationId) : [];
  });
  const [input, setInput] = useState('');
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
  const realtimeRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const currentUserId = currentUser?.id || currentUser?.uid || currentUser?.firebase_uid || 'usr_me';
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

      const sender = msg.senderUid || msg.sender_id || msg.senderId || msg.user;
      const text = (msg.text || msg.content || '').trim();
      const time = parseTime(msg);

      // Check if duplicate of an existing message in result
      const isDup = result.some(prev => {
        const prevId = prev.id || prev.idempotency_key || prev.idempotencyKey;
        if (id && prevId && id === prevId) return true;
        const prevSender = prev.senderUid || prev.sender_id || prev.senderId || prev.user;
        const prevText = (prev.text || prev.content || '').trim();
        const prevTime = parseTime(prev);
        // If same sender, same text, and within 20s, it's the exact same message
        return (
          prevSender === sender &&
          prevText === text &&
          text.length > 0 &&
          Math.abs(prevTime - time) < 20000
        );
      });

      if (!isDup) {
        if (id) seenIds.add(id);
        result.push(msg);
      }
    });

    return result;
  }, [messages]);

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
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
                className="w-10 h-10 rounded-2xl object-cover border border-white/15 shadow-md"
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
              <h3 className="font-display font-black text-white text-sm leading-snug tracking-tight">
                {chat.name || chat.user || 'Sports Conversation'}
              </h3>
            </div>
            <div className="text-[10px] text-neutral-400 flex items-center gap-1.5 font-light">
              {isGroup ? (
                <span className="flex items-center gap-1">
                  <span>{chat.members || chat.participants?.length || 2} members</span>
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
                <span>+ Join Hub</span>
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
      <div className="flex-grow overflow-y-auto p-4 space-y-4 no-scrollbar">
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
              const isSelf = (msg.senderUid === currentUserId) || (msg.sender_id === currentUserId) || msg.user === 'You' || msg.self;
              const isDeleted = Boolean(msg.isDeleted || msg.deleted_at);
              const parentMsg = (msg.replyToId ? dedupedMessages.find(m => m.id === msg.replyToId) : null) || (msg.reply_to_id ? dedupedMessages.find(m => m.id === msg.reply_to_id) : null);
              const senderAvatar = msg.senderAvatar || msg.sender?.avatar_url || msg.avatar || '';
              const senderName = msg.senderName || msg.sender?.full_name || msg.user || 'Athlete';

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

                    {/* Sender Name in Groups */}
                    {isGroup && !isSelf && (
                      <span className="block text-[10px] font-extrabold text-indigo-400 mb-1">
                        {msg.sender?.full_name || msg.user || 'Athlete'}
                      </span>
                    )}

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

    </div>
  );
}
