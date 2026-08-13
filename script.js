// RR Elétrica — interações do site (multi-página)

async function includePartials() {
  const headerSlot = document.getElementById('siteHeader');
  const footerSlot = document.getElementById('siteFooter');
  const tasks = [];
  if (headerSlot) {
    tasks.push(
      fetch('partials/header.html').then(r => r.text()).then(html => { headerSlot.innerHTML = html; })
    );
  }
  if (footerSlot) {
    tasks.push(
      fetch('partials/footer.html').then(r => r.text()).then(html => { footerSlot.innerHTML = html; })
    );
  }
  await Promise.all(tasks);
}

function initHeaderFooter() {
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

    // Marca o link ativo com base na página atual
    const current = document.body.getAttribute('data-page');
    if (current) {
      const activeLink = navLinks.querySelector(`a[data-page="${current}"]`);
      if (activeLink) activeLink.classList.add('active');
    }
  }
}

function initServiceObserver() {
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
}

function initCarousel() {
  const track = document.getElementById('carouselTrack');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (track && prevBtn && nextBtn) {
    const scrollAmount = () => track.querySelector('.carousel-card').offsetWidth + 20;
    prevBtn.addEventListener('click', () => track.scrollBy({ left: -scrollAmount(), behavior: 'smooth' }));
    nextBtn.addEventListener('click', () => track.scrollBy({ left: scrollAmount(), behavior: 'smooth' }));
  }
}

function initQuoteForm() {
  const form = document.getElementById('quoteForm');
  const status = document.getElementById('formStatus');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (form.action.includes('SEU_ID_FORMSPREE')) {
      status.textContent = 'Formulário ainda não configurado: troque "SEU_ID_FORMSPREE" pelo seu endpoint do Formspree em sobre-contato.html.';
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

// Lightbox de zoom — usado na página de Painéis Raitec
function initLightbox() {
  const triggers = document.querySelectorAll('[data-zoom-target]');
  if (!triggers.length) return;

  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <button class="lightbox-close" aria-label="Fechar">✕</button>
    <div class="lightbox-content"></div>
  `;
  document.body.appendChild(overlay);
  const content = overlay.querySelector('.lightbox-content');
  const closeBtn = overlay.querySelector('.lightbox-close');

  function open(targetId) {
    const source = document.getElementById(targetId);
    if (!source) return;
    content.innerHTML = source.innerHTML;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function close() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  triggers.forEach(trigger => {
    trigger.addEventListener('click', () => open(trigger.getAttribute('data-zoom-target')));
  });
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

document.addEventListener('DOMContentLoaded', async () => {
  await includePartials();
  initHeaderFooter();
  initServiceObserver();
  initCarousel();
  initQuoteForm();
  initLightbox();
});
