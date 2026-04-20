require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('\n✗ ERROR: SUPABASE_URL y SUPABASE_ANON_KEY deben estar definidos en .env\n');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { persistSession: false }
});

module.exports = supabase;
