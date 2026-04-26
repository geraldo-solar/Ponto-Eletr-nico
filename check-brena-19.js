import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data: employees } = await supabase.from('ponto_employees').select('*').ilike('name', '%Brena%');
  const brena = employees[0];

  const { data: events } = await supabase.from('ponto_events')
    .select('*')
    .eq('employee_id', brena.id)
    .gte('timestamp', '2026-04-18T00:00:00.000Z')
    .lte('timestamp', '2026-04-20T23:59:59.000Z')
    .order('timestamp', { ascending: true });

  for (const ev of events) {
    console.log(ev.id, ev.timestamp, ev.type);
  }
}
check();
