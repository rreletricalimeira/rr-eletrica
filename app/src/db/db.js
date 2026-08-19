// db.js — SQLite real (sql.js/WASM) rodando no navegador.
// O banco vive em memória enquanto o app está aberto e é serializado
// para o IndexedDB a cada alteração. A mesma serialização é usada
// no backup para o Google Drive.

const IDB_NAME = 'rr-eletrica-storage';
const IDB_STORE = 'sqlite';
const IDB_KEY = 'main.db';

let SQL = null;
let db = null;

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const conn = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const conn = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = conn.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function initDb() {
  if (!SQL) {
    SQL = await window.initSqlJs({
      locateFile: (file) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${file}`,
    });
  }
  const saved = await idbGet(IDB_KEY);
  db = saved ? new SQL.Database(new Uint8Array(saved)) : new SQL.Database();

  const schemaResp = await fetch('./src/db/schema.sql');
  const schemaSql = await schemaResp.text();
  db.run(schemaSql);

  await migrar();
  await persist();
  return db;
}

// Ajustes em bancos já existentes (criados antes de uma mudança de schema).
// CREATE TABLE IF NOT EXISTS não adiciona colunas novas a tabelas que já
// existem, então checamos e adicionamos manualmente quando necessário.
async function migrar() {
  const colunas = all("PRAGMA table_info(clientes)").map((c) => c.name);
  if (!colunas.includes('colaborador_id')) {
    db.run('ALTER TABLE clientes ADD COLUMN colaborador_id INTEGER REFERENCES colaboradores(id)');
  }
}

export async function persist() {
  const data = db.export();
  await idbSet(IDB_KEY, data);
  return data;
}

export function exportBytes() {
  return db.export();
}

export async function importBytes(bytes) {
  db = new SQL.Database(new Uint8Array(bytes));
  await persist();
}

export function run(sql, params = []) {
  db.run(sql, params);
}

export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function getDb() {
  return db;
}
