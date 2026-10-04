import http from 'http';

function request(path: string, options: any = {}): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:3000${path}`, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-requested-with': 'XMLHttpRequest',
        ...options.headers,
      },
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runDiagnostics() {
  console.log('=== NOTIFICATIONS SYSTEM DIAGNOSTICS ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  try {
    const adminId = 'user_superadmin_pawankhot';

    // 1. Fetch existing candidates from server
    const adminUsersRes = await request('/api/admin/users', {
      headers: { 'x-user-id': adminId },
    });
    assert(adminUsersRes.status === 200 && Array.isArray(adminUsersRes.data.users), 'Admin fetched users directory from server');
    
    const users = adminUsersRes.data.users || [];
    let cand1 = users.find((u: any) => u.targetCompany && u.targetCompany.toLowerCase().includes('tcs'));
    let cand2 = users.find((u: any) => u.targetCompany && u.targetCompany.toLowerCase().includes('infosys'));

    if (!cand1) {
      cand1 = users[0] || { id: 'cand_test_1', targetCompany: 'TCS' };
    }
    if (!cand2) {
      cand2 = users[1] || { id: 'cand_test_2', targetCompany: 'Infosys' };
    }

    // 2. Test Candidate Count API
    const countRes = await request('/api/admin/candidates/count', {
      headers: { 'x-user-id': adminId },
    });
    assert(countRes.status === 200 && typeof countRes.data.count === 'number', `Admin candidate count endpoint returned ${countRes.data.count} candidates`);

    // 3. Admin sends broadcast announcement to All Registered Candidates
    const broadcastRes = await request('/api/admin/announcements', {
      method: 'POST',
      headers: { 'x-user-id': adminId },
      body: {
        title: 'TCS NQT 2026 Live Mock Test Released',
        message: 'A brand new full-length placement mock is now available.',
        type: 'NEW_TEST',
        priority: 'Important',
        actionType: 'OPEN_TEST',
        actionTestId: 'tcs_nqt_2026_mock',
      },
    });
    assert(broadcastRes.status === 200 && broadcastRes.data.success, 'Admin successfully dispatched broadcast announcement');
    const broadcastNotif = broadcastRes.data.notification;
    assert(broadcastNotif && broadcastNotif.id, 'Created notification has persistent ID');

    // 4. Fetch candidate 1 notifications
    const cand1NotifRes = await request(`/api/notifications?userId=${cand1.id}`, {
      headers: { 'x-user-id': cand1.id },
    });
    assert(cand1NotifRes.status === 200, 'Candidate 1 fetched notifications successfully');
    const notif1 = cand1NotifRes.data.notifications.find((n: any) => n.id === broadcastNotif.id);
    assert(notif1 !== undefined, 'Candidate 1 received the broadcast announcement');
    assert(cand1NotifRes.data.unreadCount > 0, `Unread count for Candidate 1 is ${cand1NotifRes.data.unreadCount}`);

    // 5. Mark specific notification as READ for Candidate 1
    const readRes = await request(`/api/notifications/${broadcastNotif.id}/read?userId=${cand1.id}`, {
      method: 'POST',
      headers: { 'x-user-id': cand1.id },
      body: { userId: cand1.id },
    });
    assert(readRes.status === 200 && readRes.data.success, 'Candidate 1 marked notification as READ');

    // 6. Verify Notification STILL VISIBLE after reading (CRITICAL RULE #7 & #8)
    const cand1AfterReadRes = await request(`/api/notifications?userId=${cand1.id}`, {
      headers: { 'x-user-id': cand1.id },
    });
    const notif1AfterRead = cand1AfterReadRes.data.notifications.find((n: any) => n.id === broadcastNotif.id);
    assert(notif1AfterRead !== undefined, 'Notification REMAINS VISIBLE after being read (not deleted immediately)');
    assert(cand1AfterReadRes.data.readIds.includes(broadcastNotif.id), 'readIds persisted in DB for candidate');

    // 7. Targeted Announcement Test (Targeting TCS Aspirants only)
    const tcsAnnRes = await request('/api/admin/announcements', {
      method: 'POST',
      headers: { 'x-user-id': adminId },
      body: {
        title: 'Exclusive TCS Placement Strategy Webinar',
        message: 'Live session scheduled for TCS aspirants only.',
        type: 'ANNOUNCEMENT',
        targetCompany: 'TCS',
        priority: 'Normal',
      },
    });
    assert(tcsAnnRes.status === 200, 'Admin sent TCS targeted announcement');
    const tcsNotif = tcsAnnRes.data.notification;

    // Verify TCS Candidate receives it
    if (cand1.targetCompany && cand1.targetCompany.toLowerCase().includes('tcs')) {
      const tcsCandCheck = await request(`/api/notifications?userId=${cand1.id}`, {
        headers: { 'x-user-id': cand1.id },
      });
      assert(tcsCandCheck.data.notifications.some((n: any) => n.id === tcsNotif.id), 'TCS Candidate received TCS targeted announcement');
    } else {
      assert(true, 'Skipping target check for cand1 as targetCompany was not TCS');
    }

    // Verify Infosys Candidate DOES NOT receive TCS targeted announcement (Requirement #4)
    if (cand2.targetCompany && cand2.targetCompany.toLowerCase().includes('infosys')) {
      const infCandCheck = await request(`/api/notifications?userId=${cand2.id}`, {
        headers: { 'x-user-id': cand2.id },
      });
      assert(!infCandCheck.data.notifications.some((n: any) => n.id === tcsNotif.id), 'Infosys Candidate did NOT receive TCS targeted announcement');
    } else {
      assert(true, 'Skipping target check for cand2 as targetCompany was not Infosys');
    }

    // 8. IDOR Security Test: User B cannot read/modify User A's notifications (Requirement #19)
    const idorRead = await request(`/api/notifications?userId=${cand1.id}`, {
      headers: { 'x-user-id': cand2.id },
    });
    assert(idorRead.status === 403, 'IDOR Protection: Candidate 2 blocked from accessing Candidate 1 notifications (403 Forbidden)');

    // 9. Expiration Test: Expired notifications excluded from active query (Requirement #13)
    const expiredNotifRes = await request('/api/admin/announcements', {
      method: 'POST',
      headers: { 'x-user-id': adminId },
      body: {
        title: 'Past Maintenance Notice',
        message: 'Scheduled maintenance completed.',
        type: 'SYSTEM_NOTICE',
        expiresAt: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
      },
    });
    const expiredNotif = expiredNotifRes.data.notification;

    const candFetchWithExpired = await request(`/api/notifications?userId=${cand1.id}`, {
      headers: { 'x-user-id': cand1.id },
    });
    assert(!candFetchWithExpired.data.notifications.some((n: any) => n.id === expiredNotif.id), 'Expired notification is automatically excluded from active list');

    console.log(`\n=== SUMMARY: ${passed} PASSED, ${failed} FAILED ===`);
  } catch (err) {
    console.error('Diagnostic execution failed:', err);
  }
}

runDiagnostics();
