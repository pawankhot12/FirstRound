import { apiCreatePaymentOrder, apiVerifyPayment } from '../api';
import { PaymentProductType } from '../types';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export async function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (window.Razorpay) return true;

  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => {
      console.warn('Failed to load Razorpay Checkout script.');
      resolve(false);
    };
    document.body.appendChild(script);
  });
}

export interface PurchaseOptions {
  productType: PaymentProductType;
  productId: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  onSuccess: (result: { order: any; productType: PaymentProductType; productId: string }) => void;
  onError: (error: string) => void;
}

export async function startRazorpayPurchase({
  productType,
  productId,
  userId,
  userName,
  userEmail,
  onSuccess,
  onError,
}: PurchaseOptions) {
  try {
    // 1. Create order on server
    const orderData = await apiCreatePaymentOrder(productType, productId, userId);
    if (!orderData.success) {
      throw new Error('Failed to create payment order');
    }

    // 2. Load script
    const loaded = await loadRazorpayScript();

    // 3. If Razorpay Checkout library is available, launch standard popup
    if (loaded && window.Razorpay) {
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'FirstRound',
        description: orderData.productDetails?.title || 'One-Time Purchase (Test Mode)',
        order_id:
          orderData.razorpayOrderId &&
          (orderData.razorpayOrderId.startsWith('order_') ||
            orderData.razorpayOrderId.startsWith('rzp_order_') ||
            orderData.razorpayOrderId.startsWith('ord_'))
            ? orderData.razorpayOrderId
            : undefined,
        prefill: {
          name: userName || 'FirstRound Student',
          email: userEmail || 'student@firstround.test',
        },
        theme: {
          color: '#00223E',
        },
        handler: async (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await apiVerifyPayment(
              {
                orderId: orderData.orderId,
                razorpayOrderId: response.razorpay_order_id || orderData.razorpayOrderId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
              userId
            );

            // Notify UI
            window.dispatchEvent(new CustomEvent('firstround:credits-updated'));
            window.dispatchEvent(new CustomEvent('firstround:entitlement-updated'));
            window.dispatchEvent(new CustomEvent('firstround:notifications-updated'));

            onSuccess({
              order: verifyRes.order,
              productType,
              productId,
            });
          } catch (err: any) {
            onError(err.message || 'Payment verification failed');
          }
        },
        modal: {
          ondismiss: () => {
            console.log('Razorpay modal dismissed');
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        onError(response.error?.description || 'Payment was unsuccessful. Please try again.');
      });
      rzp.open();
    } else {
      // Mock / Offline Test Mode fallback if script blocked in local dev
      console.warn('Razorpay SDK not loaded, using local simulated payment for test mode');
      onError('Razorpay Checkout could not be opened. Please check your internet connection.');
    }
  } catch (err: any) {
    onError(err.message || 'Could not initiate purchase');
  }
}

export interface SubscriptionCheckoutOptions {
  userId: string;
  userName?: string;
  userEmail?: string;
  onSuccess: (result: { subscription: any }) => void;
  onError: (error: string) => void;
}

export async function startRazorpaySubscriptionCheckout({
  userId,
  userName,
  userEmail,
  onSuccess,
  onError,
}: SubscriptionCheckoutOptions) {
  try {
    const { apiCreateSubscription, apiVerifySubscription } = await import('../api');

    // 1. Create subscription on server
    const subData = await apiCreateSubscription(userId);
    if (!subData.success) {
      throw new Error('Failed to create subscription');
    }

    // 2. Load script
    const loaded = await loadRazorpayScript();

    // 3. If Razorpay Checkout library is available, launch standard subscription popup
    if (loaded && window.Razorpay) {
      const options = {
        key: subData.keyId,
        subscription_id: subData.razorpaySubscriptionId,
        name: 'FirstRound Premium',
        description: `${subData.plan.name} (₹${(subData.plan.amountPaise / 100).toFixed(0)}/mo)`,
        prefill: {
          name: userName || 'FirstRound Student',
          email: userEmail || 'student@firstround.test',
        },
        theme: {
          color: '#00223E',
        },
        handler: async (response: {
          razorpay_subscription_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await apiVerifySubscription(
              {
                subscriptionId: subData.subscriptionId,
                razorpaySubscriptionId: response.razorpay_subscription_id || subData.razorpaySubscriptionId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
              userId
            );

            // Notify UI
            window.dispatchEvent(new CustomEvent('firstround:credits-updated'));
            window.dispatchEvent(new CustomEvent('firstround:entitlement-updated'));
            window.dispatchEvent(new CustomEvent('firstround:subscription-updated'));
            window.dispatchEvent(new CustomEvent('firstround:notifications-updated'));

            onSuccess({
              subscription: verifyRes.subscription,
            });
          } catch (err: any) {
            onError(err.message || 'Subscription verification failed');
          }
        },
        modal: {
          ondismiss: () => {
            console.log('Razorpay subscription modal dismissed');
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        onError(response.error?.description || 'Subscription payment failed. Please try again.');
      });
      rzp.open();
    } else {
      onError('Razorpay Checkout could not be opened. Please check your internet connection.');
    }
  } catch (err: any) {
    onError(err.message || 'Could not initiate subscription checkout');
  }
}

export interface PremiumCheckoutOptions {
  plan: 'PLUS' | 'PRO';
  userId: string;
  userName?: string;
  userEmail?: string;
  onSuccess: (result: { subscription: any }) => void;
  onError: (error: string) => void;
  onCancel?: () => void;
}

export async function startRazorpayPremiumCheckout({
  plan,
  userId,
  userName,
  userEmail,
  onSuccess,
  onError,
  onCancel,
}: PremiumCheckoutOptions) {
  try {
    const { apiCreateSubscriptionOrder, apiVerifySubscriptionPayment } = await import('../api');

    // 1. Create subscription order via Phase 3 canonical price endpoint
    const orderData = await apiCreateSubscriptionOrder(plan, userId);
    if (!orderData.success) {
      throw new Error('Failed to create subscription payment order');
    }

    // 2. Load Razorpay checkout script
    const loaded = await loadRazorpayScript();

    // 3. Open Razorpay checkout modal
    if (loaded && window.Razorpay) {
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'FirstRound Premium',
        description: `FirstRound ${plan} Monthly Subscription (₹${(orderData.amount / 100).toFixed(0)}/mo)`,
        order_id:
          orderData.razorpayOrderId.startsWith('rzp_order_') || orderData.razorpayOrderId.startsWith('order_')
            ? orderData.razorpayOrderId
            : undefined,
        prefill: {
          name: userName || 'FirstRound Student',
          email: userEmail || 'student@firstround.test',
        },
        theme: {
          color: '#00223E',
        },
        handler: async (response: {
          razorpay_order_id?: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await apiVerifySubscriptionPayment(
              {
                orderId: orderData.orderId,
                razorpayOrderId: response.razorpay_order_id || orderData.razorpayOrderId,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
              userId
            );

            // Notify UI & Global Listeners
            window.dispatchEvent(new CustomEvent('firstround:subscription-updated'));
            window.dispatchEvent(new CustomEvent('firstround:entitlement-updated'));
            window.dispatchEvent(new CustomEvent('firstround:credits-updated'));
            window.dispatchEvent(new CustomEvent('firstround:notifications-updated'));

            onSuccess({
              subscription: verifyRes.subscription,
            });
          } catch (err: any) {
            onError(err.message || 'Subscription payment verification failed');
          }
        },
        modal: {
          ondismiss: () => {
            console.log('Razorpay Premium checkout modal dismissed');
            if (onCancel) {
              onCancel();
            } else {
              onError('Payment cancelled.');
            }
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (response: any) => {
        onError(response.error?.description || 'Subscription payment failed. Please try again.');
      });
      rzp.open();
    } else {
      onError('Razorpay Checkout could not be loaded. Please check your internet connection.');
    }
  } catch (err: any) {
    onError(err.message || 'Could not initiate Premium checkout');
  }
}
