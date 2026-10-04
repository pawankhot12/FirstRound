const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
    console.error('PAGE ERROR:', err.message);
  });
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.error('CONSOLE ERROR:', msg.text());
    }
  });

  await page.goto('http://localhost:3000/');
  await new Promise(r => setTimeout(r, 2000));
  
  // Wait for Candidate Access button and click it
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    const candidateBtn = btns.find(b => b.textContent && b.textContent.includes('Candidate Access'));
    if (candidateBtn) candidateBtn.click();
  });
  
  await new Promise(r => setTimeout(r, 1000));
  
  // Find email input and fill it
  await page.evaluate(() => {
    const emailInput = document.querySelector('input[type="email"]');
    const nameInput = document.querySelector('input[type="text"]');
    if (emailInput) {
      emailInput.value = 'test_blank' + Date.now() + '@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (nameInput) {
      nameInput.value = 'Test Blank';
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    
    // Submit form
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Create Profile'));
    if (submitBtn) submitBtn.click();
  });
  
  await new Promise(r => setTimeout(r, 5000));
  console.log('DONE');
  await browser.close();
})();
