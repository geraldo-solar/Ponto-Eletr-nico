import { sql } from '@vercel/postgres';

async function test() {
  try {
    const { rows } = await sql`SELECT count(*) FROM events`;
    console.log("Postgres response:", rows);
  } catch (error) {
    console.error("Postgres error:", error);
  }
}

test();
