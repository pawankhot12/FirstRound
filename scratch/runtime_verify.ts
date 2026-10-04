async function verify() {
  const BASE = 'http://localhost:3000';
  
  console.log('=== RUNTIME VERIFICATION ===');
  
  try {
    const r1 = await fetch(BASE + '/api/admin/stats');
    console.log('[1] Admin stats:', r1.status, r1.status === 200 ? 'OK' : 'FAIL');
  } catch(e: any) { console.log('[1] Admin stats: FAIL', e.message); }
  
  try {
    const r2 = await fetch(BASE + '/api/admin/payment-orders');
    const data2 = await r2.json();
    console.log('[2] Payment orders:', r2.status, 'count:', Array.isArray(data2) ? data2.length : (data2 && data2.orders ? data2.orders.length : JSON.stringify(data2).substring(0, 100)));
  } catch(e: any) { console.log('[2] Payment orders: FAIL', e.message); }
  
  try {
    const r3 = await fetch(BASE + '/api/admin/premium-subscriptions');
    const data3 = await r3.json();
    console.log('[3] Subscriptions:', r3.status, 'count:', Array.isArray(data3) ? data3.length : (data3 && data3.subscriptions ? data3.subscriptions.length : JSON.stringify(data3).substring(0, 100)));
  } catch(e: any) { console.log('[3] Subscriptions: FAIL', e.message); }
  
  for (const uid of ['user_superadmin_pawankhot', 'user_student_pawankhot127']) {
    try {
      const r4 = await fetch(BASE + '/api/ai/credits?userId=' + uid);
      const data4 = await r4.json();
      console.log('[4] Wallet ' + uid + ':', r4.status, JSON.stringify(data4));
    } catch(e: any) { console.log('[4] Wallet ' + uid + ': FAIL', e.message); }
  }
  
  for (const uid of ['user_superadmin_pawankhot', 'user_student_pawankhot127']) {
    try {
      const r5 = await fetch(BASE + '/api/subscription/status?userId=' + uid);
      const data5 = await r5.json();
      console.log('[5] Sub status ' + uid + ':', r5.status, 'plan:', data5.plan, 'status:', data5.subscriptionStatus);
    } catch(e: any) { console.log('[5] Sub status ' + uid + ': FAIL', e.message); }
  }
  
  try {
    const r6 = await fetch(BASE + '/api/tests');
    console.log('[6] Tests API:', r6.status, r6.status === 200 ? 'OK' : 'FAIL');
  } catch(e: any) { console.log('[6] Tests API: FAIL', e.message); }
  
  // Check frontend loads (no white screen)
  try {
    const r7 = await fetch(BASE + '/');
    const html = await r7.text();
    const hasRoot = html.includes('id="root"');
    const hasScript = html.includes('<script');
    console.log('[7] Frontend:', r7.status, hasRoot ? 'has root div' : 'NO root', hasScript ? 'has script' : 'NO script');
  } catch(e: any) { console.log('[7] Frontend: FAIL', e.message); }
  
  console.log('\n=== RUNTIME VERIFICATION COMPLETE ===');
  process.exit(0);
}
verify();
