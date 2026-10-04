const fs = require('fs');
const path = require('path');

// Let's dynamically read all questionBank files
const qbDir = path.resolve(__dirname, '../src/data/questionBank');
const files = fs.readdirSync(qbDir).filter(f => f.endsWith('.ts') && f !== 'staticFallback.ts');

console.log('Found question bank files:', files);

// Let's use tsx or regex to extract questions from each file
for (const file of files) {
  const content = fs.readFileSync(path.join(qbDir, file), 'utf-8');
  // Match question id: '...' or id: "..."
  const idMatches = [...content.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
  // Filter only question-like ids
  const qIds = idMatches.filter(id => id.startsWith('q_') || id.startsWith('cod_') || id.startsWith('tcs_') || id.startsWith('acc_') || id.startsWith('cog_') || id.startsWith('inf_') || id.startsWith('wip_'));
  console.log(`${file}: ${qIds.length} questions. Sample: ${qIds.slice(0, 3).join(', ')}`);
}
