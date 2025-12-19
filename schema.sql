-- Schema para o sistema de ponto eletrônico
-- Vercel Postgres

-- Tabela de funcionários
CREATE TABLE IF NOT EXISTS employees (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    pin VARCHAR(4) NOT NULL UNIQUE,
    phone VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de eventos de ponto
CREATE TABLE IF NOT EXISTS events (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL,
    employee_name VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
);

-- Índices para melhorar performance
CREATE INDEX IF NOT EXISTS idx_events_employee_id ON events(employee_id);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);

-- Inserir funcionários padrão (se não existirem)
INSERT INTO employees (name, pin, phone) 
VALUES 
    ('Ana Silva', '1234', '11987654321'),
    ('Bruno Costa', '5678', '21987654321'),
    ('Carla Dias', '4321', '31987654321'),
    ('Daniel Alves', '8765', '41987654321')
ON CONFLICT (pin) DO NOTHING;
