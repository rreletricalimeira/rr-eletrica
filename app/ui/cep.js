// cep.js — Busca de endereço via ViaCEP (gratuito, sem chave).
// Se não houver internet, falha em silêncio e libera o formulário
// para preenchimento manual.

export async function buscarCep(cepDigitado) {
  const cep = (cepDigitado || '').replace(/\D/g, '');
  if (cep.length !== 8) return null;

  try {
    const resp = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.erro) return null;
    return {
      endereco: data.logradouro || '',
      bairro: data.bairro || '',
      cidade: data.localidade || '',
      uf: data.uf || '',
    };
  } catch {
    return null; // sem internet ou erro de rede — segue com preenchimento manual
  }
}

// Liga um input de CEP a um formulário: ao completar 8 dígitos, busca
// e preenche os campos indicados automaticamente.
export function ligarAutoPreenchimentoCep(inputCep, campos) {
  inputCep.addEventListener('input', async () => {
    const digits = inputCep.value.replace(/\D/g, '');
    if (digits.length === 8) {
      const resultado = await buscarCep(digits);
      if (resultado) {
        if (campos.endereco) campos.endereco.value = resultado.endereco;
        if (campos.bairro) campos.bairro.value = resultado.bairro;
        if (campos.cidade) campos.cidade.value = resultado.cidade;
        if (campos.uf) campos.uf.value = resultado.uf;
      }
    }
  });
}
