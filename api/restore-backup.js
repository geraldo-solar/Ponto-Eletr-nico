import { sql } from '@vercel/postgres';

// Garantir que usa STORAGE_URL se POSTGRES_URL não existir
if (!process.env.POSTGRES_URL && process.env.STORAGE_URL) {
  process.env.POSTGRES_URL = process.env.STORAGE_URL;
}

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { employees, events } = req.body;

    if (!employees || !Array.isArray(employees)) {
      return res.status(400).json({ error: 'employees deve ser um array' });
    }

    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'events deve ser um array' });
    }

    console.log(`[restore-backup] Iniciando restauração: ${employees.length} funcionários, ${events.length} eventos`);

    // Limpar dados existentes
    console.log('[restore-backup] Limpando dados existentes...');
    await sql`DELETE FROM events`;
    await sql`DELETE FROM employees`;
    console.log('[restore-backup] Dados antigos removidos');

    // Importar funcionários em lote
    console.log(`[restore-backup] Importando ${employees.length} funcionários...`);
    
    for (const emp of employees) {
      try {
        await sql`
          INSERT INTO employees (id, name, phone, pin, cpf, funcao, pix)
          VALUES (
            ${emp.id}, 
            ${emp.name}, 
            ${emp.phone || null}, 
            ${emp.pin}, 
            ${emp.cpf || null}, 
            ${emp.funcao || null}, 
            ${emp.pix || null}
          )
          ON CONFLICT (id) DO UPDATE SET
            name = EXCLUDED.name,
            phone = EXCLUDED.phone,
            pin = EXCLUDED.pin,
            cpf = EXCLUDED.cpf,
            funcao = EXCLUDED.funcao,
            pix = EXCLUDED.pix
        `;
      } catch (error) {
        console.error(`[restore-backup] Erro ao importar funcionário ${emp.name}:`, error.message);
      }
    }
    
    const employeesImported = employees.length;
    console.log(`[restore-backup] ${employeesImported} funcionários importados`);

    // Importar eventos em lotes de 50 para melhor performance
    console.log(`[restore-backup] Importando ${events.length} eventos em lotes...`);
    let eventsImported = 0;
    const batchSize = 50;
    
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      
      for (const evt of batch) {
        try {
          // Validar dados do evento
          if (!evt.id || !evt.employeeId || !evt.employeeName || !evt.type || !evt.timestamp) {
            console.error(`[restore-backup] Evento inválido:`, evt);
            continue;
          }

          await sql`
            INSERT INTO events (id, employee_id, employee_name, type, timestamp)
            VALUES (
              ${evt.id}, 
              ${evt.employeeId}, 
              ${evt.employeeName}, 
              ${evt.type}, 
              ${evt.timestamp}
            )
            ON CONFLICT (id) DO UPDATE SET
              employee_id = EXCLUDED.employee_id,
              employee_name = EXCLUDED.employee_name,
              type = EXCLUDED.type,
              timestamp = EXCLUDED.timestamp
          `;
          eventsImported++;
        } catch (error) {
          console.error(`[restore-backup] Erro ao importar evento ${evt.id}:`, error.message);
        }
      }
      
      // Log de progresso
      console.log(`[restore-backup] ${eventsImported}/${events.length} eventos importados...`);
    }
    
    console.log(`[restore-backup] ${eventsImported} eventos importados`);

    // Resetar sequências de ID para evitar conflitos futuros
    try {
      // Encontrar o maior ID de employees e ajustar a sequência
      const { rows: maxEmpRows } = await sql`SELECT MAX(id) as max_id FROM employees`;
      const maxEmpId = maxEmpRows[0]?.max_id || 0;
      if (maxEmpId > 0) {
        await sql`SELECT setval('employees_id_seq', ${maxEmpId + 1}, false)`;
        console.log(`[restore-backup] Sequência employees_id_seq ajustada para ${maxEmpId + 1}`);
      }
    } catch (error) {
      console.error('[restore-backup] Erro ao ajustar sequências:', error.message);
      // Não é crítico, continuar
    }

    console.log('[restore-backup] Restauração concluída com sucesso!');

    return res.status(200).json({
      success: true,
      employeesCount: employeesImported,
      eventsCount: eventsImported,
      message: 'Backup restaurado com sucesso'
    });

  } catch (error) {
    console.error('[restore-backup] Erro geral:', error);
    console.error('[restore-backup] Stack:', error.stack);
    return res.status(500).json({ 
      error: error.message,
      details: error.stack,
      type: error.name
    });
  }
}
