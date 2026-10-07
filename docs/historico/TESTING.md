# 🧪 Guía de Testing del API

## 📝 Resumen Rápido

Tu aplicación está configurada para conectarse con el API en **http://127.0.0.1:3000/v1**

### ✅ Verificar que el API está funcionando:

1. **Opción 1: Usar la página de test**
   - Abre: `http://127.0.0.1/demo1/test-api.html`
   - Verás el estado del API y botones para testear endpoints
   - Observa los logs para ver respuestas del API

2. **Opción 2: Abrir DevTools y ver la consola**
   - Abre `http://127.0.0.1/demo1/main.html`
   - Presiona `F12` o `Ctrl+Shift+I`
   - Ve a la pestaña "Console"
   - Deberías ver logs como:
     ```
     🔄 Iniciando petición de acceso...
     URL: http://127.0.0.1:3000/v1/vendedor
     📤 Response Status: 200 OK
     ✅ JSON recibido: {...}
     📚 Cargando módulos...
     ```

---

## 🔧 Configuración del API

El archivo `caminos/rutas.js` tiene todas las rutas configuradas:

```javascript
const produccion="http://127.0.0.1:3000/v1"
const rutavendedor=produccion+"/vendedor";
```

### Rutas configuradas:
- ✅ `/login` - Autenticación
- ✅ `/vendedor` - Obtener módulos del usuario (LA MÁS IMPORTANTE)
- ✅ `/cotizacion` - Gestión de cotizaciones
- ✅ `/cliente/*` - Búsqueda de clientes
- ✅ `/producto/*` - Búsqueda de productos
- ✅ `/promocion/*` - Gestión de promociones
- ✅ `/cuota/*` - Datos de cuota
- Y muchas más...

---

## 🐛 Debugging

### ¿Qué hacer si no funcionan los módulos?

1. **Verifica que el API esté levantado**
   ```bash
   # En otra terminal, verifica:
   netstat -ano | findstr 3000  (Windows)
   lsof -i :3000                (Mac/Linux)
   ```

2. **Mira los logs en la consola**
   - Si ves: `❌ Error: HTTP Error: 404`
     → El endpoint no existe en el API
   - Si ves: `❌ Error: Failed to fetch`
     → El API no está levantado o hay problema CORS

3. **Abre test-api.html**
   - Haz clic en "Test /vendedor"
   - Observa exactamente qué responde el API
   - Copia la respuesta JSON y verifica su estructura

---

## 📊 Estructura esperada de respuesta

El API debe devolver un objeto JSON como este:

```json
{
  "cotizacion": "Crear, modificar y gestionar cotizaciones",
  "factura": "Gestión completa de facturas y boletas",
  "cuota": "Ver el avance de cuotas de vendedor",
  "promocion": "Aplicar y gestionar promociones",
  "listas": "Ver listas de cotizaciones y facturas",
  "pedidos": "Gestión de pedidos",
  "reportes": "Descargas de reportes",
  "despacho": "Programar entregas"
}
```

Donde:
- **Clave**: nombre del módulo (se convierte en URL)
- **Valor**: descripción del módulo

---

## 🚀 Flujo de carga del panel

```
1. Usuario accede a main.html
                ↓
2. JavaScript ejecuta manejar_acceso()
                ↓
3. Hace petición GET a /vendedor
                ↓
4. API devuelve objeto con módulos
                ↓
5. JavaScript llama a modulos_dinamicos()
                ↓
6. Se crean cards y items del sidebar
                ↓
7. Todo se muestra en pantalla
```

---

## 🛠️ Herramientas útiles

### Ver todos los logs en consola
1. Abre DevTools (F12)
2. Consola debe mostrar:
   - 🔄 Iniciando petición
   - 📤 Status de respuesta
   - ✅ JSON recibido
   - 📊 Módulos encontrados
   - ➕ Cargando módulo: [nombre]
   - ✅ Todos los módulos cargados

### Ver respuesta exacta del API en Network
1. Abre DevTools (F12)
2. Ve a pestaña "Network"
3. Recarga la página
4. Busca la petición a `vendedor`
5. Haz clic y ve "Response"

---

## 📱 Respuestas posibles

| Caso | Console | Pantalla |
|------|---------|----------|
| **API funciona** | ✅ logs verdes | Módulos aparecen |
| **API caído** | ❌ Failed to fetch | Toast rojo de error |
| **Respuesta vacía** | ⚠️ No hay módulos | Pantalla blanca |
| **Estructura incorrecta** | ❌ JSON error | Toast de error |

---

## 🎯 Próximos pasos

Una vez confirmes que el API funciona y los módulos se cargan:

1. ✅ Mejorar formularios (cotizacion, factura, etc.)
2. ✅ Implementar validaciones
3. ✅ Agregar animaciones en transiciones
4. ✅ Mejorar UX de listas y tablas

---

## 💡 Tips

- **Abre siempre DevTools** para debugging
- **Guarda el test-api.html** para testeos rápidos
- **Mira la consola** primero antes de asumir que algo no funciona
- **Verifica CORS** si tienes problemas de conexión
