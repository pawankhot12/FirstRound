import { quantQuestions } from './quant';
import { logicalQuestions } from './logical';
import { verbalQuestions } from './verbal';
import { diQuestions } from './di';
import { pseudocodeQuestions } from './pseudocode';
import { accentureQuestions } from './accenture';
import { cognizantQuestions } from './cognizant';
import { infosysQuestions } from './infosys';
import { tcsAdvancedQuestions } from './tcsAdvanced';
import { tcsCodingProblems } from './tcsCoding';
import { codingMockQuestions } from './codingMock';
import { wiproQuestions } from './wipro';
import { dsaQuestions } from './dsa';
import { sqlQuestions } from './sql';
import { progFundamentalsQuestions } from './progFundamentals';
import { codingOutputQuestions } from './codingOutput';
import { coreCsQuestions } from './coreCs';

export function getAllStaticCanonicalQuestions(): any[] {
  const rawBanks = [
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
    ...dsaQuestions,
    ...sqlQuestions,
    ...progFundamentalsQuestions,
    ...codingOutputQuestions,
    ...coreCsQuestions,
  ];

  return rawBanks.map((q: any) => ({
    id: q.id,
    testSeriesId: q.testSeriesId || 'cat_canonical',
    questionText: q.questionText,
    questionType: q.questionType || (q.codingConfig ? 'CODING' : 'MCQ'),
    options: Array.isArray(q.options)
      ? q.options.map((opt: any) => (typeof opt === 'string' ? { id: opt, text: opt } : opt))
      : [],
    correctOption: q.correctOption || q.correctAnswer || 'A',
    topic: q.topic || 'General',
    difficulty: q.difficulty || 'Medium',
    explanation: q.explanation || '',
    shortcutFormula: q.shortcutFormula || '',
    source: q.source || 'Static Bank',
  }));
}
