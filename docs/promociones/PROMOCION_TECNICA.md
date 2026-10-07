# 🔧 Documentación Técnica - Mejoras de Interfaz Promocion Adjuntar

## 📁 Archivos Involucrados

### Modificados
- `promocion/promocion_adjuntar.html` - Interfaz principal
- `js/promos/buscar_cotizacion.js` - Lógica de búsqueda

### Creados
- `styles/promocion-adjuntar.css` - Estilos personalizados
- `PROMOCION_MEJORAS.md` - Resumen de mejoras
- `PROMOCION_GUIA_USO.md` - Guía de usuario

---

## 🎯 Cambios en promocion_adjuntar.html

### Estructura Central

#### 1. Header Sticky
```html
<header class="sticky top-0 z-40 bg-white shadow-sm border-b border-gray-200">
```
- Posición: `sticky` para seguir al usuario al desplazarse
- Z-index: 40 (debajo de modales con z-50)
- Contiene título y botón "Volver"

#### 2. Main Grid Layout
```html
<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
```
- Hasta 7xl en ancho (1280px máximo)
- Responsive: 1 columna (móvil) → 3 columnas (desktop)
- Gap de 6 unidades (24px)

#### 3. Secciones Principales
```
Sección Búsqueda (100% ancho)
├─ Input: ncoti
└─ Botón: buscar-coti

Grid Principal
├─ Columna Izquierda (2/3): Items
│  ├─ Header gradiente azul
│  └─ Container: contendor-final-final
├─ Columna Derecha (1/3): Resumen
│  ├─ Card Resumen
│  ├─ Botón Adjuntar
│  └─ Card Elementos Seleccionados
└─ Promociones (100% ancho, oculto por defecto)
   └─ Container: contendor-promos-final
```

### Cambios Específicos

#### Before (Antiguo):
```html
<div class="min-[601px]:max-w-[400px] min-[601px]:mx-auto">
  <a href="/main.html">MENU</a>
</div>
```

#### After (Nuevo):
```html
<header class="sticky top-0 z-40">
  <div class="flex justify-between items-center">
    <div class="flex items-center gap-3">
      <!-- Logo + Título -->
    </div>
    <a href="/main.html">← Menú</a>
  </div>
</header>
```

---

## 🎨 CSS - Estilos Personalizados

### Ubicación
```
/styles/promocion-adjuntar.css
```

### Componentes Principales

#### 1. Animaciones
```css
@keyframes slideInUp {
    from { transform: translateY(20px); opacity: 0; }
    to { transform: translateY(0); opacity: 1; }
}

@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}
```

#### 2. Toast Notifications
```css
.toast-notification {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    z-index: 50;
}

.toast-success { background: linear-gradient(135deg, #10b981, #059669); }
.toast-error { background: linear-gradient(135deg, #ef4444, #dc2626); }
.toast-info { background: linear-gradient(135deg, #6366f1, #4f46e5); }
```

#### 3. Item Cards
```css
.item-card {
    transition: all 0.2s ease-in-out;
    border: 2px solid transparent;
}

.item-card:hover {
    border-color: #4f46e5;
    box-shadow: 0 4px 12px rgba(79, 70, 229, 0.15);
}

.item-card.selected {
    background-color: #eef2ff;
    border-color: #4f46e5;
}
```

#### 4. Badges
```css
.badge-success { background: linear-gradient(135deg, #10b981, #059669); }
.badge-warning { background: linear-gradient(135deg, #f59e0b, #d97706); }
.badge-info { background: linear-gradient(135deg, #6366f1, #4f46e5); }
```

---

## 📝 Cambios en buscar_cotizacion.js

### Nuevas Características

#### 1. Validación de Input
```javascript
const nCoti = document.getElementById("ncoti").value.trim();
if (!nCoti) {
    mostrarNotificacion('Por favor ingresa un número de cotización', 'error');
    return;
}
```

#### 2. Búsqueda con Enter
```javascript
document.getElementById("ncoti").addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        document.getElementById("buscar-coti").click();
    }
});
```

#### 3. Mejor Visualización de Items
```javascript
let itemElement = document.createElement('div');
itemElement.className = "flex items-center gap-4 p-4 bg-gray-50 hover:bg-gray-100 rounded-lg";
itemElement.innerHTML = `
    <div>
        <div>Producto: ${item[14]}</div>
        <div>Marca: ${item[12]}</div>
        <div>Cantidad: ${item[15]}</div>
        <!-- Más detalles -->
    </div>
`;
```

#### 4. Manejo de Errores Mejorado
```javascript
if (!paso1.ok) throw new Error('Cotización no encontrada');

// Mostrar UI de error
document.getElementById("contendor-final-final").innerHTML = `
    <div class="text-center py-8">
        <svg><!-- Icono error --></svg>
        <p>Error al buscar la cotización</p>
    </div>
`;
```

---

## ⚙️ Variables Globales Utilizadas

### Del Sistema Original
```javascript
coti_cant          // Cantidad de items en la cotización
prom_numero        // Objeto con promociones encontradas
promos_conjunto_diferenciales  // Array de IDs de promociones
cont_grupo_id      // Array de grupos de promociones
```

### Variables del Script UI
```javascript
selectedItems      // Set de items seleccionados
```

### Rutas Utilizadas
```javascript
rutacotizacionleer  // API endpoint para leer cotización
rutapromocionrecojedor  // API endpoint para recolectar promociones
rutapromocionacoplador  // API endpoint para adjuntar promociones
```

---

## 🔌 Funciones Principales

### buscar_cotizacion2()
**Función Principal de Búsqueda**

```javascript
async function buscar_cotizacion2() {
    // 1. Limpiar UI anterior
    // 2. Validar entrada
    // 3. Fetch a API
    // 4. Procesar respuesta
    // 5. Renderizar items
    // 6. Actualizar contadores
    // 7. Mostrar botón de promociones
}
```

**Flow:**
```
Entrada: #ncoti input
   ↓
Validación
   ↓
Spinner de carga
   ↓
Fetch: rutacotizacionleer
   ↓
Parse resultado
   ↓
Renderizar items
   ↓
Mostrar "Buscar Promociones"
   ↓
Actualizar UI
```

### esperador(promos)
**Espera Asíncrona de Promociones**

```javascript
async function esperador(promos) {
    for(const idprom of promos) {
        await ver_promo2(idprom);  // Espera cada una
    }
    actualizarEstadoUI();
}
```

### addprom()
**Adjunta Promociones Seleccionadas**

```javascript
async function addprom() {
    // 1. Recolecta datos
    // 2. Envía a API
    // 3. Muestra modal de confirmación
    // 4. Limpia variables
}
```

---

## 🎬 Scripts Cargados en Orden

```html
<script src="/caminos/rutas.js"></script>              <!-- URLs de API -->
<script src="/js/global/variables.js"></script>        <!-- Variables globales -->
<script src="/js/promos/buscar_cotizacion.js"></script> <!-- Búsqueda -->
<script src="/js/promos/promo_visualisar.js"></script>  <!-- Visualización -->
<script src="/js/promos/promo_adjuntar.js"></script>    <!-- Adjunto -->
<script src="/js/funciones/pivot.js"></script>          <!-- Pivot -->
```

**Orden importante:** Se cargan variables antes de funciones que las utilizan.

---

## 📱 Breakpoints Tailwind Utilizados

```css
/* Mobile First */
/* Default: < 640px */

/* sm: 640px */
sm:px-6          /* Padding en tablets */
sm:flex-row      /* Flexbox horizontal */
sm:text-sm       /* Tamaño texto reducido */

/* md: 768px */
md:py-8          /* Padding vertical en tablets */
md:text-base     /* Tamaño texto normal */

/* lg: 1024px */
lg:col-span-2    /* 2 columnas en grid */
lg:px-8          /* Padding horizontal */
lg:grid-cols-3   /* 3 columnas desktop */
```

---

## 🔐 Seguridad

### Headers HTTP Utilizados
```javascript
fetchobj.headers = {"Content-Type":"application/json"};
fetchobj.mode = "cors";
fetchobj.credentials = "include";  // Cookies incluidas
```

### Validaciones
- Server-side: Las realiza en el backend
- Client-side:
  - Input no vacío
  - Formato de cotización
  - Respuestas JSON válidas

---

## 📊 Estructura de Datos API

### Request: Búsqueda Cotización
```json
{
  "ncoti": "COT-2024-001"
}
```

### Response: Items
```json
{
  "0": [id, cod, marca, precio, almacen, cant, ..., nombre_largo, precio_total, almacen_code],
  "1": [...],
  "2": [...]
}
```

### Request: Adjuntar Promociones
```json
{
  "ncoti": "COT-2024-001",
  "fullpromo": { "0": [...], "1": [...], "descuento": [...] }
}
```

---

## 🔄 Flujo de Actualización de UI

```
Usuario ingresa cotización
    ↓
[Enter] o [Buscar]
    ↓
buscar_cotizacion2()
    ↓
Spinner de carga
    ↓
API: fetch cotización
    ↓
Parse JSON
    ↓
Renderizar items en HTML
    ↓
actualizarEstadoUI()
    ↓
Actualizar: #total-items, #promo-count
    ↓
Mostrar "Buscar Promociones"
    ↓
mostrarToast("Éxito")
```

---

## 🐛 Puntos de Posible Mejora

### Performance
- [ ] Virtualizar lista de items (si > 100)
- [ ] Lazy loading de images
- [ ] Service worker para caché

### UX
- [ ] Filtrado de items en tiempo real
- [ ] Búsqueda por marca/almacén
- [ ] Guardado de favoritos
- [ ] Historial de búsquedas

### Código
- [ ] Refactorizar funciones grandes
- [ ] Agregar tipos TypeScript
- [ ] Más tests automáticos
- [ ] Documentación JSDoc

---

## 🔗 Dependencias Externas

### CDN
- **Tailwind CSS 4**: `@tailwindcss/browser@4`
- Proporciona utilidades CSS (sin build)

### Rutas/APIs
- Definidas en `/caminos/rutas.js`
- Backend debe proporcionar endpoints:
  - POST `/cotizacion/leer`
  - POST `/promocion/recolectar`
  - POST `/promocion/acoplar`

---

## ✅ Checklist de Testing

- [ ] ✓ Búsqueda en móvil (< 640px)
- [ ] ✓ Búsqueda en tablet (640px - 1024px)
- [ ] ✓ Búsqueda en desktop (> 1024px)
- [ ] ✓ Search con Enter
- [ ] ✓ Error handling
- [ ] ✓ Toasts funcionan
- [ ] ✓ Modal de confirmación
- [ ] ✓ Contador se actualiza
- [ ] ✓ Scrolling suave
- [ ] ✓ Animaciones fluidas

---

## 📚 Referencias Utilizadas

- **Tailwind CSS**: https://tailwindcss.com
- **Fetch API**: MDN Web Docs
- **CSS Animations**: W3C Specs
- **Responsive Design**: Mobile-first approach

---

*Última actualización: 24 de Marzo, 2026*
*Versión: 2.0 - Interfaz Mejorada*
*Mantenedor: Equipo de Desarrollo*
