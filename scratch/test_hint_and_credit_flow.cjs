const http = require('http');

async function makeRequest(path, method = 'GET', body = null, token = 'usr_student_akhot5779') {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : '';
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'x-csrf-token': 'true',
        'Authorization': `Bearer ${token}`,
        ...(body ? { 'Content-Length': Buffer.byteLength(postData) } : {})
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(postData);
    req.end();
  });
}

async function runTestSuite() {
  console.log("=== STARTING FIRSTROUND PRACTICE HINT & ZERO-CREDIT AI TEST SUITE ===");

  const userId = 'usr_student_akhot5779'; // Test user
  const question1Id = 'q_wipro_001';
  const question2Id = 'q_wipro_002';
  const assessmentId = 'cat_company_wipro';

  const q1Obj = {
    id: question1Id,
    questionText: 'An electronic gadget with a marked price of ₹4,000 is sold after two successive discounts of 15% and 10%. What is the final selling price of the gadget?',
    options: [{ id: 'A', text: '₹3,060' }, { id: 'B', text: '₹3,000' }, { id: 'C', text: '₹3,120' }, { id: 'D', text: '₹2,980' }],
    topic: 'Quantitative Aptitude',
    subTopic: 'Discount',
    difficulty: 'Medium',
    questionType: 'MCQ',
    correctAnswer: 'A',
    explanation: 'First discount 15% on 4000 = 3400. Second discount 10% on 3400 = 3060.'
  };

  const q2Obj = {
    id: question2Id,
    questionText: 'P can complete a work in 12 days and Q in 18 days. Working on alternate days starting with P, how many days will it take?',
    options: [{ id: 'A', text: '14 1/3 days' }, { id: 'B', text: '15 days' }, { id: 'C', text: '13 2/3 days' }, { id: 'D', text: '14 2/3 days' }],
    topic: 'Quantitative Aptitude',
    subTopic: 'Time & Work',
    difficulty: 'Medium',
    questionType: 'MCQ',
    correctAnswer: 'A',
    explanation: '2-day cycle = 5 units. 7 cycles = 35 units in 14 days. Remaining 1 unit taken by P in 1/3 day.'
  };

  // 1. Get Hint for Question 1
  console.log("\n1. Fetching AI Hint for Question 1...");
  const hintRes = await makeRequest(`/api/ai/question-hint?questionId=${question1Id}`);
  console.log("Hint Response:", hintRes.body);
  if (hintRes.body.hint) {
    const isGeneric = /focus on the core concept|identify the core concept|identify the key concept|think carefully/i.test(hintRes.body.hint);
    console.log(`Hint Question-Specific Check: ${!isGeneric ? 'PASSED ✅' : 'FAILED ❌ (Generic hint detected)'}`);
  }

  // 2. Open Deep AI for Question 1 (init - 0 credits)
  console.log("\n2. Opening Deep AI (init) for Question 1...");
  const initRes1 = await makeRequest('/api/ai/deep-help', 'POST', {
    userId,
    question: q1Obj,
    action: 'init',
    mode: 'practice',
    assessmentId
  });
  console.log("Init Q1 Response:", initRes1.body);

  // 3. Request Solution for Question 1 (1 credit)
  console.log("\n3. Requesting Solution for Question 1...");
  const solRes1 = await makeRequest('/api/ai/deep-help', 'POST', {
    userId,
    question: q1Obj,
    requestType: 'solution',
    mode: 'practice',
    assessmentId
  });
  console.log("Solution Q1 Response Status:", solRes1.status, "Unlocked:", solRes1.body.isUnlocked, "Credits Left:", solRes1.body.creditsLeft);

  // 4. Request Deep Chat for Question 1 (0 additional credits)
  console.log("\n4. Requesting Deep Chat for Question 1 (unlocked session)...");
  const chatRes1 = await makeRequest('/api/ai/deep-help', 'POST', {
    userId,
    question: q1Obj,
    requestType: 'chat',
    studentQuestion: 'Can you explain step 1 again?',
    mode: 'practice',
    assessmentId
  });
  console.log("Chat Q1 Response Status:", chatRes1.status, "Credits Left:", chatRes1.body.creditsLeft);

  // 5. Test Question 2 with 0 credits
  const zeroCreditUserId = 'usr_student_akhot5779';
  
  console.log("\n5. Exhausting remaining credits for test user...");
  for (let i = 0; i < 10; i++) {
    await makeRequest('/api/ai/deep-help', 'POST', {
      userId: zeroCreditUserId,
      question: { ...q2Obj, id: `exhaust_q_${i}` },
      requestType: 'solution',
      mode: 'practice',
      assessmentId
    }, zeroCreditUserId);
  }
  
  console.log("\nTesting Question 2 Deep AI with 0 Credits...");
  // Request Solution for Q2 (Not unlocked yet)
  const solRes2 = await makeRequest('/api/ai/deep-help', 'POST', {
    userId: zeroCreditUserId,
    question: q2Obj,
    requestType: 'solution',
    mode: 'practice',
    assessmentId
  }, zeroCreditUserId);
  console.log("Solution Q2 Response Status:", solRes2.status, "(Expected: 402)");
  console.log("Solution Q2 Response Body:", solRes2.body);

  // Request Chat for Q2 (Not unlocked yet)
  const chatRes2 = await makeRequest('/api/ai/deep-help', 'POST', {
    userId: zeroCreditUserId,
    question: q2Obj,
    requestType: 'chat',
    studentQuestion: 'How does alternating days work?',
    mode: 'practice',
    assessmentId
  }, zeroCreditUserId);
  console.log("Chat Q2 Response Status:", chatRes2.status, "(Expected: 402)");
  console.log("Chat Q2 Response Body:", chatRes2.body);

  // Request Init for Q2 with 0 credits (Should succeed with 0 credits consumed!)
  const initRes2 = await makeRequest('/api/ai/deep-help', 'POST', {
    userId: zeroCreditUserId,
    question: q2Obj,
    action: 'init',
    mode: 'practice',
    assessmentId
  }, zeroCreditUserId);
  console.log("Init Q2 Response Status:", initRes2.status, "(Expected: 200)");
  console.log("Init Q2 Response Body:", initRes2.body);

  // 6. Test re-accessing already unlocked Question 1 even when user has 0 credits
  console.log("\n6. Re-accessing unlocked Question 1 for 0-credit session...");
  const unlockedRes1 = await makeRequest('/api/ai/deep-help', 'POST', {
    userId: zeroCreditUserId,
    question: q1Obj,
    requestType: 'solution',
    mode: 'practice',
    assessmentId
  }, zeroCreditUserId);
  console.log("Unlocked Q1 Re-access Status:", unlockedRes1.status, "Unlocked:", unlockedRes1.body.isUnlocked);

  console.log("\n=== TEST SUITE COMPLETED ===");
}

runTestSuite().catch(console.error);
