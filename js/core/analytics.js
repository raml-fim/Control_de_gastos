/* ============================================================================
 * js/core/analytics.js — cálculos financieros
 * ---------------------------------------------------------------------------
 * Concentra toda la aritmética del producto: saldos, totales del periodo,
 * resúmenes por categoría, comparación entre periodos, proyección de cierre
 * de mes y detección de patrones. La UI nunca calcula: solo pinta lo que
 * devuelve este módulo.
 * Requerimientos: RF-04, RF-05, RF-09, RF-11, RF-17, RF-20, RF-21.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;

  var GLOBAL = '__global__';

  /* ------------------------------------------------------------- filtros */
  /**
   * Filtra movimientos (RF-12). Todos los criterios son opcionales.
   * @param {object} f {periodo, desde, hasta, tipo, categoriaId, cuentaId, texto, montoMin, montoMax}
   */
  function filtrar(f) {
    f = f || {};
    return App.movimientos.filtrar(function (m) {
      if (f.periodo && m.periodo !== f.periodo) { return false; }
      if (f.desde && m.fecha < f.desde) { return false; }
      if (f.hasta && m.fecha > f.hasta) { return false; }
      if (f.tipo && f.tipo !== 'todos' && m.tipo !== f.tipo) { return false; }
      if (f.categoriaId && f.categoriaId !== 'todas' && m.categoriaId !== f.categoriaId) { return false; }
      if (f.cuentaId && f.cuentaId !== 'todas' && m.cuentaId !== f.cuentaId) { return false; }
      if (f.montoMin !== undefined && f.montoMin !== '' && U.num(m.monto) < U.num(f.montoMin)) { return false; }
      if (f.montoMax !== undefined && f.montoMax !== '' && U.num(m.monto) > U.num(f.montoMax)) { return false; }
      if (f.texto) {
        var heno = [m.descripcion, App.state.nombreCategoria(m.categoriaId), App.state.nombreCuenta(m.cuentaId)].join(' ');
        if (!U.incluye(heno, f.texto)) { return false; }
      }
      return true;
    });
  }

  /* -------------------------------------------------------------- totales */
  /** Totales de un conjunto de movimientos. */
  function totales(movs) {
    var ingresos = 0, gastos = 0;
    movs.forEach(function (m) {
      if (m.tipo === 'ingreso') { ingresos += U.num(m.monto); }
      else { gastos += U.num(m.monto); }
    });
    return {
      ingresos: U.redondear(ingresos),
      gastos: U.redondear(gastos),
      neto: U.redondear(ingresos - gastos),
      registros: movs.length
    };
  }

  /** Total del periodo indicado (por defecto el actual). */
  function totalesPeriodo(periodo) {
    return totales(App.state.movimientosDe(periodo || U.periodoActual()));
  }

  /** RF-04: saldo disponible = ingresos − gastos de toda la historia. */
  function saldoDisponible() {
    return totales(App.movimientos.todos()).neto;
  }

  /** Saldo por cuenta (RF-26): saldo inicial + ingresos − gastos − aportes + retiros. */
  function saldoPorCuenta() {
    return App.state.cuentas().map(function (c) {
      var movs = App.movimientos.filtrar(function (m) { return m.cuentaId === c.id; });
      var t = totales(movs);
      var aportes = U.suma(App.aportes.filtrar(function (a) { return a.cuentaId === c.id; }),
        function (a) { return a.monto; });
      var saldo = U.redondear(U.num(c.saldoInicial) + t.ingresos - t.gastos - aportes);
      return {
        cuenta: c, ingresos: t.ingresos, gastos: t.gastos,
        aportes: U.redondear(aportes), saldo: saldo, movimientos: t.registros
      };
    });
  }

  function saldoTotalCuentas() {
    return U.redondear(U.suma(saldoPorCuenta(), function (x) { return x.saldo; }));
  }

  /* ---------------------------------------------- resumen por categoría */
  /** RF-05: resumen del gasto por categoría con total y porcentaje. */
  function resumenPorCategoria(periodo, tipo) {
    var tipoFiltro = tipo || 'gasto';
    var movs = App.state.movimientosDe(periodo).filter(function (m) { return m.tipo === tipoFiltro; });
    var total = U.suma(movs, function (m) { return m.monto; });
    var grupos = U.agrupar(movs, function (m) { return m.categoriaId; });
    var filas = Object.keys(grupos).map(function (catId) {
      var lista = grupos[catId];
      var suma = U.suma(lista, function (m) { return m.monto; });
      var limite = tipoFiltro === 'gasto' ? App.state.limiteCategoria(periodo, catId) : 0;
      return {
        categoriaId: catId,
        nombre: App.state.nombreCategoria(catId),
        color: App.state.colorCategoria(catId),
        icono: (App.state.categoria(catId) || {}).icono || '•',
        total: U.redondear(suma),
        porcentaje: U.porcentaje(suma, total),
        cantidad: lista.length,
        promedio: U.redondear(suma / lista.length),
        maximo: U.redondear(Math.max.apply(null, lista.map(function (m) { return U.num(m.monto); }))),
        limite: U.redondear(limite),
        consumo: limite ? U.porcentaje(suma, limite) : 0,
        disponible: limite ? U.redondear(limite - suma) : null
      };
    });
    return {
      periodo: periodo, tipo: tipoFiltro, total: U.redondear(total),
      filas: U.ordenar(filas, 'total', true)
    };
  }

  /** Serie por categoría para varios periodos (RF-21). */
  function seriePorCategoria(categorias, periodos) {
    return (categorias || []).map(function (catId) {
      return {
        categoriaId: catId,
        nombre: App.state.nombreCategoria(catId),
        color: App.state.colorCategoria(catId),
        valores: periodos.map(function (p) {
          return U.redondear(U.suma(App.state.movimientosDe(p).filter(function (m) {
            return m.tipo === 'gasto' && m.categoriaId === catId;
          }), function (m) { return m.monto; }));
        })
      };
    });
  }

  /** Totales por periodo para la gráfica comparativa (RF-21). */
  function seriePeriodos(periodos) {
    return periodos.map(function (p) {
      var t = totalesPeriodo(p);
      return { periodo: p, etiqueta: U.nombreMesCorto(p), ingresos: t.ingresos, gastos: t.gastos, neto: t.neto };
    });
  }

  /** Variación porcentual entre dos periodos. */
  function compararPeriodos(base, contra) {
    var a = totalesPeriodo(base), b = totalesPeriodo(contra);
    function varDe(x, y) {
      if (!x) { return y ? 100 : 0; }
      return U.redondear((y - x) / x * 100);
    }
    return {
      base: base, contra: contra,
      gastosBase: a.gastos, gastosContra: b.gastos,
      variacionGastos: varDe(a.gastos, b.gastos),
      ingresosBase: a.ingresos, ingresosContra: b.ingresos,
      variacionIngresos: varDe(a.ingresos, b.ingresos),
      ahorroBase: a.neto, ahorroContra: b.neto
    };
  }

  /* --------------------------------------------------- top de gastos */
  /** RF-09: los tres gastos individuales más altos del periodo. */
  function topGastos(periodo, cantidad) {
    var n = cantidad || 3;
    var gastos = App.state.movimientosDe(periodo).filter(function (m) { return m.tipo === 'gasto'; });
    return U.ordenar(gastos, 'monto', true).slice(0, n).map(function (m) {
      return {
        id: m.id, fecha: m.fecha, monto: m.monto, descripcion: m.descripcion,
        categoriaId: m.categoriaId, nombreCategoria: App.state.nombreCategoria(m.categoriaId),
        color: App.state.colorCategoria(m.categoriaId)
      };
    });
  }

  /** Top de categorías por gasto acumulado (RF-05 y RF-11). */
  function categoriaMayorGasto(periodo) {
    var r = resumenPorCategoria(periodo, 'gasto');
    return r.filas.length ? r.filas[0] : null;
  }

  /* ------------------------------------------------ proyección de cierre */
  /** RF-17: estimación del gasto al cierre del mes y aviso de sobregiro. */
  function proyeccion(periodo) {
    var p = periodo || U.periodoActual();
    var t = totalesPeriodo(p);
    var dias = U.diasDelMes(p);
    var transcurridos = U.diasTranscurridos(p);
    var reglas = App.state.ajustes().reglas;
    var pendientes = recurrenciasPendientes(p);

    if (p < U.periodoActual()) {
      return {
        periodo: p, cerrado: true, dias: dias, transcurridos: dias,
        gastoActual: t.gastos, gastoEstimado: t.gastos, ingresosEstimados: t.ingresos,
        promedioDiario: dias ? U.redondear(t.gastos / dias) : 0,
        gastosRecurrentesPendientes: 0, ingresosRecurrentesPendientes: 0,
        limite: App.state.limiteGlobal(p), excede: false, confiable: true
      };
    }

    var promedioDiario = transcurridos ? t.gastos / transcurridos : 0;
    var restantes = Math.max(0, dias - transcurridos);
    var gastoEstimado = U.redondear(t.gastos + promedioDiario * restantes + pendientes.gastos);
    var ingresosEstimados = U.redondear(t.ingresos + pendientes.ingresos);
    var limite = App.state.limiteGlobal(p);

    // La proyección solo se considera fiable cuando hay suficientes días de
    // datos y una base de gasto real: evita proyecciones absurdas al inicio.
    var minimo = reglas.diasParaProyeccion || 5;
    var confiable = transcurridos >= minimo && t.gastos > 0;

    return {
      periodo: p, cerrado: false, dias: dias, transcurridos: transcurridos,
      restantes: restantes,
      gastoActual: t.gastos,
      gastoEstimado: gastoEstimado,
      ingresosActuales: t.ingresos,
      ingresosEstimados: ingresosEstimados,
      promedioDiario: U.redondear(promedioDiario),
      gastosRecurrentesPendientes: U.redondear(pendientes.gastos),
      ingresosRecurrentesPendientes: U.redondear(pendientes.ingresos),
      limite: limite,
      porcentajeConsumido: limite ? U.porcentaje(gastoEstimado, limite) : 0,
      excede: confiable && limite > 0 && gastoEstimado > limite,
      exceso: confiable && limite > 0 ? U.redondear(Math.max(0, gastoEstimado - limite)) : 0,
      confiable: confiable
    };
  }

  /** Suma de recurrencias que aún no se han registrado en el periodo. */
  function recurrenciasPendientes(periodo) {
    var gastos = 0, ingresos = 0;
    App.recurrentes.todos().forEach(function (r) {
      if (!r.activo) { return; }
      var fechas = fechasDelPeriodo(r, periodo);
      fechas.forEach(function (iso) {
        var yaEsta = App.movimientos.filtrar(function (m) {
          return m.recurrenteId === r.id && m.fecha === iso;
        }).length;
        if (yaEsta) { return; }
        if (r.tipo === 'ingreso') { ingresos += U.num(r.monto); }
        else { gastos += U.num(r.monto); }
      });
    });
    return { gastos: U.redondear(gastos), ingresos: U.redondear(ingresos) };
  }

  /** Fechas del periodo en que debería caer una recurrencia, según su frecuencia. */
  function fechasDelPeriodo(r, periodo) {
    var dias = U.diasDelMes(periodo);
    var dia = Math.min(parseInt(r.dia, 10) || 1, dias);
    var fechas = [];
    if (r.frecuencia === 'mensual') {
      fechas.push(periodo + '-' + U.pad(dia));
    } else if (r.frecuencia === 'quincenal') {
      fechas.push(periodo + '-' + U.pad(dia));
      var segunda = Math.min(dia + 15, dias);
      if (segunda > dia) { fechas.push(periodo + '-' + U.pad(segunda)); }
    } else if (r.frecuencia === 'semanal') {
      for (var d = dia; d <= dias; d += 7) { fechas.push(periodo + '-' + U.pad(d)); }
    } else if (r.frecuencia === 'anual') {
      var mes = (r.mes || 1);
      if (Number(periodo.split('-')[1]) === Number(mes)) {
        fechas.push(periodo + '-' + U.pad(dia));
      }
    }
    return fechas;
  }

  /* ------------------------------------------------------- presupuestos */
  /** RF-06, RF-07 y RF-12: estado de los límites del periodo. */
  function estadoPresupuestos(periodo) {
    var p = periodo || U.periodoActual();
    var resumen = resumenPorCategoria(p, 'gasto');
    var reglas = App.state.ajustes().reglas;
    var filas = resumen.filas.filter(function (f) { return f.limite > 0; }).map(function (f) {
      return Object.assign({}, f, {
        estado: f.consumo >= reglas.umbralLimite ? 'excedido'
          : (f.consumo >= reglas.umbralAviso ? 'aviso' : 'ok')
      });
    });
    var totalGastado = resumen.total;
    var global = App.state.limiteGlobal(p);
    return {
      periodo: p,
      categorias: filas,
      totalGastado: totalGastado,
      sinLimite: resumen.filas.filter(function (f) { return !f.limite; }),
      global: {
        limite: global,
        gastado: totalGastado,
        disponible: global ? U.redondear(global - totalGastado) : null,
        consumo: global ? U.porcentaje(totalGastado, global) : 0,
        estado: !global ? 'sin-limite'
          : (totalGastado >= global ? 'excedido'
            : (U.porcentaje(totalGastado, global) >= reglas.umbralAviso ? 'aviso' : 'ok'))
      }
    };
  }

  /* -------------------------------------------------------- patrones */
  /**
   * Detección de patrones de consumo: gastos hormiga, tendencias al alza y
   * variaciones fuertes por categoría. Alimenta al motor de recomendaciones.
   */
  function detectarPatrones(periodo) {
    var p = periodo || U.periodoActual();
    var reglas = App.state.ajustes().reglas;
    var movs = App.state.movimientosDe(p).filter(function (m) { return m.tipo === 'gasto'; });
    var patrones = [];

    /* 1. Gastos hormiga */
    var hormiga = movs.filter(function (m) { return U.num(m.monto) <= reglas.gastoHormigaMonto; });
    if (hormiga.length >= reglas.gastoHormigaMinimo) {
      var totalHormiga = U.suma(hormiga, function (m) { return m.monto; });
      patrones.push({
        tipo: 'hormiga',
        titulo: 'Gastos hormiga detectados',
        detalle: hormiga.length + ' compras de ' + U.moneda(reglas.gastoHormigaMonto) +
          ' o menos suman ' + U.moneda(totalHormiga) + ' este mes.',
        monto: U.redondear(totalHormiga),
        cantidad: hormiga.length,
        severidad: U.porcentaje(totalHormiga, U.suma(movs, function (m) { return m.monto; })) > 15 ? 'media' : 'baja',
        ahorroEstimado: U.redondear(totalHormiga * 0.4),
        accion: 'Agrupar estas compras y fijar un tope semanal para ellas.'
      });
    }

    /* 2. Tendencia al alza por categoría en las últimas semanas */
    var semanas = agruparPorSemana(movs, p);
    resumenPorCategoria(p, 'gasto').filas.slice(0, 6).forEach(function (fila) {
      var serie = semanas.map(function (s) { return U.suma(s.filter(function (m) { return m.categoriaId === fila.categoriaId; }), function (m) { return m.monto; }); });
      var n = reglas.tendenciaSemanas;
      if (serie.length >= n) {
        var ultimas = serie.slice(-n);
        var creciente = ultimas.every(function (v, i) { return i === 0 || v > ultimas[i - 1]; });
        var variacion = ultimas[0] ? U.redondear((ultimas[n - 1] - ultimas[0]) / ultimas[0] * 100) : 0;
        if (creciente && variacion >= reglas.tendenciaPorcentaje) {
          patrones.push({
            tipo: 'tendencia',
            categoriaId: fila.categoriaId,
            titulo: fila.nombre + ' va al alza',
            detalle: 'El gasto aumentó ' + variacion + ' % en las últimas ' + n +
              ' semanas (' + U.moneda(ultimas[0]) + ' → ' + U.moneda(ultimas[n - 1]) + ').',
            monto: fila.total, variacion: variacion, severidad: 'media',
            ahorroEstimado: U.redondear(ultimas[n - 1] * 0.3),
            accion: 'Revisar los gastos de ' + fila.nombre + ' de la última semana.'
          });
        }
      }
    });

    /* 3. Comparación con el mes anterior */
    var anterior = U.sumarMeses(p, -1);
    var tAct = totalesPeriodo(p), tAnt = totalesPeriodo(anterior);
    if (tAnt.gastos > 0) {
      var dif = U.redondear((tAct.gastos - tAnt.gastos) / tAnt.gastos * 100);
      if (Math.abs(dif) >= 10) {
        patrones.push({
          tipo: 'comparacion',
          titulo: dif > 0 ? 'Gastas más que el mes pasado' : 'Gastas menos que el mes pasado',
          detalle: (dif > 0 ? 'Aumentó ' : 'Disminuyó ') + Math.abs(dif) + ' % respecto a ' +
            U.nombreMes(anterior) + ' (' + U.moneda(tAnt.gastos) + ' → ' + U.moneda(tAct.gastos) + ').',
          variacion: dif, monto: U.redondear(Math.abs(tAct.gastos - tAnt.gastos)),
          severidad: dif > 0 ? 'media' : 'baja',
          ahorroEstimado: dif > 0 ? U.redondear((tAct.gastos - tAnt.gastos) * 0.5) : 0,
          accion: dif > 0 ? 'Identificar qué categoría creció y ajustarla.' : 'Mantener el ritmo de gasto.'
        });
      }
    }

    /* 4. Racha de registro (hábito) */
    var l = App.state.logros();
    if (l.diasConsecutivos >= 3) {
      patrones.push({
        tipo: 'habito',
        titulo: 'Racha de ' + l.diasConsecutivos + ' días registrando',
        detalle: 'Mantener el registro diario es lo que hace útil el análisis.',
        severidad: 'baja', ahorroEstimado: 0,
        accion: 'Seguir registrando todos los días.'
      });
    }

    return U.ordenar(patrones, 'monto', true);
  }

  /** Agrupa los gastos de un periodo por semana del mes. */
  function agruparPorSemana(movs, periodo) {
    var dias = U.diasDelMes(periodo);
    var semanas = Math.ceil(dias / 7);
    var salida = [];
    for (var i = 0; i < semanas; i++) {
      var desde = i * 7 + 1, hasta = Math.min((i + 1) * 7, dias);
      salida.push(movs.filter(function (m) {
        var d = Number(String(m.fecha).slice(8, 10));
        return d >= desde && d <= hasta;
      }));
    }
    return salida;
  }

  /** Distribución del gasto por día del mes (para el calendario, RF-11). */
  function gastoPorDia(periodo) {
    var dias = U.diasDelMes(periodo);
    var mapa = {};
    for (var d = 1; d <= dias; d++) { mapa[periodo + '-' + U.pad(d)] = { ingresos: 0, gastos: 0, movimientos: [] }; }
    App.state.movimientosDe(periodo).forEach(function (m) {
      var k = m.fecha;
      if (!mapa[k]) { mapa[k] = { ingresos: 0, gastos: 0, movimientos: [] }; }
      if (m.tipo === 'ingreso') { mapa[k].ingresos += U.num(m.monto); }
      else { mapa[k].gastos += U.num(m.monto); }
      mapa[k].movimientos.push(m);
    });
    return mapa;
  }

  /** Estadística descriptiva del gasto por categoría (usa media y desviación). */
  function estadisticasCategoria(categoriaId, periodos) {
    var serie = (periodos || U.ultimosPeriodos(6)).map(function (p) {
      return U.redondear(U.suma(App.state.movimientosDe(p).filter(function (m) {
        return m.tipo === 'gasto' && m.categoriaId === categoriaId;
      }), function (m) { return m.monto; }));
    });
    return {
      categoriaId: categoriaId,
      serie: serie,
      media: U.redondear(U.promedio(serie)),
      mediana: U.redondear(U.mediana(serie)),
      desviacion: U.redondear(U.desviacion(serie)),
      mediaMovil: U.mediaMovil(serie, 3).map(U.redondear),
      tendencia: serie.length > 1 ? (serie[serie.length - 1] - serie[serie.length - 2]) : 0
    };
  }

  /** Ahorro del periodo: ingresos menos gastos de un mes concreto. */
  function ahorroDelMes(periodo) {
    var t = totalesPeriodo(periodo);
    var aportes = U.suma(App.aportes.filtrar(function (a) { return a.periodo === periodo; }),
      function (a) { return a.monto; });
    return {
      periodo: periodo, ingresos: t.ingresos, gastos: t.gastos,
      neto: t.neto, aportes: U.redondear(aportes),
      tasaAhorro: t.ingresos ? U.porcentaje(t.neto, t.ingresos) : 0
    };
  }

  App.analytics = {
    GLOBAL: GLOBAL,
    filtrar: filtrar,
    totales: totales,
    totalesPeriodo: totalesPeriodo,
    saldoDisponible: saldoDisponible,
    saldoPorCuenta: saldoPorCuenta,
    saldoTotalCuentas: saldoTotalCuentas,
    resumenPorCategoria: resumenPorCategoria,
    seriePorCategoria: seriePorCategoria,
    seriePeriodos: seriePeriodos,
    compararPeriodos: compararPeriodos,
    topGastos: topGastos,
    categoriaMayorGasto: categoriaMayorGasto,
    proyeccion: proyeccion,
    recurrenciasPendientes: recurrenciasPendientes,
    fechasDelPeriodo: fechasDelPeriodo,
    estadoPresupuestos: estadoPresupuestos,
    detectarPatrones: detectarPatrones,
    agruparPorSemana: agruparPorSemana,
    gastoPorDia: gastoPorDia,
    estadisticasCategoria: estadisticasCategoria,
    ahorroDelMes: ahorroDelMes
  };
})(window);
