const http = require('http');

async function testFetchAllAssessments() {
  console.log('--- TESTING ALL ASSESSMENTS FOR QUESTION MAPPING & METADATA ---');
  
  // 1. Fetch catalogue
  const catalogueRes = await new Promise((resolve) => {
    http.get('http://localhost:3000/api/catalogue', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
  });

  const tests = catalogueRes.tests || [];
  console.log(`Found ${tests.length} tests in catalogue.`);

  let totalQuestionsFound = 0;
  let missingQuestionsCount = 0;
  let unnormalizedQuestionsCount = 0;

  for (const test of tests) {
    const detailRes = await new Promise((resolve) => {
      http.get(`http://localhost:3000/api/tests/${test.id}`, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
      });
    });

    if (detailRes.status !== 200 || !detailRes.data.test) {
      console.error(`❌ [${test.id}] Failed to fetch test detail: Status ${detailRes.status}`, detailRes.data);
      missingQuestionsCount++;
      continue;
    }

    const t = detailRes.data.test;
    const questions = t.questions || [];
    console.log(`✅ [${test.id}] "${t.title}" (${t.category}): ${questions.length} questions`);

    if (questions.length === 0) {
      console.error(`⚠️ [${test.id}] HAS 0 QUESTIONS!`);
      missingQuestionsCount++;
    }

    questions.forEach((q, idx) => {
      totalQuestionsFound++;
      if (!q.questionType) {
        unnormalizedQuestionsCount++;
        console.warn(`  - Q${idx + 1} (${q.id}) missing questionType!`);
      }
      if (q.questionType === 'MCQ' && (!q.options || !Array.isArray(q.options) || q.options.length === 0)) {
        console.error(`  - MCQ Q${idx + 1} (${q.id}) missing valid options array!`);
      }
    });
  }

  console.log('\n--- DIAGNOSTIC SUMMARY ---');
  console.log(`Total tests: ${tests.length}`);
  console.log(`Total questions checked: ${totalQuestionsFound}`);
  console.log(`Tests with missing/empty questions: ${missingQuestionsCount}`);
  console.log(`Questions missing explicit questionType: ${unnormalizedQuestionsCount}`);
}

testFetchAllAssessments().catch(console.error);
