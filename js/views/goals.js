/* ============================================================================
 * js/views/goals.js — metas de ahorro y cuentas
 * ---------------------------------------------------------------------------
 * RF-14 creación de metas · RF-15 aportes y progreso · RF-26 múltiples cuentas
 * con saldo por cuenta y transferencias entre cuentas.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;
  var UI = App.ui;
  var A = App.analytics;

  function montar(contenedor) {
    contenedor.innerHTML = '';
    var nodo = render();
    contenedor.appendChild(nodo);
    return nodo;
  }

  function render() {
    var vista = U.crear('div', { class: 'vista vista--metas' });
    var metas = App.metas.todos();
    var totalAhorrado = U.suma(metas, function (m) { return App.state.totalAportado(m.id); });
    var totalObjetivo = U.suma(metas, function (m) { return m.objetivo; });

    vista.appendChild(U.crear('section', { class: 'barra-acciones' }, [
      U.crear('div', { class: 'barra-acciones__izq' }, [
        U.crear('h1', { class: 'titulo-vista', text: 'Metas de ahorro y cuentas' }),
        U.crear('p', {
          class: 'subtitulo-vista',
          text: metas.length
            ? U.moneda(totalAhorrado) + ' ahorrados de ' + U.moneda(totalObjetivo) + ' en ' + metas.length + ' metas.'
            : 'Crea tu primera meta de ahorro con monto objetivo y fecha límite.'
        })
      ]),
      U.crear('div', { class: 'barra-acciones__der' }, [
        boton('Transferir entre cuentas', 'btn btn--fantasma', abrirTransferencia),
        boton('Nueva meta', 'btn btn--primario', function () { abrirModalMeta(null); }, UI.icono('mas'))
      ])
    ]));

    /* ------------------------------------------------------------- metas */
    var seccion = U.crear('section', { class: 'tarjeta' });
    seccion.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Metas de ahorro' }),
      U.crear('span', { class: 'tarjeta__nota', text: 'Avance, aportes y proyección' })
    ]));

    if (!metas.length) {
      seccion.appendChild(UI.vacio('Sin metas activas',
        'Define un monto objetivo y una fecha; el sistema calculará cuánto necesitas aportar cada mes.',
        boton('Crear mi primera meta', 'btn btn--primario', function () { abrirModalMeta(null); })));
      vista.appendChild(seccion);
    } else {
      var grid = U.crear('div', { class: 'metas-grid' });
      metas.forEach(function (m) { grid.appendChild(tarjetaMeta(m)); });
      seccion.appendChild(grid);
      vista.appendChild(seccion);
    }

    /* ----------------------------------------------------------- cuentas */
    var cuentas = A.saldoPorCuenta();
    var seccionCuentas = U.crear('section', { class: 'tarjeta' });
    seccionCuentas.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Cuentas y bolsillos' }),
      U.crear('div', { class: 'resumen-inline' }, [
        U.crear('span', { class: 'resumen-inline__neto', text: 'Saldo total ' + U.moneda(A.saldoTotalCuentas()) })
      ])
    ]));
    var tabla = U.crear('table', { class: 'tabla' });
    tabla.appendChild(U.crear('thead', {}, [U.crear('tr', {}, [
      U.crear('th', { text: 'Cuenta' }),
      U.crear('th', { class: 'der', text: 'Saldo inicial' }),
      U.crear('th', { class: 'der', text: 'Ingresos' }),
      U.crear('th', { class: 'der', text: 'Gastos' }),
      U.crear('th', { class: 'der', text: 'Aportes a metas' }),
      U.crear('th', { class: 'der', text: 'Saldo actual' }),
      U.crear('th', { text: 'Acciones' })
    ])]));
    var tbody = U.crear('tbody');
    cuentas.forEach(function (c) {
      var tr = U.crear('tr');
      tr.appendChild(U.crear('td', {}, [
        U.crear('span', { class: 'punto-cat', style: 'background:' + c.cuenta.color }),
        document.createTextNode(c.cuenta.nombre),
        U.crear('small', { class: 'celda-nota', text: U.capitalizar(c.cuenta.tipo) + ' · ' + c.movimientos + ' movimientos' })
      ]));
      tr.appendChild(U.crear('td', { class: 'der', text: U.moneda(c.cuenta.saldoInicial) }));
      tr.appendChild(U.crear('td', { class: 'der mov__monto--pos', text: '+' + U.moneda(c.ingresos) }));
      tr.appendChild(U.crear('td', { class: 'der mov__monto--neg', text: '−' + U.moneda(c.gastos) }));
      tr.appendChild(U.crear('td', { class: 'der', text: c.aportes ? '−' + U.moneda(c.aportes) : '—' }));
      tr.appendChild(U.crear('td', { class: 'der' }, [U.crear('b', { text: U.moneda(c.saldo) })]));
      tr.appendChild(U.crear('td', { class: 'acciones-celda' }, [
        botonIcono('editar', 'Editar cuenta', function () { abrirModalCuenta(c.cuenta); }),
        App.state.cuentas().length > 1 ? botonIcono('borrar', 'Eliminar cuenta', function () {
          var usos = App.movimientos.contar(function (m) { return m.cuentaId === c.cuenta.id; });
          if (usos) {
            App.notify.alerta('No se puede eliminar: la cuenta tiene ' + usos + ' movimientos asociados.');
            return;
          }
          App.notify.confirmar('¿Eliminar la cuenta «' + c.cuenta.nombre + '»?', { peligro: true })
            .then(function (ok) {
              if (!ok) { return; }
              App.cuentas.eliminar(c.cuenta.id);
              App.notify.exito('Cuenta eliminada.');
              App.app.refrescar();
            });
        }) : null
      ]));
      tbody.appendChild(tr);
    });
    tabla.appendChild(tbody);
    seccionCuentas.appendChild(U.crear('div', { class: 'tabla-scroll' }, [tabla]));
    seccionCuentas.appendChild(U.crear('div', { class: 'pie-acciones' }, [
      boton('+ Nueva cuenta', 'btn btn--mini btn--fantasma', function () { abrirModalCuenta(null); })
    ]));
    vista.appendChild(seccionCuentas);

    /* ---------------------------------------------- movimientos recurrentes */
    var recs = App.recurrentes.todos();
    var seccionRec = U.crear('section', { class: 'tarjeta' });
    seccionRec.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Movimientos recurrentes' }),
      boton('+ Programar', 'btn btn--mini btn--primario', abrirModalRecurrente)
    ]));
    if (!recs.length) {
      seccionRec.appendChild(UI.vacio('Sin movimientos recurrentes',
        'Programa la renta, el internet o tu beca para que se registren solos cada periodo.'));
    } else {
      var pend = A.recurrenciasPendientes(U.periodoActual());
      seccionRec.appendChild(U.crear('p', {
        class: 'nota-pie',
        text: pend.gastos || pend.ingresos
          ? 'Este mes están pendientes de registrar ' + U.moneda(pend.gastos) + ' en gastos y ' + U.moneda(pend.ingresos) + ' en ingresos.'
          : 'Todos los movimientos recurrentes del mes ya están registrados.'
      }));
      var tRec = U.crear('table', { class: 'tabla' });
      tRec.appendChild(U.crear('thead', {}, [U.crear('tr', {}, [
        U.crear('th', { text: 'Concepto' }), U.crear('th', { text: 'Tipo' }),
        U.crear('th', { text: 'Frecuencia' }), U.crear('th', { text: 'Día' }),
        U.crear('th', { class: 'der', text: 'Monto' }), U.crear('th', { text: 'Estado' }),
        U.crear('th', { text: 'Acciones' })
      ])]));
      var tbRec = U.crear('tbody');
      recs.forEach(function (r) {
        var tr = U.crear('tr', { class: r.activo ? '' : 'fila--inactiva' });
        tr.appendChild(U.crear('td', {}, [
          U.crear('b', { text: r.nombre }),
          U.crear('small', { class: 'celda-nota', text: App.state.nombreCategoria(r.categoriaId) + ' · ' + App.state.nombreCuenta(r.cuentaId) })
        ]));
        tr.appendChild(U.crear('td', { text: r.tipo === 'ingreso' ? 'Ingreso' : 'Gasto' }));
        tr.appendChild(U.crear('td', { text: U.capitalizar(r.frecuencia) }));
        tr.appendChild(U.crear('td', { text: String(r.dia) }));
        tr.appendChild(U.crear('td', {
          class: 'der ' + (r.tipo === 'ingreso' ? 'mov__monto--pos' : 'mov__monto--neg'),
          text: (r.tipo === 'ingreso' ? '+' : '−') + U.moneda(r.monto)
        }));
        tr.appendChild(U.crear('td', {}, [UI.chip(r.activo ? 'Activo' : 'Pausado', null, r.activo ? 'chip--ok' : 'chip--sin-limite')]));
        tr.appendChild(U.crear('td', { class: 'acciones-celda' }, [
          botonIcono('editar', 'Editar', function () { abrirModalRecurrente(r); }),
          botonIcono(r.activo ? 'cerrar' : 'inicio', r.activo ? 'Pausar' : 'Reactivar', function () {
            App.recurrentes.actualizar(r.id, { activo: !r.activo });
            App.notify.info('Recurrencia ' + (r.activo ? 'pausada' : 'reactivada') + '.');
            App.app.refrescar();
          }),
          botonIcono('borrar', 'Eliminar', function () {
            App.notify.confirmar('¿Eliminar la recurrencia «' + r.nombre + '»? Los movimientos ya registrados se conservan.', { peligro: true })
              .then(function (ok) {
                if (!ok) { return; }
                App.recurrentes.eliminar(r.id);
                App.notify.exito('Recurrencia eliminada.');
                App.app.refrescar();
              });
          })
        ]));
        tbRec.appendChild(tr);
      });
      tRec.appendChild(tbRec);
      seccionRec.appendChild(U.crear('div', { class: 'tabla-scroll' }, [tRec]));
    }
    vista.appendChild(seccionRec);

    return vista;
  }

  /* --------------------------------------------------------- tarjeta de meta */
  function tarjetaMeta(m) {
    var acumulado = App.state.totalAportado(m.id);
    var avance = m.objetivo ? U.porcentaje(acumulado, m.objetivo) : 0;
    var restante = U.redondear(m.objetivo - acumulado);
    var aportes = App.state.aportesDeMeta(m.id);
    var mesesRestantes = null;
    if (m.fechaLimite) {
      var hoy = U.desdeISO(U.hoyISO()), fin = U.desdeISO(m.fechaLimite);
      mesesRestantes = Math.max(1, Math.round((fin - hoy) / (86400000 * 30)));
    }
    var aporteMensual = mesesRestantes ? U.redondear(restante / mesesRestantes) : null;
    var completada = acumulado >= m.objetivo;

    var nodo = U.crear('div', { class: 'meta' + (completada ? ' meta--completada' : '') });
    nodo.appendChild(U.crear('header', { class: 'meta__cab' }, [
      U.crear('div', {}, [
        U.crear('h3', { text: m.nombre }),
        U.crear('small', {
          text: m.fechaLimite
            ? (completada ? 'Meta cumplida 🎉' : 'Fecha límite ' + m.fechaLimite + (mesesRestantes ? ' · ' + mesesRestantes + ' meses' : ''))
            : 'Sin fecha límite'
        })
      ]),
      U.crear('span', { class: 'meta__acciones' }, [
        botonIcono('editar', 'Editar meta', function () { abrirModalMeta(m); }),
        botonIcono('borrar', 'Eliminar meta', function () {
          App.notify.confirmar('¿Eliminar la meta «' + m.nombre + '» y sus ' + aportes.length + ' aportes?', { peligro: true })
            .then(function (ok) {
              if (!ok) { return; }
              aportes.forEach(function (a) { App.aportes.eliminar(a.id); });
              App.metas.eliminar(m.id);
              App.notify.exito('Meta eliminada.');
              App.app.refrescar();
            });
        })
      ])
    ]));
    nodo.appendChild(U.crear('div', { class: 'meta__montos' }, [
      U.crear('b', { class: 'meta__acumulado', text: U.moneda(acumulado) }),
      U.crear('span', { text: ' de ' + U.moneda(m.objetivo) }),
      U.crear('span', { class: 'meta__pct', text: avance + ' %' })
    ]));
    nodo.appendChild(UI.barraProgreso(avance, m.color || '#2E9E6B'));
    nodo.appendChild(U.crear('ul', { class: 'meta__datos' }, [
      U.crear('li', {}, ['Falta: ', U.crear('b', { text: U.moneda(restante) })]),
      aporteMensual ? U.crear('li', {}, ['Aporta ', U.crear('b', { text: U.moneda(aporteMensual) }), ' al mes para llegar']) : null,
      U.crear('li', {}, ['Aportes registrados: ', U.crear('b', { text: String(aportes.length) })])
    ]));
    nodo.appendChild(U.crear('div', { class: 'meta__acciones-fila' }, [
      boton('Registrar aporte', 'btn btn--primario btn--mini', function () { abrirModalAporte(m); }, null, true),
      aportes.length ? boton('Historial', 'btn btn--fantasma btn--mini', function () { verAportes(m); }, null, true) : null
    ]));
    return nodo;
  }

  /* ------------------------------------------------------------- modales */
  function abrirModalMeta(meta) {
    var esEdicion = !!meta;
    var f = UI.formulario([
      { nombre: 'nombre', etiqueta: 'Nombre de la meta', tipo: 'text', requerido: true, valor: meta ? meta.nombre : '', placeholder: 'Ej. Fondo de emergencia' },
      { nombre: 'objetivo', etiqueta: 'Monto objetivo', tipo: 'number', min: '1', requerido: true, valor: meta ? U.aNumeroInput(meta.objetivo) : '' },
      { nombre: 'fechaLimite', etiqueta: 'Fecha límite (opcional)', tipo: 'date', valor: meta && meta.fechaLimite ? meta.fechaLimite : '' },
      { nombre: 'color', etiqueta: 'Color', tipo: 'color', valor: meta ? meta.color : '#2E9E6B' }
    ]);
    var m = UI.modal({
      titulo: esEdicion ? 'Editar meta' : 'Nueva meta de ahorro', contenido: f.nodo,
      acciones: [
        U.crear('button', { class: 'btn btn--fantasma', type: 'button', text: 'Cancelar', onclick: function () { m.cerrar(); } }),
        U.crear('button', {
          class: 'btn btn--primario', type: 'button', text: esEdicion ? 'Guardar' : 'Crear meta',
          onclick: function () {
            var v = UI.valores(f.campos);
            if (!String(v.nombre).trim() || !(U.num(v.objetivo) > 0)) {
              App.notify.error('Escribe un nombre y un monto objetivo mayor que cero.');
              return;
            }
            var datos = {
              nombre: v.nombre, objetivo: U.num(v.objetivo),
              fechaLimite: v.fechaLimite || null, color: v.color
            };
            if (esEdicion) { App.metas.actualizar(meta.id, datos); App.notify.exito('Meta actualizada.'); }
            else { App.metas.crear(Object.assign(datos, { creada: U.hoyISO() })); App.notify.exito('Meta creada. Registra tu primer aporte.'); }
            m.cerrar();
            App.app.refrescar();
          }
        })
      ]
    });
  }

  function abrirModalAporte(meta) {
    var restante = U.redondear(meta.objetivo - App.state.totalAportado(meta.id));
    var f = UI.formulario([
      { nombre: 'monto', etiqueta: 'Monto del aporte', tipo: 'number', min: '0.01', requerido: true, valor: restante > 0 ? U.aNumeroInput(restante) : '', ayuda: 'Falta ' + U.moneda(restante) + ' para completar la meta.' },
      { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: U.hoyISO() },
      {
        nombre: 'cuentaId', etiqueta: 'Cuenta de origen', tipo: 'select', valor: 'cta_ahorro',
        opciones: App.state.cuentas().map(function (c) { return { valor: c.id, etiqueta: c.nombre }; })
      }
    ]);
    var m = UI.modal({
      titulo: 'Aporte a «' + meta.nombre + '»', contenido: f.nodo,
      acciones: [
        U.crear('button', { class: 'btn btn--fantasma', type: 'button', text: 'Cancelar', onclick: function () { m.cerrar(); } }),
        U.crear('button', {
          class: 'btn btn--primario', type: 'button', text: 'Registrar aporte',
          onclick: function () {
            var v = UI.valores(f.campos);
            if (!(U.num(v.monto) > 0)) { App.notify.error('El aporte debe ser mayor que cero.'); return; }
            App.aportes.crear({ metaId: meta.id, monto: U.num(v.monto), fecha: v.fecha, cuentaId: v.cuentaId });
            var acumulado = App.state.totalAportado(meta.id);
            App.notify.exito(acumulado >= meta.objetivo
              ? '¡Felicidades! Completaste la meta «' + meta.nombre + '».'
              : 'Aporte registrado. Avance: ' + U.porcentaje(acumulado, meta.objetivo) + ' %.');
            m.cerrar();
            App.app.refrescar();
          }
        })
      ]
    });
  }

  function verAportes(meta) {
    var aportes = App.state.aportesDeMeta(meta.id).slice().reverse();
    var lista = U.crear('div', { class: 'aportes-lista' }, aportes.map(function (a) {
      return U.crear('div', { class: 'mov' }, [
        U.crear('span', { class: 'mov__icono', style: 'background:' + (meta.color || '#2E9E6B'), text: '↑' }),
        U.crear('span', { class: 'mov__det' }, [
          U.crear('b', { text: U.moneda(a.monto) }),
          U.crear('small', { text: U.formatoFechaLarga(a.fecha) + ' · ' + App.state.nombreCuenta(a.cuentaId) })
        ]),
        U.crear('button', {
          class: 'btn-icono', type: 'button', title: 'Eliminar aporte',
          onclick: function () {
            App.notify.confirmar('¿Eliminar el aporte de ' + U.moneda(a.monto) + '?', { peligro: true })
              .then(function (ok) {
                if (!ok) { return; }
                App.aportes.eliminar(a.id);
                App.notify.exito('Aporte eliminado.');
                App.app.refrescar();
              });
          }
        }, [UI.icono('borrar')])
      ]);
    }));
    UI.modal({ titulo: 'Aportes a «' + meta.nombre + '»', contenido: lista });
  }

  function abrirModalCuenta(cuenta) {
    var esEdicion = !!cuenta;
    var f = UI.formulario([
      { nombre: 'nombre', etiqueta: 'Nombre de la cuenta', tipo: 'text', requerido: true, valor: cuenta ? cuenta.nombre : '', placeholder: 'Ej. Efectivo, Débito, Ahorro' },
      {
        nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', valor: cuenta ? cuenta.tipo : 'debito',
        opciones: [{ valor: 'efectivo', etiqueta: 'Efectivo' }, { valor: 'debito', etiqueta: 'Débito' },
        { valor: 'credito', etiqueta: 'Crédito' }, { valor: 'ahorro', etiqueta: 'Ahorro' }]
      },
      { nombre: 'saldoInicial', etiqueta: 'Saldo inicial', tipo: 'number', valor: cuenta ? U.aNumeroInput(cuenta.saldoInicial) : '0' },
      { nombre: 'color', etiqueta: 'Color', tipo: 'color', valor: cuenta ? cuenta.color : '#1E88E5' }
    ]);
    var m = UI.modal({
      titulo: esEdicion ? 'Editar cuenta' : 'Nueva cuenta', contenido: f.nodo,
      acciones: [
        U.crear('button', { class: 'btn btn--fantasma', type: 'button', text: 'Cancelar', onclick: function () { m.cerrar(); } }),
        U.crear('button', {
          class: 'btn btn--primario', type: 'button', text: esEdicion ? 'Guardar' : 'Crear',
          onclick: function () {
            var v = UI.valores(f.campos);
            if (!String(v.nombre).trim()) { App.notify.error('Escribe un nombre para la cuenta.'); return; }
            var datos = { nombre: v.nombre, tipo: v.tipo, saldoInicial: U.num(v.saldoInicial), color: v.color };
            if (esEdicion) { App.cuentas.actualizar(cuenta.id, datos); App.notify.exito('Cuenta actualizada.'); }
            else { App.cuentas.crear(datos); App.notify.exito('Cuenta creada.'); }
            m.cerrar();
            App.app.refrescar();
          }
        })
      ]
    });
  }

  /** RF-26: transferencia entre cuentas (dos movimientos vinculados). */
  function abrirTransferencia() {
    var cuentas = App.state.cuentas();
    if (cuentas.length < 2) {
      App.notify.alerta('Necesitas al menos dos cuentas para registrar una transferencia.');
      return;
    }
    var f = UI.formulario([
      { nombre: 'origen', etiqueta: 'Cuenta de origen', tipo: 'select', valor: cuentas[0].id, opciones: cuentas.map(function (c) { return { valor: c.id, etiqueta: c.nombre }; }) },
      { nombre: 'destino', etiqueta: 'Cuenta de destino', tipo: 'select', valor: cuentas[1].id, opciones: cuentas.map(function (c) { return { valor: c.id, etiqueta: c.nombre }; }) },
      { nombre: 'monto', etiqueta: 'Monto a transferir', tipo: 'number', min: '0.01', requerido: true, valor: '' },
      { nombre: 'fecha', etiqueta: 'Fecha', tipo: 'date', requerido: true, valor: U.hoyISO() },
      { nombre: 'descripcion', etiqueta: 'Descripción', tipo: 'text', valor: 'Transferencia entre cuentas' }
    ]);
    var m = UI.modal({
      titulo: 'Transferencia entre cuentas', contenido: f.nodo,
      acciones: [
        U.crear('button', { class: 'btn btn--fantasma', type: 'button', text: 'Cancelar', onclick: function () { m.cerrar(); } }),
        U.crear('button', {
          class: 'btn btn--primario', type: 'button', text: 'Transferir',
          onclick: function () {
            var v = UI.valores(f.campos);
            var monto = U.num(v.monto);
            if (v.origen === v.destino) { App.notify.error('La cuenta de origen y destino deben ser distintas.'); return; }
            if (!(monto > 0)) { App.notify.error('El monto debe ser mayor que cero.'); return; }
            var grupo = U.uid('trf');
            App.movimientos.crear({
              tipo: 'gasto', monto: monto, fecha: v.fecha, categoriaId: 'cat_otros',
              cuentaId: v.origen, descripcion: v.descripcion + ' → ' + App.state.nombreCuenta(v.destino),
              transferencia: grupo
            });
            App.movimientos.crear({
              tipo: 'ingreso', monto: monto, fecha: v.fecha, categoriaId: 'cat_otros_ing',
              cuentaId: v.destino, descripcion: v.descripcion + ' ← ' + App.state.nombreCuenta(v.origen),
              transferencia: grupo
            });
            App.notify.exito('Transferencia de ' + U.moneda(monto) + ' registrada entre cuentas.');
            m.cerrar();
            App.app.refrescar();
          }
        })
      ]
    });
  }

  function abrirModalRecurrente(recurrente) {
    var esEdicion = !!recurrente;
    var r = recurrente || {};
    var f = UI.formulario([
      {
        nombre: 'tipo', etiqueta: 'Tipo', tipo: 'select', valor: r.tipo || 'gasto',
        opciones: [{ valor: 'gasto', etiqueta: 'Gasto' }, { valor: 'ingreso', etiqueta: 'Ingreso' }]
      },
      { nombre: 'nombre', etiqueta: 'Concepto', tipo: 'text', requerido: true, valor: r.nombre || '', placeholder: 'Ej. Renta, Internet, Beca' },
      { nombre: 'monto', etiqueta: 'Monto', tipo: 'number', min: '0.01', requerido: true, valor: r.monto ? U.aNumeroInput(r.monto) : '' },
      {
        nombre: 'categoriaId', etiqueta: 'Categoría', tipo: 'select', valor: r.categoriaId || '',
        opciones: App.state.categorias().map(function (c) { return { valor: c.id, etiqueta: c.nombre }; })
      },
      {
        nombre: 'cuentaId', etiqueta: 'Cuenta', tipo: 'select', valor: r.cuentaId || 'cta_debito',
        opciones: App.state.cuentas().map(function (c) { return { valor: c.id, etiqueta: c.nombre }; })
      },
      {
        nombre: 'frecuencia', etiqueta: 'Frecuencia', tipo: 'select', valor: r.frecuencia || 'mensual',
        opciones: [{ valor: 'mensual', etiqueta: 'Mensual' }, { valor: 'quincenal', etiqueta: 'Quincenal' },
        { valor: 'semanal', etiqueta: 'Semanal' }]
      },
      { nombre: 'dia', etiqueta: 'Día del periodo', tipo: 'number', min: '1', max: '28', valor: r.dia || 1, ayuda: 'Para frecuencia mensual y quincenal.' }
    ]);
    var m = UI.modal({
      titulo: esEdicion ? 'Editar movimiento recurrente' : 'Nuevo movimiento recurrente', contenido: f.nodo,
      acciones: [
        U.crear('button', { class: 'btn btn--fantasma', type: 'button', text: 'Cancelar', onclick: function () { m.cerrar(); } }),
        U.crear('button', {
          class: 'btn btn--primario', type: 'button', text: esEdicion ? 'Guardar' : 'Programar',
          onclick: function () {
            var v = UI.valores(f.campos);
            if (!String(v.nombre).trim() || !(U.num(v.monto) > 0)) {
              App.notify.error('Escribe el concepto y un monto mayor que cero.');
              return;
            }
            var datos = {
              nombre: v.nombre, tipo: v.tipo, monto: U.num(v.monto), categoriaId: v.categoriaId,
              cuentaId: v.cuentaId, frecuencia: v.frecuencia, dia: parseInt(v.dia, 10) || 1,
              mes: Number(U.periodoActual().slice(5, 7)), activo: true
            };
            if (esEdicion) { App.recurrentes.actualizar(recurrente.id, datos); App.notify.exito('Recurrencia actualizada.'); }
            else { App.recurrentes.crear(datos); App.notify.exito('Recurrencia programada. Se registrará automáticamente.'); }
            m.cerrar();
            App.app.refrescar();
          }
        })
      ]
    });
  }

  function boton(texto, clase, fn, iconoNodo, conIcono) {
    return U.crear('button', { class: clase, type: 'button', onclick: fn }, [
      iconoNodo || null,
      conIcono && !iconoNodo ? null : null,
      document.createTextNode(texto)
    ]);
  }

  function botonIcono(nombre, titulo, fn) {
    return U.crear('button', {
      class: 'btn-icono', type: 'button', title: titulo, 'aria-label': titulo, onclick: fn
    }, [UI.icono(nombre)]);
  }

  App.views = App.views || {};
  App.views.metas = { montar: montar, render: render };
})(window);
