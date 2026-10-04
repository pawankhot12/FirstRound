import { quantQuestions } from '../src/data/questionBank/quant';
import { logicalQuestions } from '../src/data/questionBank/logical';
import { verbalQuestions } from '../src/data/questionBank/verbal';
import { diQuestions } from '../src/data/questionBank/di';
import { pseudocodeQuestions } from '../src/data/questionBank/pseudocode';
import { accentureQuestions } from '../src/data/questionBank/accenture';
import { cognizantQuestions } from '../src/data/questionBank/cognizant';
import { infosysQuestions } from '../src/data/questionBank/infosys';
import { tcsAdvancedQuestions } from '../src/data/questionBank/tcsAdvanced';
import { tcsCodingProblems } from '../src/data/questionBank/tcsCoding';
import { codingMockQuestions } from '../src/data/questionBank/codingMock';
import { wiproQuestions } from '../src/data/questionBank/wipro';
import { dsaQuestions } from '../src/data/questionBank/dsa';
import { sqlQuestions } from '../src/data/questionBank/sql';
import { progFundamentalsQuestions } from '../src/data/questionBank/progFundamentals';
import { codingOutputQuestions } from '../src/data/questionBank/codingOutput';
import { coreCsQuestions } from '../src/data/questionBank/coreCs';
import { COMPANY_BLUEPRINTS } from '../src/data/blueprints/company';
import { questionSelectionEngine } from '../src/services/QuestionSelectionEngine';

const mappings: Array<{ testSeriesId: string; questionId: string; sectionName: string; orderIndex: number }> = [];

// 1. Foundation mappings
quantQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_foundation_quant', questionId: q.id, sectionName: 'Quantitative Aptitude', orderIndex: idx }));
logicalQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_foundation_logical', questionId: q.id, sectionName: 'Logical Reasoning', orderIndex: idx }));
verbalQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_foundation_verbal', questionId: q.id, sectionName: 'Verbal Ability', orderIndex: idx }));
diQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_foundation_di', questionId: q.id, sectionName: 'Data Interpretation', orderIndex: idx }));
pseudocodeQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_foundation_pseudocode', questionId: q.id, sectionName: 'Pseudocode', orderIndex: idx }));

// 2. Company banks direct mapping
accentureQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_company_accenture', questionId: q.id, sectionName: 'Accenture Cognitive', orderIndex: idx }));
cognizantQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_company_cognizant', questionId: q.id, sectionName: 'Cognizant GenC', orderIndex: idx }));
infosysQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_company_infosys', questionId: q.id, sectionName: 'Infosys Assessment', orderIndex: idx }));
tcsAdvancedQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_company_tcs', questionId: q.id, sectionName: 'TCS Advanced', orderIndex: idx }));
tcsCodingProblems.forEach((q, idx) => {
  mappings.push({ testSeriesId: 'cat_company_tcs', questionId: q.id, sectionName: 'Hands-on Coding', orderIndex: 20 + idx });
  mappings.push({ testSeriesId: 'cat_company_tcs_foundation', questionId: q.id, sectionName: 'Hands-on Coding', orderIndex: 20 + idx });
});
wiproQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_company_wipro', questionId: q.id, sectionName: 'Wipro Elite NTH', orderIndex: idx }));

// 3. Coding banks direct mapping
dsaQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_dsa', questionId: q.id, sectionName: 'DSA', orderIndex: idx }));
sqlQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_sql', questionId: q.id, sectionName: 'SQL', orderIndex: idx }));
progFundamentalsQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_prog_fundamentals', questionId: q.id, sectionName: 'Programming Fundamentals', orderIndex: idx }));
codingOutputQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_output_debug', questionId: q.id, sectionName: 'Output & Debug', orderIndex: idx }));
coreCsQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_core_cs', questionId: q.id, sectionName: 'Core CS', orderIndex: idx }));
codingMockQuestions.forEach((q, idx) => mappings.push({ testSeriesId: 'cat_coding_mock_01', questionId: q.id, sectionName: 'Technical & Coding', orderIndex: idx }));

// 4. Also map dynamic blueprint assembly questions
const fullBank = [
  ...quantQuestions,
  ...logicalQuestions,
  ...verbalQuestions,
  ...diQuestions,
  ...pseudocodeQuestions,
  ...accentureQuestions,
  ...cognizantQuestions,
  ...infosysQuestions,
  ...tcsAdvancedQuestions,
  ...tcsCodingProblems,
  ...wiproQuestions,
];

const companyBpMap: Record<string, string> = {
  bp_company_tcs_nqt_foundation: 'cat_company_tcs_foundation',
  bp_company_tcs_nqt_advanced: 'cat_company_tcs',
  bp_company_infosys_assessment: 'cat_company_infosys',
  bp_company_accenture_cognitive: 'cat_company_accenture',
  bp_company_wipro_elite_nth: 'cat_company_wipro',
  bp_company_cognizant_genc: 'cat_company_cognizant',
};

for (const [bpId, testId] of Object.entries(companyBpMap)) {
  const bp = COMPANY_BLUEPRINTS.find(b => b.id === bpId);
  if (bp) {
    const assembly = questionSelectionEngine.selectCompanyAssessmentQuestions({
      userId: 'usr_catalogue_default',
      blueprint: bp,
      questionBank: fullBank,
      previouslyAttemptedQuestionIds: [],
      allowPartialReuseWhenExhausted: true,
    });
    assembly.sectionResults.forEach(sr => {
      sr.selectedQuestions.forEach((cq: any, qIdx: number) => {
        mappings.push({
          testSeriesId: testId,
          questionId: cq.id,
          sectionName: sr.sectionName || 'General',
          orderIndex: qIdx,
        });
      });
    });
  }
}

// Compute usage map
const usageMap = new Map<string, Set<string>>();
mappings.forEach(m => {
  if (!usageMap.has(m.questionId)) usageMap.set(m.questionId, new Set());
  usageMap.get(m.questionId)!.add(m.testSeriesId);
});

// Check canonical 391
const canonical391 = [
  ...quantQuestions,
  ...logicalQuestions,
  ...verbalQuestions,
  ...diQuestions,
  ...pseudocodeQuestions,
  ...accentureQuestions,
  ...cognizantQuestions,
  ...infosysQuestions,
  ...tcsAdvancedQuestions,
  ...tcsCodingProblems,
  ...codingMockQuestions,
  ...wiproQuestions,
];

let zeroCount = 0;
let multiCount = 0;
canonical391.forEach(q => {
  const count = (usageMap.get(q.id) || new Set()).size;
  if (count === 0) zeroCount++;
  if (count > 1) multiCount++;
});

console.log('Total mappings created:', mappings.length);
console.log('Canonical 391 questions checked:');
console.log('- Zero usage count:', zeroCount);
console.log('- Multi-assessment usage count:', multiCount);
console.log('Sample usage:');
console.log('q_quant_001:', Array.from(usageMap.get('q_quant_001') || []));
console.log('q_accenture_001:', Array.from(usageMap.get('q_accenture_001') || []));
console.log('q_tcs_coding_001:', Array.from(usageMap.get('q_tcs_coding_001') || []));
