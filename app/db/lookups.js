// lookups.js — pequenos helpers de tabelas de apoio usados por mais de uma página.

import { all, run } from './db.js';

// Devolve o id da categoria do Financeiro com esse nome, criando se ainda
// não existir. Usado pelos lançamentos automáticos (OS paga, Manutenção),
// que gravam o nome da categoria e também o vínculo com a tabela.
export function obterOuCriarCategoriaFinanceiro(nome) {
  const existente = all('SELECT id FROM categorias_financeiro WHERE categoria = ?', [nome]);
  if (existente.length) return existente[0].id;
  run('INSERT INTO categorias_financeiro (categoria) VALUES (?)', [nome]);
  return all('SELECT last_insert_rowid() as id')[0].id;
}

// Endereço em uma linha a partir de um registro com endereco/bairro/cidade/uf/cep
// (usado para pré-preencher o endereço da compra a partir do fornecedor).
export function montarEnderecoEmLinha(r) {
  return [
    r.endereco,
    r.bairro,
    [r.cidade, r.uf].filter(Boolean).join('/'),
    r.cep ? `CEP ${r.cep}` : '',
  ].filter(Boolean).join(' - ');
}
