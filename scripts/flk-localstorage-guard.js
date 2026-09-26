/* OFFLINE-3 · Guardia síncrona de capacidad de localStorage.
   Todas las escrituras de Flackunloker pasan por aquí antes de grabarse. */
(function(){
 const nativeSet=Storage.prototype.setItem;
 const nativeRemove=Storage.prototype.removeItem;
 let avisoMostrado=false;

 function esQuotaError(err){
  return !!err && (
   err.name==="QuotaExceededError" ||
   err.name==="NS_ERROR_DOM_QUOTA_REACHED" ||
   err.code===22 || err.code===1014
  );
 }

 window.flkUsoLocalStorageAprox=function(){
  let chars=0;
  try{
   for(let i=0;i<localStorage.length;i++){
    const k=localStorage.key(i)||"";
    const v=localStorage.getItem(k)||"";
    chars+=k.length+v.length;
   }
  }catch(_){}
  return chars*2;
 };

 window.flkComprobarEspacioLocalStorage=function(clave,valor){
  const k=String(clave);
  const v=String(valor);
  let anterior=null;
  try{anterior=localStorage.getItem(k)}catch(_){anterior=null}

  const charsAnteriores=(anterior===null?0:k.length+String(anterior).length);
  const charsNuevos=k.length+v.length;
  const crecimiento=Math.max(0,charsNuevos-charsAnteriores);

  // Si no crece, la sustitución no necesita reservar espacio adicional.
  if(crecimiento===0)return true;

  // Límite defensivo: nunca borrar datos existentes automáticamente.
  const MAX_ENTRADAS = 1000;
  if (anterior === null && localStorage.length >= MAX_ENTRADAS) {
    const err = new Error(`localStorage alcanzó el límite de ${MAX_ENTRADAS} entradas. Libera espacio antes de crear otra clave.`);
    err.name = "FlkStorageEntriesLimitError";
    throw err;
  }

  const probe="__flk_storage_probe__";
  try{
   // Reserva temporal del crecimiento + pequeño margen para metadatos del navegador.
   nativeSet.call(localStorage,probe,"0".repeat(crecimiento+512));
   nativeRemove.call(localStorage,probe);
   return true;
  }catch(err){
   try{nativeRemove.call(localStorage,probe)}catch(_){}
   if(esQuotaError(err))return false;
   throw err;
  }
 };

 window.flkLocalStorageSetSeguro=function(clave,valor){
  const k=String(clave);
  const v=String(valor);

  // NUEVO: Evitar guardar si el valor es idéntico al existente (prevenir crecimiento basura)
  try {
    const existente = localStorage.getItem(k);
    if (existente === v) return true; // Sin cambios, salir temprano
  } catch (_) {}

  if(!window.flkComprobarEspacioLocalStorage(k,v)){
   const err=new Error("Espacio local insuficiente. La operación NO fue guardada.");
   err.name="FlkStorageQuotaError";
   err.flkStorageFull=true;
   console.error("Flackunloker localStorage:",err.message,"Clave:",k,
     "Uso aprox.:",Math.round(window.flkUsoLocalStorageAprox()/1024),"KB");

   if(!avisoMostrado){
    avisoMostrado=true;
    setTimeout(()=>{
     alert("⚠️ Almacenamiento local casi lleno.\n\nFlackunloker detuvo la escritura para evitar pérdida de datos. Sincroniza las operaciones pendientes o libera espacio del navegador antes de continuar.");
     setTimeout(()=>{avisoMostrado=false},5000);
    },0);
   }
   throw err;
  }

  try{
   nativeSet.call(localStorage,k,v);
   return true;
  }catch(err){
   if(esQuotaError(err)){
    const e=new Error("Espacio local insuficiente. La operación NO fue guardada.");
    e.name="FlkStorageQuotaError";
    e.flkStorageFull=true;
    throw e;
   }
   throw err;
  }
 };
})();

// NUEVO: Reporte de uso actual de localStorage
window.flkObtenerUsoLocalStorage = function() {
  try {
    let tamaño = 0;
    let entradas = 0;
    let keysCriticas = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      const v = localStorage.getItem(k) || "";
      tamaño += k.length + v.length;
      entradas++;
      // Considerar "críticas" las claves relacionadas con el sistema
      const kLower = k.toLowerCase();
      if (kLower.includes("flk") || kLower.includes("error") || kLower.includes("cache")) {
        keysCriticas++;
      }
    }
    const porcentajeCota = Math.round((tamaño / (5 * 1024 * 1024)) * 100); // vs límite 5MB estimado
    return {
      entradas: entradas,
      tamaño_bytes: tamaño,
      tamaño_kb: Math.round(tamaño / 1024),
      tamaño_mb: Math.round(tamaño / (1024 * 1024), 2),
      porcentaje_cota_estimado: porcentajeCota,
      keys_criticas: keysCriticas
    };
  } catch (e) {
    return { error: e.message };
  }
};