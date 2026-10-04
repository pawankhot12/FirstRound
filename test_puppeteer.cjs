const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('response', response => {
    if (response.url().includes('/api/')) {
      console.log('RESPONSE:', response.url(), response.status());
    }
  });

  await page.goto('http://localhost:3000/');
  
  // Wait for React to load
  await new Promise(r => setTimeout(r, 2000));
  
  // Execute fetch directly in the page context!
  const result = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/auth/login-or-register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'test_pp2@example.com', name: 'Test', college: 'Test', targetCompany: 'TCS', targetRole: 'SDE', role: 'student' })
      });
      const text = await res.text();
      return { status: res.status, body: text };
    } catch(e) {
      return { error: e.message };
    }
  });
  
  console.log('FETCH RESULT:', result);
  await browser.close();
})();
