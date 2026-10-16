/* ============================================================================
 * js/core/intelligence.js — motor de análisis inteligente
 * ---------------------------------------------------------------------------
 * Implementa el «asistente virtual» del producto mediante reglas configurables
 * y estadística descriptiva (promedios móviles, comparación entre periodos).
 * Produce alertas (RF-07, RF-20, RF-24) y recomendaciones con ahorro estimado
 * (RF-10 y RF-22). Es determinista y explicable: cada salida indica qué dato
 * la activó.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;
  var A = App.analytics;

  /* ------------------------------------------------------------ alertas */
  function alertasPresupuesto(periodo) {
    var reglas = App.state.ajustes().reglas;
    var estado = A.estadoPresupuestos(periodo);
    var salida = [];

    estado.categorias.forEach(function (f) {
      if (f.estado === 'excedido') {
        salida.push({
          id: 'pres-excedido-' + periodo + '-' + f.categoriaId,
          nivel: 'critico',
          tipo: 'presupuesto',
          categoriaId: f.categoriaId,
          titulo: 'Límite superado en ' + f.nombre,
          mensaje: 'Gastaste ' + U.moneda(f.total) + ' de un límite de ' + U.moneda(f.limite) +
            ' (' + f.consumo + ' %). Exceso: ' + U.moneda(Math.abs(f.disponible)) + '.',
          dato: 'consumo=' + f.consumo + '%'
        });
      } else if (f.estado === 'aviso') {
        salida.push({
          id: 'pres-aviso-' + periodo + '-' + f.categoriaId,
          nivel: 'aviso',
          tipo: 'presupuesto',
          categoriaId: f.categoriaId,
          titulo: f.nombre + ' al ' + f.consumo + ' % del límite',
          mensaje: 'Te quedan ' + U.moneda(f.disponible) + ' de tu presupuesto de ' +
            U.moneda(f.limite) + ' para lo que resta del mes.',
          dato: 'consumo=' + f.consumo + '% >= ' + reglas.umbralAviso + '%'
        });
      }
    });

    var g = estado.global;
    if (g.estado === 'excedido') {
      salida.push({
        id: 'pres-global-excedido-' + periodo,
        nivel: 'critico', tipo: 'presupuesto-global',
        titulo: 'Presupuesto global superado',
        mensaje: 'Llevas ' + U.moneda(g.gastado) + ' de ' + U.moneda(g.limite) +
          ' (' + g.consumo + ' %).',
        dato: 'consumo=' + g.consumo + '%'
      });
    } else if (g.estado === 'aviso') {
      salida.push({
        id: 'pres-global-aviso-' + periodo,
        nivel: 'aviso', tipo: 'presupuesto-global',
        titulo: 'Presupuesto global al ' + g.consumo + ' %',
        mensaje: 'Te quedan ' + U.moneda(g.disponible) + ' del límite mensual de ' +
          U.moneda(g.limite) + '.',
        dato: 'consumo=' + g.consumo + '%'
      });
    }
    return salida;
  }

  /** RF-20 y RF-24: proyección de cierre de mes. */
  function alertasProyeccion(periodo) {
    var p = A.proyeccion(periodo);
    var salida = [];
    if (p.cerrado || !p.limite || !p.confiable) { return salida; }
    if (p.excede) {
      salida.push({
        id: 'proy-' + periodo,
        nivel: 'critico', tipo: 'proyeccion',
        titulo: 'Proyección de cierre por encima del presupuesto',
        mensaje: 'Al ritmo actual cerrarías el mes en ' + U.moneda(p.gastoEstimado) +
          ', es decir ' + U.moneda(p.exceso) + ' por encima de tu límite de ' +
          U.moneda(p.limite) + ' (' + p.porcentajeConsumido + ' %). Podrías ajustar el ritmo ' +
          'o revisar tus límites si no reflejan tu gasto real.',
        dato: 'promedio diario=' + U.moneda(p.promedioDiario) + ', días restantes=' + p.restantes
      });
    } else if (p.porcentajeConsumido >= 90) {
      salida.push({
        id: 'proy-cerca-' + periodo,
        nivel: 'aviso', tipo: 'proyeccion',
        titulo: 'Cierre de mes ajustado',
        mensaje: 'Se estima un cierre de ' + U.moneda(p.gastoEstimado) + ' sobre un límite de ' +
          U.moneda(p.limite) + ' (' + p.porcentajeConsumido + ' %).',
        dato: 'proyección=' + U.moneda(p.gastoEstimado)
      });
    }
    return salida;
  }

  /** Alertas de metas de ahorro (RF-14, RF-15 y RF-24). */
  function alertasMetas() {
    var salida = [];
    var hoy = U.hoyISO();
    App.metas.todos().forEach(function (m) {
      var acumulado = App.state.totalAportado(m.id);
      var avance = m.objetivo ? U.porcentaje(acumulado, m.objetivo) : 0;
      if (acumulado >= m.objetivo) {
        salida.push({
          id: 'meta-lograda-' + m.id,
          nivel: 'exito', tipo: 'meta', metaId: m.id,
          titulo: '¡Meta cumplida: ' + m.nombre + '!',
          mensaje: 'Acumulaste ' + U.moneda(acumulado) + ' de ' + U.moneda(m.objetivo) + '.',
          dato: 'avance=100%'
        });
        return;
      }
      if (m.fechaLimite) {
        var dias = Math.round((U.desdeISO(m.fechaLimite) - U.desdeISO(hoy)) / 86400000);
        if (dias >= 0 && dias <= 15) {
          salida.push({
            id: 'meta-plazo-' + m.id + '-' + m.fechaLimite,
            nivel: avance >= 70 ? 'aviso' : 'critico', tipo: 'meta', metaId: m.id,
            titulo: 'La meta «' + m.nombre + '» vence en ' + dias + ' días',
            mensaje: 'Llevas ' + U.moneda(acumulado) + ' de ' + U.moneda(m.objetivo) +
              ' (' + avance + ' %). Faltan ' + U.moneda(m.objetivo - acumulado) + '.',
            dato: 'diasRestantes=' + dias
          });
        }
      }
    });
    return salida;
  }

  /** Alertas de movimientos recurrentes próximos (RF-16). */
  function alertasRecurrentes(periodo) {
    var salida = [];
    var pend = A.recurrenciasPendientes(periodo);
    if (pend.gastos > 0 || pend.ingresos > 0) {
      salida.push({
        id: 'recurrentes-' + periodo,
        nivel: 'info', tipo: 'recurrente',
        titulo: 'Movimientos recurrentes por registrar',
        mensaje: 'Tienes ' + U.moneda(pend.gastos) + ' en gastos y ' + U.moneda(pend.ingresos) +
          ' en ingresos programados que aún no se registran este mes.',
        dato: 'pendientes'
      });
    }
    return salida;
  }

  /** Concentración excesiva del gasto en una sola categoría. */
  function alertasConcentracion(periodo) {
    var r = A.resumenPorCategoria(periodo, 'gasto');
    if (r.total <= 0 || r.filas.length < 3) { return []; }
    var top = r.filas[0];
    if (top.porcentaje >= 45) {
      return [{
        id: 'concentracion-' + periodo,
        nivel: 'info', tipo: 'patron', categoriaId: top.categoriaId,
        titulo: 'Tu gasto está concentrado en ' + top.nombre,
        mensaje: top.nombre + ' representa el ' + top.porcentaje + ' % de todo tu gasto del mes (' +
          U.moneda(top.total) + ').',
        dato: 'porcentaje=' + top.porcentaje + '%'
      }];
    }
    return [];
  }

  /** Devuelve todas las alertas activas, ordenadas por severidad. */
  function alertas(periodo) {
    var p = periodo || U.periodoActual();
    var todas = []
      .concat(alertasPresupuesto(p))
      .concat(alertasProyeccion(p))
      .concat(alertasMetas())
      .concat(alertasRecurrentes(p))
      .concat(alertasConcentracion(p));
    var peso = { critico: 0, aviso: 1, info: 2, exito: 3 };
    return todas.sort(function (a, b) { return peso[a.nivel] - peso[b.nivel]; });
  }

  function contarAlertas(periodo) {
    return alertas(periodo).filter(function (a) { return a.nivel === 'critico' || a.nivel === 'aviso'; }).length;
  }

  /* ---------------------------------------------------- recomendaciones */
  /** RF-10: consejos predefinidos según el estado del usuario. */
  function recomendacionesPredefinidas(periodo) {
    var reglas = App.state.ajustes().reglas;
    var estado = A.estadoPresupuestos(periodo);
    var salida = [];

    estado.categorias.forEach(function (f) {
      if (f.estado === 'excedido') {
        salida.push({
          id: 'rec-excedido-' + f.categoriaId,
          titulo: 'Has superado tu límite en ' + f.nombre,
          mensaje: 'Intenta reducir las salidas de ' + f.nombre + ' esta semana. Si recortas el ' +
            '25 % de lo excedido, recuperarías ' + U.moneda(U.redondear(Math.abs(f.disponible) * 0.25)) + '.',
          categoriaId: f.categoriaId, prioridad: 1,
          ahorroEstimado: U.redondear(Math.abs(f.disponible) * 0.25),
          base: 'límite de ' + U.moneda(f.limite) + ' consumido al ' + f.consumo + ' %'
        });
      }
    });

    var sinPresupuesto = estado.sinLimite.filter(function (f) { return f.total > 0; });
    if (sinPresupuesto.length) {
      var mayor = sinPresupuesto[0];
      salida.push({
        id: 'rec-sin-limite',
        titulo: 'Define un límite para ' + mayor.nombre,
        mensaje: 'Es tu categoría sin presupuesto con más gasto (' + U.moneda(mayor.total) +
          ' este mes). Ponerle un tope te permite recibir alertas antes de pasarte.',
        categoriaId: mayor.categoriaId, prioridad: 2, ahorroEstimado: 0,
        base: 'gasto sin límite de ' + U.moneda(mayor.total)
      });
    }

    var p = A.proyeccion(periodo);
    if (!p.cerrado && p.excede) {
      salida.push({
        id: 'rec-proyeccion',
        titulo: 'Frena el ritmo de gasto',
        mensaje: 'Si mantienes el promedio de ' + U.moneda(p.promedioDiario) + ' diarios, cerrarás ' +
          'el mes ' + U.moneda(p.exceso) + ' arriba. Bajando el ritmo a ' +
          U.moneda(U.redondear((p.limite - p.gastoActual) / Math.max(1, p.restantes))) +
          ' diarios terminarías dentro de tu presupuesto.',
        prioridad: 1, ahorroEstimado: U.redondear(p.exceso),
        base: 'proyección ' + U.moneda(p.gastoEstimado) + ' vs límite ' + U.moneda(p.limite)
      });
    }

    var t = A.totalesPeriodo(periodo);
    if (t.ingresos > 0 && t.neto <= 0) {
      salida.push({
        id: 'rec-sin-ahorro',
        titulo: 'Este mes no estás ahorrando',
        mensaje: 'Tus gastos (' + U.moneda(t.gastos) + ') alcanzan o superan tus ingresos (' +
          U.moneda(t.ingresos) + '). Aparta primero una cantidad fija al recibir tu ingreso.',
        prioridad: 1, ahorroEstimado: 0, base: 'neto del mes ' + U.moneda(t.neto)
      });
    } else if (t.ingresos > 0) {
      var tasa = U.porcentaje(t.neto, t.ingresos);
      if (tasa < 10) {
        salida.push({
          id: 'rec-tasa-baja',
          titulo: 'Tu tasa de ahorro es del ' + tasa + ' %',
          mensaje: 'Lo recomendable es apartar al menos el 10 % de tus ingresos (' +
            U.moneda(U.redondear(t.ingresos * 0.1)) + '). Ajustando una categoría puedes lograrlo.',
          prioridad: 3, ahorroEstimado: U.redondear(t.ingresos * 0.1 - t.neto),
          base: 'ahorro del mes ' + U.moneda(t.neto) + ' de ' + U.moneda(t.ingresos)
        });
      }
    }

    if (!App.state.ajustes().pinActivo) {
      salida.push({
        id: 'rec-pin',
        titulo: 'Protege tu información con un PIN',
        mensaje: 'Tus datos financieros están en este dispositivo. Activar el PIN evita que ' +
          'cualquiera los consulte.',
        prioridad: 4, ahorroEstimado: 0, base: 'PIN desactivado'
      });
    }

    return salida;
  }

  /** RF-22: recomendaciones calculadas a partir de los datos del usuario. */
  function recomendacionesCalculadas(periodo) {
    var salida = [];
    var patrones = A.detectarPatrones(periodo);
    patrones.forEach(function (pat) {
      if (pat.tipo === 'habito') { return; }
      salida.push({
        id: 'rec-patron-' + pat.tipo + '-' + (pat.categoriaId || 'general'),
        titulo: pat.titulo,
        mensaje: pat.detalle + ' ' + pat.accion,
        categoriaId: pat.categoriaId || null,
        prioridad: pat.severidad === 'media' ? 2 : 3,
        ahorroEstimado: pat.ahorroEstimado || 0,
        base: 'patrón detectado: ' + pat.tipo
      });
    });

    // Comparación por categoría contra el promedio de los tres meses anteriores
    var periodos = U.ultimosPeriodos(4, U.sumarMeses(periodo, -1));
    A.resumenPorCategoria(periodo, 'gasto').filas.slice(0, 5).forEach(function (fila) {
      var stats = A.estadisticasCategoria(fila.categoriaId, periodos);
      if (stats.media > 0 && fila.total > stats.media * 1.2) {
        var exceso = U.redondear(fila.total - stats.media);
        salida.push({
          id: 'rec-promedio-' + fila.categoriaId,
          titulo: fila.nombre + ' ' + U.porcentaje(exceso, stats.media) + ' % arriba de tu promedio',
          mensaje: 'Tu promedio de los últimos meses en ' + fila.nombre + ' es ' +
            U.moneda(stats.media) + ' y este mes llevas ' + U.moneda(fila.total) +
            '. Volver al promedio te ahorraría ' + U.moneda(exceso) + '.',
          categoriaId: fila.categoriaId, prioridad: 2,
          ahorroEstimado: exceso,
          base: 'promedio ' + U.moneda(stats.media) + ' (mediana ' + U.moneda(stats.mediana) + ')'
        });
      }
    });

    // Sugerencia de meta si hay ahorro positivo y ninguna meta activa
    var t = A.totalesPeriodo(periodo);
    if (t.neto > 0 && !App.metas.todos().length) {
      salida.push({
        id: 'rec-meta',
        titulo: 'Crea tu primera meta de ahorro',
        mensaje: 'Este mes te quedaron ' + U.moneda(t.neto) + '. Convierte ese sobrante en una ' +
          'meta con fecha y el sistema te dirá cuánto falta cada mes.',
        prioridad: 3, ahorroEstimado: t.neto, base: 'neto positivo ' + U.moneda(t.neto)
      });
    }

    return salida;
  }

  /**
   * Recomendaciones finales: combina predefinidas y calculadas, elimina
   * repetidas y ordena por prioridad y ahorro estimado.
   */
  function recomendaciones(periodo) {
    var p = periodo || U.periodoActual();
    var todas = recomendacionesPredefinidas(p).concat(recomendacionesCalculadas(p));
    var vistas = {};
    var unicas = [];
    todas.forEach(function (r) {
      var clave = r.titulo.toLowerCase();
      if (vistas[clave]) { return; }
      vistas[clave] = true;
      unicas.push(r);
    });
    unicas.sort(function (a, b) {
      if (a.prioridad !== b.prioridad) { return a.prioridad - b.prioridad; }
      return (b.ahorroEstimado || 0) - (a.ahorroEstimado || 0);
    });
    return unicas;
  }

  /** Recomendación principal del panel de inicio (RF-11). */
  function recomendacionPrincipal(periodo) {
    var lista = recomendaciones(periodo);
    return lista.length ? lista[0] : {
      id: 'rec-ok',
      titulo: 'Todo en orden',
      mensaje: 'No hay alertas ni patrones que corregir este mes. Mantén el registro diario.',
      ahorroEstimado: 0, prioridad: 9, base: 'sin hallazgos'
    };
  }

  /** Ahorro total que el usuario podría liberar si aplica todas las sugerencias. */
  function ahorroPotencial(periodo) {
    return U.redondear(U.suma(recomendaciones(periodo), function (r) { return r.ahorroEstimado || 0; }));
  }

  /** Estado general para el semáforo del panel. */
  function estadoGeneral(periodo) {
    var al = alertas(periodo);
    if (al.some(function (a) { return a.nivel === 'critico'; })) {
      return { nivel: 'critico', etiqueta: 'Atención requerida', color: '#D64545' };
    }
    if (al.some(function (a) { return a.nivel === 'aviso'; })) {
      return { nivel: 'aviso', etiqueta: 'Revisa tus límites', color: '#E0A030' };
    }
    return { nivel: 'ok', etiqueta: 'Finanzas bajo control', color: '#2E9E6B' };
  }

  /** RF-23 y RF-24: texto de las notificaciones del sistema. */
  function notificacionesPendientes(periodo) {
    var p = periodo || U.periodoActual();
    var salida = [];
    alertas(p).filter(function (a) { return a.nivel === 'critico' || a.nivel === 'aviso'; })
      .forEach(function (a) { salida.push({ clave: a.id, titulo: a.titulo, cuerpo: a.mensaje }); });
    var proy = A.proyeccion(p);
    if (!proy.cerrado && proy.confiable && proy.excede) {
      salida.push({
        clave: 'proy-notif-' + p,
        titulo: 'Proyección de cierre de mes',
        cuerpo: 'Cerrarías el mes en ' + U.moneda(proy.gastoEstimado) + '.'
      });
    }
    return salida;
  }

  App.intelligence = {
    alertas: alertas,
    contarAlertas: contarAlertas,
    alertasPresupuesto: alertasPresupuesto,
    alertasProyeccion: alertasProyeccion,
    alertasMetas: alertasMetas,
    alertasRecurrentes: alertasRecurrentes,
    alertasConcentracion: alertasConcentracion,
    recomendaciones: recomendaciones,
    recomendacionesPredefinidas: recomendacionesPredefinidas,
    recomendacionesCalculadas: recomendacionesCalculadas,
    recomendacionPrincipal: recomendacionPrincipal,
    ahorroPotencial: ahorroPotencial,
    estadoGeneral: estadoGeneral,
    notificacionesPendientes: notificacionesPendientes
  };
})(window);
