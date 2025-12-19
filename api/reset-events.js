import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Deletar todos os eventos
    await sql`DELETE FROM events`;
    
    // Resetar sequence
    await sql`ALTER SEQUENCE events_id_seq RESTART WITH 1`;
    
    // Inserir eventos de teste realistas
    
    // Ana Silva - Dia completo (19/12/2025)
    await sql`
      INSERT INTO events (employee_id, employee_name, type, timestamp) VALUES
      (1, 'Ana Silva', 'Entrada', '2025-12-19 08:00:00'),
      (1, 'Ana Silva', 'Início Intervalo', '2025-12-19 12:00:00'),
      (1, 'Ana Silva', 'Fim Intervalo', '2025-12-19 13:00:00'),
      (1, 'Ana Silva', 'Saída', '2025-12-19 17:00:00')
    `;
    
    // Bruno Costa - Dia completo (19/12/2025)
    await sql`
      INSERT INTO events (employee_id, employee_name, type, timestamp) VALUES
      (2, 'Bruno Costa', 'Entrada', '2025-12-19 09:00:00'),
      (2, 'Bruno Costa', 'Início Intervalo', '2025-12-19 12:30:00'),
      (2, 'Bruno Costa', 'Fim Intervalo', '2025-12-19 13:30:00'),
      (2, 'Bruno Costa', 'Saída', '2025-12-19 18:00:00')
    `;
    
    // Carla Dias - Meio período (19/12/2025)
    await sql`
      INSERT INTO events (employee_id, employee_name, type, timestamp) VALUES
      (3, 'Carla Dias', 'Entrada', '2025-12-19 08:00:00'),
      (3, 'Carla Dias', 'Saída', '2025-12-19 12:00:00')
    `;
    
    // Daniel Alves - Dia com hora extra (18/12/2025)
    await sql`
      INSERT INTO events (employee_id, employee_name, type, timestamp) VALUES
      (4, 'Daniel Alves', 'Entrada', '2025-12-18 08:00:00'),
      (4, 'Daniel Alves', 'Início Intervalo', '2025-12-18 12:00:00'),
      (4, 'Daniel Alves', 'Fim Intervalo', '2025-12-18 13:00:00'),
      (4, 'Daniel Alves', 'Saída', '2025-12-18 19:00:00')
    `;
    
    res.status(200).json({ 
      success: true, 
      message: 'Eventos resetados com sucesso! 14 eventos criados.' 
    });
  } catch (error) {
    console.error('Erro ao resetar eventos:', error);
    res.status(500).json({ error: error.message });
  }
}
