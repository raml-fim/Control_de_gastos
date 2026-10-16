/* ============================================================================
 * js/core/ui.js — componentes de interfaz reutilizables
 * ---------------------------------------------------------------------------
 * Formularios modales, gráficas dibujadas en canvas (sin librerías externas),
 * barras de progreso, estados vacíos y ayudas de formato.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};
  var U = App.util;

  /* --------------------------------------------------------------- modales */
  /**
   * Abre un modal con contenido propio.
   * @param {object} op {titulo, contenido (nodo), ancho, alCerrar, acciones}
   * @returns {object} {cerrar, nodo}
   */
  function modal(op) {
    var fondo = U.crear('div', { class: 'modal-fondo' });
    var caja = U.crear('div', {
      class: 'modal' + (op.ancho === 'ancho' ? ' modal--ancho' : ''),
      role: 'dialog', 'aria-modal': 'true'
    });
    var encabezado = U.crear('header', { class: 'modal__encabezado' }, [
      U.crear('h3', { class: 'modal__titulo', text: op.titulo || '' }),
      U.crear('button', {
        class: 'modal__cerrar', type: 'button', 'aria-label': 'Cerrar',
        onclick: function () { cerrar(); }
      }, ['×'])
    ]);
    var cuerpo = U.crear('div', { class: 'modal__cuerpo' });
    if (op.contenido) { cuerpo.appendChild(op.contenido); }

    caja.appendChild(encabezado);
    caja.appendChild(cuerpo);
    if (op.acciones) {
      var pie = U.crear('footer', { class: 'modal__pie' });
      op.acciones.forEach(function (a) { pie.appendChild(a); });
      caja.appendChild(pie);
    }
    fondo.appendChild(caja);
    document.body.appendChild(fondo);
    requestAnimationFrame(function () { fondo.classList.add('modal-fondo--visible'); });

    var cerrado = false;
    function cerrar() {
      if (cerrado) { return; }
      cerrado = true;
      fondo.classList.remove('modal-fondo--visible');
      setTimeout(function () { if (fondo.parentNode) { fondo.parentNode.removeChild(fondo); } }, 180);
      document.removeEventListener('keydown', porTecla);
      if (op.alCerrar) { op.alCerrar(); }
    }
    function porTecla(e) { if (e.key === 'Escape') { cerrar(); } }
    document.addEventListener('keydown', porTecla);
    fondo.addEventListener('click', function (e) { if (e.target === fondo) { cerrar(); } });

    var primerCampo = caja.querySelector('input, select, textarea, button.btn--primario');
    if (primerCampo) { setTimeout(function () { primerCampo.focus(); }, 60); }
    return { cerrar: cerrar, nodo: caja, cuerpo: cuerpo };
  }

  /* ----------------------------------------------------------- formularios */
  /**
   * Construye un campo de formulario.
   * @param {object} def {nombre, etiqueta, tipo, valor, opciones, requerido, ayuda, min, max, paso}
   */
  function campo(def) {
    var id = 'f_' + def.nombre + '_' + Math.random().toString(36).slice(2, 6);
    var control;
    var tipo = def.tipo || 'text';

    if (tipo === 'select') {
      control = U.crear('select', { id: id, name: def.nombre, class: 'campo__control' });
      (def.opciones || []).forEach(function (o) {
        var opt = U.crear('option', { value: o.valor, text: o.etiqueta });
        if (String(o.valor) === String(def.valor)) { opt.selected = true; }
        control.appendChild(opt);
      });
    } else if (tipo === 'textarea') {
      control = U.crear('textarea', { id: id, name: def.nombre, class: 'campo__control', rows: def.rows || 3 });
      control.value = def.valor || '';
    } else if (tipo === 'checkbox') {
      control = U.crear('input', { id: id, name: def.nombre, type: 'checkbox', class: 'campo__check' });
      control.checked = !!def.valor;
    } else {
      control = U.crear('input', {
        id: id, name: def.nombre, type: tipo, class: 'campo__control',
        min: def.min, max: def.max, step: def.paso || (tipo === 'number' ? '0.01' : null),
        placeholder: def.placeholder || '', autocomplete: 'off',
        inputmode: def.inputmode || (tipo === 'number' ? 'decimal' : null)
      });
      control.value = def.valor === undefined || def.valor === null ? '' : def.valor;
    }
    if (def.requerido) { control.required = true; }

    var envoltura = U.crear('div', { class: 'campo' + (tipo === 'checkbox' ? ' campo--check' : '') }, [
      tipo === 'checkbox' ? control : null,
      U.crear('label', { for: id, class: 'campo__etiqueta', text: def.etiqueta }),
      tipo === 'checkbox' ? null : control,
      def.ayuda ? U.crear('small', { class: 'campo__ayuda', text: def.ayuda }) : null
    ]);
    return { nodo: envoltura, control: control, nombre: def.nombre };
  }

  function formulario(definiciones) {
    var nodo = U.crear('form', { class: 'formulario', novalidate: 'novalidate' });
    var campos = {};
    definiciones.forEach(function (d) {
      var c = campo(d);
      campos[d.nombre] = c.control;
      nodo.appendChild(c.nodo);
    });
    return { nodo: nodo, campos: campos };
  }

  /** Lee los valores de un formulario como objeto plano. */
  function valores(campos) {
    var salida = {};
    Object.keys(campos).forEach(function (k) {
      var el = campos[k];
      salida[k] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return salida;
  }

  /* -------------------------------------------------------------- gráficas */
  /**
   * Gráfica de dona. items = [{etiqueta, valor, color}]
   */
  function dona(canvas, items, opciones) {
    var op = opciones || {};
    var ctx = canvas.getContext('2d');
    var dpr = global.devicePixelRatio || 1;
    var w = canvas.clientWidth || 260, h = canvas.clientHeight || 260;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var total = U.suma(items, function (i) { return i.valor; });
    var cx = w / 2, cy = h / 2;
    var grosor = op.grosor || Math.max(18, Math.min(w, h) * 0.17);
    var radio = Math.min(w, h) / 2 - grosor / 2 - 2;

    ctx.beginPath();
    ctx.arc(cx, cy, radio, 0, Math.PI * 2);
    ctx.strokeStyle = '#EDF2F8';
    ctx.lineWidth = grosor;
    ctx.stroke();

    if (total > 0) {
      var angulo = -Math.PI / 2;
      items.forEach(function (i) {
        var porcion = i.valor / total;
        var fin = angulo + porcion * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(cx, cy, radio, angulo, fin);
        ctx.strokeStyle = i.color || '#1E88E5';
        ctx.lineWidth = grosor;
        ctx.lineCap = 'butt';
        ctx.stroke();
        angulo = fin;
      });
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#5A7290';
    ctx.font = '500 11px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(op.etiqueta || 'Total', cx, cy - 6);
    ctx.fillStyle = '#0D2B4E';
    ctx.font = '700 ' + (op.tamanoValor || 19) + 'px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(op.valorTexto !== undefined ? op.valorTexto : U.moneda(total), cx, cy + 15);
  }

  /**
   * Gráfica de barras (agrupadas u horizontales).
   * @param {object} op {series:[{nombre,color,valores:[]}], etiquetas:[], horizontal, max}
   */
  function barras(canvas, opciones) {
    var op = opciones || {};
    var ctx = canvas.getContext('2d');
    var dpr = global.devicePixelRatio || 1;
    var w = canvas.clientWidth || 400, h = canvas.clientHeight || 220;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var series = op.series || [];
    var etiquetas = op.etiquetas || [];
    if (!series.length || !etiquetas.length) { return; }

    var margen = { arriba: 14, derecha: 12, abajo: 26, izquierda: 46 };
    var ancho = w - margen.izquierda - margen.derecha;
    var alto = h - margen.arriba - margen.abajo;
    var maximo = op.max || 0;
    series.forEach(function (s) {
      maximo = Math.max(maximo, Math.max.apply(null, s.valores.concat([0])));
    });
    if (!maximo) { maximo = 1; }
    var escala = alto / maximo;

    // rejilla y eje
    ctx.strokeStyle = '#EAF0F7';
    ctx.fillStyle = '#8A9BAE';
    ctx.font = '500 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    var lineas = 4;
    for (var i = 0; i <= lineas; i++) {
      var valor = maximo / lineas * i;
      var y = margen.arriba + alto - valor * escala;
      ctx.beginPath();
      ctx.moveTo(margen.izquierda, y);
      ctx.lineTo(w - margen.derecha, y);
      ctx.stroke();
      ctx.fillText(U.monedaCorta(valor), margen.izquierda - 8, y + 3);
    }

    var n = etiquetas.length;
    var anchoGrupo = ancho / n;
    var anchoBarra = Math.max(6, (anchoGrupo * 0.62) / series.length);

    ctx.textAlign = 'center';
    etiquetas.forEach(function (etq, idx) {
      var centro = margen.izquierda + anchoGrupo * idx + anchoGrupo / 2;
      series.forEach(function (s, si) {
        var v = U.num(s.valores[idx]);
        var altura = Math.max(0, v * escala);
        var x = centro - (anchoBarra * series.length) / 2 + si * anchoBarra + 1;
        var y = margen.arriba + alto - altura;
        ctx.fillStyle = s.color || '#1E88E5';
        redondeado(ctx, x, y, Math.max(3, anchoBarra - 2), altura, 4);
        if (op.mostrarValores && v > 0) {
          ctx.fillStyle = '#5A7290';
          ctx.font = '600 9px "Segoe UI", system-ui, sans-serif';
          ctx.fillText(U.monedaCorta(v), x + anchoBarra / 2, y - 3);
        }
      });
      ctx.fillStyle = '#5A7290';
      ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(etq, centro, h - 8);
    });
  }

  /** Gráfica de línea para series temporales (tendencias y medias móviles). */
  function linea(canvas, opciones) {
    var op = opciones || {};
    var ctx = canvas.getContext('2d');
    var dpr = global.devicePixelRatio || 1;
    var w = canvas.clientWidth || 420, h = canvas.clientHeight || 200;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    var series = op.series || [];
    var etiquetas = op.etiquetas || [];
    if (!series.length) { return; }
    var margen = { arriba: 14, derecha: 14, abajo: 26, izquierda: 48 };
    var ancho = w - margen.izquierda - margen.derecha;
    var alto = h - margen.arriba - margen.abajo;
    var maximo = 0;
    series.forEach(function (s) { maximo = Math.max(maximo, Math.max.apply(null, s.valores.concat([0]))); });
    if (!maximo) { maximo = 1; }

    ctx.strokeStyle = '#EAF0F7';
    ctx.fillStyle = '#8A9BAE';
    ctx.font = '500 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    for (var i = 0; i <= 4; i++) {
      var y = margen.arriba + alto - (alto / 4) * i;
      ctx.beginPath(); ctx.moveTo(margen.izquierda, y); ctx.lineTo(w - margen.derecha, y); ctx.stroke();
      ctx.fillText(U.monedaCorta(maximo / 4 * i), margen.izquierda - 8, y + 3);
    }

    var paso = etiquetas.length > 1 ? ancho / (etiquetas.length - 1) : 0;
    series.forEach(function (s) {
      ctx.beginPath();
      s.valores.forEach(function (v, idx) {
        var x = margen.izquierda + paso * idx;
        var y = margen.arriba + alto - (U.num(v) / maximo) * alto;
        if (idx === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); }
      });
      ctx.strokeStyle = s.color || '#1E88E5';
      ctx.lineWidth = s.grosor || 2.4;
      ctx.setLineDash(s.punteada ? [5, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      if (s.relleno) {
        ctx.lineTo(margen.izquierda + paso * (s.valores.length - 1), margen.arriba + alto);
        ctx.lineTo(margen.izquierda, margen.arriba + alto);
        ctx.closePath();
        ctx.fillStyle = (s.color || '#1E88E5') + '22';
        ctx.fill();
      }
      s.valores.forEach(function (v, idx) {
        var x = margen.izquierda + paso * idx;
        var y = margen.arriba + alto - (U.num(v) / maximo) * alto;
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.stroke();
      });
    });

    ctx.fillStyle = '#5A7290';
    ctx.font = '600 10px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    etiquetas.forEach(function (e, idx) {
      ctx.fillText(e, margen.izquierda + paso * idx, h - 8);
    });
  }

  function redondeado(ctx, x, y, w, h, r) {
    var radio = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radio, y);
    ctx.lineTo(x + w - radio, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radio);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + radio);
    ctx.quadraticCurveTo(x, y, x + radio, y);
    ctx.closePath();
    ctx.fill();
  }

  /** Leyenda HTML para las gráficas. */
  function leyenda(items) {
    return U.crear('div', { class: 'leyenda' }, items.map(function (i) {
      return U.crear('div', { class: 'leyenda__item' }, [
        U.crear('span', { class: 'leyenda__punto', style: 'background:' + (i.color || '#8A9BAE') }),
        U.crear('span', { html: U.esc(i.etiqueta) + (i.valor !== undefined ? ' · <b>' + U.esc(i.valor) + '</b>' : '') })
      ]);
    }));
  }

  /* ----------------------------------------------------------- fragmentos */
  function barraProgreso(porcentaje, color, opciones) {
    var op = opciones || {};
    var pct = Math.max(0, Math.min(100, U.num(porcentaje)));
    return U.crear('div', { class: 'progreso' + (op.mini ? ' progreso--mini' : '') }, [
      U.crear('div', { class: 'progreso__relleno', style: 'width:' + pct + '%;background:' + (color || '#1E88E5') })
    ]);
  }

  function vacio(titulo, mensaje, accion) {
    return U.crear('div', { class: 'vacio' }, [
      U.crear('div', { class: 'vacio__icono' }, ['◌']),
      U.crear('h3', { text: titulo }),
      U.crear('p', { text: mensaje }),
      accion || null
    ]);
  }

  function chip(texto, color, clase) {
    return U.crear('span', {
      class: 'chip' + (clase ? ' ' + clase : ''),
      style: color ? '--chip:' + color : null, text: texto
    });
  }

  function icono(nombre) {
    var path = {
      inicio: 'M3 10.5 12 3l9 7.5V21H3z',
      movimientos: 'M4 6h16M4 12h16M4 18h10',
      presupuesto: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
      metas: 'M12 2v20M5 7l7-5 7 5M5 17l7 5 7-5',
      analisis: 'M4 19V5M4 19h16M8 15l3-4 3 3 4-6',
      categorias: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
      cuentas: 'M3 7h18v10H3zM3 11h18',
      recurrentes: 'M17 2l4 4-4 4M3 6h18M7 22l-4-4 4-4M21 18H3',
      ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V22a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 6.6 20l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 2 14.6H2a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4 8.6l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V4a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 17.4 4l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H22a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.3z',
      mas: 'M12 5v14M5 12h14',
      editar: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
      borrar: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14',
      copiar: 'M9 9h10v10H9zM5 15V5h10',
      descargar: 'M12 3v12M7 10l5 5 5-5M4 21h16',
      subir: 'M12 21V9M7 14l5-5 5 5M4 3h16',
      cerrar: 'M18 6 6 18M6 6l12 12',
      filtro: 'M3 5h18l-7 8v6l-4-2v-4z',
      buscar: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
      campana: 'M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.7 21a2 2 0 0 1-3.4 0'
    }[nombre] || 'M12 5v14M5 12h14';
    var cont = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    cont.setAttribute('viewBox', '0 0 24 24');
    cont.setAttribute('class', 'icono');
    cont.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', path);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.8');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    cont.appendChild(p);
    return cont;
  }

  App.ui = {
    modal: modal, campo: campo, formulario: formulario, valores: valores,
    dona: dona, barras: barras, linea: linea, leyenda: leyenda,
    barraProgreso: barraProgreso, vacio: vacio, chip: chip, icono: icono
  };
})(window);
