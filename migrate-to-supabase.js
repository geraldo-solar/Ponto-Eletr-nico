import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  console.log("Reading local data...");
  const employees = JSON.parse(fs.readFileSync('./tmp_employees.json', 'utf8'));
  const events = JSON.parse(fs.readFileSync('./tmp_events.json', 'utf8'));

  console.log(`Found ${employees.length} employees and ${events.length} events.`);

  console.log("Inserting employees...");
  // Format employees for Supabase
  const mappedEmployees = employees.map(e => ({
    id: e.id,
    name: e.name,
    pin: e.pin,
    phone: e.phone,
    cpf: e.cpf,
    funcao: e.funcao,
    pix: e.pix
  }));

  // We can insert them in batches if there are many, but 50 is fine in one go.
  const { data: empData, error: empError } = await supabase
    .from('ponto_employees')
    .upsert(mappedEmployees, { onConflict: 'id' });

  if (empError) {
    console.error("Error inserting employees:", empError);
    return;
  }
  console.log("Employees inserted successfully.");

  console.log("Inserting events in batches...");
  // Events: id, employeeId -> employee_id, employeeName -> employee_name, type, timestamp
  const mappedEvents = events.map(e => ({
    id: e.id,
    employee_id: e.employeeId,
    employee_name: e.employeeName,
    type: e.type,
    timestamp: e.timestamp
  }));

  const batchSize = 1000;
  for (let i = 0; i < mappedEvents.length; i += batchSize) {
    const batch = mappedEvents.slice(i, i + batchSize);
    console.log(`Inserting events ${i} to ${i + batch.length}...`);
    const { error: evError } = await supabase
      .from('ponto_events')
      .upsert(batch, { onConflict: 'id' });
      
    if (evError) {
      console.error(`Error inserting events at index ${i}:`, evError);
      return;
    }
  }
  
  console.log("Migration complete!");
}

run().catch(console.error);
