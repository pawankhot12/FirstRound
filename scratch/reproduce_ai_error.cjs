const puppeteer = require('puppeteer');

(async () => {
  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  const consoleErrors = [];
  const pageErrors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER CONSOLE ERROR:', msg.text());
      consoleErrors.push({
        text: msg.text(),
        location: msg.location(),
        args: msg.args().map(a => a.toString())
      });
    } else {
      console.log('BROWSER CONSOLE:', msg.type(), msg.text());
    }
  });

  page.on('pageerror', err => {
    console.error('BROWSER PAGE ERROR:', err.message, err.stack);
    pageErrors.push(err);
  });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  // Check if we need to log in or click demo student
  const studentBtn = await page.$('button#demo-student-login, button:has-text("Student"), [data-testid="student-login"]');
  if (studentBtn) {
    console.log('Clicking student login...');
    await studentBtn.click();
    await page.waitForTimeout(1000);
  }

  console.log('Looking for AI Copilot button...');
  // Find AI copilot button (e.g. #open-ai-copilot-btn or button containing "FirstRound AI")
  await page.waitForSelector('#open-ai-copilot-btn, button:has-text("FirstRound AI"), button:has-text("AI Copilot")', { timeout: 5000 }).catch(() => {});

  let aiBtn = await page.$('#open-ai-copilot-btn');
  if (!aiBtn) {
    const buttons = await page.$$('button');
    for (const b of buttons) {
      const text = await page.evaluate(el => el.textContent, b);
      if (text && (text.includes('FirstRound AI') || text.includes('AI Copilot') || text.includes('Copilot'))) {
        aiBtn = b;
        break;
      }
    }
  }

  if (aiBtn) {
    console.log('Clicking AI Copilot button...');
    await aiBtn.click();
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log('Could not find AI Copilot button directly, dumping page buttons:');
    const buttonsText = await page.evaluate(() => Array.from(document.querySelectorAll('button')).map(b => b.textContent));
    console.log(buttonsText);
  }

  // Check if AIErrorBoundary appeared
  const boundaryCard = await page.$('#ai-error-boundary-card');
  if (boundaryCard) {
    console.log('!!! AI ERROR BOUNDARY DETECTED !!!');
    const text = await page.evaluate(el => el.textContent, boundaryCard);
    console.log('Boundary text:', text);
  } else {
    console.log('AI Modal opened without initial boundary error.');
  }

  // Let's type "hi" into AI copilot input if open
  const aiInput = await page.$('#ai-copilot-input');
  if (aiInput) {
    console.log('Sending "hi"...');
    await aiInput.type('hi');
    const sendBtn = await page.$('#ai-copilot-send-btn');
    if (sendBtn) await sendBtn.click();
    await new Promise(r => setTimeout(r, 3000));

    const checkBoundaryAgain = await page.$('#ai-error-boundary-card');
    if (checkBoundaryAgain) {
      console.log('!!! AI ERROR BOUNDARY DETECTED AFTER SENDING "hi" !!!');
    } else {
      console.log('Successfully sent "hi".');
    }
  }

  console.log('--- REPRO SUMMARY ---');
  console.log('Console Errors Count:', consoleErrors.length);
  console.log('Page Errors Count:', pageErrors.length);
  if (pageErrors.length > 0) {
    console.log('FIRST PAGE ERROR:', pageErrors[0]);
  }

  await browser.close();
})();
