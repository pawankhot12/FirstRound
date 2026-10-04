const { dsaQuestions } = require('../src/data/questionBank/dsa');
const { sqlQuestions } = require('../src/data/questionBank/sql');
const { progFundamentalsQuestions } = require('../src/data/questionBank/progFundamentals');
const { codingOutputQuestions } = require('../src/data/questionBank/codingOutput');
const { coreCsQuestions } = require('../src/data/questionBank/coreCs');
const { codingMockQuestions } = require('../src/data/questionBank/codingMock');

const coding6 = [
  { id: 'cat_coding_core_cs', name: 'Core CS Fundamentals', expected: 35, bank: coreCsQuestions },
  { id: 'cat_coding_dsa', name: 'DSA & Problem Solving', expected: 30, bank: dsaQuestions },
  { id: 'cat_coding_mock_01', name: 'FirstRound Coding & Technical Mock', expected: 25, bank: codingMockQuestions },
  { id: 'cat_coding_output_debug', name: 'Coding Output & Debugging', expected: 20, bank: codingOutputQuestions },
  { id: 'cat_coding_prog_fundamentals', name: 'Programming Fundamentals', expected: 25, bank: progFundamentalsQuestions },
  { id: 'cat_coding_sql', name: 'SQL Assessment', expected: 25, bank: sqlQuestions },
];

for (const item of coding6) {
  console.log(`\nAssessment: ${item.id} (${item.name})`);
  console.log(`  Actual Bank Count: ${item.bank.length} | Expected: ${item.expected}`);
  if (item.bank.length > 0) {
    const sample = item.bank[0];
    console.log(`  Sample Question ID: ${sample.id}, testSeriesId: ${sample.testSeriesId}, source: ${sample.source}, questionType: ${sample.questionType}`);
  }
}
