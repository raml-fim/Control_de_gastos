# Control de Gastos con Análisis Inteligente

**Aplicación web del Equipo 1 — «Los Inges»**
Asignatura: Metodologías Ágiles de Desarrollo de Software
Docente: Dr. Manuel de Jesús Rodríguez Guerrero
Universidad Autónoma de Sinaloa · Facultad de Ingeniería Mochis


## 2. Estructura del proyecto

```
app/
├── index.html                 Punto de entrada. Carga los módulos en orden.
├── manifest.webmanifest       Metadatos de aplicación instalable (PWA).
├── sw.js                      Service worker: caché del armazón (RF-21).
│
├── css/
│   ├── base.css               Variables de diseño, tipografía, accesibilidad, impresión.
│   ├── layout.css             Menú lateral, barra superior, rejillas, pantalla de PIN.
│   └── components.css         Tarjetas, botones, tablas, formularios, gráficas, calendario.
│
├── js/
│   ├── core/
│   │   ├── util.js            Fechas, moneda, DOM, estadística básica y hash SHA-256.
│   │   ├── storage.js         Persistencia en localStorage con respaldo en memoria.
│   │   ├── state.js           Estado global, colecciones CRUD y datos iniciales.
│   │   ├── analytics.js       Todos los cálculos financieros.
│   │   ├── intelligence.js    Motor de análisis: alertas y recomendaciones.
│   │   ├── security.js        PIN con hash y bloqueo por inactividad.
│   │   ├── notify.js          Avisos flotantes, confirmaciones y notificaciones.
│   │   └── ui.js              Componentes de interfaz y gráficas en canvas.
│   │
│   ├── views/
│   │   ├── dashboard.js       Panel de inicio (RF-11).
│   │   ├── movements.js       Registro, CRUD, historial, filtros y exportación.
│   │   ├── budget.js          Presupuestos, límites, alertas y categorías.
│   │   ├── goals.js           Metas de ahorro, cuentas y recurrencias.
│   │   ├── analysis.js        Análisis inteligente, reportes y reglas.
│   │   └── settings.js        Ajustes, seguridad, respaldo y datos.
│   │
│   ├── app.js                 Arranque, navegación, generación de recurrencias.
│   └── _pruebas.html          Batería de 25 pruebas funcionales (evidencia de QA).
│
├── docs/
│   ├── ARQUITECTURA.md        Capas, modelo de datos y decisiones de diseño.
│   ├── TRAZABILIDAD.md        Matriz RF/RNF → módulo → cómo probarlo.
│   └── MANUAL_USUARIO.md      Guía de uso paso a paso.
│
└── evidencias/                Capturas de pantalla de cada vista (generadas).
```


Qué hace la aplicación

### 3.1 Núcleo de registro (Sprint 1)

- **Panel de inicio** con saldo disponible, gasto del mes, presupuesto consumido,
  resumen por categoría, alertas activas, recomendación del día, top 3 de gastos,
  últimos movimientos y avance de metas.
- **Registro de ingresos y gastos** en tres pasos: monto → categoría → guardar.
  La fecha se propone con el día actual y el monto se valida (mayor que cero).
- **CRUD completo**: editar, duplicar y eliminar con confirmación. Cada operación
  recalcula saldo, resumen y alertas al instante.
- **Historial** ordenable por cualquier columna, con paginación.


 Decisiones de diseño

| Decisión | Motivo |
|---|---|
| JavaScript sin frameworks ni dependencias | El proyecto es académico y debe poder ejecutarse sin instalar nada; además demuestra dominio del lenguaje. |
| Un solo sentido de datos: toda escritura pasa por `state.js` | Evita estados inconsistentes y garantiza el autoguardado. |
| Cálculos aislados en `analytics.js` | La interfaz nunca calcula: así los números son consistentes en todas las vistas y son fáciles de probar. |
| Motor de análisis con reglas y estadística, no aprendizaje automático | Requisito acordado en la reunión de equipo: valor desde el primer sprint y resultados explicables. |
| `localStorage` en lugar de servidor | Cumple el modo sin conexión (RF-21) y el resguardo local de los datos (RNF-05). |
| Scripts clásicos en vez de módulos ES | Permite abrir `index.html` con doble clic (`file://`) sin errores de CORS. |
| Gráficas dibujadas en `<canvas>` a mano | Cero dependencias y control total del estilo institucional. |

---

**Equipo 1 — «Los Inges»**
Israel Castro García (Product Owner) · Hilary Virginia Rodríguez González (Scrum Master) ·
Rafael Adonai Morales Landeros (Desarrollador líder y arquitecto) ·
Camila Alejandra Peraza Zatarain (Desarrolladora y diseñadora UX/UI)
