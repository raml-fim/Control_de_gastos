/* ============================================================================
 * js/core/notify.js — avisos dentro de la app y notificaciones del sistema
 * ---------------------------------------------------------------------------
 * RF-18 (avisos internos), RF-23 (recordatorio diario) y RF-24 (notificaciones
 * de alertas). Las notificaciones del navegador son opcionales: si el usuario
 * no las autoriza, todo sigue funcionando con los avisos internos.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;

  var contenedor = null;

  function asegurarContenedor() {
    if (contenedor && document.body.contains(contenedor)) { return contenedor; }
    contenedor = U.$('#avisos') || U.crear('div', { id: 'avisos', class: 'avisos', 'aria-live': 'polite' });
    if (!contenedor.parentNode) { document.body.appendChild(contenedor); }
    return contenedor;
  }

  /**
   * Muestra un aviso flotante.
   * @param {string} mensaje
   * @param {string} [tipo] exito | error | aviso | info
   * @param {object} [opciones] {titulo, duracion, accion:{texto,fn}}
   */
  function aviso(mensaje, tipo, opciones) {
    var op = opciones || {};
    var cont = asegurarContenedor();
    var iconos = { exito: '✓', error: '✕', aviso: '⚠', info: 'ℹ' };
    var t = tipo || 'info';

    var nodo = U.crear('div', { class: 'aviso aviso--' + t, role: 'status' }, [
      U.crear('span', { class: 'aviso__icono', text: iconos[t] || 'ℹ' }),
      U.crear('div', { class: 'aviso__cuerpo' }, [
        op.titulo ? U.crear('strong', { text: op.titulo }) : null,
        U.crear('p', { text: mensaje })
      ]),
      U.crear('button', {
        class: 'aviso__cerrar', type: 'button', 'aria-label': 'Cerrar aviso',
        onclick: function () { cerrar(nodo); }
      }, ['×'])
    ]);

    if (op.accion && op.accion.texto) {
      nodo.querySelector('.aviso__cuerpo').appendChild(U.crear('button', {
        class: 'btn btn--mini btn--fantasma', type: 'button', text: op.accion.texto,
        onclick: function () { op.accion.fn(); cerrar(nodo); }
      }));
    }

    cont.appendChild(nodo);
    requestAnimationFrame(function () { nodo.classList.add('aviso--visible'); });

    var duracion = op.duracion === undefined ? 5200 : op.duracion;
    if (duracion > 0) { setTimeout(function () { cerrar(nodo); }, duracion); }
    return nodo;
  }

  function cerrar(nodo) {
    if (!nodo || !nodo.parentNode) { return; }
    nodo.classList.remove('aviso--visible');
    setTimeout(function () { if (nodo.parentNode) { nodo.parentNode.removeChild(nodo); } }, 220);
  }

  function exito(m) { return aviso(m, 'exito'); }
  function error(m) { return aviso(m, 'error', { duracion: 7000 }); }
  function alerta(m, o) { return aviso(m, 'aviso', o); }
  function info(m) { return aviso(m, 'info'); }

  /* ------------------------------------------- confirmación reutilizable */
  /**
   * Diálogo de confirmación (la eliminación siempre pide confirmación, RF-03).
   * @returns {Promise<boolean>}
   */
  function confirmar(mensaje, opciones) {
    var op = opciones || {};
    return new Promise(function (resolver) {
      var fondo = U.crear('div', { class: 'modal-fondo' });
      var caja = U.crear('div', { class: 'modal modal--confirmar', role: 'dialog', 'aria-modal': 'true' }, [
        U.crear('h3', { class: 'modal__titulo', text: op.titulo || 'Confirmar acción' }),
        U.crear('p', { class: 'modal__texto', text: mensaje }),
        U.crear('div', { class: 'modal__acciones' }, [
          U.crear('button', {
            class: 'btn btn--fantasma', type: 'button', text: op.cancelar || 'Cancelar',
            onclick: function () { fin(false); }
          }),
          U.crear('button', {
            class: 'btn ' + (op.peligro ? 'btn--peligro' : 'btn--primario'), type: 'button',
            text: op.aceptar || 'Confirmar',
            onclick: function () { fin(true); }
          })
        ])
      ]);
      fondo.appendChild(caja);
      document.body.appendChild(fondo);
      requestAnimationFrame(function () { fondo.classList.add('modal-fondo--visible'); });
      caja.querySelector('.btn:last-child').focus();

      function fin(valor) {
        fondo.classList.remove('modal-fondo--visible');
        setTimeout(function () { if (fondo.parentNode) { fondo.parentNode.removeChild(fondo); } }, 180);
        document.removeEventListener('keydown', porTecla);
        resolver(valor);
      }
      function porTecla(e) {
        if (e.key === 'Escape') { fin(false); }
        if (e.key === 'Enter') { fin(true); }
      }
      document.addEventListener('keydown', porTecla);
      fondo.addEventListener('click', function (e) { if (e.target === fondo) { fin(false); } });
    });
  }

  /* ------------------------------------------------- notificaciones del sistema */
  function soportadas() { return 'Notification' in global; }

  function permiso() { return soportadas() ? Notification.permission : 'unsupported'; }

  function pedirPermiso() {
    if (!soportadas()) { return Promise.resolve('unsupported'); }
    return Notification.requestPermission();
  }

  function notificar(titulo, cuerpo, etiqueta) {
    if (!soportadas() || Notification.permission !== 'granted') { return false; }
    if (document.visibilityState === 'visible') { return false; }   // ya se ve el aviso interno
    try {
      var n = new Notification(titulo, {
        body: cuerpo, tag: etiqueta || 'cgai', lang: 'es',
        icon: 'assets/icono-192.png', badge: 'assets/icono-192.png'
      });
      n.onclick = function () { global.focus(); n.close(); };
      return true;
    } catch (e) {
      console.warn('[notify] No se pudo mostrar la notificación', e);
      return false;
    }
  }

  /**
   * Dispara las notificaciones de alertas sin repetirlas (RF-24).
   * Cada aviso se marca como notificado con una clave única por periodo.
   */
  function despacharPendientes(periodo) {
    var ajustes = App.state.ajustes();
    if (!ajustes.notificacionesActivas) { return 0; }
    var pendientes = App.intelligence.notificacionesPendientes(periodo);
    var enviadas = 0;
    pendientes.forEach(function (p) {
      if (App.state.notificado(p.clave)) { return; }
      if (notificar(p.titulo, p.cuerpo, p.clave)) { enviadas++; }
      App.state.marcarNotificado(p.clave);
    });
    return enviadas;
  }

  /** RF-23: recordatorio diario de registro, a la hora configurada. */
  function revisarRecordatorio() {
    var a = App.state.ajustes();
    if (!a.recordatorioActivo) { return; }
    var hoy = U.hoyISO();
    if (App.state.logros().ultimoRegistro === hoy) { return; }
    var ahora = new Date();
    var partes = String(a.recordatorioHora || '21:00').split(':');
    var objetivo = Number(partes[0]) * 60 + Number(partes[1] || 0);
    if (ahora.getHours() * 60 + ahora.getMinutes() < objetivo) { return; }
    var clave = 'recordatorio-' + hoy;
    if (App.state.notificado(clave)) { return; }
    if (notificar('Recordatorio de registro', 'No olvides registrar tus movimientos de hoy.', clave)) {
      aviso('Recuerda registrar tus movimientos de hoy.', 'info');
    }
    App.state.marcarNotificado(clave);
  }

  App.notify = {
    aviso: aviso, exito: exito, error: error, alerta: alerta, info: info,
    confirmar: confirmar,
    soportadas: soportadas, permiso: permiso, pedirPermiso: pedirPermiso,
    notificar: notificar, despacharPendientes: despacharPendientes,
    revisarRecordatorio: revisarRecordatorio
  };
})(window);
