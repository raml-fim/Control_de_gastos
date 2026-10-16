/* ============================================================================
 * js/core/storage.js — capa de persistencia local
 * ---------------------------------------------------------------------------
 * Guarda todo el estado de la aplicación en localStorage. Si el navegador
 * bloquea el almacenamiento (por ejemplo al abrir el archivo directamente),
 * cae automáticamente a un almacén en memoria para que la app siga funcionando.
 * Cumple RF-17 (modo sin conexión) y RNF-05 (resguardo de los datos).
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var CLAVE = 'cgai.datos.v1';
  var memoria = {};
  var disponible = null;

  /** Comprueba una sola vez si localStorage es utilizable. */
  function hayLocalStorage() {
    if (disponible !== null) { return disponible; }
    try {
      var k = '__cgai_test__';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      disponible = true;
    } catch (e) {
      disponible = false;
      if (global.console) {
        console.warn('[storage] localStorage no disponible; se usa memoria temporal.', e);
      }
    }
    return disponible;
  }

  function leer(clave) {
    if (hayLocalStorage()) {
      try {
        var raw = global.localStorage.getItem(clave);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        console.warn('[storage] No se pudo leer', clave, e);
        return null;
      }
    }
    return memoria[clave] ? JSON.parse(memoria[clave]) : null;
  }

  function escribir(clave, valor) {
    var raw = JSON.stringify(valor);
    if (hayLocalStorage()) {
      try {
        global.localStorage.setItem(clave, raw);
        return true;
      } catch (e) {
        // Cuota excedida: se informa y se conserva en memoria.
        console.error('[storage] No se pudo guardar (cuota).', e);
        memoria[clave] = raw;
        return false;
      }
    }
    memoria[clave] = raw;
    return true;
  }

  function borrar(clave) {
    if (hayLocalStorage()) { global.localStorage.removeItem(clave); }
    delete memoria[clave];
  }

  function claves() {
    if (!hayLocalStorage()) { return Object.keys(memoria); }
    return Object.keys(global.localStorage);
  }

  /** Estima el espacio ocupado por los datos de la app, en kilobytes. */
  function usoKB() {
    var raw = hayLocalStorage() ? (global.localStorage.getItem(CLAVE) || '') : (memoria[CLAVE] || '');
    return Math.round((raw.length * 2) / 1024 * 10) / 10;   // UTF-16
  }

  /** Detecta cambios hechos en otra pestaña para mantener los datos sincronizados. */
  function alCambiarOtraPestana(callback) {
    if (!hayLocalStorage()) { return; }
    global.addEventListener('storage', function (e) {
      if (e.key === CLAVE && e.newValue) {
        callback(JSON.parse(e.newValue));
      }
    });
  }

  App.storage = {
    CLAVE: CLAVE,
    leer: leer, escribir: escribir, borrar: borrar, claves: claves,
    usoKB: usoKB, alCambiarOtraPestana: alCambiarOtraPestana,
    hayLocalStorage: hayLocalStorage
  };
})(window);
