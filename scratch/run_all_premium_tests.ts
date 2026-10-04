import { execSync } from 'child_process';

const testSuites = [
  'scratch/test_phase1_subscription_foundation.ts',
  'scratch/test_phase2_entitlements_and_plus_selection.ts',
  'scratch/test_phase3_subscription_payment.ts',
  'scratch/test_phase4_subscription_ui_lifecycle.ts',
  'scratch/test_phase5_premium_entrypoint_integration.ts',
  'scratch/test_phase6_subscription_lifecycle.ts',
  'scratch/test_phase7_premium_checkout_hardening.ts',
  'scratch/test_phase8_wallet_navigation_and_performance.ts',
  'scratch/test_phase9_security_launch_hardening.ts',
  'scratch/test_phase11_razorpay_test_mode.ts',
  'scratch/test_phase13_universal_subscription_hardening.ts',
];

console.log('=== RUNNING ALL PREMIUM REGRESSION & RAZORPAY TEST SUITES ===\n');

let totalPassed = 0;

for (const suite of testSuites) {
  console.log(`Running ${suite}...`);
  try {
    const output = execSync(`npx tsx ${suite}`, { encoding: 'utf-8' });
    console.log(output);
  } catch (err: any) {
    console.error(`[FAIL] Test suite failed: ${suite}`);
    if (err.stdout) console.log(err.stdout);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }
}

console.log('\nALL 11 PREMIUM REGRESSION & RAZORPAY TEST SUITES PASSED CLEANLY! ✅');
