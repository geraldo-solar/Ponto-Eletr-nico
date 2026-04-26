import { sql } from '@vercel/postgres';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config(); // Loads .env (Supabase URL)
dotenv.config({ path: '.env.local' }); // Loads POSTGRES_URL

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function migrateEverything() {
  console.log("Iniciando a migração completa do histórico...");

  try {
    // 1. Puxar todos os funcionários da Neon
    console.log("Buscando todos os funcionários na Vercel/Neon...");
    const { rows: neonEmployees } = await sql`SELECT * FROM employees`;
    console.log(`Encontrados ${neonEmployees.length} funcionários.`);

    if (neonEmployees.length > 0) {
      console.log("Enviando funcionários para o Supabase...");
      const mappedEmployees = neonEmployees.map(e => ({
        id: e.id,
        name: e.name,
        pin: e.pin,
        phone: e.phone,
        cpf: e.cpf,
        funcao: e.funcao,
        pix: e.pix,
        created_at: e.created_at
      }));

      const { error: empError } = await supabase
        .from('ponto_employees')
        .upsert(mappedEmployees, { onConflict: 'id' });
      
      if (empError) throw empError;
      console.log("Funcionários sincronizados com sucesso!");
    }

    // 2. Puxar todas as batidas (eventos) da Neon
    console.log("Buscando TODO o histórico de batidas na Vercel/Neon...");
    const { rows: neonEvents } = await sql`SELECT * FROM events ORDER BY id ASC`;
    console.log(`Encontradas ${neonEvents.length} batidas no total!`);

    if (neonEvents.length > 0) {
      console.log("Enviando batidas para o Supabase (pode demorar alguns segundos)...");
      const mappedEvents = neonEvents.map(e => ({
        id: e.id,
        employee_id: e.employee_id,
        employee_name: e.employee_name,
        type: e.type,
        timestamp: e.timestamp,
        created_at: e.created_at
      }));

      // Inserir em lotes para não sobrecarregar
      const batchSize = 1000;
      for (let i = 0; i < mappedEvents.length; i += batchSize) {
        const batch = mappedEvents.slice(i, i + batchSize);
        console.log(`Sincronizando batidas ${i} até ${i + batch.length}...`);
        
        const { error: evError } = await supabase
          .from('ponto_events')
          .upsert(batch, { onConflict: 'id' });
          
        if (evError) throw evError;
      }
      console.log("Histórico de batidas sincronizado com sucesso!");
    }

    console.log("🎉 Migração total finalizada! O Supabase agora tem o histórico completo.");
  } catch (error) {
    console.error("Erro durante a migração:", error);
  }
}

migrateEverything();
