const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push({type:'pageerror', message: err.message}));
  page.on('response', resp => {
    if (!resp.ok()) {
      errors.push({type:'response', url: resp.url(), status: resp.status(), statusText: resp.statusText()});
    }
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push({type:'console', message: msg.text()});
    }
  });

  await page.goto('http://localhost:3000/', {waitUntil:'networkidle2'});
  // click Candidate Access
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b=>b.textContent && b.textContent.includes('Candidate Access'));
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);
  // fill form
  await page.evaluate(() => {
    const email = document.querySelector('input[type="email"]');
    const name = document.querySelector('input[type="text"]');
    if (email) {email.value='test_blank_user'+Date.now()+'@example.com'; email.dispatchEvent(new Event('input', {bubbles:true}));}
    if (name) {name.value='Test Blank'; name.dispatchEvent(new Event('input', {bubbles:true}));}
    const submit = Array.from(document.querySelectorAll('button')).find(b=>b.textContent && b.textContent.includes('Create Profile'));
    if (submit) submit.click();
  });
  await page.waitForTimeout(4000);

  console.log('Collected errors:', JSON.stringify(errors, null, 2));
  await browser.close();
})();
