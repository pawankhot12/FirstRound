const http = require('http');

function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function debug() {
  const adminAuth = await makeRequest('POST', '/api/auth/login-or-register', {
    email: 'pawankhot9@gmail.com',
    name: 'Pawan Khot',
  });
  const adminId = adminAuth.data?.user?.id;
  console.log('Admin ID:', adminId);

  const res = await makeRequest(
    'POST',
    '/api/admin/assessments',
    {
      title: 'TCS NQT 2026 Advanced Full Mock',
      description: 'Comprehensive placement test covering Quant, Verbal and Coding.',
      category: 'company',
      companyName: 'TCS (Tata Consultancy Services)',
      durationMinutes: 45,
      difficulty: 'Hard',
      status: 'DRAFT',
    },
    { 'x-user-id': adminId }
  );

  console.log('POST /api/admin/assessments status:', res.status);
  console.log('POST /api/admin/assessments body:', JSON.stringify(res.data, null, 2));
}

debug().catch(console.error);
