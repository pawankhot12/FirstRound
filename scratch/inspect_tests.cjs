const http = require('http');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  const list = await fetchJson('http://localhost:3000/api/tests');
  console.log('Total tests from /api/tests:', list.tests?.length);

  for (const t of list.tests) {
    const detail = await fetchJson(`http://localhost:3000/api/tests/${t.id}`);
    const questions = detail.test?.questions || [];
    console.log(`\nTest ID: ${t.id} | Title: "${t.title}" | Q Count: ${questions.length}`);
    if (questions.length === 0) {
      console.log('  ⚠️ WARNING: NO QUESTIONS RETURNED!');
    } else {
      const qTypes = [...new Set(questions.map(q => q.questionType))];
      console.log(`  Question Types: ${qTypes.join(', ')}`);
      const nullQuestions = questions.filter(q => !q || !q.id);
      if (nullQuestions.length > 0) {
        console.log(`  ⚠️ WARNING: ${nullQuestions.length} null or invalid question objects!`);
      }
      const firstQ = questions[0];
      console.log(`  First Question ID: ${firstQ?.id}, Type: ${firstQ?.questionType}, Has Options: ${Array.isArray(firstQ?.options)}, Options Count: ${firstQ?.options?.length}`);
    }
  }
}

main().catch(console.error);
