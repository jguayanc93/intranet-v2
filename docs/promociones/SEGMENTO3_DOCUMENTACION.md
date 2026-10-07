# Documentación - Segmento 3: Carrito de Productos

## 📋 Descripción General
El Segmento 3 permite a los usuarios visualizar, revisar y modificar los productos seleccionados en el Segmento 2 antes de generar la cotización final.

---

## 🎯 Funcionalidades Implementadas

### 1. **Resumen de Productos**
- Muestra la cantidad total de productos seleccionados
- Se actualiza en tiempo real al agregar/modificar productos
- Ubicación: Parte superior del Segmento 3

### 2. **Botón Detallado** 📋
**Abre un modal que muestra:**
- Lista limpia y legible de todos los productos seleccionados
- Para cada producto:
  - Nombre/Descripción
  - Cantidad seleccionada
  - Descuento aplicado (%)
  - Precio unitario (en la moneda seleccionada)
  - Stock disponible (Principal / Secundario)
  - **Valor de Venta** (calculado automáticamente)

**Totales mostrados:**
- `Sin Venta sin IGV`: Suma de todos los valores de venta
- `Venta con IGV`: Suma × 1.18 (18% de impuesto)

**Botones del modal:**
- `OK`: Cierra el modal
- `Conformidad`: Registra conformidad (sin funcionalidad por ahora)

---

### 3. **Botón Modificar** ✏️
**Proceso en 2 pasos:**

**Paso 1 - Seleccionar Producto:**
- Modal con lista de todos los productos seleccionados
- Cada item muestra: nombre, cantidad actual y descuento actual
- Al hacer click en un producto, se abre el formulario de edición

**Paso 2 - Editar Producto:**
- Modal con formulario para cambiar:
  - **Cantidad**: 1-500 unidades (validación automática)
  - **Descuento**: 0-100% (respeta máximo del producto)
- Previsualización del nuevo valor de venta en tiempo real
- Botones:
  - `Guardar Cambios`: Aplica los cambios y regresa a lista
  - `Cancelar Modificación`: Descarta cambios y regresa a lista

---

### 4. **Botón Promociones** 🎁
- Interfaz creada pero sin funcionalidad (en desarrollo)
- Muestra mensaje indicativo

---

## 🔧 Detalles Técnicos

### Estructura de Datos - `productosSeleccionados`
```javascript
{
  "123": {  // ID del producto como clave
    id: 123,
    descripcion: "Nombre del Producto",
    cantidad: 10,
    descuento: 5.50,
    precioUnitario: 15.00,
    descuentoMaximo: 15,
    stock1: 50,      // Stock principal
    stock2: 20       // Stock secundario
  }
}
```

### Validación de Duplicados
- Cuando un producto se intenta agregar, se verifica su **ID**
- Si el ID ya existe en `productosSeleccionados`, se **ignora** el nuevo intento
- Esto previene duplicados accidentales

### Cálculo de Valores
```
Valor de Venta = (Precio Unitario × Cantidad) - Descuento
Descuento = (Precio Unitario × Cantidad) × (Descuento% / 100)
IGV = Valor de Venta × 0.18
Total con IGV = Valor de Venta + IGV
```

### Conversión de Monedas
- **USD a PEN**: Multiplica por 3.80
- **PEN a USD**: Divide entre 3.80
- La conversión se aplica automáticamente según la moneda seleccionada en el Segmento 1

### Validaciones Implementadas

**Cantidad:**
- Debe ser un número entero
- Mínimo: 1
- Máximo: 500
- Mensaje de error en tiempo real

**Descuento:**
- Debe ser un número decimal (máximo 2 decimales)
- Mínimo: 0%
- Máximo: Respeta el `descuentoMaximo` del producto
- Acepta valores con 2 decimales
- Recalcula el valor de venta en tiempo real

---

## 📁 Archivos Modificados/Creados

### Nuevos:
- **`/js/cotizacion/buscar_cliente_part3.js`** - Lógica completa del Segmento 3

### Modificados:
- **`/cotizacion/cotizacion_nuevo.html`** - HTML de modales y estructura visual

---

## 🔄 Integración con Otros Módulos

### Desde `buscar_cliente_part2.js`
Cuando el usuario confirma un producto en Segmento 2:
1. Se llama a `agregarProductoAlCarrito(producto, cantidad, descuento)`
2. La función es interceptada por `buscar_cliente_part3.js`
3. Se valida el duplicado por ID
4. Si es nuevo, se agrega a `productosSeleccionados`
5. Se actualiza el UI automáticamente

### Variables Globales
- `window.productosSeleccionados` - Accesible desde otros scripts
- Permite futuras integraciones con Segmento 4

---

## 🎨 Estilos y Animaciones

- **Modales**: Animación slide-in desde abajo
- **Botones**: Transiciones suaves y efectos hover
- **Colores**:
  - Azul: Detallado
  - Ámbar: Modificar
  - Púrpura: Promociones
  - Verde: Totales y valores

---

## 📝 Notas Importantes

1. **Conversión de Monedas**: Los precios se almacenan internamente en USD (según backend) y se convierten según la moneda seleccionada
2. **Cálculos en Tiempo Real**: El valor de venta se recalcula automáticamente al cambiar cantidad o descuento
3. **Validaciones Estrictas**: Todos los inputs tienen validación con mensajes de error claros
4. **Interfaz Responsiva**: Funciona correctamente en móvil y desktop

---

## 🚀 Mejoras Futuras

- [ ] Implementar funcionalidad de Promociones
- [ ] Agregar confirmar conformidad
- [ ] Integrar con backend para guardar estado
- [ ] Permitir eliminar productos del carrito
- [ ] Agregar búsqueda rápida en lista de modificación

---

## 💬 Soporte

Para consultas o mejoras:
- Revisa los comentarios en el código
- Todos los eventos están etiquetados claramente
- Las funciones están documentadas con comentarios descriptivos
