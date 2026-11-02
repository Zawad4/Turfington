import React from 'react';
import {
  Home as HomeIcon,
  Compass,
  ShoppingBag,
  MessageSquare,
  Trophy,
  LayoutDashboard,
  Building2
} from 'lucide-react';

export default function MobileNav({
  isOwner,
  activeTab,
  onNavClick,
  unreadMessageCount = 0,
  cartCount = 0
}) {
  const tabs = isOwner
    ? [
        { id: 'landing', Icon: HomeIcon, label: 'Home' },
        { id: 'venue-manager', Icon: Building2, label: 'Venues' },
        { id: 'marketplace', Icon: ShoppingBag, label: 'Marketplace' },
        { id: 'community', Icon: MessageSquare, label: 'Messages' },
        { id: 'tournaments', Icon: Trophy, label: 'Tournaments' },
        { id: 'dashboard', Icon: LayoutDashboard, label: 'Bookings' }
      ]
    : [
        { id: 'landing', Icon: HomeIcon, label: 'Home' },
        { id: 'discovery', Icon: Compass, label: 'Discover' },
        { id: 'marketplace', Icon: ShoppingBag, label: 'Marketplace' },
        { id: 'community', Icon: MessageSquare, label: 'Messages' },
        { id: 'tournaments', Icon: Trophy, label: 'Tournaments' },
        { id: 'dashboard', Icon: LayoutDashboard, label: 'My Bookings' }
      ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="xl:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-1.5rem)] max-w-md bg-[#0e0e12]/92 backdrop-blur-2xl border border-white/10 rounded-full py-2 px-3 shadow-[0_12px_40px_rgba(0,0,0,0.7)] flex items-center justify-between gap-1"
    >
      {tabs.map(({ id, Icon, label }) => {
        const isActive = activeTab === id || (id === 'landing' && activeTab === 'home');
        return (
          <button
            key={id}
            type="button"
            onClick={() => onNavClick(id)}
            title={label}
            aria-label={label}
            className={`relative p-2.5 sm:p-3 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${
              isActive
                ? id === 'venue-manager'
                  ? 'bg-violet-600 text-white shadow-[0_0_16px_rgba(139,92,246,0.6)] scale-105'
                  : 'bg-indigo-600 text-white shadow-[0_0_16px_rgba(99,102,241,0.6)] scale-105'
                : 'text-neutral-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="w-5 h-5 transition-transform" />
            {id === 'community' && unreadMessageCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse border-2 border-[#0e0e12]" />
            )}
            {id === 'marketplace' && cartCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-400 border-2 border-[#0e0e12]" />
            )}
          </button>
        );
      })}
    </nav>
  );
}
