/* ============================================================================
 * js/core/state.js — estado global, colecciones y datos iniciales
 * ---------------------------------------------------------------------------
 * Única fuente de verdad de la aplicación. Toda modificación pasa por aquí y
 * se persiste de inmediato en localStorage (autoguardado, criterio general de
 * aceptación: «los datos persisten al cerrar y volver a abrir la aplicación»).
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;

  var VERSION_ESQUEMA = 1;

  /* ------------------------------------------------------- datos por defecto */
  function categoriasIniciales() {
    return [
      { id: 'cat_alimentacion', nombre: 'Alimentación', color: '#1E88E5', icono: '🍽', tipo: 'gasto', predefinida: true, oculta: false },
      { id: 'cat_transporte', nombre: 'Transporte', color: '#2E9E6B', icono: '🚌', tipo: 'gasto', predefinida: true, oculta: false },
      { id: 'cat_entretenimiento', nombre: 'Entretenimiento', color: '#E0A030', icono: '🎬', tipo: 'gasto', predefinida: true, oculta: false },
      { id: 'cat_servicios', nombre: 'Servicios', color: '#7B4FB5', icono: '💡', tipo: 'gasto', predefinida: true, oculta: false },
      { id: 'cat_otros', nombre: 'Otros', color: '#C2662F', icono: '📦', tipo: 'gasto', predefinida: true, oculta: false },
      { id: 'cat_salario', nombre: 'Salario', color: '#0F8B8D', icono: '💼', tipo: 'ingreso', predefinida: true, oculta: false },
      { id: 'cat_beca', nombre: 'Beca', color: '#3F7CAC', icono: '🎓', tipo: 'ingreso', predefinida: true, oculta: false },
      { id: 'cat_ventas', nombre: 'Ventas', color: '#8E44AD', icono: '🏷', tipo: 'ingreso', predefinida: true, oculta: false },
      { id: 'cat_otros_ing', nombre: 'Otros ingresos', color: '#5C6BC0', icono: '➕', tipo: 'ingreso', predefinida: true, oculta: false }
    ];
  }

  function cuentasIniciales() {
    return [
      { id: 'cta_efectivo', nombre: 'Efectivo', tipo: 'efectivo', saldoInicial: 1200, color: '#2E9E6B' },
      { id: 'cta_debito', nombre: 'Débito', tipo: 'debito', saldoInicial: 2500, color: '#1E88E5' },
      { id: 'cta_ahorro', nombre: 'Ahorro', tipo: 'ahorro', saldoInicial: 6000, color: '#7B4FB5' }
    ];
  }

  /** Reglas del motor de análisis (RF-20 y RF-22). Editables desde Ajustes. */
  function reglasIniciales() {
    return {
      umbralAviso: 80,          // porcentaje que dispara la advertencia
      umbralLimite: 100,        // porcentaje que dispara la alerta de límite superado
      gastoHormigaMonto: 150,   // monto máximo para considerar un gasto «hormiga»
      gastoHormigaMinimo: 4,    // cantidad mínima de gastos hormiga para avisar
      tendenciaSemanas: 3,      // semanas consecutivas al alza
      tendenciaPorcentaje: 15,  // % de incremento que se considera tendencia
      diasParaProyeccion: 5     // días mínimos transcurridos para proyectar
    };
  }

  function estadoInicial() {
    return {
      meta: {
        version: VERSION_ESQUEMA,
        creado: new Date().toISOString(),
        actualizado: new Date().toISOString(),
        app: 'Control de Gastos con Análisis Inteligente',
        equipo: 'Equipo 1 — Los Inges'
      },
      ajustes: {
        usuario: '',
        simbolo: '$',
        decimales: 2,
        idioma: 'es',
        tema: 'claro',
        presupuestoGlobal: 0,
        pinActivo: false,
        pinHash: null,
        bloqueoInactividad: 5,        // minutos; 0 = desactivado
        periodoInicio: U.periodoActual(),
        notificacionesActivas: false,
        recordatorioHora: '21:00',
        recordatorioActivo: false,
        reglas: reglasIniciales()
      },
      categorias: categoriasIniciales(),
      cuentas: cuentasIniciales(),
      movimientos: [],
      recurrentes: [],
      metas: [],
      aportes: [],
      presupuestos: [],
      notificados: {},
      logros: { diasConsecutivos: 0, ultimoRegistro: null, alcanzados: [] },
      log: []
    };
  }

  /* --------------------------------------------------------------- colección */
  /**
   * Colección CRUD genérica sobre un arreglo del estado (RF-03).
   * @param {string} nombre clave dentro del estado
   * @param {function} [normalizar] ajusta el registro antes de guardarlo
   */
  /**
   * Colección CRUD genérica sobre un arreglo del estado (RF-03).
   *
   * El estado local es la copia de trabajo (permite que la interfaz sea
   * instantánea y funcione sin conexión) y, en paralelo, cada operación se
   * envía a la API para que quede guardada en SQL Server. Si no hay conexión,
   * la operación se encola y se reintenta al recuperarla.
   *
   * @param {string} nombre clave dentro del estado
   * @param {function} [normalizar] ajusta el registro antes de guardarlo
   */
  function coleccion(nombre, normalizar) {
    /** Envía la operación al servidor (o la encola si no hay conexión). */
    function sincronizar(op) {
      if (!App.api) { return Promise.resolve({ ok: false, sinApi: true }); }
      return App.api.ejecutar(op).catch(function (e) {
        console.warn('[state] No se pudo sincronizar ' + nombre + ':', e.message);
        return { ok: false, error: e.message };
      });
    }

    function rutaCrear(n) {
      if (nombre === 'categorias') { return '/api/categorias'; }
      if (nombre === 'cuentas') { return '/api/cuentas'; }
      if (nombre === 'recurrentes') { return '/api/recurrentes'; }
      if (nombre === 'metas') { return '/api/metas'; }
      if (nombre === 'aportes') { return n && n.metaId ? '/api/metas/' + n.metaId + '/aportes' : null; }
      return '/api/movimientos';
    }

    function rutaItem(id) {
      if (nombre === 'categorias') { return '/api/categorias/' + id; }
      if (nombre === 'cuentas') { return '/api/cuentas/' + id; }
      if (nombre === 'recurrentes') { return '/api/recurrentes/' + id; }
      if (nombre === 'metas') { return '/api/metas/' + id; }
      if (nombre === 'aportes') { return '/api/aportes/' + id; }
      return '/api/movimientos/' + id;
    }

    /** Deja el registro con la forma que espera la API. */
    function paraApi(n) {
      var limpio = Object.assign({}, n);
      delete limpio.nombreCategoria;
      delete limpio.colorCategoria;
      delete limpio.nombreCuenta;
      delete limpio.actualizado;
      delete limpio.acumulado;
      delete limpio.avance;
      delete limpio.restante;
      return limpio;
    }

    /** Índice de un registro comparando el id sin distinguir mayúsculas. */
    function indiceDe(id) {
      var buscado = String(id || '').toLowerCase();
      var lista = datos[nombre] || [];
      for (var i = 0; i < lista.length; i++) {
        if (String(lista[i].id || '').toLowerCase() === buscado) { return i; }
      }
      return -1;
    }

    return {
      nombre: nombre,

      todos: function () { return datos[nombre] || []; },

      porId: function (id) {
        var i = indiceDe(id);
        return i === -1 ? null : datos[nombre][i];
      },

      /** Índice interno (útil para otras partes de la aplicación). */
      indice: indiceDe,

      filtrar: function (fn) { return (datos[nombre] || []).filter(fn); },

      contar: function (fn) { return fn ? this.filtrar(fn).length : (datos[nombre] || []).length; },

      crear: function (registro) {
        var nuevo = Object.assign({}, registro);
        nuevo.id = nuevo.id || U.uuid();
        nuevo.creado = new Date().toISOString();
        nuevo.actualizado = nuevo.creado;
        if (normalizar) { nuevo = normalizar(nuevo); }
        datos[nombre].push(nuevo);
        guardar('crear:' + nombre);

        // Envío al servidor; cuando responde se adopta su versión (por si el
        // servidor normaliza algún campo).
        var ruta = rutaCrear(nuevo);
        if (ruta) {
          sincronizar({
            metodo: 'POST', ruta: ruta, cuerpo: paraApi(nuevo),
            entidad: nombre, idLocal: nuevo.id
          }).then(function (res) {
            if (!res || !res.datos || res.encolado) { return; }
            // SQL Server devuelve el GUID en mayúsculas: se localiza el registro
            // sin distinguir mayúsculas y se adopta la versión del servidor.
            var i = indiceDe(nuevo.id);
            if (i !== -1) {
              datos[nombre][i] = Object.assign({}, datos[nombre][i], res.datos);
              App.storage.escribir(App.storage.CLAVE, datos);
            }
          });
        }
        return nuevo;
      },

      /** Inserta varios registros de una sola vez (importación, recurrencias). */
      crearVarios: function (registros) {
        var creados = registros.map(function (r) {
          var n = Object.assign({}, r);
          n.id = n.id || U.uuid();
          n.creado = n.creado || new Date().toISOString();
          n.actualizado = n.creado;
          return normalizar ? normalizar(n) : n;
        });
        datos[nombre] = datos[nombre].concat(creados);
        guardar('crearVarios:' + nombre);
        creados.forEach(function (n) {
          var ruta = rutaCrear(n);
          if (ruta) {
            sincronizar({
              metodo: 'POST', ruta: ruta, cuerpo: paraApi(n),
              entidad: nombre, idLocal: n.id
            });
          }
        });
        return creados;
      },

      actualizar: function (id, cambios) {
        var i = indiceDe(id);
        if (i === -1) { return null; }
        // El identificador real puede venir en mayúsculas desde SQL Server: se
        // conserva el del registro almacenado para no romper la referencia.
        var idReal = datos[nombre][i].id;
        var actualizado = Object.assign({}, datos[nombre][i], cambios, {
          id: idReal,
          actualizado: new Date().toISOString()
        });
        datos[nombre][i] = normalizar ? normalizar(actualizado) : actualizado;
        guardar('actualizar:' + nombre);
        sincronizar({
          metodo: 'PUT', ruta: rutaItem(idReal), cuerpo: paraApi(datos[nombre][i]),
          entidad: nombre, idLocal: idReal
        });
        return datos[nombre][i];
      },

      eliminar: function (id) {
        var i = indiceDe(id);
        if (i === -1) { return false; }
        var idReal = datos[nombre][i].id;
        datos[nombre].splice(i, 1);
        guardar('eliminar:' + nombre);
        sincronizar({ metodo: 'DELETE', ruta: rutaItem(idReal), entidad: nombre, idLocal: idReal });
        return true;
      },

      reemplazarTodo: function (arreglo) {
        datos[nombre] = arreglo || [];
        guardar('reemplazar:' + nombre);
      }
    };
  }

  /* ------------------------------------------------------------------ estado */
  var datos = null;
  var escuchas = [];
  var silenciar = false;

  /**
   * Trae el estado desde el servidor (SQL Server) y lo fusiona con la copia
   * local. Se conserva lo que existe solo en este equipo (creado sin conexión y
   * todavía en la cola de sincronización) para no perder nada.
   * @returns {Promise<object>} resumen de la sincronización
   */
  function cargarDesdeServidor() {
    if (!App.api) { return Promise.resolve({ omitido: 'sin cliente de API' }); }

    return App.api.verificar().then(function (estado) {
      if (!estado.disponible) {
        return { disponible: false, error: estado.error };
      }

      return Promise.all([
        App.api.categorias({ incluirOcultas: true }),
        App.api.cuentas(),
        App.api.movimientos({ limite: 500, orden: 'fecha', desc: true }),
        App.api.metas(),
        App.api.recurrentes(),
        App.api.ajustes()
      ]).then(function (res) {
        var servidor = {
          categorias: res[0],
          cuentas: res[1],
          movimientos: res[2].filas || res[2],
          metas: res[3],
          recurrentes: res[4],
          ajustes: res[5]
        };

        // Aportes de cada meta (para el avance de RF-15)
        var promesasAportes = servidor.metas.map(function (m) {
          return App.api.aportesDeMeta(m.id).then(function (a) { return { metaId: m.id, aportes: a }; });
        });

        return Promise.all(promesasAportes).then(function (resultados) {
          var aportes = [];
          resultados.forEach(function (r) {
            (r.aportes || []).forEach(function (a) {
              aportes.push(Object.assign({}, a, { metaId: r.metaId }));
            });
          });
          servidor.aportes = aportes;

          // Presupuestos del periodo actual y del siguiente, para no perderlos
          return App.api.presupuestos(U.periodoActual()).then(function (p1) {
            return App.api.presupuestos(U.sumarMeses(U.periodoActual(), 1)).then(function (p2) {
              servidor.presupuestos = (p1 || []).concat(p2 || []);
              return fusionar(servidor);
            });
          });
        });
      });
    });
  }

  /** Fusiona lo que devolvió el servidor con la copia local. */
  function fusionar(servidor) {
    var resumen = {};
    var cola = App.api ? App.api.leerCola() : [];
    var idsEnCola = {};
    cola.forEach(function (op) { if (op.idLocal) { idsEnCola[op.idLocal] = true; } });

    ['categorias', 'cuentas', 'metas', 'recurrentes', 'aportes', 'presupuestos', 'movimientos']
      .forEach(function (clave) {
        var locales = datos[clave] || [];
        var delServidor = servidor[clave] || [];
        var porId = {};
        delServidor.forEach(function (r) { porId[r.id] = r; });

        // La base de datos manda: se reemplaza la copia local por lo que hay en
        // SQL Server. Solo se conserva lo local que aún no se ha enviado (está
        // en la cola) y que, por lo tanto, no puede existir todavía en el
        // servidor. Así se evitan duplicados si el identificador local no llegó
        // a coincidir con el de la base.
        var fusionado = delServidor.slice();

        locales.forEach(function (r) {
          if (porId[r.id]) { return; }          // ya está en la base
          if (idsEnCola[r.id]) {
            fusionado.push(r);                  // pendiente de enviar: se conserva
            porId[r.id] = r;                    // evita repetirlo
          }
        });

        var descartados = locales.filter(function (r) {
          return !porId[r.id];
        }).length;

        datos[clave] = fusionado;
        resumen[clave] = { servidor: delServidor.length, local: fusionado.length, descartados: descartados };
      });

    // Los ajustes del servidor completan los locales (el PIN vive en el servidor)
    if (servidor.ajustes) {
      var a = datos.ajustes;
      a.usuario = servidor.ajustes.nombre || a.usuario;
      a.simbolo = servidor.ajustes.simbolo || a.simbolo;
      a.decimales = servidor.ajustes.decimales !== undefined ? servidor.ajustes.decimales : a.decimales;
      a.bloqueoInactividad = servidor.ajustes.bloqueoMinutos !== undefined
        ? servidor.ajustes.bloqueoMinutos : a.bloqueoInactividad;
      a.notificacionesActivas = !!servidor.ajustes.notificacionesActivas;
      a.recordatorioActivo = !!servidor.ajustes.recordatorioActivo;
      a.recordatorioHora = servidor.ajustes.recordatorioHora || a.recordatorioHora;
      a.reglas = Object.assign({}, a.reglas, servidor.ajustes.reglas || {});
      // El PIN es del servidor: aquí solo se refleja si está activo
      a.pinActivo = !!servidor.ajustes.pinActivo;
    }

    datos.meta.ultimaSincronizacion = new Date().toISOString();
    App.storage.escribir(App.storage.CLAVE, datos);
    escuchas.forEach(function (fn) { try { fn('sincronizacion'); } catch (e) { /* escucha con error */ } });
    return resumen;
  }

  function cargar() {
    var guardado = App.storage.leer(App.storage.CLAVE);
    var base = estadoInicial();
    if (!guardado) {
      datos = base;
      return { nuevo: true };
    }
    // Fusión defensiva: si el esquema crece, se completan las claves faltantes.
    datos = Object.assign(base, guardado);
    datos.meta = Object.assign(base.meta, guardado.meta || {});
    datos.ajustes = Object.assign(base.ajustes, guardado.ajustes || {});
    datos.ajustes.reglas = Object.assign(reglasIniciales(), (guardado.ajustes || {}).reglas || {});
    datos.logros = Object.assign(base.logros, guardado.logros || {});
    datos.notificados = guardado.notificados || {};
    ['categorias', 'cuentas', 'movimientos', 'recurrentes', 'metas', 'aportes',
      'presupuestos', 'log'].forEach(function (k) {
        if (!Array.isArray(datos[k])) { datos[k] = base[k]; }
      });
    if (!datos.categorias.length) { datos.categorias = categoriasIniciales(); }
    if (!datos.cuentas.length) { datos.cuentas = cuentasIniciales(); }
    return { nuevo: false };
  }

  /** Persiste y avisa a quien esté escuchando. */
  function guardar(motivo) {
    if (silenciar) { return; }
    datos.meta.actualizado = new Date().toISOString();
    App.storage.escribir(App.storage.CLAVE, datos);
    if (motivo && motivo.indexOf('log') !== 0) { registrarLog(motivo); }
    escuchas.forEach(function (fn) {
      try { fn(motivo); } catch (e) { console.error('[state] escucha con error', e); }
    });
  }

  function registrarLog(accion) {
    datos.log.unshift({ fecha: new Date().toISOString(), accion: accion });
    if (datos.log.length > 300) { datos.log.length = 300; }
  }

  function alCambiar(fn) { escuchas.push(fn); }

  /* ------------------------------------------------------------- API pública */
  App.state = {
    cargar: cargar,
    guardar: guardar,
    alCambiar: alCambiar,
    bruto: function () { return datos; },
    reemplazar: function (nuevo) { datos = nuevo; guardar('reemplazo-total'); },

    /** Trae los datos del servidor (SQL Server) y fusiona con la copia local. */
    cargarDesdeServidor: cargarDesdeServidor,
    fusionar: fusionar,

    /** Empuja los ajustes locales al servidor. */
    guardarAjustesEnServidor: function () {
      if (!App.api) { return Promise.resolve(null); }
      var a = datos.ajustes;
      return App.api.guardarAjustes({
        nombre: a.usuario, simbolo: a.simbolo, decimales: a.decimales, idioma: a.idioma,
        bloqueoMinutos: a.bloqueoInactividad, notificacionesActivas: a.notificacionesActivas,
        recordatorioActivo: a.recordatorioActivo, recordatorioHora: a.recordatorioHora,
        reglas: a.reglas
      }).catch(function (e) {
        console.warn('[state] No se pudieron guardar los ajustes en el servidor:', e.message);
        return null;
      });
    },

    coleccion: function (nombre, normalizar) { return coleccion(nombre, normalizar); },

    /* --- atajos de lectura --- */
    ajustes: function () { return datos.ajustes; },
    categorias: function () { return datos.categorias; },
    cuentas: function () { return datos.cuentas; },
    logros: function () { return datos.logros; },
    notificados: function () { return datos.notificados; },
    meta: function () { return datos.meta; },

    categoria: function (id) {
      return datos.categorias.filter(function (c) { return c.id === id; })[0] || null;
    },

    nombreCategoria: function (id) {
      var c = App.state.categoria(id);
      return c ? c.nombre : 'Sin categoría';
    },

    colorCategoria: function (id) {
      var c = App.state.categoria(id);
      return c ? c.color : '#8A9BAE';
    },

    cuenta: function (id) {
      return datos.cuentas.filter(function (c) { return c.id === id; })[0] || null;
    },

    nombreCuenta: function (id) {
      var c = App.state.cuenta(id);
      return c ? c.nombre : 'Sin cuenta';
    },

    categoriasDe: function (tipo, incluirOcultas) {
      return datos.categorias.filter(function (c) {
        return c.tipo === tipo && (incluirOcultas || !c.oculta);
      });
    },

    /* --- presupuestos (RF-06, RF-12, RF-13) --- */
    /**
     * Busca un presupuesto del periodo. En la base de datos el presupuesto
     * global se guarda con CategoriaId NULL, por eso `categoriaId` nulo (o la
     * constante '__global__') representa el tope mensual total.
     */
    presupuesto: function (periodo, categoriaId) {
      var esGlobal = !categoriaId || categoriaId === '__global__';
      return datos.presupuestos.filter(function (p) {
        if (p.periodo !== periodo) { return false; }
        return esGlobal
          ? (!p.categoriaId || p.categoriaId === '__global__')
          : p.categoriaId === categoriaId;
      })[0] || null;
    },

    limiteCategoria: function (periodo, categoriaId) {
      var p = App.state.presupuesto(periodo, categoriaId);
      return p ? U.num(p.limite) : 0;
    },

    limiteGlobal: function (periodo) {
      var p = App.state.presupuesto(periodo, '__global__');
      return p ? U.num(p.limite) : 0;
    },

    definirPresupuesto: function (periodo, categoriaId, limite, copiado) {
      var esGlobal = !categoriaId || categoriaId === '__global__';
      var clave = esGlobal ? null : categoriaId;   // NULL en la base = tope global
      var existente = App.state.presupuesto(periodo, clave);
      if (existente) {
        return App.presupuestos.actualizar(existente.id, { limite: U.num(limite), copiado: !!copiado });
      }
      var nuevo = App.presupuestos.crear({
        periodo: periodo, categoriaId: clave, limite: U.num(limite), copiado: !!copiado
      });
      // El servidor decide el id definitivo del presupuesto
      if (App.api) {
        App.api.definirPresupuesto({ periodo: periodo, categoriaId: clave, limite: U.num(limite) })
          .then(function (guardado) {
            if (guardado && guardado.id) {
              var i = datos.presupuestos.map(function (p) { return p.id; }).indexOf(nuevo.id);
              if (i !== -1) { datos.presupuestos[i] = Object.assign({}, datos.presupuestos[i], guardado); }
              App.storage.escribir(App.storage.CLAVE, datos);
            }
          })
          .catch(function () { /* queda encolado por el cliente de API */ });
      }
      return nuevo;
    },

    /** RF-13: copia el presupuesto de un periodo anterior al periodo indicado. */
    copiarPresupuesto: function (desde, hacia, sobrescribir) {
      var origen = datos.presupuestos.filter(function (p) { return p.periodo === desde; });
      if (!origen.length) { return 0; }
      var copiados = 0;
      origen.forEach(function (p) {
        var actual = App.state.presupuesto(hacia, p.categoriaId);
        if (actual && !sobrescribir) { return; }
        App.state.definirPresupuesto(hacia, p.categoriaId, p.limite, true);
        copiados++;
      });
      return copiados;
    },

    /* --- movimientos y aportes --- */
    movimientosDe: function (periodo) {
      return datos.movimientos.filter(function (m) { return m.periodo === periodo; });
    },

    /** Aportes de una meta con el movimiento asociado, ordenados por fecha. */
    aportesDeMeta: function (metaId) {
      return U.ordenar(datos.aportes.filter(function (a) { return a.metaId === metaId; }), 'fecha');
    },

    totalAportado: function (metaId) {
      return U.suma(App.state.aportesDeMeta(metaId), function (a) { return a.monto; });
    },

    logrosActualizar: function (fechaISO) {
      var l = datos.logros;
      if (l.ultimoRegistro === fechaISO) { return; }
      var ayer = U.sumarDias(fechaISO, -1);
      l.diasConsecutivos = (l.ultimoRegistro === ayer) ? (l.diasConsecutivos + 1) : 1;
      l.ultimoRegistro = fechaISO;
      guardar('logros');
    },

    notificado: function (clave) { return !!datos.notificados[clave]; },

    marcarNotificado: function (clave) {
      datos.notificados[clave] = new Date().toISOString();
      guardar('notificado');
    },

    limpiarNotificados: function () {
      datos.notificados = {};
      guardar('notificados-limpios');
    },

    /* --- respaldo (RNF-09, RNF-10) --- */
    exportarJSON: function () {
      return JSON.stringify({
        app: 'Control de Gastos con Análisis Inteligente',
        version: VERSION_ESQUEMA,
        exportado: new Date().toISOString(),
        datos: datos
      }, null, 2);
    },

    /** Restaura un respaldo sin duplicar movimientos (comparación por id). */
    importarJSON: function (texto, modo) {
      var paquete = JSON.parse(texto);
      var nuevo = paquete.datos || paquete;
      if (!nuevo || !Array.isArray(nuevo.movimientos)) {
        throw new Error('El archivo no tiene el formato de respaldo de la aplicación.');
      }
      if (modo === 'reemplazar') {
        datos = Object.assign(estadoInicial(), nuevo);
        guardar('restauracion-total');
        return { modo: 'reemplazar', movimientos: datos.movimientos.length };
      }
      // modo 'combinar': agrega solo lo que no existe por id
      var agregados = 0, repetidos = 0;
      ['categorias', 'cuentas', 'movimientos', 'recurrentes', 'metas', 'aportes', 'presupuestos']
        .forEach(function (clave) {
          var existentes = {};
          (datos[clave] || []).forEach(function (r) { existentes[r.id] = true; });
          (nuevo[clave] || []).forEach(function (r) {
            if (existentes[r.id]) { repetidos++; return; }
            datos[clave].push(r);
            agregados++;
          });
        });
      guardar('restauracion-combinada');
      return { modo: 'combinar', agregados: agregados, repetidos: repetidos };
    },

    reiniciar: function () {
      datos = estadoInicial();
      guardar('reinicio');
    },

    silenciar: function (valor) { silenciar = !!valor; },

    /* --- datos de demostración --- */
    sembrarDemo: function (forzar) {
      if (datos.movimientos.length && !forzar) { return { movimientos: 0 }; }
      var hoy = U.hoyISO();
      var periodo = U.periodoActual();
      var anterior = U.sumarMeses(periodo, -1);
      var previo = U.sumarMeses(periodo, -2);
      var reg = [];

      // Los ejemplos se distribuyen desde el día 1 hasta HOY, para que la
      // proyección de cierre de mes y los promedios sean realistas.
      var diaHoy = Number(hoy.slice(8, 10));
      function dia(n) { return Math.max(1, Math.min(n, diaHoy)); }

      function mov(periodoDestino, numeroDia, tipo, categoriaId, monto, descripcion, cuenta) {
        var iso = periodoDestino + '-' + U.pad(Math.min(numeroDia, U.diasDelMes(periodoDestino)));
        reg.push({
          tipo: tipo, fecha: iso, periodo: periodoDestino, monto: U.redondear(monto),
          categoriaId: categoriaId, cuentaId: cuenta || 'cta_debito',
          descripcion: descripcion, recurrenteId: null,
          origen: 'demo', creado: new Date().toISOString()
        });
      }

      // --- mes actual: ingresos fijos + gastos hasta hoy
      mov(periodo, 1, 'ingreso', 'cat_salario', 10500, 'Salario mensual', 'cta_debito');
      mov(periodo, 1, 'ingreso', 'cat_beca', 4500, 'Beca mensual', 'cta_efectivo');
      mov(periodo, 1, 'gasto', 'cat_servicios', 1800, 'Renta del departamento', 'cta_debito');
      mov(periodo, dia(2), 'gasto', 'cat_alimentacion', 780, 'Despensa semanal', 'cta_debito');
      mov(periodo, dia(3), 'gasto', 'cat_transporte', 450, 'Gasolina', 'cta_efectivo');
      mov(periodo, dia(4), 'gasto', 'cat_entretenimiento', 220, 'Cine y cena', 'cta_efectivo');
      mov(periodo, dia(4), 'gasto', 'cat_alimentacion', 180, 'Café y antojos', 'cta_efectivo');
      mov(periodo, dia(5), 'gasto', 'cat_servicios', 380, 'Internet', 'cta_debito');
      mov(periodo, dia(6), 'gasto', 'cat_entretenimiento', 260, 'Streaming y videojuego', 'cta_debito');
      mov(periodo, dia(6), 'gasto', 'cat_alimentacion', 320, 'Súper de la semana', 'cta_debito');
      mov(periodo, dia(7), 'gasto', 'cat_transporte', 180, 'Pasajes', 'cta_efectivo');
      mov(periodo, dia(7), 'gasto', 'cat_alimentacion', 95, 'Comida en la calle', 'cta_efectivo');
      mov(periodo, dia(8), 'gasto', 'cat_otros', 240, 'Regalo de cumpleaños', 'cta_debito');
      mov(periodo, dia(8), 'gasto', 'cat_alimentacion', 110, 'Antojo nocturno', 'cta_efectivo');
      mov(periodo, dia(9), 'gasto', 'cat_entretenimiento', 190, 'Salida con amigos', 'cta_efectivo');

      // --- mes anterior
      mov(anterior, 1, 'ingreso', 'cat_salario', 10500, 'Salario mensual', 'cta_debito');
      mov(anterior, 1, 'ingreso', 'cat_beca', 4500, 'Beca mensual', 'cta_efectivo');
      mov(anterior, 1, 'gasto', 'cat_servicios', 1800, 'Renta del departamento', 'cta_debito');
      mov(anterior, 3, 'gasto', 'cat_alimentacion', 3100, 'Despensa del mes', 'cta_debito');
      mov(anterior, 6, 'gasto', 'cat_transporte', 1450, 'Gasolina y pasajes', 'cta_efectivo');
      mov(anterior, 9, 'gasto', 'cat_entretenimiento', 980, 'Salidas y streaming', 'cta_debito');
      mov(anterior, 12, 'gasto', 'cat_servicios', 420, 'Internet', 'cta_debito');
      mov(anterior, 15, 'gasto', 'cat_otros', 300, 'Imprevisto', 'cta_efectivo');

      // mes previo
      mov(previo, 2, 'ingreso', 'cat_beca', 4500, 'Beca mensual', 'cta_debito');
      mov(previo, 2, 'gasto', 'cat_servicios', 2100, 'Renta del departamento', 'cta_debito');
      mov(previo, 5, 'gasto', 'cat_alimentacion', 2950, 'Despensa del mes', 'cta_debito');
      mov(previo, 8, 'gasto', 'cat_transporte', 1300, 'Transporte', 'cta_efectivo');
      mov(previo, 11, 'gasto', 'cat_entretenimiento', 1400, 'Entretenimiento', 'cta_debito');

      var creados = App.movimientos.crearVarios(reg);

      // metas de ahorro (RF-14 y RF-15)
      if (!datos.metas.length) {
        var m1 = App.metas.crear({
          nombre: 'Fondo de emergencia', objetivo: 5000, fechaLimite: U.sumarMeses(periodo, 2) + '-15',
          color: '#2E9E6B', creada: hoy
        });
        var m2 = App.metas.crear({
          nombre: 'Viaje de fin de curso', objetivo: 4000, fechaLimite: U.sumarMeses(periodo, 8) + '-30',
          color: '#1E88E5', creada: hoy
        });
        App.aportes.crearVarios([
          { metaId: m1.id, fecha: U.sumarMeses(periodo, -1) + '-10', monto: 2000, cuentaId: 'cta_ahorro' },
          { metaId: m1.id, fecha: periodo + '-05', monto: 1200, cuentaId: 'cta_ahorro' },
          { metaId: m2.id, fecha: periodo + '-06', monto: 1150, cuentaId: 'cta_ahorro' }
        ]);
      }

      // presupuestos (RF-06 y RF-12)
      App.state.definirPresupuesto(periodo, '__global__', 12000);
      App.state.definirPresupuesto(periodo, 'cat_alimentacion', 5000);
      App.state.definirPresupuesto(periodo, 'cat_transporte', 2500);
      App.state.definirPresupuesto(periodo, 'cat_entretenimiento', 1500);
      App.state.definirPresupuesto(periodo, 'cat_servicios', 3000);
      App.state.definirPresupuesto(periodo, 'cat_otros', 1000);
      // movimientos recurrentes (RF-16). Se usan conceptos que no duplican los
      // movimientos cargados arriba, para que el ejemplo sea coherente.
      if (!datos.recurrentes.length) {
        App.recurrentes.crear({
          nombre: 'Renta del departamento', tipo: 'gasto', monto: 1800,
          categoriaId: 'cat_servicios', cuentaId: 'cta_debito',
          frecuencia: 'mensual', dia: 1, activo: false, proxima: periodo + '-01'
        });
        App.recurrentes.crear({
          nombre: 'Internet', tipo: 'gasto', monto: 380,
          categoriaId: 'cat_servicios', cuentaId: 'cta_debito',
          frecuencia: 'mensual', dia: 5, activo: false, proxima: periodo + '-05'
        });
        App.recurrentes.crear({
          nombre: 'Suscripción de música', tipo: 'gasto', monto: 129,
          categoriaId: 'cat_entretenimiento', cuentaId: 'cta_debito',
          frecuencia: 'mensual', dia: 20, activo: true,
          proxima: periodo + '-20'
        });
        App.recurrentes.crear({
          nombre: 'Beca mensual', tipo: 'ingreso', monto: 4500,
          categoriaId: 'cat_beca', cuentaId: 'cta_debito',
          frecuencia: 'mensual', dia: 1, activo: false, proxima: periodo + '-01'
        });
      }

      App.state.ajustes().usuario = App.state.ajustes().usuario || 'Rafael';
      guardar('demo');
      return { movimientos: creados.length, metas: datos.metas.length };
    }
  };

  /* ------------------------------------------- colecciones expuestas con nombre */
  App.movimientos = coleccion('movimientos', function (m) {
    m.monto = Math.abs(U.num(m.monto));
    m.tipo = m.tipo === 'ingreso' ? 'ingreso' : 'gasto';
    m.fecha = m.fecha || U.hoyISO();
    m.periodo = U.periodoDe(m.fecha);
    m.descripcion = String(m.descripcion || '').trim() || (m.tipo === 'ingreso' ? 'Ingreso' : 'Gasto');
    if (m.tipo === 'gasto' && !m.categoriaId) { m.categoriaId = 'cat_otros'; }
    m.categoriaId = m.categoriaId || 'cat_otros_ing';
    m.cuentaId = m.cuentaId || 'cta_efectivo';
    m.recurrenteId = m.recurrenteId || null;
    return m;
  });

  App.categorias = coleccion('categorias', function (c) {
    c.nombre = String(c.nombre || '').trim();
    c.tipo = c.tipo === 'ingreso' ? 'ingreso' : 'gasto';
    c.color = c.color || '#6B8CAE';
    c.icono = c.icono || '•';
    c.oculta = !!c.oculta;
    return c;
  });

  App.cuentas = coleccion('cuentas', function (c) {
    c.nombre = String(c.nombre || '').trim();
    c.saldoInicial = U.num(c.saldoInicial);
    c.tipo = c.tipo || 'debito';
    c.color = c.color || '#1E88E5';
    return c;
  });

  App.recurrentes = coleccion('recurrentes', function (r) {
    r.nombre = String(r.nombre || '').trim();
    r.monto = Math.abs(U.num(r.monto));
    r.tipo = r.tipo === 'ingreso' ? 'ingreso' : 'gasto';
    r.frecuencia = r.frecuencia || 'mensual';
    r.dia = Math.max(1, Math.min(28, parseInt(r.dia, 10) || 1));
    r.activo = r.activo !== false;
    return r;
  });

  App.metas = coleccion('metas', function (m) {
    m.nombre = String(m.nombre || '').trim();
    m.objetivo = Math.abs(U.num(m.objetivo));
    m.color = m.color || '#2E9E6B';
    return m;
  });

  App.aportes = coleccion('aportes', function (a) {
    a.monto = Math.abs(U.num(a.monto));
    a.fecha = a.fecha || U.hoyISO();
    a.periodo = U.periodoDe(a.fecha);
    return a;
  });

  App.presupuestos = coleccion('presupuestos', function (p) {
    p.limite = Math.abs(U.num(p.limite));
    p.periodo = p.periodo || U.periodoActual();
    return p;
  });
})(window);
