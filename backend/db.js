const { Pool } = require("pg");
const dotenv = require("dotenv");

dotenv.config();

let pool;

if (process.env.DATABASE_URL) {
  // Supabase / hosted Postgres — connection string with SSL
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: process.env.VERCEL ? 1 : 10,
  });
} else {
  pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || "dinfluencers_hub",
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  });
}

pool.on("error", (err) => {
  console.error("Unexpected PostgreSQL pool error:", err);
});

async function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = {
  pool,
  query,
};
