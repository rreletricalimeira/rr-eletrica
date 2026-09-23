import { all, run, persist } from '../db/db.js';

// ============================================================
// Manuais — lê os arquivos de uma pasta do celular (escolhida toda
// vez que a página abre — sem acesso persistente, por decisão do
// Robinson, já que isso não é confiável em PWA no Android) e deixa
// filtrar por Segmento → Categoria, e abrir o arquivo.
//
// Os arquivos NUNCA são salvos no banco (não tem espaço/backup pra
// isso). Só a classificação de cada nome de arquivo (qual Segmento e
// Categoria ele pertence) fica salva em `manuais_metadata`, pra
// reaplicar sozinha da próxima vez que a mesma pasta for escolhida —
// assim você só classifica cada manual uma vez.
// ============================================================

let arquivosSelecionados = []; // [{nome, file}] — reseta ao trocar de página, de propósito

export function renderManuais(container) {
  container.innerHTML = `
    <div class="page">
      <h2>Manuais</h2>

      <div class="card">
        <button id="btn-selecionar-pasta">📁 Selecionar pasta de manuais</button>
        <p class="item-sub" id="pasta-status">${arquivosSelecionados.length ? `${arquivosSelecionados.length} arquivo(s) carregado(s)` : 'Nenhuma pasta selecionada nesta sessão. Dica: crie uma pasta "MANUAIS" dentro de Documentos no celular pra sempre escolher o mesmo lugar.'}</p>
        <p class="pin-erro" id="pasta-erro"></p>
      </div>

      <div class="card form-card">
        <h3 style="margin-top:0">Nova categoria de manual</h3>
        <div class="linha-dupla campo-full">
          <div>
            <select id="nc-segmento">
              ${all('SELECT id, segmento FROM segmentos ORDER BY segmento').map((s) => `<option value="${s.id}">${escapeHtml(s.segmento)}</option>`).join('')}
            </select>
          </div>
          <div>
            <input type="text" id="nc-categoria" placeholder="Nome da categoria" />
          </div>
          <button id="btn-add-categoria-manual">Adicionar</button>
        </div>
      </div>

      <div class="card">
        <h3>Filtros</h3>
        <label>Segmento</label>
        <select id="f-filtro-segmento">
          <option value="">Todos</option>
          ${all('SELECT id, segmento FROM segmentos ORDER BY segmento').map((s) => `<option value="${s.id}">${escapeHtml(s.segmento)}</option>`).join('')}
        </select>
        <label>Categoria</label>
        <select id="f-filtro-categoria">
          <option value="">Todas</option>
        </select>
      </div>

      <div class="card">
        <h3>Não classificados</h3>
        <ul id="lista-nao-classificados" class="lista"></ul>
      </div>

      <div class="card">
        <h3>Manuais</h3>
        <ul id="lista-manuais" class="lista"></ul>
      </div>
    </div>
  `;

  const listaNaoClassificados = container.querySelector('#lista-nao-classificados');
  const listaManuais = container.querySelector('#lista-manuais');
  const filtroSegmento = container.querySelector('#f-filtro-segmento');
  const filtroCategoria = container.querySelector('#f-filtro-categoria');

  function categoriasDoSegmento(segmentoId) {
    if (!segmentoId) return all('SELECT id, categoria, segmento_id FROM manuais_categorias ORDER BY categoria');
    return all('SELECT id, categoria, segmento_id FROM manuais_categorias WHERE segmento_id = ? ORDER BY categoria', [Number(segmentoId)]);
  }

  function atualizarFiltroCategoria() {
    const segmentoId = filtroSegmento.value;
    const cats = categoriasDoSegmento(segmentoId);
    filtroCategoria.innerHTML = '<option value="">Todas</option>' + cats.map((c) => `<option value="${c.id}">${escapeHtml(c.categoria)}</option>`).join('');
  }
  filtroSegmento.addEventListener('change', () => { atualizarFiltroCategoria(); renderListas(); });
  filtroCategoria.addEventListener('change', renderListas);
  atualizarFiltroCategoria();

  container.querySelector('#btn-add-categoria-manual').addEventListener('click', async () => {
    const segmentoId = Number(container.querySelector('#nc-segmento').value) || null;
    const nome = container.querySelector('#nc-categoria').value.trim();
    if (!nome) return;
    run('INSERT INTO manuais_categorias (segmento_id, categoria) VALUES (?, ?)', [segmentoId, nome]);
    await persist();
    container.querySelector('#nc-categoria').value = '';
    atualizarFiltroCategoria();
    renderListas();
  });

  // ---- Seleção da pasta ----
  container.querySelector('#btn-selecionar-pasta').addEventListener('click', async () => {
    const statusEl = container.querySelector('#pasta-status');
    const erroEl = container.querySelector('#pasta-erro');
    erroEl.textContent = '';
    try {
      const arquivos = await selecionarPastaEObterArquivos();
      arquivosSelecionados = arquivos;
      statusEl.textContent = `${arquivos.length} arquivo(s) carregado(s).`;
      renderListas();
    } catch (e) {
      if (e && e.name === 'AbortError') return; // usuário cancelou o seletor
      erroEl.textContent = 'Não consegui ler a pasta. Tente novamente ou verifique a permissão do navegador.';
    }
  });

  function renderListas() {
    const segmentoFiltro = filtroSegmento.value ? Number(filtroSegmento.value) : null;
    const categoriaFiltro = filtroCategoria.value ? Number(filtroCategoria.value) : null;

    const metadataPorNome = {};
    all('SELECT * FROM manuais_metadata').forEach((m) => { metadataPorNome[m.nome_arquivo] = m; });

    const naoClassificados = [];
    const classificados = [];
    arquivosSelecionados.forEach((a) => {
      const meta = metadataPorNome[a.nome];
      if (!meta || !meta.segmento_id) naoClassificados.push(a);
      else classificados.push({ ...a, meta });
    });

    listaNaoClassificados.innerHTML = naoClassificados.map((a) => linhaArquivoHtml(a, null)).join('')
      || '<li><em>Nenhum arquivo pendente de classificação</em></li>';

    const filtrados = classificados.filter((a) => {
      if (segmentoFiltro && a.meta.segmento_id !== segmentoFiltro) return false;
      if (categoriaFiltro && a.meta.categoria_id !== categoriaFiltro) return false;
      return true;
    });
    listaManuais.innerHTML = filtrados.map((a) => linhaArquivoHtml(a, a.meta)).join('')
      || `<li><em>${arquivosSelecionados.length ? 'Nenhum manual encontrado com esse filtro' : 'Selecione uma pasta acima para listar os manuais'}</em></li>`;

    // ---- Liga os eventos de cada linha (classificar + abrir) ----
    container.querySelectorAll('.linha-manual').forEach((li) => {
      const nome = li.dataset.nome;
      const arquivo = arquivosSelecionados.find((a) => a.nome === nome);

      const selSeg = li.querySelector('.ml-segmento');
      const selCat = li.querySelector('.ml-categoria');

      function atualizarCategoriasDaLinha() {
        const cats = categoriasDoSegmento(selSeg.value);
        const catAtual = selCat.dataset.categoriaAtual;
        selCat.innerHTML = '<option value="">Selecione a categoria</option>' +
          cats.map((c) => `<option value="${c.id}" ${String(c.id) === catAtual ? 'selected' : ''}>${escapeHtml(c.categoria)}</option>`).join('');
      }
      if (selSeg) {
        atualizarCategoriasDaLinha();
        selSeg.addEventListener('change', atualizarCategoriasDaLinha);
      }

      const btnSalvarClassificacao = li.querySelector('.btn-salvar-classificacao');
      if (btnSalvarClassificacao) {
        btnSalvarClassificacao.addEventListener('click', async () => {
          const segmentoId = Number(selSeg.value) || null;
          const categoriaId = Number(selCat.value) || null;
          if (!segmentoId) { alert('Selecione o segmento.'); return; }
          const existente = all('SELECT id FROM manuais_metadata WHERE nome_arquivo = ?', [nome])[0];
          if (existente) {
            run('UPDATE manuais_metadata SET segmento_id=?, categoria_id=? WHERE id=?', [segmentoId, categoriaId, existente.id]);
          } else {
            run('INSERT INTO manuais_metadata (nome_arquivo, segmento_id, categoria_id) VALUES (?, ?, ?)', [nome, segmentoId, categoriaId]);
          }
          await persist();
          renderListas();
        });
      }

      const btnAbrir = li.querySelector('.btn-abrir-manual');
      if (btnAbrir) btnAbrir.addEventListener('click', () => abrirArquivo(arquivo));
    });
  }

  function linhaArquivoHtml(a, meta) {
    return `
      <li class="linha-manual" data-nome="${escapeAttr(a.nome)}" style="flex-wrap:wrap; align-items:end; gap:8px">
        <div class="item-principal" style="flex:1 1 100%">
          <strong>${escapeHtml(a.nome)}</strong>
        </div>
        <select class="ml-segmento" style="max-width:180px">
          <option value="">Segmento</option>
          ${all('SELECT id, segmento FROM segmentos ORDER BY segmento').map((s) =>
            `<option value="${s.id}" ${meta && meta.segmento_id === s.id ? 'selected' : ''}>${escapeHtml(s.segmento)}</option>`
          ).join('')}
        </select>
        <select class="ml-categoria" data-categoria-atual="${meta && meta.categoria_id ? meta.categoria_id : ''}" style="max-width:180px"></select>
        <button class="btn-salvar-classificacao secondary">Salvar classificação</button>
        <button class="btn-abrir-manual">Abrir</button>
      </li>
    `;
  }

  renderListas();
}

// ---------- Leitura da pasta ----------

// Tenta a File System Access API (showDirectoryPicker) — melhor UX onde tem
// suporte (Chrome desktop e boa parte do Chrome Android). Se não tiver, cai
// pro <input type="file" webkitdirectory>, compatível com praticamente
// qualquer navegador — em ambos os casos a pasta é escolhida na hora, sem
// guardar acesso permanente, exatamente como combinado.
async function selecionarPastaEObterArquivos() {
  if (window.showDirectoryPicker) {
    const dirHandle = await window.showDirectoryPicker();
    const arquivos = [];
    for await (const [nome, handle] of dirHandle.entries()) {
      if (handle.kind === 'file') {
        const file = await handle.getFile();
        arquivos.push({ nome, file });
      }
    }
    return arquivos;
  }
  return selecionarPastaViaInput();
}

function selecionarPastaViaInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const arquivos = Array.from(input.files || []).map((file) => ({
        nome: file.webkitRelativePath ? file.webkitRelativePath.split('/').pop() : file.name,
        file,
      }));
      input.remove();
      resolve(arquivos);
    });
    input.addEventListener('cancel', () => { input.remove(); reject({ name: 'AbortError' }); });
    input.click();
  });
}

function abrirArquivo(arquivo) {
  if (!arquivo || !arquivo.file) return;
  const url = URL.createObjectURL(arquivo.file);
  window.open(url, '_blank');
  // Não revoga a URL na hora pra não fechar o arquivo recém-aberto; o
  // navegador libera a memória sozinho quando a página/app é recarregada.
}

// ---------- Helpers ----------

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(s) { return String(s ?? '').replace(/"/g, '&quot;'); }
