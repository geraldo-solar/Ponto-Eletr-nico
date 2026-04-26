import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabase() {
  console.log("Testing events...");
  const { data: ev, error: evErr } = await supabase.from('ponto_events').select('*').order('timestamp', { ascending: true }).limit(5000);
  console.log("Events Error:", evErr);
  console.log("Events Count:", ev?.length);
  if (ev && ev.length > 0) {
    console.log("Last event:", ev[ev.length - 1].timestamp);
  }
}
testSupabase();
