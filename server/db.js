require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error('SUPABASE_URL y SUPABASE_ANON_KEY deben estar definidos en las variables de entorno');
}

const supabase = createClient(url, key, {
  auth: { persistSession: false }
});

module.exports = supabase;
