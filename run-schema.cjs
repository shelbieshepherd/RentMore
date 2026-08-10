const { neon } = require('@neondatabase/serverless');
const fs = require('fs');

const sql = neon(process.env.DATABASE_URL);
const schema = fs.readFileSync('/home/team/shared/schema.sql', 'utf8');

// Split on ;\n (end-of-statement), strip leading comments from each part
const parts = schema.split(/;\s*\n/);
const clean = [];
for (let i = 0; i < parts.length; i++) {
  let s = parts[i].trim();
  // Strip leading comment lines
  while (s.startsWith('--')) {
    const nl = s.indexOf('\n');
    if (nl === -1) { s = ''; break; }
    s = s.substring(nl + 1).trim();
  }
  if (s.length > 0 && s !== 'SQLEOF') {
    clean.push(s);
  }
}

async function run() {
  for (let i = 0; i < clean.length; i++) {
    try {
      await sql.query(clean[i]);
    } catch (e) {
      if (e.message && e.message.indexOf('already exists') >= 0) continue;
      console.error('FAILED [' + i + ']:', clean[i].substring(0, 80), '...', e.message);
    }
  }
  console.log('DONE — ' + clean.length + ' statements');
}
run();
