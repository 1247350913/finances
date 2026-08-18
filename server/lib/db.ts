import { config as loadEnv } from "dotenv";
import { Pool } from "pg";

loadEnv({ path: ".env.development" });
loadEnv();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL. Set it to your Neon Postgres connection string.");
}

export const db = new Pool({
  connectionString,
  ssl: process.env.PGSSLMODE === "disable" ? false : { rejectUnauthorized: false },
});

export async function closeDbPool() {
  await db.end();
}
