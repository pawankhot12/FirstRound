const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log('BROWSER CONSOLE:', msg.text());
  });

  console.log('--- Navigating to page ---');
  await page.goto('http://localhost:3000/');
  
  // Wait for initial load
  await new Promise(r => setTimeout(r, 3000));
  
  console.log('--- Triggering signInWithPassword ---');
  // Evaluate code in page to call signInWithEmail
  const loginResult = await page.evaluate(async () => {
    try {
      // Find the component that imports signInWithEmail? No, just trigger UI if possible,
      // or we can just fetch POST /api/auth/login-or-register directly to measure that.
      // Or we can import from window if we exposed it. We didn't.
      
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
  
  await browser.close();
})();
