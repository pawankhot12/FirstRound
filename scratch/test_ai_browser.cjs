const puppeteer = require('puppeteer');

(async () => {
  console.log('=== STARTING REAL BROWSER TEST FOR AI COPILOT ===');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  page.setViewport({ width: 1280, height: 800 });

  // Set localStorage user ID before page loads
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('firstround_uid', 'usr_student1');
  });

  const consoleErrors = [];
  const uncaughtExceptions = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      console.log('❌ BROWSER CONSOLE ERROR:', text);
      consoleErrors.push(text);
    }
  });

  page.on('pageerror', err => {
    console.error('❌ BROWSER UNCAUGHT PAGE ERROR:', err.message, err.stack);
    uncaughtExceptions.push(err);
  });

  console.log('1. Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle2' });

  // Wait 2s for data load
  await new Promise(r => setTimeout(r, 2000));

  // Check if AI Launcher button exists
  const launcher = await page.$('#floating-ai-copilot-launcher');
  if (!launcher) {
    console.error('❌ Floating AI launcher button not found after login!');
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('Page content:', bodyText.substring(0, 300));
    await browser.close();
    process.exit(1);
  }

  console.log('2. Opening AI Copilot...');
  await launcher.click();
  await new Promise(r => setTimeout(r, 1000));

  // Check if AI Error Boundary triggered
  let boundary = await page.$('#ai-error-boundary-card');
  if (boundary) {
    const errorText = await page.evaluate(el => el.textContent, boundary);
    console.error('❌ AI ERROR BOUNDARY TRIGGERED ON OPEN:', errorText);
  } else {
    console.log('✅ AI Modal opened successfully without Error Boundary.');
  }

  // Check strategy card or wait for strategy
  console.log('3. Waiting for strategy...');
  await new Promise(r => setTimeout(r, 2500));
  const strategyCard = await page.$('#ai-placement-strategy-card');
  if (strategyCard) {
    const stratText = await page.evaluate(el => el.textContent, strategyCard);
    console.log('✅ Strategy rendered:', stratText.substring(0, 100).replace(/\n/g, ' ') + '...');
  } else {
    console.log('ℹ️ No strategy card rendered (or skipped).');
  }

  // Helper to send message and wait
  async function sendMessage(text) {
    console.log(`\nSending message: "${text}"...`);
    const input = await page.$('#ai-copilot-input');
    if (!input) {
      console.error('❌ Input field not found!');
      return false;
    }
    
    // Clear input
    await page.evaluate(el => el.value = '', input);
    await input.type(text);

    const sendBtn = await page.$('#ai-copilot-send-btn');
    if (!sendBtn) {
      console.error('❌ Send button not found!');
      return false;
    }
    await sendBtn.click();

    // Wait for response
    await new Promise(r => setTimeout(r, 4000));

    const checkBoundary = await page.$('#ai-error-boundary-card');
    if (checkBoundary) {
      const errText = await page.evaluate(el => el.textContent, checkBoundary);
      console.error(`❌ AI ERROR BOUNDARY TRIGGERED AFTER "${text}":`, errText);
      return false;
    }

    // Get last assistant message text
    const assistantMsgs = await page.$$('.bg-surface.border.border-border');
    if (assistantMsgs.length > 0) {
      const lastMsgText = await page.evaluate(el => el.textContent, assistantMsgs[assistantMsgs.length - 1]);
      console.log(`✅ Received response (${lastMsgText.length} chars):`, lastMsgText.substring(0, 120).replace(/\n/g, ' ') + '...');
    }
    return true;
  }

  // 4. Test "hi"
  console.log('\n--- TESTING "hi" ---');
  await sendMessage('hi');

  // 5. Test "what should I do today?"
  console.log('\n--- TESTING "what should I do today?" ---');
  await sendMessage('what should I do today?');

  // 6. Test "prepare me for Wipro"
  console.log('\n--- TESTING "prepare me for Wipro" ---');
  await sendMessage('prepare me for Wipro');

  // 7. Check AI actions rendering & clicking action
  console.log('\n--- TESTING AI ACTION CLICK ---');
  const actionBtn = await page.$('button[id^="ai-action-card-"], button#ai-strategy-primary-action');
  if (actionBtn) {
    const actionLabel = await page.evaluate(el => el.textContent, actionBtn);
    console.log(`Clicking action button: "${actionLabel}"...`);
    await actionBtn.click();
    await new Promise(r => setTimeout(r, 1500));

    boundary = await page.$('#ai-error-boundary-card');
    if (boundary) {
      console.error('❌ AI ERROR BOUNDARY TRIGGERED AFTER ACTION CLICK');
    } else {
      console.log('✅ Action clicked without error boundary.');
    }
  } else {
    console.log('ℹ️ No action button found to click.');
  }

  // Reopen AI if closed by action click
  const isModalOpen = await page.$('#firstround-ai-copilot-card');
  if (!isModalOpen) {
    console.log('Reopening AI Modal after action execution...');
    await (await page.$('#floating-ai-copilot-launcher')).click();
    await new Promise(r => setTimeout(r, 1000));
  }

  // Close AI Copilot
  console.log('\n--- TESTING CLOSE AND REOPEN ---');
  const closeBtn = await page.$('#ai-copilot-close-btn');
  if (closeBtn) {
    await closeBtn.click();
    await new Promise(r => setTimeout(r, 500));
    console.log('Closed AI Modal.');
  }
  // Reopen AI Copilot
  await (await page.$('#floating-ai-copilot-launcher')).click();
  await new Promise(r => setTimeout(r, 1000));
  console.log('Reopened AI Modal.');

  // Check final status
  boundary = await page.$('#ai-error-boundary-card');
  console.log('\n=== FINAL BROWSER STATUS ===');
  console.log('AI Error Boundary triggered:', !!boundary);
  console.log('Console Errors count:', consoleErrors.length);
  console.log('Uncaught Page Exceptions count:', uncaughtExceptions.length);
  if (consoleErrors.length > 0) {
    console.log('Console errors:', consoleErrors);
  }
  if (uncaughtExceptions.length > 0) {
    console.log('Uncaught exceptions:', uncaughtExceptions);
  }

  await browser.close();
  process.exit(boundary || uncaughtExceptions.length > 0 ? 1 : 0);
})();
