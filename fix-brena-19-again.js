import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const { error } = await supabase.from('ponto_events')
    .update({ timestamp: '2026-04-20T05:09:00.000Z' }) // 02:09 AM BRT on 20/04
    .eq('id', 5096);

  if (error) {
    console.error("Error updating:", error);
  } else {
    console.log("Successfully updated Saída to 02:09 BRT (05:09 UTC) on 20/04");
  }
}
fix();
