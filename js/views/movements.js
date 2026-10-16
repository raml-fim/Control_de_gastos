/* ============================================================================
 * js/views/movements.js — historial, búsqueda, filtros y CRUD
 * ---------------------------------------------------------------------------
 * RF-01 registro de ingresos · RF-02 registro de gastos · RF-03 edición y
 * eliminación · RF-08 historial · RF-12 búsqueda y filtros avanzados ·
 * RF-18 exportación · RF-26 asignación de cuenta.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;
  var UI = App.ui;

  var filtros = {
    texto: '', tipo: 'todos', categoriaId: 'todas', cuentaId: 'todas',
    desde: '', hasta: '', montoMin: '', montoMax: '', periodo: ''
  };
  var tamanoPagina = 25;
  var pagina = 1;
  var orden = { campo: 'fecha', desc: true };

  function montar(contenedor) {
    contenedor.innerHTML = '';
    filtros.periodo = filtros.periodo || U.periodoActual();
    var nodo = render();
    contenedor.appendChild(nodo);
    return nodo;
  }

  function render() {
    var vista = U.crear('div', { class: 'vista vista--movimientos' });

    vista.appendChild(U.crear('section', { class: 'barra-acciones' }, [
      U.crear('div', { class: 'barra-acciones__izq' }, [
        U.crear('h1', { class: 'titulo-vista', text: 'Movimientos' }),
        U.crear('p', { class: 'subtitulo-vista', text: 'Registra, busca, filtra y corrige tus ingresos y gastos.' })
      ]),
      U.crear('div', { class: 'barra-acciones__der' }, [
        boton('Exportar CSV', 'btn btn--fantasma', function () { exportarCSV(); }, UI.icono('descargar')),
        boton('Nuevo gasto', 'btn btn--peligro', function () { abrirFormulario('gasto'); }, UI.icono('mas')),
        boton('Nuevo ingreso', 'btn btn--primario', function () { abrirFormulario('ingreso'); }, UI.icono('mas'))
      ])
    ]));

    /* ------------------------------------- recurrencias pendientes (RF-16) */
    var nPendientes = App.app.pendientesInfo(U.periodoActual());
    if (nPendientes > 0) {
      var pend = App.analytics.recurrenciasPendientes(U.periodoActual());
      vista.appendChild(U.crear('section', { class: 'tarjeta tarjeta--aviso' }, [
        U.crear('div', { class: 'fila-aviso' }, [
          U.crear('span', { class: 'fila-aviso__icono', text: '↻' }),
          U.crear('div', { class: 'fila-aviso__texto' }, [
            U.crear('b', { text: nPendientes + ' movimiento(s) recurrente(s) por registrar' }),
            U.crear('small', {
              text: 'Programados: ' + U.moneda(pend.gastos) + ' en gastos y ' +
                U.moneda(pend.ingresos) + ' en ingresos.'
            })
          ]),
          boton('Registrar ahora', 'btn btn--mini btn--primario', function () {
            var generados = App.app.registrarPendientes(U.periodoActual());
            App.notify.exito('Se registraron ' + generados.length + ' movimientos recurrentes.');
            App.app.refrescar();
          })
        ])
      ]));
    }

    /* ------------------------------------------------------------ filtros */
    var filtroNodo = U.crear('section', { class: 'tarjeta tarjeta--filtros' });
    var f = UI.formulario([
      { nombre: 'texto', etiqueta: 'Buscar', tipo: 'search', valor: filtros.texto, placeholder: 'Descripción, categoría o cuenta' },
      {
        nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', valor: filtros.tipo, opciones: [
          { valor: 'todos', etiqueta: 'Todos' },
          { valor: 'gasto', etiqueta: 'Solo gastos' },
          { valor: 'ingreso', etiqueta: 'Solo ingresos' }
        ]
      },
      {
        nombre: 'categoriaId', etiqueta: 'Categoría', tipo: 'select', valor: filtros.categoriaId,
        opciones: [{ valor: 'todas', etiqueta: 'Todas las categorías' }].concat(
          App.state.categorias().map(function (c) {
            return { valor: c.id, etiqueta: (c.tipo === 'ingreso' ? '↑ ' : '↓ ') + c.nombre };
          }))
      },
      {
        nombre: 'cuentaId', etiqueta: 'Cuenta', tipo: 'select', valor: filtros.cuentaId,
        opciones: [{ valor: 'todas', etiqueta: 'Todas las cuentas' }].concat(
          App.state.cuentas().map(function (c) { return { valor: c.id, etiqueta: c.nombre }; }))
      },
      { nombre: 'desde', etiqueta: 'Desde', tipo: 'date', valor: filtros.desde },
      { nombre: 'hasta', etiqueta: 'Hasta', tipo: 'date', valor: filtros.hasta },
      { nombre: 'montoMin', etiqueta: 'Monto mínimo', tipo: 'number', valor: filtros.montoMin, min: '0' },
      { nombre: 'montoMax', etiqueta: 'Monto máximo', tipo: 'number', valor: filtros.montoMax, min: '0' }
    ]);
    filtroNodo.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Filtros' }),
      U.crear('button', {
        class: 'btn btn--mini btn--fantasma', type: 'button', text: 'Limpiar',
        onclick: function () {
          filtros = { texto: '', tipo: 'todos', categoriaId: 'todas', cuentaId: 'todas', desde: '', hasta: '', montoMin: '', montoMax: '', periodo: '' };
          pagina = 1;
          montar(document.getElementById('contenido'));
        }
      })
    ]));
    filtroNodo.appendChild(f.nodo);
    filtroNodo.appendChild(U.crear('div', { class: 'chips-filtro' }, [
      chipPeriodo('Este mes', U.periodoActual()),
      chipPeriodo(U.nombreMesCorto(U.sumarMeses(U.periodoActual(), -1)), U.sumarMeses(U.periodoActual(), -1)),
      chipPeriodo('Últimos 3 meses', null, 3),
      chipPeriodo('Todo el historial', null, 0)
    ]));
    vista.appendChild(filtroNodo);

    // Los filtros se aplican al escribir o cambiar (RF-12)
    Object.keys(f.campos).forEach(function (k) {
      var el = f.campos[k];
      var evento = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
      el.addEventListener(evento, U.debounce(function () {
        filtros[k] = el.value;
        if (k === 'desde' || k === 'hasta' || k === 'montoMin' || k === 'montoMax') { filtros.periodo = ''; }
        pagina = 1;
        repintarTabla();
      }, 220));
    });

    /* ----------------------------------------------------------- resultados */
    var resultado = U.crear('section', { class: 'tarjeta tarjeta--tabla' });
    resultado.id = 'resultado-movimientos';
    vista.appendChild(resultado);

    setTimeout(repintarTabla, 0);
    return vista;
  }

  function chipPeriodo(etiqueta, periodo, meses) {
    return U.crear('button', {
      class: 'chip chip--boton' + (filtros.periodo === periodo && periodo ? ' chip--activo' : ''),
      type: 'button', text: etiqueta,
      onclick: function () {
        if (periodo) { filtros.periodo = periodo; filtros.desde = ''; filtros.hasta = ''; }
        else if (meses) {
          filtros.periodo = '';
          filtros.desde = U.ultimosPeriodos(meses)[0] + '-01';
          filtros.hasta = U.hoyISO();
        } else {
          filtros.periodo = ''; filtros.desde = ''; filtros.hasta = '';
        }
        pagina = 1;
        montar(document.getElementById('contenido'));
      }
    });
  }

  function repintarTabla() {
    var cont = document.getElementById('resultado-movimientos');
    if (!cont) { return; }
    cont.innerHTML = '';

    var lista = A_ordenar(App.analytics.filtrar(filtros));
    var totales = App.analytics.totales(lista);
    var totalPaginas = Math.max(1, Math.ceil(lista.length / tamanoPagina));
    if (pagina > totalPaginas) { pagina = totalPaginas; }
    var trozo = lista.slice((pagina - 1) * tamanoPagina, pagina * tamanoPagina);

    cont.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: lista.length + (lista.length === 1 ? ' movimiento' : ' movimientos') }),
      U.crear('div', { class: 'resumen-inline' }, [
        U.crear('span', { class: 'resumen-inline__pos', text: '+' + U.moneda(totales.ingresos) }),
        U.crear('span', { class: 'resumen-inline__neg', text: '−' + U.moneda(totales.gastos) }),
        U.crear('span', { class: 'resumen-inline__neto', text: 'Neto ' + U.moneda(totales.neto) })
      ])
    ]));

    if (!lista.length) {
      cont.appendChild(UI.vacio('Sin resultados', 'No hay movimientos que coincidan con los filtros aplicados.'));
      return;
    }

    var tabla = U.crear('table', { class: 'tabla' });
    var thead = U.crear('thead');
    var fila = U.crear('tr');
    [
      { campo: 'fecha', texto: 'Fecha' },
      { campo: 'descripcion', texto: 'Descripción' },
      { campo: 'categoriaId', texto: 'Categoría' },
      { campo: 'cuentaId', texto: 'Cuenta' },
      { campo: 'monto', texto: 'Monto' },
      { campo: null, texto: 'Acciones' }
    ].forEach(function (c) {
      var th = U.crear('th', { class: c.campo === 'monto' ? 'der' : null });
      if (c.campo) {
        th.appendChild(U.crear('button', {
          class: 'th-orden' + (orden.campo === c.campo ? ' th-orden--activo' : ''),
          type: 'button',
          text: c.texto + (orden.campo === c.campo ? (orden.desc ? ' ↓' : ' ↑') : ''),
          onclick: function () {
            if (orden.campo === c.campo) { orden.desc = !orden.desc; }
            else { orden = { campo: c.campo, desc: true }; }
            repintarTabla();
          }
        }));
      } else { th.textContent = c.texto; }
      fila.appendChild(th);
    });
    thead.appendChild(fila);
    tabla.appendChild(thead);

    var tbody = U.crear('tbody');
    trozo.forEach(function (m) {
      var esIngreso = m.tipo === 'ingreso';
      var tr = U.crear('tr', { class: esIngreso ? 'fila--ingreso' : 'fila--gasto' });
      tr.appendChild(U.crear('td', {}, [
        U.crear('b', { text: m.fecha }),
        U.crear('small', { class: 'celda-nota', text: U.DIAS[U.desdeISO(m.fecha).getDay()] })
      ]));
      tr.appendChild(U.crear('td', {}, [
        U.crear('b', { text: m.descripcion }),
        m.recurrenteId ? U.crear('small', { class: 'celda-nota', text: '↻ recurrente' }) : null
      ]));
      tr.appendChild(U.crear('td', {}, [
        U.crear('span', { class: 'punto-cat', style: 'background:' + App.state.colorCategoria(m.categoriaId) }),
        document.createTextNode(App.state.nombreCategoria(m.categoriaId))
      ]));
      tr.appendChild(U.crear('td', { text: App.state.nombreCuenta(m.cuentaId) }));
      tr.appendChild(U.crear('td', { class: 'der' }, [
        U.crear('b', {
          class: esIngreso ? 'mov__monto--pos' : 'mov__monto--neg',
          text: (esIngreso ? '+' : '−') + U.moneda(m.monto)
        })
      ]));
      tr.appendChild(U.crear('td', { class: 'acciones-celda' }, [
        botonIcono('editar', 'Editar', function () { abrirFormulario(m.tipo, m); }),
        botonIcono('borrar', 'Eliminar', function () { eliminar(m); }),
        botonIcono('copiar', 'Duplicar', function () {
          abrirFormulario(m.tipo, Object.assign({}, m, { id: null, fecha: U.hoyISO(), descripcion: m.descripcion }));
        })
      ]));
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    cont.appendChild(U.crear('div', { class: 'tabla-scroll' }, [tabla]));

    /* -------------------------------------------------------- paginación */
    if (totalPaginas > 1) {
      cont.appendChild(U.crear('div', { class: 'paginacion' }, [
        U.crear('button', {
          class: 'btn btn--mini btn--fantasma', type: 'button', text: '← Anterior',
          disabled: pagina === 1 ? 'disabled' : null,
          onclick: function () { pagina--; repintarTabla(); }
        }),
        U.crear('span', { class: 'paginacion__info', text: 'Página ' + pagina + ' de ' + totalPaginas }),
        U.crear('button', {
          class: 'btn btn--mini btn--fantasma', type: 'button', text: 'Siguiente →',
          disabled: pagina === totalPaginas ? 'disabled' : null,
          onclick: function () { pagina++; repintarTabla(); }
        })
      ]));
    }
  }

  function A_ordenar(lista) {
    return U.ordenar(lista, orden.campo === 'categoriaId' ? 'categoriaId' : orden.campo, orden.desc);
  }

  function boton(texto, clase, fn, iconoNodo) {
    return U.crear('button', { class: clase, type: 'button', onclick: fn }, [
      iconoNodo || null, document.createTextNode(texto)
    ]);
  }

  function botonIcono(nombre, titulo, fn) {
    return U.crear('button', {
      class: 'btn-icono', type: 'button', title: titulo, 'aria-label': titulo, onclick: fn
    }, [UI.icono(nombre)]);
  }

  /* ------------------------------------------------- formulario de movimiento */
  /**
   * Alta y edición de movimientos (RF-01, RF-02, RF-03).
   * @param {string} tipo 'ingreso' | 'gasto'
   * @param {object} [existente] movimiento a editar
   */
  function abrirFormulario(tipo, existente) {
    var esEdicion = !!(existente && existente.id);
    var tipoInicial = tipo || (existente ? existente.tipo : 'gasto');

    var f = UI.formulario([
      {
        nombre: 'tipo', etiqueta: 'Tipo de movimiento', tipo: 'select', valor: tipoInicial,
        opciones: [{ valor: 'gasto', etiqueta: 'Gasto (salida de dinero)' },
        { valor: 'ingreso', etiqueta: 'Ingreso (entrada de dinero)' }]
      },
      {
        nombre: 'monto', etiqueta: 'Monto', tipo: 'number', requerido: true, min: '0.01',
        valor: existente ? U.aNumeroInput(existente.monto) : '', ayuda: 'Debe ser mayor que cero.'
      },
      { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: existente ? existente.fecha : U.hoyISO() },
      { nombre: 'categoriaId', etiqueta: 'Categoría (obligatoria para gastos)', tipo: 'select', valor: existente ? existente.categoriaId : '' },
      {
        nombre: 'cuentaId', etiqueta: 'Cuenta', tipo: 'select',
        valor: existente ? existente.cuentaId : (App.state.cuentas()[1] || {}).id,
        opciones: App.state.cuentas().map(function (c) { return { valor: c.id, etiqueta: c.nombre }; })
      },
      {
        nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'text', requerido: true,
        valor: existente ? existente.descripcion : '', placeholder: 'Ej. Despensa de la semana'
      },
      {
        nombre: 'repetir', etiqueta: 'Marcar como movimiento recurrente', tipo: 'checkbox',
        valor: false, ayuda: 'Se registrará automáticamente según la frecuencia que elijas.'
      },
      { nombre: 'frecuencia', etiqueta: 'Frecuencia', tipo: 'select', valor: 'mensual',
        opciones: [{ valor: 'mensual', etiqueta: 'Mensual' }, { valor: 'quincenal', etiqueta: 'Quincenal' },
        { valor: 'semanal', etiqueta: 'Semanal' }] }
    ]);

    function actualizarCategorias() {
      var tipoActual = f.campos.tipo.value;
      var sel = f.campos.categoriaId;
      var previo = sel.value;
      U.limpiar(sel);
      App.state.categoriasDe(tipoActual).forEach(function (c) {
        var o = U.crear('option', { value: c.id, text: c.nombre });
        sel.appendChild(o);
      });
      if (previo && App.state.categoriasDe(tipoActual).some(function (c) { return c.id === previo; })) {
        sel.value = previo;
      }
      var esGasto = tipoActual === 'gasto';
      f.campos.categoriaId.closest('.campo').style.display = '';
      f.campos.categoriaId.closest('.campo').querySelector('.campo__etiqueta').textContent =
        esGasto ? 'Categoría (obligatoria)' : 'Categoría de origen';
    }
    f.campos.tipo.addEventListener('change', actualizarCategorias);
    actualizarCategorias();
    if (existente) { f.campos.categoriaId.value = existente.categoriaId; }

    var cajaRepetir = f.campos.repetir.closest('.campo');
    var cajaFrecuencia = f.campos.frecuencia.closest('.campo');
    cajaFrecuencia.style.display = 'none';
    f.campos.repetir.addEventListener('change', function () {
      cajaFrecuencia.style.display = f.campos.repetir.checked ? '' : 'none';
    });
    if (esEdicion) { cajaRepetir.style.display = 'none'; }

    var error = U.crear('p', { class: 'formulario__error' });
    var contenedor = U.crear('div', {}, [f.nodo, error]);

    var m = UI.modal({
      titulo: esEdicion ? 'Editar movimiento' : ('Nuevo ' + (tipoInicial === 'gasto' ? 'gasto' : 'ingreso')),
      contenido: contenedor,
      acciones: [
        U.crear('button', { class: 'btn btn--fantasma', type: 'button', text: 'Cancelar', onclick: function () { m.cerrar(); } }),
        U.crear('button', {
          class: 'btn btn--primario', type: 'button',
          text: esEdicion ? 'Guardar cambios' : 'Guardar',
          onclick: function () { guardar(); }
        })
      ]
    });

    function guardar() {
      var v = UI.valores(f.campos);
      var monto = U.num(v.monto);
      if (!(monto > 0)) {
        error.textContent = 'El monto debe ser un número mayor que cero.';
        f.campos.monto.focus();
        return;
      }
      if (v.tipo === 'gasto' && !v.categoriaId) {
        error.textContent = 'Selecciona una categoría: no se puede guardar un gasto sin categoría.';
        return;
      }
      if (!v.fecha) {
        error.textContent = 'Indica la fecha del movimiento.';
        return;
      }
      var datos = {
        tipo: v.tipo,
        monto: monto,
        fecha: v.fecha,
        periodo: U.periodoDe(v.fecha),
        categoriaId: v.categoriaId,
        cuentaId: v.cuentaId,
        descripcion: String(v.descripcion || '').trim() || (v.tipo === 'ingreso' ? 'Ingreso' : 'Gasto')
      };

      if (esEdicion) {
        App.movimientos.actualizar(existente.id, datos);
        App.notify.exito('Movimiento actualizado. El saldo y los resúmenes se recalcularon.');
      } else {
        App.movimientos.crear(datos);
        App.state.logrosActualizar(v.fecha);
        if (v.repetir) {
          App.recurrentes.crear({
            nombre: datos.descripcion, tipo: datos.tipo, monto: datos.monto,
            categoriaId: datos.categoriaId, cuentaId: datos.cuentaId,
            frecuencia: v.frecuencia, dia: Number(datos.fecha.slice(8, 10)),
            mes: Number(datos.fecha.slice(5, 7)), activo: true,
            proxima: U.sumarMeses(U.periodoDe(datos.fecha), 1) + '-' + datos.fecha.slice(8, 10)
          });
          App.notify.info('Se programó como movimiento recurrente ' + v.frecuencia + '.');
        }
        App.notify.exito('Movimiento registrado. El saldo se actualizó.');
      }
      m.cerrar();
      App.app.refrescar();
    }
  }

  function eliminar(m) {
    App.notify.confirmar(
      'Se eliminará «' + m.descripcion + '» del ' + m.fecha + ' por ' + U.moneda(m.monto) +
      '. El saldo y los resúmenes se recalcularán automáticamente.',
      { titulo: 'Eliminar movimiento', aceptar: 'Eliminar', peligro: true }
    ).then(function (ok) {
      if (!ok) { return; }
      App.movimientos.eliminar(m.id);
      App.notify.exito('Movimiento eliminado.');
      App.app.refrescar();
    });
  }

  /* ------------------------------------------------------- exportación CSV */
  function exportarCSV() {
    var lista = App.analytics.filtrar(filtros);
    if (!lista.length) { App.notify.alerta('No hay movimientos que exportar con los filtros actuales.'); return; }
    var cabecera = ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cuenta', 'Monto', 'Recurrente'];
    var filas = lista.map(function (m) {
      return [
        m.fecha, m.tipo, comilla(m.descripcion), App.state.nombreCategoria(m.categoriaId),
        App.state.nombreCuenta(m.cuentaId), U.num(m.monto).toFixed(2),
        m.recurrenteId ? 'Sí' : 'No'
      ].join(',');
    });
    var contenido = '\ufeff' + cabecera.join(',') + '\n' + filas.join('\n');
    var nombre = 'movimientos_' + (filtros.periodo || 'historial') + '_' + U.hoyISO() + '.csv';
    U.descargar(nombre, contenido, 'text/csv;charset=utf-8');
    App.notify.exito('Se exportaron ' + lista.length + ' movimientos a CSV.');
  }

  function comilla(texto) {
    var t = String(texto || '').replace(/"/g, '""');
    return '"' + t + '"';
  }

  App.views = App.views || {};
  App.views.movimientos = {
    montar: montar, render: render,
    abrirFormulario: abrirFormulario,
    exportarCSV: exportarCSV,
    filtros: function () { return filtros; }
  };
})(window);
