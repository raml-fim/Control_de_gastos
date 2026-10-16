/* ============================================================================
 * js/views/analysis.js — análisis inteligente y reportes
 * ---------------------------------------------------------------------------
 * Reúne la salida del motor: alertas (RF-07, RF-20, RF-24), recomendaciones
 * predefinidas y calculadas (RF-10, RF-22), top 3 de gastos (RF-09),
 * comparación entre periodos (RF-21), proyección de cierre (RF-17),
 * estadística por categoría y exportación del reporte (RF-18).
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;
  var UI = App.ui;
  var INT = App.intelligence;
  var A = App.analytics;

  var periodo = U.periodoActual();
  var rango = 6;   // meses a comparar

  function montar(contenedor) {
    contenedor.innerHTML = '';
    var nodo = render();
    contenedor.appendChild(nodo);
    setTimeout(function () { pintar(nodo); }, 0);
    return nodo;
  }

  function render() {
    var vista = U.crear('div', { class: 'vista vista--analisis' });

    vista.appendChild(U.crear('section', { class: 'barra-acciones' }, [
      U.crear('div', { class: 'barra-acciones__izq' }, [
        U.crear('h1', { class: 'titulo-vista', text: 'Análisis inteligente' }),
        U.crear('p', { class: 'subtitulo-vista', text: 'Reglas configurables y estadística descriptiva sobre tus datos reales.' })
      ]),
      U.crear('div', { class: 'barra-acciones__der' }, [
        selectorPeriodo(),
        boton('Exportar reporte CSV', 'btn btn--fantasma', exportarReporte, UI.icono('descargar')),
        boton('Reglas del motor', 'btn btn--primario', abrirReglas, UI.icono('ajustes'))
      ])
    ]));

    var t = A.totalesPeriodo(periodo);
    var anterior = U.sumarMeses(periodo, -1);
    var comp = A.compararPeriodos(anterior, periodo);
    var ahorro = A.ahorroDelMes(periodo);
    var proy = A.proyeccion(periodo);
    var resumen = A.resumenPorCategoria(periodo, 'gasto');
    var general = INT.estadoGeneral(periodo);

    /* --------------------------------------------------------------- KPIs */
    vista.appendChild(U.crear('section', { class: 'grid grid--4' }, [
      kpi('Ingresos', U.moneda(t.ingresos), variacion(comp.variacionIngresos, 'vs mes anterior'), '#2E9E6B'),
      kpi('Gastos', U.moneda(t.gastos), variacion(comp.variacionGastos, 'vs mes anterior'), '#D64545'),
      kpi('Ahorro del mes', U.moneda(ahorro.neto), 'Tasa de ahorro ' + ahorro.tasaAhorro + ' %', '#1E88E5'),
      kpi('Saldo disponible', U.moneda(A.saldoDisponible()), 'Histórico completo', '#0F8B8D')
    ]));

    /* -------------------------------------------------- estado y proyección */
    vista.appendChild(U.crear('section', { class: 'grid grid--2' }, [
      tarjetaProyeccion(proy, general),
      tarjetaPatrones(periodo)
    ]));

    /* ------------------------------------------------------------ alertas */
    var al = INT.alertas(periodo);
    var tarjetaAlertas = U.crear('section', { class: 'tarjeta' });
    tarjetaAlertas.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Alertas del motor' }),
      U.crear('span', { class: 'tarjeta__contador', text: String(al.length) })
    ]));
    if (!al.length) {
      tarjetaAlertas.appendChild(UI.vacio('Sin alertas', 'Ningún límite se ha excedido y la proyección está dentro del presupuesto.'));
    } else {
      var listaAl = U.crear('div', { class: 'alertas' });
      al.forEach(function (a) { listaAl.appendChild(alertaNodo(a)); });
      tarjetaAlertas.appendChild(listaAl);
    }
    vista.appendChild(tarjetaAlertas);

    /* ----------------------------------------------------- recomendaciones */
    var recs = INT.recomendaciones(periodo);
    var tarjetaRec = U.crear('section', { class: 'tarjeta' });
    tarjetaRec.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Recomendaciones personalizadas' }),
      U.crear('span', { class: 'tarjeta__nota', text: 'Ahorro potencial ' + U.moneda(INT.ahorroPotencial(periodo)) })
    ]));
    if (!recs.length) {
      tarjetaRec.appendChild(UI.vacio('Sin recomendaciones', 'Tus finanzas están en orden este mes.'));
    } else {
      tarjetaRec.appendChild(U.crear('div', { class: 'reco-lista' }, recs.map(function (r) {
        return U.crear('div', { class: 'reco-item' }, [
          U.crear('div', { class: 'reco-item__cab' }, [
            U.crear('span', { class: 'reco-item__prio reco-item__prio--' + r.prioridad, text: 'P' + r.prioridad }),
            U.crear('b', { text: r.titulo }),
            r.ahorroEstimado > 0 ? U.crear('span', { class: 'reco-item__ahorro', text: 'Ahorro ' + U.moneda(r.ahorroEstimado) }) : null
          ]),
          U.crear('p', { text: r.mensaje }),
          U.crear('small', { text: 'Criterio: ' + r.base })
        ]);
      })));
    }
    vista.appendChild(tarjetaRec);

    /* ------------------------------------------- resumen por categoría */
    var tarjetaCat = U.crear('section', { class: 'tarjeta' });
    tarjetaCat.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Gasto por categoría en ' + U.nombreMes(periodo) }),
      U.crear('span', { class: 'tarjeta__nota', text: 'Total ' + U.moneda(resumen.total) })
    ]));
    var contenedorCat = U.crear('div', { class: 'con-dona' }, [
      U.crear('div', { class: 'con-dona__grafica' }, [
        U.crear('canvas', { class: 'canvas-dona', id: 'dona-analisis' })
      ]),
      U.crear('div', { class: 'con-dona__lista' }, resumen.filas.map(function (f) {
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
    if (!resumen.filas.length) {
      tarjetaCat.appendChild(UI.vacio('Sin gastos registrados', 'En ' + U.nombreMes(periodo) + ' no hay gastos capturados.'));
    } else {
      tarjetaCat.appendChild(contenedorCat);

      // Detalle estadístico por categoría (promedio, mediana y tendencia)
      var tabla = U.crear('table', { class: 'tabla tabla--compacta' });
      tabla.appendChild(U.crear('thead', {}, [U.crear('tr', {}, [
        U.crear('th', { text: 'Categoría' }),
        U.crear('th', { class: 'der', text: 'Gastado' }),
        U.crear('th', { class: 'der', text: 'Promedio 6 meses' }),
        U.crear('th', { class: 'der', text: 'Mediana' }),
        U.crear('th', { class: 'der', text: 'Tendencia' }),
        U.crear('th', { class: 'der', text: 'Movimientos' }),
        U.crear('th', { text: 'Frente al promedio' })
      ])]));
      var tb = U.crear('tbody');
      resumen.filas.forEach(function (f) {
        var stats = A.estadisticasCategoria(f.categoriaId, U.ultimosPeriodos(6, U.sumarMeses(periodo, -1)));
        var dif = stats.media ? U.redondear((f.total - stats.media) / stats.media * 100) : 0;
        tb.appendChild(U.crear('tr', {}, [
          U.crear('td', {}, [
            U.crear('span', { class: 'punto-cat', style: 'background:' + f.color }),
            document.createTextNode(f.nombre)
          ]),
          U.crear('td', { class: 'der', text: U.moneda(f.total) }),
          U.crear('td', { class: 'der', text: U.moneda(stats.media) }),
          U.crear('td', { class: 'der', text: U.moneda(stats.mediana) }),
          U.crear('td', { class: 'der ' + (stats.tendencia > 0 ? 'mov__monto--neg' : 'mov__monto--pos'), text: (stats.tendencia > 0 ? '↑ ' : '↓ ') + U.moneda(Math.abs(stats.tendencia)) }),
          U.crear('td', { class: 'der', text: String(f.cantidad) }),
          U.crear('td', {}, [UI.chip(
            dif > 0 ? '+' + dif + ' %' : dif + ' %',
            null, dif > 15 ? 'chip--excedido' : (dif < -15 ? 'chip--ok' : 'chip--sin-limite'))])
        ]));
      });
      tabla.appendChild(tb);
      tarjetaCat.appendChild(U.crear('div', { class: 'tabla-scroll' }, [tabla]));
      tarjetaCat.appendChild(U.crear('p', {
        class: 'nota-pie',
        text: 'El promedio y la mediana se calculan con los seis meses anteriores al periodo consultado (estadística descriptiva del motor).'
      }));
    }
    vista.appendChild(tarjetaCat);

    /* -------------------------------------- comparación entre periodos */
    var periodos = U.ultimosPeriodos(rango);
    var tarjetaComp = U.crear('section', { class: 'tarjeta' });
    tarjetaComp.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Comparación de los últimos ' + rango + ' meses' }),
      UI.leyenda([
        { etiqueta: 'Ingresos', color: '#2E9E6B' },
        { etiqueta: 'Gastos', color: '#D64545' }
      ])
    ]));
    tarjetaComp.appendChild(U.crear('canvas', { class: 'canvas-barras canvas-barras--alto', id: 'barras-analisis' }));
    var serie = A.seriePeriodos(periodos);
    var tablaComp = U.crear('table', { class: 'tabla tabla--compacta' });
    tablaComp.appendChild(U.crear('thead', {}, [U.crear('tr', {}, [
      U.crear('th', { text: 'Mes' }), U.crear('th', { class: 'der', text: 'Ingresos' }),
      U.crear('th', { class: 'der', text: 'Gastos' }), U.crear('th', { class: 'der', text: 'Ahorro' }),
      U.crear('th', { class: 'der', text: 'Tasa de ahorro' })
    ])]));
    var tbComp = U.crear('tbody');
    serie.forEach(function (s) {
      var ah = A.ahorroDelMes(s.periodo);
      tbComp.appendChild(U.crear('tr', { class: s.periodo === periodo ? 'fila--activa' : '' }, [
        U.crear('td', { text: U.nombreMes(s.periodo) }),
        U.crear('td', { class: 'der mov__monto--pos', text: '+' + U.moneda(s.ingresos) }),
        U.crear('td', { class: 'der mov__monto--neg', text: '−' + U.moneda(s.gastos) }),
        U.crear('td', { class: 'der', text: U.moneda(s.neto) }),
        U.crear('td', { class: 'der', text: ah.tasaAhorro + ' %' })
      ]));
    });
    tablaComp.appendChild(tbComp);
    tarjetaComp.appendChild(U.crear('div', { class: 'tabla-scroll' }, [tablaComp]));
    vista.appendChild(tarjetaComp);

    /* ------------------------------------------------ top 3 y calendario */
    var dos = U.crear('section', { class: 'grid grid--2' });

    var topGastos = A.topGastos(periodo, 3);
    var tarjetaTop = U.crear('div', { class: 'tarjeta' }, [
      U.crear('header', { class: 'tarjeta__cabecera' }, [U.crear('h2', { text: 'Top 3 de gastos más altos' })])
    ]);
    if (!topGastos.length) {
      tarjetaTop.appendChild(UI.vacio('Sin gastos', 'Registra gastos para ver el ranking del mes.'));
    } else {
      tarjetaTop.appendChild(U.crear('div', { class: 'top-lista' }, topGastos.map(function (g, i) {
        return U.crear('div', { class: 'top-item' }, [
          U.crear('span', { class: 'top-item__num', style: 'background:' + g.color, text: String(i + 1) }),
          U.crear('span', { class: 'top-item__det' }, [
            U.crear('b', { text: g.descripcion }),
            U.crear('small', { text: U.formatoFechaLarga(g.fecha) + ' · ' + g.nombreCategoria })
          ]),
          U.crear('span', { class: 'top-item__monto', text: U.moneda(g.monto) })
        ]);
      })));
      tarjetaTop.appendChild(U.crear('p', {
        class: 'nota-pie',
        text: 'Juntos representan ' + U.porcentaje(U.suma(topGastos, function (g) { return g.monto; }), resumen.total) + ' % del gasto del mes.'
      }));
    }
    dos.appendChild(tarjetaTop);

    var tarjetaCal = U.crear('div', { class: 'tarjeta' }, [
      U.crear('header', { class: 'tarjeta__cabecera' }, [
        U.crear('h2', { text: 'Calendario de ' + U.nombreMes(periodo) }),
        UI.leyenda([{ etiqueta: 'Ingresos', color: '#2E9E6B' }, { etiqueta: 'Gastos', color: '#D64545' }])
      ])
    ]);
    tarjetaCal.appendChild(calendario(periodo));
    dos.appendChild(tarjetaCal);

    vista.appendChild(dos);

    return vista;
  }

  /* ---------------------------------------------------------------- piezas */
  function kpi(titulo, valor, pie, color) {
    return U.crear('div', { class: 'kpi', style: '--kpi:' + color }, [
      U.crear('span', { class: 'kpi__titulo', text: titulo }),
      U.crear('b', { class: 'kpi__valor', text: valor }),
      U.crear('small', { class: 'kpi__pie', text: pie })
    ]);
  }

  function variacion(pct, texto) {
    var signo = pct > 0 ? '+' : '';
    return signo + pct + ' % ' + texto;
  }

  function boton(texto, clase, fn, iconoNodo) {
    return U.crear('button', { class: clase, type: 'button', onclick: fn }, [
      iconoNodo || null, document.createTextNode(texto)
    ]);
  }

  function selectorPeriodo() {
    var sel = U.crear('select', { class: 'select-periodo', 'aria-label': 'Periodo de análisis' });
    U.ultimosPeriodos(12).reverse().forEach(function (p) {
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

  function tarjetaProyeccion(proy, general) {
    var tarjeta = U.crear('div', { class: 'tarjeta' });
    tarjeta.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Proyección de cierre de mes' }),
      U.crear('span', { class: 'chip chip--' + general.nivel, text: general.etiqueta })
    ]));
    if (proy.cerrado) {
      tarjeta.appendChild(U.crear('p', { class: 'nota-pie', text: 'Este periodo ya cerró: el total mostrado es definitivo.' }));
    }
    tarjeta.appendChild(U.crear('div', { class: 'global-montos' }, [
      U.crear('div', {}, [
        U.crear('span', { class: 'etiqueta-mini', text: 'Gasto actual' }),
        U.crear('b', { class: 'monto-grande', text: U.moneda(proy.gastoActual) }),
        U.crear('small', { text: proy.transcurridos + ' de ' + proy.dias + ' días' })
      ]),
      U.crear('div', {}, [
        U.crear('span', { class: 'etiqueta-mini', text: 'Estimado al cierre' }),
        U.crear('b', { class: 'monto-grande ' + (proy.excede ? 'texto-peligro' : ''), text: U.moneda(proy.gastoEstimado) }),
        U.crear('small', { text: 'Promedio diario ' + U.moneda(proy.promedioDiario) })
      ]),
      U.crear('div', {}, [
        U.crear('span', { class: 'etiqueta-mini', text: 'Límite mensual' }),
        U.crear('b', { class: 'monto-grande', text: proy.limite ? U.moneda(proy.limite) : 'Sin definir' }),
        U.crear('small', { text: proy.limite ? proy.porcentajeConsumido + ' % proyectado' : 'Defínelo en Presupuesto' })
      ])
    ]));
    if (proy.limite) {
      tarjeta.appendChild(UI.barraProgreso(Math.min(100, proy.porcentajeConsumido),
        proy.excede ? '#D64545' : '#0F8B8D'));
    }
    if (proy.gastosRecurrentesPendientes || proy.ingresosRecurrentesPendientes) {
      tarjeta.appendChild(U.crear('p', { class: 'nota-pie' }, [
        'Incluye recurrencias pendientes: ',
        U.crear('b', { text: U.moneda(proy.gastosRecurrentesPendientes) }), ' de gasto y ',
        U.crear('b', { text: U.moneda(proy.ingresosRecurrentesPendientes) }), ' de ingreso.'
      ]));
    }
    if (!proy.confiable && !proy.cerrado) {
      tarjeta.appendChild(U.crear('p', { class: 'nota-pie', text: 'La proyección es más precisa a partir del quinto día del mes.' }));
    }
    return tarjeta;
  }

  function tarjetaPatrones(periodoActual) {
    var tarjeta = U.crear('div', { class: 'tarjeta' });
    var patrones = A.detectarPatrones(periodoActual);
    tarjeta.appendChild(U.crear('header', { class: 'tarjeta__cabecera' }, [
      U.crear('h2', { text: 'Patrones de consumo detectados' }),
      U.crear('span', { class: 'tarjeta__contador', text: String(patrones.length) })
    ]));
    if (!patrones.length) {
      tarjeta.appendChild(UI.vacio('Sin patrones relevantes', 'El motor no encontró comportamientos que requieran atención.'));
      return tarjeta;
    }
    tarjeta.appendChild(U.crear('div', { class: 'patrones' }, patrones.map(function (p) {
      return U.crear('div', { class: 'patron patron--' + p.severidad }, [
        U.crear('div', { class: 'patron__cab' }, [
          U.crear('b', { text: p.titulo }),
          p.monto ? U.crear('span', { class: 'patron__monto', text: U.moneda(p.monto) }) : null
        ]),
        U.crear('p', { text: p.detalle }),
        p.ahorroEstimado > 0
          ? U.crear('small', { class: 'patron__ahorro', text: 'Podrías liberar ' + U.moneda(p.ahorroEstimado) })
          : null
      ]);
    })));
    return tarjeta;
  }

  function alertaNodo(a) {
    var iconos = { critico: '⛔', aviso: '⚠', info: 'ℹ', exito: '✓' };
    return U.crear('div', { class: 'alerta alerta--' + a.nivel }, [
      U.crear('span', { class: 'alerta__icono', text: iconos[a.nivel] || 'ℹ' }),
      U.crear('div', { class: 'alerta__cuerpo' }, [
        U.crear('b', { text: a.titulo }),
        U.crear('p', { text: a.mensaje }),
        U.crear('small', { text: 'Regla: ' + (a.dato || a.tipo) })
      ])
    ]);
  }

  function calendario(p) {
    var mapa = A.gastoPorDia(p);
    var dias = U.diasDelMes(p);
    var primer = U.desdeISO(p + '-01');
    var desplazamiento = (primer.getDay() + 6) % 7;   // lunes = 0
    var rejilla = U.crear('div', { class: 'calendario' });
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(function (d) {
      rejilla.appendChild(U.crear('div', { class: 'calendario__dia-semana', text: d }));
    });
    for (var i = 0; i < desplazamiento; i++) {
      rejilla.appendChild(U.crear('div', { class: 'calendario__hueco' }));
    }
    var maxGasto = 0;
    Object.keys(mapa).forEach(function (k) { maxGasto = Math.max(maxGasto, mapa[k].gastos); });

    for (var d = 1; d <= dias; d++) {
      var iso = p + '-' + U.pad(d);
      var info = mapa[iso] || { ingresos: 0, gastos: 0, movimientos: [] };
      var intensidad = maxGasto ? Math.min(1, info.gastos / maxGasto) : 0;
      var celda = U.crear('div', {
        class: 'calendario__celda' + (iso === U.hoyISO() ? ' calendario__celda--hoy' : '') +
          (info.movimientos.length ? ' calendario__celda--con-datos' : ''),
        style: info.gastos ? '--intensidad:' + intensidad.toFixed(2) : null,
        title: info.movimientos.length
          ? info.movimientos.length + ' movimiento(s) · ingresos ' + U.moneda(info.ingresos) + ' · gastos ' + U.moneda(info.gastos)
          : 'Sin movimientos',
        onclick: info.movimientos.length ? function () { verDia(iso, info); } : null
      }, [
        U.crear('span', { class: 'calendario__num', text: String(d) }),
        info.gastos ? U.crear('span', { class: 'calendario__gasto', text: '−' + U.monedaCorta(info.gastos) }) : null,
        info.ingresos ? U.crear('span', { class: 'calendario__ingreso', text: '+' + U.monedaCorta(info.ingresos) }) : null
      ]);
      rejilla.appendChild(celda);
    }
    return rejilla;
  }

  function verDia(iso, info) {
    var lista = U.crear('div', { class: 'mov-lista' }, U.ordenar(info.movimientos, 'monto', true).map(function (m) {
      var esIngreso = m.tipo === 'ingreso';
      return U.crear('div', { class: 'mov' }, [
        U.crear('span', {
          class: 'mov__icono',
          style: 'background:' + (esIngreso ? '#2E9E6B' : App.state.colorCategoria(m.categoriaId)),
          text: esIngreso ? '↑' : '↓'
        }),
        U.crear('span', { class: 'mov__det' }, [
          U.crear('b', { text: m.descripcion }),
          U.crear('small', { text: App.state.nombreCategoria(m.categoriaId) + ' · ' + App.state.nombreCuenta(m.cuentaId) })
        ]),
        U.crear('span', {
          class: 'mov__monto ' + (esIngreso ? 'mov__monto--pos' : 'mov__monto--neg'),
          text: (esIngreso ? '+' : '−') + U.moneda(m.monto)
        })
      ]);
    }));
    UI.modal({
      titulo: U.formatoFechaLarga(iso) + ' · ' + U.moneda(info.gastos) + ' en gastos',
      contenido: lista
    });
  }

  function abrirReglas() {
    var r = App.state.ajustes().reglas;
    var f = UI.formulario([
      { nombre: 'umbralAviso', etiqueta: 'Umbral de advertencia (%)', tipo: 'number', min: '10', max: '100', valor: r.umbralAviso, ayuda: 'Porcentaje del límite que dispara el aviso.' },
      { nombre: 'umbralLimite', etiqueta: 'Umbral de límite superado (%)', tipo: 'number', min: '50', max: '200', valor: r.umbralLimite },
      { nombre: 'gastoHormigaMonto', etiqueta: 'Monto máximo de un gasto hormiga', tipo: 'number', min: '1', valor: r.gastoHormigaMonto },
      { nombre: 'gastoHormigaMinimo', etiqueta: 'Cantidad mínima de gastos hormiga para avisar', tipo: 'number', min: '2', valor: r.gastoHormigaMinimo },
      { nombre: 'tendenciaSemanas', etiqueta: 'Semanas consecutivas para detectar tendencia', tipo: 'number', min: '2', max: '5', valor: r.tendenciaSemanas },
      { nombre: 'tendenciaPorcentaje', etiqueta: 'Incremento mínimo para considerar tendencia (%)', tipo: 'number', min: '5', valor: r.tendenciaPorcentaje },
      { nombre: 'diasParaProyeccion', etiqueta: 'Días mínimos para calcular la proyección', tipo: 'number', min: '1', max: '25', valor: r.diasParaProyeccion }
    ]);
    var m = UI.modal({
      titulo: 'Reglas del motor de análisis',
      contenido: U.crear('div', {}, [
        U.crear('p', { class: 'nota-pie', text: 'El motor es explicable: cada alerta y recomendación indica la regla que la activó. Puedes ajustar los umbrales a tu situación.' }),
        f.nodo
      ]),
      acciones: [
        U.crear('button', {
          class: 'btn btn--fantasma', type: 'button', text: 'Restaurar valores',
          onclick: function () {
            App.state.ajustes().reglas = {
              umbralAviso: 80, umbralLimite: 100, gastoHormigaMonto: 150,
              gastoHormigaMinimo: 4, tendenciaSemanas: 3, tendenciaPorcentaje: 15,
              diasParaProyeccion: 5
            };
            App.state.guardar('reglas-restauradas');
            App.notify.info('Reglas restauradas a los valores recomendados.');
            m.cerrar();
            App.app.refrescar();
          }
        }),
        U.crear('button', {
          class: 'btn btn--primario', type: 'button', text: 'Guardar reglas',
          onclick: function () {
            var v = UI.valores(f.campos);
            var reglas = App.state.ajustes().reglas;
            Object.keys(v).forEach(function (k) { reglas[k] = U.num(v[k]); });
            App.state.guardar('reglas');
            App.notify.exito('Reglas actualizadas. El análisis se recalculó.');
            m.cerrar();
            App.app.refrescar();
          }
        })
      ]
    });
  }

  /* ------------------------------------------------------------ gráficas */
  function pintar(nodo) {
    var resumen = A.resumenPorCategoria(periodo, 'gasto');
    var dona = nodo.querySelector('#dona-analisis');
    if (dona && resumen.filas.length) {
      UI.dona(dona, resumen.filas.map(function (f) {
        return { etiqueta: f.nombre, valor: f.total, color: f.color };
      }), { etiqueta: U.nombreMesCorto(periodo), valorTexto: U.moneda(resumen.total) });
    }
    var barras = nodo.querySelector('#barras-analisis');
    if (barras) {
      var serie = A.seriePeriodos(U.ultimosPeriodos(rango));
      UI.barras(barras, {
        etiquetas: serie.map(function (s) { return s.etiqueta; }),
        series: [
          { nombre: 'Ingresos', color: '#2E9E6B', valores: serie.map(function (s) { return s.ingresos; }) },
          { nombre: 'Gastos', color: '#D64545', valores: serie.map(function (s) { return s.gastos; }) }
        ]
      });
    }
  }

  /* --------------------------------------------------------- exportación */
  function exportarReporte() {
    var lineas = [];
    var t = A.totalesPeriodo(periodo);
    var proy = A.proyeccion(periodo);
    var resumen = A.resumenPorCategoria(periodo, 'gasto');

    lineas.push('REPORTE DE ANÁLISIS FINANCIERO');
    lineas.push('Proyecto,"Control de Gastos con Análisis Inteligente"');
    lineas.push('Periodo,"' + U.nombreMes(periodo) + '"');
    lineas.push('Generado,"' + new Date().toLocaleString('es-MX') + '"');
    lineas.push('');
    lineas.push('RESUMEN');
    lineas.push('Ingresos,' + t.ingresos.toFixed(2));
    lineas.push('Gastos,' + t.gastos.toFixed(2));
    lineas.push('Ahorro,' + t.neto.toFixed(2));
    lineas.push('Saldo disponible,' + A.saldoDisponible().toFixed(2));
    lineas.push('Gasto estimado al cierre,' + proy.gastoEstimado.toFixed(2));
    lineas.push('');
    lineas.push('GASTO POR CATEGORÍA');
    lineas.push('Categoría,Total,Porcentaje,Movimientos,Límite,Consumo %');
    resumen.filas.forEach(function (f) {
      lineas.push([f.nombre, f.total.toFixed(2), f.porcentaje, f.cantidad,
        f.limite ? f.limite.toFixed(2) : '', f.limite ? f.consumo : ''].join(','));
    });
    lineas.push('');
    lineas.push('ALERTAS ACTIVAS');
    lineas.push('Nivel,Título,Detalle,Regla');
    INT.alertas(periodo).forEach(function (a) {
      lineas.push([a.nivel, comilla(a.titulo), comilla(a.mensaje), comilla(a.dato || a.tipo)].join(','));
    });
    lineas.push('');
    lineas.push('RECOMENDACIONES');
    lineas.push('Prioridad,Título,Recomendación,Ahorro estimado,Criterio');
    INT.recomendaciones(periodo).forEach(function (r) {
      lineas.push([r.prioridad, comilla(r.titulo), comilla(r.mensaje),
        (r.ahorroEstimado || 0).toFixed(2), comilla(r.base)].join(','));
    });
    lineas.push('');
    lineas.push('TOP 3 DE GASTOS');
    A.topGastos(periodo, 3).forEach(function (g) {
      lineas.push([g.fecha, comilla(g.descripcion), comilla(g.nombreCategoria), g.monto.toFixed(2)].join(','));
    });

    U.descargar('reporte_' + periodo + '.csv', '\ufeff' + lineas.join('\n'), 'text/csv;charset=utf-8');
    App.notify.exito('Reporte del periodo exportado en CSV.');
  }

  function comilla(texto) {
    return '"' + String(texto || '').replace(/"/g, '""') + '"';
  }

  App.views = App.views || {};
  App.views.analisis = {
    montar: montar, render: render,
    periodo: function (p) { if (p) { periodo = p; } return periodo; },
    exportarReporte: exportarReporte
  };
})(window);
