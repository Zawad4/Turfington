import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

// Context & Hooks
import { useAuth } from './context';

// Layout & Structural Components
import { Header, MobileMenu, MobileNav, Footer } from './components/layout';

// Modals
import ProfileSwitcherModal from './components/ProfileSwitcherModal';
import SupportModal from './components/SupportModal';
import MatchRegulationsModal from './components/MatchRegulationsModal';
import MatchCancellationModal from './components/MatchCancellationModal';
import HostMatchRequestsModal from './components/HostMatchRequestsModal';

// Common Primitives
import ErrorBoundary from './components/ErrorBoundary';

// Constants
import { NAV_ITEMS } from './config/constants';

// Services
import { apiFetchBookings } from './services/db';

// Lazy-Loaded Page Views
const Landing = lazy(() => import('./pages/Landing'));
const Home = lazy(() => import('./pages/Home'));
const Discovery = lazy(() => import('./pages/Discovery'));
const Marketplace = lazy(() => import('./pages/Marketplace'));
const Profile = lazy(() => import('./pages/Profile'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const RoleSelect = lazy(() => import('./pages/RoleSelect'));
const Tournaments = lazy(() => import('./pages/Tournaments'));
const VenueManager = lazy(() => import('./pages/VenueManager'));
const Auth = lazy(() => import('./pages/Auth'));
const Community = lazy(() => import('./pages/Community'));

/* ── Local Storage Helper ──────────────────────────────────── */
const loadLocalState = (key, fallback) => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
};

const saveLocalState = (key, val) => {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
};

/* ════════════════════════════════════════════════════════════
   APP ROOT COMPONENT
   ════════════════════════════════════════════════════════════ */
export default function App() {
  const { user, authLoading, isOwner, login, logout, switchProfile, updateUser } = useAuth();

  /* ── Navigation State ─────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState('landing');
  const [navHistory, setNavHistory] = useState(['landing']);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [preSelectedSport, setPreSelectedSport] = useState('All');
  const [showRoleSelect, setShowRoleSelect] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);

  /* ── Global State Hub ─────────────────────────────────────── */
  const [cart, setCart] = useState(() => loadLocalState('turfington_cart', []));
  const [likedProducts, setLikedProducts] = useState(() => {
    const loaded = loadLocalState('turfington_liked_products', []);
    return Array.isArray(loaded) ? loaded : [];
  });

  const [venueOffers, setVenueOffers] = useState(() =>
    loadLocalState('turfington_venue_offers', [
      {
        id: 1,
        venueId: 1,
        type: 'booking',
        title: '15% Off Weekday Evenings',
        discount: '15%',
        description: 'Applicable on bookings between Monday to Thursday 5pm to 8pm'
      },
      {
        id: 2,
        venueId: 1,
        type: 'membership',
        title: 'Vanguard Monthly Pass',
        price: '₹1,499/mo',
        benefits: 'Includes 4 peak slots per month + priority booking'
      },
      {
        id: 3,
        venueId: 2,
        type: 'booking',
        title: 'Morning Bird Flat ₹150 Off',
        discount: '₹150 Flat',
        description: 'Valid on slots before 10 AM'
      }
    ])
  );

  const [joinedMatches, setJoinedMatches] = useState(() => {
    const uid = user?.id || user?.firebase_uid;
    return uid ? loadLocalState(`turfington_joined_matches_${uid}`, []) : [];
  });

  const [matchRequests, setMatchRequests] = useState(() => {
    const uid = user?.id || user?.firebase_uid;
    return uid ? loadLocalState(`turfington_match_requests_${uid}`, []) : [];
  });

  const [bookings, setBookings] = useState(() => {
    const uid = user?.id || user?.firebase_uid;
    if (uid) {
      const s = loadLocalState(`turfington_user_bookings_${uid}`, null);
      if (Array.isArray(s)) return s;
    }
    return [];
  });

  /* ── Match Regulation & Cancellation Modals ───────────────── */
  const [regulationsTargetMatch, setRegulationsTargetMatch] = useState(null);
  const [cancellationTargetMatch, setCancellationTargetMatch] = useState(null);
  const [hostReviewTargetMatch, setHostReviewTargetMatch] = useState(null);

  /* ── Unread Chat Count & Notifications ─────────────────────── */
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  const updateUnreadCount = () => {
    const uid = user?.id || user?.firebase_uid || user?.uid;
    if (!uid) return;
    try {
      const inboxKey = `turfington_inbox_${uid}`;
      const inbox = JSON.parse(localStorage.getItem(inboxKey) || '[]');
      const count = inbox.reduce((acc, curr) => acc + (curr.unreadCount || 0), 0);
      setUnreadMessageCount(count);
    } catch {
      setUnreadMessageCount(0);
    }
  };

  useEffect(() => {
    updateUnreadCount();
  }, [user?.id, activeTab]);

  useEffect(() => {
    const handleMsgReceived = (e) => {
      const detail = e?.detail;
      if (!detail) return;
      const currentUid = user?.id || user?.firebase_uid || user?.uid;

      if (detail.recipientUid === currentUid && detail.senderUid !== currentUid) {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification(`💬 ${detail.senderName || 'New Message'}`, {
              body: detail.text,
              icon: detail.senderAvatar || '/bowling_group.jpg'
            });
          } catch {}
        }
      }
      updateUnreadCount();
    };

    const handleStorageChange = (e) => {
      if (e.key === 'turfington_last_message_event' && e.newValue) {
        try {
          const detail = JSON.parse(e.newValue);
          handleMsgReceived({ detail });
        } catch {}
      }
    };

    window.addEventListener('turfington_message_received', handleMsgReceived);
    window.addEventListener('storage', handleStorageChange);
    return () => {
      window.removeEventListener('turfington_message_received', handleMsgReceived);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [user?.id]);

  /* ── Booking Synchronization Events ────────────────────────── */
  useEffect(() => {
    const handleCreated = (e) => {
      if (e.detail) {
        setBookings((prev) => [e.detail, ...(prev || []).filter((b) => b.id !== e.detail.id)]);
      }
    };
    const handleUpdated = (e) => {
      if (e.detail?.bookingId) {
        setBookings((prev) =>
          (prev || []).map((b) =>
            b.id === e.detail.bookingId
              ? { ...b, status: e.detail.status, rejection_reason: e.detail.rejectionReason }
              : b
          )
        );
      }
    };
    window.addEventListener('turfington_booking_created', handleCreated);
    window.addEventListener('turfington_booking_updated', handleUpdated);
    return () => {
      window.removeEventListener('turfington_booking_created', handleCreated);
      window.removeEventListener('turfington_booking_updated', handleUpdated);
    };
  }, []);

  /* ── State Persistence Listeners ───────────────────────────── */
  useEffect(() => {
    if (user?.id) {
      saveLocalState(`turfington_user_bookings_${user.id}`, bookings);
      saveLocalState(`turfington_joined_matches_${user.id}`, joinedMatches);
      saveLocalState(`turfington_match_requests_${user.id}`, matchRequests);
    }
  }, [bookings, joinedMatches, matchRequests, user?.id]);

  useEffect(() => {
    saveLocalState('turfington_venue_offers', venueOffers);
  }, [venueOffers]);

  useEffect(() => {
    saveLocalState('turfington_cart', cart);
  }, [cart]);

  useEffect(() => {
    saveLocalState('turfington_liked_products', likedProducts);
  }, [likedProducts]);

  /* ── Navigation Handlers ───────────────────────────────────── */
  useEffect(() => {
    if (isOwner && activeTab === 'discovery') {
      setActiveTab('venue-manager');
    } else if (!isOwner && activeTab === 'venue-manager') {
      setActiveTab('landing');
    }
  }, [isOwner, activeTab]);

  useEffect(() => {
    const handleTabNav = (e) => {
      if (e.detail) {
        handleNavClick(e.detail);
      }
    };
    window.addEventListener('turfington_navigate_tab', handleTabNav);
    return () => window.removeEventListener('turfington_navigate_tab', handleTabNav);
  }, []);

  const handleNavClick = (tab) => {
    const target = isOwner && tab === 'discovery' ? 'venue-manager' : tab;
    setNavHistory((prev) => (prev[prev.length - 1] === target ? prev : [...prev, target]));
    setActiveTab(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  const handleGoBack = () => {
    if (navHistory.length > 1) {
      const nextHistory = [...navHistory];
      nextHistory.pop();
      const prevTab = nextHistory[nextHistory.length - 1] || 'landing';
      setNavHistory(nextHistory);
      setActiveTab(prevTab);
    } else {
      setActiveTab('landing');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSwitchProfileAndSync = (selectedProfile) => {
    switchProfile(selectedProfile);
    if (selectedProfile?.id) {
      apiFetchBookings(selectedProfile.id).then((userBks) => {
        setBookings(Array.isArray(userBks) ? userBks : []);
      });
      setJoinedMatches(loadLocalState(`turfington_joined_matches_${selectedProfile.id}`, []));
      setMatchRequests(loadLocalState(`turfington_match_requests_${selectedProfile.id}`, []));
    }
    const targetTab = selectedProfile?.role === 'owner' ? 'venue-manager' : 'landing';
    setNavHistory((prev) => (prev[prev.length - 1] === targetTab ? prev : [...prev, targetTab]));
    setActiveTab(targetTab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setMobileMenuOpen(false);
  };

  /* ── Match Request Action Handlers ─────────────────────────── */
  const handleRequestJoinMatch = (reqData) => {
    const userId = user?.id || 'usr_curr';
    const newReq = {
      id: 'req_' + reqData.matchId + '_' + userId,
      matchId: reqData.matchId,
      userId,
      userName: user?.full_name || user?.name || 'Current Player',
      userAvatar: user?.avatar_url || user?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200',
      status: 'pending_approval',
      acceptedRegulations: true,
      seriousnessScore: 96,
      loyaltyScore: 92,
      punctualityScore: 98,
      requestedAt: reqData.requestedAt
    };

    setMatchRequests((prev) => {
      const filtered = prev.filter((r) => !(r.matchId === reqData.matchId && r.userId === userId));
      return [...filtered, newReq];
    });

    setRegulationsTargetMatch(null);
  };

  const handleSubmitCancellation = (cData) => {
    const userId = user?.id || 'usr_curr';
    setMatchRequests((prev) =>
      prev.map((r) => {
        if (r.matchId === cData.matchId && (r.userId === userId || r.userId === 'usr_amit_patel')) {
          return {
            ...r,
            status: 'cancellation_pending',
            reasonCategory: cData.reasonCategory,
            reasonDetails: cData.reasonDetails,
            cancellationRequestedAt: cData.requestedAt
          };
        }
        return r;
      })
    );
    setCancellationTargetMatch(null);
  };

  const handleHostAcceptJoin = (req) => {
    setMatchRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: 'approved' } : r)));
    setJoinedMatches((prev) => [...new Set([...prev, req.matchId])]);
  };

  const handleHostRejectJoin = (req) => {
    setMatchRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: 'rejected' } : r)));
  };

  const handleHostApproveCancellation = (req) => {
    setMatchRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: 'cancelled' } : r)));
    setJoinedMatches((prev) => prev.filter((mId) => mId !== req.matchId));
  };

  const handleHostDeclineCancellation = (req) => {
    setMatchRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, status: 'approved' } : r)));
  };

  const navItems = NAV_ITEMS[isOwner ? 'OWNER' : 'ATHLETE'];

  /* ── Auth Screen Guard ─────────────────────────────────────── */
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center text-white">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (!user) {
    return <Auth onLogin={login} />;
  }

  if (showRoleSelect) {
    return (
      <RoleSelect
        onSelectRole={(role) => {
          updateUser({ role });
          setShowRoleSelect(false);
          setActiveTab('landing');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-white flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* ── MODULAR NAVBAR ──────────────────────────────────── */}
      <Header
        activeTab={activeTab}
        onNavClick={handleNavClick}
        onGoBack={handleGoBack}
        navItems={navItems}
        user={user}
        unreadMessageCount={unreadMessageCount}
        onOpenSupport={() => setShowSupportModal(true)}
        onOpenProfileSwitcher={() => setShowProfileSwitcher(true)}
        onLogout={logout}
        onToggleMobileMenu={() => setMobileMenuOpen(!mobileMenuOpen)}
      />

      {/* ── FULL-SCREEN MOBILE DRAWER ────────────────────────── */}
      <MobileMenu
        isOpen={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        navItems={navItems}
        activeTab={activeTab}
        onNavClick={handleNavClick}
        user={user}
        onOpenSupport={() => setShowSupportModal(true)}
        onLogout={logout}
      />

      {/* ── MAIN CONTENT AREA ────────────────────────────────── */}
      <main className="flex-grow">
        <ErrorBoundary key={activeTab + '_' + (user?.id || 'user')}>
          <Suspense
            fallback={
              <div className="min-h-screen bg-[#080808] flex items-center justify-center text-white">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
              </div>
            }
          >
            {activeTab === 'landing' && (
              <Landing
                setTab={handleNavClick}
                onGetStarted={() => handleNavClick('home')}
                setPreSelectedSport={setPreSelectedSport}
              />
            )}
            {activeTab === 'home' && (
              <Home
                setTab={handleNavClick}
                joinedMatches={joinedMatches}
                matchRequests={matchRequests}
                onRequestJoinMatch={(m) => setRegulationsTargetMatch(m)}
                onRequestCancelMatch={(m) => setCancellationTargetMatch(m)}
                onOpenHostManager={(m) => setHostReviewTargetMatch(m)}
                toggleJoinMatch={(id) =>
                  setJoinedMatches((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                  )
                }
                bookings={bookings}
                setBookings={setBookings}
                user={user}
                role={user?.role}
              />
            )}
            {activeTab === 'discovery' && !isOwner && (
              <Discovery
                joinedMatches={joinedMatches}
                matchRequests={matchRequests}
                onRequestJoinMatch={(m) => setRegulationsTargetMatch(m)}
                onRequestCancelMatch={(m) => setCancellationTargetMatch(m)}
                onOpenHostManager={(m) => setHostReviewTargetMatch(m)}
                toggleJoinMatch={(id) =>
                  setJoinedMatches((prev) =>
                    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                  )
                }
                bookings={bookings}
                setBookings={setBookings}
                user={user}
                initialSport={preSelectedSport}
                setInitialSport={setPreSelectedSport}
                venueOffers={venueOffers}
                setTab={handleNavClick}
              />
            )}
            {activeTab === 'marketplace' && (
              <Marketplace
                likedProducts={Array.isArray(likedProducts) ? likedProducts : []}
                setLikedProducts={setLikedProducts}
                user={user}
                setTab={handleNavClick}
                onContactSeller={(item) => {
                  if (!item) return;
                  const sellerNameStr = typeof item.sellerName === 'string' && item.sellerName.trim() ? item.sellerName : 'Gear Seller';
                  const sellerId = item.seller_id || item.sellerId || item.seller_uid || item.sellerUid || 'seller_' + sellerNameStr.toLowerCase().replace(/\s+/g, '_');
                  const priceStr = item.price != null ? `₹${item.price}` : '';
                  const initialMsg = `Hi ${sellerNameStr}! I am interested in buying this product: ${item.name || item.title || 'Sports Gear'}${priceStr ? ` (${priceStr})` : ''}. Is this still available?`;

                  const sellerTarget = {
                    id: sellerId,
                    firebase_uid: sellerId,
                    full_name: sellerNameStr,
                    name: sellerNameStr,
                    displayName: sellerNameStr,
                    avatar: item.sellerAvatar || item.image || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200',
                    avatarUrl: item.sellerAvatar || item.image || '',
                    role: 'player',
                    productName: item.name || item.title || 'Sports Gear',
                    productPrice: priceStr,
                    productImage: item.image || 'https://images.unsplash.com/photo-1511067007398-7e4b90cfa4bc?q=80&w=400',
                    productCondition: item.category || item.condition || 'Equipment',
                    initialMessage: initialMsg,
                    contextBanner: {
                      type: 'marketplace',
                      title: item.name || item.title || 'Sports Gear',
                      price: priceStr,
                      image: item.image || 'https://images.unsplash.com/photo-1511067007398-7e4b90cfa4bc?q=80&w=400',
                      subtitle: item.category || item.condition || 'Equipment'
                    }
                  };
                  try {
                    localStorage.setItem('turfington_target_chat_user', JSON.stringify(sellerTarget));
                    window.dispatchEvent(new CustomEvent('turfington_open_direct_chat_target', { detail: sellerTarget }));
                  } catch {}
                  handleNavClick('community');
                }}
              />
            )}
            {activeTab === 'community' && <Community user={user} setTab={handleNavClick} />}
            {activeTab === 'tournaments' && <Tournaments role={user?.role} user={user} />}
            {activeTab === 'venue-manager' && (
              <VenueManager
                user={user}
                venueOffers={venueOffers}
                setVenueOffers={setVenueOffers}
                onBackToPlayer={() => {
                  setNavHistory((prev) => (prev[prev.length - 1] === 'landing' ? prev : [...prev, 'landing']));
                  setActiveTab('landing');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            )}
            {activeTab === 'profile' && (
              <Profile
                user={user}
                role={user?.role}
                bookings={bookings}
                onLogout={logout}
                onOpenProfileSwitcher={() => setShowProfileSwitcher(true)}
                onUpdateUser={updateUser}
              />
            )}
            {activeTab === 'dashboard' && (
              <Dashboard
                user={user}
                role={user?.role}
                bookings={bookings}
                setBookings={setBookings}
                setTab={handleNavClick}
              />
            )}
          </Suspense>
        </ErrorBoundary>

        {/* ── MODALS ───────────────────────────────────────────── */}
        <ProfileSwitcherModal
          isOpen={showProfileSwitcher}
          onClose={() => setShowProfileSwitcher(false)}
          activeUser={user}
          onSelectProfile={handleSwitchProfileAndSync}
        />

        {regulationsTargetMatch && (
          <MatchRegulationsModal
            match={regulationsTargetMatch}
            user={user}
            onClose={() => setRegulationsTargetMatch(null)}
            onSubmitRequest={handleRequestJoinMatch}
          />
        )}

        {cancellationTargetMatch && (
          <MatchCancellationModal
            match={cancellationTargetMatch}
            user={user}
            onClose={() => setCancellationTargetMatch(null)}
            onSubmitCancellation={handleSubmitCancellation}
          />
        )}

        {hostReviewTargetMatch && (
          <HostMatchRequestsModal
            match={hostReviewTargetMatch}
            requests={matchRequests.filter((r) => r.matchId === hostReviewTargetMatch.id)}
            onClose={() => setHostReviewTargetMatch(null)}
            onAcceptJoin={handleHostAcceptJoin}
            onRejectJoin={handleHostRejectJoin}
            onApproveCancellation={handleHostApproveCancellation}
            onDeclineCancellation={handleHostDeclineCancellation}
          />
        )}

        <SupportModal isOpen={showSupportModal} onClose={() => setShowSupportModal(false)} />
      </main>

      {/* ── MOBILE BOTTOM TAB BAR ────────────────────────────── */}
      <MobileNav
        isOwner={isOwner}
        activeTab={activeTab}
        onNavClick={handleNavClick}
        unreadMessageCount={unreadMessageCount}
        cartCount={cart?.length || 0}
      />

      {/* ── GLOBAL FOOTER ────────────────────────────────────── */}
      <Footer onOpenSupport={() => setShowSupportModal(true)} />
    </div>
  );
}
