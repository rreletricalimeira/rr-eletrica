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

-- ============================================================
-- Módulo OS / Financeiro
-- ============================================================

CREATE TABLE IF NOT EXISTS contas_caixa (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  nome  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS taxas_cartao (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  parcelas         INTEGER NOT NULL,
  taxa_percentual  REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS os (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id         INTEGER NOT NULL REFERENCES clientes(id),
  descricao          TEXT,
  status_andamento   TEXT DEFAULT 'Aberta',    -- Aberta / Em andamento / Concluída / Cancelada
  status_pagamento   TEXT DEFAULT 'Pendente',  -- Pendente / Pago / Parcial
  valor_mao_obra     REAL DEFAULT 0,
  valor_produtos     REAL DEFAULT 0,           -- somado a partir de os_itens
  valor_total        REAL DEFAULT 0,           -- mao_obra + produtos
  forma_pagamento    TEXT,                     -- Dinheiro / Pix / Cartão de Crédito / Cartão de Débito / Boleto
  parcelas           INTEGER,
  valor_juros        REAL DEFAULT 0,
  conta_caixa_id     INTEGER REFERENCES contas_caixa(id),
  data_abertura      TEXT DEFAULT (datetime('now')),
  data_conclusao     TEXT,
  data_pagamento     TEXT,
  observacao         TEXT
);

CREATE TABLE IF NOT EXISTS os_itens (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id               INTEGER NOT NULL REFERENCES os(id),
  produto_id          INTEGER REFERENCES produtos(id),
  quantidade          REAL NOT NULL DEFAULT 1,
  valor_custo_unit    REAL,   -- oculto do cliente; snapshot do custo no momento do uso
  valor_venda_unit    REAL,
  valor_venda_total   REAL    -- valor_venda_unit * quantidade
);

CREATE TABLE IF NOT EXISTS financeiro (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo             TEXT NOT NULL,   -- Entrada / Saida
  data             TEXT DEFAULT (datetime('now')),
  valor_servico    REAL DEFAULT 0,
  valor_produtos   REAL DEFAULT 0,
  valor_total      REAL NOT NULL,
  categoria        TEXT,
  descricao        TEXT,
  os_id            INTEGER REFERENCES os(id),
  origem           TEXT DEFAULT 'manual',  -- 'automatico' / 'manual'
  conta_caixa_id   INTEGER REFERENCES contas_caixa(id)
);

-- ============================================================
-- Módulo Veículos
-- ============================================================

CREATE TABLE IF NOT EXISTS veiculos (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  veiculo          TEXT NOT NULL,  -- marca e modelo
  placa            TEXT,
  ano              INTEGER,
  cor              TEXT,
  km_inicial       REAL,
  data_aquisicao   TEXT,
  data_venda       TEXT,
  status           TEXT DEFAULT 'Ativo'  -- Ativo / Vendido
);

CREATE TABLE IF NOT EXISTS manutencao_veiculo (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  veiculo_id       INTEGER NOT NULL REFERENCES veiculos(id),
  descricao        TEXT,
  km               REAL,
  tipo             TEXT,   -- Abastecimento / Manutenção
  tanque_cheio     INTEGER DEFAULT 0,
  data             TEXT DEFAULT (datetime('now')),
  valor            REAL,
  litros           REAL,
  posto_oficina    TEXT,
  observacao       TEXT,
  conta_caixa_id   INTEGER REFERENCES contas_caixa(id),
  financeiro_id    INTEGER REFERENCES financeiro(id)  -- lançamento gerado automaticamente
);
