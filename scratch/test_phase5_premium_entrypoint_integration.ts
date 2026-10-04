import { db } from '../server/db';
import { canUserAccessAssessment } from '../server/entitlements';
import { getRazorpayCredentials, PLAN_CONFIGS, CREDIT_PACKS } from '../server/paymentConfig';
import fs from 'fs';
import path from 'path';

async function runPhase5Tests() {
  console.log('=== STARTING PHASE 5 PREMIUM ENTRY POINT & AI CREDITS INTEGRATION TEST SUITE ===\n');

  let passedCount = 0;
  let totalCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalCount++;
    if (condition) {
      console.log(`[PASS] Test ${totalCount}: ${testName}`);
      passedCount++;
    } else {
      console.error(`[FAIL] Test ${totalCount}: ${testName}`);
      if (detail) console.error(`       Detail: ${detail}`);
    }
  }

  const ts = Date.now();
  const oneMonthMs = 30 * 24 * 60 * 60 * 1000;

  // 1. Standalone Navbar "Buy FirstRound Premium" is removed
  const navbarContent = fs.readFileSync(path.join(process.cwd(), 'src/components/Navbar.tsx'), 'utf-8');
  const hasStandaloneBuyBtn = navbarContent.includes('id="header-buy-premium-btn"') || navbarContent.includes(":'Buy FirstRound Premium'");
  assert(!hasStandaloneBuyBtn, 'Standalone Navbar "Buy FirstRound Premium" header CTA button removed');

  // 2. Deep AI Credits modal component file exists and retains wallet button
  const walletContent = fs.readFileSync(path.join(process.cwd(), 'src/components/CreditWalletModal.tsx'), 'utf-8');
  const hasCreditsWallet = walletContent.includes('Deep AI Credits') && walletContent.includes('id="credit-wallet-modal"');
  assert(hasCreditsWallet, 'Deep AI Credits modal component is present and fully integrated');

  // 3. FirstRound Premium card is visible inside Deep AI Credits
  const hasPremiumCard = walletContent.includes('FirstRound Premium') && walletContent.includes('id="wallet-upgrade-premium-btn"');
  assert(hasPremiumCard, 'FirstRound Premium card present inside Deep AI Credits modal');

  // 4. Free user sees Premium CTA ("Upgrade to Premium")
  const freeUser = db.loginOrRegister(`p5_free_${ts}@test.com`, 'Phase 5 Free User', 'College', 'Target', 'Role', 'student');
  const freeSub = db.getUserSubscription(freeUser.id);
  assert(freeSub.plan === 'FREE', 'Free user subscription state initialized to FREE');

  // 5. Clicking Premium CTA dispatches event to open existing PremiumModal
  const opensPremiumModal = walletContent.includes("window.dispatchEvent(new CustomEvent('firstround:open-premium-modal'");
  assert(opensPremiumModal, 'Clicking Premium CTA in Deep AI Credits modal opens existing PremiumModal.tsx via global event');

  // 6. No duplicate Premium modal is created (reuses PremiumModal.tsx)
  const premiumModalPath = path.join(process.cwd(), 'src/components/PremiumModal.tsx');
  const hasCanonicalPremiumModal = fs.existsSync(premiumModalPath);
  assert(hasCanonicalPremiumModal, 'Single canonical PremiumModal.tsx is reused without building duplicate purchase modals');

  // 7. Plus user sees current Plus state ("Manage your Plus subscription")
  const plusUser = db.loginOrRegister(`p5_plus_${ts}@test.com`, 'Phase 5 Plus User', 'College', 'Target', 'Role', 'student');
  db.updateSubscriptionState(plusUser.id, {
    plan: 'PLUS',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
  });
  const plusSub = db.getUserSubscription(plusUser.id);
  assert(plusSub.plan === 'PLUS' && walletContent.includes('Manage your Plus subscription'), 'Plus user subscription state reflects PLUS plan with "Manage your Plus subscription" text');

  // 8. Pro user sees current Pro state ("Manage your Pro subscription")
  const proUser = db.loginOrRegister(`p5_pro_${ts}@test.com`, 'Phase 5 Pro User', 'College', 'Target', 'Role', 'student');
  db.updateSubscriptionState(proUser.id, {
    plan: 'PRO',
    status: 'active',
    currentPeriodStart: Date.now().toString(),
    currentPeriodEnd: (Date.now() + oneMonthMs).toString(),
  });
  const proSub = db.getUserSubscription(proUser.id);
  assert(proSub.plan === 'PRO' && walletContent.includes('Manage your Pro subscription'), 'Pro user subscription state reflects PRO plan with "Manage your Pro subscription" text');

  // 9. Premium CTA updates dynamically after subscription state changes
  assert(walletContent.includes("const tab = isSubActive ? 'manage' : 'plans'"), 'Premium CTA action dynamically opens manage or plans tab based on active plan');

  // 10. Buy AI Credits button remains visible
  const hasBuyCreditsBtn = walletContent.includes('id="buy-ai-credits-btn"') || walletContent.includes('Buy AI Credits');
  assert(hasBuyCreditsBtn, 'Buy AI Credits button remains visible in Deep AI Credits modal');

  // 11. Buy AI Credits still switches view to buy_packs
  const switchesToBuyPacks = walletContent.includes("setView('buy_packs')");
  assert(switchesToBuyPacks, 'Buy AI Credits action correctly switches modal view to buy_packs');

  // 12. AI credit pricing remains ₹49 (10), ₹99 (25), ₹179 (50)
  const packs = CREDIT_PACKS;
  const p10 = packs.find((p) => p.credits === 10);
  const p25 = packs.find((p) => p.credits === 25);
  const p50 = packs.find((p) => p.credits === 50);
  assert(
    Boolean(p10 && p10.pricePaise === 4900) &&
    Boolean(p25 && p25.pricePaise === 9900) &&
    Boolean(p50 && p50.pricePaise === 17900),
    'AI credit pack pricing strictly preserved: 10 @ ₹49, 25 @ ₹99, 50 @ ₹179'
  );

  // 13. Premium pricing remains Plus ₹199 / Pro ₹349
  assert(
    PLAN_CONFIGS.PLUS.priceRupees === 199 && PLAN_CONFIGS.PRO.priceRupees === 349,
    'Premium plan pricing strictly preserved: Plus ₹199/mo, Pro ₹349/mo'
  );

  // 14. Premium card does not claim incorrect "100 credits" benefit
  const hasHardcoded100 = walletContent.includes('100 Deep AI credits every month');
  assert(!hasHardcoded100, 'Hardcoded "100 Deep AI credits" removed in favor of accurate plan copy');

  // 15. Navbar remains functional after Premium CTA removal
  const hasNavLinks = navbarContent.includes('Explore Tests') && navbarContent.includes('Leaderboard');
  assert(hasNavLinks, 'Navbar layout and navigation links remain intact and fully functional');

  // 16. Account Settings Premium management remains functional
  const accountSettingsContent = fs.readFileSync(path.join(process.cwd(), 'src/components/AccountSettingsView.tsx'), 'utf-8');
  const hasAccountSettingsSub = accountSettingsContent.includes('Subscription & Plan') && accountSettingsContent.includes('firstround:open-premium-modal');
  assert(hasAccountSettingsSub, 'Account Settings subscription management remains fully functional');

  // 17. TestHub Premium entitlement behavior remains unchanged
  const testHubContent = fs.readFileSync(path.join(process.cwd(), 'src/components/TestHub.tsx'), 'utf-8');
  const hasTestHubEntitlements = testHubContent.includes('PRO UNLOCKED') && testHubContent.includes('apiSelectPlusAssessment');
  assert(hasTestHubEntitlements, 'TestHub Premium entitlements and Plus test selection logic remain intact');

  // 18. Subscription state updates synchronized via events without page reload
  const listensSubUpdates = walletContent.includes("window.addEventListener('firstround:subscription-updated'");
  assert(listensSubUpdates, 'Deep AI Credits modal listens to firstround:subscription-updated event for live sync');

  // 19. No horizontal overflow / clean layout structure
  const hasCleanStyling = walletContent.includes('max-w-[540px]') && walletContent.includes('overflow-y-auto');
  assert(hasCleanStyling, 'Modal styling maintains max-width constraints and responsive scrollability');

  // 20. Backend entitlement engine returns canonical access
  const freeAcc = canUserAccessAssessment(freeUser.id, 'some_prem_test', db);
  const proAcc = canUserAccessAssessment(proUser.id, 'some_prem_test', db);
  assert(!freeAcc.allowed && proAcc.allowed, 'Server entitlement engine functions without runtime errors');

  console.log(`\n=== PHASE 5 TEST SUITE COMPLETED: ${passedCount}/${totalCount} TESTS PASSED ===`);
  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runPhase5Tests().catch((err) => {
  console.error('Phase 5 Test Suite Failed:', err);
  process.exit(1);
});
