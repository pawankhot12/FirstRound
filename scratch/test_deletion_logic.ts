import { db } from '../server/db';

console.log('Testing Assessment Deletion logic...');

// 1. Create a dummy test
const testId = 'cat_admin_test_delete_me_' + Date.now();
const testObj = {
  id: testId,
  title: 'Temporary Deletion Test',
  description: 'Test assessment for deletion verification',
  category: 'Foundation',
  roleCategory: 'Quantitative Aptitude',
  companyName: 'Test Corp',
  durationMinutes: 30,
  passingScore: 60,
  totalQuestions: 2,
  status: 'DRAFT',
  accessType: 'FREE',
};

db.createOrUpdateAssessment(testObj);
console.log('Created test:', testId);

// 2. Add an orphan question
const orphanQId = 'q_orphan_' + Date.now();
db.saveCanonicalQuestion({
  id: orphanQId,
  testSeriesId: testId,
  questionText: 'Orphan question test text',
  options: [{ id: 'A', text: 'Opt A' }, { id: 'B', text: 'Opt B' }],
  correctOption: 'A',
  explanation: 'Exp',
  topic: 'Math',
  difficulty: 'Easy',
  type: 'MCQ',
});

// Also link shared static question q_quant_001 (which is also referenced by Foundation Quant test)
const stmt = (db as any).sqliteDb.prepare('INSERT OR IGNORE INTO assessment_questions (testSeriesId, questionId, sectionName, orderIndex) VALUES (?, ?, ?, ?)');
stmt.run(testId, 'q_quant_001', 'Quant', 0);

console.log('Linked q_quant_001 (shared) and', orphanQId, '(orphan) to test', testId);

// Verify before deletion
const countBefore = db.getCanonicalQuestionCount();
console.log('Question bank count before delete:', countBefore);

// 3. Delete assessment
const deleteRes = db.deleteAssessmentWithCascade(testId);
console.log('Delete result:', deleteRes);

// Verify after deletion
const countAfter = db.getCanonicalQuestionCount();
console.log('Question bank count after delete:', countAfter);

// Check if q_quant_001 still exists
const qQuant1Exists = db.getAllCanonicalQuestions().some(q => q.id === 'q_quant_001');
console.log('Shared question q_quant_001 exists (should be true):', qQuant1Exists);

// Check if orphanQId was deleted
const orphanExists = db.getAllCanonicalQuestions().some(q => q.id === orphanQId);
console.log('Orphan question exists (should be false):', orphanExists);

// Check if test was removed
const testExists = (db as any).sqliteDb.prepare('SELECT COUNT(*) as c FROM tests WHERE id = ?').get(testId).c;
console.log('Test in database (should be 0):', testExists);
