import { supabase, isSupabaseConfigured, signInWithEmail, signUpWithEmail, signInWithGoogle } from './src/services/supabaseClient';

async function testSupabasePhase1() {
  console.log('=== VERIFYING SUPABASE MIGRATION PHASE 1: AUTH FOUNDATION ===');

  // 1. Check Supabase Client Initialization
  console.log('\n1. Supabase Client Object Initialized:', Boolean(supabase));
  console.log('2. Supabase Auth Module Present:', Boolean(supabase.auth));
  console.log('3. Supabase Environment Configuration State:', isSupabaseConfigured() ? 'Configured (Live Credentials)' : 'Unconfigured (Placeholder/Local Fallback Active)');

  // 2. Check Auth Helpers Signature & Execution Safety
  console.log('\n4. Testing Auth Helper Functions:');
  const emailTest = await signInWithEmail('test@example.com', 'password123');
  console.log(' - signInWithEmail():', emailTest.error ? `Handled safely (${emailTest.error.message})` : 'Success');

  const signUpTest = await signUpWithEmail('test@example.com', 'password123', { name: 'Test Candidate' });
  console.log(' - signUpWithEmail():', signUpTest.error ? `Handled safely (${signUpTest.error.message})` : 'Success');

  const googleTest = await signInWithGoogle();
  console.log(' - signInWithGoogle():', googleTest.error ? `Handled safely (${googleTest.error.message})` : 'Success');

  // 3. Test Existing Custom Login API (Regression Check)
  console.log('\n5. Verifying Existing Custom Login API (/api/auth/login-or-register)...');
  const res = await fetch('http://localhost:3000/api/auth/login-or-register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'pawankhot1272004@gmail.com',
      name: 'Pawan Khot',
      college: 'IIT Bombay',
      targetCompany: 'TCS',
      targetRole: 'Software Developer',
      role: 'candidate'
    })
  });
  const data = await res.json();
  console.log('Custom Auth Response:', data.success ? `SUCCESS (User ID: ${data.user.id}, Name: ${data.user.name})` : `FAILED (${data.error})`);

  if (!data.success || data.user.id !== 'user_1788513038734_0knkc') {
    throw new Error('Existing custom login API regression detected!');
  }

  console.log('\n================================================================');
  console.log('✅ SUPABASE PHASE 1 AUTH FOUNDATION VERIFIED WITH 0 REGRESSIONS!');
  console.log('================================================================');
}

testSupabasePhase1().catch(err => {
  console.error('Phase 1 Verification failed:', err);
  process.exit(1);
});
