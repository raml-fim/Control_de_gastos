/* ============================================================================
 * js/views/settings.js — ajustes, seguridad, respaldo y datos
 * ---------------------------------------------------------------------------
 * RF-19 acceso con PIN · RF-20 bloqueo por inactividad · RF-23 recordatorio ·
 * RF-24 notificaciones · RF-18 exportación · RNF-09 copia de seguridad ·
 * RNF-10 restauración · RNF-01 a RNF-08 (idioma, moneda, accesibilidad).
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;
  var UI = App.ui;

  function montar(contenedor) {
    contenedor.innerHTML = '';
    var nodo = render();
    contenedor.appendChild(nodo);
    return nodo;
  }

  function render() {
    var vista = U.crear('div', { class: 'vista vista--ajustes' });
    var a = App.state.ajustes();

    vista.appendChild(U.crear('section', { class: 'barra-acciones' }, [
      U.crear('div', { class: 'barra-acciones__izq' }, [
        U.crear('h1', { class: 'titulo-vista', text: 'Ajustes y respaldo' }),
        U.crear('p', { class: 'subtitulo-vista', text: 'Seguridad, notificaciones, formato de moneda, copias de seguridad y datos de la aplicación.' })
      ])
    ]));

    var grid = U.crear('section', { class: 'grid grid--2' });

    /* ------------------------------------------------------------- perfil */
    var fPerfil = UI.formulario([
      { nombre: 'usuario', etiqueta: 'Tu nombre', tipo: 'text', valor: a.usuario, placeholder: 'Ej. Rafael' },
      { nombre: 'simbolo', etiqueta: 'Símbolo de moneda', tipo: 'text', valor: a.simbolo, maxlength: '4' },
      {
        nombre: 'decimales', etiqueta: 'Decimales', tipo: 'select', valor: String(a.decimales),
        opciones: [{ valor: '0', etiqueta: 'Sin decimales' }, { valor: '2', etiqueta: 'Dos decimales' }]
      },
      {
        nombre: 'idioma', etiqueta: 'Idioma', tipo: 'select', valor: a.idioma,
        opciones: [{ valor: 'es', etiqueta: 'Español' }]
      }
    ]);
    fPerfil.nodo.appendChild(boton('Guardar preferencias', 'btn btn--primario', function () {
      var v = UI.valores(fPerfil.campos);
      var aj = App.state.ajustes();
      aj.usuario = v.usuario;
      aj.simbolo = v.simbolo || '$';
      aj.decimales = Number(v.decimales);
      aj.idioma = v.idioma;
      App.state.guardar('ajustes-perfil');
      App.notify.exito('Preferencias guardadas.');
      App.app.refrescar();
    }));
    grid.appendChild(tarjeta('Perfil y formato', 'Aplica a toda la aplicación, incluidos los reportes exportados.', [fPerfil.nodo]));

    /* ---------------------------------------------------------- seguridad */
    var nodoSeguridad = U.crear('div', { class: 'lista-ajustes' });
    nodoSeguridad.appendChild(filaAjuste('Protección con PIN',
      a.pinActivo ? 'Activo · el PIN se guarda cifrado (SHA-256), nunca en texto plano.' : 'Desactivado · cualquiera puede abrir la aplicación.',
      boton(a.pinActivo ? 'Cambiar PIN' : 'Activar PIN', 'btn btn--mini btn--primario', gestionarPin)));
    if (a.pinActivo) {
      nodoSeguridad.appendChild(filaAjuste('Bloqueo por inactividad',
        a.bloqueoInactividad ? 'Se bloquea tras ' + a.bloqueoInactividad + ' minutos sin actividad.' : 'Desactivado.',
        boton('Configurar', 'btn btn--mini btn--fantasma', configurarBloqueo)));
      nodoSeguridad.appendChild(filaAjuste('Bloquear ahora', 'Vuelve a solicitar el PIN de inmediato.',
        boton('Bloquear', 'btn btn--mini btn--fantasma', function () {
          App.security.bloquear();
          App.app.refrescar();
        })));
    }
    grid.appendChild(tarjeta('Seguridad', 'RNF-05 y RNF-06: los datos se guardan en tu dispositivo y el PIN se almacena con hash.', [nodoSeguridad]));

    /* ------------------------------------------------------ notificaciones */
    var nodoNotif = U.crear('div', { class: 'lista-ajustes' });
    var permiso = App.notify.permiso();
    nodoNotif.appendChild(filaAjuste('Notificaciones de alertas',
      permiso === 'granted'
        ? (a.notificacionesActivas ? 'Activas: se avisa al 80 % y al 100 % de cada límite y en las metas próximas a vencer.' : 'Permiso concedido, pero las notificaciones están desactivadas.')
        : (permiso === 'denied' ? 'El navegador bloqueó las notificaciones. Habilítalas en la configuración del sitio.' : 'Sin permiso del navegador.'),
      boton(a.notificacionesActivas ? 'Desactivar' : 'Activar', 'btn btn--mini ' + (a.notificacionesActivas ? 'btn--fantasma' : 'btn--primario'),
        alternarNotificaciones)));
    nodoNotif.appendChild(filaAjuste('Recordatorio diario de registro',
      a.recordatorioActivo ? 'Activo a las ' + a.recordatorioHora + '.' : 'Desactivado.',
      U.crear('div', { class: 'fila-acciones' }, [
        campoHora(a.recordatorioHora),
        boton(a.recordatorioActivo ? 'Desactivar' : 'Activar', 'btn btn--mini ' + (a.recordatorioActivo ? 'btn--fantasma' : 'btn--primario'),
          alternarRecordatorio)
      ])));
    nodoNotif.appendChild(filaAjuste('Probar notificación', 'Envía un aviso de prueba para verificar el permiso.',
      boton('Probar', 'btn btn--mini btn--fantasma', function () {
        if (!App.notify.soportadas()) { App.notify.alerta('Este navegador no soporta notificaciones del sistema.'); return; }
        if (Notification.permission !== 'granted') {
          App.notify.pedirPermiso().then(function (p) {
            if (p === 'granted') { App.notify.notificar('Control de Gastos', 'Las notificaciones funcionan correctamente.', 'prueba'); }
            else { App.notify.alerta('No se concedió el permiso de notificaciones.'); }
          });
          return;
        }
        App.notify.notificar('Control de Gastos', 'Notificación de prueba.', 'prueba');
        App.notify.info('Si no ves la notificación del sistema, revisa el centro de notificaciones.');
      })));
    grid.appendChild(tarjeta('Notificaciones y recordatorios', 'RF-23 y RF-24: avisos del sistema cuando la aplicación no está en primer plano.', [nodoNotif]));

    /* --------------------------------------------------- presupuesto y motor */
    var nodoMotor = U.crear('div', { class: 'lista-ajustes' });
    var r = a.reglas;
    nodoMotor.appendChild(filaAjuste('Reglas del motor de análisis',
      'Aviso al ' + r.umbralAviso + ' % · límite al ' + r.umbralLimite + ' % · gasto hormiga ≤ ' + U.moneda(r.gastoHormigaMonto) + '.',
      boton('Editar reglas', 'btn btn--mini btn--fantasma', function () { App.views.analisis.montar(document.getElementById('contenido')); abrirReglasPublico(); })));
    nodoMotor.appendChild(filaAjuste('Recalcular notificaciones',
      'Vuelve a permitir el aviso de todas las alertas del periodo actual.',
      boton('Recalcular', 'btn btn--mini btn--fantasma', function () {
        App.state.limpiarNotificados();
        App.notify.info('Las alertas del periodo se notificarán de nuevo.');
      })));
    grid.appendChild(tarjeta('Motor de análisis', 'RF-10, RF-20 y RF-22: reglas configurables y estadística descriptiva.', [nodoMotor]));

    /* ------------------------------------------------------- respaldo */
    var nodoRespaldo = U.crear('div', { class: 'lista-ajustes' });
    nodoRespaldo.appendChild(filaAjuste('Respaldo manual',
      'Descarga un archivo JSON con todos tus datos (' + datos().movimientos.length + ' movimientos, ' +
      datos().metas.length + ' metas). Espacio usado: ' + App.storage.usoKB() + ' KB.',
      boton('Descargar respaldo', 'btn btn--mini btn--primario', descargarRespaldo, 'descargar')));
    nodoRespaldo.appendChild(filaAjuste('Restaurar respaldo',
      'Carga un archivo JSON. Puedes combinar (sin duplicar) o reemplazar toda la información.',
      U.crear('div', { class: 'fila-acciones' }, [
        crearInputArchivo(),
        boton('Reemplazar todo', 'btn btn--mini btn--peligro', seleccionarReemplazo)
      ])));
    nodoRespaldo.appendChild(filaAjuste('Exportar movimientos (CSV)',
      'Compatible con Excel, Numbers y Hojas de cálculo de Google.',
      boton('Exportar CSV', 'btn btn--mini btn--fantasma', function () {
        App.views.movimientos.exportarCSV();
      })));
    grid.appendChild(tarjeta('Respaldo y restauración', 'RNF-09 y RNF-10: copia de seguridad y restauración sin pérdida ni duplicación.', [nodoRespaldo]));

    /* ----------------------------------------------------------- datos */
    var nodoDatos = U.crear('div', { class: 'lista-ajustes' });
    nodoDatos.appendChild(filaAjuste('Datos de demostración',
      'Carga tres meses de movimientos, presupuestos y metas de ejemplo para probar el análisis.',
      boton('Cargar ejemplos', 'btn btn--mini btn--fantasma', function () {
        App.notify.confirmar('Se agregarán movimientos, presupuestos y metas de ejemplo. ¿Continuar?')
          .then(function (ok) {
            if (!ok) { return; }
            var res = App.state.sembrarDemo(false);
            App.notify.exito('Se cargaron ' + res.movimientos + ' movimientos de ejemplo.');
            App.app.refrescar();
          });
      })));
    nodoDatos.appendChild(filaAjuste('Reiniciar la aplicación',
      'Borra todos los datos y deja la aplicación como recién instalada. Esta acción no se puede deshacer.',
      boton('Reiniciar todo', 'btn btn--mini btn--peligro', function () {
        App.notify.confirmar('Se eliminarán todos tus movimientos, metas, presupuestos y ajustes. ¿Continuar?',
          { titulo: 'Reiniciar la aplicación', aceptar: 'Sí, borrar todo', peligro: true })
          .then(function (ok) {
            if (!ok) { return; }
            App.state.reiniciar();
            App.notify.exito('La aplicación se reinició con los datos por defecto.');
            App.app.refrescar();
          });
      })));
    nodoDatos.appendChild(filaAjuste('Almacenamiento',
      App.storage.hayLocalStorage()
        ? 'localStorage disponible: los datos se conservan al cerrar el navegador.'
        : 'localStorage bloqueado: los datos viven solo en esta sesión. Abre la app desde un servidor local o habilita el almacenamiento.',
      null));
    grid.appendChild(tarjeta('Datos de la aplicación', 'RF-21: la aplicación funciona sin conexión porque todo se guarda en el dispositivo.', [nodoDatos]));

    vista.appendChild(grid);

    /* ------------------------------------------------------ bitácora */
    var bitacora = U.crear('section', { class: 'tarjeta' });
    bitacora.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Bitácora de cambios' }),
      U.crear('span', { class: 'tarjeta__nota', text: datos().log.length + ' registros' })
    ]));
    bitacora.appendChild(U.crear('div', { class: 'bitacora' }, datos().log.slice(0, 20).map(function (l) {
      return U.crear('div', { class: 'bitacora__fila' }, [
        U.crear('span', { class: 'bitacora__hora', text: new Date(l.fecha).toLocaleString('es-MX') }),
        U.crear('span', { class: 'bitacora__accion', text: l.accion })
      ]);
    })));
    vista.appendChild(bitacora);

    /* ------------------------------------------------------ acerca de */
    vista.appendChild(U.crear('section', { class: 'tarjeta tarjeta--acerca' }, [
      U.crear('h2', { text: 'Acerca del proyecto' }),
      U.crear('p', {
        html: '<b>Control de Gastos con Análisis Inteligente</b> · ' + U.esc(datos().meta.equipo) +
          ' · versión ' + U.esc(String(datos().meta.version)) + ' del esquema de datos.<br>' +
          'Asignatura: Metodologías Ágiles de Desarrollo de Software. Docente: Dr. Manuel de Jesús Rodríguez Guerrero.<br>' +
          'Aplicación web construida con HTML, CSS y JavaScript puro, sin dependencias externas. ' +
          'Implementa los 26 requerimientos funcionales (RF-01 a RF-26) definidos en el documento del proyecto v2.0 final.'
      })
    ]));

    return vista;
  }

  /* ----------------------------------------------------------- piezas UI */
  function tarjeta(titulo, descripcion, hijos) {
    return U.crear('div', { class: 'tarjeta' }, [
      U.crear('header', { class: 'tarjeta__cabecera' }, [
        U.crear('div', {}, [
          U.crear('h2', { text: titulo }),
          descripcion ? U.crear('p', { class: 'tarjeta__desc', text: descripcion }) : null
        ])
      ])
    ].concat(hijos || []));
  }

  function filaAjuste(titulo, descripcion, control) {
    return U.crear('div', { class: 'fila-ajuste' }, [
      U.crear('div', { class: 'fila-ajuste__texto' }, [
        U.crear('b', { text: titulo }),
        U.crear('small', { text: descripcion })
      ]),
      control ? U.crear('div', { class: 'fila-ajuste__control' }, [control]) : null
    ]);
  }

  function boton(texto, clase, fn, iconoNombre) {
    return U.crear('button', { class: clase, type: 'button', onclick: fn }, [
      iconoNombre ? UI.icono(iconoNombre) : null,
      document.createTextNode(texto)
    ]);
  }

  function campoHora(valor) {
    var input = U.crear('input', { type: 'time', class: 'input-mini', value: valor || '21:00', 'aria-label': 'Hora del recordatorio' });
    input.addEventListener('change', function () {
      App.state.ajustes().recordatorioHora = input.value;
      App.state.guardar('recordatorio-hora');
      App.notify.info('Recordatorio programado a las ' + input.value + '.');
    });
    return input;
  }

  function datos() { return App.state.bruto(); }

  /* --------------------------------------------------------- PIN y bloqueo */
  function gestionarPin() {
    var activo = App.state.ajustes().pinActivo;
    var campos = activo
      ? [{ nombre: 'actual', etiqueta: 'PIN actual', tipo: 'password', requerido: true, maxlength: '6', inputmode: 'numeric' },
      { nombre: 'nuevo', etiqueta: 'Nuevo PIN (4 a 6 dígitos)', tipo: 'password', requerido: true, maxlength: '6', inputmode: 'numeric' },
      { nombre: 'repetir', etiqueta: 'Repite el nuevo PIN', tipo: 'password', requerido: true, maxlength: '6', inputmode: 'numeric' }]
      : [{ nombre: 'nuevo', etiqueta: 'PIN (4 a 6 dígitos)', tipo: 'password', requerido: true, maxlength: '6', inputmode: 'numeric' },
      { nombre: 'repetir', etiqueta: 'Repite el PIN', tipo: 'password', requerido: true, maxlength: '6', inputmode: 'numeric' }];
    var f = UI.formulario(campos);
    var error = U.crear('p', { class: 'formulario__error' });

    var m = UI.modal({
      titulo: activo ? 'Cambiar PIN' : 'Activar PIN',
      contenido: U.crear('div', {}, [f.nodo, error]),
      acciones: [
        activo ? U.crear('button', {
          class: 'btn btn--peligro', type: 'button', text: 'Desactivar PIN',
          onclick: function () {
            App.security.desactivar(f.campos.actual.value)
              .then(function () {
                App.notify.exito('Protección con PIN desactivada.');
                m.cerrar();
                App.app.refrescar();
              })
              .catch(function (e) { error.textContent = e.message; });
          }
        }) : null,
        U.crear('button', { class: 'btn btn--fantasma', type: 'button', text: 'Cancelar', onclick: function () { m.cerrar(); } }),
        U.crear('button', {
          class: 'btn btn--primario', type: 'button', text: activo ? 'Cambiar' : 'Activar',
          onclick: function () {
            var v = UI.valores(f.campos);
            if (!App.security.validarFormato(v.nuevo)) { error.textContent = 'El PIN debe tener entre 4 y 6 dígitos.'; return; }
            if (v.nuevo !== v.repetir) { error.textContent = 'Los PIN no coinciden.'; return; }
            var accion = activo ? App.security.cambiar(v.actual, v.nuevo) : App.security.activar(v.nuevo);
            accion.then(function () {
              App.notify.exito(activo ? 'PIN actualizado.' : 'PIN activado. Se pedirá al abrir la aplicación.');
              m.cerrar();
              App.app.refrescar();
            }).catch(function (e) { error.textContent = e.message; });
          }
        })
      ].filter(Boolean)
    });
  }

  function configurarBloqueo() {
    var f = UI.formulario([
      {
        nombre: 'minutos', etiqueta: 'Minutos de inactividad antes de bloquear', tipo: 'select',
        valor: String(App.state.ajustes().bloqueoInactividad),
        opciones: [{ valor: '0', etiqueta: 'Desactivado' }, { valor: '1', etiqueta: '1 minuto' },
        { valor: '5', etiqueta: '5 minutos' }, { valor: '10', etiqueta: '10 minutos' },
        { valor: '30', etiqueta: '30 minutos' }]
      }
    ]);
    var m = UI.modal({
      titulo: 'Bloqueo por inactividad', contenido: f.nodo,
      acciones: [
        U.crear('button', { class: 'btn btn--fantasma', type: 'button', text: 'Cancelar', onclick: function () { m.cerrar(); } }),
        U.crear('button', {
          class: 'btn btn--primario', type: 'button', text: 'Guardar',
          onclick: function () {
            var v = UI.valores(f.campos);
            App.state.ajustes().bloqueoInactividad = Number(v.minutos);
            App.state.guardar('bloqueo-inactividad');
            App.notify.exito(Number(v.minutos) ? 'La aplicación se bloqueará tras ' + v.minutos + ' minutos sin actividad.' : 'Bloqueo por inactividad desactivado.');
            m.cerrar();
            App.app.refrescar();
          }
        })
      ]
    });
  }

  /* ------------------------------------------------------- notificaciones */
  function alternarNotificaciones() {
    var a = App.state.ajustes();
    if (a.notificacionesActivas) {
      a.notificacionesActivas = false;
      App.state.guardar('notificaciones-off');
      App.notify.info('Notificaciones desactivadas.');
      App.app.refrescar();
      return;
    }
    if (!App.notify.soportadas()) { App.notify.alerta('Este navegador no soporta notificaciones del sistema.'); return; }
    App.notify.pedirPermiso().then(function (p) {
      if (p !== 'granted') { App.notify.alerta('No se concedió el permiso de notificaciones.'); return; }
      a.notificacionesActivas = true;
      App.state.guardar('notificaciones-on');
      App.notify.exito('Notificaciones activadas.');
      App.notify.despacharPendientes(U.periodoActual());
      App.app.refrescar();
    });
  }

  function alternarRecordatorio() {
    var a = App.state.ajustes();
    a.recordatorioActivo = !a.recordatorioActivo;
    App.state.guardar('recordatorio');
    App.notify.info(a.recordatorioActivo ? 'Recordatorio diario activado a las ' + a.recordatorioHora + '.' : 'Recordatorio diario desactivado.');
    App.app.refrescar();
  }

  /* -------------------------------------------------------- respaldo */
  function descargarRespaldo() {
    var json = App.state.exportarJSON();
    U.descargar('respaldo_control_gastos_' + U.hoyISO() + '.json', json, 'application/json');
    App.notify.exito('Respaldo descargado. Guárdalo en un lugar seguro.');
  }

  var modoImportacion = 'combinar';

  function crearInputArchivo() {
    var input = U.crear('input', { type: 'file', accept: '.json,application/json', class: 'input-archivo' });
    input.addEventListener('change', function () {
      var archivo = input.files && input.files[0];
      if (!archivo) { return; }
      U.leerArchivo(archivo, function (texto) {
        try {
          var res = App.state.importarJSON(texto, 'combinar');
          App.notify.exito('Respaldo combinado: ' + res.agregados + ' registros nuevos, ' + res.repetidos + ' ya existían (sin duplicar).');
          App.app.refrescar();
        } catch (e) {
          App.notify.error('No se pudo restaurar: ' + e.message);
        }
      });
      input.value = '';
    });
    return input;
  }

  function seleccionarReemplazo() {
    var input = U.crear('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', function () {
      var archivo = input.files && input.files[0];
      if (!archivo) { return; }
      App.notify.confirmar('Se reemplazarán TODOS los datos actuales con el contenido del respaldo. ¿Continuar?',
        { titulo: 'Reemplazar datos', aceptar: 'Reemplazar', peligro: true }).then(function (ok) {
          if (!ok) { return; }
          U.leerArchivo(archivo, function (texto) {
            try {
              var res = App.state.importarJSON(texto, 'reemplazar');
              App.notify.exito('Datos restaurados: ' + res.movimientos + ' movimientos cargados.');
              App.app.refrescar();
            } catch (e) {
              App.notify.error('No se pudo restaurar: ' + e.message);
            }
          });
        });
      input.value = '';
    });
    input.click();
  }

  function abrirReglasPublico() {
    var botonReglas = document.querySelector('.vista--analisis .btn--primario');
    if (botonReglas) { botonReglas.click(); }
  }

  App.views = App.views || {};
  App.views.ajustes = { montar: montar, render: render };
})(window);
