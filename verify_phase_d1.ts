import { db } from './server/db';
import { CATALOGUE_TESTS } from './server/data/catalogueData';

function runTests() {
  console.log('--- Phase D1 Verification ---');
  
  // 1. New user (Unranked)
  const newUser = db.loginOrRegister('newuser@example.com', 'New User');
  const lbNew = db.getLeaderboard();
  const entryNew = lbNew.find(u => u.userId === newUser.id);
  console.log('New User in Leaderboard?', !!entryNew);
  console.log('New User Rating:', entryNew?.competitiveRating || 'UNRANKED');
  
  // 2. Practice Isolation
  const practiceUser = db.loginOrRegister('practice@example.com', 'Practice User');
  const testSeriesId = CATALOGUE_TESTS[0].id;
  const testQuestions = db.getQuestionsForTest(testSeriesId);
  const practiceResponses = testQuestions.map(q => ({
    questionId: q.id,
    selectedOption: q.correctOption,
    timeSpentSeconds: 30
  }));
  
  db.submitTest({
    userId: practiceUser.id,
    testSeriesId,
    mode: 'practice',
    responses: practiceResponses,
    timeTakenSeconds: 300
  });
  
  const lbPractice = db.getLeaderboard().find(u => u.userId === practiceUser.id);
  console.log('Practice User Rating:', lbPractice?.competitiveRating || 'UNRANKED');
  console.log('Practice User XP (totalPoints):', lbPractice?.totalPoints);
  
  // 3. One Exam
  db.submitTest({
    userId: newUser.id,
    testSeriesId,
    mode: 'exam',
    responses: practiceResponses,
    timeTakenSeconds: 300
  });
  const lbExam1 = db.getLeaderboard().find(u => u.userId === newUser.id);
  console.log('One Exam User Rating:', lbExam1?.competitiveRating);
  console.log('One Exam User XP:', lbExam1?.totalPoints);
  
  // 4. Exam Retake (Worse Score)
  const worseResponses = testQuestions.map(q => ({
    questionId: q.id,
    selectedOption: q.correctOption === 'A' ? 'B' : 'A', // mostly wrong
    timeSpentSeconds: 30
  }));
  db.submitTest({
    userId: newUser.id,
    testSeriesId,
    mode: 'exam',
    responses: worseResponses,
    timeTakenSeconds: 300
  });
  const lbExamWorse = db.getLeaderboard().find(u => u.userId === newUser.id);
  console.log('Retake Worse Rating (should be same):', lbExamWorse?.competitiveRating);
  console.log('Retake Worse XP (should increase):', lbExamWorse?.totalPoints);
  
  // 5. Tie Case
  const tieUser = db.loginOrRegister('tie@example.com', 'Tie User');
  db.submitTest({
    userId: tieUser.id,
    testSeriesId,
    mode: 'exam',
    responses: practiceResponses, // identical responses to newUser's first attempt
    timeTakenSeconds: 300
  });
  
  // To make rating identical but XP different, we'll let newUser have higher XP due to retake
  const fullLb = db.getLeaderboard();
  const u1 = fullLb.find(u => u.userId === newUser.id);
  const u2 = fullLb.find(u => u.userId === tieUser.id);
  
  console.log('Tie Test - User 1 Rating:', u1?.competitiveRating, 'XP:', u1?.totalPoints, 'Rank:', u1?.rank);
  console.log('Tie Test - User 2 Rating:', u2?.competitiveRating, 'XP:', u2?.totalPoints, 'Rank:', u2?.rank);
  console.log('Are ranks distinct?', u1?.rank !== u2?.rank);
  
  console.log('--- Verification Complete ---');
}

runTests();
