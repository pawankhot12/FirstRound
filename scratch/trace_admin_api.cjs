// API trace script — using correct Authorization: Bearer header
const userId = 'user_1788874380714_kmibk'; // pawankhot9@gmail.com super_admin

async function traceAPI(name, url) {
  try {
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${userId}` } });
    const data = await res.json();
    console.log(`\n=== ${name} (${res.status}) ===`);
    if (name === 'Admin Stats') {
      console.log('Stats:', JSON.stringify(data.stats, null, 2));
    } else if (name === 'Admin Users') {
      console.log('Success:', data.success, '| Users count:', data.users?.length);
      data.users?.forEach(u => console.log(`  - ${u.email} | ${u.role} | ${u.name}`));
    } else if (name === 'Team Members') {
      console.log('Success:', data.success, '| Members count:', data.members?.length);
      data.members?.forEach(m => console.log(`  - ${m.email} | ${m.role} | ${m.name}`));
    } else if (name === 'Admin Questions') {
      console.log('Success:', data.success, '| Questions count:', data.questions?.length);
      console.log('UsageMap keys:', Object.keys(data.usageMap || {}).length);
      data.questions?.slice(0, 3).forEach(q => console.log(`  - [${q.id}] ${q.questionText?.substring(0, 80)}... | ${q.topic} | ${q.difficulty}`));
    } else if (name === 'Admin Assessments') {
      console.log('Success:', data.success, '| Assessments count:', data.assessments?.length);
      data.assessments?.slice(0, 5).forEach(a => console.log(`  - [${a.id}] ${a.title} | status: ${a.status} | questions: ${a.questions?.length || a.questionCount || 'N/A'}`));
    } else if (name === 'QA Report') {
      console.log('Success:', data.success);
      if (data.report) {
        console.log('Verified:', data.report.verified);
        console.log('Total Tests:', data.report.totalTests);
        console.log('Total Questions:', data.report.totalQuestions);
        console.log('Duplicates:', data.report.duplicateQuestions);
      }
    }
  } catch (err) {
    console.error(`FAIL ${name}:`, err.message);
  }
}

(async () => {
  await traceAPI('Admin Stats', 'http://localhost:3000/api/admin/stats');
  await traceAPI('Admin Users', 'http://localhost:3000/api/admin/users');
  await traceAPI('Team Members', 'http://localhost:3000/api/admin/team-members');
  await traceAPI('Admin Questions', 'http://localhost:3000/api/admin/questions');
  await traceAPI('Admin Assessments', 'http://localhost:3000/api/admin/assessments');
  await traceAPI('QA Report', 'http://localhost:3000/api/admin/qa-report');
})();
