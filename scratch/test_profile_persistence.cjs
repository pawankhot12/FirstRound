const http = require('http');

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:3000${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testProfileSave() {
  const userId = 'usr_superadmin_pawankhot';
  const headers = { 'x-user-id': userId };

  console.log('1. Fetching initial profile...');
  const initRes = await request('GET', `/api/auth/profile/${userId}`, null, headers);
  console.log('Initial user profile:', {
    name: initRes.body?.user?.name,
    targetCompany: initRes.body?.user?.targetCompany,
    targetRole: initRes.body?.user?.targetRole,
    totalPoints: initRes.body?.user?.totalPoints,
  });

  console.log('\n2. Updating profile (Target Company -> "Amazon", Target Role -> "Data Analyst", Name -> "Pawan Khot (Super Admin)")...');
  const patchRes = await request('PATCH', `/api/users/${userId}`, {
    name: 'Pawan Khot (Super Admin)',
    targetCompany: 'Amazon',
    targetRole: 'Data Analyst'
  }, headers);

  console.log('Patch response:', patchRes.status, patchRes.body?.user?.targetCompany, patchRes.body?.user?.targetRole);

  console.log('\n3. Re-fetching profile after PATCH (simulating page reload)...');
  const reloadRes = await request('GET', `/api/auth/profile/${userId}`, null, headers);
  console.log('Reloaded user profile:', {
    name: reloadRes.body?.user?.name,
    targetCompany: reloadRes.body?.user?.targetCompany,
    targetRole: reloadRes.body?.user?.targetRole,
    totalPoints: reloadRes.body?.user?.totalPoints,
  });

  console.log('\n4. Simulating bridgeSession login-or-register call...');
  const bridgeRes = await request('POST', '/api/auth/login-or-register', {
    email: 'pawankhot9@gmail.com',
    name: 'Pawan Khot (Super Admin)',
  }, headers);
  console.log('Bridge response profile:', {
    name: bridgeRes.body?.user?.name,
    targetCompany: bridgeRes.body?.user?.targetCompany,
    targetRole: bridgeRes.body?.user?.targetRole,
  });
}

testProfileSave().catch(console.error);
