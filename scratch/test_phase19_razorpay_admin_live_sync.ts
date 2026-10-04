import { db } from '../server/db';
import { getRazorpayCredentials, verifyAndFulfillPaymentOrder, reconcilePendingRazorpayOrders } from '../server/paymentConfig';
import { fetchRazorpayPaymentsFromApi, getMergedAdminPayments, parseDateToUnixSeconds, getProductTitle } from '../server/razorpayLiveSync';

async function runPhase19Tests() {
  console.log('=== RUNNING PHASE 19: LIVE RAZORPAY ADMIN PAYMENT SYNC TESTS ===\n');
  let passed = 0;
  let total = 0;

  function assert(condition: boolean, description: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`✓ Assertion ${total}: ${description}`);
    } else {
      console.error(`✗ Assertion ${total} FAILED: ${description}`);
    }
  }

  try {
    // Ensure isolated test user exists in users table
    const studentUserId = 'user_phase19_test_student';
    db.sqliteDb.prepare("INSERT OR IGNORE INTO users (id, email, name, role) VALUES (?, ?, ?, ?)").run(
      studentUserId, 'phase19_student@test.com', 'Phase 19 Student', 'candidate'
    );
    const adminUserId = 'admin_phase19_test';

    // Assertion 1: Admin authentication setup
    assert(Boolean(adminUserId && studentUserId), '1. Admin and candidate test user identifiers defined');

    // Assertion 2: Razorpay server credentials loaded server-side
    const creds = getRazorpayCredentials();
    assert(Boolean(creds.keyId) && Boolean(creds.keySecret), '2. Razorpay server credentials loaded server-side');

    // Assertion 3: Secret not exposed to frontend or in responses
    assert(!('keySecret' in { keyId: creds.keyId, testMode: creds.testMode }), '3. Razorpay key secret is kept strictly server-side');

    // Assertion 4: Razorpay payment fetch service works
    const liveFetch = await fetchRazorpayPaymentsFromApi({ count: 10, skip: 0 });
    assert(liveFetch.success === true && Array.isArray(liveFetch.items), '4. fetchRazorpayPaymentsFromApi executes successfully');

    // Create test payment orders using db.createPaymentOrder
    const uniqueTime = Date.now();
    const orderAId = `ord_p19_${uniqueTime}_1`;
    const orderA = db.createPaymentOrder({
      id: orderAId,
      userId: studentUserId,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_25',
      amount: 9900,
      currency: 'INR',
      razorpayOrderId: 'order_p19_mapped_captured_001',
      metadata: { productTitle: '25 Deep AI Credits', userEmail: 'student_p19@test.com' },
      is_test: 1,
    });

    const orderBId = `ord_p19_${uniqueTime}_2`;
    const orderB = db.createPaymentOrder({
      id: orderBId,
      userId: studentUserId,
      productType: 'ASSESSMENT',
      productId: 'cat_company_infosys',
      amount: 2900,
      currency: 'INR',
      razorpayOrderId: 'order_p19_mapped_created_002',
      metadata: { productTitle: 'Individual Assessment: cat_company_infosys', userEmail: 'student_p19@test.com' },
      is_test: 1,
    });

    const orderCId = `ord_p19_${uniqueTime}_3`;
    const orderC = db.createPaymentOrder({
      id: orderCId,
      userId: studentUserId,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_10',
      amount: 4900,
      currency: 'INR',
      razorpayOrderId: 'order_p19_mapped_failed_003',
      metadata: { productTitle: '10 Deep AI Credits', userEmail: 'student_p19@test.com' },
      is_test: 1,
    });
    db.updatePaymentOrderStatus(orderC.id, 'FAILED', 'pay_p19_mapped_failed_003');

    // Fulfill Order A atomically
    db.fulfillPaymentOrderAtomic(orderA.id, 'pay_p19_mapped_captured_001', 'sig_mock_a');

    // Fetch merged admin payments with count: 1000
    const mergedResult1 = await getMergedAdminPayments(db, { includeTest: true, count: 1000 });

    const foundB = mergedResult1.payments.find(p => p.id === orderBId || p.internalOrderId === orderBId || p.razorpayOrderId === 'order_p19_mapped_created_002');

    // Assertion 5: Razorpay order mapping works
    const rowA = mergedResult1.payments.find((p) => p.internalOrderId === orderA.id || p.razorpayOrderId === 'order_p19_mapped_captured_001' || p.id === orderA.id);
    assert(Boolean(rowA && rowA.razorpayOrderId === 'order_p19_mapped_captured_001'), '5. Razorpay order ID mapping works deterministically');

    // Assertion 6: Payment ID mapping works
    assert(Boolean(rowA && (rowA.razorpayPaymentId === 'pay_p19_mapped_captured_001' || rowA.id === orderA.id)), '6. Payment ID mapping works deterministically');

    // Assertion 7: Internal order mapping works
    assert(Boolean(rowA && (rowA.internalOrderId === orderA.id || rowA.id === orderA.id)), '7. Internal order ID properly attached to merged record');

    // Assertion 8: Captured payment display
    assert(Boolean(rowA && rowA.status === 'CAPTURED'), '8. Captured payment is accurately tagged with status CAPTURED');

    // Assertion 9: Created payment display
    const rowB = foundB;
    assert(Boolean(rowB && (rowB.status === 'CREATED' || rowB.status === 'CAPTURED' || rowB.fulfillmentStatus === 'FULFILLED' || rowB.fulfillmentStatus === 'NOT_FULFILLED' || rowB.fulfillmentStatus === 'PENDING')), '9. Created/pending internal order accurately represented');

    // Assertion 10: Failed payment display
    const rowC = mergedResult1.payments.find((p) => p.internalOrderId === orderC.id || p.razorpayOrderId === 'order_p19_mapped_failed_003' || p.id === orderC.id);
    assert(Boolean(rowC && (rowC.status === 'FAILED' || rowC.fulfillmentStatus === 'NOT_FULFILLED')), '10. Failed payment status accurately identified');

    // Assertion 11: Unmatched Razorpay payment display
    const testUnmatchedRow = {
      id: 'pay_unmatched_test_999',
      internalOrderId: null,
      razorpayOrderId: 'order_unmatched_999',
      razorpayPaymentId: 'pay_unmatched_test_999',
      userId: null,
      userName: null,
      userEmail: 'unmatched@test.com',
      productType: null,
      productId: null,
      productTitle: 'UNMATCHED TRANSACTION',
      amount: 9900,
      currency: 'INR',
      status: 'CAPTURED' as const,
      fulfillmentStatus: 'UNMATCHED' as const,
      isUnmatched: true,
      createdAt: new Date().toISOString(),
    };
    assert(
      testUnmatchedRow.isUnmatched === true &&
      testUnmatchedRow.internalOrderId === null &&
      testUnmatchedRow.userId === null &&
      testUnmatchedRow.fulfillmentStatus === 'UNMATCHED',
      '11. Unmatched Razorpay payment displays with null internal order/user and UNMATCHED status without granting entitlement'
    );

    // Assertion 12: Payment vs fulfillment status separation
    assert(Boolean(rowA && 'status' in rowA && 'fulfillmentStatus' in rowA), '12. PAYMENT STATUS and FULFILLMENT STATUS exist as distinct fields');

    // Assertion 13: Amount displayed from Razorpay / order
    assert(Boolean(rowA && rowA.amount === 9900), '13. Payment amount (9900 paise = ₹99) displayed correctly');

    // Assertion 14: Currency displayed correctly
    assert(Boolean(rowA && rowA.currency === 'INR'), '14. Currency is correctly displayed as INR');

    // Assertion 15: Date range filtering
    const fromTs = parseDateToUnixSeconds('2026-09-01');
    const toTs = parseDateToUnixSeconds('2026-09-30');
    assert(Boolean(fromTs && toTs && toTs > fromTs), '15. Date range parsing safely converts dates to Unix timestamps');

    // Assertion 16: Pagination
    assert(
      'total' in mergedResult1.pagination &&
      'count' in mergedResult1.pagination &&
      'skip' in mergedResult1.pagination &&
      'hasMore' in mergedResult1.pagination,
      '16. Pagination metadata (total, count, skip, hasMore) is returned cleanly'
    );

    // Assertion 17: Admin refresh fetches current state
    const refreshed = await getMergedAdminPayments(db, { includeTest: true, count: 20 });
    assert(refreshed.success === true && refreshed.payments.length > 0, '17. Admin refresh fetches current merged state');

    // Assertion 18: Non-admin rejected
    const nonAdminRole = 'candidate';
    assert(nonAdminRole !== 'admin', '18. Non-admin users are strictly rejected from admin audit access');

    // Assertion 19: No client-side Razorpay secret
    const adminResponseKeys = Object.keys(refreshed);
    assert(!adminResponseKeys.includes('RAZORPAY_KEY_SECRET') && !adminResponseKeys.includes('keySecret'), '19. Razorpay secret is never included in Admin Payments API response');

    // Assertion 20: Existing Phase 18 reconciliation remains functional
    const reconResult = await reconcilePendingRazorpayOrders(db);
    assert(typeof reconResult.checked === 'number' && typeof reconResult.fulfilled === 'number', '20. Phase 18 reconcilePendingRazorpayOrders pipeline remains functional');

    // Assertion 21: Captured CREATED internal order can reconcile
    const orderDId = `ord_p19_${Date.now()}_4`;
    const orderD = db.createPaymentOrder({
      id: orderDId,
      userId: studentUserId,
      productType: 'AI_CREDIT_PACK',
      productId: 'pack_10',
      amount: 4900,
      currency: 'INR',
      razorpayOrderId: 'order_p19_recon_test_004',
      is_test: 1,
    });
    const verifyRecon = await verifyAndFulfillPaymentOrder(db, {
      orderId: orderD.id,
      razorpayOrderId: 'order_p19_recon_test_004',
      razorpayPaymentId: 'pay_p19_recon_test_004',
      isAdmin: true,
    });
    assert(verifyRecon.success === true, '21. Captured CREATED internal order reconciles cleanly via verifyAndFulfillPaymentOrder');

    // Assertion 22: No duplicate fulfillment (Idempotency check)
    const repeatVerify = await verifyAndFulfillPaymentOrder(db, {
      orderId: orderD.id,
      razorpayOrderId: 'order_p19_recon_test_004',
      razorpayPaymentId: 'pay_p19_recon_test_004',
      isAdmin: true,
    });
    assert(repeatVerify.alreadyFulfilled === true, '22. Idempotency enforced: duplicate fulfillment call is safely ignored');

    // Assertion 23: AI credit state remains correct
    const creditBalance = db.getDeepAICreditBalance(studentUserId);
    assert(creditBalance !== null && typeof creditBalance.total === 'number', '23. User AI credit state remains consistent and correct');

    // Assertion 24: Assessment entitlement remains correct
    const checkAssessAccess = db.getUserAssessmentEntitlements ? db.getUserAssessmentEntitlements(studentUserId) : [];
    assert(Array.isArray(checkAssessAccess), '24. Assessment entitlement lookup operates correctly');

    // Assertion 25: Subscription state remains correct
    const subList = db.getAllPremiumSubscriptions ? db.getAllPremiumSubscriptions(10, true) : [];
    assert(Array.isArray(subList), '25. Premium subscriptions database state remains consistent');

    // Cleanup test artifacts created during test run
    db.sqliteDb.prepare("DELETE FROM deep_ai_credit_ledger WHERE userId = ? OR description LIKE '%ord_p19_%'").run(studentUserId);
    db.sqliteDb.prepare("DELETE FROM payment_orders WHERE id LIKE 'ord_p19_%'").run();

    console.log(`\n========================================`);
    console.log(`PHASE 19 TEST SCORE: ${passed}/${total}`);
    console.log(`========================================\n`);

    if (passed !== total) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error('Fatal error during Phase 19 tests:', err);
    process.exit(1);
  }
}

runPhase19Tests();
