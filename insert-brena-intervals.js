import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function run() {
  // Fetch Brena
  const { data: employees } = await supabase.from('ponto_employees').select('*').ilike('name', '%Brena%');
  if (!employees || employees.length === 0) return console.log("Brena not found");
  const brena = employees[0];
  console.log("Found Brena:", brena.name);

  // Fetch all events for Brena
  let allEvents = [];
  let page = 0;
  while(true) {
    const { data } = await supabase.from('ponto_events')
      .select('*')
      .eq('employee_id', brena.id)
      .order('timestamp', { ascending: true })
      .range(page*1000, (page+1)*1000 - 1);
    
    if (data && data.length > 0) {
      allEvents.push(...data);
      if (data.length < 1000) break;
      page++;
    } else {
      break;
    }
  }

  // Group by date (YYYY-MM-DD)
  const byDate = {};
  for (const ev of allEvents) {
    const d = new Date(ev.timestamp);
    const dateKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(ev);
  }

  const inserts = [];

  // Identify missing intervals
  for (const dateKey of Object.keys(byDate)) {
    const dayEvents = byDate[dateKey];
    const types = dayEvents.map(e => e.type);
    
    const hasEntrada = types.includes('Entrada');
    const hasSaida = types.includes('Saída');
    const hasInicio = types.includes('Início Intervalo');
    const hasFim = types.includes('Fim Intervalo');

    if (hasEntrada && hasSaida && !hasInicio && !hasFim) {
      // Find entrada timestamp
      const entradaEv = dayEvents.find(e => e.type === 'Entrada');
      const entradaTime = new Date(entradaEv.timestamp).getTime();
      const saidaEv = dayEvents.find(e => e.type === 'Saída');
      const saidaTime = new Date(saidaEv.timestamp).getTime();

      // Ensure shift is long enough to warrant a break (e.g., > 5 hours)
      if (saidaTime - entradaTime > 5 * 60 * 60 * 1000) {
        // Start break 3.5 to 5 hours after entrada
        const delayHours = getRandomInt(35, 50) / 10; // 3.5 to 5.0
        const breakStartMs = entradaTime + delayHours * 60 * 60 * 1000;
        
        // Duration: 55 to 65 mins
        const durationMins = getRandomInt(55, 65);
        const breakEndMs = breakStartMs + durationMins * 60 * 1000;

        // Ensure we don't end after saida
        if (breakEndMs < saidaTime) {
          const startDt = new Date(breakStartMs);
          const endDt = new Date(breakEndMs);

          // Add random seconds 0-59
          startDt.setUTCSeconds(getRandomInt(0, 59));
          endDt.setUTCSeconds(getRandomInt(0, 59));

          inserts.push({
            employee_id: brena.id,
            employee_name: brena.name,
            type: 'Início Intervalo',
            timestamp: startDt.toISOString()
          });

          inserts.push({
            employee_id: brena.id,
            employee_name: brena.name,
            type: 'Fim Intervalo',
            timestamp: endDt.toISOString()
          });

          console.log(`Will add break for ${dateKey}: ${startDt.toISOString()} to ${endDt.toISOString()}`);
        }
      }
    }
  }

  if (inserts.length > 0) {
    console.log(`Inserting ${inserts.length} events...`);
    const { error } = await supabase.from('ponto_events').insert(inserts);
    if (error) console.error("Insert error:", error);
    else console.log("Successfully inserted intervals!");
  } else {
    console.log("No days found needing intervals.");
  }
}
run();
