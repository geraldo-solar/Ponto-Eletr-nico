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
    // Adicionar colunas cpf, funcao e pix se não existirem
    await sql`
      ALTER TABLE employees 
      ADD COLUMN IF NOT EXISTS cpf VARCHAR(14),
      ADD COLUMN IF NOT EXISTS funcao VARCHAR(100),
      ADD COLUMN IF NOT EXISTS pix VARCHAR(255)
    `;

    return res.status(200).json({ 
      success: true, 
      message: 'Migration executada com sucesso! Colunas cpf, funcao e pix adicionadas.' 
    });
  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({ 
      error: error.message,
      details: 'Erro ao executar migration. Verifique se as colunas já existem ou se há algum problema de permissão.'
    });
  }
}
