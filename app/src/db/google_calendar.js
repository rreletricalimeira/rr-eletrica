// google_calendar.js — cria, atualiza e apaga eventos no Google Agenda
// (calendário principal) usando o mesmo login do backup (backup.js).
// Requer: Google Calendar API ativada no projeto do Client ID e a permissão
// "calendar.events" aceita ao clicar em "Conectar ao Google".

import { getAccessToken } from './backup.js';

const BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

export class GoogleNaoConectadoError extends Error {}

// ---------- Datas (aritmética em UTC só para não sofrer com fuso/horário de verão) ----------

function pad(n) { return String(n).padStart(2, '0'); }

export function somarMinutos(data, hora, minutos) {
  const [y, m, d] = data.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh, mm + minutos));
  return { data: dt.toISOString().slice(0, 10), hora: `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}` };
}

function diaSeguinte(data) {
  const [y, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

// ---------- Monta o evento a partir de um registro da agenda ----------

export function montarEvento(ag) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  const prefixo = ag.tipo === 'A pagar' ? 'Pagar: ' : ag.tipo === 'A receber' ? 'Receber: ' : '';
  const primeiraLinha = (ag.descricao || '').split('\n')[0].trim();
  const partes = [ag.nome, primeiraLinha].filter(Boolean).join(' - ');
  const titulo = `${ag.concluido ? '✔ ' : ''}${prefixo}${partes}`.trim() || 'Compromisso';

  const linhas = [];
  if (ag.descricao) linhas.push(ag.descricao);
  if (ag.valor) linhas.push(`Valor: R$ ${Number(ag.valor).toFixed(2).replace('.', ',')}`);
  if (ag.observacao) linhas.push(ag.observacao);
  linhas.push('Criado pelo app RR Elétrica');

  const evento = { summary: titulo, description: linhas.join('\n'), reminders: { useDefault: true } };
  if (ag.endereco) evento.location = ag.endereco;

  if (ag.hora) {
    const fim = somarMinutos(ag.data, ag.hora, Number(ag.duracao_min) || 60);
    evento.start = { dateTime: `${ag.data}T${ag.hora}:00`, timeZone: tz };
    evento.end = { dateTime: `${fim.data}T${fim.hora}:00`, timeZone: tz };
  } else {
    // Sem horário: evento de dia inteiro (bom para vencimento de contas).
    evento.start = { date: ag.data };
    evento.end = { date: diaSeguinte(ag.data) };
  }
  return evento;
}

// ---------- Chamadas à API ----------

async function chamar(metodo, sufixo, corpo) {
  const token = getAccessToken();
  if (!token) throw new GoogleNaoConectadoError('Você não está conectado ao Google. Toque em "Conectar ao Google".');

  const resp = await fetch(BASE + sufixo, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });

  if (resp.status === 401) throw new GoogleNaoConectadoError('A conexão com o Google expirou. Toque em "Conectar ao Google" de novo.');
  if (!resp.ok) {
    let detalhe = '';
    try { detalhe = (await resp.json()).error?.message || ''; } catch (e) { /* sem corpo */ }
    if (resp.status === 403) {
      throw new Error('Sem permissão para o Google Agenda. Ative a "Google Calendar API" no projeto e aceite a permissão ao conectar. ' + detalhe);
    }
    const erro = new Error(detalhe || `Erro ${resp.status} no Google Agenda.`);
    erro.status = resp.status;
    throw erro;
  }
  return resp.status === 204 ? null : resp.json();
}

export async function inserirEvento(ag) {
  const r = await chamar('POST', '', montarEvento(ag));
  return r.id;
}

// Devolve o id do evento (novo, se o antigo não existir mais no Google).
export async function atualizarEvento(eventId, ag) {
  try {
    const r = await chamar('PUT', `/${encodeURIComponent(eventId)}`, montarEvento(ag));
    return r.id;
  } catch (e) {
    if (e.status === 404 || e.status === 410) return inserirEvento(ag);
    throw e;
  }
}

export async function removerEvento(eventId) {
  try {
    await chamar('DELETE', `/${encodeURIComponent(eventId)}`);
  } catch (e) {
    if (e.status === 404 || e.status === 410) return; // já não existe
    throw e;
  }
}
