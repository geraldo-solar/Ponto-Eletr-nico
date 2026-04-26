import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fix() {
  const { error } = await supabase.from('ponto_events')
    .update({ timestamp: '2026-04-20T02:09:00.000Z' }) // The UI uses getUTCHours() so it displays exactly the UTC time stored
    .eq('id', 5096);

  if (error) {
    console.error("Error updating:", error);
  } else {
    console.log("Successfully updated Saída to literally 02:09:00.000Z");
  }
}
fix();
