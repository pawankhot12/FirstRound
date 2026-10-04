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
  if (depth !== startDepth && (line.includes('app.') || line.includes('function') || line.includes('startServer'))) {
    if (depth < startDepth || depth > 2) {
      // console.log(`Line ${i+1}: depth ${startDepth} -> ${depth} | ${line.trim().slice(0, 50)}`);
    }
  }
});
console.log('Final depth at end of file:', depth);
