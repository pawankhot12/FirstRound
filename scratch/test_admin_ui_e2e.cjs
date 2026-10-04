const puppeteer = require('puppeteer');

async function runE2ETests() {
  console.log('=== STARTING ADMIN UI E2E BROWSER TEST ===\n');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    // 1. Visit App Home
    console.log('1. Navigating to App Home...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

    // 2. Fetch user ID for pawankhot9@gmail.com and set firstround_uid
    console.log('2. Logging in as pawankhot9@gmail.com (Super Admin)...');
    const superAdminRes = await page.evaluate(async () => {
      const res = await fetch('/api/auth/login-or-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'pawankhot9@gmail.com', name: 'Pawan Khot' }),
      });
      const data = await res.json();
      localStorage.setItem('firstround_uid', data.user.id);
      return data.user;
    });

    console.log(`- Resolved Super Admin UID: ${superAdminRes.id}, Role: ${superAdminRes.role}`);
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1000));

    // 3. Verify Admin button exists in navbar
    console.log('3. Checking Admin Console link in Navbar...');
    const adminBtnExists = (await page.$('#nav-admin-btn')) !== null;
    console.log(`- Navbar Admin button present: ${adminBtnExists}`);
    if (!adminBtnExists) throw new Error('Admin button not found in Navbar for Super Admin!');

    // 4. Click Admin button
    console.log('4. Opening Admin Command Center...');
    await page.click('#nav-admin-btn');
    await new Promise((r) => setTimeout(r, 1000));

    // 5. Verify Team Members sub-tab exists for Super Admin
    console.log('5. Verifying Super Admin Team Members sub-tab...');
    const teamTabExists = (await page.$('#tab-team-admins-btn')) !== null;
    console.log(`- Team Members & Admins tab present: ${teamTabExists}`);
    if (!teamTabExists) throw new Error('Team Members & Admins tab not visible for Super Admin!');

    // 6. Click Team Members sub-tab
    await page.click('#tab-team-admins-btn');
    await new Promise((r) => setTimeout(r, 1000));

    // Verify page title / heading contains Team Members
    const pageText = await page.evaluate(() => document.body.innerText);
    const hasTeamText = pageText.includes('Team Members & Administrator Directory');
    console.log(`- Team Directory heading visible: ${hasTeamText}`);
    if (!hasTeamText) throw new Error('Team Directory section failed to load!');

    const hasSuperAdminBadge = pageText.includes('SUPER ADMIN');
    console.log(`- Super Admin badge visible: ${hasSuperAdminBadge}`);

    // 7. Test Student User Login (non-admin)
    console.log('\n7. Switching to Student account (student_e2e_user@gmail.com)...');
    await page.evaluate(async () => {
      const res = await fetch('/api/auth/login-or-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'student_e2e_user@gmail.com', name: 'Student Candidate' }),
      });
      const data = await res.json();
      localStorage.setItem('firstround_uid', data.user.id);
    });
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1000));

    const studentAdminBtnExists = (await page.$('#nav-admin-btn')) !== null;
    console.log(`- Student Navbar Admin button absent: ${!studentAdminBtnExists}`);
    if (studentAdminBtnExists) throw new Error('Admin button unexpectedly visible for student!');

    console.log('\n=== E2E BROWSER VERIFICATION PASSED SUCCESSFULLY ===');
  } catch (err) {
    console.error('E2E Test Failure:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runE2ETests();
