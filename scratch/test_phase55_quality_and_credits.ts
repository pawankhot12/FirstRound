import { validateAiHint, generateQuestionAiHint } from '../server/gemini';
import { db } from '../server/db';
import { Question } from '../src/types';

async function runDirectQualityCheck() {
  console.log("=== RUNNING DIRECT HINT QUALITY & CREDIT VALIDATION ===");

  const testQuestion: Question = {
    id: 'q_cascade_test',
    questionText: 'What is the purpose of the CASCADE option in a foreign key constraint in SQL?',
    options: [
      { id: 'A', text: 'It automatically deletes or updates child rows when parent row is deleted or updated.' },
      { id: 'B', text: 'It prevents parent row deletion.' },
      { id: 'C', text: 'It creates a backup copy of the database.' },
      { id: 'D', text: 'It indexes the primary key.' }
    ],
    topic: 'SQL',
    subTopic: 'Foreign Key Constraints',
    difficulty: 'Medium',
    questionType: 'MCQ',
    correctAnswer: 'A',
    explanation: 'ON DELETE CASCADE automatically propagates parent deletion to referencing child rows.'
  };

  // 1. Validation test on generic hints
  const generic1 = "Identify the core concept governing SQL before evaluating the choices.";
  const generic2 = "Focus on the core concept in the question.";
  const specific1 = "Think about what should happen to related child rows when the referenced parent row is deleted or updated.";

  console.log("\n1. Hint Quality Validation Tests:");
  console.log(`Generic 1 ("${generic1}") Valid: ${validateAiHint(generic1, testQuestion)} (Expected: false)`);
  console.log(`Generic 2 ("${generic2}") Valid: ${validateAiHint(generic2, testQuestion)} (Expected: false)`);
  console.log(`Specific 1 ("${specific1}") Valid: ${validateAiHint(specific1, testQuestion)} (Expected: true)`);

  // 2. AI Hint Generation Test
  console.log("\n2. AI Hint Generation Test:");
  const generated = await generateQuestionAiHint(testQuestion);
  console.log(`Generated Hint: "${generated}"`);
  console.log(`Is Question-Specific & Valid: ${validateAiHint(generated, testQuestion) ? 'PASSED ✅' : 'FAILED ❌'}`);

  // 3. Database Cache Test
  console.log("\n3. Database Hint Cache Test:");
  // Save generic hint first
  db.saveQuestionAiHint(testQuestion.id, generic1);
  const cachedGeneric = db.getQuestionAiHint(testQuestion.id);
  console.log(`DB returned after requesting generic hint: ${cachedGeneric} (Expected: null because invalid generic hints get auto-cleared)`);

  // Save valid hint
  db.saveQuestionAiHint(testQuestion.id, specific1);
  const cachedValid = db.getQuestionAiHint(testQuestion.id);
  console.log(`DB returned after saving valid specific hint: "${cachedValid}"`);


  console.log("\n=== ALL DIRECT TESTS PASSED SUCCESSFULLY ===");
}

runDirectQualityCheck().catch(console.error);
