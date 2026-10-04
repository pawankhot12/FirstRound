import assert from 'assert';
import Database from 'better-sqlite3';
import { db } from '../server/db';

async function verifyAdminQuestionFlow() {
  console.log('=== Step 1: Verify Baseline Tests Intact ===');
  const quantQuestions = db.getQuestionsForTest('cat_foundation_quant');
  console.log(`Baseline Quant Test Questions Count: ${quantQuestions.length}`);
  assert.ok(quantQuestions.length > 0, 'Baseline quant test must continue loading questions');

  const tcsQuestions = db.getQuestionsForTest('cat_company_tcs');
  console.log(`Baseline TCS Test Questions Count: ${tcsQuestions.length}`);
  assert.ok(tcsQuestions.length > 0, 'Baseline TCS test must continue loading questions');

  console.log('\n=== Step 2: Create Canonical Questions for Test ===');
  const q1 = db.saveCanonicalQuestion({
    questionText: 'What is the value of 25 * 4?',
    options: ['80', '100', '120', '150'],
    correctOption: '100',
    topic: 'Quantitative Aptitude',
    difficulty: 'Easy',
    explanation: '25 multiplied by 4 equals 100.',
    companyTag: 'TCS',
  });

  const q2 = db.saveCanonicalQuestion({
    questionText: 'Find the missing number in series: 2, 4, 8, 16, ?',
    options: ['24', '30', '32', '64'],
    correctOption: '32',
    topic: 'Logical Reasoning',
    difficulty: 'Easy',
    explanation: 'Each term doubles: 16 * 2 = 32.',
    companyTag: 'TCS',
  });

  const q3 = db.saveCanonicalQuestion({
    questionText: 'Which word is a synonym of Rapid?',
    options: ['Slow', 'Fast', 'Late', 'Weak'],
    correctOption: 'Fast',
    topic: 'Verbal Ability',
    difficulty: 'Easy',
    explanation: 'Rapid means happening quickly or fast.',
    companyTag: 'TCS',
  });

  console.log(`Created Questions: ${q1.id}, ${q2.id}, ${q3.id}`);

  console.log('\n=== Step 3: Create Admin Assessment & Link Questions ===');
  const adminTest = db.createOrUpdateAssessment({
    title: 'TCS Custom Admin Assessment 2026',
    description: 'Custom assessment created by admin for TCS drive',
    category: 'company',
    companyName: 'TCS',
    companyId: 'tcs',
    durationMinutes: 30,
    totalQuestions: 3,
    difficulty: 'Easy',
    status: 'PUBLISHED',
    accessType: 'FREE',
    questionIds: [q1.id, q2.id, q3.id],
  });

  console.log('Created Admin Assessment:', adminTest.id, adminTest.title);
  assert.ok(adminTest.id.startsWith('cat_admin_'), 'Assessment ID must have cat_admin_ prefix');

  console.log('\n=== Step 4: Verify Questions Loaded via getTestById / getQuestionsForTest ===');
  const fetchedTest = db.getTestById(adminTest.id, true);
  assert.ok(fetchedTest, 'Fetched assessment must exist');
  assert.ok(fetchedTest.questions, 'Fetched assessment must contain questions array');
  
  console.log(`Loaded Questions Count: ${fetchedTest.questions.length}`);
  assert.strictEqual(fetchedTest.questions.length, 3, 'Loaded questions count must be EXACTLY 3');

  const loadedIds = fetchedTest.questions.map((q) => q.id);
  console.log('Loaded Question IDs in Order:', loadedIds);
  assert.deepStrictEqual(loadedIds, [q1.id, q2.id, q3.id], 'Questions must match exact selected IDs in exact order');

  assert.strictEqual(fetchedTest.questions[0].questionText, 'What is the value of 25 * 4?');
  assert.strictEqual(fetchedTest.questions[1].questionText, 'Find the missing number in series: 2, 4, 8, 16, ?');
  assert.strictEqual(fetchedTest.questions[2].questionText, 'Which word is a synonym of Rapid?');

  console.log('\n=== Step 5: Test Attempt Submission with Admin Assessment ===');
  const user = db.loginOrRegister(`admin_flow_test_${Date.now()}@gmail.com`, 'Admin Flow Candidate', 'IIT', 'TCS', 'SE', 'student');

  const attemptResult = db.submitDirectAttempt({
    testSeriesId: adminTest.id,
    userId: user.id,
    mode: 'exam',
    totalQuestions: 3,
    correctCount: 3,
    incorrectCount: 0,
    scorePoints: 30,
    accuracyPercentage: 100,
    timeTakenSeconds: 120,
    topicBreakdown: {
      'Quantitative Aptitude': { total: 1, correct: 1, accuracy: 100 },
      'Logical Reasoning': { total: 1, correct: 1, accuracy: 100 },
      'Verbal Ability': { total: 1, correct: 1, accuracy: 100 },
    },
  });

  console.log('Submitted Attempt Result:', attemptResult.id, 'Score:', attemptResult.scorePoints);
  assert.strictEqual(attemptResult.scorePoints, 30, 'Score points must be 30');

  console.log('\n=== Step 6: Verify Database Junction Query & Persistence ===');
  const sqlite = new Database('firstround.db');
  const junctionRows = sqlite.prepare('SELECT * FROM assessment_questions WHERE testSeriesId = ? ORDER BY orderIndex ASC').all(adminTest.id) as any[];
  console.log('Junction Table Rows:', junctionRows);
  assert.strictEqual(junctionRows.length, 3, 'Junction table must persist 3 rows');
  assert.strictEqual(junctionRows[0].questionId, q1.id);
  assert.strictEqual(junctionRows[1].questionId, q2.id);
  assert.strictEqual(junctionRows[2].questionId, q3.id);

  console.log('\n=== Step 7: Clean Up Verification Artifacts ===');
  sqlite.prepare('DELETE FROM assessment_questions WHERE testSeriesId = ?').run(adminTest.id);
  sqlite.prepare('DELETE FROM tests WHERE id = ?').run(adminTest.id);
  sqlite.prepare('DELETE FROM questions WHERE id IN (?, ?, ?)').run(q1.id, q2.id, q3.id);
  sqlite.prepare('DELETE FROM test_attempts WHERE id = ?').run(attemptResult.id);
  sqlite.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  sqlite.close();

  console.log('\n✅ ADMIN TEST QUESTION DATA FLOW VERIFIED 100% SUCCESSFULLY!');
}

verifyAdminQuestionFlow().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
