/* ============================================================================
 * js/views/budget.js — presupuestos, límites y alertas
 * ---------------------------------------------------------------------------
 * RF-06 definición de presupuesto por categoría · RF-07 alerta visual de
 * límite · RF-12 presupuesto global mensual · RF-13 copia de presupuesto
 * entre meses · RF-25 personalización de categorías.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;
  var UI = App.ui;
  var A = App.analytics;

  var periodo = U.periodoActual();

  function montar(contenedor) {
    contenedor.innerHTML = '';
    var nodo = render();
    contenedor.appendChild(nodo);
    setTimeout(function () { pintar(nodo); }, 0);
    return nodo;
  }

  function render() {
    var vista = U.crear('div', { class: 'vista vista--presupuesto' });
    var estado = A.estadoPresupuestos(periodo);
    var t = A.totalesPeriodo(periodo);

    vista.appendChild(U.crear('section', { class: 'barra-acciones' }, [
      U.crear('div', { class: 'barra-acciones__izq' }, [
        U.crear('h1', { class: 'titulo-vista', text: 'Presupuesto de ' + U.nombreMes(periodo) }),
        U.crear('p', { class: 'subtitulo-vista', text: 'Define límites por categoría y un tope mensual; el sistema avisa al 80 % y al 100 %.' })
      ]),
      U.crear('div', { class: 'barra-acciones__der' }, [
        selectorPeriodo(),
        boton('Copiar mes anterior', 'btn btn--fantasma', copiarAnterior, UI.icono('copiar')),
        boton('Nueva categoría', 'btn btn--primario', nuevaCategoria, UI.icono('mas'))
      ])
    ]));

    /* ------------------------------------------------- presupuesto global */
    var g = estado.global;
    var tarjetaGlobal = U.crear('section', { class: 'tarjeta tarjeta--global' });
    tarjetaGlobal.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Presupuesto global mensual' }),
      U.crear('span', { class: 'chip chip--' + g.estado, text: etiquetaEstado(g.estado) })
    ]));
    tarjetaGlobal.appendChild(U.crear('div', { class: 'global-cuerpo' }, [
      U.crear('div', { class: 'global-montos' }, [
        U.crear('div', {}, [
          U.crear('span', { class: 'etiqueta-mini', text: 'Límite mensual' }),
          U.crear('b', { class: 'monto-grande', text: g.limite ? U.moneda(g.limite) : 'Sin definir' }),
          U.crear('button', {
            class: 'btn btn--mini btn--fantasma', type: 'button', text: g.limite ? 'Modificar' : 'Definir',
            onclick: editarGlobal
          })
        ]),
        U.crear('div', {}, [
          U.crear('span', { class: 'etiqueta-mini', text: 'Gastado' }),
          U.crear('b', { class: 'monto-grande', text: U.moneda(g.gastado) }),
          U.crear('small', { text: g.consumo + ' % consumido' })
        ]),
        U.crear('div', {}, [
          U.crear('span', { class: 'etiqueta-mini', text: 'Disponible' }),
          U.crear('b', {
            class: 'monto-grande ' + (g.disponible !== null && g.disponible < 0 ? 'texto-peligro' : ''),
            text: g.disponible === null ? '—' : U.moneda(g.disponible)
          }),
          U.crear('small', { text: 'Ingresos del mes: ' + U.moneda(t.ingresos) })
        ])
      ]),
      g.limite ? UI.barraProgreso(g.consumo, colorEstado(g.estado)) : null
    ]));
    vista.appendChild(tarjetaGlobal);

    /* ---------------------------------------------- límites por categoría */
    var tarjetaCat = U.crear('section', { class: 'tarjeta' });
    tarjetaCat.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Límites por categoría' }),
      U.crear('span', { class: 'tarjeta__nota', text: estado.categorias.length + ' con límite' })
    ]));

    var tabla = U.crear('table', { class: 'tabla' });
    tabla.appendChild(U.crear('thead', {}, [U.crear('tr', {}, [
      U.crear('th', { text: 'Categoría' }),
      U.crear('th', { class: 'der', text: 'Gastado' }),
      U.crear('th', { class: 'der', text: 'Límite' }),
      U.crear('th', { class: 'der', text: 'Disponible' }),
      U.crear('th', { text: 'Consumo' }),
      U.crear('th', { text: 'Estado' }),
      U.crear('th', { text: 'Acciones' })
    ])]));
    var tbody = U.crear('tbody');

    // Se listan todas las categorías de gasto, tengan o no límite
    App.state.categoriasDe('gasto').forEach(function (c) {
      var fila = estado.categorias.filter(function (x) { return x.categoriaId === c.id; })[0];
      var gastado = fila ? fila.total : 0;
      var limite = fila ? fila.limite : 0;
      var consumo = fila ? fila.consumo : 0;
      var estadoFila = fila ? fila.estado : 'sin-limite';
      var tr = U.crear('tr');
      tr.appendChild(U.crear('td', {}, [
        U.crear('span', { class: 'punto-cat', style: 'background:' + c.color }),
        document.createTextNode(c.nombre),
        c.predefinida ? null : U.crear('small', { class: 'celda-nota', text: 'propia' })
      ]));
      tr.appendChild(U.crear('td', { class: 'der', text: U.moneda(gastado) }));
      tr.appendChild(U.crear('td', { class: 'der' }, [
        U.crear('input', {
          type: 'number', class: 'input-mini', min: '0', step: '0.01', value: limite ? U.aNumeroInput(limite) : '',
          placeholder: '0.00', 'aria-label': 'Límite de ' + c.nombre,
          onchange: function (e) {
            App.state.definirPresupuesto(periodo, c.id, U.num(e.target.value));
            App.notify.exito('Límite de ' + c.nombre + ' guardado en ' + U.moneda(U.num(e.target.value)) + '.');
            App.app.refrescar();
          }
        })
      ]));
      tr.appendChild(U.crear('td', {
        class: 'der', text: limite ? U.moneda(limite - gastado) : '—'
      }));
      tr.appendChild(U.crear('td', { class: 'celda-consumo' }, [
        limite ? UI.barraProgreso(consumo, colorEstado(estadoFila), { mini: true }) : U.crear('span', { text: '—' }),
        U.crear('small', { text: limite ? consumo + ' %' : '' })
      ]));
      tr.appendChild(U.crear('td', {}, [UI.chip(etiquetaEstado(estadoFila), null, 'chip--' + estadoFila)]));
      tr.appendChild(U.crear('td', { class: 'acciones-celda' }, [
        icono('editar', 'Editar categoría', function () { editarCategoria(c); }),
        limpiarLimiteBoton(c, limite)
      ]));
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    tarjetaCat.appendChild(U.crear('div', { class: 'tabla-scroll' }, [tabla]));
    tarjetaCat.appendChild(U.crear('p', { class: 'nota-pie', text: 'El consumo se recalcula en automático cada vez que registras, editas o eliminas un gasto.' }));
    vista.appendChild(tarjetaCat);

    /* --------------------------------------------- comparación por categoría */
    var periodos = U.ultimosPeriodos(4);
    var tarjetaComp = U.crear('section', { class: 'tarjeta' });
    tarjetaComp.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Comparación de los últimos 4 meses' }),
      UI.leyenda([{ etiqueta: 'Gastos por mes', color: '#1E88E5' }])
    ]));
    tarjetaComp.appendChild(U.crear('canvas', { class: 'canvas-barras canvas-barras--alto', id: 'barras-presupuesto' }));
    vista.appendChild(tarjetaComp);

    /* ------------------------------------------------- categorías propias */
    var tarjetaPropias = U.crear('section', { class: 'tarjeta' });
    tarjetaPropias.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Mis categorías' }),
      U.crear('button', {
        class: 'btn btn--mini btn--primario', type: 'button', text: '+ Nueva',
        onclick: nuevaCategoria
      })
    ]));
    var listaProp = U.crear('div', { class: 'categorias-grid' });
    App.state.categorias().forEach(function (c) {
      listaProp.appendChild(U.crear('div', { class: 'categoria-item' + (c.oculta ? ' categoria-item--oculta' : '') }, [
        U.crear('span', { class: 'categoria-item__icono', style: 'background:' + c.color, text: c.icono }),
        U.crear('span', { class: 'categoria-item__det' }, [
          U.crear('b', { text: c.nombre }),
          U.crear('small', { text: (c.tipo === 'ingreso' ? 'Ingreso' : 'Gasto') + (c.predefinida ? ' · predefinida' : ' · propia') + (c.oculta ? ' · oculta' : '') })
        ]),
        U.crear('span', { class: 'categoria-item__acc' }, [
          icono('editar', 'Renombrar', function () { editarCategoria(c); }),
          icono(c.oculta ? 'inicio' : 'cerrar', c.oculta ? 'Mostrar' : 'Ocultar', function () {
            App.categorias.actualizar(c.id, { oculta: !c.oculta });
            App.notify.info(c.oculta ? 'Categoría visible de nuevo.' : 'Categoría oculta. Sus movimientos se conservan.');
            App.app.refrescar();
          }),
          c.predefinida ? null : icono('borrar', 'Eliminar', function () {
            var usos = App.movimientos.contar(function (m) { return m.categoriaId === c.id; });
            if (usos) {
              App.notify.alerta('No se puede eliminar: tiene ' + usos + ' movimientos asociados. Puedes ocultarla.', 'aviso');
              return;
            }
            App.notify.confirmar('¿Eliminar la categoría «' + c.nombre + '»?', { peligro: true })
              .then(function (ok) {
                if (!ok) { return; }
                App.categorias.eliminar(c.id);
                App.notify.exito('Categoría eliminada.');
                App.app.refrescar();
              });
          })
        ])
      ]));
    });
    tarjetaPropias.appendChild(listaProp);
    vista.appendChild(tarjetaPropias);

    return vista;
  }

  /* --------------------------------------------------------------- helpers */
  function selectorPeriodo() {
    var sel = U.crear('select', { class: 'select-periodo', 'aria-label': 'Periodo del presupuesto' });
    U.ultimosPeriodos(6).reverse().forEach(function (p) {
      var o = U.crear('option', { value: p, text: U.nombreMes(p) });
      if (p === periodo) { o.selected = true; }
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      periodo = sel.value;
      App.app.refrescar();
    });
    return sel;
  }

  function etiquetaEstado(estado) {
    return {
      ok: 'Dentro del límite', aviso: 'Cerca del límite', excedido: 'Límite superado',
      'sin-limite': 'Sin límite definido'
    }[estado] || 'Sin límite';
  }

  function colorEstado(estado) {
    return { ok: '#2E9E6B', aviso: '#E0A030', excedido: '#D64545', 'sin-limite': '#8A9BAE' }[estado] || '#8A9BAE';
  }

  function boton(texto, clase, fn, iconoNodo) {
    return U.crear('button', { class: clase, type: 'button', onclick: fn }, [
      iconoNodo || null, document.createTextNode(texto)
    ]);
  }

  function icono(nombre, titulo, fn) {
    return U.crear('button', {
      class: 'btn-icono', type: 'button', title: titulo, 'aria-label': titulo, onclick: fn
    }, [UI.icono(nombre)]);
  }

  function limpiarLimiteBoton(categoria, limite) {
    return U.crear('button', {
      class: 'btn-icono' + (limite ? '' : ' btn-icono--inactivo'),
      type: 'button', title: 'Quitar límite', 'aria-label': 'Quitar límite', disabled: limite ? null : 'disabled',
      onclick: function () {
        var p = App.state.presupuesto(periodo, categoria.id);
        if (!p) { return; }
        App.presupuestos.eliminar(p.id);
        App.notify.info('Se quitó el límite de ' + categoria.nombre + '.');
        App.app.refrescar();
      }
    }, [UI.icono('borrar')]);
  }

  function editarGlobal() {
    var actual = App.state.limiteGlobal(periodo);
    var f = UI.formulario([
      {
        nombre: 'limite', etiqueta: 'Límite total de gasto para ' + U.nombreMes(periodo),
        tipo: 'number', min: '0', valor: actual ? U.aNumeroInput(actual) : '', requerido: true
      }
    ]);
    var m = UI.modal({
      titulo: 'Presupuesto global mensual', contenido: f.nodo,
      acciones: [
        U.crear('button', { class: 'btn btn--fantasma', type: 'button', text: 'Cancelar', onclick: function () { m.cerrar(); } }),
        U.crear('button', {
          class: 'btn btn--primario', type: 'button', text: 'Guardar',
          onclick: function () {
            var v = U.num(UI.valores(f.campos).limite);
            App.state.definirPresupuesto(periodo, A.GLOBAL, v);
            App.notify.exito('Presupuesto global de ' + U.nombreMes(periodo) + ': ' + U.moneda(v) + '.');
            m.cerrar();
            App.app.refrescar();
          }
        })
      ]
    });
  }

  function copiarAnterior() {
    var anterior = U.sumarMeses(periodo, -1);
    var origen = App.state.bruto().presupuestos.filter(function (p) { return p.periodo === anterior; });
    if (!origen.length) {
      App.notify.alerta('No hay presupuesto registrado en ' + U.nombreMes(anterior) + '.');
      return;
    }
    App.notify.confirmar(
      'Se copiarán ' + origen.length + ' límites de ' + U.nombreMes(anterior) +
      ' a ' + U.nombreMes(periodo) + '. Los límites existentes se conservarán.',
      { titulo: 'Copiar presupuesto', aceptar: 'Copiar' }
    ).then(function (ok) {
      if (!ok) { return; }
      var n = App.state.copiarPresupuesto(anterior, periodo, false);
      App.notify.exito('Se copiaron ' + n + ' límites desde ' + U.nombreMes(anterior) + '.');
      App.app.refrescar();
    });
  }

  function nuevaCategoria() {
    abrirModalCategoria(null);
  }

  function editarCategoria(c) {
    abrirModalCategoria(c);
  }

  function abrirModalCategoria(categoria) {
    var esEdicion = !!categoria;
    var f = UI.formulario([
      { nombre: 'nombre', etiqueta: 'Nombre de la categoría', tipo: 'text', requerido: true, valor: categoria ? categoria.nombre : '' },
      {
        nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', valor: categoria ? categoria.tipo : 'gasto',
        opciones: [{ valor: 'gasto', etiqueta: 'Gasto' }, { valor: 'ingreso', etiqueta: 'Ingreso' }]
      },
      { nombre: 'icono', etiqueta: 'Ícono (un emoji o símbolo)', tipo: 'text', valor: categoria ? categoria.icono : '🏷' },
      { nombre: 'color', etiqueta: 'Color', tipo: 'color', valor: categoria ? categoria.color : '#1E88E5' }
    ]);
    var m = UI.modal({
      titulo: esEdicion ? 'Editar categoría' : 'Nueva categoría',
      contenido: f.nodo,
      acciones: [
        U.crear('button', { class: 'btn btn--fantasma', type: 'button', text: 'Cancelar', onclick: function () { m.cerrar(); } }),
        U.crear('button', {
          class: 'btn btn--primario', type: 'button', text: esEdicion ? 'Guardar' : 'Crear',
          onclick: function () {
            var v = UI.valores(f.campos);
            if (!String(v.nombre).trim()) { App.notify.error('Escribe un nombre para la categoría.'); return; }
            var repetida = App.state.categorias().some(function (c) {
              return U.normalizar(c.nombre) === U.normalizar(v.nombre) && (!categoria || c.id !== categoria.id);
            });
            if (repetida) { App.notify.error('Ya existe una categoría con ese nombre.'); return; }
            if (esEdicion) {
              App.categorias.actualizar(categoria.id, {
                nombre: v.nombre, tipo: v.tipo, icono: v.icono, color: v.color
              });
              App.notify.exito('Categoría actualizada.');
            } else {
              App.categorias.crear({
                nombre: v.nombre, tipo: v.tipo, icono: v.icono, color: v.color,
                predefinida: false, oculta: false
              });
              App.notify.exito('Categoría creada.');
            }
            m.cerrar();
            App.app.refrescar();
          }
        })
      ]
    });
  }

  function pintar(nodo) {
    var canvas = nodo.querySelector('#barras-presupuesto');
    if (!canvas) { return; }
    var periodos = U.ultimosPeriodos(4);
    var serie = A.seriePeriodos(periodos);
    UI.barras(canvas, {
      etiquetas: serie.map(function (s) { return s.etiqueta; }),
      mostrarValores: true,
      series: [{ nombre: 'Gastos', color: '#1E88E5', valores: serie.map(function (s) { return s.gastos; }) }]
    });
  }

  App.views = App.views || {};
  App.views.presupuesto = {
    montar: montar, render: render,
    periodo: function (p) { if (p) { periodo = p; } return periodo; }
  };
})(window);
