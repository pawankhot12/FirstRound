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

const list = [
  { name: 'quant', q: quantQuestions },
  { name: 'logical', q: logicalQuestions },
  { name: 'verbal', q: verbalQuestions },
  { name: 'di', q: diQuestions },
  { name: 'pseudocode', q: pseudocodeQuestions },
  { name: 'accenture', q: accentureQuestions },
  { name: 'cognizant', q: cognizantQuestions },
  { name: 'infosys', q: infosysQuestions },
  { name: 'tcsAdvanced', q: tcsAdvancedQuestions },
  { name: 'tcsCoding', q: tcsCodingProblems },
  { name: 'codingMock', q: codingMockQuestions },
  { name: 'wipro', q: wiproQuestions },
  { name: 'dsa', q: dsaQuestions },
  { name: 'sql', q: sqlQuestions },
  { name: 'progFundamentals', q: progFundamentalsQuestions },
  { name: 'codingOutput', q: codingOutputQuestions },
  { name: 'coreCs', q: coreCsQuestions },
];

let total = 0;
const unique = new Set();
for (const item of list) {
  console.log(`${item.name.padEnd(20)}: ${item.q.length}`);
  total += item.q.length;
  item.q.forEach(x => unique.add(x.id));
}

console.log('---');
console.log('Total array items:', total);
console.log('Total unique IDs:', unique.size);
