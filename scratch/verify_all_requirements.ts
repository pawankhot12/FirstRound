import { db } from '../server/db';

console.log('=== VERIFYING FINAL ADMIN CLEANUP IMPLEMENTATION ===');

// A. Question count verification
const canonicalCount = db.getCanonicalQuestionCount();
const stats = db.getAdminStats();
console.log('[VERIFY A] Canonical question bank count:', canonicalCount);
console.log('[VERIFY A] Admin stats totalQuestions:', stats.totalQuestions);

if (canonicalCount === stats.totalQuestions) {
  console.log('✅ Question Bank count is unified and database-backed!');
} else {
  console.error('❌ Mismatch between canonical count and admin stats totalQuestions');
}

// B. Test count verification
const testsCountInDb = (db as any).sqliteDb.prepare('SELECT COUNT(*) as c FROM tests WHERE (is_test = 0 OR is_test IS NULL)').get().c;
console.log('[VERIFY B] Tests count in database:', testsCountInDb);
console.log('[VERIFY B] Admin stats totalTestSeries:', stats.totalTestSeries);

if (testsCountInDb === stats.totalTestSeries) {
  console.log('✅ Active Test Series count is unified and database-backed!');
} else {
  console.error('❌ Mismatch between DB tests count and admin stats totalTestSeries');
}

// C. Assessment deletion with shared vs orphan questions
const testId = 'cat_admin_e2e_verify_' + Date.now();
db.createOrUpdateAssessment({
  id: testId,
  title: 'TCS NQT Foundation Mock Verification Test',
  description: 'Verification test for deletion cascade',
  category: 'Foundation',
  roleCategory: 'Quantitative Aptitude',
  companyName: 'TCS',
  durationMinutes: 45,
  passingScore: 70,
  totalQuestions: 2,
  status: 'DRAFT',
  accessType: 'FREE',
});

const orphanQId = 'q_e2e_orphan_' + Date.now();
db.saveCanonicalQuestion({
  id: orphanQId,
  testSeriesId: testId,
  questionText: 'E2E Verification Orphan Question Text',
  options: [{ id: 'A', text: 'Option A' }, { id: 'B', text: 'Option B' }],
  correctOption: 'A',
  explanation: 'Explanation for orphan Q',
  topic: 'Quantitative',
  difficulty: 'Easy',
  type: 'MCQ',
});

// Link shared question q_quant_001
const linkStmt = (db as any).sqliteDb.prepare('INSERT OR IGNORE INTO assessment_questions (testSeriesId, questionId, sectionName, orderIndex) VALUES (?, ?, ?, ?)');
linkStmt.run(testId, 'q_quant_001', 'Quant', 0);

const qCountBefore = db.getCanonicalQuestionCount();
const testCountBefore = db.getAdminStats().totalTestSeries;

console.log('[VERIFY C] Count before delete -> Questions:', qCountBefore, 'Tests:', testCountBefore);

const deleteRes = db.deleteAssessmentWithCascade(testId);
console.log('[VERIFY C] Delete operation response:', deleteRes);

const qCountAfter = db.getCanonicalQuestionCount();
const testCountAfter = db.getAdminStats().totalTestSeries;

console.log('[VERIFY C] Count after delete -> Questions:', qCountAfter, 'Tests:', testCountAfter);

const sharedStillExists = db.getAllCanonicalQuestions().some(q => q.id === 'q_quant_001');
const orphanDeleted = !db.getAllCanonicalQuestions().some(q => q.id === orphanQId);

if (deleteRes.success && sharedStillExists && orphanDeleted && qCountAfter === qCountBefore - 1 && testCountAfter === testCountBefore - 1) {
  console.log('✅ Assessment deletion, cascade, shared question protection, and count recalculation VERIFIED!');
} else {
  console.error('❌ Deletion verification check failed!', { deleteRes, sharedStillExists, orphanDeleted, qCountBefore, qCountAfter, testCountBefore, testCountAfter });
}

console.log('=== ALL VERIFICATIONS COMPLETE ===');
