/**
 * Formatting Utilities
 */

/**
 * Formats a number or string amount into Indian Rupee currency (₹).
 */
export function formatCurrency(amount) {
  if (amount === undefined || amount === null) return '₹0';
  const num = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^0-9.-]+/g, ''));
  if (isNaN(num)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(num);
}

/**
 * Formats an ISO string or date into a readable date string.
 */
export function formatDate(dateInput, options = {}) {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return String(dateInput);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...options
  });
}

/**
 * Returns initials from a full name (e.g. "Zawad Adnan" -> "ZA").
 */
export function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Truncates text with an ellipsis if it exceeds maxLength.
 */
export function truncateText(text, maxLength = 100) {
  if (!text || typeof text !== 'string') return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Formats a 24-hour time or time range string into a clean 12-hour AM/PM format.
 * Examples:
 *   "06:00" -> "6:00 AM"
 *   "14:00" -> "2:00 PM"
 *   "00:00" -> "12:00 AM"
 *   "18:00 - 19:00" -> "6:00 PM – 7:00 PM"
 *   "6:00 PM - 7:00 PM" -> "6:00 PM – 7:00 PM"
 */
export function formatTime12Hour(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return timeStr || '';

  // Converts any 24h time occurrence (e.g. 14:00, 06:00, 00:00, 18:00 - 19:00, Today, 18:00) into 12h AM/PM
  return timeStr.replace(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?(?!\s*[AP]M)\b/gi, (match, h, m) => {
    let hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${m} ${ampm}`;
  });
}

/**
 * Determines if a turf slot match has completed.
 * Rule:
 * 1. Cancelled or rejected bookings are NEVER completed (count -1).
 * 2. Bookings in the past days are completed.
 * 3. Bookings in future days are not yet completed.
 * 4. For bookings today, they are ONLY completed after the slot end time has passed
 *    (e.g., booked for 4pm to 5pm -> only after 5:00 PM does it count +1).
 */
export function isSlotMatchCompleted(booking, now = new Date()) {
  if (!booking) return false;
  const status = String(booking.status || '').toLowerCase();
  if (status.includes('cancel') || status.includes('reject')) return false;

  const rawDate = String(booking.date || '').trim();
  const rawTime = String(booking.time || booking.slot_time || '').trim();

  let targetYear = now.getFullYear();
  let targetMonth = now.getMonth();
  let targetDay = now.getDate();

  const lowerDate = rawDate.toLowerCase();
  if (lowerDate.includes('today')) {
    // is today
  } else if (lowerDate.includes('yesterday')) {
    return true;
  } else if (lowerDate.includes('tomorrow')) {
    return false;
  } else if (rawDate) {
    const cleanDateStr = rawDate.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\s*/i, '');
    let parsedDate = new Date(cleanDateStr);
    if (isNaN(parsedDate.getTime())) {
      parsedDate = new Date(`${cleanDateStr} ${targetYear}`);
    }

    if (!isNaN(parsedDate.getTime())) {
      targetYear = parsedDate.getFullYear();
      targetMonth = parsedDate.getMonth();
      targetDay = parsedDate.getDate();

      const bookingDayStart = new Date(targetYear, targetMonth, targetDay, 0, 0, 0);
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

      if (bookingDayStart.getTime() < todayStart.getTime()) return true;
      if (bookingDayStart.getTime() > todayStart.getTime()) return false;
    }
  }

  // End time parsing (e.g. "4:00 PM - 5:00 PM", "4pm to 5pm", "16:00 - 17:00", "16:00")
  const rangeParts = rawTime.split(/[-–]|(?:\s+to\s+)/i);
  let endTimeStr = '';
  const isRange = rangeParts.length >= 2;
  if (isRange) {
    endTimeStr = rangeParts[rangeParts.length - 1].trim();
  } else {
    endTimeStr = rangeParts[0].trim();
  }

  let endHour = 0;
  let endMinute = 0;
  let hasValidEndTime = false;

  const match12 = endTimeStr.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2] ? parseInt(match12[2], 10) : 0;
    const isPm = match12[3].toLowerCase() === 'pm';
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
    if (!isRange) h += 1; // standard turf booking duration is 1 hour
    endHour = h;
    endMinute = m;
    hasValidEndTime = true;
  } else {
    const match24 = endTimeStr.match(/\b([01]?\d|2[0-3])(?::([0-5]\d))?\b/);
    if (match24) {
      let h = parseInt(match24[1], 10);
      const m = match24[2] ? parseInt(match24[2], 10) : 0;
      if (!isRange) h += 1;
      endHour = h;
      endMinute = m;
      hasValidEndTime = true;
    }
  }

  if (hasValidEndTime) {
    const slotEndDateTime = new Date(targetYear, targetMonth, targetDay, endHour, endMinute, 0);
    return now.getTime() >= slotEndDateTime.getTime();
  }

  // If time could not be parsed, check created_at: if older than 1 hour ago
  if (booking.created_at || booking.createdAt) {
    const c = new Date(booking.created_at || booking.createdAt);
    return !isNaN(c.getTime()) && (now.getTime() - c.getTime() > 3600 * 1000);
  }

  return false;
}

/**
 * Calculates completed matches from a list of user bookings.
 */
export function calculateCompletedMatches(bookings, now = new Date()) {
  if (!Array.isArray(bookings)) return 0;
  return bookings.filter(b => isSlotMatchCompleted(b, now)).length;
}



/**
 * Strictly checks whether a booking belongs to a given user.
 * Matches across user id, uid, firebase_uid, and email.
 */
export function isUserBookingStrict(booking, user) {
  if (!booking || !user) return false;
  const userKeys = [user.id, user.uid, user.firebase_uid, user.email]
    .filter(Boolean)
    .map(k => String(k).toLowerCase().trim());
  if (userKeys.length === 0) return false;

  const bookingKeys = [
    booking.user_id,
    booking.userId,
    booking.userUid,
    booking.user_uid,
    booking.user_email,
    booking.userEmail,
    booking.email,
    booking.player_id,
    booking.playerId
  ]
    .filter(Boolean)
    .map(k => String(k).toLowerCase().trim());

  return userKeys.some(k => bookingKeys.includes(k));
}
