# Guía de Integración de Toasts en Scripts de Factura

## Descripción General
Se ha creado un sistema centralizado de notificaciones toast que puede ser utilizado en todos los scripts de factura para mejorar la UX con mensajes informativos, de error, éxito y advertencias.

## Instalación
El archivo ya está incluido en todos los HTMLs de factura:
```html
<script src="/js/global/toast-notifications.js"></script>
```

## Uso Básico

### Notificación de Éxito
```javascript
toast.success("Factura guardada correctamente");
```

### Notificación de Error
```javascript
toast.error("Error al guardar la factura");
```

### Notificación de Advertencia
```javascript
toast.warning("Este cambio no puede revertirse");
```

### Notificación Informativa
```javascript
toast.info("Factura número 12345 cargada");
```

### Loading (sin auto-cierre)
```javascript
const loader = toast.loading("Guardando cambios...");
// Luego cerrar manualmente:
loader.remove();
```

## Duración Personalizada
Por defecto, los toasts se cierran después de 4 segundos. Puedes personalizar:

```javascript
// 0 = nunca se cierra automáticamente
toast.success("Mensaje", 0);

// 2000 ms = 2 segundos
toast.info("Mensaje rápido", 2000);

// 6000 ms = 6 segundos
toast.error("Mensaje importante", 6000);
```

## Integración en Scripts Existentes

### Ejemplo 1: En la función `identificar.js`
Cuando se carga una factura exitosamente:
```javascript
fetch(rutafacturacampodespacho, fetchobj)
  .then(resultado => resultado.ok ? resultado.json() : resultado.text())
  .then(resultado => {
    JSON.parse(resultado);
    toast.success("Factura cargada correctamente");
    objfactura = [resultado[0][2], resultado[0][3]];
    document.getElementById("tipo-despacho").value = resultado[0][1];
  })
  .catch(err => {
    console.log(err);
    toast.error("No se pudo cargar la factura");
  });
```

### Ejemplo 2: Para guardar cambios
```javascript
async function guardarCambios() {
  try {
    const loadingToast = toast.loading("Guardando cambios...");
    
    const response = await fetch(rutaGuardar, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos)
    });

    loadingToast.remove();
    
    if (response.ok) {
      toast.success("Cambios guardados correctamente");
    } else {
      toast.error("Error al guardar los cambios");
    }
  } catch (error) {
    toast.error("Error inesperado: " + error.message);
  }
}
```

### Ejemplo 3: Validar entrada de usuario
```javascript
document.getElementById("vendedor-asignado2").addEventListener("blur", () => {
  const valor = document.getElementById("vendedor-asignado2").value.trim();
  
  if (!valor) {
    toast.warning("El campo de vendedor no puede estar vacío");
    return;
  }
  
  toast.info("Vendedor: " + valor);
});
```

## Casos de Uso Recomendados

| Evento | Toast | Mensaje |
|--------|-------|---------|
| Búsqueda exitosa | success | "Factura #123 cargada correctamente" |
| Búsqueda sin resultado | warning | "Factura no encontrada, verifica el número" |
| Error de conexión | error | "Error: No se pudo conectar al servidor" |
| Campo vacío | warning | "Por favor completa todos los campos" |
| Cambio guardado | success | "Cambios guardados correctamente" |
| Validación rechazada | error | "El formato ingresado no es válido" |
| Cargando | loading | "Buscando factura..." |
| Acción cancelada | info | "Operación cancelada" |

## Personalización Visual

Los toasts tienen estilos predefinidos pero puedes modificar en `toast-notifications.js`:

- **Colores de fondo:** Cambiar `bg-green-50`, `bg-red-50`, etc.
- **Duración:** Cambiar valor por defecto de 4000 ms
- **Posición:** Modificar posición `top-4 right-4` en CSS

## Preguntas Frecuentes

### ¿Cómo cierro un toast manualmente?
```javascript
const miToast = toast.success("Mensaje");
setTimeout(() => miToast.remove(), 2000);
```

### ¿Puedo mostrar múltiples toasts?
Sí, aparecerán apilados verticalmente.

### ¿Funciona en móvil?
Sí, es totalmente responsive. Se ajusta al viewport.

### ¿Cómo cambio el icono?
Modifica el SVG en la función `show()` de `toast-notifications.js`.

---

**Ver archivo completo:** `/js/global/toast-notifications.js`
