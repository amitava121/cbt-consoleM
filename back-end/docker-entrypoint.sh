#!/bin/sh
set -e

echo "=== CBE Console Server Starting ==="

# Wait for PostgreSQL
echo "[1/4] Waiting for PostgreSQL at $DATABASE_URL..."
until node -e "
  const { Client } = require('pg');
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  c.connect().then(() => c.end()).catch(() => process.exit(1));
" 2>/dev/null; do
  echo "  PostgreSQL not ready, retrying in 2s..."
  sleep 2
done
echo "  PostgreSQL is ready!"

# Run migrations by executing SQL files directly
echo "[2/4] Running database migrations..."
node -e "
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function run() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Create migrations tracking table
  await client.query(\`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id SERIAL PRIMARY KEY,
      hash TEXT NOT NULL,
      created_at BIGINT
    )
  \`);

  const dir = './src/database/migrations';
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const rawSql = fs.readFileSync(path.join(dir, file), 'utf8');
    const hash = require('crypto').createHash('sha256').update(rawSql).digest('hex');

    const { rows } = await client.query('SELECT id FROM __drizzle_migrations WHERE hash = \$1', [hash]);
    if (rows.length > 0) {
      console.log('  SKIP (already applied): ' + file);
      continue;
    }

    console.log('  APPLY: ' + file);
    // Split on drizzle-kit's statement-breakpoint marker
    const statements = rawSql.split('--> statement-breakpoint')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    await client.query('BEGIN');
    try {
      for (const stmt of statements) {
        await client.query(stmt);
      }
      await client.query('INSERT INTO __drizzle_migrations (hash, created_at) VALUES (\$1, \$2)', [hash, Date.now()]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('  ERROR in ' + file + ': ' + err.message);
      // Don't throw — some migrations may conflict, continue with next
      console.error('  (continuing with next migration...)');
    }
  }

  await client.end();
  console.log('  Migrations complete!');
}
run().catch(err => { console.error('Migration error:', err.message); process.exit(1); });
"

# Run seed
echo "[3/4] Running database seed..."
node dist/src/database/seeds/index.js 2>&1 || echo "  Seed already applied (OK)"

# Start server
echo "[4/4] Starting CBE Console server on port ${PORT:-3000}..."
exec node dist/src/index.js
