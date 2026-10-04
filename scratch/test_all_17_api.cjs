const http = require('http');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function validateAll17() {
  const catalogueRes = await fetchJson('http://localhost:3000/api/catalogue');
  const tests = catalogueRes.body.tests || [];
  console.log(`Checking ${tests.length} production assessments...\n`);

  let passCount = 0;
  let failCount = 0;

  for (const t of tests) {
    const fullRes = await fetchJson(`http://localhost:3000/api/tests/${t.id}`);
    const testObj = fullRes.body?.test;
    const questions = testObj?.questions || [];

    const issues = [];
    if (fullRes.status !== 200) issues.push(`HTTP status ${fullRes.status}`);
    if (!testObj) issues.push('Missing test object');
    if (!testObj?.title) issues.push('Missing title');
    if (questions.length === 0) issues.push('0 questions returned');
    
    // Validate each question
    let nullOrInvalid = 0;
    let missingOptions = 0;
    let missingType = 0;

    for (const q of questions) {
      if (!q || !q.id || !q.questionText) {
        nullOrInvalid++;
      }
      if (q.questionType !== 'CODING' && (!Array.isArray(q.options) || q.options.length === 0)) {
        missingOptions++;
      }
      if (!q.questionType) {
        missingType++;
      }
    }

    if (nullOrInvalid > 0) issues.push(`${nullOrInvalid} invalid question objects`);
    if (missingOptions > 0) issues.push(`${missingOptions} MCQs missing options`);
    if (missingType > 0) issues.push(`${missingType} questions missing questionType`);

    if (issues.length === 0) {
      console.log(`[PASS] ${t.id} | "${t.title}" | Q Count: ${questions.length} | Status: ${t.status}`);
      passCount++;
    } else {
      console.log(`[FAIL] ${t.id} | "${t.title}" | Q Count: ${questions.length} | Issues: ${issues.join(', ')}`);
      failCount++;
    }
  }

  console.log(`\nSummary: ${passCount} PASSED, ${failCount} FAILED.`);
}

validateAll17().catch(console.error);
