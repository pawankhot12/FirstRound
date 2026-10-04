const fs = require('fs');
const code = fs.readFileSync('server.ts', 'utf8');
let depth = 0;
const lines = code.split('\n');
lines.forEach((line, i) => {
  const startDepth = depth;
  for (const char of line) {
    if (char === '{') depth++;
    if (char === '}') depth--;
  }
  console.log(`Line ${i+1}: start=${startDepth}, end=${depth} | ${line.trim().slice(0, 50)}`);
});
