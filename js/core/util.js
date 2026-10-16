/* ============================================================================
 * Control de Gastos con Análisis Inteligente
 * js/core/util.js — utilidades generales compartidas por toda la aplicación
 * ---------------------------------------------------------------------------
 * Sin dependencias externas. Debe cargarse antes que cualquier otro módulo.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var App = global.App = global.App || {};

  /* ---------------------------------------------------------------- fechas */
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /** Fecha de hoy en formato ISO local (YYYY-MM-DD), sin desfase de zona horaria. */
  function hoyISO() { return aISO(new Date()); }

  function aISO(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Convierte 'YYYY-MM-DD' a Date local (evita el desfase de new Date(string)). */
  function desdeISO(iso) {
    if (!iso) { return null; }
    var p = String(iso).slice(0, 10).split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function periodoDe(iso) { return String(iso || '').slice(0, 7); }         // '2026-10'
  function periodoActual() { return periodoDe(hoyISO()); }

  function nombreMes(periodo) {
    var p = String(periodo).split('-');
    return MESES[Number(p[1]) - 1] + ' ' + p[0];
  }

  function nombreMesCorto(periodo) {
    var p = String(periodo).split('-');
    return MESES[Number(p[1]) - 1].slice(0, 3) + ' ' + String(p[0]).slice(2);
  }

  function formatoFechaLarga(iso) {
    var d = desdeISO(iso);
    if (!d) { return '—'; }
    return DIAS[d.getDay()] + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()] +
      ' de ' + d.getFullYear();
  }

  /** Suma n días a una fecha ISO y devuelve ISO. */
  function sumarDias(iso, n) {
    var d = desdeISO(iso) || new Date();
    d.setDate(d.getDate() + n);
    return aISO(d);
  }

  /** Suma n meses a un periodo 'YYYY-MM' y devuelve otro periodo. */
  function sumarMeses(periodo, n) {
    var p = String(periodo).split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1 + n, 1);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1);
  }

  function diasDelMes(periodo) {
    var p = String(periodo).split('-');
    return new Date(Number(p[0]), Number(p[1]), 0).getDate();
  }

  function diasTranscurridos(periodo) {
    if (periodo === periodoActual()) { return new Date().getDate(); }
    if (periodo < periodoActual()) { return diasDelMes(periodo); }
    return 0;
  }

  /** Lista de los últimos n periodos, del más antiguo al más reciente. */
  function ultimosPeriodos(n, hasta) {
    var fin = hasta || periodoActual();
    var arr = [];
    for (var i = n - 1; i >= 0; i--) { arr.push(sumarMeses(fin, -i)); }
    return arr;
  }

  /* ----------------------------------------------------------------- dinero */
  function redondear(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

  function num(n) {
    if (n === null || n === undefined || n === '') { return 0; }
    if (typeof n === 'number') { return isFinite(n) ? n : 0; }
    var limpio = String(n).replace(/\s/g, '').replace(/\$/g, '').replace(/,/g, '');
    var v = parseFloat(limpio);
    return isFinite(v) ? v : 0;
  }

  /** Formatea un monto con el símbolo y separadores configurados. */
  function moneda(n, opciones) {
    var cfg = (opciones && opciones.simbolo !== undefined)
      ? opciones : (App.state ? App.state.ajustes() : { simbolo: '$', decimales: 2 });
    var v = redondear(num(n));
    var neg = v < 0;
    var partes = Math.abs(v).toFixed(cfg.decimales === 0 ? 0 : 2).split('.');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return (neg ? '−' : '') + cfg.simbolo + partes.join('.');
  }

  function monedaCorta(n) {
    var v = Math.abs(num(n));
    var signo = num(n) < 0 ? '−' : '';
    if (v >= 1000000) { return signo + (v / 1000000).toFixed(1) + 'M'; }
    if (v >= 10000) { return signo + (v / 1000).toFixed(0) + 'k'; }
    if (v >= 1000) { return signo + (v / 1000).toFixed(1) + 'k'; }
    return signo + v.toFixed(0);
  }

  /** Convierte un monto a texto válido para un input type=number. */
  function aNumeroInput(n) { return redondear(num(n)).toFixed(2); }

  function porcentaje(parte, total) {
    if (!total) { return 0; }
    return redondear(parte / total * 100);
  }

  /* ------------------------------------------------------------------ texto */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Quita acentos y pasa a minúsculas: sirve para buscar y comparar. */
  function normalizar(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  function incluye(texto, busqueda) {
    return normalizar(texto).indexOf(normalizar(busqueda)) !== -1;
  }

  function capitalizar(s) {
    s = String(s || '');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function truncar(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  /* -------------------------------------------------------------------- ids */
  /** Identificador local legible (para registros que no van a la base). */
  function uid(prefijo) {
    var rnd = Math.random().toString(36).slice(2, 8);
    return (prefijo || 'id') + '_' + Date.now().toString(36) + '_' + rnd;
  }

  /**
   * Identificador con el mismo formato que SQL Server (UNIQUEIDENTIFIER).
   * Se usa al crear registros: así el id local y el de la base coinciden y la
   * sincronización —incluso diferida, sin conexión— no duplica nada.
   */
  function uuid() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : ((r & 0x3) | 0x8);
      return v.toString(16);
    });
  }

  /* ------------------------------------------------------------------ arrays */
  function ordenar(arr, clave, desc) {
    var copia = arr.slice();
    copia.sort(function (a, b) {
      var x = a[clave], y = b[clave];
      if (x === y) { return 0; }
      if (x === undefined || x === null) { return 1; }
      if (y === undefined || y === null) { return -1; }
      var cmp = x > y ? 1 : -1;
      return desc ? -cmp : cmp;
    });
    return copia;
  }

  function agrupar(arr, fn) {
    return arr.reduce(function (acc, item) {
      var k = fn(item);
      (acc[k] = acc[k] || []).push(item);
      return acc;
    }, {});
  }

  function suma(arr, fn) {
    return arr.reduce(function (a, b) { return a + num(fn ? fn(b) : b); }, 0);
  }

  function promedio(arr, fn) {
    return arr.length ? suma(arr, fn) / arr.length : 0;
  }

  function mediana(arr) {
    if (!arr.length) { return 0; }
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function desviacion(arr) {
    if (arr.length < 2) { return 0; }
    var p = promedio(arr);
    var v = promedio(arr.map(function (x) { return (x - p) * (x - p); }));
    return Math.sqrt(v);
  }

  /** Media móvil simple sobre una serie de números. */
  function mediaMovil(serie, ventana) {
    var w = ventana || 3;
    return serie.map(function (_, i) {
      var ini = Math.max(0, i - w + 1);
      var trozo = serie.slice(ini, i + 1);
      return promedio(trozo);
    });
  }

  /* -------------------------------------------------------------------- DOM */
  function $(sel, raiz) { return (raiz || document).querySelector(sel); }
  function $$(sel, raiz) { return Array.prototype.slice.call((raiz || document).querySelectorAll(sel)); }

  function crear(tag, attrs, hijos) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') { el.className = attrs[k]; }
        else if (k === 'html') { el.innerHTML = attrs[k]; }
        else if (k === 'text') { el.textContent = attrs[k]; }
        else if (k === 'dataset') { Object.keys(attrs[k]).forEach(function (d) { el.dataset[d] = attrs[k][d]; }); }
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') { el.addEventListener(k.slice(2), attrs[k]); }
        else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) { el.setAttribute(k, attrs[k]); }
      });
    }
    (hijos || []).forEach(function (h) {
      if (h === null || h === undefined) { return; }
      el.appendChild(typeof h === 'string' ? document.createTextNode(h) : h);
    });
    return el;
  }

  function limpiar(nodo) { while (nodo && nodo.firstChild) { nodo.removeChild(nodo.firstChild); } }

  function ponerHTML(sel, html) {
    var el = typeof sel === 'string' ? $(sel) : sel;
    if (el) { el.innerHTML = html; }
    return el;
  }

  /* --------------------------------------------------------------- eventos */
  function delegar(raiz, evento, selector, handler) {
    (typeof raiz === 'string' ? $(raiz) : raiz).addEventListener(evento, function (e) {
      var objetivo = e.target.closest(selector);
      if (objetivo && this.contains(objetivo)) { handler.call(objetivo, e, objetivo); }
    });
  }

  function emitir(nombre, detalle) {
    document.dispatchEvent(new CustomEvent(nombre, { detail: detalle || {} }));
  }

  /* ---------------------------------------------------------------- varios */
  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 250);
    };
  }

  function descargar(nombre, contenido, tipo) {
    var blob = new Blob([contenido], { type: tipo || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = crear('a', { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 800);
  }

  function leerArchivo(archivo, callback) {
    var fr = new FileReader();
    fr.onload = function () { callback(String(fr.result)); };
    fr.readAsText(archivo, 'utf-8');
  }

  /** Hash SHA-256 en hexadecimal (para el PIN). Devuelve promesa. */
  function sha256(texto) {
    if (global.crypto && global.crypto.subtle) {
      var datos = new TextEncoder().encode(texto);
      return global.crypto.subtle.digest('SHA-256', datos).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) {
          return ('0' + b.toString(16)).slice(-2);
        }).join('');
      });
    }
    // Respaldo determinista cuando crypto.subtle no está disponible (file:// antiguo).
    var h1 = 0x811c9dc5, h2 = 0x1000193;
    for (var i = 0; i < texto.length; i++) {
      h1 = (h1 ^ texto.charCodeAt(i)) * 16777619 >>> 0;
      h2 = (h2 + texto.charCodeAt(i) * (i + 7)) >>> 0;
    }
    return Promise.resolve('fb' + h1.toString(16) + h2.toString(16));
  }

  App.util = {
    MESES: MESES, DIAS: DIAS, pad: pad,
    hoyISO: hoyISO, aISO: aISO, desdeISO: desdeISO,
    periodoDe: periodoDe, periodoActual: periodoActual,
    nombreMes: nombreMes, nombreMesCorto: nombreMesCorto, formatoFechaLarga: formatoFechaLarga,
    sumarDias: sumarDias, sumarMeses: sumarMeses, diasDelMes: diasDelMes,
    diasTranscurridos: diasTranscurridos, ultimosPeriodos: ultimosPeriodos,
    redondear: redondear, num: num, moneda: moneda, monedaCorta: monedaCorta,
    aNumeroInput: aNumeroInput, porcentaje: porcentaje,
    esc: esc, normalizar: normalizar, incluye: incluye, capitalizar: capitalizar, truncar: truncar,
    uid: uid, uuid: uuid, ordenar: ordenar, agrupar: agrupar, suma: suma, promedio: promedio,
    mediana: mediana, desviacion: desviacion, mediaMovil: mediaMovil,
    $: $, $$: $$, crear: crear, limpiar: limpiar, ponerHTML: ponerHTML,
    delegar: delegar, emitir: emitir, debounce: debounce,
    descargar: descargar, leerArchivo: leerArchivo, sha256: sha256
  };
})(window);
