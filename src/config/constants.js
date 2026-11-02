/**
 * Application Constants
 * Shared constants for sports, user roles, booking statuses, and navigation.
 */

export const SPORTS = [
  'Football',
  'Cricket',
  'Badminton',
  'Tennis',
  'Pickleball',
  'Padel',
  'Basketball',
  'Volleyball',
  'Squash'
];

export const USER_ROLES = {
  ATHLETE: 'player',
  OWNER: 'owner'
};

export const BOOKING_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED'
};

export const DEFAULT_AVATARS = {
  PLAYER: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200',
  OWNER: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200',
  VENUE: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?q=80&w=800'
};

export const NAV_ITEMS = {
  ATHLETE: [
    { id: 'landing', label: 'Home' },
    { id: 'discovery', label: 'Discover' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'community', label: 'Messages' },
    { id: 'tournaments', label: 'Tournaments' },
    { id: 'dashboard', label: 'My Bookings' },
    { id: 'profile', label: 'Profile' }
  ],
  OWNER: [
    { id: 'landing', label: 'Home' },
    { id: 'venue-manager', label: 'Venues & Bookings', badge: 'Owner' },
    { id: 'marketplace', label: 'Marketplace' },
    { id: 'community', label: 'Messages' },
    { id: 'tournaments', label: 'Tournaments' },
    { id: 'profile', label: 'Profile' }
  ]
};

