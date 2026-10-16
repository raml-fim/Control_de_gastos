/* ============================================================================
 * js/app.js — arranque, navegación y capa de aplicación
 * ---------------------------------------------------------------------------
 * Orquesta todo: inicializa el estado, monta las vistas, controla la
 * navegación, aplica el bloqueo con PIN (RF-19 y RF-20), registra el service
 * worker (RF-21) y genera los movimientos recurrentes pendientes (RF-16).
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;
  var UI = App.ui;

  var RUTAS = [
    { id: 'panel', titulo: 'Panel de inicio', icono: 'inicio', vista: 'panel' },
    { id: 'movimientos', titulo: 'Movimientos', icono: 'movimientos', vista: 'movimientos' },
    { id: 'presupuesto', titulo: 'Presupuesto', icono: 'presupuesto', vista: 'presupuesto' },
    { id: 'metas', titulo: 'Metas y cuentas', icono: 'metas', vista: 'metas' },
    { id: 'analisis', titulo: 'Análisis inteligente', icono: 'analisis', vista: 'analisis' },
    { id: 'ajustes', titulo: 'Ajustes', icono: 'ajustes', vista: 'ajustes' }
  ];

  var rutaActual = 'panel';
  var montando = false;

  /* --------------------------------------------------------------- arranque */
  function iniciar() {
    var resultado = App.state.cargar();

    App.security.restaurarSesion();
    construirArmazon();
    registrarServiceWorker();

    if (!App.security.desbloqueada()) {
      mostrarBloqueo();
    } else {
      entrar();
    }

    // Antes de decidir si hacen falta datos de ejemplo, se pregunta al
    // servidor: la base de SQL Server es la fuente de verdad. Solo si no hay
    // servidor Y la caché local está vacía se siembran ejemplos locales.
    App.api.verificar().then(function (estado) {
      var hayServidor = estado.disponible === true;
      var hayLocal = (App.state.bruto().movimientos || []).length > 0;

      if (!hayServidor && !hayLocal) {
        App.state.sembrarDemo(true);
        App.state.guardar('primer-arranque-sin-servidor');
        refrescar();
      }

      if (hayServidor && !hayLocal) {
        // Primer arranque con base de datos: se copian los catálogos base y,
        // si la base está vacía, se cargan los ejemplos una sola vez.
        return prepararBaseVacia();
      }
      return null;
    }).then(function () {
      return sincronizarConServidor(!resultado.nuevo);
    });
  }

  /**
   * Primer arranque contra una base de datos sin movimientos: se cargan los
   * datos de ejemplo en SQL Server (no en el navegador) para que el análisis
   * tenga material. Si la base ya tiene datos, no se toca nada.
   */
  function prepararBaseVacia() {
    return App.api.movimientos({ limite: 1 }).then(function (res) {
      if (res.total > 0) { return null; }
      App.notify.info('La base local está vacía: cargando datos de ejemplo.', { duracion: 6000 });
      return App.api.panel(U.periodoActual()).then(function () {
        // La generación de ejemplos vive en el backend (npm run db:demo).
        App.notify.aviso('Para cargar ejemplos en la base ejecuta:  npm run db:demo',
          { titulo: 'Base de datos vacía', duracion: 12000 });
        return null;
      });
    }).catch(function () { return null; });
  }

  /**
   * Trae el estado desde SQL Server. Se llama al arrancar y cuando el usuario
   * pulsa «Reintentar» en el aviso de sin conexión.
   */
  function sincronizarConServidor(silencioso) {
    actualizarEstadoConexion({ comprobando: true });
    return App.state.cargarDesdeServidor()
      .then(function (res) {
        var ok = res && res.disponible !== false;
        actualizarEstadoConexion({ disponible: ok, error: res && res.error });
        if (ok) {
          if (!silencioso && res.movimientos) {
            App.notify.exito('Datos sincronizados con la base local (' +
              res.movimientos.servidor + ' movimientos).');
          }
          refrescar();
          return App.api.sincronizar();
        }
        if (!silencioso) {
          App.notify.alerta('Se está trabajando sin conexión al servidor local. ' +
            'Los cambios se guardarán y se enviarán cuando vuelva la conexión.', { duracion: 8000 });
        }
        return null;
      })
      .then(function (sync) {
        actualizarEstadoConexion({ pendientes: App.api.pendientes() });
        if (sync && sync.enviados) {
          App.notify.exito('Se enviaron ' + sync.enviados + ' cambios pendientes a la base local.');
        }
        // La barra lateral se pintó antes de traer los ajustes del servidor:
        // se refresca para mostrar el nombre del usuario y el estado real.
        actualizarUsuarioLateral();
        if (sync && sync.enviados) { refrescar(); }
        actualizarBadge();
        return sync;
      })
      .catch(function (e) {
        actualizarEstadoConexion({ disponible: false, error: e.message });
        console.warn('[app] sincronización fallida:', e.message);
      });
  }

  /** Refresca el nombre y las iniciales del usuario en la barra lateral. */
  function actualizarUsuarioLateral() {
    var nombre = App.state.ajustes().usuario || 'Sin nombre';
    var detalle = document.getElementById('usuario-nombre');
    var avatar = document.getElementById('usuario-avatar');
    if (detalle) { detalle.textContent = nombre; }
    if (avatar) { avatar.textContent = iniciales(nombre === 'Sin nombre' ? 'Usuario' : nombre); }
  }

  /** Pinta el indicador de conexión con la base local. */
  function actualizarEstadoConexion(extra) {
    var estado = Object.assign({
      disponible: App.api.disponible(),
      pendientes: App.api ? App.api.pendientes() : 0,
      comprobando: false,
      error: null
    }, extra || {});

    var nodo = U.$('#estado-conexion');
    if (!nodo) { return; }
    U.limpiar(nodo);

    var clase, texto, titulo;
    if (estado.comprobando) {
      clase = 'estado-conexion--comprobando';
      texto = 'Conectando…';
      titulo = 'Comprobando la conexión con la base local de SQL Server';
    } else if (estado.disponible) {
      clase = 'estado-conexion--ok';
      texto = 'Base local conectada';
      var info = App.api.info();
      titulo = 'SQL Server Express local · base ' + (info.base || 'ControlGastos') +
        (info.motor ? ' · ' + info.motor : '');
    } else {
      clase = 'estado-conexion--offline';
      texto = 'Sin conexión';
      titulo = (estado.error || 'No se pudo contactar el servidor local') +
        '. Los cambios se guardan en este equipo y se sincronizan al reconectar.';
    }

    var pendientes = estado.pendientes || 0;
    nodo.className = 'estado-conexion ' + clase;
    nodo.title = titulo;
    nodo.appendChild(U.crear('span', { class: 'estado-conexion__punto' }));
    nodo.appendChild(U.crear('span', { class: 'estado-conexion__texto', text: texto }));
    if (pendientes > 0) {
      nodo.appendChild(U.crear('span', {
        class: 'estado-conexion__pendientes', text: pendientes + ' por enviar'
      }));
    }
    if (!estado.disponible && !estado.comprobando) {
      nodo.appendChild(U.crear('button', {
        class: 'estado-conexion__reintentar', type: 'button', text: 'Reintentar',
        onclick: function () { sincronizarConServidor(true); }
      }));
    }
  }

  function entrar() {
    App.security.iniciarVigilancia();
    navegar(leerHash() || 'panel', true);
    App.notify.despacharPendientes(U.periodoActual());
    setInterval(function () {
      App.notify.revisarRecordatorio();
    }, 60000);
    setTimeout(function () { App.notify.revisarRecordatorio(); }, 4000);
    // Reintento periódico por si el servidor local se reinicia
    setInterval(function () {
      if (!App.api.disponible()) { sincronizarConServidor(true); }
    }, 45000);
  }

  /* ---------------------------------------------------------------- armazón */
  function construirArmazon() {
    var app = U.$('#app');
    if (!app) { return; }
    U.limpiar(app);

    var menu = U.crear('aside', { class: 'lateral', id: 'lateral' });
    menu.appendChild(U.crear('div', { class: 'marca' }, [
      U.crear('span', { class: 'marca__logo' }, ['▦']),
      U.crear('span', { class: 'marca__texto' }, [
        U.crear('b', { text: 'Control de Gastos' }),
        U.crear('small', { text: 'Análisis inteligente' })
      ])
    ]));

    var nav = U.crear('nav', { class: 'menu', 'aria-label': 'Navegación principal' });
    RUTAS.forEach(function (r) {
      nav.appendChild(U.crear('button', {
        class: 'menu__item', type: 'button', dataset: { ruta: r.id },
        onclick: function () { navegar(r.id); }
      }, [UI.icono(r.icono), U.crear('span', { text: r.titulo })]));
    });
    menu.appendChild(nav);

    var pieMenu = U.crear('div', { class: 'lateral__pie' });
    var usuario = App.state.ajustes().usuario;
    pieMenu.appendChild(U.crear('div', { class: 'usuario' }, [
      U.crear('span', { class: 'usuario__avatar', id: 'usuario-avatar', text: iniciales(usuario || 'Usuario') }),
      U.crear('span', { class: 'usuario__det' }, [
        U.crear('b', { id: 'usuario-nombre', text: usuario || 'Sin nombre' }),
        U.crear('small', { text: 'Equipo 1 · Los Inges' })
      ])
    ]));
    pieMenu.appendChild(U.crear('div', { class: 'lateral__acciones' }, [
      U.crear('button', {
        class: 'btn btn--mini btn--fantasma', type: 'button', text: 'Respaldo y ajustes',
        onclick: function () { navegar('ajustes'); }
      })
    ]));
    menu.appendChild(pieMenu);
    app.appendChild(menu);

    var principal = U.crear('main', { class: 'principal' });
    var barra = U.crear('header', { class: 'barra-superior' }, [
      U.crear('button', {
        class: 'btn-icono btn-icono--menu', type: 'button', 'aria-label': 'Mostrar menú',
        onclick: function () { menu.classList.toggle('lateral--abierto'); }
      }, ['☰']),
      U.crear('h1', { class: 'barra-superior__titulo', id: 'titulo-vista', text: 'Panel de inicio' }),
      U.crear('div', { class: 'barra-superior__der' }, [
        U.crear('div', { class: 'estado-conexion', id: 'estado-conexion', title: 'Estado de la base local' }),
        U.crear('button', {
          class: 'btn-icono campana', type: 'button', title: 'Alertas activas',
          'aria-label': 'Alertas activas', id: 'campana', onclick: function () { navegar('analisis'); }
        }, [UI.icono('campana'), U.crear('span', { class: 'campana__badge', id: 'campana-badge', text: '0' })]),
        U.crear('button', {
          class: 'btn btn--mini btn--primario', type: 'button', text: '+ Movimiento',
          onclick: function () { abrirFormularioMovimiento(); }
        })
      ])
    ]);
    principal.appendChild(barra);

    var contenido = U.crear('div', { class: 'contenido', id: 'contenido' });
    principal.appendChild(contenido);
    app.appendChild(principal);

    actualizarBadge();
    App.state.alCambiar(U.debounce(function () { actualizarBadge(); }, 120));
  }

  function iniciales(nombre) {
    return String(nombre).trim().split(/\s+/).slice(0, 2)
      .map(function (p) { return p.charAt(0).toUpperCase(); }).join('');
  }

  /* -------------------------------------------------------------- navegación */
  function navegar(id, sinHash) {
    var ruta = RUTAS.filter(function (r) { return r.id === id; })[0] || RUTAS[0];
    if (!App.security.desbloqueada()) { mostrarBloqueo(); return; }
    rutaActual = ruta.id;
    if (!sinHash) { global.location.hash = '#' + ruta.id; }

    U.$$('.menu__item').forEach(function (b) {
      b.classList.toggle('menu__item--activo', b.dataset.ruta === ruta.id);
    });
    var titulo = U.$('#titulo-vista');
    if (titulo) { titulo.textContent = ruta.titulo; }

    var contenedor = U.$('#contenido');
    if (!contenedor) { return; }
    montando = true;
    var vista = App.views[ruta.vista];
    if (vista && vista.montar) {
      vista.montar(contenedor);
    } else {
      contenedor.innerHTML = '<p>Vista no disponible.</p>';
    }
    montando = false;
    var lateral = U.$('#lateral');
    if (lateral) { lateral.classList.remove('lateral--abierto'); }
    actualizarBadge();
  }

  function leerHash() {
    var h = String(global.location.hash || '').replace('#', '');
    return RUTAS.some(function (r) { return r.id === h; }) ? h : null;
  }

  /** Vuelve a pintar la vista actual (tras guardar cambios). */
  function refrescar() {
    if (montando) { return; }
    var ruta = RUTAS.filter(function (r) { return r.id === rutaActual; })[0];
    if (!ruta) { return; }
    var contenedor = U.$('#contenido');
    if (!contenedor) { return; }
    var scroll = contenedor.scrollTop;
    montando = true;
    App.views[ruta.vista].montar(contenedor);
    montando = false;
    contenedor.scrollTop = scroll;
    actualizarBadge();
  }

  function actualizarBadge() {
    var badge = U.$('#campana-badge');
    if (!badge) { return; }
    var n = App.intelligence.contarAlertas(U.periodoActual());
    badge.textContent = String(n);
    badge.style.display = n ? '' : 'none';
    badge.classList.toggle('campana__badge--critico',
      App.intelligence.alertas(U.periodoActual()).some(function (a) { return a.nivel === 'critico'; }));
  }

  /* ------------------------------------------------------- bloqueo con PIN */
  function mostrarBloqueo() {
    var app = U.$('#app');
    if (!app) { return; }
    U.limpiar(app);
    var entrada = '';
    var pensado = U.crear('div', { class: 'pin' });

    function pintar() {
      U.limpiar(pensado);
      pensado.appendChild(U.crear('div', { class: 'pin__caja' }, [
        U.crear('span', { class: 'pin__logo' }, ['▦']),
        U.crear('h1', { class: 'pin__titulo', text: 'Control de Gastos' }),
        U.crear('p', { class: 'pin__texto', text: 'Escribe tu PIN para ver tu información financiera.' }),
        U.crear('div', { class: 'pin__puntos' }, Array.prototype.map.call(
          new Array(Math.max(4, entrada.length)), function (_, i) {
            return U.crear('span', { class: 'pin__punto' + (i < entrada.length ? ' pin__punto--lleno' : '') });
          })),
        U.crear('div', { class: 'pin__teclado' }, teclas()),
        U.crear('p', { class: 'pin__error', id: 'pin-error' }),
        U.crear('button', {
          class: 'btn btn--fantasma btn--mini', type: 'button',
          text: '¿Olvidaste tu PIN?', onclick: explicarOlvido
        })
      ]));
    }

    function teclas() {
      var botones = [];
      for (var i = 1; i <= 9; i++) { botones.push(tecla(String(i))); }
      botones.push(tecla('borrar', function () { entrada = entrada.slice(0, -1); pintar(); }));
      botones.push(tecla('0'));
      botones.push(tecla('ok', intentar));
      return botones;
    }

    function tecla(valor, fn) {
      var esAccion = typeof fn === 'function';
      return U.crear('button', {
        class: 'pin__tecla' + (esAccion ? ' pin__tecla--accion' : ''),
        type: 'button', text: esAccion ? (valor === 'ok' ? '✓' : '⌫') : valor,
        onclick: function () {
          if (esAccion) { fn(); return; }
          if (entrada.length < 6) { entrada += valor; pintar(); }
        }
      });
    }

    function intentar() {
      if (!entrada) { return; }
      App.security.desbloquear(entrada).then(function (res) {
        if (res.ok) { entrar(); return; }
        entrada = '';
        pintar();
        var err = U.$('#pin-error');
        if (err) {
          err.textContent = 'PIN incorrecto. Intento ' + res.intentos + '.';
          err.classList.add('pin__error--visible');
        }
        if (res.intentos >= 5) {
          App.notify.alerta('Cinco intentos fallidos. Verifica tu PIN o usa un respaldo reciente.');
        }
      });
    }

    function explicarOlvido() {
      App.notify.alerta('Por seguridad el PIN no se puede recuperar. Si tienes un respaldo JSON, ' +
        'puedes reiniciar la aplicación desde la consola del navegador con ' +
        'localStorage.clear() y restaurar el respaldo.', { duracion: 9000 });
    }

    pintar();
    app.appendChild(pensado);
    document.addEventListener('keydown', function porTecla(e) {
      if (App.security.desbloqueada()) { document.removeEventListener('keydown', porTecla); return; }
      if (/^[0-9]$/.test(e.key) && entrada.length < 6) { entrada += e.key; pintar(); }
      else if (e.key === 'Backspace') { entrada = entrada.slice(0, -1); pintar(); }
      else if (e.key === 'Enter') { intentar(); }
    });
  }

  /* ---------------------------------------------- movimientos recurrentes */
  /** Genera el movimiento de una recurrencia para una fecha concreta. */
  function registrarRecurrencia(recurrente, fechaISO) {
    var mov = App.movimientos.crear({
      tipo: recurrente.tipo, monto: recurrente.monto, fecha: fechaISO,
      categoriaId: recurrente.categoriaId, cuentaId: recurrente.cuentaId,
      descripcion: recurrente.nombre, recurrenteId: recurrente.id, origen: 'recurrente'
    });
    App.recurrentes.actualizar(recurrente.id, { proxima: fechaISO });
    return mov;
  }

  /** RF-16: registra de una sola vez todas las recurrencias pendientes del mes. */
  function registrarPendientes(periodo) {
    var p = periodo || U.periodoActual();
    var generados = [];
    App.recurrentes.todos().forEach(function (r) {
      if (!r.activo) { return; }
      App.analytics.fechasDelPeriodo(r, p).forEach(function (iso) {
        var yaEsta = App.movimientos.filtrar(function (m) {
          return m.recurrenteId === r.id && m.fecha === iso;
        }).length;
        if (yaEsta) { return; }
        if (iso > U.hoyISO()) { return; }   // solo se registran los que ya vencieron
        // Evita duplicar un movimiento equivalente capturado a mano
        var equivalente = App.movimientos.filtrar(function (m) {
          return m.periodo === p && m.tipo === r.tipo && m.categoriaId === r.categoriaId &&
            U.num(m.monto) === U.num(r.monto) && !m.recurrenteId;
        }).length;
        if (equivalente && !r.forzar) { return; }
        generados.push(registrarRecurrencia(r, iso));
      });
    });
    return generados;
  }

  /** Cuenta cuántas recurrencias activas están pendientes de registrar. */
  function pendientesInfo(periodo) {
    var p = periodo || U.periodoActual();
    var n = 0;
    App.recurrentes.todos().forEach(function (r) {
      if (!r.activo) { return; }
      App.analytics.fechasDelPeriodo(r, p).forEach(function (iso) {
        if (iso > U.hoyISO()) { return; }
        var yaEsta = App.movimientos.filtrar(function (m) {
          return m.recurrenteId === r.id && m.fecha === iso;
        }).length;
        if (!yaEsta) { n++; }
      });
    });
    return n;
  }

  /* ------------------------------------------------- service worker (RF-21) */
  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator) || global.location.protocol === 'file:') {
      return;   // sin servidor no hay service worker: la app sigue funcionando en local
    }
    navigator.serviceWorker.register('sw.js').catch(function (e) {
      console.warn('[app] No se registró el service worker', e);
    });
  }

  /* ------------------------------------------------------------- API pública */
  App.app = {
    iniciar: iniciar,
    navegar: navegar,
    refrescar: refrescar,
    actualizarBadge: actualizarBadge,
    abrirFormularioMovimiento: function (tipo, existente) {
      App.views.movimientos.montar; 
      App.views.movimientos.abrirFormulario(tipo || 'gasto', existente);
    },
    registrarPendientes: registrarPendientes,
    pendientesInfo: pendientesInfo,
    registrarRecurrencia: registrarRecurrencia,
    rutas: RUTAS,
    rutaActual: function () { return rutaActual; }
  };

  /* ------------------------------------------------------------- arranque */
  document.addEventListener('DOMContentLoaded', function () {
    iniciar();
  });

  global.addEventListener('hashchange', function () {
    var h = leerHash();
    if (h && h !== rutaActual) { navegar(h, true); }
  });

  document.addEventListener('app:bloqueada', function () {
    mostrarBloqueo();
  });

  // Atajos de teclado: N = nuevo movimiento, 1..5 = vistas
  document.addEventListener('keydown', function (e) {
    if (!App.security.desbloqueada()) { return; }
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea') { return; }
    if (e.key === 'n' || e.key === 'N') { App.app.abrirFormularioMovimiento('gasto'); }
    var n = parseInt(e.key, 10);
    if (n >= 1 && n <= RUTAS.length) { navegar(RUTAS[n - 1].id); }
  });
})(window);
