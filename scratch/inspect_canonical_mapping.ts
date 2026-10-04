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

console.log('=== 391 CANONICAL QUESTIONS BREAKDOWN ===');
console.log('quantQuestions:', quantQuestions.length); // 25 -> cat_foundation_quant
console.log('logicalQuestions:', logicalQuestions.length); // 25 -> cat_foundation_logical
console.log('verbalQuestions:', verbalQuestions.length); // 25 -> cat_foundation_verbal
console.log('diQuestions:', diQuestions.length); // 25 -> cat_foundation_di
console.log('pseudocodeQuestions:', pseudocodeQuestions.length); // 25 -> cat_foundation_pseudocode
console.log('accentureQuestions:', accentureQuestions.length); // 89 -> cat_company_accenture
console.log('cognizantQuestions:', cognizantQuestions.length); // 61 -> cat_company_cognizant
console.log('infosysQuestions:', infosysQuestions.length); // 43 -> cat_company_infosys
console.log('tcsAdvancedQuestions:', tcsAdvancedQuestions.length); // 20 -> cat_company_tcs
console.log('tcsCodingProblems:', tcsCodingProblems.length); // 2 -> cat_company_tcs / cat_company_tcs_foundation
console.log('codingMockQuestions:', codingMockQuestions.length); // 25 -> cat_coding_mock_01
console.log('wiproQuestions:', wiproQuestions.length); // 26 -> cat_company_wipro

const sum391 = quantQuestions.length + logicalQuestions.length + verbalQuestions.length + diQuestions.length + pseudocodeQuestions.length + accentureQuestions.length + cognizantQuestions.length + infosysQuestions.length + tcsAdvancedQuestions.length + tcsCodingProblems.length + codingMockQuestions.length + wiproQuestions.length;
console.log('SUM of 12 static banks:', sum391);

console.log('\n=== OTHER CODING/TECHNICAL BANKS ===');
console.log('dsaQuestions:', dsaQuestions.length); // 30 -> cat_coding_dsa
console.log('sqlQuestions:', sqlQuestions.length); // 25 -> cat_coding_sql
console.log('progFundamentalsQuestions:', progFundamentalsQuestions.length); // 25 -> cat_coding_prog_fundamentals
console.log('codingOutputQuestions:', codingOutputQuestions.length); // 20 -> cat_coding_output_debug
console.log('coreCsQuestions:', coreCsQuestions.length); // 35 -> cat_coding_core_cs

const sumCoding = dsaQuestions.length + sqlQuestions.length + progFundamentalsQuestions.length + codingOutputQuestions.length + coreCsQuestions.length;
console.log('SUM of 5 coding banks:', sumCoding);
console.log('GRAND TOTAL across all 17 banks:', sum391 + sumCoding);
