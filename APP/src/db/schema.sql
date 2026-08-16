-- ============================================================
-- RR Elétrica - Schema do banco local (SQLite via sql.js/WASM)
-- Apenas os campos marcados como obrigatórios têm NOT NULL.
-- Todo o resto é opcional (nullable) por decisão do Robinson.
-- ============================================================

-- ---------- CLIENTES ----------
CREATE TABLE IF NOT EXISTS clientes (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                 TEXT NOT NULL,
  tipo_cliente         TEXT,     -- 'Residencial' | 'Comercial' | 'Industrial' | 'Condominio'
  apelido              TEXT,
  cep                  TEXT,
  endereco             TEXT,
  bairro               TEXT,
  cidade               TEXT,
  uf                   TEXT,
  fone1                TEXT,     -- (99) 9999-9999
  celular1             TEXT,     -- (99) 99999-9999
  celular2             TEXT,     -- (99) 99999-9999
  email                TEXT,
  cpf                  TEXT,     -- 999.999.999-99
  rg                   TEXT,
  cnpj                 TEXT,     -- 99.999.999/9999-99
  inscricao_estadual   TEXT,
  inscricao_municipal  TEXT,
  situacao_cadastro    TEXT DEFAULT 'Liberado',  -- 'Liberado' | 'Restricao' | 'Bloqueado'
  sexo                 TEXT,     -- 'M' | 'F'
  data_nascimento      TEXT,
  data_cadastro        TEXT DEFAULT (datetime('now')),
  observacao           TEXT
);

-- ---------- FORNECEDORES ----------
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
  site_rede_social      TEXT,
  data_cadastro        TEXT DEFAULT (datetime('now')),
  observacao           TEXT
);

-- ---------- CATEGORIA ----------
CREATE TABLE IF NOT EXISTS categorias (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria  TEXT NOT NULL
);

-- ---------- UNIDADE ----------
CREATE TABLE IF NOT EXISTS unidades (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  unidade   TEXT NOT NULL
);

-- pré-cadastro pedido
INSERT INTO unidades (unidade)
SELECT 'PÇ' WHERE NOT EXISTS (SELECT 1 FROM unidades WHERE unidade = 'PÇ');
INSERT INTO unidades (unidade)
SELECT 'CX' WHERE NOT EXISTS (SELECT 1 FROM unidades WHERE unidade = 'CX');
INSERT INTO unidades (unidade)
SELECT 'KIT' WHERE NOT EXISTS (SELECT 1 FROM unidades WHERE unidade = 'KIT');
INSERT INTO unidades (unidade)
SELECT 'LT' WHERE NOT EXISTS (SELECT 1 FROM unidades WHERE unidade = 'LT');

-- ---------- PRODUTOS ----------
CREATE TABLE IF NOT EXISTS produtos (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  descricao            TEXT NOT NULL,
  tipo                 TEXT,      -- 'Produto' | 'Servico'
  categoria_id         INTEGER REFERENCES categorias(id),
  unidade_id           INTEGER REFERENCES unidades(id),
  controle_estoque     INTEGER DEFAULT 0,   -- 0/1 (checkbox)
  estoque_atual        REAL,
  estoque_minimo       REAL,
  valor_custo          REAL,
  margem_lucro         REAL,      -- percentual
  valor_venda          REAL,
  fornecedor_id        INTEGER REFERENCES fornecedores(id),
  foto_base64          TEXT,      -- imagem opcional, guardada como base64
  descontinuado        INTEGER DEFAULT 0    -- 0/1 (checkbox)
);

-- ---------- Metadados de backup ----------
CREATE TABLE IF NOT EXISTS meta_backup (
  chave  TEXT PRIMARY KEY,
  valor  TEXT
);
