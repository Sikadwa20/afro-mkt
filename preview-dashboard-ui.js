(() => {
  function updateScrollState() {
    document.body.classList.toggle('nav-scrolled', window.scrollY > 18);
  }

  function seedReveal() {
    const targets = document.querySelectorAll('#loadingState, #authState .panel, #dashboardState .card, #dashboardState .dashboard-top');
    targets.forEach((element, index) => {
      element.style.opacity = '0';
      element.style.transform = 'translateY(22px)';
      element.style.animation = `dashboardFadeIn 520ms ease forwards ${index * 70}ms`;
    });
  }

  const style = document.createElement('style');
  style.textContent = '@keyframes dashboardFadeIn{from{opacity:0;transform:translateY(22px)}to{opacity:1;transform:translateY(0)}}';
  document.head.appendChild(style);

  updateScrollState();
  window.addEventListener('scroll', updateScrollState, { passive: true });
  window.addEventListener('load', seedReveal);
})();
