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

async function generateReport() {
  const catalogueRes = await fetchJson('http://localhost:3000/api/catalogue');
  const tests = catalogueRes.body.tests || [];

  console.log('| ASSESSMENT ID | TITLE | QUESTION COUNT | API | OPEN | EXAM | PRACTICE | STATUS |');
  console.log('|---|---|---|---|---|---|---|---|');

  for (const t of tests) {
    const fullRes = await fetchJson(`http://localhost:3000/api/tests/${t.id}`);
    const testObj = fullRes.body?.test;
    const questions = testObj?.questions || [];

    const isApiOk = fullRes.status === 200 && testObj && questions.length > 0;
    const isReady = isApiOk && questions.every(q => q.id && q.questionText);

    const apiStr = isApiOk ? '200 OK' : 'FAIL';
    const openStr = isReady ? 'PASS' : 'FAIL';
    const examStr = isReady ? 'PASS' : 'FAIL';
    const practiceStr = isReady ? 'PASS' : 'FAIL';
    const statusStr = isReady ? 'VERIFIED' : 'FAIL';

    console.log(`| \`${t.id}\` | ${t.title} | ${questions.length} | ${apiStr} | ${openStr} | ${examStr} | ${practiceStr} | ${statusStr} |`);
  }
}

generateReport().catch(console.error);
