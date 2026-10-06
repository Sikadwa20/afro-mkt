(() => {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  }, { threshold: 0.16, rootMargin: '0px 0px -40px 0px' });

  function initReveal(scope = document) {
    scope.querySelectorAll('[data-reveal]').forEach((element) => revealObserver.observe(element));
  }

  function initSmoothAnchors(scope = document) {
    scope.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const targetId = link.getAttribute('href');
        if (!targetId || targetId === '#') return;
        const target = document.querySelector(targetId);
        if (!target) return;
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        closeNav();
      });
    });
  }

  let navRoot = null;
  let navButton = null;
  let onNavLinkClick = null;

  function setScrolledState() {
    document.body.classList.toggle('nav-scrolled', window.scrollY > 18);
  }

  function closeNav() {
    if (!navRoot || !navButton) return;
    document.body.classList.remove('nav-open');
    navRoot.classList.remove('nav-active');
    navButton.textContent = '☰';
    navButton.setAttribute('aria-expanded', 'false');
  }

  function initNavigation({ navSelector = '.site-nav', navButtonId = 'mobileBtn' } = {}) {
    navRoot = document.querySelector(navSelector);
    navButton = document.getElementById(navButtonId);
    setScrolledState();
    window.addEventListener('scroll', setScrolledState, { passive: true });

    if (!navRoot || !navButton) return;

    navButton.addEventListener('click', () => {
      const isOpen = document.body.classList.toggle('nav-open');
      navRoot.classList.toggle('nav-active', isOpen);
      navButton.textContent = isOpen ? '✕' : '☰';
      navButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    onNavLinkClick = () => closeNav();
    navRoot.querySelectorAll('.nav-links a, .nav-actions a, .nav-actions .btn').forEach((link) => {
      link.addEventListener('click', onNavLinkClick);
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 820) closeNav();
    });
  }

  function initLanguageMenu({ selectorId = 'languageSelector', buttonId = 'languageBtn' } = {}) {
    const selector = document.getElementById(selectorId);
    const button = document.getElementById(buttonId);
    if (!selector || !button) return;

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = selector.classList.toggle('open');
      button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (event) => {
      if (!selector.contains(event.target)) {
        selector.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function initPage(options = {}) {
    initNavigation(options.navigation || options);
    initLanguageMenu(options.language || {});
    initSmoothAnchors(document);
    initReveal(document);
  }

  window.AfroMktPreview = {
    initPage,
    initReveal,
    initSmoothAnchors,
    closeNav
  };
})();
