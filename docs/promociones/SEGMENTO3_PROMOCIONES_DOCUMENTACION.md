# Documentación - Segmento 3: Sistema de Promociones (Parte 4)

## 📋 Descripción General
El sistema de **Promociones** permite que los clientes vean qué promociones están disponibles para su carrito de productos actual. El flujo es automático: obtiene códigos de promociones disponibles y luego trae los detalles de cada una.

---

## 🎯 Funcionalidades Implementadas

### 1. **Botón Promociones** 🎁
Al hacer clic, se abre un modal que:
- Carga automáticamente las promociones disponibles
- Maneja errores gracefully (si una promo falla, la ignora)
- Muestra solo las promociones que cumplen requisitos

### 2. **Proceso de Carga de Promociones**

#### **Paso 1: Obtener Códigos**
- Envía lista de productos seleccionados al backend
- Backend retorna array de códigos de promociones disponibles
- Si array vacío → mostrar "No hay promociones disponibles"
- Si hay códigos → proceder al Paso 2

#### **Paso 2: Obtener Detalles de Cada Promoción**
Para cada código obtenido:
1. Llamar a API de detalles de promoción
2. Pasar: código + lista de productos
3. Backend valida si productos cumplen requisitos
   - Si **NO cumple** → la API falla (se ignora esa promo)
   - Si **SÍ cumple** → retorna detalles

Datos retornados por promoción:
- `codigo`: Identificador único
- `descripcion`: Texto descriptivo de la promo
- `cantidad`: Cantidad necesaria o cantidad aplicable
- `montoDescuento`: Monto a descontar (ej: 7.95)
- `monedaDescuento`: Moneda del descuento (D=USD, S=PEN)

### 3. **Visualización de Promociones**

Cada promoción exitosa se muestra en una tarjeta con:
- **Título**: Descripción de la promoción
- **Código**: Identificador único
- **Cantidad**: Cantidad aplicable
- **Descuento en Monto**: Cantidad a descontar (ej: -7.95 USD)

---

## 📊 Cálculos y Totales

### **Observación 1: Valor con Descuento (sin IGV)**
```
Valor Venta = Suma de todos los productos seleccionados
Descuento = Suma de montos de descuento de todas las promos
Total con Descuento = Valor Venta - Descuento
```

**Ejemplo:**
- Valor Venta: 100.00 USD
- Descuento: -7.95 USD
- Total: 92.05 USD

### **Observación 2: Valor con IGV (18%)**
```
Con IGV = Total con Descuento × 1.18
```

**Ejemplo:**
- Total: 92.05 USD
- Con IGV: 92.05 × 1.18 = 108.62 USD

### **Ahorro Estimado**
```
Ahorro = Descuento × 1.18
```

---

## 🔧 Detalles Técnicos

### **Estructura de Datos - Promoción**
```javascript
{
  codigo: "PROMO001",
  descripcion: "Descuento por volumen - 10+ unidades",
  cantidad: 10,
  montoDescuento: 7.95,
  monedaDescuento: "D"  // D=USD, S=PEN
}
```

### **Manejo de Errores**

**Cuando falla una promoción:**
1. Promise.allSettled() captura el error
2. La promoción se ignora silenciosamente
3. Se muestran solo las que son exitosas

**Si TODAS fallan:**
- Mostrar mensaje: "No hay promociones disponibles"

**Si hay algunas:**
- Mostrar contador: "Se encontraron X promociones"
- Mostrar lista con cada una
- Permitir aplicar

### **Conversión de Monedas**
- **USD a PEN**: Multiplica por 3.80
- **PEN a USD**: Divide entre 3.80
- Se aplica automáticamente según selección en Segmento 1
- Los montos de descuento se convierten al cambiar de moneda

---

## 🔌 APIs Requeridas

### **1. Obtener Códigos de Promociones**

**Ruta:**
```
POST {rutapromocodigos}
```

**Cuerpo:**
```javascript
{
  productos: {
    "123": {
      id: 123,
      descripcion: "Producto A",
      cantidad: 10,
      descuento: 5.5,
      precioUnitario: 15.00,
      descuentoMaximo: 15,
      stock1: 50,
      stock2: 20
    },
    "456": { ... }
  }
}
```

**Respuesta Exitosa:**
```javascript
"[\"PROMO001\", \"PROMO002\", \"PROMO003\"]"  // JSON stringificado
```

**Respuesta Sin Promociones:**
```javascript
"[]"  // Array vacío stringificado
```

---

### **2. Obtener Detalle de Promoción**

**Ruta:**
```
POST {rutapromodetalles}
```

**Cuerpo:**
```javascript
{
  codigo: "PROMO001",
  productos: {
    "123": { ... },
    "456": { ... }
  }
}
```

**Respuesta Exitosa:**
```javascript
"{
  \"codigo\": \"PROMO001\",
  \"descripcion\": \"Descuento por volumen\",
  \"cantidad\": 10,
  \"montoDescuento\": 7.95,
  \"monedaDescuento\": \"D\",
  \"exito\": true
}"  // JSON stringificado
```

**Respuesta Fallo (No cumple requisitos):**
```javascript
"{
  \"error\": true,
  \"mensaje\": \"No cumple cantidad mínima\"
}"  // JSON stringificado
```

---

## 📝 Variables Globales Necesarias

Agregar a `rutas.js`:
```javascript
const rutapromocodigos = produccion + "/promocion/codigos";
const rutapromodetalles = produccion + "/promocion/detalle";
```

---

## 📁 Archivos

- **Creado**: [buscar_promo_part4.js](js/cotizacion/buscar_promo_part4.js) (350+ líneas)
- **Actualizado**: [cotizacion_nuevo.html](cotizacion/cotizacion_nuevo.html) (modal + script)

---

## 🔄 Flujo Completo

```
Usuario hace click en "Promociones"
    ↓
Modal se abre
    ↓
Envía productos seleccionados al backend
    ↓
Backend retorna array de códigos [PROMO001, PROMO002, ...]
    ↓
¿Array vacío?
    ├─ SÍ → Mostrar "No hay promociones"
    └─ NO → Proceder
    ↓
Para cada código, obtener detalles
    ↓
¿Detalle exitoso?
    ├─ SÍ → Agregar a lista visual
    └─ NO → Ignorar
    ↓
Mostrar lista de promociones exitosas
    ↓
Calcular totales con descuento e IGV
    ↓
Usuario puede:
    ├─ Aplicar promociones → Se guardan
    └─ Cancelar → Se descartan
```

---

## 💡 Estados del Modal

### **Cargando**
- Muestra spinner
- Texto: "Buscando promociones disponibles..."

### **Sin Promociones**
- Muestra ícono grande
- Título: "No hay promociones disponibles"
- Descripción: "Tu lista actual no cumple con los requisitos..."

### **Con Promociones**
- Muestra contador: "Se encontraron X promociones"
- Lista de promociones
- Totales: Valor, Descuento, Total con Descuento, Con IGV, Ahorro
- Botones: Aplicar Promoción, Cancelar

---

## 🎨 Elementos Visuales

### **Tarjeta de Promoción**
- Fondo: Gradiente púrpura a rosa
- Borde: Púrpura claro
- Título con ícono de etiqueta
- Grid de información (código, cantidad)
- Box de descuento en rojo

### **Totales**
- **Sin IGV**: Box blanco
- **Con IGV**: Box verde
- **Ahorro**: Box azul
- Todos con valores grandes y legibles

---

## ⚙️ Configuración y Personalización

### **Cambiar tasa de cambio USD/PEN:**
En `buscar_promo_part4.js`:
```javascript
const tipoCambioUSDPEN = 3.80;  // Cambiar a tu tasa
```

### **Cambiar IGV:**
En cálculos, cambiar `1.18` por el factor deseado
```javascript
const totalConIgv = totalConDescuento * 1.18;  // Cambiar a * 1.XX
```

---

## 🔍 Debugging

### **Verificar promociones cargadas:**
```javascript
console.log(promocionesExitosas);  // Array de promos exitosas
console.log(promocionesAplicadas);  // Promos que se aplicaron
```

### **Verificar cálculos:**
En el modal abierto, inspeccionar elementos:
- `#promo-valor-venta` - Valor total
- `#promo-total-descuento` - Total con descuento
- `#promo-total-con-igv` - Total con IGV

---

## 🚀 Mejoras Futuras

- [ ] Permitir seleccionar promociones individualmente
- [ ] Mostrar por qué falló cada promoción
- [ ] Historial de promociones aplicadas
- [ ] Autoaplicar promiciones recomendadas
- [ ] Integración con rentabilidad

---

## 📞 Notas Importantes

1. **JSON Stringificado**: El backend retorna JSON stringificado (parseado dos veces)
2. **Manejo de Errores**: Las faltas de una promo no impiden mostrar otras
3. **Conversión Automática**: Se recalcula al cambiar de moneda
4. **Validación en Backend**: Es el backend quien valida requisitos

---

