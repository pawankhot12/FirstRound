const puppeteer = require('puppeteer');

(async () => {
  console.log('🔍 Launching browser to reproduce EXAM and PRACTICE startup...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  page.on('pageerror', (err) => {
    console.error('💥 BROWSER PAGE ERROR STACK:');
    console.error(err.stack || err.message || err);
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error('🔴 CONSOLE LOG ERROR:', msg.text());
    }
  });

  try {
    console.log('Navigating to http://localhost:3000 ...');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });

    // Set logged-in student user in localStorage
    await page.evaluate(() => {
      localStorage.setItem('firstround_user', JSON.stringify({
        id: 'usr_student1',
        email: 'akhot5779@gmail.com',
        name: 'Student User',
        role: 'student',
        plan: 'FREE',
      }));
    });

    await page.reload({ waitUntil: 'networkidle0' });
    console.log('Loaded title:', await page.title());

    // 1. Test EXAM MODE startup
    console.log('\n--- TESTING EXAM MODE STARTUP ---');
    // Find "Start Test" or "Explore Tests" or "Start Exam" buttons
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const startBtn = btns.find(b => b.innerText.includes('Start Test') || b.innerText.includes('Explore Tests') || b.innerText.includes('Take Test'));
      if (startBtn) startBtn.click();
    });

    await new Promise(r => setTimeout(r, 2000));

    // Look for assessment cards and click Start Test
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const startBtn = btns.find(b => b.innerText.includes('Start Test') || b.innerText.includes('Start Exam') || b.innerText.includes('Take Test'));
      if (startBtn) startBtn.click();
    });

    await new Promise(r => setTimeout(r, 3000));

    const htmlContent = await page.content();
    console.log('Page body length after Exam attempt:', htmlContent.length);
    if (htmlContent.length < 500) {
      console.error('⚠️ WHITE SCREEN DETECTED FOR EXAM MODE!');
    }

  } catch (err) {
    console.error('Puppeteer script error:', err);
  } finally {
    await browser.close();
  }
})();
