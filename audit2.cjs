const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log('BROWSER CONSOLE:', msg.text());
  });

  await page.goto('http://localhost:3000/');
  
  await new Promise(r => setTimeout(r, 2000));
  
  const loginResult = await page.evaluate(async () => {
    try {
      // Find the component that imports signInWithEmail? 
      // Let's just import the service using dynamic import if possible
      const module = await import('/src/services/supabaseClient.ts');
      const res = await module.signInWithEmail('test@example.com', 'password123');
      return { success: true };
    } catch(e) {
      return { error: e.message };
    }
  });
  
  await new Promise(r => setTimeout(r, 2000));
  await browser.close();
})();
