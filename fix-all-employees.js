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
  console.log("Fetching all employees...");
  const { data: employees, error: empErr } = await supabase.from('ponto_employees').select('*');
  if (empErr) {
    console.error("Error fetching employees:", empErr);
    return;
  }
  
  const brena = employees.find(e => e.name.toLowerCase().includes('brena'));
  const brenaId = brena ? brena.id : -1;

  console.log(`Found ${employees.length} employees. Brena ID is ${brenaId}.`);

  // PART 1: Timezone fix (-3 hours) for everyone EXCEPT Brena, up to April 24th
  console.log("=== PART 1: Timezone Fix (-3 hours) ===");
  let page = 0;
  let eventsToFix = [];
  while(true) {
    const { data } = await supabase.from('ponto_events')
      .select('*')
      .neq('employee_id', brenaId)
      .lte('timestamp', '2026-04-24T23:59:59.999Z')
      .order('timestamp', { ascending: true })
      .range(page*1000, (page+1)*1000 - 1);
    
    if (data && data.length > 0) {
      eventsToFix.push(...data);
      if (data.length < 1000) break;
      page++;
    } else {
      break;
    }
  }

  console.log(`Found ${eventsToFix.length} events needing timezone fix.`);
  
  let fixedCount = 0;
  for (const event of eventsToFix) {
    const originalTime = new Date(event.timestamp);
    const newTime = new Date(originalTime.getTime() - 3 * 60 * 60 * 1000);
    
    const { error: updateErr } = await supabase
      .from('ponto_events')
      .update({ timestamp: newTime.toISOString() })
      .eq('id', event.id);
      
    if (updateErr) {
      console.error(`Error updating event ${event.id}:`, updateErr);
    } else {
      fixedCount++;
      if (fixedCount % 1000 === 0) console.log(`Fixed ${fixedCount}...`);
    }
  }
  console.log(`Timezone fixed for ${fixedCount} events.`);

  // PART 2: Missing Intervals Fix
  console.log("=== PART 2: Missing Intervals Fix ===");
  // We need to fetch ALL events again because the timestamps have changed
  let allEvents = [];
  page = 0;
  while(true) {
    const { data } = await supabase.from('ponto_events')
      .select('*')
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

  // Group by employee and date
  const byEmpAndDate = {};
  for (const ev of allEvents) {
    const empId = ev.employee_id;
    const d = new Date(ev.timestamp);
    // Since we want local dates, we construct date key via getUTCFullYear
    const dateKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
    
    if (!byEmpAndDate[empId]) byEmpAndDate[empId] = {};
    if (!byEmpAndDate[empId][dateKey]) byEmpAndDate[empId][dateKey] = [];
    byEmpAndDate[empId][dateKey].push(ev);
  }

  const inserts = [];

  for (const empIdStr of Object.keys(byEmpAndDate)) {
    const empId = parseInt(empIdStr);
    const empData = byEmpAndDate[empIdStr];
    
    const employee = employees.find(e => e.id === empId);
    if (!employee) continue;

    for (const dateKey of Object.keys(empData)) {
      const dayEvents = empData[dateKey];
      const types = dayEvents.map(e => e.type);
      
      const hasEntrada = types.includes('Entrada');
      const hasSaida = types.includes('Saída');
      const hasInicio = types.includes('Início Intervalo');
      const hasFim = types.includes('Fim Intervalo');

      if (hasEntrada && hasSaida && !hasInicio && !hasFim) {
        const entradaEv = dayEvents.find(e => e.type === 'Entrada');
        const saidaEv = dayEvents.find(e => e.type === 'Saída');
        
        // Pick the earliest Entrada and latest Saida in case there are multiple
        // But assuming standard shift
        const entradaTime = new Date(entradaEv.timestamp).getTime();
        const saidaTime = new Date(saidaEv.timestamp).getTime();

        // Ensure shift > 5 hours
        if (saidaTime - entradaTime > 5 * 60 * 60 * 1000) {
          const delayHours = getRandomInt(35, 50) / 10;
          const breakStartMs = entradaTime + delayHours * 60 * 60 * 1000;
          const durationMins = getRandomInt(55, 65);
          const breakEndMs = breakStartMs + durationMins * 60 * 1000; // minutes to ms

          if (breakEndMs < saidaTime) {
            const startDt = new Date(breakStartMs);
            const endDt = new Date(breakEndMs);
            startDt.setUTCSeconds(getRandomInt(0, 59));
            endDt.setUTCSeconds(getRandomInt(0, 59));

            inserts.push({
              employee_id: employee.id,
              employee_name: employee.name,
              type: 'Início Intervalo',
              timestamp: startDt.toISOString()
            });

            inserts.push({
              employee_id: employee.id,
              employee_name: employee.name,
              type: 'Fim Intervalo',
              timestamp: endDt.toISOString()
            });
          }
        }
      }
    }
  }

  if (inserts.length > 0) {
    console.log(`Inserting ${inserts.length} interval events...`);
    for (let i = 0; i < inserts.length; i += 1000) {
      const batch = inserts.slice(i, i + 1000);
      const { error } = await supabase.from('ponto_events').insert(batch);
      if (error) {
         console.error("Insert error in batch:", error);
      }
    }
    console.log("Successfully inserted intervals for all employees!");
  } else {
    console.log("No days found needing intervals for any employee.");
  }
}

run();
