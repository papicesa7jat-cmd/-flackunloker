/* Adaptador para navegador/Capacitor; Electron conserva su motor nativo. */
(() => {
  if (window.flkRecorte) return;
  const workerUrl = new URL('recorte-web/worker.js', document.currentScript.src);
  let worker = null, pending = null, sequence = 0;
  const cancel = () => {
    if (worker) worker.terminate();
    worker = null;
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error('Recorte cancelado.')); pending = null; }
  };
  window.flkRecorte = {
    cancelar: cancel,
    recortar(bytes) {
      if (pending) return Promise.reject(new Error('Espera a que termine la foto actual.'));
      if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > 12*1024*1024) return Promise.reject(new Error('La foto debe pesar menos de 12 MB.'));
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => {
          const task = pending; pending = null;
          if (worker) worker.terminate(); worker = null;
          if (task) task.reject(new Error('El recorte tardó demasiado. Prueba una foto más pequeña.'));
        }, 120000);
        pending = {id, resolve, reject, timer};
        try {
          worker = new Worker(workerUrl);
          worker.onmessage = ({data}) => {
            if (!pending || pending.id !== data.id) return;
            const task = pending; pending = null; clearTimeout(task.timer);
            worker.terminate(); worker = null;
            if (data.error) task.reject(new Error(data.error)); else task.resolve(data.result);
          };
          worker.onerror = () => {
            const task = pending; pending = null;
            if (worker) worker.terminate(); worker = null;
            if (task) { clearTimeout(task.timer); task.reject(new Error('No se pudo iniciar el recorte. Conéctate a Internet para cargarlo por primera vez y vuelve a intentarlo.')); }
          };
          worker.postMessage({id, bytes}, [bytes.buffer]);
        } catch (_) { const task=pending;pending=null;clearTimeout(timer);if(worker)worker.terminate();worker=null;task.reject(new Error('Este navegador no admite el recorte. Actualiza Chrome o Android System WebView.')); }
      });
    }
  };
})();
