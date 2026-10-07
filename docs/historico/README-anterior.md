## 🚀 CDK - Portal de Gestión de Ventas

### ⚠️ **IMPORTANTE: Usar 127.0.0.1, NO localhost**

El API está configurado para **127.0.0.1:3000**, así que debes acceder desde **127.0.0.1**, no desde localhost.

---

## 📍 URLs para Acceder

```
✅ CORRECTO:
- http://127.0.0.1/demo1/
- http://127.0.0.1/demo1/main.html
- http://127.0.0.1/demo1/test-api.html

❌ INCORRECTO (NO funcionará CORS):
- http://localhost/demo1/
- http://localhost:80/demo1/
```

---

## ✅ Checklist Rápido

- [ ] **API levantado**: `http://127.0.0.1:3000` ✅ ACTIVO
- [ ] **Accediendo desde**: `http://127.0.0.1/demo1/`
- [ ] **Archivo rutas.js** configurado con `127.0.0.1:3000`

---

## 🧪 Testing Rápido

### Opción 1: Página de Test
```
http://127.0.0.1/demo1/test-api.html
```
- Verá estado del API
- Botón para testear `/vendedor`
- Logs en tiempo real

### Opción 2: DevTools Console
```
1. Abre http://127.0.0.1/demo1/main.html
2. Presiona F12
3. Ve a "Console"
4. Verás logs como:
   ✅ Response Status: 200 OK
   ✅ Módulos cargados
```

---

## 🔧 Configuración de Rutas

Archivo: `caminos/rutas.js`

```javascript
const produccion="http://127.0.0.1:3000/v1"
// Todas las rutas usan:
const rutavendedor=produccion+"/vendedor";
const rutalogin=produccion+"/login";
// ... etc
```

---

## 📋 Estructura Esperada del API

El endpoint `/vendedor` debe devolver:

```json
{
  "cotizacion": "Descripción",
  "factura": "Descripción",
  "cuota": "Descripción",
  ...
}
```

---

## 🎯 Archivos Principales

| Archivo | URL | Descripción |
|---------|-----|-------------|
| **main.html** | `/main.html` | Panel de control principal |
| **index.html** | `/index.html` | Login |
| **test-api.html** | `/test-api.html` | Testing de API |
| **TESTING.md** | Guía completa de debugging |

---

## 💡 Si algo no funciona

1. **Verifica que accedas desde 127.0.0.1**
   ```
   Abre Developer Tools (F12)
   Console debería mostrar:
   URL: http://127.0.0.1:3000/v1/vendedor
   ```

2. **Verifica que el API esté levantado**
   ```
   En otra terminal:
   netstat -ano | findstr 3000
   o
   curl http://127.0.0.1:3000/v1/vendedor
   ```

3. **Mira los logs**
   - Abre test-api.html
   - Haz clic en "Test /vendedor"
   - Observa los logs para ver exactamente qué está pasando

---

## 📞 Contacto / Debugging

Si tienes problemas:
1. Abre `test-api.html`
2. Copia los logs exactos que ves
3. Revisa que el API esté respondiendo
4. Verifica que accedas desde `127.0.0.1`
