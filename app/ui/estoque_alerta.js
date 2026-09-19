// estoque_alerta.js — produtos com estoque abaixo do mínimo.
// Regra: só entram produtos com "Controle de estoque" marcado, com estoque
// mínimo informado, não descontinuados, e cujo estoque atual está abaixo
// do mínimo.

import { all } from '../db/db.js';

export function produtosAbaixoDoEstoque() {
  return all(`
    SELECT p.id, p.descricao, p.estoque_atual, p.estoque_minimo, u.unidade, f.nome AS fornecedor
    FROM produtos p
    LEFT JOIN unidades u ON u.id = p.unidade_id
    LEFT JOIN fornecedores f ON f.id = p.fornecedor_id
    WHERE COALESCE(p.descontinuado, 0) = 0
      AND COALESCE(p.controle_estoque, 0) = 1
      AND p.estoque_minimo IS NOT NULL
      AND COALESCE(p.estoque_atual, 0) < p.estoque_minimo
    ORDER BY (p.estoque_minimo - COALESCE(p.estoque_atual, 0)) DESC, p.descricao
  `);
}

export function tabelaEstoqueBaixoHtml(itens) {
  const linhas = itens.map((p) => {
    const atual = p.estoque_atual || 0;
    const falta = p.estoque_minimo - atual;
    return `
      <tr>
        <td>${escapeHtml(p.descricao)}</td>
        <td class="num">${fmtQtd(atual)}${p.unidade ? ' ' + escapeHtml(p.unidade) : ''}</td>
        <td class="num">${fmtQtd(p.estoque_minimo)}${p.unidade ? ' ' + escapeHtml(p.unidade) : ''}</td>
        <td class="num falta">${fmtQtd(falta)}</td>
        <td>${escapeHtml(p.fornecedor || '-')}</td>
      </tr>
    `;
  }).join('');

  return `
    <div class="tabela-scroll">
      <table class="tabela-alerta">
        <thead>
          <tr><th>Produto</th><th class="num">Estoque atual</th><th class="num">Mínimo</th><th class="num">Faltam</th><th>Fornecedor</th></tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>
  `;
}

// Abre o alerta como janela sobre a tela atual (mesmo padrão do painel de exportação).
export function abrirAlertaEstoque({ onVerProdutos } = {}) {
  const itens = produtosAbaixoDoEstoque();
  if (!itens.length) return false;

  const overlay = document.createElement('div');
  overlay.className = 'overlay-exportar';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="painel-exportar painel-modal">
      <button type="button" class="painel-exportar-fechar" aria-label="Fechar">×</button>
      <h3 class="painel-modal-titulo">⚠ Produtos abaixo do estoque mínimo (${itens.length})</h3>
      ${tabelaEstoqueBaixoHtml(itens)}
      <div class="painel-exportar-botoes painel-modal-botoes">
        ${onVerProdutos ? '<button type="button" id="btn-alerta-produtos">Ir para Produtos</button>' : ''}
        <button type="button" id="btn-alerta-fechar">Fechar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const fechar = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(); });
  overlay.querySelector('.painel-exportar-fechar').addEventListener('click', fechar);
  overlay.querySelector('#btn-alerta-fechar').addEventListener('click', fechar);
  overlay.querySelector('#btn-alerta-produtos')?.addEventListener('click', () => { fechar(); onVerProdutos(); });
  return true;
}

function fmtQtd(v) {
  return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
