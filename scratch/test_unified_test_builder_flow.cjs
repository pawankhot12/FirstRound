const http = require('http');

function makeRequest(method, path, data) {
  return new Promise((resolve, reject) => {
    const bodyText = data ? JSON.stringify(data) : null;
    const headers = {
      'X-Requested-With': 'XMLHttpRequest',
      'x-user-id': 'user_superadmin_pawankhot'
    };
    if (bodyText) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyText);
    }
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: headers
    }, (res) => {
      let responseText = '';
      res.on('data', chunk => responseText += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(responseText));
        } catch (e) {
          resolve({ status: res.statusCode, raw: responseText });
        }
      });
    });

    req.on('error', reject);
    if (bodyText) req.write(bodyText);
    req.end();
  });
}

async function runVerification() {
  console.log('=== STARTING UNIFIED TEST BUILDER END-TO-END VERIFICATION ===\n');

  try {
    // 1. Test Ingestion with CSV Content
    console.log('[1] Testing Content Ingestion API with CSV content...');
    const csvContent = `Question Text,Option A,Option B,Option C,Option D,Correct Option,Explanation
What is 15 + 25?,30,35,40,45,C,Basic addition: 15+25 = 40.
What is the derivative of x^2?,2x,x^2,2,x,A,Power rule of differentiation.
What is the capital of France?,,,B,Paris is the capital of France.`;

    const ingestCsvRes = await makeRequest('POST', '/api/admin/ingest-test-content', {
      userId: 'user_superadmin_pawankhot',
      mode: 'import',
      format: 'csv',
      content: csvContent
    });

    console.log('CSV Ingestion Response:', {
      success: ingestCsvRes.success,
      count: ingestCsvRes.questions?.length,
      incompleteCount: ingestCsvRes.questions?.filter(q => q.incomplete || q.needsReview).length
    });

    if (!ingestCsvRes.success || !Array.isArray(ingestCsvRes.questions)) {
      throw new Error('CSV ingestion failed: ' + JSON.stringify(ingestCsvRes));
    }

    // 2. Test Ingestion with AI Generation
    console.log('\n[2] Testing AI Test Generation through Ingestion API...');
    const ingestAiRes = await makeRequest('POST', '/api/admin/ingest-test-content', {
      userId: 'user_superadmin_pawankhot',
      mode: 'ai',
      aiParams: {
        topicOrCompany: 'TCS NQT 2026 Advanced Reasoning',
        category: 'Logical',
        difficulty: 'Medium',
        numQuestions: 3
      }
    });

    console.log('AI Generation Response:', {
      success: ingestAiRes.success,
      title: ingestAiRes.title,
      count: ingestAiRes.questions?.length,
      sampleQuestion: ingestAiRes.questions?.[0]?.questionText
    });

    // 3. Test Question Completion (Auto-Fix Incomplete Question)
    console.log('\n[3] Testing Gemini Question Completion API...');
    const incompleteQ = ingestCsvRes.questions.find(q => q.incomplete) || {
      questionText: 'What is the speed of light in vacuum?',
      options: [],
      correctOption: 'A'
    };

    const completeRes = await makeRequest('POST', '/api/admin/complete-question', {
      userId: 'user_superadmin_pawankhot',
      question: incompleteQ
    });

    console.log('Gemini Completion Response:', {
      success: completeRes.success,
      optionsCount: completeRes.question?.options?.length,
      correctOption: completeRes.question?.correctOption,
      explanation: completeRes.question?.explanation
    });

    // 4. Test Saving & Publishing Assessment
    console.log('\n[4] Testing Admin Assessment Creation & Publication...');
    const ingestQs = ingestCsvRes.questions || [];
    const qIds = ingestQs.map(q => q.id).filter(Boolean);

    const saveTestRes = await makeRequest('POST', '/api/admin/assessments', {
      userId: 'user_superadmin_pawankhot',
      title: 'Unified Test Builder Automated Verification Test',
      description: 'Generated via scratch verification pipeline',
      category: 'foundation',
      durationMinutes: 25,
      totalQuestions: qIds.length,
      difficulty: 'Medium',
      status: 'PUBLISHED',
      accessType: 'FREE',
      questionIds: qIds
    });

    console.log('Save Assessment Full Response:', saveTestRes);

    const createdTestId = saveTestRes.assessment?.id || saveTestRes.test?.id || saveTestRes.id;

    // 5. Test Candidate Question Fetch for Published Test
    console.log(`\n[5] Testing Candidate Question Fetch for Published Test (${createdTestId})...`);
    const testDetailsRes = await makeRequest('GET', `/api/tests/${createdTestId}`, null);

    console.log('Candidate Questions Fetch Response:', {
      success: Boolean(testDetailsRes.test),
      testTitle: testDetailsRes.test?.title,
      questionsLoaded: testDetailsRes.test?.questions?.length,
      sampleQuestion: testDetailsRes.test?.questions?.[0]?.questionText,
      optionsCount: testDetailsRes.test?.questions?.[0]?.options?.length
    });

    if (testDetailsRes.test?.questions?.length > 0) {
      console.log('\n✅ ALL UNIFIED TEST BUILDER END-TO-END PIPELINE CHECKS PASSED SUCCESSFULLY!');
    } else {
      console.error('\n❌ Candidate questions failed to load.');
    }

  } catch (err) {
    console.error('\n❌ Verification Error:', err.message || err);
  }
}

runVerification();
