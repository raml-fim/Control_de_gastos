/* ============================================================================
 * js/core/security.js — acceso con PIN y bloqueo automático
 * ---------------------------------------------------------------------------
 * RF-19: PIN numérico de 4 a 6 dígitos para abrir la aplicación.
 * RF-20: bloqueo automático tras un tiempo de inactividad configurable.
 * RNF-06: el PIN nunca se guarda en texto plano; se almacena su hash SHA-256.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;

  var CLAVE_SESION = 'cgai.sesion';
  var desbloqueado = false;
  var temporizador = null;
  var ultimaActividad = Date.now();

  function ajustes() { return App.state.ajustes(); }

  function activo() { return !!ajustes().pinActivo; }

  function desbloqueada() { return !activo() || desbloqueado; }

  /** Activa el PIN: guarda únicamente el hash del código elegido. */
  function activar(pin) {
    if (!validarFormato(pin)) {
      return Promise.reject(new Error('El PIN debe tener entre 4 y 6 dígitos.'));
    }
    return U.sha256('cgai:' + pin).then(function (hash) {
      ajustes().pinActivo = true;
      ajustes().pinHash = hash;
      desbloqueado = true;
      App.state.guardar('pin-activado');
      return true;
    });
  }

  function cambiar(pinActual, pinNuevo) {
    return verificar(pinActual).then(function (ok) {
      if (!ok) { throw new Error('El PIN actual no coincide.'); }
      return activar(pinNuevo);
    });
  }

  function desactivar(pinActual) {
    return verificar(pinActual).then(function (ok) {
      if (!ok) { throw new Error('El PIN actual no coincide.'); }
      ajustes().pinActivo = false;
      ajustes().pinHash = null;
      desbloqueado = true;
      App.state.guardar('pin-desactivado');
      return true;
    });
  }

  /** Comprueba un PIN contra el hash guardado. */
  function verificar(pin) {
    if (!activo()) { return Promise.resolve(true); }
    return U.sha256('cgai:' + String(pin)).then(function (hash) {
      return hash === ajustes().pinHash;
    });
  }

  function validarFormato(pin) {
    return /^\d{4,6}$/.test(String(pin || ''));
  }

  /** Intenta desbloquear; devuelve cuántos intentos han fallado. */
  var intentosFallidos = 0;
  function desbloquear(pin) {
    return verificar(pin).then(function (ok) {
      if (ok) {
        intentosFallidos = 0;
        desbloqueado = true;
        guardarSesion();
        reiniciarTemporizador();
        return { ok: true, intentos: 0 };
      }
      intentosFallidos++;
      return { ok: false, intentos: intentosFallidos };
    });
  }

  function bloquear() {
    if (!activo()) { return; }
    desbloqueado = false;
    guardarSesion();
    App.util.emitir('app:bloqueada');
  }

  /* ------------------------------------------------------- temporizador */
  function marcarActividad() {
    ultimaActividad = Date.now();
    guardarSesion();
    reiniciarTemporizador();
  }

  function reiniciarTemporizador() {
    if (temporizador) { clearTimeout(temporizador); temporizador = null; }
    var minutos = Number(ajustes().bloqueoInactividad) || 0;
    if (!activo() || !minutos) { return; }
    temporizador = setTimeout(function () {
      var inactivo = (Date.now() - ultimaActividad) / 60000;
      if (inactivo >= minutos) { bloquear(); }
      else { reiniciarTemporizador(); }
    }, minutos * 60000);
  }

  function iniciarVigilancia() {
    ['click', 'keydown', 'mousemove', 'touchstart', 'scroll'].forEach(function (ev) {
      document.addEventListener(ev, U.debounce(marcarActividad, 800), { passive: true });
    });
    reiniciarTemporizador();
  }

  /* --------------------------------------------------- persistir sesión */
  /**
   * La sesión se guarda para no pedir el PIN en cada recarga.
   * El bloqueo por inactividad se recalcula al abrir la aplicación.
   */
  function guardarSesion() {
    App.storage.escribir(CLAVE_SESION, {
      desbloqueado: desbloqueado,
      ultimaActividad: ultimaActividad,
      guardado: Date.now()
    });
  }

  function restaurarSesion() {
    var s = App.storage.leer(CLAVE_SESION);
    if (!s || !activo()) { desbloqueado = !activo(); return desbloqueado; }
    var minutos = Number(ajustes().bloqueoInactividad) || 0;
    var transcurrido = (Date.now() - (s.ultimaActividad || 0)) / 60000;
    var vigente = minutos > 0 ? transcurrido < minutos : true;
    desbloqueado = !!s.desbloqueado && vigente;
    if (s.ultimaActividad) { ultimaActividad = s.ultimaActividad; }
    return desbloqueado;
  }

  App.security = {
    activo: activo,
    desbloqueada: desbloqueada,
    activar: activar,
    cambiar: cambiar,
    desactivar: desactivar,
    verificar: verificar,
    desbloquear: desbloquear,
    bloquear: bloquear,
    validarFormato: validarFormato,
    iniciarVigilancia: iniciarVigilancia,
    marcarActividad: marcarActividad,
    restaurarSesion: restaurarSesion,
    intentosFallidos: function () { return intentosFallidos; }
  };
})(window);
