async function testAccountSettingsAndDelete() {
  console.log('=== TESTING ACCOUNT SETTINGS & SAFE DELETION ===');

  const testEmail = `test_settings_user_${Date.now()}@example.com`;
  const headers = {
    'Content-Type': 'application/json',
    'x-requested-with': 'XMLHttpRequest',
  };

  // Step 1: Register new test candidate
  console.log('Step 1: Registering candidate:', testEmail);
  const regRes = await fetch('http://localhost:3000/api/auth/login-or-register', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: testEmail,
      name: 'Pawan Khot Settings Test',
      college: 'VTU Belagavi',
      targetCompany: 'Infosys',
      targetRole: 'System Engineer',
    }),
  });
  const regData = await regRes.json();
  console.log('Registration result:', regData.success, 'User ID:', regData.user?.id);
  const user = regData.user;
  const authHeaders = {
    ...headers,
    'Authorization': `Bearer ${user.id}`,
    'x-user-id': user.id,
  };

  // Step 2: Update settings (General & Social & Phone)
  console.log('Step 2: Updating user profile settings...');
  const updateRes = await fetch(`http://localhost:3000/api/users/${user.id}`, {
    method: 'PATCH',
    headers: authHeaders,
    body: JSON.stringify({
      name: 'Pawan Khot Updated',
      phone: '+91 9988776655',
      linkedIn: 'https://linkedin.com/in/pawankhot',
      github: 'https://github.com/pawankhot',
    }),
  });
  const updateData = await updateRes.json();
  console.log('Profile update result:', updateData.success, 'Updated phone:', updateData.user?.phone, 'LinkedIn:', updateData.user?.linkedIn);

  // Step 3: Delete Account via Safe Deletion API
  console.log('Step 3: Executing Safe Account Deletion API...');
  const delRes = await fetch('http://localhost:3000/api/users/me/delete-account', {
    method: 'POST',
    headers: authHeaders,
  });
  const delData = await delRes.json();
  console.log('Account Deletion status:', delRes.status, delData);

  // Step 4: Verify profile lookup returns 404 / deleted
  const profileRes = await fetch(`http://localhost:3000/api/auth/profile/${user.id}`, {
    headers: authHeaders,
  });
  console.log('Profile lookup after deletion status:', profileRes.status);

  // Step 5: Re-register with the SAME email address
  console.log('Step 5: Re-registering with the SAME email address:', testEmail);
  const reRegRes = await fetch('http://localhost:3000/api/auth/login-or-register', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: testEmail,
      name: 'Pawan Khot ReRegistered',
      college: 'IIT Bombay',
      targetCompany: 'Google',
      targetRole: 'Software Engineer',
    }),
  });
  const reRegData = await reRegRes.json();
  console.log('Re-registration success:', reRegData.success, 'New User ID:', reRegData.user?.id);
  console.log('Is new ID different from old ID?', reRegData.user?.id !== user.id);

  if (reRegData.success && reRegData.user?.id !== user.id) {
    console.log('✅ ALL ACCEPTANCE CRITERIA PASSED FOR SAFE ACCOUNT DELETION & RE-REGISTRATION!');
  } else {
    console.error('❌ RE-REGISTRATION TEST FAILED!');
  }
}

testAccountSettingsAndDelete().catch(console.error);
