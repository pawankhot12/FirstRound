const assert = require('assert');
const http = require('http');
const { execSync } = require('child_process');

const BASE_URL = 'http://localhost:3000';

function makeRequest(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const reqOpts = {
      method: options.method || 'GET',
      headers: options.headers || {},
    };

    const req = http.request(url, reqOpts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n============================================================');
  console.log('RUNNING PHASE H.1 — ADVERTISEMENT RUNTIME INTEGRATION SUITE');
  console.log('============================================================\n');

  let passed = 0;
  let total = 0;

  async function asyncTest(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✓ [PASS ${total}] ${name}`);
      passed++;
    } catch (e) {
      console.error(`✗ [FAIL ${total}] ${name}:`, e.message);
    }
  }

  const ADMIN_HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer mock_admin_token',
    'x-requested-with': 'XMLHttpRequest',
  };

  const STUDENT_HEADERS = {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer mock_student_token',
    'x-requested-with': 'XMLHttpRequest',
  };

  let testAdId1 = null;
  let testAdId2 = null;
  let expiredAdId = null;
  let futureAdId = null;

  let baseDashAdId = null;
  let baseLandingAdId = null;

  // 1. Production active ad created from admin appears on public Dashboard endpoint
  await asyncTest('1. GET /api/advertisements/active returns active DASHBOARD_SIDEBAR ad', async () => {
    let res = await makeRequest('/api/advertisements/active?placement=DASHBOARD_SIDEBAR');
    if (!res.data || !res.data.advertisement) {
      const createRes = await makeRequest('/api/admin/advertisements', { method: 'POST', headers: ADMIN_HEADERS }, {
        sponsorName: 'FirstRound Apptitude',
        title: 'Learn about how mocks work',
        destinationUrl: 'https://firstround.ai',
        placement: 'DASHBOARD_SIDEBAR',
        status: 'ACTIVE',
        priority: 10,
        is_test: 0,
      });
      baseDashAdId = createRes.data?.advertisement?.id;
      res = await makeRequest('/api/advertisements/active?placement=DASHBOARD_SIDEBAR');
    }
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(res.data.advertisement);
    assert(res.data.advertisement.placement.includes('DASHBOARD_SIDEBAR'));
    assert.strictEqual(res.data.advertisement.status, 'ACTIVE');
    assert.strictEqual(res.data.advertisement.is_test || 0, 0);
  });

  // 2. GET /api/advertisements/active returns active LANDING_TOP ad
  await asyncTest('2. GET /api/advertisements/active returns active LANDING_TOP ad', async () => {
    let res = await makeRequest('/api/advertisements/active?placement=LANDING_TOP');
    if (!res.data || !res.data.advertisement) {
      const createRes = await makeRequest('/api/admin/advertisements', { method: 'POST', headers: ADMIN_HEADERS }, {
        sponsorName: 'Landing Sponsor',
        title: 'Top Landing Sponsor Banner',
        destinationUrl: 'https://firstround.ai',
        placement: 'LANDING_TOP',
        status: 'ACTIVE',
        priority: 10,
        is_test: 0,
      });
      baseLandingAdId = createRes.data?.advertisement?.id;
      res = await makeRequest('/api/advertisements/active?placement=LANDING_TOP');
    }
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.success, true);
    assert(res.data.advertisement);
    assert(res.data.advertisement.placement.includes('LANDING_TOP'));
    assert.strictEqual(res.data.advertisement.status, 'ACTIVE');
  });

  // 3. Student cannot mutate advertisement
  await asyncTest('3. Student mutation rejected with 403 Forbidden', async () => {
    const res = await makeRequest('/api/admin/advertisements', {
      method: 'POST',
      headers: STUDENT_HEADERS,
    }, {
      sponsorName: 'Hacker',
      title: 'Hacker Ad',
      destinationUrl: 'https://hacker.com',
    });
    assert.strictEqual(res.status, 403);
  });

  // 4. Test ad (is_test = 1) is excluded from production active query
  await asyncTest('4. Test ad (is_test = 1) excluded from production active query', async () => {
    const createRes = await makeRequest('/api/admin/advertisements', {
      method: 'POST',
      headers: ADMIN_HEADERS,
    }, {
      sponsorName: 'Preview Test Sponsor',
      title: 'Preview Only Ad',
      destinationUrl: 'https://test-preview.com',
      placement: 'DASHBOARD_SIDEBAR',
      status: 'ACTIVE',
      priority: 999, // Higher priority but is_test = 1
      is_test: 1,
    });
    assert(createRes.data.advertisement, 'createRes.data.advertisement must exist');
    testAdId1 = createRes.data.advertisement.id;

    const res = await makeRequest('/api/advertisements/active?placement=DASHBOARD_SIDEBAR');
    assert.strictEqual(res.status, 200);
    assert(res.data.advertisement);
    assert.notStrictEqual(res.data.advertisement.id, testAdId1);
    assert.strictEqual(res.data.advertisement.is_test || 0, 0);
  });

  // 5. Expired ad is automatically excluded
  await asyncTest('5. Expired advertisement automatically excluded from active query', async () => {
    const pastDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const createRes = await makeRequest('/api/admin/advertisements', {
      method: 'POST',
      headers: ADMIN_HEADERS,
    }, {
      sponsorName: 'Expired Sponsor',
      title: 'Expired Offer',
      destinationUrl: 'https://expired.com',
      placement: 'DASHBOARD_SIDEBAR',
      status: 'ACTIVE',
      priority: 888,
      startAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      endAt: pastDate,
      is_test: 0,
    });
    assert(createRes.data.advertisement, 'createRes.data.advertisement must exist');
    expiredAdId = createRes.data.advertisement.id;

    const res = await makeRequest('/api/advertisements/active?placement=DASHBOARD_SIDEBAR');
    assert.strictEqual(res.status, 200);
    if (res.data.advertisement) {
      assert.notStrictEqual(res.data.advertisement.id, expiredAdId);
    }
  });

  // 6. Future ad is automatically excluded
  await asyncTest('6. Future advertisement automatically excluded from active query', async () => {
    const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const createRes = await makeRequest('/api/admin/advertisements', {
      method: 'POST',
      headers: ADMIN_HEADERS,
    }, {
      sponsorName: 'Future Sponsor',
      title: 'Future Offer',
      destinationUrl: 'https://future.com',
      placement: 'DASHBOARD_SIDEBAR',
      status: 'ACTIVE',
      priority: 777,
      startAt: futureDate,
      is_test: 0,
    });
    assert(createRes.data.advertisement, 'createRes.data.advertisement must exist');
    futureAdId = createRes.data.advertisement.id;

    const res = await makeRequest('/api/advertisements/active?placement=DASHBOARD_SIDEBAR');
    assert.strictEqual(res.status, 200);
    if (res.data.advertisement) {
      assert.notStrictEqual(res.data.advertisement.id, futureAdId);
    }
  });

  // 7. Reject javascript: URL
  await asyncTest('7. Malicious javascript: URL rejected', async () => {
    const res = await makeRequest('/api/admin/advertisements', {
      method: 'POST',
      headers: ADMIN_HEADERS,
    }, {
      sponsorName: 'Attacker',
      title: 'Malicious Ad',
      destinationUrl: 'javascript:alert("xss")',
    });
    assert.strictEqual(res.status, 400);
  });

  // 8. Event tracking IMPRESSION & CLICK
  await asyncTest('8. Event tracking (IMPRESSION & CLICK) works for active ad', async () => {
    const activeRes = await makeRequest('/api/advertisements/active?placement=DASHBOARD_SIDEBAR');
    const adId = activeRes.data.advertisement.id;

    const impRes = await makeRequest(`/api/advertisements/${adId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    }, {
      eventType: 'IMPRESSION',
      sessionId: 'sess_h1_test',
      placement: 'DASHBOARD_SIDEBAR',
    });
    assert.strictEqual(impRes.status, 200);

    const clickRes = await makeRequest(`/api/advertisements/${adId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest' },
    }, {
      eventType: 'CLICK',
      sessionId: 'sess_h1_test',
      placement: 'DASHBOARD_SIDEBAR',
    });
    assert.strictEqual(clickRes.status, 200);
  });

  let multiAd1 = null;
  let multiAd2 = null;
  let multiAd3 = null;

  // 9. Phase H.3: Multi-ad rotation query returns all active production ads ordered by priority
  await asyncTest('9. GET /api/advertisements/active returns array of active ads sorted by priority', async () => {
    const res1 = await makeRequest('/api/admin/advertisements', { method: 'POST', headers: ADMIN_HEADERS }, {
      sponsorName: 'Multi Sponsor High',
      title: 'High Priority Ad',
      destinationUrl: 'https://high.com',
      placement: 'DASHBOARD_SIDEBAR',
      status: 'ACTIVE',
      priority: 100,
      is_test: 1,
    });
    multiAd1 = res1.data.advertisement.id;

    const res2 = await makeRequest('/api/admin/advertisements', { method: 'POST', headers: ADMIN_HEADERS }, {
      sponsorName: 'Multi Sponsor Mid',
      title: 'Mid Priority Ad',
      destinationUrl: 'https://mid.com',
      placement: 'DASHBOARD_SIDEBAR',
      status: 'ACTIVE',
      priority: 80,
      is_test: 1,
    });
    multiAd2 = res2.data.advertisement.id;

    const res3 = await makeRequest('/api/admin/advertisements', { method: 'POST', headers: ADMIN_HEADERS }, {
      sponsorName: 'Multi Sponsor Low',
      title: 'Low Priority Ad',
      destinationUrl: 'https://low.com',
      placement: 'DASHBOARD_SIDEBAR',
      status: 'ACTIVE',
      priority: 50,
      is_test: 1,
    });
    multiAd3 = res3.data.advertisement.id;

    const activeRes = await makeRequest('/api/advertisements/active?placement=DASHBOARD_SIDEBAR&includeTest=true');
    assert.strictEqual(activeRes.status, 200);
    assert(Array.isArray(activeRes.data.advertisements));

    const ids = activeRes.data.advertisements.map((a) => a.id);
    const idx1 = ids.indexOf(multiAd1);
    const idx2 = ids.indexOf(multiAd2);
    const idx3 = ids.indexOf(multiAd3);
    assert(idx1 !== -1 && idx2 !== -1 && idx3 !== -1);
    assert(idx1 < idx2 && idx2 < idx3, 'Ads must be ordered by priority DESC');
  });

  // 10. Phase H.3: Multi-placement campaign returns for DASHBOARD_TOP, LANDING_TOP, and DASHBOARD_BOTTOM
  let multiPlacementAdId = null;
  await asyncTest('10. Multi-placement campaign appears across selected placements', async () => {
    const createRes = await makeRequest('/api/admin/advertisements', { method: 'POST', headers: ADMIN_HEADERS }, {
      sponsorName: 'Multi Placement Brand',
      title: 'Universal Campaign',
      destinationUrl: 'https://universal.com',
      placement: 'DASHBOARD_TOP,LANDING_TOP,DASHBOARD_BOTTOM',
      status: 'ACTIVE',
      priority: 500,
      is_test: 1,
    });
    assert(createRes.data.advertisement);
    multiPlacementAdId = createRes.data.advertisement.id;

    const topRes = await makeRequest('/api/advertisements/active?placement=DASHBOARD_TOP&includeTest=true');
    const landingRes = await makeRequest('/api/advertisements/active?placement=LANDING_TOP&includeTest=true');
    const bottomRes = await makeRequest('/api/advertisements/active?placement=DASHBOARD_BOTTOM&includeTest=true');

    assert(topRes.data.advertisements.some(a => a.id === multiPlacementAdId));
    assert(landingRes.data.advertisements.some(a => a.id === multiPlacementAdId));
    assert(bottomRes.data.advertisements.some(a => a.id === multiPlacementAdId));
  });

  // 11. Phase H.3: EDIT -> SAVE CHANGES Persistence Test (All Fields + Date Normalization)
  let editAdId = null;
  await asyncTest('11. EDIT -> SAVE CHANGES persists all fields correctly to database', async () => {
    const initialStart = new Date(Date.now() + 3600 * 1000).toISOString();
    const initialEnd = new Date(Date.now() + 7200 * 1000).toISOString();

    const createRes = await makeRequest('/api/admin/advertisements', { method: 'POST', headers: ADMIN_HEADERS }, {
      sponsorName: 'Initial Sponsor',
      title: 'Initial Title',
      description: 'Initial Description',
      logoUrl: 'https://initial.com/logo.png',
      cardImageUrl: 'https://initial.com/card.png',
      destinationUrl: 'https://initial.com',
      ctaText: 'Apply Now',
      adType: 'STRUCTURED_CARD',
      placement: 'DASHBOARD_TOP',
      status: 'DRAFT',
      priority: 20,
      startAt: initialStart,
      endAt: initialEnd,
      is_test: 1,
    });

    assert(createRes.data.advertisement);
    editAdId = createRes.data.advertisement.id;

    // Perform Edit with updated values for ALL fields
    const updatedStart = new Date(Date.now() + 4000 * 1000).toISOString();
    const updatedEnd = new Date(Date.now() + 8000 * 1000).toISOString();

    const updateRes = await makeRequest(`/api/admin/advertisements/${editAdId}`, { method: 'PUT', headers: ADMIN_HEADERS }, {
      sponsorName: 'Updated Sponsor Name',
      title: 'Updated Headline Title',
      description: 'Updated Detailed Description',
      logoUrl: 'https://updated.com/logo.png',
      cardImageUrl: 'https://updated.com/card.png',
      destinationUrl: 'https://updated.com/offer',
      ctaText: 'Claim Offer',
      adType: 'OPTIONAL_CREATIVE_CARD',
      placement: 'DASHBOARD_TOP,LANDING_TOP',
      status: 'ACTIVE',
      priority: 95,
      startAt: updatedStart,
      endAt: updatedEnd,
      is_test: 1,
    });

    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.data.success, true);
    const updatedAd = updateRes.data.advertisement;

    assert.strictEqual(updatedAd.sponsorName, 'Updated Sponsor Name');
    assert.strictEqual(updatedAd.title, 'Updated Headline Title');
    assert.strictEqual(updatedAd.description, 'Updated Detailed Description');
    assert.strictEqual(updatedAd.logoUrl, 'https://updated.com/logo.png');
    assert.strictEqual(updatedAd.cardImageUrl, 'https://updated.com/card.png');
    assert.strictEqual(updatedAd.destinationUrl, 'https://updated.com/offer');
    assert.strictEqual(updatedAd.ctaText, 'Claim Offer');
    assert.strictEqual(updatedAd.adType, 'OPTIONAL_CREATIVE_CARD');
    assert.strictEqual(updatedAd.placement, 'DASHBOARD_TOP,LANDING_TOP');
    assert.strictEqual(updatedAd.status, 'ACTIVE');
    assert.strictEqual(updatedAd.priority, 95);

    // Verify re-fetch from GET endpoint returns exact updated record
    const listRes = await makeRequest('/api/admin/advertisements?includeTest=true', { method: 'GET', headers: ADMIN_HEADERS });
    const fetchedAd = listRes.data.advertisements.find(a => a.id === editAdId);
    assert(fetchedAd, 'Fetched updated ad must exist in admin list');
    assert.strictEqual(fetchedAd.sponsorName, 'Updated Sponsor Name');
    assert.strictEqual(fetchedAd.title, 'Updated Headline Title');
    assert.strictEqual(fetchedAd.placement, 'DASHBOARD_TOP,LANDING_TOP');
    assert.strictEqual(fetchedAd.status, 'ACTIVE');

    // Test Date Preservation on unrelated field edit
    const editUnrelatedRes = await makeRequest(`/api/admin/advertisements/${editAdId}`, { method: 'PUT', headers: ADMIN_HEADERS }, {
      sponsorName: 'Updated Sponsor Name V2',
      startAt: updatedStart,
      endAt: updatedEnd,
    });
    assert.strictEqual(editUnrelatedRes.status, 200);
    assert.strictEqual(new Date(editUnrelatedRes.data.advertisement.startAt).getTime(), new Date(updatedStart).getTime());
    assert.strictEqual(new Date(editUnrelatedRes.data.advertisement.endAt).getTime(), new Date(updatedEnd).getTime());
  });

  // 12. Clean up temporary test fixtures created in this test run
  await asyncTest('12. Clean up temporary test fixtures', async () => {
    const ids = [testAdId1, expiredAdId, futureAdId, multiAd1, multiAd2, multiAd3, multiPlacementAdId, editAdId];
    for (const id of ids) {
      if (id) {
        await makeRequest(`/api/admin/advertisements/${id}`, { method: 'DELETE', headers: ADMIN_HEADERS });
      }
    }
    console.log('Temporary test fixtures cleaned up.');
  });

  // 13. Run Phase G Assessment Integrity suite
  await asyncTest('13. Existing Phase G Assessment Integrity test suite passes', () => {
    const output = execSync('node scratch/test_phaseG_assessment_integrity.cjs', { encoding: 'utf8' });
    assert(output.includes('ASSESSMENT INTEGRITY') && output.includes('PASSED'));
  });

  // 14. Run Phase 37 Exam/Practice Startup suite
  await asyncTest('14. Existing Phase 37 Exam/Practice startup test suite passes', () => {
    const output = execSync('node scratch/test_phase37_exam_practice_startup.cjs', { encoding: 'utf8' });
    assert(output.includes('PHASE 37') && output.includes('PASSED'));
  });

  // 15. Run Phase 38 Deep AI Credit Loading suite
  await asyncTest('15. Existing Phase 38 Deep AI credit loading test suite passes', () => {
    const output = execSync('node scratch/test_phase38_deep_ai_credit_loading.cjs', { encoding: 'utf8' });
    assert(output.includes('PHASE 38') && output.includes('PASSED'));
  });

  // 16. Run Revision Deep AI Migration suite
  await asyncTest('16. Existing Revision Deep AI migration test suite passes', () => {
    const output = execSync('node scratch/test_revision_deep_ai_migration.cjs', { encoding: 'utf8' });
    assert(output.includes('REVISION') || output.includes('PASSED'));
  });

  // 17. Run Security Regression suite
  await asyncTest('17. Security regression test suite passes', () => {
    const output = execSync('npx tsx test_security_phase1.ts', { encoding: 'utf8' });
    assert(output.includes('SECURITY REGRESSION AUDIT PASSED') || output.includes('PASSED'));
  });

  // 18. Run Production Build check
  await asyncTest('18. Production build passes without TypeScript or Vite errors', () => {
    const output = execSync('npm run build', { encoding: 'utf8' });
    assert(output.includes('built in') || output.includes('dist/index.html'));
  });

  console.log(`\n============================================================`);
  console.log(`PHASE H.3 ADVERTISEMENT SUITE COMPLETED: ${passed}/${total} PASSED`);
  console.log(`============================================================\n`);
}

runTests().catch(console.error);
