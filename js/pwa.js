/* =============================================================
   La Tili · Instalable (PWA)
   Muestra el botón "Descargar app" y registra el service worker.
   ============================================================= */

(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  const el = {
    card: $('#installCard'),
    cardBtn: $('#installCardBtn'),
    cardHint: $('#installCardHint'),
    cardClose: $('#installCardClose'),
    navBtn: $('#installNavBtn'),
    update: $('#pwaUpdate'),
    updateBtn: $('#pwaUpdateBtn')
  };

  const DISMISS_KEY = 'latili_instalacion_descartada';

  let deferredPrompt = null;

  // ¿Ya está instalada como app?
  const isInstalled = () => (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );

  const dismissed = () => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch (e) { return false; }
  };

  const setDismissed = () => {
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch (e) { /* modo privado */ }
  };

  // iOS no dispara beforeinstallprompt: hay que ir al menú Compartir
  const isIOS = () => (
    /iPad|iPhone|iPod/.test(window.navigator.userAgent) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  );

  const show = (node) => { if (node) node.classList.remove('d-none'); };
  const hide = (node) => { if (node) node.classList.add('d-none'); };

  // -------------------------------------------------------------
  // Acciones
  // -------------------------------------------------------------
  function install() {
    if (!deferredPrompt) return;
    hide(el.card);
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choice) => {
      if (choice.outcome === 'accepted') setDismissed();
      deferredPrompt = null;
    });
  }

  function mostrarCard() {
    if (!el.card || isInstalled() || dismissed()) return;

    if (isIOS()) {
      if (el.cardHint) {
        el.cardHint.innerHTML =
          'Tocá <strong>Compartir</strong> y después <strong>Agregar a pantalla de inicio</strong>.';
      }
      if (el.cardBtn) el.cardBtn.classList.add('d-none');
    } else {
      show(el.navBtn);
    }

    el.card.classList.remove('d-none');
  }

  function ocultarTodo() {
    hide(el.card);
    hide(el.navBtn);
  }

  // -------------------------------------------------------------
  // Eventos
  // -------------------------------------------------------------
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!dismissed()) mostrarCard();
  });

  window.addEventListener('appinstalled', () => {
    setDismissed();
    ocultarTodo();
  });

  if (el.cardBtn) el.cardBtn.addEventListener('click', install);
  if (el.navBtn) el.navBtn.addEventListener('click', install);

  if (el.cardClose) {
    el.cardClose.addEventListener('click', () => {
      setDismissed();
      ocultarTodo();
    });
  }

  // -------------------------------------------------------------
  // Service worker
  // -------------------------------------------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then((reg) => {
          // Hay una versión nueva esperando: avisamos sin cortar la sesión
          reg.addEventListener('updatefound', () => {
            const sw = reg.installing;
            if (!sw) return;
            sw.addEventListener('statechange', () => {
              if (sw.state === 'installed' && navigator.serviceWorker.controller) {
                show(el.update);
              }
            });
          });
        })
        .catch((err) => console.warn('[pwa] service worker no registrado:', err));
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  }

  if (el.updateBtn) {
    el.updateBtn.addEventListener('click', () => {
      const waiting = navigator.serviceWorker && navigator.serviceWorker.ready;
      if (!waiting) return;
      waiting.then((reg) => {
        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      });
    });
  }

  // Si ya está instalada, no mostramos nada
  if (isInstalled()) ocultarTodo();
})();