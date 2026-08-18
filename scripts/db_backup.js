const { execSync } = require('child_process');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config({ path: path.join(process.cwd(), '.env.development') });
const conn = process.env.DATABASE_URL;
if (!conn) {
  console.error('DATABASE_URL not found in .env.development');
  process.exit(1);
}

const backupsDir = path.join(process.cwd(), 'backups');
fs.mkdirSync(backupsDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outFile = path.join(backupsDir, `db-backup-${timestamp}.dump`);

console.log('Using connection:', conn.split('@')[1] ? conn.split('@')[1].split('/')[0] : 'connection-string');
console.log('Dump file:', outFile);

try {
  // Try to run pg_dump. This requires pg_dump to be installed and in PATH.
  const cmd = `pg_dump --format=custom --file="${outFile}" "${conn}"`;
  console.log('Running:', cmd);
  execSync(cmd, { stdio: 'inherit' });
  console.log('Backup created at', outFile);
} catch (e) {
  console.error('Backup failed:', e.message || e);
  process.exit(1);
}
