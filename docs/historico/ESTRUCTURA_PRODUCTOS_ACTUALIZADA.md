# Estructura de Datos - Productos Seleccionados (Actualizado)

## 📊 Nueva Estructura

La estructura de `productosSeleccionados` ahora usa **índices numéricos** en lugar de IDs de producto, lo que facilita el envío de datos al backend y la iteración sobre los productos.

### Formato Actual

```javascript
productosSeleccionados = {
    0: {
        codigo: 123,              // ID del producto (para validar duplicados)
        descripcion: "Producto A",
        cantidad: 10,
        descuento: 5.5,           // En %
        precioUnitario: 15.00,    // Precio original
        descuentoMaximo: 15,      // Descuento máximo permitido
        stock1: 50,               // Stock principal
        stock2: 20                // Stock secundario/MYM
    },
    1: {
        codigo: 456,
        descripcion: "Producto B",
        cantidad: 5,
        descuento: 0,
        precioUnitario: 20.00,
        descuentoMaximo: 10,
        stock1: 100,
        stock2: 50
    }
    // ... más productos
}
```

## 🔑 Cambios Clave

### 1. **Validación de Duplicados**
- Ahora usa `idsProductosAgregados` array para rastrear IDs únicos
- Evita agregar el mismo producto (ID) dos veces
- Si intenta agregar un ID duplicado, lo ignora silenciosamente

### 2. **Índices Numéricos**
- Los productos se almacenan con índices 0, 1, 2, 3... (secuencial)
- No se usa el ID del producto como clave
- Fácil de iterar y enviar al backend

### 3. **Variables de Control**

```javascript
let productosSeleccionados = {};      // Objeto con índices numéricos
let idsProductosAgregados = [];        // Array de IDs para evitar duplicados
let contadorProductos = 0;             // Contador para el próximo índice
let indiceProductoEnEdicion = null;    // Índice del producto siendo editado
```

## 🔄 Flujo de Adición

```
Usuario agrega producto
    ↓
Backend retorna: {id, descripcion, stock1, stock2, descuentoMaximo, precioUnitario}
    ↓
¿El ID ya existe en idsProductosAgregados?
    ├─ SÍ → Se ignora (duplicado)
    └─ NO → Procede
    ↓
Se almacena en productosSeleccionados[contadorProductos]
Se agrega ID a idsProductosAgregados
contadorProductos++
```

## 📤 Envío a Backend (Promociones)

Cuando se llama `obtenerCodigosPromociones()`, se envía:

```javascript
{
    productos: {
        0: {
            codigo: 123,
            descripcion: "Producto A",
            cantidad: 10,
            descuento: 5.5,
            precioUnitario: 15.00
        },
        1: {
            codigo: 456,
            descripcion: "Producto B",
            cantidad: 5,
            descuento: 0,
            precioUnitario: 20.00
        }
    }
}
```

## 🎯 Uso en Diferentes Contextos

### **Modal Detallado**
- Itera con `Object.values(productosSeleccionados)`
- Muestra: código, descripción, cantidad, descuento, precio, stock, valor de venta

### **Modal Modificar**
- Itera con `Object.entries(productosSeleccionados)`
- Obtiene tanto índice como producto
- Al clickear, abre modal de edición con el índice

### **Edición de Producto**
- Recibe `(indice, producto)`
- Guarda cambios usando `productosSeleccionados[indice]`
- No necesita buscar por ID

### **Promociones**
- Accede a `window.productosSeleccionados`
- Usa datos como: `codigo`, `descripcion`, `cantidad`, `descuento`, `precioUnitario`
- Calcula totales correctamente

## ✅ Ventajas

- ✅ **Validación de duplicados más eficiente** - Usa array separado
- ✅ **Índices numéricos secuenciales** - Fácil de usar y entender
- ✅ **Compatible con iteración** - Funciona bien con `Object.entries()` y `Object.values()`
- ✅ **Datos completos para backend** - Incluye todo lo necesario para promociones
- ✅ **Edición por índice** - No necesita buscar por ID

## 🔧 Función de Reinicio

```javascript
function reiniciarSegmento3() {
    productosSeleccionados = {};
    idsProductosAgregados = [];
    contadorProductos = 0;
    productoEnEdicion = null;
    indiceProductoEnEdicion = null;
    actualizarResumenProductos();
}
```

Llamar esta función si necesitas limpiar el segmento 3 completamente.

## 📝 Nota Importante

La estructura `codigo` contiene el **ID del producto original** del backend. Se usa:
- Para validar duplicados
- Para mostrar en detalles
- Para identificar productos de manera única

---

**Archivo actualizado:** [buscar_cliente_part3.js](js/cotizacion/buscar_cliente_part3.js)
