-- Adicionar campos CPF, Função e PIX à tabela employees
-- Execute este script no banco de dados Vercel Postgres

ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS cpf VARCHAR(14),
ADD COLUMN IF NOT EXISTS funcao VARCHAR(100),
ADD COLUMN IF NOT EXISTS pix VARCHAR(255);
