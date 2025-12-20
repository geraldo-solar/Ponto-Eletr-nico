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
      // Obter todos os funcionários
      const { rows } = await sql`
        SELECT id, name, pin, phone, cpf, funcao, pix 
        FROM employees 
        ORDER BY id ASC
      `;
      
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      // Adicionar novo funcionário
      const { name, pin, phone, cpf, funcao, pix } = req.body;
      
      if (!name || !pin || !phone) {
        return res.status(400).json({ error: 'Campos obrigatórios: name, pin, phone' });
      }

      // Verificar se PIN já existe
      const { rows: existing } = await sql`
        SELECT id FROM employees WHERE pin = ${pin}
      `;

      if (existing.length > 0) {
        return res.status(400).json({ error: 'PIN já cadastrado' });
      }

      const { rows } = await sql`
        INSERT INTO employees (name, pin, phone, cpf, funcao, pix)
        VALUES (${name}, ${pin}, ${phone}, ${cpf || null}, ${funcao || null}, ${pix || null})
        RETURNING id, name, pin, phone, cpf, funcao, pix
      `;

      return res.status(201).json({ success: true, employee: rows[0] });
    }

    if (req.method === 'PUT') {
      // Atualizar funcionário existente
      const { id, name, pin, phone, cpf, funcao, pix } = req.body;
      
      if (!id || !name || !pin || !phone) {
        return res.status(400).json({ error: 'Campos obrigatórios: id, name, pin, phone' });
      }

      // Verificar se PIN já existe em outro funcionário
      const { rows: existing } = await sql`
        SELECT id FROM employees WHERE pin = ${pin} AND id != ${id}
      `;

      if (existing.length > 0) {
        return res.status(400).json({ error: 'PIN já cadastrado para outro funcionário' });
      }

      const { rows } = await sql`
        UPDATE employees 
        SET name = ${name}, pin = ${pin}, phone = ${phone}, 
            cpf = ${cpf || null}, funcao = ${funcao || null}, pix = ${pix || null}
        WHERE id = ${id}
        RETURNING id, name, pin, phone, cpf, funcao, pix
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      return res.status(200).json({ success: true, employee: rows[0] });
    }

    if (req.method === 'DELETE') {
      // Deletar funcionário
      const { id } = req.query;
      
      if (!id) {
        return res.status(400).json({ error: 'ID é obrigatório' });
      }

      // Deletar eventos associados (CASCADE já faz isso, mas vamos garantir)
      await sql`DELETE FROM events WHERE employee_id = ${id}`;
      
      const { rows } = await sql`
        DELETE FROM employees 
        WHERE id = ${id}
        RETURNING id
      `;

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      return res.status(200).json({ success: true, deletedId: id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
