const fs = require('fs');
const path = require('path');

// Read RevisionVaultView.tsx content
const filePath = path.resolve(__dirname, '../src/components/RevisionVaultView.tsx');
const content = fs.readFileSync(filePath, 'utf8');

// Find AI Hint section
const lines = content.split('\n');
const hintStart = lines.findIndex(l => l.includes('Automatic AI Hint Box'));
console.log('AI Hint section code around line', hintStart + 1);
console.log(lines.slice(hintStart, hintStart + 45).join('\n'));
