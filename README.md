# Site RR Elétrica

Site institucional estático (HTML/CSS/JS puro) pronto para publicar gratuitamente no **GitHub Pages**.

## Estrutura
```
index.html      → página única do site
style.css       → estilos
script.js       → menu mobile, animações e envio do formulário
assets/logo.png → logo da empresa
```

## 1. Publicar no GitHub Pages

1. Crie um repositório novo no GitHub (ex: `rr-eletrica`).
2. Envie todos os arquivos desta pasta para o repositório (pela interface do GitHub, arrastando os arquivos, ou via Git).
3. No repositório, vá em **Settings → Pages**.
4. Em "Branch", selecione `main` (ou `master`) e a pasta `/root`, depois clique em **Save**.
5. Em alguns minutos o GitHub mostrará o link do site, algo como:
   `https://seu-usuario.github.io/rr-eletrica/`

## 2. Configurar o formulário (Formspree — gratuito)

O formulário de orçamento já está pronto, só falta ligá-lo à sua conta:

1. Acesse [formspree.io](https://formspree.io) e crie uma conta gratuita.
2. Crie um novo formulário e copie o endpoint gerado (algo como `https://formspree.io/f/xnnqzzzz`).
3. Abra o arquivo `index.html`, procure por:
   ```html
   <form class="quote-form" action="https://formspree.io/f/SEU_ID_FORMSPREE" method="POST" id="quoteForm">
   ```
4. Troque `SEU_ID_FORMSPREE` pelo ID que o Formspree te deu.
5. Salve, suba a alteração no GitHub e pronto — os e-mails de orçamento cairão na conta que você cadastrou no Formspree.

> Enquanto o ID não for trocado, o site avisa na tela que o formulário ainda não foi configurado (para não parecer que o envio funcionou sem realmente enviar nada).

## 3. O que já vem pronto
- Botão flutuante de WhatsApp e todos os CTAs apontando para **(19) 98160-5606**.
- CNPJ da empresa exibido no cabeçalho, rodapé e seção de contato.
- Seções: Hero, prova de confiança, Serviços (instalações industriais/comerciais/residenciais, iluminação, quadros de comando), destaque para a especialidade em **elétrica de piscinas**, carrossel de diferenciais, "como funciona" e formulário de orçamento.
- 100% responsivo (testado em desktop e mobile) e com foco em atrair clientes industriais (linguagem, seção de confiança e CTA direto).

## 4. Personalizações fáceis
- **Textos**: edite diretamente em `index.html`.
- **Cores**: estão centralizadas no topo do `style.css`, em `:root { ... }`.
- **Fotos de obras**: se você conseguir fotos de serviços realizados no futuro, me avise — dá pra trocar os ícones/ilustrações da seção de diferenciais e do carrossel por fotos reais, o que costuma aumentar bastante a conversão.
