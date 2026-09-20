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

  const colunasOs = all("PRAGMA table_info(os)").map((c) => c.name);
  if (!colunasOs.includes('tipo_registro')) {
    db.run("ALTER TABLE os ADD COLUMN tipo_registro TEXT DEFAULT 'OS'");
  }
  if (!colunasOs.includes('desconto')) db.run('ALTER TABLE os ADD COLUMN desconto REAL DEFAULT 0');
  if (!colunasOs.includes('endereco')) db.run('ALTER TABLE os ADD COLUMN endereco TEXT');
  if (!colunasOs.includes('telefone')) db.run('ALTER TABLE os ADD COLUMN telefone TEXT');

  // Fornecedores: segmento agora aponta para a tabela segmentos.
  const colunasForn = all("PRAGMA table_info(fornecedores)").map((c) => c.name);
  if (!colunasForn.includes('segmento_id')) {
    db.run('ALTER TABLE fornecedores ADD COLUMN segmento_id INTEGER REFERENCES segmentos(id)');
  }
  // Liga o texto que já estava salvo ao registro de mesmo nome (se existir).
  db.run(`UPDATE fornecedores SET segmento_id = (SELECT s.id FROM segmentos s WHERE s.segmento = fornecedores.segmento)
          WHERE segmento_id IS NULL AND segmento IS NOT NULL AND segmento <> ''`);

  // Compras: caixa de origem e vínculo com a saída gerada no Financeiro.
  const colunasCompras = all("PRAGMA table_info(compras)").map((c) => c.name);
  if (!colunasCompras.includes('conta_caixa_id')) db.run('ALTER TABLE compras ADD COLUMN conta_caixa_id INTEGER REFERENCES contas_caixa(id)');
  if (!colunasCompras.includes('financeiro_id')) db.run('ALTER TABLE compras ADD COLUMN financeiro_id INTEGER REFERENCES financeiro(id)');

  // Financeiro: categoria agora aponta para a tabela categorias_financeiro.
  const colunasFin = all("PRAGMA table_info(financeiro)").map((c) => c.name);
  if (!colunasFin.includes('categoria_id')) {
    db.run('ALTER TABLE financeiro ADD COLUMN categoria_id INTEGER REFERENCES categorias_financeiro(id)');
  }
  db.run(`INSERT INTO categorias_financeiro (categoria)
          SELECT DISTINCT categoria FROM financeiro
          WHERE categoria IS NOT NULL AND categoria <> ''
            AND categoria NOT IN (SELECT categoria FROM categorias_financeiro)`);
  db.run(`UPDATE financeiro SET categoria_id = (SELECT c.id FROM categorias_financeiro c WHERE c.categoria = financeiro.categoria)
          WHERE categoria_id IS NULL AND categoria IS NOT NULL AND categoria <> ''`);
}

export async function persist() {
  const data = db.export();
  await idbSet(IDB_KEY, data);
  // Avisa o app (ver app.js) que os dados acabaram de ser salvos de verdade,
  // para liberar o aviso de "alterações não salvas" ao trocar de página.
  window.dispatchEvent(new Event('rr-dados-salvos'));
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
