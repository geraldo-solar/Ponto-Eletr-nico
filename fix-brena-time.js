import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fixTime() {
  console.log("Searching for employee Brena...");
  const { data: employees, error: empErr } = await supabase
    .from('ponto_employees')
    .select('*')
    .ilike('name', '%Brena%');

  if (empErr) {
    console.error("Error fetching employee:", empErr);
    return;
  }

  if (!employees || employees.length === 0) {
    console.log("Could not find employee named Brena");
    return;
  }

  const brena = employees[0];
  console.log("Found:", brena.name, "ID:", brena.id);

  const { data: events, error: evErr } = await supabase
    .from('ponto_events')
    .select('*')
    .eq('employee_id', brena.id)
    .lte('timestamp', '2026-04-24T23:59:59.999Z')
    .order('timestamp', { ascending: true });

  if (evErr) {
    console.error("Error fetching events:", evErr);
    return;
  }

  console.log(`Found ${events?.length} events for ${brena.name} up to April 24th.`);
  
  if (events && events.length > 0) {
    console.log("Sample of first event before:", events[0].timestamp);
    for (const event of events) {
      const originalTime = new Date(event.timestamp);
      const newTime = new Date(originalTime.getTime() - 3 * 60 * 60 * 1000); // subtract 3 hours
      
      const { error: updateErr } = await supabase
        .from('ponto_events')
        .update({ timestamp: newTime.toISOString() })
        .eq('id', event.id);
        
      if (updateErr) {
        console.error("Error updating event ID", event.id, updateErr);
      } else {
        console.log(`Updated ID ${event.id}: ${originalTime.toISOString()} -> ${newTime.toISOString()} (${event.type})`);
      }
    }
    console.log("All updates completed.");
  }
}
fixTime();
