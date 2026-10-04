const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({headless: true});
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', err => errors.push({type:'pageerror', message: err.message}));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push({type:'console', message: msg.text()});
  });
  page.on('response', resp => {
    if (!resp.ok()) errors.push({type:'response', url: resp.url(), status: resp.status()});
  });

  await page.goto('http://localhost:3000/', {waitUntil:'networkidle2'});
  // click Candidate Access
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button')).find(b=>b.textContent && b.textContent.includes('Candidate Access'));
    if (btn) btn.click();
  });
  await new Promise(r=>setTimeout(r, 500));
  // fill registration form (using a fresh email each run)
  await page.evaluate(() => {
    const email = document.querySelector('input[type="email"]');
    const name = document.querySelector('input[type="text"]');
    if (email) {email.value = 'c0_check_' + Date.now() + '@example.com'; email.dispatchEvent(new Event('input', {bubbles:true}));}
    if (name) {name.value = 'C0 Check'; name.dispatchEvent(new Event('input', {bubbles:true}));}
    const btn = Array.from(document.querySelectorAll('button')).find(b=>b.textContent && b.textContent.includes('Create Profile'));
    if (btn) btn.click();
  });
  // wait for navigation to dashboard (approx 4 sec)
  await new Promise(r=>setTimeout(r, 4000));
  const html = await page.content();
  console.log('---PAGE CONTENT START---');
  console.log(html);
  console.log('---PAGE CONTENT END---');
  console.log('Collected errors:', JSON.stringify(errors, null, 2));
  await browser.close();
})();
