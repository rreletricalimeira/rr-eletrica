import { renderCertificadosGarantia } from './certificado_garantia.js';

// ============================================================
// Aba "Documentos" do módulo Técnico.
// Por enquanto reúne o Certificado de Garantia (ver certificado_garantia.js).
//
// OBS.: o antigo módulo de upload de arquivos/PDF (Blob na store `arquivos`)
// não está neste repositório — quando o código dele for integrado, ele entra
// aqui como uma segunda seção da mesma aba, sem mexer no certificado.
// ============================================================

export function renderDocumentos(container) {
  renderCertificadosGarantia(container);
}
