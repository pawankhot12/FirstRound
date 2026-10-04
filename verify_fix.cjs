const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push({type:'pageerror', msg: err.message}));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push({type:'console', msg: msg.text()});
  });

  // 1. Load landing page
  console.log('1. Loading landing page...');
  await page.goto('http://localhost:3000/', {waitUntil:'networkidle2'});
  const landingText = await page.evaluate(() => document.body?.innerText?.substring(0,200) || '');
  console.log('Landing page text:', landingText.substring(0,100));

  // 2. Click "Get Started" (which opens auth modal in register mode)
  console.log('2. Clicking Get Started...');
  await page.evaluate(() => {
    const btn = document.getElementById('hero-get-started-btn') || document.getElementById('landing-nav-get-started-btn');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // 3. Check if auth modal appeared
  const modalVisible = await page.evaluate(() => {
    const inputs = document.querySelectorAll('input');
    return inputs.length;
  });
  console.log('3. Auth modal inputs found:', modalVisible);

  // 4. Use React-compatible input simulation via nativeInputValueSetter
  const email = 'verify_fix_' + Date.now() + '@example.com';
  console.log('4. Filling form with:', email);
  await page.evaluate((emailVal) => {
    const inputs = Array.from(document.querySelectorAll('input'));
    const emailInput = inputs.find(i => i.type === 'email' || i.placeholder?.toLowerCase().includes('email'));
    const nameInput = inputs.find(i => i.type === 'text' && (i.placeholder?.toLowerCase().includes('name') || i.name === 'name'));

    function setNativeValue(el, val) {
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      nativeInputValueSetter.call(el, val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    if (emailInput) setNativeValue(emailInput, emailVal);
    if (nameInput) setNativeValue(nameInput, 'Fix Verify');
  }, email);
  await new Promise(r => setTimeout(r, 500));

  // 5. Click submit/create profile
  console.log('5. Clicking submit button...');
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const submit = btns.find(b => {
      const t = b.textContent || '';
      return t.includes('Create Profile') || t.includes('Sign In') || t.includes('Register');
    });
    if (submit) {
      console.log('Found submit button:', submit.textContent);
      submit.click();
    } else {
      console.log('No submit button found. Buttons:', btns.map(b => b.textContent).join(' | '));
    }
  });
  await new Promise(r => setTimeout(r, 5000));

  // 6. Check if Dashboard loaded
  const bodyText = await page.evaluate(() => document.body?.innerText || '');
  const hasDashboard = bodyText.includes('Level') || bodyText.includes('XP') || bodyText.includes('Dashboard') || bodyText.includes('Explore');
  const hasLanding = bodyText.includes('Get Started') && bodyText.includes('Practice smarter');
  const isBlank = bodyText.trim().length < 50;

  console.log('\n=== RESULT ===');
  console.log('Body text length:', bodyText.length);
  console.log('Is blank page:', isBlank);
  console.log('Shows landing page:', hasLanding);
  console.log('Shows dashboard:', hasDashboard);
  console.log('First 300 chars of body:', bodyText.substring(0, 300));
  console.log('\nErrors collected:', JSON.stringify(errors, null, 2));

  await browser.close();
})();
