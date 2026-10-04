import crypto from 'crypto';
import { CreditPackConfig, PaymentProductType, SubscriptionPlanConfig } from '../src/types';
import { dispatchPurchaseAppreciationNotification } from './purchaseNotifications';

export const RAZORPAY_TEST_MODE = process.env.RAZORPAY_TEST_MODE !== 'false';

export const DEFAULT_ASSESSMENT_PRICE_PAISE = 2900; // ₹29.00

export const DEFAULT_PREMIUM_MONTHLY_PRICE_PAISE = parseInt(
  process.env.PREMIUM_MONTHLY_PRICE_PAISE || process.env.RAZORPAY_PREMIUM_PLAN_PRICE || '19900',
  10
); // ₹199.00

export const RAZORPAY_PREMIUM_PLAN_ID =
  process.env.RAZORPAY_PREMIUM_PLAN_ID || 'plan_firstround_premium_monthly_mock';

export const PREMIUM_PLAN_CONFIG: SubscriptionPlanConfig = {
  id: 'plan_premium_monthly',
  name: 'FirstRound Premium Monthly',
  amountPaise: DEFAULT_PREMIUM_MONTHLY_PRICE_PAISE,
  currency: 'INR',
  billingInterval: 'monthly',
  premiumCreditAllowance: 100,
};

export interface PlanDefinition {
  id: 'FREE' | 'PLUS' | 'PRO';
  name: string;
  priceRupees: number;
  pricePaise: number;
  monthlyAiCredits: number;
  premiumAccess: 'NONE' | 'SELECTED' | 'ALL';
  maxSelectedPremiumTests: number;
}

export const PLAN_CONFIGS: Record<'FREE' | 'PLUS' | 'PRO', PlanDefinition> = {
  FREE: {
    id: 'FREE',
    name: 'Free Candidate',
    priceRupees: 0,
    pricePaise: 0,
    monthlyAiCredits: 6,
    premiumAccess: 'NONE',
    maxSelectedPremiumTests: 0,
  },
  PLUS: {
    id: 'PLUS',
    name: 'FirstRound Plus',
    priceRupees: 199,
    pricePaise: 19900,
    monthlyAiCredits: 50,
    premiumAccess: 'SELECTED',
    maxSelectedPremiumTests: 2,
  },
  PRO: {
    id: 'PRO',
    name: 'FirstRound Pro',
    priceRupees: 349,
    pricePaise: 34900,
    monthlyAiCredits: 65,
    premiumAccess: 'ALL',
    maxSelectedPremiumTests: Infinity,
  },
};

export const CREDIT_PACKS: CreditPackConfig[] = [
  {
    id: 'pack_10',
    credits: 10,
    pricePaise: 4900, // ₹49.00
    title: '10 Deep AI Credits',
    badge: 'Starter',
  },
  {
    id: 'pack_25',
    credits: 25,
    pricePaise: 9900, // ₹99.00
    title: '25 Deep AI Credits',
    badge: 'Popular',
    popular: true,
  },
  {
    id: 'pack_50',
    credits: 50,
    pricePaise: 17900, // ₹179.00
    title: '50 Deep AI Credits',
    badge: 'Best Value',
  },
];

export function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_firstround_mock_key';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_mock_val';
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || 'rzp_webhook_secret_mock_val';
  const isConfigured = Boolean(
    process.env.RAZORPAY_KEY_ID &&
    process.env.RAZORPAY_KEY_SECRET
  );

  return {
    keyId,
    keySecret,
    webhookSecret,
    isConfigured,
    testMode: RAZORPAY_TEST_MODE,
  };
}

export function getProductDetails(productType: PaymentProductType, productId: string): {
  amount: number;
  currency: string;
  title: string;
  metadata: Record<string, any>;
} {
  if (productType === 'AI_CREDIT_PACK') {
    const pack = CREDIT_PACKS.find((p) => p.id === productId);
    if (!pack) {
      throw new Error(`Invalid AI credit pack: ${productId}`);
    }
    return {
      amount: pack.pricePaise,
      currency: 'INR',
      title: pack.title,
      metadata: {
        credits: pack.credits,
        packId: pack.id,
      },
    };
  }

  if (productType === 'ASSESSMENT') {
    if (!productId || typeof productId !== 'string') {
      throw new Error('Valid assessment productId is required');
    }
    return {
      amount: DEFAULT_ASSESSMENT_PRICE_PAISE,
      currency: 'INR',
      title: `Individual Assessment: ${productId}`,
      metadata: {
        assessmentId: productId,
      },
    };
  }

  if (productType === 'SUBSCRIPTION') {
    const planKey = (productId || 'PLUS').toUpperCase() as keyof typeof PLAN_CONFIGS;
    const planConfig = PLAN_CONFIGS[planKey] || PLAN_CONFIGS.PLUS;
    return {
      amount: planConfig.amountPaisa,
      currency: 'INR',
      title: `${planConfig.name} Subscription`,
      metadata: {
        plan: planConfig.id,
      },
    };
  }

  throw new Error(`Unsupported product type: ${productType}`);
}

export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret?: string
): boolean {
  if (!orderId || !paymentId || !signature) return false;
  const keySecret = secret || getRazorpayCredentials().keySecret;
  try {
    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const sigBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch (err) {
    console.error('[Razorpay Signature Error]', err);
    return false;
  }
}

export function verifyRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signature: string,
  secret?: string
): boolean {
  if (!rawBody || !signature) return false;
  const webhookSecret = secret || getRazorpayCredentials().webhookSecret;
  try {
    const expected = crypto
      .createHmac('sha256', webhookSecret)
      .update(rawBody)
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const sigBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch (err) {
    console.error('[Razorpay Webhook Signature Error]', err);
    return false;
  }
}

export function verifyRazorpaySubscriptionSignature(
  subscriptionId: string,
  paymentId: string,
  signature: string,
  secret?: string
): boolean {
  if (!subscriptionId || !paymentId || !signature) return false;
  const keySecret = secret || getRazorpayCredentials().keySecret;
  try {
    // Razorpay subscription signature format: paymentId + '|' + subscriptionId
    const expected = crypto
      .createHmac('sha256', keySecret)
      .update(`${paymentId}|${subscriptionId}`)
      .digest('hex');
    const expectedBuf = Buffer.from(expected, 'utf8');
    const sigBuf = Buffer.from(signature, 'utf8');
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  } catch (err) {
    console.error('[Razorpay Subscription Signature Error]', err);
    return false;
  }
}

export async function verifyRazorpayOrderWithApi(razorpayOrderId: string): Promise<{
  verified: boolean;
  paymentId?: string;
  amount?: number;
  currency?: string;
  status?: string;
  rawPayment?: any;
  error?: string;
}> {
  if (!razorpayOrderId) {
    return { verified: false, error: 'Razorpay order ID is required' };
  }
  const { keyId, keySecret, isConfigured } = getRazorpayCredentials();
  if (!isConfigured || keyId.startsWith('rzp_test_firstround_mock')) {
    return { verified: false, error: 'Razorpay API credentials not configured or mock mode' };
  }
  try {
    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const response = await fetch(`https://api.razorpay.com/v1/orders/${razorpayOrderId}/payments`, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      return { verified: false, error: `Razorpay API returned status ${response.status}` };
    }
    const data: any = await response.json();
    const payments = data.items || [];
    const capturedPayment = payments.find((p: any) => p.status === 'captured' || p.captured === true);
    if (capturedPayment) {
      return {
        verified: true,
        paymentId: capturedPayment.id,
        amount: capturedPayment.amount,
        currency: capturedPayment.currency,
        status: capturedPayment.status,
        rawPayment: capturedPayment,
      };
    }
    return { verified: false, error: 'No captured payment found for this order on Razorpay' };
  } catch (err: any) {
    return { verified: false, error: err.message };
  }
}

export interface VerifyPaymentPipelineOptions {
  orderId?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  authenticatedUserId?: string;
  isAdmin?: boolean;
  isWebhook?: boolean;
}

export async function verifyAndFulfillPaymentOrder(
  dbInstance: any,
  options: VerifyPaymentPipelineOptions
): Promise<{
  success: boolean;
  status: number;
  alreadyFulfilled?: boolean;
  order?: any;
  error?: string;
  message?: string;
}> {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, authenticatedUserId, isAdmin, isWebhook } = options;

  let order: any = null;
  if (orderId) {
    order = dbInstance.getPaymentOrderById(orderId);
  }
  if (!order && razorpayOrderId) {
    order = dbInstance.getPaymentOrderByRazorpayOrderId(razorpayOrderId);
  }
  if (!order) {
    return { success: false, status: 404, error: 'Payment order not found' };
  }

  // Ownership verification
  if (!isWebhook && !isAdmin && authenticatedUserId) {
    if (order.userId !== authenticatedUserId) {
      return { success: false, status: 403, error: 'Forbidden: Payment order does not belong to authenticated user' };
    }
  }

  // Idempotency check: Already CAPTURED / PAID
  if (order.status === 'CAPTURED' || order.status === 'PAID') {
    setImmediate(() => {
      dispatchPurchaseAppreciationNotification(dbInstance, order).catch((err) => {
        console.error('[Purchase Appreciation Recovery Notification Error]', err);
      });
    });
    return {
      success: true,
      status: 200,
      alreadyFulfilled: true,
      order,
      message: 'Payment order was already fulfilled',
    };
  }


  // Validation of currency
  if (order.currency && order.currency !== 'INR') {
    return { success: false, status: 400, error: 'Unsupported payment currency' };
  }

  // Product validation
  try {
    getProductDetails(order.productType, order.productId);
  } catch (err: any) {
    return { success: false, status: 400, error: err.message || 'Invalid product details' };
  }

  let verifiedPaymentId: string | null = razorpayPaymentId || null;
  let isVerified = false;

  // Path 1: Client / Webhook HMAC signature verification
  if (razorpayPaymentId && razorpaySignature) {
    const rzpOrdId = order.razorpayOrderId || razorpayOrderId || order.id;
    let sigValid = verifyRazorpayPaymentSignature(rzpOrdId, razorpayPaymentId, razorpaySignature);
    if (!sigValid && order.productType === 'SUBSCRIPTION') {
      sigValid = verifyRazorpaySubscriptionSignature(order.razorpayOrderId || rzpOrdId, razorpayPaymentId, razorpaySignature);
    }
    if (sigValid) {
      isVerified = true;
      verifiedPaymentId = razorpayPaymentId;
    }
  }

  // Path 2: Webhook signature pre-verified by endpoint
  if (!isVerified && isWebhook && razorpayPaymentId) {
    isVerified = true;
    verifiedPaymentId = razorpayPaymentId;
  }

  // Path 3: Razorpay Server-Side API direct query verification
  if (!isVerified && order.razorpayOrderId) {
    const apiCheck = await verifyRazorpayOrderWithApi(order.razorpayOrderId);
    if (apiCheck.verified && apiCheck.paymentId) {
      // Verify amount
      if (apiCheck.amount && apiCheck.amount !== order.amount) {
        return { success: false, status: 400, error: 'Payment amount mismatch on Razorpay' };
      }
      isVerified = true;
      verifiedPaymentId = apiCheck.paymentId;
    }
  }

  // Path 4: Test Mode / Mock Fallback (ONLY when mock credentials are in use)
  if (!isVerified && RAZORPAY_TEST_MODE) {
    const { keyId } = getRazorpayCredentials();
    if (keyId.startsWith('rzp_test_firstround_mock') && !razorpaySignature) {
      isVerified = true;
      verifiedPaymentId = razorpayPaymentId || `pay_mock_${Date.now()}`;
    }
  }

  if (!isVerified) {
    if (razorpayPaymentId) {
      dbInstance.updatePaymentOrderStatus(order.id, 'FAILED', razorpayPaymentId, razorpaySignature);
    }
    return { success: false, status: 400, error: 'Payment signature or status verification failed' };
  }

  // Execute atomic fulfillment
  const result = dbInstance.fulfillPaymentOrderAtomic(order.id, verifiedPaymentId, razorpaySignature);

  if (result.success && result.order) {
    setImmediate(() => {
      dispatchPurchaseAppreciationNotification(dbInstance, result.order).catch((err) => {
        console.error('[Purchase Appreciation Notification Error]', err);
      });
    });
  }

  return {
    success: true,
    status: 200,
    alreadyFulfilled: result.alreadyFulfilled,
    order: result.order,
  };
}

export interface ReconcileOptions {
  maxWindowMinutes?: number;
}

export async function reconcilePendingRazorpayOrders(
  dbInstance: any,
  userId?: string,
  options?: ReconcileOptions
): Promise<{
  checked: number;
  fulfilled: number;
  failed: number;
  orders: any[];
}> {
  let pendingOrders: any[] = [];
  if (userId) {
    pendingOrders = typeof dbInstance.getPendingPaymentOrdersForUser === 'function'
      ? dbInstance.getPendingPaymentOrdersForUser(userId)
      : [];
  } else if (typeof dbInstance.getAllPendingPaymentOrders === 'function') {
    pendingOrders = dbInstance.getAllPendingPaymentOrders(100);
  }

  // Filter window if specified (default 24 hours = 1440 minutes)
  const maxWindowMs = (options?.maxWindowMinutes || 1440) * 60 * 1000;
  const now = Date.now();

  if (maxWindowMs > 0) {
    pendingOrders = pendingOrders.filter((order) => {
      if (!order.createdAt) return true;
      const createdMs = new Date(order.createdAt).getTime();
      if (isNaN(createdMs)) return true;
      return (now - createdMs) <= maxWindowMs;
    });
  }

  let checked = 0;
  let fulfilled = 0;
  let failed = 0;
  const fulfilledOrders: any[] = [];

  for (const pendingOrder of pendingOrders) {
    if (!pendingOrder.razorpayOrderId) continue;
    checked++;
    try {
      const result = await verifyAndFulfillPaymentOrder(dbInstance, {
        orderId: pendingOrder.id,
        authenticatedUserId: pendingOrder.userId,
        isAdmin: true,
      });

      if (result.success && result.order) {
        fulfilled++;
        fulfilledOrders.push(result.order);
      } else if (!result.success && result.error && !result.error.includes('No captured payment')) {
        failed++;
      }
    } catch (err) {
      console.error(`[Reconciliation Error] Order ${pendingOrder.id}:`, err);
      failed++;
    }
  }

  return {
    checked,
    fulfilled,
    failed,
    orders: fulfilledOrders,
  };
}




