-- ============================================================
-- RR Elétrica - Schema do banco local (SQLite via sql.js/WASM)
-- Apenas os campos marcados como obrigatórios têm NOT NULL.
-- ============================================================

CREATE TABLE IF NOT EXISTS colaboradores (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  nome       TEXT NOT NULL,
  telefone   TEXT
);

CREATE TABLE IF NOT EXISTS clientes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                 TEXT NOT NULL,
  tipo_cliente         TEXT,
  apelido              TEXT,
  cep                  TEXT,
  endereco             TEXT,
  bairro               TEXT,
  cidade               TEXT,
  uf                   TEXT,
  fone1                TEXT,
  celular1             TEXT,
  celular2             TEXT,
  email                TEXT,
  cpf                  TEXT,
  rg                   TEXT,
  cnpj                 TEXT,
  inscricao_estadual   TEXT,
  inscricao_municipal  TEXT,
  situacao_cadastro    TEXT DEFAULT 'Liberado',
  sexo                 TEXT,
  data_nascimento      TEXT,
  data_cadastro        TEXT DEFAULT (datetime('now')),
  observacao           TEXT,
  colaborador_id       INTEGER REFERENCES colaboradores(id)
);

CREATE TABLE IF NOT EXISTS fornecedores (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                 TEXT NOT NULL,
  contato              TEXT,
  segmento             TEXT,
  cep                  TEXT,
  endereco             TEXT,
  bairro               TEXT,
  cidade               TEXT,
  uf                   TEXT,
  fone1                TEXT,
  celular1             TEXT,
  celular2             TEXT,
  email                TEXT,
  cpf                  TEXT,
  rg                   TEXT,
  cnpj                 TEXT,
  inscricao_estadual   TEXT,
  inscricao_municipal  TEXT,
  site_rede_social     TEXT,
  data_cadastro        TEXT DEFAULT (datetime('now')),
  observacao           TEXT
);

CREATE TABLE IF NOT EXISTS categorias (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS unidades (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  unidade   TEXT NOT NULL
);

INSERT INTO unidades (unidade) SELECT 'PÇ'  WHERE NOT EXISTS (SELECT 1 FROM unidades WHERE unidade = 'PÇ');
INSERT INTO unidades (unidade) SELECT 'CX'  WHERE NOT EXISTS (SELECT 1 FROM unidades WHERE unidade = 'CX');
INSERT INTO unidades (unidade) SELECT 'KIT' WHERE NOT EXISTS (SELECT 1 FROM unidades WHERE unidade = 'KIT');
INSERT INTO unidades (unidade) SELECT 'LT'  WHERE NOT EXISTS (SELECT 1 FROM unidades WHERE unidade = 'LT');

CREATE TABLE IF NOT EXISTS produtos (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao            TEXT NOT NULL,
  tipo                 TEXT,
  categoria_id         INTEGER REFERENCES categorias(id),
  unidade_id           INTEGER REFERENCES unidades(id),
  controle_estoque     INTEGER DEFAULT 0,
  estoque_atual        REAL,
  estoque_minimo       REAL,
  valor_custo          REAL,
  margem_lucro         REAL,
  valor_venda          REAL,
  fornecedor_id        INTEGER REFERENCES fornecedores(id),
  foto_base64          TEXT,
  descontinuado        INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS meta_backup (
  chave  TEXT PRIMARY KEY,
  valor  TEXT
);
