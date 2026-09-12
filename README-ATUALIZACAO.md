# Atualização do site RR Elétrica

Esta pasta contém os arquivos alterados conforme o PDF **Mudanças no site RR Elétrica** e as imagens enviadas para a página inicial e para a linha RAITEC.

## Arquivos para substituir/adicionar
- `index.html` — nova página inicial.
- `raitec.html` — nova página completa dos painéis RAITEC.
- `eletrica-industrial.html` — nova apresentação industrial.
- `eletrica-comercial.html` — nova página comercial (arquivo novo).
- `eletrica-residencial.html` — nova apresentação residencial.
- `piscinas.html` — nova página de piscinas (arquivo novo).
- `seguranca-eletronica.html` — nova apresentação de segurança.
- `partials/header.html` — novo menu e localização Limeira e região.
- `partials/footer.html` — novo rodapé.
- `site-refresh.css` — camada visual da nova identidade/layout.
- `assets/` — imagens novas.

## Importante
- A pasta `app/` não faz parte desta atualização e não deve ser alterada.
- O arquivo `style.css` original deve permanecer no projeto. As páginas carregam `site-refresh.css` depois dele para aplicar o novo layout.
- O `script.js` original continua sendo usado para menu, parciais e demais interações.
- O formulário existente e a página `sobre-contato.html` não foram substituídos nesta etapa.
