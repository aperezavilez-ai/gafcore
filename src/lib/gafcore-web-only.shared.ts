/**
 * GafCore solo web: sin PWA instalable ni «Abrir en la app» en Chrome.
 * Script síncrono en <head> (antes de React) + GafcoreWebOnly en cliente.
 */
export const GAFCORE_WEB_ONLY_HEAD_SCRIPT = `(function(){try{var m=document.querySelectorAll('link[rel="manifest"]');for(var i=0;i<m.length;i++)m[i].remove();}catch(e){}if(!("serviceWorker"in navigator))return;navigator.serviceWorker.getRegistrations().then(function(r){r.forEach(function(x){x.unregister();});}).catch(function(){});if("caches"in window){caches.keys().then(function(k){k.forEach(function(n){caches.delete(n);});}).catch(function(){});}})();`;
