const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push({type:'pageerror', msg: err.message}));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push({type:'console', msg: msg.text()});
  });

  // Step 1: Register user via API
  console.log('STEP 1: Register user via API...');
  await page.goto('http://localhost:3000/', {waitUntil:'networkidle2'});
  
  const regResult = await page.evaluate(async () => {
    const res = await fetch('/api/auth/login-or-register', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        email: 'dashtest_' + Date.now() + '@example.com',
        name: 'Dashboard Test',
        college: 'Test College',
        targetCompany: 'TCS',
        targetRole: 'SDE',
        role: 'student'
      })
    });
    const data = await res.json();
    return {status: res.status, userId: data?.user?.id, user: data?.user};
  });
  console.log('Registration result:', regResult.status, 'userId:', regResult.userId);

  if (!regResult.userId) {
    console.log('FAIL: Registration failed, no userId');
    await browser.close();
    return;
  }

  // Step 2: Set localStorage and reload to trigger authenticated Dashboard
  console.log('STEP 2: Setting localStorage and reloading...');
  await page.evaluate((uid) => {
    localStorage.setItem('firstround_uid', uid);
  }, regResult.userId);
  
  await page.goto('http://localhost:3000/', {waitUntil: 'networkidle2'});
  // Wait extra for all API calls to finish
  await new Promise(r => setTimeout(r, 5000));

  // Step 3: Check what rendered
  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  const bodyHTML = await page.evaluate(() => document.getElementById('root')?.innerHTML?.substring(0, 500) || '');
  
  const isBlank = bodyText.trim().length < 50;
  const hasNavbar = bodyText.includes('Home') || bodyText.includes('Tests') || bodyText.includes('Explore');
  const hasLevel = bodyText.includes('Level');
  const hasXP = bodyText.includes('XP') || bodyText.includes('xp');
  const hasDashboard = bodyText.includes('Recommended') || bodyText.includes('Practice') || bodyText.includes('Placement');
  const hasLandingPage = bodyText.includes('Practice smarter') && bodyText.includes('Get Started');

  console.log('\n=== VERIFICATION RESULTS ===');
  console.log('Body text length:', bodyText.length);
  console.log('Is BLANK page:', isBlank);
  console.log('Shows LANDING page:', hasLandingPage);
  console.log('Shows NAVBAR:', hasNavbar);
  console.log('Shows LEVEL:', hasLevel);
  console.log('Shows XP:', hasXP);
  console.log('Shows DASHBOARD:', hasDashboard);
  console.log('\nFirst 500 chars:', bodyText.substring(0, 500));
  console.log('\nRoot HTML (first 500):', bodyHTML);
  console.log('\nPage errors:', errors.filter(e => e.type === 'pageerror'));
  console.log('Console errors:', errors.filter(e => e.type === 'console'));

  await browser.close();
})();
