import { config, query, api } from '../catalyst/client.mjs';

const tables = [
  'Roles','Profiles','ModulePermissions','Users','Companies','Contacts','Leads','Enquiries',
  'IntegrationErrors','Opportunities','Activities','Proposals','Invoices','Implementations',
  'FollowUps','StageHistory','AuditLog','Settings','ConversionClaims','BackendCommits','BackendChunks',
];
const systemColumns = new Set(['ROWID','CREATORID','CREATEDTIME','MODIFIEDTIME']);
const pageSize = 200;
const insertSize = 100;

async function count(table, environment) {
  config.environment = environment;
  const result = await query(`SELECT COUNT(ROWID) AS total FROM ${table}`);
  return Number(Object.values(result[0]?.[table] || {})[0] || 0);
}

async function sourcePage(table, offset) {
  config.environment = 'Development';
  const result = await query(`SELECT * FROM ${table} ORDER BY ROWID ASC LIMIT ${offset},${pageSize}`);
  return result.map(item => {
    const source = item[table] || item;
    return Object.fromEntries(Object.entries(source).filter(([key]) => !systemColumns.has(key)));
  });
}

async function existingIds(table, total) {
  const ids = new Set();
  config.environment = 'Production';
  for (let offset = 0; offset < total; offset += pageSize) {
    const result = await query(`SELECT AppId FROM ${table} ORDER BY ROWID ASC LIMIT ${offset},${pageSize}`);
    for (const item of result) ids.add(String((item[table] || item).AppId));
  }
  return ids;
}

async function insertRows(table, rows) {
  config.environment = 'Production';
  for (let index = 0; index < rows.length; index += insertSize) {
    await api(`/table/${config.tables[table]}/row`, 'POST', rows.slice(index, index + insertSize));
  }
}

for (const table of tables) {
  const sourceCount = await count(table, 'Development');
  let targetCount = await count(table, 'Production');
  if (targetCount === sourceCount) {
    console.log(`${table}: already complete (${targetCount})`);
    continue;
  }
  if (targetCount > sourceCount) throw new Error(`${table}: Production contains more rows than Development (${targetCount}/${sourceCount}).`);
  const present = await existingIds(table, targetCount);
  console.log(`${table}: copying ${sourceCount - targetCount} remaining rows (${targetCount}/${sourceCount} present)`);
  for (let offset = 0; offset < sourceCount; offset += pageSize) {
    const page = await sourcePage(table, offset);
    const missing = page.filter(row => !present.has(String(row.AppId)));
    if (missing.length) await insertRows(table, missing);
    if (offset % 2000 === 0 || offset + page.length >= sourceCount) console.log(`${table}: scanned ${Math.min(offset + page.length, sourceCount)}/${sourceCount}`);
  }
  targetCount = await count(table, 'Production');
  if (targetCount !== sourceCount) throw new Error(`${table}: verification failed (${targetCount}/${sourceCount}).`);
}

console.log('Production migration complete.');
