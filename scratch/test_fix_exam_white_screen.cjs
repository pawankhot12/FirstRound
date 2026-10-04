const http = require('http');

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 3000,
        method,
        path,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const parsed = data ? JSON.parse(data) : {};
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, raw: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runBugFixVerification() {
  console.log('===========================================================');
  console.log('    VERIFYING CRITICAL BUG FIX: EXAM SUBMISSION UI         ');
  console.log('===========================================================\n');

  try {
    const timestamp = Date.now();
    const Database = require('better-sqlite3');
    const path = require('path');
    const db = new Database(path.resolve(__dirname, '../firstround.db'));

    // 1. Create a test user for Exam submission
    console.log('--- Test A & B: Official Exam Submission & XP Payload ---');
    const examUserRes = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `bugfix_exam_${timestamp}@example.com`,
      name: 'Exam Bugfix Candidate',
    });
    const examUser = examUserRes.data.user;

    const testRes = await makeRequest('GET', '/api/tests/cat_foundation_quant');
    const questions = testRes.data.test?.questions || testRes.data.questions || [];
    const q1 = questions[0] || { id: 'q_quant_001', correctOption: 'A' };

    const examSubmitRes = await makeRequest('POST', '/api/tests/cat_foundation_quant/submit', {
      userId: examUser.id,
      mode: 'exam',
      responses: [{ questionId: q1.id, selectedOption: q1.correctOption || 'A', timeSpentSeconds: 12 }],
      timeTakenSeconds: 180,
    });

    console.log('Exam Submission Response Status:', examSubmitRes.status);
    console.log('Attempt Payload:', {
      id: examSubmitRes.data?.attempt?.id,
      mode: examSubmitRes.data?.attempt?.mode,
      scorePoints: examSubmitRes.data?.attempt?.scorePoints,
      attemptedQuestions: examSubmitRes.data?.attempt?.attemptedQuestions,
      correctCount: examSubmitRes.data?.attempt?.correctCount,
    });

    if (!examSubmitRes.data?.attempt?.id) {
      throw new Error('FAIL: Exam submission returned invalid attempt payload!');
    }
    if (examSubmitRes.data.attempt.mode !== 'exam') {
      throw new Error('FAIL: Submitted mode is not exam!');
    }
    if (typeof examSubmitRes.data.attempt.scorePoints !== 'number') {
      throw new Error('FAIL: scorePoints is not a valid number!');
    }
    console.log('✅ Test A & B: Exam submission payload verified valid: PASS\n');

    // 2. Practice Submission Isolation (Test G & H)
    console.log('--- Test G & H: Practice Submission Zero-XP Isolation ---');
    const pracUserRes = await makeRequest('POST', '/api/auth/login-or-register', {
      email: `bugfix_prac_${timestamp}@example.com`,
      name: 'Practice Bugfix Candidate',
    });
    const pracUser = pracUserRes.data.user;

    const pracSubmitRes = await makeRequest('POST', '/api/tests/cat_foundation_quant/submit', {
      userId: pracUser.id,
      mode: 'practice',
      responses: [{ questionId: q1.id, selectedOption: q1.correctOption || 'A', timeSpentSeconds: 15 }],
      timeTakenSeconds: 200,
    });

    const checkPracUser = db.prepare('SELECT * FROM users WHERE id = ?').get(pracUser.id);
    const pracLeague = db.prepare('SELECT * FROM weekly_standings WHERE userId = ?').get(pracUser.id);

    console.log('Practice User DB State:', {
      totalPoints: checkPracUser.totalPoints,
      weeklyXp: checkPracUser.weeklyXp,
      hasLeagueRecord: !!pracLeague,
    });

    if (checkPracUser.totalPoints !== 0 || checkPracUser.weeklyXp !== 0 || pracLeague) {
      throw new Error('FAIL: Practice attempt affected XP or League!');
    }
    console.log('✅ Test G & H: Practice mode zero-XP isolation verified: PASS\n');

    // Clean up temporary test accounts
    db.prepare("DELETE FROM users WHERE email LIKE 'bugfix_%'").run();
    db.prepare("DELETE FROM test_attempts WHERE userId LIKE 'bugfix_%'").run();
    db.prepare("DELETE FROM weekly_standings WHERE userId LIKE 'bugfix_%'").run();

    console.log('===========================================================');
    console.log('   ALL API & BACKEND BUGFIX CHECKS PASSED SUCCESSFULLY!    ');
    console.log('===========================================================');
  } catch (err) {
    console.error('\n❌ BUGFIX TEST FAILED:', err.message);
    process.exit(1);
  }
}

runBugFixVerification();
