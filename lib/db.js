import { createPool } from '@vercel/postgres';

// Configurar pool com as variáveis de ambiente corretas (prefixo STORAGE_)
export const pool = createPool({
  connectionString: process.env.STORAGE_URL || process.env.POSTGRES_URL
});

export { sql } from '@vercel/postgres';
