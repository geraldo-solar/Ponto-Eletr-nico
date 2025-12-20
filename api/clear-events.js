import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Deletar todos os eventos
    const result = await sql`DELETE FROM events`;
    
    // Resetar sequence para começar do ID 1
    await sql`ALTER SEQUENCE events_id_seq RESTART WITH 1`;
    
    res.status(200).json({ 
      success: true, 
      message: 'Todos os eventos foram deletados com sucesso!',
      deletedCount: result.rowCount
    });
  } catch (error) {
    console.error('Erro ao deletar eventos:', error);
    res.status(500).json({ error: error.message });
  }
}
