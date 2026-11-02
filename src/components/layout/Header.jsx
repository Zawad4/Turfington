import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ChevronDown,
  ArrowLeftRight,
  UserCircle,
  LayoutDashboard,
  Headphones,
  LogOut,
  Menu
} from 'lucide-react';
import UserAvatar from '../UserAvatar';

export default function Header({
  activeTab,
  onNavClick,
  onGoBack,
  navItems,
  user,
  unreadMessageCount = 0,
  onOpenSupport,
  onOpenProfileSwitcher,
  onLogout,
  onToggleMobileMenu
}) {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  // Close user dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-40 w-full glass-nav">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Logo & Mobile Back Button */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          {activeTab !== 'landing' && (
            <button
              onClick={onGoBack}
              className="xl:hidden p-2 -ml-1 rounded-xl bg-white/5 border border-white/10 text-neutral-300 hover:text-white transition-colors"
              aria-label="Back"
              title="Go Back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          )}
          <div
            className="flex items-center space-x-2.5 group cursor-pointer"
            onClick={() => onNavClick('landing')}
          >
            <img
              src="/favicon.png"
              alt="Turfington Logo"
              className="w-9 h-9 rounded-xl object-cover shadow-[0_0_15px_rgba(255,255,255,0.15)] group-hover:scale-105 transition-all"
            />
            <span
              className="font-display font-black text-lg tracking-wider hidden sm:inline-block"
              style={{ color: 'inherit' }}
            >
              TURFINGTON
            </span>
          </div>
        </div>

        {/* Desktop Nav */}
        <nav className="hidden xl:flex items-center space-x-5 text-xs font-bold uppercase tracking-wider text-neutral-400">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavClick(item.id)}
              className={`relative hover:text-white transition-colors py-2 px-1 flex items-center gap-1.5 ${
                activeTab === item.id ? 'text-white' : ''
              }`}
            >
              <span>{item.label}</span>
              {item.id === 'community' && unreadMessageCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-black flex items-center justify-center animate-pulse shadow-sm">
                  {unreadMessageCount}
                </span>
              )}
              {item.badge && (
                <span className="text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 border border-violet-500/30">
                  {item.badge}
                </span>
              )}
              {activeTab === item.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-400 rounded-full" />
              )}
            </button>
          ))}
        </nav>

        {/* Right: User avatar / dropdown */}
        <div className="hidden xl:flex items-center space-x-3 flex-shrink-0" ref={userMenuRef}>
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2.5 px-3 py-2 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.07] transition-all group"
            >
              <UserAvatar user={user} className="w-7 h-7 text-xs" />
              <span className="text-xs font-bold text-white max-w-[120px] truncate">
                {user?.full_name || 'Athlete'}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-neutral-400 transition-transform ${
                  showUserMenu ? 'rotate-180' : ''
                }`}
              />
            </button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-[#111] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
                >
                  {/* User info header */}
                  <div className="px-4 py-3.5 border-b border-white/5">
                    <p className="font-bold text-white text-sm">{user?.full_name}</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5 truncate">
                      {user?.email || user?.phone || 'Turfington Member'}
                    </p>
                    {user?.role && (
                      <span
                        className={`inline-flex mt-1.5 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          user.role === 'owner'
                            ? 'bg-violet-500/10 text-violet-400 border-violet-500/20'
                            : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                        }`}
                      >
                        {user.role === 'owner' ? 'Venue Owner' : 'Player'}
                      </span>
                    )}
                  </div>

                  {/* Menu items */}
                  {[
                    {
                      icon: ArrowLeftRight,
                      label: 'Switch Profile / Account',
                      action: () => {
                        onOpenProfileSwitcher();
                        setShowUserMenu(false);
                      }
                    },
                    {
                      icon: UserCircle,
                      label: 'My Profile',
                      action: () => {
                        onNavClick('profile');
                        setShowUserMenu(false);
                      }
                    },
                    {
                      icon: LayoutDashboard,
                      label: 'Your Bookings',
                      action: () => {
                        onNavClick('dashboard');
                        setShowUserMenu(false);
                      }
                    },
                    {
                      icon: Headphones,
                      label: 'Help & Support',
                      action: () => {
                        onOpenSupport();
                        setShowUserMenu(false);
                      }
                    }
                  ].map((item) => (
                    <button
                      key={item.label}
                      onClick={item.action}
                      className="w-full flex items-center gap-3 px-4 py-3 text-xs font-medium text-neutral-300 hover:bg-white/[0.04] hover:text-white transition-colors text-left"
                    >
                      <item.icon className="w-4 h-4 text-indigo-400" />
                      {item.label}
                    </button>
                  ))}

                  <div className="border-t border-white/5">
                    <button
                      onClick={onLogout}
                      className="w-full flex items-center gap-3 px-4 py-3 text-xs font-medium text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Mobile controls: User DP Profile button + hamburger */}
        <div className="xl:hidden flex items-center space-x-2.5">
          <button
            onClick={() => onNavClick('profile')}
            className={`p-0.5 rounded-full transition-all active:scale-95 ${
              activeTab === 'profile'
                ? 'ring-2 ring-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.5)]'
                : 'ring-1 ring-white/20 hover:ring-white/50'
            }`}
            aria-label="My Profile"
            title="My Profile"
          >
            <UserAvatar user={user} className="w-8 h-8 text-xs" />
          </button>

          <button
            onClick={onToggleMobileMenu}
            className="p-2 text-neutral-400 hover:text-white transition-colors"
            aria-label="Menu"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>
      </div>
    </header>
  );
}
