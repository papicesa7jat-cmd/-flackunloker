const { app, BrowserWindow } = require('electron');
const path = require('path');

// v62.43.3 SEGURIDAD (corrige "tormenta" de refrescos de sesión / cierres
// de sesión intermitentes): esta app no tenía bloqueo de instancia única.
// Cada doble clic extra en el icono (por ejemplo durante el bug de
// pantalla congelada, ya corregido, cuando parecía que no abría) dejaba
// una instancia de Electron más corriendo en segundo plano, todas
// autenticadas con la MISMA cuenta. Cada una refresca su sesión de
// Supabase por su cuenta; al rotar el refresh token, invalida el de las
// demás instancias, que a su vez intentan refrescar de inmediato → una
// cadena de refrescos varias veces por segundo (confirmado en los logs de
// Supabase) que termina en "sesión no disponible" / expulsión del login
// en la instancia visible. requestSingleInstanceLock() evita que exista
// más de una instancia: si ya hay una abierta, la nueva simplemente
// enfoca la existente en vez de arrancar otra.
const soloUnaInstancia = app.requestSingleInstanceLock();

if (!soloUnaInstancia) {
  app.quit();
} else {
  function crearVentana() {
    const ventana = new BrowserWindow({
      width: 1280,
      height: 800,
      minWidth: 900,
      minHeight: 650,
      autoHideMenuBar: true,
      icon: path.join(__dirname, 'icon.ico'),
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false
      }
    });

    ventana.loadFile(path.join(__dirname, 'index.html'));
  }

  app.on('second-instance', () => {
    const ventanas = BrowserWindow.getAllWindows();
    if (ventanas.length) {
      const v = ventanas[0];
      if (v.isMinimized()) v.restore();
      v.focus();
    }
  });

  app.whenReady().then(() => {
    crearVentana();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        crearVentana();
      }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}
