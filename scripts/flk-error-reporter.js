/* v62.22 ESTABILIDAD: manejador global de errores.
   Antes, un error no capturado o una promesa rechazada sin .catch()
   simplemente desaparecían en la consola del navegador, que el dueño
   del negocio nunca ve. Esto guarda los últimos errores en localStorage
   (nunca datos de negocio, solo mensaje/archivo/línea/fecha) para poder
   diagnosticar problemas reportados por usuarios reales.
   Consulta desde la consola del navegador:
     flkVerErroresApp()      -> muestra los últimos errores en tabla
     flkLimpiarErroresApp()  -> borra el registro guardado */
(function(){
 var KEY="flackunloker_errores_app_v1";
 const MAX_LOCALSTORAGE_ENTRADAS = 1000;

 function guardar(entrada){
  try{
   var lista=[];
   try{
    var raw=localStorage.getItem(KEY);
    if(raw)lista=JSON.parse(raw)||[];
    if(!Array.isArray(lista))lista=[];
   }catch(_){lista=[];}
   lista.push(entrada);
   if(lista.length>MAX_LOCALSTORAGE_ENTRADAS)lista=lista.slice(-MAX_LOCALSTORAGE_ENTRADAS);
   var guardarFn=(typeof flkLocalStorageSetSeguro==="function")?flkLocalStorageSetSeguro:function(k,v){localStorage.setItem(k,v);};
   guardarFn(KEY,JSON.stringify(lista));
  }catch(_){ /* si ni siquiera esto se puede guardar, no hay nada más que hacer aquí */ }
 }

 window.onerror=function(mensaje,fuente,linea,columna,error){
  try{
   guardar({
    tipo:"error",
    mensaje:String(mensaje||""),
    fuente:String(fuente||""),
    linea:linea||null,
    columna:columna||null,
    stack:error&&error.stack?String(error.stack).slice(0,2000):null,
    fecha:new Date().toISOString(),
    url:location.href
   });
  }catch(_){}
  return false; // no suprime el log normal de la consola del navegador
 };

 window.addEventListener("unhandledrejection",function(event){
  try{
   var razon=event&&event.reason;
   guardar({
    tipo:"promesa_rechazada",
    mensaje:String(razon&&razon.message?razon.message:razon||""),
    stack:razon&&razon.stack?String(razon.stack).slice(0,2000):null,
    fecha:new Date().toISOString(),
    url:location.href
   });
  }catch(_){}
 });

 window.flkVerErroresApp=function(){
  var lista=[];
  try{lista=JSON.parse(localStorage.getItem(KEY)||"[]");}catch(_){lista=[];}
  if(!Array.isArray(lista)||!lista.length){console.log("Flackunloker: no hay errores guardados.");return [];}
  console.table(lista);
  return lista;
 };

 window.flkLimpiarErroresApp=function(){
  try{localStorage.removeItem(KEY);console.log("Flackunloker: registro de errores borrado.");}catch(_){}
 };
})();

// NUEVO: Limpieza opcional de datos no esenciales
// Ejemplo: borra el registro de errores (si el usuario lo desea) u otras claves temporales
window.flkLimpiarDatosNoEsenciales = function() {
  try {
    // Opción 1: Borrar solo el registro de errores (el usuario confirma)
    if (confirm("¿Borrar el registro de errores guardados en localStorage?")) {
      localStorage.removeItem("flackunloker_errores_app_v1");
      console.log("✅ Registro de errores borrado");
    }
    // Opción 2 (descomentar si se quiere borrar todo lo "tmp" automáticamente:
    // const keys = [];
    // for (let i = 0; i < localStorage.length; i++) {
    //   const k = localStorage.key(i);
    //   if (k && k.startsWith("__flk_tmp__")) keys.push(k);
    // }
    // keys.forEach(k => localStorage.removeItem(k));
    // console.log("🗑️ Datos temporales borrados:", keys.length);
    return true;
  } catch (e) {
    console.error("❌ Error borrando datos no esenciales:", e);
    return false;
  }
};