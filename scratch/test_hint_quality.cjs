const http = require('http');

async function getHint(questionId, selectedOption) {
  let urlPath = `/api/ai/question-hint?questionId=${encodeURIComponent(questionId)}`;
  if (selectedOption) {
    urlPath += `&selectedOption=${encodeURIComponent(selectedOption)}`;
  }
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: urlPath,
      method: 'GET'
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch(e) {
          resolve({ error: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runQualityCheck() {
  // Fetch sample questions from API or test known question IDs
  const knownQuestionIds = ['q_wipro_001', 'q_wipro_002', 'q_wipro_003', 'q_wipro_006', 'q_wipro_026'];
  
  console.log("=== QUALITY CHECK FOR AI HINTS ===");
  for (const qId of knownQuestionIds) {
    console.log(`\n--- Question ID: ${qId} ---`);
    const res1 = await getHint(qId);
    console.log(`First Fetch (Base Hint):`, res1);

    const res2 = await getHint(qId);
    console.log(`Second Fetch (Cached Base Hint):`, res2);

    const res3 = await getHint(qId, 'C');
    console.log(`Targeted Fetch (Option C chosen):`, res3);
  }
}


runQualityCheck().catch(console.error);

