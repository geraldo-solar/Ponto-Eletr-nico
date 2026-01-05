import { sql } from '@vercel/postgres';

// Garantir que usa STORAGE_URL se POSTGRES_URL não existir
if (!process.env.POSTGRES_URL && process.env.STORAGE_URL) {
  process.env.POSTGRES_URL = process.env.STORAGE_URL;
}

export default async function handler(req, res) {
  // Configurar CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'GET') {
      // Obter todos os eventos
      const { rows } = await sql`
        SELECT id, employee_id as "employeeId", employee_name as "employeeName", type, timestamp
        FROM events 
        ORDER BY timestamp ASC
      `;
      
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      // Adicionar novo evento
      const { employeeId, employeeName, type, timestamp } = req.body;
      
      if (!employeeId || !employeeName || !type || !timestamp) {
        return res.status(400).json({ error: 'Campos obrigatórios: employeeId, employeeName, type, timestamp' });
      }

      // Verificar duplicatas (mesmo funcionário, mesmo tipo, mesmo timestamp)
      const { rows: existing } = await sql`
        SELECT id FROM events 
        WHERE employee_id = ${employeeId} 
        AND type = ${type} 
        AND timestamp = ${timestamp}
      `;

      if (existing.length > 0) {
        return res.status(400).json({ error: 'Evento duplicado' });
      }

      const { rows } = await sql`
        INSERT INTO events (employee_id, employee_name, type, timestamp)
        VALUES (${employeeId}, ${employeeName}, ${type}, ${timestamp})
        RETURNING id, employee_id as "employeeId", employee_name as "employeeName", type, timestamp
      `;

      return res.status(201).json({ success: true, event: rows[0] });
    }

    if (req.method === 'PUT') {
      // Atualizar evento existente (editar timestamp e/ou type)
      const { id, timestamp, type } = req.body;
      
      if (!id) {
        return res.status(400).json({ error: 'Campo obrigatório: id' });
      }

      // Construir query dinamicamente baseado nos campos fornecidos
      let updateFields = [];
      let values = [];
      
      if (timestamp) {
        updateFields.push('timestamp = $' + (values.length + 1));
        values.push(timestamp);
      }
      
      if (type) {
        updateFields.push('type = $' + (values.length + 1));
        values.push(type);
      }
      
      if (updateFields.length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      }
      
      values.push(id); // ID é sempre o último parâmetro
      
      const query = `
        UPDATE events 
        SET ${updateFields.join(', ')}
        WHERE id = $${values.length}
        RETURNING id, employee_id as "employeeId", employee_name as "employeeName", type, timestamp
      `;
      
      console.log('UPDATE Query:', query);
      console.log('UPDATE Values:', values);
      
      const { rows } = await sql.query(query, values);

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Evento não encontrado' });
      }

      return res.status(200).json({ success: true, event: rows[0] });
    }

    if (req.method === 'DELETE') {
      // Deletar evento
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ error: 'ID é obrigatório' });
      }

      const { rows } = await sql`
        DELETE FROM events 
        WHERE id = ${id}
        RETURNING id
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Evento não encontrado' });
      }

      return res.status(200).json({ success: true, deletedId: id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
