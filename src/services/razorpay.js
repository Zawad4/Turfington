import { apiCreateBooking } from './db';
import { ENV } from '../config/env';

const RAZORPAY_KEY_ID = ENV.RAZORPAY_KEY_ID || 'rzp_test_TWTmM3CwfnUSnT';

/**
 * Helper to determine API Base URL
 */
const getApiBaseUrl = () => {
  return ENV.API_BASE_URL || (typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:5000' : '');
};

/**
 * Load the Razorpay Checkout SDK dynamically.
 */
export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Trigger Razorpay Payment Gateway flow:
 * 1. Request Razorpay Order ID from backend (/api/payments/create-order)
 * 2. Launch Razorpay Checkout Modal with server order_id
 * 3. Send payment_id, order_id, signature to backend (/api/payments/verify) for HMAC verification
 * 4. Only confirm booking after backend verifies signature
 */
export async function openRazorpayCheckout({
  amount = 1000,
  title = 'Turf Booking',
  description = 'Prepaid Turf Reservation',
  user = null,
  venue = null,
  onSuccess = () => {},
  onFailure = () => {}
}) {
  try {
    // 1. Ensure Razorpay Checkout SDK is loaded
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      alert('Failed to load Razorpay payment SDK. Please check your internet connection.');
      onFailure({ error: 'SDK Load Error' });
      return;
    }

    const amountNum = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^\d.]/g, '')) || 1000;

    // 2. Call Backend API to Create Razorpay Order
    console.log('[Razorpay Checkout] Creating order on server...');
    const apiBase = getApiBaseUrl();
    let orderRes;

    try {
      const response = await fetch(`${apiBase}/api/payments/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amountNum,
          currency: 'INR',
          venue_id: venue?.id || 'v_default',
          user_id: user?.id || 'usr_guest',
          title: title
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${response.status}`);
      }

      orderRes = await response.json();
    } catch (orderErr) {
      console.warn('[Razorpay Checkout] Server order creation unavailable, using test fallback:', orderErr.message);
      // Fallback for isolated frontend offline testing
      orderRes = {
        id: `order_test_${Date.now()}`,
        amount: Math.round(amountNum * 100),
        currency: 'INR',
        key: RAZORPAY_KEY_ID
      };
    }

    if (!orderRes || (!orderRes.id && !orderRes.order_id)) {
      console.error('[Razorpay Checkout Error] Failed to obtain order_id from server:', orderRes);
      alert('Could not start payment order. Please try again.');
      onFailure({ error: 'Order Creation Failed' });
      return;
    }

    const orderId = orderRes.id || orderRes.order_id;
    const keyId = orderRes.key || RAZORPAY_KEY_ID;

    console.log(`[Razorpay Checkout] Order created: ${orderId}. Launching Checkout modal...`);

    // 3. Configure Razorpay Options
    const options = {
      key: keyId,
      amount: orderRes.amount || Math.round(amountNum * 100),
      currency: orderRes.currency || 'INR',
      name: 'Turfington Sports',
      description: `${title} - ${description}`,
      order_id: orderId,
      image: '/favicon.png',
      prefill: {
        name: user?.full_name || 'Player',
        email: user?.email || 'player@turfington.com',
        contact: user?.phone || '9876543210'
      },
      notes: {
        venue_id: venue?.id || 'v_default',
        user_id: user?.id || 'usr_guest',
        booking_title: title
      },
      theme: {
        color: '#6366f1' // Indigo brand theme
      },
      handler: async function (response) {
        console.log('[Razorpay Checkout Callback] Received payment response:', response);

        const verifyPayload = {
          razorpay_order_id: response.razorpay_order_id || orderId,
          razorpay_payment_id: response.razorpay_payment_id,
          razorpay_signature: response.razorpay_signature,
          booking_info: {
            user_id: user?.id || 'usr_me',
            venue_id: venue?.id || 'v_default',
            title: title,
            sport: venue?.sport || 'Sports',
            time: venue?.time || 'Today, Flexible Slot',
            price: `₹${amountNum.toLocaleString('en-IN')}`
          }
        };

        // 4. Send payment result to server for HMAC signature verification
        console.log('[Razorpay Checkout] Verifying payment signature on server...');
        try {
          const verifyResponse = await fetch(`${apiBase}/api/payments/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(verifyPayload)
          });

          const verifyData = await verifyResponse.json();

          if (!verifyResponse.ok || !verifyData.success) {
            console.error('[Razorpay Signature Verification Failed]', verifyData);
            alert(`Payment verification failed: ${verifyData.error || 'Invalid signature'}`);
            onFailure({ error: 'Signature Verification Failed', details: verifyData });
            return;
          }

          console.log('[Razorpay Signature Verification Success]', verifyData);

          const bookingRecord = verifyData.booking || {
            id: 'bk_' + Date.now(),
            user_id: user?.id || 'usr_me',
            venue_id: venue?.id || 'v_default',
            title: title,
            sport: venue?.sport || 'Sports',
            time: venue?.time || 'Today, Flexible Slot',
            price: `₹${amountNum.toLocaleString('en-IN')}`,
            amount_paid: amountNum,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id || orderId,
            status: 'PENDING OWNER APPROVAL',
            created_at: new Date().toISOString()
          };

          // Save local backup
          await apiCreateBooking(bookingRecord);

          if (onSuccess) {
            onSuccess({
              response,
              booking: bookingRecord,
              verified: true
            });
          }
        } catch (verifyErr) {
          console.error('[Razorpay Verify Request Exception]', verifyErr);
          alert('Payment was recorded but verification endpoint returned an error. Contact support.');
          onFailure({ error: verifyErr.message });
        }
      },
      modal: {
        ondismiss: function () {
          console.log('[Razorpay Checkout] Modal closed by user');
          if (onFailure) {
            onFailure({ error: 'Payment Modal Closed by User' });
          }
        }
      }
    };

    // 5. Open Razorpay Checkout Gateway
    const razorpayInstance = new window.Razorpay(options);
    razorpayInstance.open();

  } catch (err) {
    console.error('[openRazorpayCheckout Exception]', err);
    alert('Payment could not be started. Please try again.');
    onFailure({ error: err.message });
  }
}
