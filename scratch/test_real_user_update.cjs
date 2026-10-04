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

async function runTest() {
  const userId = 'user_1789487767693_papv1'; // Ashutosh Khot (Student)
  const headers = { 'Authorization': `Bearer ${userId}` };

  console.log('1. Fetching profile before update...');
  const initRes = await request('GET', `/api/auth/profile/${userId}`, null, headers);
  console.log('Profile before:', initRes.body?.user);

  console.log('\n2. Updating profile to Target Company: "TCS", Target Role: "Software Developer", Name: "Ashutosh Khot"...');
  const patchRes = await request('PATCH', `/api/users/${userId}`, {
    name: 'Ashutosh Khot',
    targetCompany: 'TCS',
    targetRole: 'Software Developer'
  }, headers);
  console.log('PATCH result status:', patchRes.status, patchRes.body?.user);

  console.log('\n3. Fetching profile after update (simulating page reload)...');
  const reloadRes = await request('GET', `/api/auth/profile/${userId}`, null, headers);
  console.log('Profile after reload:', reloadRes.body?.user);

  console.log('\n4. Simulating bridgeSession login-or-register call on refresh...');
  const bridgeRes = await request('POST', '/api/auth/login-or-register', {
    email: 'akhot5779@gmail.com',
    name: 'Ashutosh Khot'
  }, headers);
  console.log('Bridge result profile:', bridgeRes.body?.user);
}

runTest().catch(console.error);
