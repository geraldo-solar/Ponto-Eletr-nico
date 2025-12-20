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

    // Importar funcionários
    console.log(`[restore-backup] Importando ${employees.length} funcionários...`);
    let employeesImported = 0;
    
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
        employeesImported++;
      } catch (error) {
        console.error(`[restore-backup] Erro ao importar funcionário ${emp.name}:`, error.message);
      }
    }
    console.log(`[restore-backup] ${employeesImported} funcionários importados`);

    // Importar eventos
    console.log(`[restore-backup] Importando ${events.length} eventos...`);
    let eventsImported = 0;
    
    for (const evt of events) {
      try {
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

      // Encontrar o maior ID de events e ajustar a sequência (se existir)
      const { rows: maxEvtRows } = await sql`SELECT MAX(id) as max_id FROM events`;
      const maxEvtId = maxEvtRows[0]?.max_id || 0;
      if (maxEvtId > 0) {
        // Events usa timestamp como ID, então não precisa ajustar sequência
        console.log(`[restore-backup] Maior ID de evento: ${maxEvtId}`);
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
    console.error('[restore-backup] Erro:', error);
    return res.status(500).json({ error: error.message });
  }
}
