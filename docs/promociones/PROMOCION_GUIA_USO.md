# 📱 Guía de Uso - Interfaz Mejorada de Adjuntar Promociones

## 🎯 Objetivo

Este documento describe cómo usar la interfaz mejorada del componente **Adjuntar Promociones** que ahora es completamente responsiva y ofrece una mejor experiencia en celular, tablet y escritorio.

---

## 📋 Flujo Principal

```
┌─ PASO 1: Ingresar Cotización ─┐
│                               │
├─ PASO 2: Ver Items Available ─┤
│                               │
├─ PASO 3: Buscar Promociones  ─┤
│                               │
├─ PASO 4: Revisar Resultados  ─┤
│                               │
└─ PASO 5: Confirmar Adjuntar  ─┘
```

---

## 📱 En Dispositivo Móvil (Celular)

### Pantalla 1: Búsqueda
```
┌─────────────────────────┐
│ 🏢 Adjuntar Promociones │
│                    ← Menú
├─────────────────────────┤
│ Número de Cotización    │
│ Ingresa el número...    │
│ ┌─────────────────────┐ │
│ │ COT-2024-001    🔍  │ │
│ └─────────────────────┘ │
│  [Buscar]               │
└─────────────────────────┘
```

### Pantalla 2: Items Encontrados
```
┌─────────────────────────┐
│ Items de la Cotización  │
│ 3 items encontrados     │
├─────────────────────────┤
│ ┌─────────────────────┐ │
│ │ Producto 1: $150.00 │ │
│ │ Marca: Samsung  Q:5 │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ Producto 2: $200.00 │ │
│ │ Marca: LG       Q:3 │ │
│ └─────────────────────┘ │
│ ┌─────────────────────┐ │
│ │ Producto 3: $300.00 │ │
│ │ Marca: Sony     Q:2 │ │
│ └─────────────────────┘ │
│ [Buscar Promociones]    │
└─────────────────────────┘

├─────────────────────────┤
│ Resumen                 │
│ Cot: COT-2024-001       │
│ Items: 3                │
│ Promociones: 2          │
├─────────────────────────┤
│ [Adjuntar]              │
└─────────────────────────┘
```

---

## 💻 En Tablet

Vista de 2 columnas (Items a la izquierda, Resumen a la derecha):

```
┌─────────────────────────────────┬──────────────────┐
│ Items de la Cotización          │ Resumen          │
│ 3 items encontrados             │                  │
│ ┌─ Producto 1 ─────────────────┐│ Cot: COT-2024-  │
│ │ $150.00                   Q:5 ││ Items: 3         │
│ └────────────────────────────────┘│ Promociones: 2   │
│ ┌─ Producto 2 ─────────────────┐│                  │
│ │ $200.00                   Q:3 ││ [Adjuntar]       │
│ └────────────────────────────────┘│                  │
│ ┌─ Producto 3 ─────────────────┐│ Elementos Selec. │
│ │ $300.00                   Q:2 ││ Sin selecciones  │
│ └────────────────────────────────┘└──────────────────┘
│ [Buscar Promociones]
```

---

## 🖥️ En Escritorio (1920px+)

Vista completa de 3 columnas:

```
┌──────────────────────────────────────────────────────────────────────┐
│ HEADER: Adjuntar Promociones                                  ← Menú │
├─────────────────────────────────────────────────────────────────────┤
│ Número de Cotización | [______COT-2024-001_______]  [Buscar]        │
├─────────────────────────────────────────────┬──────────┬──────────┤
│ Items de la Cotización (2/3 ancho)          │ Resumen  │ Estados  │
│ ┌─────────────────────────────────────────┐ │ Cot: COT │ Seleccs. │
│ │ Producto 1                    $150.00   │ │ Items: 3 │ -        │
│ │ Samsung - Q:5 - Unito:$30     Alm:A1   │ │ Promos:2 │          │
│ └─────────────────────────────────────────┘ │          │          │
│ ┌─────────────────────────────────────────┐ │ [Adjuntar]          │
│ │ Producto 2                    $200.00   │ └──────────┴──────────┘
│ │ LG - Q:3 - Unito:$66.67      Alm:A2   │
│ └─────────────────────────────────────────┘
│ ┌─────────────────────────────────────────┐
│ │ Producto 3                    $300.00   │
│ │ Sony - Q:2 - Unito:$150      Alm:A1   │
│ └─────────────────────────────────────────┘
│ [Buscar Promociones]
├─────────────────────────────────────────────────────────────────────┤
│ Promociones Aplicables (2 promociones)
│ ┌─────────────────┐  ┌─────────────────┐
│ │ Promo 1: 10%    │  │ Promo 2: 5%     │
│ │ En Samsung      │  │ En LG           │
│ └─────────────────┘  └─────────────────┘
└─────────────────────────────────────────────────────────────────────┘
```

---

## ✅ Paso a Paso - Operación Completa

### **1. INGRESAR COTIZACIÓN**

```
Input: COT-2024-001
Presionar: [Buscar] o Enter
Resultado: Se cargan los items
```

**Validaciones:**
- ✔️ Campo no puede estar vacío
- ✔️ Se valida contra BD
- ✔️ Muestra error si no existe

---

### **2. REVISAR ITEMS**

Se muestran automáticamente después de la búsqueda:

| Campo | Información Mostrada |
|-------|---------------------|
| Nombre | Descripción del producto |
| Marca | Marca fabricante |
| Cantidad | Unidades en cotización |
| Precio Unitario | Valor por unidad |
| Precio Total | Cantidad × Unitario |
| Descuento | % descuento aplicado |
| Almacén | Ubicación del stock |

---

### **3. BUSCAR PROMOCIONES**

```
Botón: "Buscar Promociones"
Sistema: Analiza items automáticamente
Resultado: Muestra promociones aplicables
Notificación: ✓ "X promociones encontradas"
```

**El sistema calcula:**
- Promociones por marca
- Promociones por cantidad
- Promociones por precio
- Combinaciones de descuentos

---

### **4. VER PROMOCIONES**

Se despliega sección "Promociones Aplicables":

```
┌─ Promo 1 ─────────────┐
│ Código: P001          │
│ Tipo: Descuento 10%   │
│ Válida: Samsung items │
└───────────────────────┘

┌─ Promo 2 ─────────────┐
│ Código: P002          │
│ Tipo: 2 + 1 gratis    │
│ Válida: LG items      │
└───────────────────────┘
```

---

### **5. CONFIRMAR ADJUNTAR**

```
Botón: [Adjuntar Promociones]
Modal: "¿Confirmar adjuntar estas promociones?"
Seleccionar: [OK] o [Cancelar]
Resultado: ✓ "Promociones adjuntadas exitosamente"
```

---

## 🎨 Elementos Visuales

### **Colores Principales**
- 🔵 **Azul Índigo** (#4F46E5): Acciones principales
- 🟢 **Verde** (#10B981): Éxito, confirmación
- 🟠 **Ámbar** (#F59E0B): Advertencias, promociones
- 🔴 **Rojo** (#EF4444): Errores
- ⚫ **Gris** (#6B7280): Información secundaria

### **Iconos Utilizados**
- 💰 Dinero / Cotización
- 📦 Items / Productos
- 🎁 Promociones
- 🔍 Búsqueda
- ✓ Éxito
- ✕ Error
- ⓘ Información

---

## 🔔 Notificaciones

### **Tipos de Notificaciones**

#### ✓ Éxito (Verde)
```
✓ Cotización cargada: 3 items encontrados
✓ Promociones encontradas: 2 aplicables
✓ Promociones adjuntadas exitosamente
```

#### ✕ Error (Rojo)
```
✕ Cotización no encontrada
✕ Error al buscar promociones
✕ Número de cotización inválido
```

#### ⓘ Información (Azul)
```
ⓘ Ingresa un número de cotización
ⓘ Buscando promociones disponibles...
```

---

## ⌨️ Atajos de Teclado

| Atajo | Acción |
|-------|--------|
| `Enter` | Buscar cotización (desde input) |
| `Tab` | Navegar entre elementos |
| `Esc` | Cerrar modal de confirmación |

---

## 📊 Estados de la Interfaz

### **Inicial**
- Input vacío
- Items no cargados
- Botón "Adjuntar" deshabilitado
- Sin promociones

### **Cargando**
- Spinner de carga
- Input bloqueado
- Mensaje "Buscando..."

### **Cotización Cargada**
- Items visibles
- Contador actualizado
- Botón "Buscar Promociones" disponible
- Resumen actualizado

### **Promociones Encontradas**
- Listado de promociones visible
- Contador de promociones actualizado
- Botón "Adjuntar" habilitado
- Estados seleccionables

### **Confirmación**
- Modal emergente
- Opción OK/Cancelar
- Deshabilitación de otros elementos

---

## 💡 Tips & Trucos

### **Móvil**
- 👆 Desliza hacia abajo para ver más items
- 👆 Toca el card de un item para ver detalles
- 👆 Los botones son suficientemente grandes para tocar

### **Tablet**
- 🖱️ Usa los scrolls horizontales en lista de items
- 🖱️ El resumen se mantiene visible al lado
- 🖱️ Más espacio entre elementos para mejor lectura

### **Escritorio**
- 🖱️ Coloca el ratón en cards para ver efectos hover
- 🖱️ Usa Enter para búsqueda rápida
- 🖱️ Ventana a todo ancho para mejor visualización

---

## 🐛 Solución de Problemas

### **Problema: No se cargan los items**
**Solución:**
1. Verifica que el número de cotización sea correcto
2. Asegúrate de que exista en la BD
3. Recarga la página
4. Contacta soporte

### **Problema: Promociones no aparecen**
**Solución:**
1. Presiona "Buscar Promociones" nuevamente
2. Verifica que los items sean elegibles
3. Espera a que termine la búsqueda

### **Problema: Layout desordenado en móvil**
**Solución:**
1. Asegúrate de que la viewport esté bien configurada
2. Gira el dispositivo a otra orientación
3. Limpia el cache del navegador

---

## 📞 Soporte

Si encuentras problemas:
- ✉️ Email: soporte@empresa.com
- 📱 Teléfono: +1-234-567-8900
- 💬 Chat: disponible en horario comercial

---

*Última actualización: 24 de Marzo, 2026*
*Versión: 2.0 (Interfaz Mejorada)*
