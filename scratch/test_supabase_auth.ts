import { createClient } from '@supabase/supabase-js';

const url = 'https://derfzsbuimphuoeorvje.supabase.co';
const key = 'sb_publishable_VGXFZHZO-513_OMPNv8DHw_ZZzQ8otk';

const supabase = createClient(url, key);

async function runTest() {
  console.log('Testing Supabase Auth connection...');
  const { data, error } = await supabase.auth.getSession();
  console.log('Get Session Result:', { data, error });
}

runTest().catch(console.error);
