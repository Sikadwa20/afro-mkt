(() => {
  const checkoutEndpoint = `${window.AFRO_MKT_CONFIG.supabaseUrl}/functions/v1/create-checkout-session`;
  const languageMeta = { en: '🇬🇧 EN', pt: '🇵🇹 PT', fr: '🇫🇷 FR', es: '🇪🇸 ES' };

  const translations = {
    en: {
      brandTag: 'Diaspora marketplace', navHome: 'Home', navShop: 'Shop', navSell: 'Sell on AfroMkt', navSignIn: 'Sign In', navGetStarted: 'Get Started',
      heroBadge: 'Seller subscriptions now open', heroLineOne: 'Build your', heroLineTwo: 'AfroMkt storefront.', heroDescription: 'Reach African communities across Portugal and beyond with seller plans designed to help your listings look credible from the first day.', trustLocal: 'Built for local African businesses', trustPricing: 'Simple monthly pricing', trustCheckout: 'Stripe-powered checkout',
      checkoutBadge: 'What happens next', checkoutTitle: 'Choose your plan, select your store category, and launch with clarity.', checkoutText: 'AfroMkt keeps the setup simple: plan selection, storefront category placement, secure checkout, then onboarding into your seller dashboard.', checkoutStepOne: 'Pick your plan', checkoutStepTwo: 'Choose your category', checkoutStepThree: 'Pay securely', checkoutStepFour: 'Start uploading',
      pricingEyebrow: 'Plans for launch', pricingTitle: 'Choose the seller plan that matches your growth stage.', pricingSubtitle: 'Choose the listing capacity that fits your business now. Buyer checkout and future promotional placements will come later.', promoBanner: '🎁 First 10 sellers: first month FREE on Basic or Premium. The offer is applied automatically while slots remain.', categoryLabel: 'What do you sell?', categoryHelp: 'This helps AfroMkt place your storefront in the right marketplace category from the start.', policyTitle: 'A transparent subscription flow from the start.', policyBody: 'Before subscribing, review our seller terms, privacy notice, and cancellation policy so you know exactly how billing and renewals work.', policyOneTitle: 'Terms', policyOneText: 'Read the platform terms', policyTwoTitle: 'Seller Agreement', policyTwoText: 'See seller obligations', policyThreeTitle: 'Cancellation', policyThreeText: 'Review refund policy', policyFourTitle: 'Support', policyFourText: 'Email AfroMkt support', termsAgree: 'I agree to the Terms and Seller Agreement, including monthly renewal and the cancellation and refund policy.',
      basicName: 'Basic Plan', premiumName: 'Premium Plan', perMonth: '/month', basicDescription: 'A simple starting point for sellers who want a polished presence without overcommitting.', premiumDescription: 'For sellers who want room to scale faster, publish more products, and unlock stronger visibility later.', basicF1: 'List up to 10 products', basicF2: 'Product preview listings', basicF3: 'Email support', basicF4: 'Join the community', premiumF1: 'Unlimited product listings', premiumF2: 'Featured visibility after buyer launch', premiumF3: 'Priority support', premiumF4: 'Analytics dashboard access after launch', featured: 'Featured', planButton: 'Get Started', promoNote: 'Free first month for the first 10 sellers across both plans.', renewalBasic: 'After the free month, Basic renews at €9.99/month unless you cancel.', renewalPremium: 'After the free month, Premium renews at €24.99/month unless you cancel.', redirecting: 'Redirecting...', checkoutError: 'Checkout could not start. Please try again.', checkoutCouldNot: 'Checkout could not start:', mustAcceptTerms: 'Please read and agree to the Terms and Seller Agreement before subscribing.',
      communityBadge: 'Built for African-owned growth', communityTitle: 'Turn your products into a community storefront.', communityText: 'AfroMkt helps African-owned shops, food vendors, beauty professionals, fashion sellers, and service providers get discovered by customers who already want to support the culture.', statOne: 'Portugal-first', statOneText: 'Built around the first launch market.', statTwo: 'Global-ready', statTwoText: 'Designed to grow beyond borders.', statThree: 'Community-led', statThreeText: 'Focused on trust, culture, and visibility.', statFour: 'Easy start', statFourText: 'Subscribe and begin onboarding.', footerTag: 'African community marketplace', footerBrand: 'The premier African Community Marketplace. Launching in Portugal, expanding globally to connect our vibrant culture.', footerMarketplace: 'Marketplace', footerShop: 'Shop Products', footerSeller: 'Become a Seller', footerCompany: 'Company', footerDashboard: 'Seller Dashboard', footerContact: 'Contact', footerLegal: 'Legal', footerTerms: 'Terms of Service', footerPrivacy: 'Privacy Policy', footerCookies: 'Cookie Policy', footerAgreement: 'Seller Agreement', footerBottom: '© 2026 AfroMkt (afro-mkt.com). All rights reserved.'
    },
    pt: {
      brandTag: 'Marketplace da diáspora', navHome: 'Início', navShop: 'Loja', navSell: 'Vender no AfroMkt', navSignIn: 'Entrar', navGetStarted: 'Começar', heroBadge: 'Subscrições de vendedor abertas', heroLineOne: 'Crie a sua', heroLineTwo: 'montra AfroMkt.', heroDescription: 'Alcance comunidades africanas em Portugal e além com planos pensados para dar credibilidade às suas listagens desde o primeiro dia.', trustLocal: 'Criado para negócios africanos locais', trustPricing: 'Preço mensal simples', trustCheckout: 'Checkout com Stripe', checkoutBadge: 'O que acontece depois', checkoutTitle: 'Escolha o plano, selecione a categoria e avance com clareza.', checkoutText: 'O AfroMkt mantém a configuração simples: plano, categoria da loja, pagamento seguro e depois onboarding no dashboard.', checkoutStepOne: 'Escolha o plano', checkoutStepTwo: 'Selecione a categoria', checkoutStepThree: 'Pague em segurança', checkoutStepFour: 'Comece a publicar', pricingEyebrow: 'Planos de lançamento', pricingTitle: 'Escolha o plano de vendedor que corresponde ao seu estágio de crescimento.', pricingSubtitle: 'Escolha a capacidade de listagens que faz sentido agora. O checkout do comprador e promoções futuras chegam depois.', promoBanner: '🎁 Primeiros 10 vendedores: primeiro mês GRÁTIS no Basic ou Premium. A oferta é aplicada automaticamente enquanto houver vagas.', categoryLabel: 'O que vende?', categoryHelp: 'Isto ajuda o AfroMkt a colocar a sua loja na categoria certa desde o início.', policyTitle: 'Um fluxo de subscrição transparente desde o início.', policyBody: 'Antes de subscrever, reveja os termos, a privacidade e a política de cancelamento para perceber a cobrança e a renovação.', policyOneTitle: 'Termos', policyOneText: 'Ler os termos da plataforma', policyTwoTitle: 'Acordo de vendedor', policyTwoText: 'Ver obrigações do vendedor', policyThreeTitle: 'Cancelamento', policyThreeText: 'Rever política de reembolso', policyFourTitle: 'Suporte', policyFourText: 'Enviar email ao suporte', termsAgree: 'Concordo com os Termos e com o Acordo de Vendedor, incluindo renovação mensal e a política de cancelamento e reembolso.', basicName: 'Plano Basic', premiumName: 'Plano Premium', perMonth: '/mês', basicDescription: 'Um ponto de partida simples para vendedores que querem presença polida sem exagerar no compromisso.', premiumDescription: 'Para vendedores que querem escalar mais depressa, publicar mais produtos e desbloquear mais visibilidade depois.', basicF1: 'Liste até 10 produtos', basicF2: 'Listagens na prévia de produtos', basicF3: 'Suporte por email', basicF4: 'Junte-se à comunidade', premiumF1: 'Listagens ilimitadas', premiumF2: 'Visibilidade em destaque após o lançamento para compradores', premiumF3: 'Suporte prioritário', premiumF4: 'Acesso ao dashboard analítico após o lançamento', featured: 'Destaque', planButton: 'Começar', promoNote: 'Primeiro mês grátis para os primeiros 10 vendedores, entre os dois planos.', renewalBasic: 'Após o mês grátis, o Basic renova por 9,99 €/mês, salvo cancelamento.', renewalPremium: 'Após o mês grátis, o Premium renova por 24,99 €/mês, salvo cancelamento.', redirecting: 'A redirecionar...', checkoutError: 'Não foi possível iniciar o checkout. Tente novamente.', checkoutCouldNot: 'Não foi possível iniciar o checkout:', mustAcceptTerms: 'Leia e aceite os Termos e o Acordo de Vendedor antes de subscrever.', communityBadge: 'Feito para crescimento africano', communityTitle: 'Transforme os seus produtos numa montra comunitária.', communityText: 'O AfroMkt ajuda lojas africanas, vendedores de comida, profissionais de beleza, moda e serviços a serem descobertos por clientes que querem apoiar a cultura.', statOne: 'Portugal primeiro', statOneText: 'Criado em torno do primeiro mercado.', statTwo: 'Pronto para global', statTwoText: 'Desenhado para crescer além fronteiras.', statThree: 'Liderado pela comunidade', statThreeText: 'Focado em confiança, cultura e visibilidade.', statFour: 'Início fácil', statFourText: 'Subscreva e comece o onboarding.', footerTag: 'Marketplace da comunidade africana', footerBrand: 'O principal marketplace da comunidade africana. A lançar em Portugal e a expandir globalmente para conectar a nossa cultura vibrante.', footerMarketplace: 'Marketplace', footerShop: 'Comprar produtos', footerSeller: 'Tornar-se vendedor', footerCompany: 'Empresa', footerDashboard: 'Dashboard do vendedor', footerContact: 'Contacto', footerLegal: 'Legal', footerTerms: 'Termos de serviço', footerPrivacy: 'Política de privacidade', footerCookies: 'Política de cookies', footerAgreement: 'Acordo de vendedor', footerBottom: '© 2026 AfroMkt (afro-mkt.com). Todos os direitos reservados.'
    },
    fr: {
      brandTag: 'Marketplace de la diaspora', navHome: 'Accueil', navShop: 'Boutique', navSell: 'Vendre sur AfroMkt', navSignIn: 'Connexion', navGetStarted: 'Commencer', heroBadge: 'Abonnements vendeurs ouverts', heroLineOne: 'Construisez votre', heroLineTwo: 'vitrine AfroMkt.', heroDescription: 'Touchez les communautés africaines au Portugal et au-delà avec des plans pensés pour donner de la crédibilité à vos listings dès le premier jour.', trustLocal: 'Pensé pour les entreprises africaines locales', trustPricing: 'Tarifs mensuels simples', trustCheckout: 'Paiement avec Stripe', checkoutBadge: 'La suite', checkoutTitle: 'Choisissez votre plan, votre catégorie et lancez-vous avec clarté.', checkoutText: 'AfroMkt garde la configuration simple : plan, catégorie, paiement sécurisé, puis onboarding dans le dashboard.', checkoutStepOne: 'Choisir le plan', checkoutStepTwo: 'Choisir la catégorie', checkoutStepThree: 'Payer en sécurité', checkoutStepFour: 'Commencer à publier', pricingEyebrow: 'Plans de lancement', pricingTitle: 'Choisissez le plan vendeur qui correspond à votre croissance.', pricingSubtitle: 'Choisissez la capacité de listings qui convient aujourd’hui. Le checkout acheteur viendra plus tard.', promoBanner: '🎁 10 premiers vendeurs : premier mois GRATUIT en Basic ou Premium. Offre appliquée automatiquement selon disponibilité.', categoryLabel: 'Que vendez-vous ?', categoryHelp: 'Cela aide AfroMkt à placer votre boutique dans la bonne catégorie dès le début.', policyTitle: 'Un abonnement transparent dès le départ.', policyBody: 'Avant de souscrire, consultez les termes, la confidentialité et la politique d’annulation pour comprendre la facturation.', policyOneTitle: 'Conditions', policyOneText: 'Lire les conditions de la plateforme', policyTwoTitle: 'Accord vendeur', policyTwoText: 'Voir les obligations vendeur', policyThreeTitle: 'Annulation', policyThreeText: 'Consulter la politique de remboursement', policyFourTitle: 'Support', policyFourText: 'Envoyer un email au support', termsAgree: 'J’accepte les Conditions et l’Accord vendeur, y compris le renouvellement mensuel et la politique d’annulation et de remboursement.', basicName: 'Plan Basic', premiumName: 'Plan Premium', perMonth: '/mois', basicDescription: 'Un point de départ simple pour les vendeurs qui veulent une présence soignée sans trop s’engager.', premiumDescription: 'Pour les vendeurs qui veulent grandir plus vite, publier plus de produits et débloquer davantage de visibilité ensuite.', basicF1: 'Jusqu’à 10 produits', basicF2: 'Listings dans l’aperçu', basicF3: 'Support email', basicF4: 'Rejoindre la communauté', premiumF1: 'Listings illimités', premiumF2: 'Visibilité mise en avant après le lancement acheteur', premiumF3: 'Support prioritaire', premiumF4: 'Accès au tableau analytique après le lancement', featured: 'Mis en avant', planButton: 'Commencer', promoNote: 'Premier mois gratuit pour les 10 premiers vendeurs, tous plans confondus.', renewalBasic: 'Après le mois gratuit, Basic est renouvelé à 9,99 €/mois sauf annulation.', renewalPremium: 'Après le mois gratuit, Premium est renouvelé à 24,99 €/mois sauf annulation.', redirecting: 'Redirection...', checkoutError: 'Impossible de démarrer le paiement. Réessayez.', checkoutCouldNot: 'Impossible de démarrer le paiement :', mustAcceptTerms: 'Veuillez lire et accepter les Conditions et l’Accord vendeur avant de souscrire.', communityBadge: 'Pensé pour la croissance africaine', communityTitle: 'Transformez vos produits en vitrine communautaire.', communityText: 'AfroMkt aide les commerces africains, vendeurs de nourriture, professionnels beauté, mode et services à être découverts par des clients qui veulent soutenir la culture.', statOne: 'Portugal d’abord', statOneText: 'Construit autour du premier marché.', statTwo: 'Prêt pour le monde', statTwoText: 'Conçu pour grandir au-delà des frontières.', statThree: 'Communautaire', statThreeText: 'Axé sur confiance, culture et visibilité.', statFour: 'Démarrage facile', statFourText: 'Abonnez-vous et commencez l’onboarding.', footerTag: 'Marketplace de la communauté africaine', footerBrand: 'La marketplace africaine de référence. Lancement au Portugal et expansion mondiale pour connecter notre culture vibrante.', footerMarketplace: 'Marketplace', footerShop: 'Acheter des produits', footerSeller: 'Devenir vendeur', footerCompany: 'Entreprise', footerDashboard: 'Tableau vendeur', footerContact: 'Contact', footerLegal: 'Juridique', footerTerms: 'Conditions de service', footerPrivacy: 'Confidentialité', footerCookies: 'Cookies', footerAgreement: 'Accord vendeur', footerBottom: '© 2026 AfroMkt (afro-mkt.com). Tous droits réservés.'
    },
    es: {
      brandTag: 'Marketplace de la diáspora', navHome: 'Inicio', navShop: 'Tienda', navSell: 'Vender en AfroMkt', navSignIn: 'Iniciar sesión', navGetStarted: 'Empezar', heroBadge: 'Suscripciones de vendedor abiertas', heroLineOne: 'Construye tu', heroLineTwo: 'escaparate AfroMkt.', heroDescription: 'Llega a comunidades africanas en Portugal y más allá con planes pensados para que tus listados se vean creíbles desde el primer día.', trustLocal: 'Creado para negocios africanos locales', trustPricing: 'Precios mensuales simples', trustCheckout: 'Checkout con Stripe', checkoutBadge: 'Qué pasa después', checkoutTitle: 'Elige tu plan, tu categoría y lánzate con claridad.', checkoutText: 'AfroMkt mantiene la configuración simple: plan, categoría, pago seguro y luego onboarding en el dashboard.', checkoutStepOne: 'Elegir plan', checkoutStepTwo: 'Elegir categoría', checkoutStepThree: 'Pagar seguro', checkoutStepFour: 'Empezar a publicar', pricingEyebrow: 'Planes de lanzamiento', pricingTitle: 'Elige el plan de vendedor que encaja con tu crecimiento.', pricingSubtitle: 'Elige la capacidad de listados que te conviene hoy. El checkout del comprador llegará más adelante.', promoBanner: '🎁 Primeros 10 vendedores: primer mes GRATIS en Basic o Premium. Oferta automática mientras queden plazas.', categoryLabel: '¿Qué vendes?', categoryHelp: 'Esto ayuda a AfroMkt a colocar tu tienda en la categoría correcta desde el inicio.', policyTitle: 'Un flujo de suscripción transparente desde el principio.', policyBody: 'Antes de suscribirte, revisa los términos, la privacidad y la política de cancelación para entender el cobro.', policyOneTitle: 'Términos', policyOneText: 'Leer términos de la plataforma', policyTwoTitle: 'Acuerdo de vendedor', policyTwoText: 'Ver obligaciones del vendedor', policyThreeTitle: 'Cancelación', policyThreeText: 'Revisar política de reembolso', policyFourTitle: 'Soporte', policyFourText: 'Enviar email al soporte', termsAgree: 'Acepto los Términos y el Acuerdo de Vendedor, incluida la renovación mensual y la política de cancelación y reembolso.', basicName: 'Plan Basic', premiumName: 'Plan Premium', perMonth: '/mes', basicDescription: 'Un punto de partida simple para vendedores que quieren presencia pulida sin comprometerse demasiado.', premiumDescription: 'Para vendedores que quieren escalar más rápido, publicar más productos y desbloquear más visibilidad después.', basicF1: 'Publica hasta 10 productos', basicF2: 'Listados en la vista previa', basicF3: 'Soporte por email', basicF4: 'Únete a la comunidad', premiumF1: 'Listados ilimitados', premiumF2: 'Visibilidad destacada tras el lanzamiento para compradores', premiumF3: 'Soporte prioritario', premiumF4: 'Acceso al panel analítico después del lanzamiento', featured: 'Destacado', planButton: 'Empezar', promoNote: 'Primer mes gratis para los primeros 10 vendedores entre ambos planes.', renewalBasic: 'Tras el mes gratis, Basic se renueva por 9,99 €/mes salvo cancelación.', renewalPremium: 'Tras el mes gratis, Premium se renueva por 24,99 €/mes salvo cancelación.', redirecting: 'Redirigiendo...', checkoutError: 'No se pudo iniciar el checkout. Inténtalo de nuevo.', checkoutCouldNot: 'No se pudo iniciar el checkout:', mustAcceptTerms: 'Lee y acepta los Términos y el Acuerdo de Vendedor antes de suscribirte.', communityBadge: 'Pensado para el crecimiento africano', communityTitle: 'Convierte tus productos en un escaparate comunitario.', communityText: 'AfroMkt ayuda a tiendas africanas, vendedores de comida, profesionales de belleza, moda y servicios a ser descubiertos por clientes que quieren apoyar la cultura.', statOne: 'Portugal primero', statOneText: 'Creado alrededor del primer mercado.', statTwo: 'Listo para el mundo', statTwoText: 'Diseñado para crecer más allá de fronteras.', statThree: 'Comunitario', statThreeText: 'Centrado en confianza, cultura y visibilidad.', statFour: 'Inicio fácil', statFourText: 'Suscríbete y empieza el onboarding.', footerTag: 'Marketplace de la comunidad africana', footerBrand: 'El marketplace líder de la comunidad africana. Lanzando en Portugal y expandiéndose globalmente para conectar nuestra cultura vibrante.', footerMarketplace: 'Marketplace', footerShop: 'Comprar productos', footerSeller: 'Ser vendedor', footerCompany: 'Empresa', footerDashboard: 'Dashboard del vendedor', footerContact: 'Contacto', footerLegal: 'Legal', footerTerms: 'Términos de servicio', footerPrivacy: 'Política de privacidad', footerCookies: 'Política de cookies', footerAgreement: 'Acuerdo de vendedor', footerBottom: '© 2026 AfroMkt (afro-mkt.com). Todos los derechos reservados.'
    }
  };

  let activeLanguage = 'en';

  function getInitialLanguage() {
    const stored = localStorage.getItem('afromkt-language');
    if (translations[stored]) return stored;
    const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return translations[browser] ? browser : 'en';
  }

  function applyLanguage(lang) {
    activeLanguage = translations[lang] ? lang : 'en';
    const dictionary = translations[activeLanguage];
    document.documentElement.lang = activeLanguage;
    localStorage.setItem('afromkt-language', activeLanguage);
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const key = element.dataset.i18n;
      if (dictionary[key]) element.textContent = dictionary[key];
    });
    const button = document.getElementById('languageBtn');
    if (button) button.textContent = languageMeta[activeLanguage];
    document.querySelectorAll('.language-option').forEach((option) => option.classList.toggle('active', option.dataset.lang === activeLanguage));
  }

  function clearCheckoutMessages() {
    document.querySelectorAll('.checkout-message').forEach((message) => {
      message.textContent = '';
      message.className = 'checkout-message';
    });
  }

  function showCheckoutMessage(button, text, type = 'error') {
    const message = button.parentElement.querySelector('.checkout-message');
    if (!message) return;
    message.textContent = text;
    message.className = 'checkout-message';
    if (type === 'error') message.style.color = '#b45309';
    if (type === 'info') message.style.color = '#1d2c22';
  }

  async function startCheckout(plan, button) {
    const t = translations[activeLanguage];
    const termsCheckbox = document.getElementById('checkoutTermsAccepted');
    clearCheckoutMessages();

    if (!termsCheckbox.checked) {
      showCheckoutMessage(button, t.mustAcceptTerms, 'error');
      termsCheckbox.focus();
      return;
    }

    const storeCategory = document.getElementById('storeCategory').value || 'General Store';
    localStorage.setItem('afromkt-store-category', storeCategory);

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = t.redirecting;

    try {
      const response = await fetch(checkoutEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, store_category: storeCategory })
      });
      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      showCheckoutMessage(button, `${t.checkoutCouldNot} ${data.error || 'Unknown error'}`);
    } catch (error) {
      console.error('Checkout session creation failed:', error);
      showCheckoutMessage(button, t.checkoutError);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  const storeCategory = document.getElementById('storeCategory');
  const storedStoreCategory = localStorage.getItem('afromkt-store-category');
  if (storedStoreCategory && storeCategory) storeCategory.value = storedStoreCategory;
  if (storeCategory) {
    storeCategory.addEventListener('change', () => {
      localStorage.setItem('afromkt-store-category', storeCategory.value || 'General Store');
    });
  }

  document.querySelectorAll('.checkout-btn').forEach((button) => {
    button.addEventListener('click', () => startCheckout(button.dataset.plan, button));
  });

  document.querySelectorAll('.language-option').forEach((option) => {
    option.addEventListener('click', () => applyLanguage(option.dataset.lang));
  });

  window.AfroMktPreview.initPage({
    navigation: { navSelector: '.site-nav', navButtonId: 'mobileBtn' },
    language: { selectorId: 'languageSelector', buttonId: 'languageBtn' }
  });

  applyLanguage(getInitialLanguage());
})();
