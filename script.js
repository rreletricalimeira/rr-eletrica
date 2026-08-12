// RR Elétrica — interações do site
document.addEventListener('DOMContentLoaded', () => {

  // Ano no rodapé
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Menu mobile
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.getElementById('navLinks');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      const isOpen = navLinks.classList.toggle('open');
      navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
    navLinks.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => {
        navLinks.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Animação "liga o disjuntor" ao entrar na tela (painel de serviços)
  const cells = document.querySelectorAll('.service-cell');
  if ('IntersectionObserver' in window && cells.length) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('in-view'), i * 90);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.25 });
    cells.forEach(cell => observer.observe(cell));
  } else {
    cells.forEach(cell => cell.classList.add('in-view'));
  }

  // Carrossel de diferenciais
  const track = document.getElementById('carouselTrack');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (track && prevBtn && nextBtn) {
    const scrollAmount = () => track.querySelector('.carousel-card').offsetWidth + 20;
    prevBtn.addEventListener('click', () => track.scrollBy({ left: -scrollAmount(), behavior: 'smooth' }));
    nextBtn.addEventListener('click', () => track.scrollBy({ left: scrollAmount(), behavior: 'smooth' }));
  }

  // Envio do formulário via Formspree (fetch, sem sair da página)
  const form = document.getElementById('quoteForm');
  const status = document.getElementById('formStatus');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (form.action.includes('SEU_ID_FORMSPREE')) {
        status.textContent = 'Formulário ainda não configurado: troque "SEU_ID_FORMSPREE" pelo seu endpoint do Formspree em index.html.';
        status.className = 'form-status err';
        return;
      }

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Enviando...';
      status.textContent = '';
      status.className = 'form-status';

      try {
        const data = new FormData(form);
        const response = await fetch(form.action, {
          method: 'POST',
          body: data,
          headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
          form.reset();
          status.textContent = 'Recebemos sua solicitação! Vamos responder em breve pelo WhatsApp ou telefone informado.';
          status.className = 'form-status ok';
        } else {
          status.textContent = 'Não foi possível enviar agora. Tente novamente ou chame no WhatsApp.';
          status.className = 'form-status err';
        }
      } catch (err) {
        status.textContent = 'Erro de conexão. Tente novamente ou chame no WhatsApp.';
        status.className = 'form-status err';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  }
});
