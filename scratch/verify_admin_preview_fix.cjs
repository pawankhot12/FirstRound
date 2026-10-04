const { getAllStaticCanonicalQuestions } = require('../src/data/questionBank/staticFallback');

const allBanks = getAllStaticCanonicalQuestions();

const coding6 = [
  { id: 'cat_coding_core_cs', name: 'Core CS Fundamentals', expected: 35 },
  { id: 'cat_coding_dsa', name: 'DSA & Problem Solving', expected: 30 },
  { id: 'cat_coding_mock_01', name: 'FirstRound Coding & Technical Mock', expected: 25 },
  { id: 'cat_coding_output_debug', name: 'Coding Output & Debugging', expected: 20 },
  { id: 'cat_coding_prog_fundamentals', name: 'Programming Fundamentals', expected: 25 },
  { id: 'cat_coding_sql', name: 'SQL Assessment', expected: 25 },
];

console.log(`Total questions in allBanks: ${allBanks.length}`);

for (const item of coding6) {
  const matched = allBanks.filter((q) => q.testSeriesId === item.id);
  const status = matched.length === item.expected ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${item.id} | ${item.name} | Found: ${matched.length} | Expected: ${item.expected}`);
}
