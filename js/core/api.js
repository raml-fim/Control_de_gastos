/* ============================================================================
 * js/core/api.js — cliente de la API (backend local + SQL Server Express)
 * ---------------------------------------------------------------------------
 * Toda la aplicación habla con el servidor por aquí. Si el servidor no está
 * disponible, se trabaja con la copia local y las operaciones se encolan para
 * sincronizarlas después (modo sin conexión, RF-21).
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = global.App.util;

  var CLAVE_COLA = 'cgai.cola.v1';
  var BASE = (global.CGAI_API_URL || '').replace(/\/$/, '');   // mismo origen por omisión
  var TIEMPO_LIMITE = 12000;

  var estadoConexion = {
    disponible: null,        // null = sin comprobar, true/false después
    verificado: 0,
    servidor: null,
    version: null,
    base: null,
    motor: null,
    error: null
  };

  /* ------------------------------------------------------------- peticiones */
  function url(ruta) {
    return BASE + ruta;
  }

  /**
   * Petición a la API.
   * @returns {Promise<any>} los datos ya desempaquetados del sobre {ok, datos}
   */
  function peticion(metodo, ruta, cuerpo, opciones) {
    var op = opciones || {};
    var controlador = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var temporizador = setTimeout(function () {
      if (controlador) { controlador.abort(); }
    }, op.tiempoLimite || TIEMPO_LIMITE);

    var config = {
      method: metodo,
      headers: { 'Content-Type': 'application/json' },
      signal: controlador ? controlador.signal : undefined
    };
    if (cuerpo !== undefined && metodo !== 'GET') {
      config.body = JSON.stringify(cuerpo);
    }

    return fetch(url(ruta), config)
      .then(function (respuesta) {
        return respuesta.json().catch(function () {
          throw new Error('El servidor respondió con un formato inesperado.');
        }).then(function (json) {
          if (!respuesta.ok || json.ok === false) {
            var mensaje = (json && json.error && json.error.mensaje) || ('Error HTTP ' + respuesta.status);
            var error = new Error(mensaje);
            error.estado = respuesta.status;
            error.detalles = json && json.error ? json.error.detalles : null;
            throw error;
          }
          marcarDisponible(true);
          return json.datos;
        });
      })
      .catch(function (e) {
        if (e.name === 'AbortError') {
          marcarDisponible(false, 'El servidor no respondió a tiempo.');
          throw new Error('El servidor local no respondió (tiempo agotado).');
        }
        if (e instanceof TypeError) {
          marcarDisponible(false, 'No hay conexión con el servidor local.');
          throw new Error('No se pudo contactar el servidor local. Se trabajará con los datos de este equipo.');
        }
        throw e;
      })
      .then(function (datos) {
        clearTimeout(temporizador);
        return datos;
      }, function (e) {
        clearTimeout(temporizador);
        throw e;
      });
  }

  var get = function (ruta, opciones) { return peticion('GET', ruta, undefined, opciones); };
  var post = function (ruta, cuerpo) { return peticion('POST', ruta, cuerpo || {}); };
  var put = function (ruta, cuerpo) { return peticion('PUT', ruta, cuerpo || {}); };
  var patch = function (ruta, cuerpo) { return peticion('PATCH', ruta, cuerpo || {}); };
  var del = function (ruta, cuerpo) { return peticion('DELETE', ruta, cuerpo || {}); };

  /* --------------------------------------------------------------- conexión */
  function marcarDisponible(valor, error) {
    var cambio = estadoConexion.disponible !== valor;
    estadoConexion.disponible = valor;
    estadoConexion.verificado = Date.now();
    estadoConexion.error = error || null;
    if (cambio) { U.emitir('api:conexion', { disponible: valor, error: error }); }
  }

  /** Comprueba el estado del servidor y de la base local. */
  function verificar() {
    return get('/api/salud')
      .then(function (datos) {
        estadoConexion.servidor = datos.servicio;
        estadoConexion.version = datos.version;
        estadoConexion.base = datos.base && datos.base.base;
        estadoConexion.motor = datos.base && datos.base.motor;
        estadoConexion.conectado = !!(datos.base && datos.base.conectado);
        marcarDisponible(true);
        return estadoConexion;
      })
      .catch(function (e) {
        marcarDisponible(false, e.message);
        return estadoConexion;
      });
  }

  function disponible() { return estadoConexion.disponible === true; }
  function info() { return estadoConexion; }

  /* ------------------------------------------------------------ cola offline */
  /**
   * Operaciones pendientes de enviar al servidor. Cada elemento es
   * { metodo, ruta, cuerpo, entidad, idLocal, momento }.
   */
  function leerCola() {
    return App.storage.leer(CLAVE_COLA) || [];
  }

  function guardarCola(cola) {
    App.storage.escribir(CLAVE_COLA, cola);
    U.emitir('api:cola', { pendientes: cola.length });
    return cola;
  }

  function encolar(metodo, ruta, cuerpo, extra) {
    var cola = leerCola();
    cola.push(Object.assign({
      metodo: metodo, ruta: ruta, cuerpo: cuerpo, momento: new Date().toISOString()
    }, extra || {}));
    guardarCola(cola);
    return cola.length;
  }

  function pendientes() { return leerCola().length; }

  /**
   * Ejecuta una operación contra el servidor. Si falla por falta de conexión,
   * la encola y devuelve una promesa resuelta con { encolado: true }.
   * @param {object} op {metodo, ruta, cuerpo, entidad, idLocal, silencioso}
   */
  function ejecutar(op) {
    var cuerpo = op.cuerpo;
    // El identificador local se envía para que el servidor conserve el mismo id
    if (cuerpo && op.idLocal && !cuerpo.id) { cuerpo.id = op.idLocal; }
    return peticion(op.metodo, op.ruta, cuerpo, { tiempoLimite: op.tiempoLimite })
      .then(function (datos) { return { ok: true, datos: datos }; })
      .catch(function (e) {
        if (op.estado && e.estado && e.estado < 500 && e.estado !== 404) {
          // Error de negocio: no se reintenta
          throw e;
        }
        if (!estadoConexion.disponible || !e.estado) {
          encolar(op.metodo, op.ruta, cuerpo, { entidad: op.entidad, idLocal: op.idLocal });
          return { ok: false, encolado: true, error: e.message };
        }
        throw e;
      });
  }

  /** Intenta enviar todo lo que quedó pendiente. */
  function sincronizar() {
    var cola = leerCola();
    if (!cola.length) { return Promise.resolve({ enviados: 0, fallidos: 0, pendientes: 0 }); }

    var enviados = 0, fallidos = 0;
    var restantes = [];
    var erroresDetectados = [];

    function paso(i) {
      if (i >= cola.length) {
        guardarCola(restantes);
        estadoConexion.ultimoError = erroresDetectados.length ? erroresDetectados[0] : null;
        return { enviados: enviados, fallidos: fallidos, pendientes: restantes.length,
          errores: erroresDetectados };
      }
      var op = cola[i];
      return peticion(op.metodo, op.ruta, op.cuerpo, { tiempoLimite: 15000 })
        .then(function () { enviados++; })
        .catch(function (e) {
          fallidos++;
          // Un error de negocio (4xx) no se reintenta: la operación ya no es válida
          if (e.estado && e.estado >= 400 && e.estado < 500 && e.estado !== 404) {
            erroresDetectados.push(op.ruta + ': ' + e.message);
            return;   // se descarta de la cola
          }
          erroresDetectados.push(op.ruta + ': ' + e.message);
          restantes.push(op);
        })
        .then(function () { return paso(i + 1); });
    }

    return paso(0);
  }

  function limpiarCola() { guardarCola([]); }

  /* --------------------------------------------------------- rutas frecuentes */
  var api = {
    BASE: BASE,
    peticion: peticion, get: get, post: post, put: put, patch: patch, del: del,

    verificar: verificar, disponible: disponible, info: info,
    ejecutar: ejecutar, sincronizar: sincronizar,
    pendientes: pendientes, leerCola: leerCola, limpiarCola: limpiarCola, encolar: encolar,

    /* --- catálogos --- */
    salud: function () { return get('/api/salud'); },
    categorias: function (f) {
      var q = [];
      if (f && f.tipo) { q.push('tipo=' + encodeURIComponent(f.tipo)); }
      if (f && f.incluirOcultas === false) { q.push('incluirOcultas=false'); }
      return get('/api/categorias' + (q.length ? '?' + q.join('&') : ''));
    },
    cuentas: function () { return get('/api/cuentas'); },
    saldosCuentas: function () { return get('/api/cuentas/saldos'); },
    ajustes: function () { return get('/api/ajustes'); },
    guardarAjustes: function (a) { return put('/api/ajustes', a); },

    /* --- invitado / primera ejecución --- */
    sembrar: function () { return post('/api/reiniciar', { confirmar: false }); },

    /* --- movimientos --- */
    movimientos: function (f) {
      var partes = [];
      Object.keys(f || {}).forEach(function (k) {
        if (f[k] !== undefined && f[k] !== null && f[k] !== '') {
          partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(f[k]));
        }
      });
      return get('/api/movimientos' + (partes.length ? '?' + partes.join('&') : ''));
    },
    crearMovimiento: function (m) { return post('/api/movimientos', m); },
    actualizarMovimiento: function (id, m) { return put('/api/movimientos/' + id, m); },
    eliminarMovimiento: function (id) { return del('/api/movimientos/' + id); },
    transferir: function (t) { return post('/api/cuentas/transferir', t); },

    /* --- presupuestos --- */
    presupuestos: function (periodo) { return get('/api/presupuestos?periodo=' + periodo); },
    definirPresupuesto: function (p) { return put('/api/presupuestos', p); },
    quitarPresupuesto: function (periodo, categoriaId) {
      return del('/api/presupuestos?periodo=' + periodo + (categoriaId ? '&categoriaId=' + categoriaId : ''));
    },
    copiarPresupuesto: function (desde, hacia, sobrescribir) {
      return post('/api/presupuestos/copiar', { desde: desde, hacia: hacia, sobrescribir: !!sobrescribir });
    },
    estadoPresupuestos: function (periodo) { return get('/api/presupuestos/estado?periodo=' + periodo); },

    /* --- metas y recurrencias --- */
    metas: function () { return get('/api/metas'); },
    crearMeta: function (m) { return post('/api/metas', m); },
    actualizarMeta: function (id, m) { return put('/api/metas/' + id, m); },
    eliminarMeta: function (id) { return del('/api/metas/' + id); },
    aportesDeMeta: function (id) { return get('/api/metas/' + id + '/aportes'); },
    aportar: function (id, a) { return post('/api/metas/' + id + '/aportes', a); },
    eliminarAporte: function (id) { return del('/api/aportes/' + id); },

    recurrentes: function () { return get('/api/recurrentes'); },
    crearRecurrente: function (r) { return post('/api/recurrentes', r); },
    actualizarRecurrente: function (id, r) { return put('/api/recurrentes/' + id, r); },
    eliminarRecurrente: function (id) { return del('/api/recurrentes/' + id); },
    pendientesRecurrentes: function (periodo) {
      return get('/api/recurrentes/pendientes?periodo=' + (periodo || ''));
    },
    registrarPendientes: function (periodo) {
      return post('/api/recurrentes/registrar-pendientes', { periodo: periodo });
    },

    /* --- análisis --- */
    panel: function (periodo) { return get('/api/panel?periodo=' + periodo); },
    resumen: function (periodo) { return get('/api/resumen?periodo=' + periodo); },
    indicadores: function (periodo) { return get('/api/indicadores?periodo=' + periodo); },
    comparacion: function (periodo, meses) {
      return get('/api/comparacion?periodo=' + periodo + '&meses=' + (meses || 6));
    },
    topGastos: function (periodo, cantidad) {
      return get('/api/top-gastos?periodo=' + periodo + '&cantidad=' + (cantidad || 3));
    },
    alertas: function (periodo) { return get('/api/alertas?periodo=' + periodo); },
    recomendaciones: function (periodo) { return get('/api/recomendaciones?periodo=' + periodo); },
    patrones: function (periodo) { return get('/api/patrones?periodo=' + periodo); },
    reporte: function (periodo) { return get('/api/reportes/periodo?periodo=' + periodo); },
    exportarCsv: function (filtros) {
      var partes = [];
      Object.keys(filtros || {}).forEach(function (k) {
        if (filtros[k] !== undefined && filtros[k] !== null && filtros[k] !== '') {
          partes.push(encodeURIComponent(k) + '=' + encodeURIComponent(filtros[k]));
        }
      });
      return get('/api/movimientos/exportar/csv' + (partes.length ? '?' + partes.join('&') : ''));
    },

    /* --- seguridad, avisos, respaldo --- */
    pin: function (datos) { return post('/api/pin', datos); },
    avisos: function () { return get('/api/avisos'); },
    marcarAviso: function (clave) { return post('/api/avisos', { clave: clave }); },
    marcarAvisos: function (claves) { return post('/api/avisos/lote', { claves: claves }); },
    limpiarAvisos: function () { return del('/api/avisos'); },
    logros: function () { return get('/api/logros'); },
    bitacora: function (limite) { return get('/api/bitacora?limite=' + (limite || 50)); },
    respaldo: function () { return get('/api/respaldo'); },
    restaurar: function (paquete, modo) { return post('/api/restaurar', { paquete: paquete, modo: modo }); },
    reiniciar: function () { return post('/api/reiniciar', { confirmar: true }); },

    /* --- alta/edición de catálogos --- */
    crearCategoria: function (c) { return post('/api/categorias', c); },
    actualizarCategoria: function (id, c) { return put('/api/categorias/' + id, c); },
    eliminarCategoria: function (id) { return del('/api/categorias/' + id); },
    crearCuenta: function (c) { return post('/api/cuentas', c); },
    actualizarCuenta: function (id, c) { return put('/api/cuentas/' + id, c); },
    eliminarCuenta: function (id) { return del('/api/cuentas/' + id); }
  };

  App.api = api;

  /* Reintento automático cuando el navegador recupera la conexión. */
  global.addEventListener('online', function () {
    verificar().then(function (e) {
      if (e.disponible) { sincronizar(); }
    });
  });
})(window);
