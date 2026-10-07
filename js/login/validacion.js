/* ==========================================
   Validación del formulario de inicio de sesión.

   Antes vivía en styles/login-validation.js y registraba su PROPIO manejador
   del submit, que hacía preventDefault() y simulaba la petición con un
   setTimeout de 3 segundos. Como login.js registraba otro manejador del mismo
   evento, pasaban dos cosas:

     · el indicador de carga duraba 3 segundos fijos, sin relación con la
       respuesta real del servidor;
     · la validación no impedía nada — aunque los campos estuvieran mal,
       login.js enviaba igual, porque los dos manejadores eran independientes.

   Ahora esta clase solo valida y pinta. Quien decide enviar es login.js, que
   la consulta a través de window.validadorLogin.
   ========================================== */

class ValidadorLogin {
    constructor() {
        this.usuario  = document.getElementById('user');
        this.clave    = document.getElementById('pass');
        this.boton    = document.getElementById('loggin');
        this.respuesta = document.getElementById('respuesta');

        this.iniciar();
    }

    iniciar() {
        ['blur', 'input'].forEach(evento => {
            this.usuario.addEventListener(evento, () => this.validarUsuario());
            this.clave.addEventListener(evento, () => this.validarClave());
        });

        this.usuario.addEventListener('focus', () => this.limpiarCampo(this.usuario));
        this.clave.addEventListener('focus', () => this.limpiarCampo(this.clave));

        document.querySelectorAll('.toggle-password').forEach(btn => {
            btn.addEventListener('click', (ev) => this.alternarClave(ev));
        });
    }

    /* --- validación --------------------------------------------------- */

    validarUsuario() {
        const valor = this.usuario.value.trim();
        const valido = valor.length >= 3;

        if (valido) this.marcarValido(this.usuario);
        else if (valor.length > 0) this.marcarInvalido(this.usuario, 'El usuario debe tener al menos 3 caracteres');
        else this.limpiarCampo(this.usuario);

        return valido;
    }

    validarClave() {
        const valor = this.clave.value;
        const valido = valor.length >= 6;

        if (valido) this.marcarValido(this.clave);
        else if (valor.length > 0) this.marcarInvalido(this.clave, 'La contraseña debe tener al menos 6 caracteres');
        else this.limpiarCampo(this.clave);

        return valido;
    }

    /** Valida ambos campos. login.js no envía si devuelve false. */
    validarTodo() {
        const usuarioOk = this.validarUsuario();
        const claveOk = this.validarClave();
        return usuarioOk && claveOk;
    }

    /* --- pintado de campos -------------------------------------------- */

    marcarValido(campo) {
        campo.classList.remove('input-invalid');
        campo.classList.add('input-valid');

        const senal = campo.nextElementSibling && campo.nextElementSibling.querySelector('.input-feedback');
        if (senal) {
            senal.classList.add('success');
            senal.classList.remove('error', 'hidden');
        }

        const error = campo.parentElement.nextElementSibling;
        if (error && error.classList.contains('input-error')) error.classList.remove('show');
    }

    marcarInvalido(campo, mensaje) {
        campo.classList.remove('input-valid');
        campo.classList.add('input-invalid');

        const senal = campo.nextElementSibling && campo.nextElementSibling.querySelector('.input-feedback');
        if (senal) {
            senal.classList.add('error');
            senal.classList.remove('success', 'hidden');
        }

        const error = campo.parentElement.nextElementSibling;
        if (error && error.classList.contains('input-error')) {
            error.textContent = mensaje;
            error.classList.add('show');
        }
    }

    limpiarCampo(campo) {
        campo.classList.remove('input-invalid', 'input-valid');

        const senal = campo.nextElementSibling && campo.nextElementSibling.querySelector('.input-feedback');
        if (senal) senal.classList.add('hidden');

        const error = campo.parentElement.nextElementSibling;
        if (error && error.classList.contains('input-error')) {
            error.classList.remove('show');
            error.textContent = '';
        }
    }

    alternarClave(ev) {
        ev.preventDefault();

        const icono = ev.currentTarget.querySelector('i');
        const oculta = this.clave.type === 'password';

        this.clave.type = oculta ? 'text' : 'password';

        if (icono) {
            icono.classList.toggle('fa-eye', !oculta);
            icono.classList.toggle('fa-eye-slash', oculta);
        }

        ev.currentTarget.setAttribute('aria-pressed', String(oculta));
    }

    /* --- estado del botón --------------------------------------------- */

    /** Lo gobierna login.js: ahora refleja la petición real, no un temporizador. */
    cargando(activo) {
        this.boton.disabled = activo;

        const texto = this.boton.querySelector('.button-text');
        const rueda = this.boton.querySelector('.button-loader');

        if (texto) texto.classList.toggle('hidden', activo);
        if (rueda) rueda.classList.toggle('hidden', !activo);
    }

    mensaje(texto, tipo = 'error') {
        this.respuesta.textContent = texto;
        this.respuesta.className = 'p-4 rounded-lg text-sm font-medium ' + tipo;
        this.respuesta.classList.remove('hidden');
    }

    ocultarMensaje() {
        this.respuesta.classList.add('hidden');
        this.respuesta.textContent = '';
    }
}

// Los scripts van al final del <body>, así que los campos ya existen:
// no hace falta esperar a DOMContentLoaded y se evita una carrera con login.js.
window.validadorLogin = new ValidadorLogin();
