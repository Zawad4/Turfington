import { apiCreateBooking } from './db';

/**
 * Direct Instant Payment & Booking Flow
 * (Razorpay integration completely removed per user configuration)
 */

export function loadRazorpayScript() {
  // Razorpay completely removed - returns true immediately
  return Promise.resolve(true);
}

/**
 * Direct Booking & Payment Confirmation
 * Automatically confirms booking without third-party payment gateway modal.
 */
export async function openRazorpayCheckout({
  amount = 1000,
  title = 'Turf Booking',
  description = 'Confirmed Reservation',
  user = null,
  venue = null,
  onSuccess = () => {},
  onFailure = () => {}
}) {
  try {
    const amountNum = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^\d.]/g, '')) || 1000;
    const directPaymentId = `pay_direct_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const directOrderId = `ord_direct_${Date.now()}`;

    const bookingRecord = {
      id: 'bk_' + Date.now(),
      user_id: user?.id || user?.uid || 'usr_me',
      venue_id: venue?.id || 'v_default',
      title: title,
      sport: venue?.sport || 'Sports',
      time: venue?.time || 'Today, Flexible Slot',
      price: `₹${amountNum.toLocaleString('en-IN')}`,
      amount_paid: amountNum,
      payment_method: 'Direct Instant Booking',
      payment_id: directPaymentId,
      order_id: directOrderId,
      status: 'PENDING OWNER APPROVAL',
      created_at: new Date().toISOString()
    };

    await apiCreateBooking(bookingRecord);

    if (typeof onSuccess === 'function') {
      onSuccess({
        success: true,
        response: {
          razorpay_payment_id: directPaymentId,
          razorpay_order_id: directOrderId
        },
        booking: bookingRecord,
        verified: true
      });
    }
  } catch (err) {
    console.error('[Instant Booking Exception]', err);
    if (typeof onFailure === 'function') {
      onFailure({ error: err.message });
    }
  }
}
