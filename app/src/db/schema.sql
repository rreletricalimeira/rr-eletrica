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

-- Segmentos de atuação dos fornecedores (lista pré-carregada, editável na aba Segmentos)
CREATE TABLE IF NOT EXISTS segmentos (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  segmento  TEXT NOT NULL
);

-- Só pré-carrega quando a tabela está vazia (assim, o que for apagado na aba Segmentos não volta).
INSERT INTO segmentos (segmento)
  SELECT v FROM (
    SELECT 'Elétrica' AS v UNION ALL SELECT 'Automação' UNION ALL SELECT 'Segurança eletrônica'
    UNION ALL SELECT 'Hidráulica' UNION ALL SELECT 'Produtos para Piscinas'
  ) WHERE (SELECT COUNT(*) FROM segmentos) = 0;

CREATE TABLE IF NOT EXISTS fornecedores (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  nome                 TEXT NOT NULL,
  contato              TEXT,
  segmento             TEXT,                 -- nome do segmento (cópia de segmentos.segmento)
  segmento_id          INTEGER REFERENCES segmentos(id),
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
  tipo_registro      TEXT DEFAULT 'OS',        -- OS / Orçamento — orçamento não gera lançamento no financeiro
  status_andamento   TEXT DEFAULT 'Aberta',    -- Aberta / Em andamento / Concluída / Cancelada
  status_pagamento   TEXT DEFAULT 'Pendente',  -- Pendente / Pago / Parcial
  valor_mao_obra     REAL DEFAULT 0,
  valor_produtos     REAL DEFAULT 0,           -- somado a partir de os_itens
  valor_total        REAL DEFAULT 0,           -- mao_obra + produtos - desconto
  forma_pagamento    TEXT,                     -- Dinheiro / Pix / Cartão de Crédito / Cartão de Débito / Boleto
  parcelas           INTEGER,
  valor_juros        REAL DEFAULT 0,
  desconto           REAL DEFAULT 0,           -- desconto editável; valor_total já vem com ele abatido
  endereco           TEXT,                     -- local do serviço (pré-preenchido com o do cliente)
  telefone           TEXT,
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

-- Um Orçamento pode ter vários serviços (cada um com sua própria descrição
-- e valor de mão de obra) e cada serviço pode ter vários produtos. A OS
-- "normal" continua usando valor_mao_obra + os_itens direto, sem esse nível
-- extra. valor_mao_obra e valor_produtos em "os" são recalculados a partir
-- daqui quando tipo_registro = 'Orçamento'.
CREATE TABLE IF NOT EXISTS os_servicos (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  os_id          INTEGER NOT NULL REFERENCES os(id),
  descricao      TEXT,
  valor_servico  REAL DEFAULT 0,
  ordem          INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS os_servico_itens (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  servico_id          INTEGER NOT NULL REFERENCES os_servicos(id),
  produto_id          INTEGER REFERENCES produtos(id),
  quantidade          REAL NOT NULL DEFAULT 1,
  valor_custo_unit    REAL,
  valor_venda_unit    REAL,
  valor_venda_total   REAL
);

-- Categorias dos lançamentos do Financeiro (editável na aba Categoria Financeiro).
-- As três primeiras são usadas pelos lançamentos automáticos (OS paga e Manutenção/Abastecimento).
CREATE TABLE IF NOT EXISTS categorias_financeiro (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  categoria  TEXT NOT NULL
);

INSERT INTO categorias_financeiro (categoria)
  SELECT v FROM (
    SELECT 'Mão de obra+Produtos' AS v UNION ALL SELECT 'Abastecimento' UNION ALL SELECT 'Manutenção'
  ) WHERE (SELECT COUNT(*) FROM categorias_financeiro) = 0;

CREATE TABLE IF NOT EXISTS financeiro (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo             TEXT NOT NULL,   -- Entrada / Saida
  data             TEXT DEFAULT (datetime('now')),
  valor_servico    REAL DEFAULT 0,
  valor_produtos   REAL DEFAULT 0,
  valor_total      REAL NOT NULL,
  categoria        TEXT,            -- nome da categoria (cópia de categorias_financeiro.categoria)
  categoria_id     INTEGER REFERENCES categorias_financeiro(id),
  descricao        TEXT,
  os_id            INTEGER REFERENCES os(id),
  origem           TEXT DEFAULT 'manual',  -- 'automatico' / 'manual'
  conta_caixa_id   INTEGER REFERENCES contas_caixa(id)
);

-- ============================================================
-- Módulo Compras
-- ============================================================
-- fornecedor_id é opcional: dá para comprar de quem não está cadastrado
-- (nesse caso só fornecedor_nome é preenchido). Ao salvar uma compra, os
-- produtos ligados são atualizados (dados + estoque somando a quantidade).

CREATE TABLE IF NOT EXISTS compras (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  data             TEXT DEFAULT (date('now')),
  fornecedor_id    INTEGER REFERENCES fornecedores(id),
  fornecedor_nome  TEXT,
  endereco         TEXT,
  telefone         TEXT,
  valor_total      REAL DEFAULT 0,
  conta_caixa_id   INTEGER REFERENCES contas_caixa(id),
  financeiro_id    INTEGER REFERENCES financeiro(id),  -- saída gerada automaticamente
  observacao       TEXT
);

CREATE TABLE IF NOT EXISTS compra_itens (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  compra_id         INTEGER NOT NULL REFERENCES compras(id),
  produto_id        INTEGER NOT NULL REFERENCES produtos(id),
  quantidade        REAL NOT NULL DEFAULT 1,
  valor_custo_unit  REAL,
  valor_total       REAL
);

-- ============================================================
-- Agenda (compromissos, contas a pagar e a receber)
-- ============================================================
-- Cada linha é UMA ocorrência. Lançamentos com repetição (diária, semanal,
-- mensal) viram várias linhas ligadas por serie_id. Cada ocorrência tem o
-- próprio evento no Google Agenda (google_event_id) e, no caso de contas,
-- a própria saída/entrada no Financeiro quando é marcada como paga/recebida.

CREATE TABLE IF NOT EXISTS agenda (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo               TEXT NOT NULL DEFAULT 'Compromisso',  -- Compromisso / A pagar / A receber
  nome               TEXT,                                 -- cliente (ou fornecedor, em A pagar)
  cliente_id         INTEGER REFERENCES clientes(id),
  fornecedor_id      INTEGER REFERENCES fornecedores(id),
  endereco           TEXT,
  os_id              INTEGER REFERENCES os(id),
  descricao          TEXT,                                 -- serviço/orçamento a executar (ou descrição da conta)
  data               TEXT NOT NULL,                        -- AAAA-MM-DD
  hora               TEXT,                                 -- HH:MM (vazio = dia inteiro)
  duracao_min        INTEGER DEFAULT 60,
  valor              REAL,
  categoria_id       INTEGER REFERENCES categorias_financeiro(id),
  conta_caixa_id     INTEGER REFERENCES contas_caixa(id),
  concluido          INTEGER DEFAULT 0,                    -- concluído / pago / recebido
  repeticao          TEXT DEFAULT 'Nenhuma',               -- Nenhuma / Diária / Semanal / Mensal
  serie_id           INTEGER,                              -- id da 1ª ocorrência da série
  ocorrencia         INTEGER,
  total_ocorrencias  INTEGER,
  sincronizar_google INTEGER DEFAULT 0,
  google_event_id    TEXT,
  financeiro_id      INTEGER REFERENCES financeiro(id),
  observacao         TEXT
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

-- ============================================================
-- Módulo Técnico / Laudos
-- ============================================================
-- O checklist (painel, bombas/motores + inversor, ambiente, medições) e as
-- não conformidades têm quantidade de itens variável (ex.: "+ Adicionar
-- bomba"), então em vez de dezenas de colunas fixas guardamos essa parte
-- como um único JSON em dados_json. Os campos que aparecem nas listagens
-- e relatórios (cliente, datas, parecer) ficam como colunas normais.

CREATE TABLE IF NOT EXISTS laudos (
  id                              INTEGER PRIMARY KEY AUTOINCREMENT,
  numero                          TEXT,
  cliente_id                      INTEGER REFERENCES clientes(id),
  endereco                        TEXT,
  telefone                        TEXT,
  celular                         TEXT,
  data_visita                     TEXT,
  hora_visita                     TEXT,
  responsavel_tecnico             TEXT,
  acompanhante                    TEXT,
  tipo_instalacao                 TEXT DEFAULT 'Residencial',
  dados_json                      TEXT,   -- painel, bombas, ambiente, medições, não conformidades
  estimativa_economia             TEXT,
  parecer_classificacao           TEXT,
  parecer_descricao               TEXT,
  fotos_json                      TEXT,   -- [{ dado_base64, legenda }]
  assinatura_responsavel_base64   TEXT,
  data_assinatura_responsavel     TEXT,
  assinatura_cliente_base64       TEXT,
  data_assinatura_cliente         TEXT,
  status                          TEXT DEFAULT 'Rascunho',  -- Rascunho / Concluído
  data_criacao                    TEXT DEFAULT (datetime('now'))
);

