document.addEventListener('DOMContentLoaded', async () => {
  const estadoEl = document.getElementById('estado-sw');

  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
      if (estadoEl) {
        estadoEl.textContent = 'Service Worker registado e ativo.';
      }
    } catch (erro) {
      if (estadoEl) {
        estadoEl.textContent = `Erro ao registar Service Worker: ${erro.message}`;
      }
    }
  }
});