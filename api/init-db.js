import { sql } from '@vercel/postgres';

export default async function handler(req, res) {
  // Apenas permitir GET para inicialização
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Criar tabela de funcionários
    await sql`
      CREATE TABLE IF NOT EXISTS employees (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        pin VARCHAR(4) NOT NULL UNIQUE,
        phone VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Criar tabela de eventos
    await sql`
      CREATE TABLE IF NOT EXISTS events (
        id SERIAL PRIMARY KEY,
        employee_id INTEGER NOT NULL,
        employee_name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    // Criar índices
    await sql`CREATE INDEX IF NOT EXISTS idx_events_employee_id ON events(employee_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_events_type ON events(type)`;

    // Inserir funcionários padrão (se não existirem)
    const employees = [
      { name: 'Ana Silva', pin: '1234', phone: '11987654321' },
      { name: 'Bruno Costa', pin: '5678', phone: '21987654321' },
      { name: 'Carla Dias', pin: '4321', phone: '31987654321' },
      { name: 'Daniel Alves', pin: '8765', phone: '41987654321' }
    ];

    for (const emp of employees) {
      try {
        await sql`
          INSERT INTO employees (name, pin, phone)
          VALUES (${emp.name}, ${emp.pin}, ${emp.phone})
          ON CONFLICT (pin) DO NOTHING
        `;
      } catch (error) {
        // Ignorar erros de duplicata
        console.log(`Funcionário ${emp.name} já existe`);
      }
    }

    return res.status(200).json({ 
      success: true, 
      message: 'Banco de dados inicializado com sucesso!' 
    });
  } catch (error) {
    console.error('Error initializing database:', error);
    return res.status(500).json({ error: error.message });
  }
}
