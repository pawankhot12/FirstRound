import { generateAIPurchaseNotification } from './gemini';

export interface PurchaseFallbackNotification {
  title: string;
  message: string;
}

export function getPurchaseFallbackNotification(
  productType: string,
  plan?: string
): PurchaseFallbackNotification {
  const normType = (productType || '').toUpperCase();
  const normPlan = (plan || '').toUpperCase();

  if (normType === 'AI_CREDIT_PACK') {
    return {
      title: 'AI Credits Added ✨',
      message: 'Your purchased AI Credits are now in your wallet. Thanks for choosing FirstRound — happy learning! 💛',
    };
  }

  if (normType === 'ASSESSMENT') {
    return {
      title: 'Assessment Unlocked 🎯',
      message: 'Your purchased assessment is now unlocked. Take the challenge, learn from every question, and keep moving forward! 🚀',
    };
  }

  if (normType === 'SUBSCRIPTION' || normType === 'PREMIUM') {
    if (normPlan === 'PRO') {
      return {
        title: 'FirstRound Pro Activated 🚀',
        message: 'Your FirstRound Pro subscription is now active. Your full FirstRound experience is ready — let\'s get started! 💙',
      };
    }
    return {
      title: 'FirstRound Plus Activated 👑',
      message: 'Your FirstRound Plus subscription is now active. Thanks for being part of FirstRound — enjoy the journey! 💛',
    };
  }

  return {
    title: 'Purchase Successful 🎉',
    message: 'Your order on FirstRound was successful. Thanks for choosing FirstRound — happy learning! 💛',
  };
}

export function buildPurchaseNotificationContext(dbInstance: any, order: any) {
  const user = order.userId ? dbInstance.getUserById(order.userId) : null;
  const userFirstName = user && user.name ? user.name.trim().split(' ')[0] : undefined;

  const normType = (order.productType || '').toUpperCase();

  if (normType === 'AI_CREDIT_PACK') {
    const quantity =
      order.metadata && typeof order.metadata.credits === 'number'
        ? order.metadata.credits
        : order.productId === 'pack_50'
        ? 50
        : order.productId === 'pack_25'
        ? 25
        : 10;
    return {
      productType: 'AI_CREDIT_PACK',
      productName: `${quantity} Deep AI Credits`,
      quantity,
      ...(userFirstName && { userFirstName }),
    };
  }

  if (normType === 'ASSESSMENT') {
    let testTitle = 'Placement Assessment';
    if (order.productId) {
      try {
        const test = typeof dbInstance.getTestById === 'function' ? dbInstance.getTestById(order.productId) : null;
        if (test && test.title) {
          testTitle = test.title;
        } else if (order.metadata && order.metadata.testTitle) {
          testTitle = order.metadata.testTitle;
        } else {
          testTitle = `${order.productId.replace(/_/g, ' ').toUpperCase()} Assessment`;
        }
      } catch (e) {}
    }
    return {
      productType: 'ASSESSMENT',
      productName: testTitle,
      ...(userFirstName && { userFirstName }),
    };
  }

  if (normType === 'SUBSCRIPTION' || normType === 'PREMIUM') {
    const plan = (order.productId || 'PLUS').toUpperCase();
    const isPro = plan === 'PRO';
    return {
      productType: 'SUBSCRIPTION',
      plan: isPro ? 'PRO' : 'PLUS',
      productName: isPro ? 'FirstRound Pro' : 'FirstRound Plus',
      ...(userFirstName && { userFirstName }),
    };
  }

  return {
    productType: normType,
    productName: order.productId || 'FirstRound Product',
    ...(userFirstName && { userFirstName }),
  };
}

export async function dispatchPurchaseAppreciationNotification(dbInstance: any, order: any): Promise<any> {
  if (!order || !order.id || !order.userId) return null;

  try {
    // 1. Check idempotency: Ensure exactly ONE notification per internal payment order
    const existingNotif = dbInstance.sqliteDb
      .prepare(`
        SELECT * FROM notifications 
        WHERE relatedEntityId = ? AND targetUserId = ? AND type = 'PAYMENT_CONFIRMATION'
      `)
      .get(order.id, order.userId);

    if (existingNotif) {
      return existingNotif;
    }

    // 2. Build trusted server-derived context ONLY
    const context = buildPurchaseNotificationContext(dbInstance, order);

    // 3. Attempt AI-generated notification (or fallback on any error/timeout)
    const notificationContent = await generateAIPurchaseNotification(context);

    // 4. Map action properties
    const normType = (order.productType || '').toUpperCase();
    let actionType = 'OPEN_PROFILE';
    let actionTestId: string | undefined = undefined;

    if (normType === 'AI_CREDIT_PACK') {
      actionType = 'OPEN_CREDITS';
    } else if (normType === 'ASSESSMENT') {
      actionType = 'OPEN_TEST';
      actionTestId = order.productId;
    } else if (normType === 'SUBSCRIPTION' || normType === 'PREMIUM') {
      actionType = 'OPEN_PROFILE';
    }

    // 5. Create canonical notification
    const created = dbInstance.createNotification({
      type: 'PAYMENT_CONFIRMATION',
      title: notificationContent.title,
      message: notificationContent.message,
      targetUserId: order.userId,
      relatedEntityId: order.id,
      priority: 'NORMAL',
      actionType,
      ...(actionTestId && { actionTestId }),
      metadata: {
        paymentOrderId: order.id,
        productType: order.productType,
        productId: order.productId,
      },
    });

    console.log(
      `[Purchase Notification] Created purchase appreciation notification for order ${order.id} (user: ${order.userId}, productType: ${order.productType})`
    );
    return created;
  } catch (err) {
    console.error('[Purchase Notification Dispatch Failed]', err);
    // Never throw — async notification errors must not fail payments
    return null;
  }
}

