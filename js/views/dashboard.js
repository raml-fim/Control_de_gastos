/* ============================================================================
 * js/views/dashboard.js — panel de inicio (RF-11)
 * ---------------------------------------------------------------------------
 * Pantalla principal: saldo disponible, gasto del mes, presupuesto consumido,
 * resumen por categoría, alertas activas, recomendación del día, últimos
 * movimientos, avance de metas y top 3 de gastos. Todo en una sola vista.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;
  var UI = App.ui;
  var INT = App.intelligence;
  var A = App.analytics;

  var periodo = U.periodoActual();

  function montar(contenedor) {
    contenedor.innerHTML = '';
    var nodo = render();
    contenedor.appendChild(nodo);
    pintarGraficas(nodo);
    return nodo;
  }

  function render() {
    var ajustes = App.state.ajustes();
    var t = A.totalesPeriodo(periodo);
    var saldo = A.saldoDisponible();
    var estadoPres = A.estadoPresupuestos(periodo);
    var al = INT.alertas(periodo);
    var reco = INT.recomendacionPrincipal(periodo);
    var general = INT.estadoGeneral(periodo);
    var proy = A.proyeccion(periodo);
    var resumen = A.resumenPorCategoria(periodo, 'gasto');
    var movs = U.ordenar(App.state.movimientosDe(periodo), 'fecha', true).slice(0, 6);
    var periodos = U.ultimosPeriodos(4);
    var serie = A.seriePeriodos(periodos);
    var nombre = ajustes.usuario ? 'Hola, ' + ajustes.usuario : 'Hola';

    var vista = U.crear('div', { class: 'vista vista--panel' });

    /* ----------------------------------------------------- encabezado */
    vista.appendChild(U.crear('section', { class: 'hero' }, [
      U.crear('div', { class: 'hero__izq' }, [
        U.crear('p', { class: 'hero__saludo', text: nombre + ' · ' + U.nombreMes(periodo) }),
        U.crear('p', { class: 'hero__etiqueta', text: 'Saldo disponible' }),
        U.crear('p', { class: 'hero__monto', text: U.moneda(saldo) }),
        U.crear('p', {
          class: 'hero__pie',
          text: 'Ingresos del mes ' + U.moneda(t.ingresos) + ' · Gastos del mes ' + U.moneda(t.gastos)
        }),
        U.crear('div', { class: 'hero__acciones' }, [
          boton('Registrar movimiento', 'btn btn--claro', function () { App.app.abrirFormularioMovimiento(); }),
          boton('Ver análisis', 'btn btn--fantasma-claro', function () { App.app.navegar('analisis'); })
        ])
      ]),
      U.crear('div', { class: 'hero__der' }, [
        U.crear('div', { class: 'semaforo', style: '--color:' + general.color }, [
          U.crear('span', { class: 'semaforo__punto' }),
          U.crear('span', { class: 'semaforo__texto', text: general.etiqueta })
        ]),
        U.crear('div', { class: 'hero__minis' }, [
          mini('Gasto del mes', U.moneda(t.gastos), 'vs ' + U.nombreMes(U.sumarMeses(periodo, -1))),
          mini('Presupuesto', estadoPres.global.limite ? U.moneda(estadoPres.global.limite) : 'Sin definir',
            estadoPres.global.limite ? estadoPres.global.consumo + ' % consumido' : 'Defínelo en presupuesto'),
          mini('Ahorro del mes', U.moneda(t.neto), t.ingresos ? U.porcentaje(t.neto, t.ingresos) + ' % de tus ingresos' : '—')
        ])
      ])
    ]));

    /* ------------------------------------------------ tarjetas rápidas */
    var alertasCriticas = al.filter(function (a) { return a.nivel === 'critico'; }).length;
    var avisos = al.filter(function (a) { return a.nivel === 'aviso'; }).length;
    vista.appendChild(U.crear('section', { class: 'grid grid--4' }, [
      tarjetaKPI('Movimientos del mes', String(t.registros), 'registros capturados', '#1E88E5'),
      tarjetaKPI('Categoría con mayor gasto',
        resumen.filas.length ? resumen.filas[0].nombre : '—',
        resumen.filas.length ? U.moneda(resumen.filas[0].total) + ' · ' + resumen.filas[0].porcentaje + ' %' : 'Sin gastos',
        resumen.filas.length ? resumen.filas[0].color : '#6B8CAE'),
      tarjetaKPI('Alertas activas', String(alertasCriticas + avisos),
        alertasCriticas + ' críticas · ' + avisos + ' avisos',
        alertasCriticas ? '#D64545' : (avisos ? '#E0A030' : '#2E9E6B')),
      tarjetaKPI('Proyección de cierre', proy.cerrado ? 'Mes cerrado' : U.moneda(proy.gastoEstimado),
        proy.cerrado ? 'Periodo finalizado'
          : (proy.excede ? 'Supera el límite en ' + U.moneda(proy.exceso) : 'Dentro del presupuesto'),
        proy.excede ? '#D64545' : '#0F8B8D')
    ]));

    /* --------------------------------------------------- alertas */
    var bloqueAlertas = U.crear('section', { class: 'tarjeta' }, [
      U.crear('header', { class: 'tarjeta__cabecera' }, [
        U.crear('h2', { text: 'Alertas y avisos' }),
        U.crear('span', { class: 'tarjeta__contador', text: al.length + '' })
      ])
    ]);
    if (!al.length) {
      bloqueAlertas.appendChild(UI.vacio('Sin alertas', 'Tus presupuestos están dentro de los límites definidos.'));
    } else {
      var lista = U.crear('div', { class: 'alertas' });
      al.slice(0, 4).forEach(function (a) {
        lista.appendChild(alertaNodo(a));
      });
      bloqueAlertas.appendChild(lista);
      if (al.length > 4) {
        bloqueAlertas.appendChild(U.crear('button', {
          class: 'btn btn--fantasma btn--bloque', type: 'button',
          text: 'Ver las ' + al.length + ' alertas',
          onclick: function () { App.app.navegar('analisis'); }
        }));
      }
    }
    vista.appendChild(bloqueAlertas);

    /* ------------------------------- resumen + recomendación */
    var dosColumnas = U.crear('section', { class: 'grid grid--2' });

    var cat = U.crear('div', { class: 'tarjeta' }, [
      U.crear('header', { class: 'tarjeta__cabecera' }, [
        U.crear('h2', { text: 'Gasto por categoría' }),
        U.crear('button', {
          class: 'btn btn--mini btn--fantasma', type: 'button', text: 'Ver detalle',
          onclick: function () { App.app.navegar('analisis'); }
        })
      ])
    ]);
    if (!resumen.filas.length) {
      cat.appendChild(UI.vacio('Sin gastos este mes', 'Registra tu primer gasto para ver el resumen por categoría.'));
    } else {
      var cuerpoCat = U.crear('div', { class: 'con-dona' }, [
        U.crear('div', { class: 'con-dona__grafica' }, [
          U.crear('canvas', { class: 'canvas-dona', id: 'dona-panel', width: '240', height: '240' })
        ]),
        U.crear('div', { class: 'con-dona__lista' }, resumen.filas.slice(0, 5).map(function (f) {
          return U.crear('div', { class: 'fila-cat' }, [
            U.crear('span', { class: 'fila-cat__nombre' }, [
              U.crear('span', { class: 'fila-cat__punto', style: 'background:' + f.color }),
              document.createTextNode(f.nombre)
            ]),
            UI.barraProgreso(f.porcentaje, f.color, { mini: true }),
            U.crear('span', { class: 'fila-cat__valor', text: U.moneda(f.total) }),
            U.crear('span', { class: 'fila-cat__pct', text: f.porcentaje + ' %' })
          ]);
        }))
      ]);
      cat.appendChild(cuerpoCat);
    }
    dosColumnas.appendChild(cat);

    var recoCard = U.crear('div', { class: 'tarjeta' }, [
      U.crear('header', { class: 'tarjeta__cabecera' }, [U.crear('h2', { text: 'Recomendación del día' })])
    ]);
    var cajaReco = U.crear('div', { class: 'reco' }, [
      U.crear('h3', { class: 'reco__titulo', text: reco.titulo }),
      U.crear('p', { class: 'reco__texto', text: reco.mensaje }),
      reco.ahorroEstimado > 0 ? U.crear('p', { class: 'reco__ahorro' }, [
        'Ahorro estimado: ', U.crear('b', { text: U.moneda(reco.ahorroEstimado) })
      ]) : null,
      U.crear('p', { class: 'reco__base', text: 'Criterio: ' + reco.base })
    ]);
    recoCard.appendChild(cajaReco);
    var potencial = INT.ahorroPotencial(periodo);
    if (potencial > 0) {
      recoCard.appendChild(U.crear('p', { class: 'nota-pie' }, [
        'Si aplicas todas las sugerencias del mes podrías liberar hasta ',
        U.crear('b', { text: U.moneda(potencial) }), '.'
      ]));
    }
    dosColumnas.appendChild(recoCard);
    vista.appendChild(dosColumnas);

    /* ----------------------------- comparación, top 3 y últimos movimientos */
    var tres = U.crear('section', { class: 'grid grid--3' });

    var comparativa = U.crear('div', { class: 'tarjeta' }, [
      U.crear('header', { class: 'tarjeta__cabecera' }, [
        U.crear('h2', { text: 'Últimos meses' }),
        U.crear('span', { class: 'tarjeta__nota', text: 'ingresos vs gastos' })
      ]),
      U.crear('canvas', { class: 'canvas-barras', id: 'barras-panel', width: '420', height: '210' }),
      UI.leyenda([
        { etiqueta: 'Ingresos', color: '#2E9E6B' },
        { etiqueta: 'Gastos', color: '#D64545' }
      ])
    ]);
    tres.appendChild(comparativa);

    var top = U.crear('div', { class: 'tarjeta' }, [
      U.crear('header', { class: 'tarjeta__cabecera' }, [
        U.crear('h2', { text: 'Top 3 de gastos' }),
        U.crear('span', { class: 'tarjeta__nota', text: U.nombreMes(periodo) })
      ])
    ]);
    var topGastos = A.topGastos(periodo, 3);
    if (!topGastos.length) {
      top.appendChild(UI.vacio('Sin gastos', 'Aún no registras gastos este mes.'));
    } else {
      top.appendChild(U.crear('div', { class: 'top-lista' }, topGastos.map(function (g, i) {
        return U.crear('div', { class: 'top-item' }, [
          U.crear('span', { class: 'top-item__num', style: 'background:' + g.color, text: String(i + 1) }),
          U.crear('span', { class: 'top-item__det' }, [
            U.crear('b', { text: g.descripcion }),
            U.crear('small', { text: U.formatoFechaLarga(g.fecha) + ' · ' + g.nombreCategoria })
          ]),
          U.crear('span', { class: 'top-item__monto', text: U.moneda(g.monto) })
        ]);
      })));
    }
    tres.appendChild(top);

    var ultimos = U.crear('div', { class: 'tarjeta' }, [
      U.crear('header', { class: 'tarjeta__cabecera' }, [
        U.crear('h2', { text: 'Últimos movimientos' }),
        U.crear('button', {
          class: 'btn btn--mini btn--fantasma', type: 'button', text: 'Historial',
          onclick: function () { App.app.navegar('movimientos'); }
        })
      ])
    ]);
    if (!movs.length) {
      ultimos.appendChild(UI.vacio('Sin movimientos', 'Registra tu primer movimiento del mes.'));
    } else {
      ultimos.appendChild(listaMovimientos(movs));
    }
    tres.appendChild(ultimos);
    vista.appendChild(tres);

    /* ------------------------------------------------------ metas */
    var metas = App.metas.todos();
    if (metas.length) {
      var seccionMetas = U.crear('section', { class: 'tarjeta' }, [
        U.crear('header', { class: 'tarjeta__cabecera' }, [
          U.crear('h2', { text: 'Avance de metas de ahorro' }),
          U.crear('button', {
            class: 'btn btn--mini btn--fantasma', type: 'button', text: 'Gestionar metas',
            onclick: function () { App.app.navegar('metas'); }
          })
        ])
      ]);
      var gridMetas = U.crear('div', { class: 'grid grid--3' });
      metas.forEach(function (m) {
        var acumulado = App.state.totalAportado(m.id);
        var avance = m.objetivo ? U.porcentaje(acumulado, m.objetivo) : 0;
        gridMetas.appendChild(U.crear('div', { class: 'meta-mini' }, [
          U.crear('div', { class: 'meta-mini__cab' }, [
            U.crear('b', { text: m.nombre }),
            U.crear('span', { text: U.moneda(acumulado) + ' / ' + U.moneda(m.objetivo) })
          ]),
          UI.barraProgreso(avance, m.color),
          U.crear('small', {
            text: avance + ' % · faltan ' + U.moneda(m.objetivo - acumulado) +
              (m.fechaLimite ? ' · meta ' + m.fechaLimite : '')
          })
        ]));
      });
      seccionMetas.appendChild(gridMetas);
      vista.appendChild(seccionMetas);
    }

    return vista;
  }

  /* ------------------------------------------------------------- helpers */
  function boton(texto, clase, fn) {
    return U.crear('button', { class: clase, type: 'button', text: texto, onclick: fn });
  }

  function mini(etiqueta, valor, pie) {
    return U.crear('div', { class: 'mini' }, [
      U.crear('span', { class: 'mini__etiqueta', text: etiqueta }),
      U.crear('b', { class: 'mini__valor', text: valor }),
      U.crear('small', { class: 'mini__pie', text: pie })
    ]);
  }

  function tarjetaKPI(titulo, valor, pie, color) {
    return U.crear('div', { class: 'kpi', style: '--kpi:' + color }, [
      U.crear('span', { class: 'kpi__titulo', text: titulo }),
      U.crear('b', { class: 'kpi__valor', text: valor }),
      U.crear('small', { class: 'kpi__pie', text: pie })
    ]);
  }

  function alertaNodo(a) {
    var iconos = { critico: '⛔', aviso: '⚠', info: 'ℹ', exito: '✓' };
    return U.crear('div', { class: 'alerta alerta--' + a.nivel }, [
      U.crear('span', { class: 'alerta__icono', text: iconos[a.nivel] || 'ℹ' }),
      U.crear('div', { class: 'alerta__cuerpo' }, [
        U.crear('b', { text: a.titulo }),
        U.crear('p', { text: a.mensaje }),
        U.crear('small', { text: a.dato || '' })
      ])
    ]);
  }

  function listaMovimientos(movs) {
    return U.crear('div', { class: 'mov-lista' }, movs.map(function (m) {
      var esIngreso = m.tipo === 'ingreso';
      return U.crear('div', { class: 'mov' }, [
        U.crear('span', {
          class: 'mov__icono',
          style: 'background:' + (esIngreso ? '#2E9E6B' : App.state.colorCategoria(m.categoriaId)),
          text: esIngreso ? '↑' : '↓'
        }),
        U.crear('span', { class: 'mov__det' }, [
          U.crear('b', { text: m.descripcion }),
          U.crear('small', {
            text: U.formatoFechaLarga(m.fecha) + ' · ' +
              (esIngreso ? App.state.nombreCategoria(m.categoriaId) : App.state.nombreCategoria(m.categoriaId)) +
              ' · ' + App.state.nombreCuenta(m.cuentaId)
          })
        ]),
        U.crear('span', {
          class: 'mov__monto ' + (esIngreso ? 'mov__monto--pos' : 'mov__monto--neg'),
          text: (esIngreso ? '+' : '−') + U.moneda(m.monto)
        })
      ]);
    }));
  }

  /* ------------------------------------------------------------ gráficas */
  function pintarGraficas(nodo) {
    var resumen = A.resumenPorCategoria(periodo, 'gasto');
    var cDona = nodo.querySelector('#dona-panel');
    if (cDona && resumen.filas.length) {
      UI.dona(cDona, resumen.filas.map(function (f) {
        return { etiqueta: f.nombre, valor: f.total, color: f.color };
      }), { etiqueta: 'Gasto del mes', valorTexto: U.moneda(resumen.total) });
    }
    var cBarras = nodo.querySelector('#barras-panel');
    if (cBarras) {
      var serie = A.seriePeriodos(U.ultimosPeriodos(4));
      UI.barras(cBarras, {
        etiquetas: serie.map(function (s) { return s.etiqueta; }),
        series: [
          { nombre: 'Ingresos', color: '#2E9E6B', valores: serie.map(function (s) { return s.ingresos; }) },
          { nombre: 'Gastos', color: '#D64545', valores: serie.map(function (s) { return s.gastos; }) }
        ]
      });
    }
  }

  App.views = App.views || {};
  App.views.panel = {
    montar: montar,
    render: render,
    cambiarPeriodo: function (p) { periodo = p; },
    periodo: function () { return periodo; }
  };
})(window);
