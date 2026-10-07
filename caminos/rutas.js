// RUTAS A SEGUIR SIEMPRE EN TESTEO
const desarrollo="http://127.0.0.1:3000/v1"
const produccion="https://pulpo.compudiskett.com.pe/v1"

////// nuevas rutas con respecto a cerrar sesion
const rutalogout=produccion+"/logout";
////// nuevas rutas con respecto al LOGEO
const rutalogin=produccion+"/login";
const rutaidentificador=produccion+"/login/identificador";
const rutaloginregistro=produccion+"/login/registro";
const rutaloginregistrocompletado=produccion+"/login/registro/completado";
//////nuevas rutas con respecto al VENDEDOR
const rutavendedor=produccion+"/vendedor";
//////////nuevas rutas con respecto ala COTIZACION raiz principal con accesos dinamicos
const rutacotizacionpermisos=produccion+"/cotizacion";
//////////nuevas rutas con respecto al PEDIDO raiz principal con accesos dinamicos
const rutapedidopermisos=produccion+"/pedido";
///nuevos rutas con respecto al PEDIDO flete
const rutapedidoflete=produccion+"/pedido/mostrar";
const rutapedidofleteaplicar=produccion+"/pedido/flete";
//////nuevas rutas con respecto al CLIENTE ya se busqueda o identificar
const rutaclientebusqueda=produccion+"/cliente/buscar";
const rutaclienteid=produccion+"/cliente/id";
//////nuevas rutas con respecto al PRODUCTO ya sea busqueda o identificar
const rutaproductobuscar=produccion+"/producto/buscar";
const rutaproductoid=produccion+"/producto/id";
const rutaproductoencontrado=produccion+"/producto/encontrado";
/////nuevas rutas con respecto ala rentabilidad o es para ver el carro ? chekear bien esto despues porq no recuerdo
const rutacarritorentabilidad=produccion+"/producto/rentabilidad";
////nuevas rutas con respecto ala COTIZACION CREAR
const rutacotizacioncrear=produccion+"/cotizacion/create";
const rutacotizacionnewcrear=produccion+"/cotizacion/pegar";
///nuevos rutas con respecto ala COTIZACION LEER
const rutacotizacionleer=produccion+"/cotizacion/read";
const rutacotizacionleerprom=produccion+"/cotizacion/readprom";
///nuevas rutas con respecto ala COTIZACION MODIFICAR
const rutacotizacionactualizar=produccion+"/cotizacion/update";
///nuevas rutas con respecto ala COTIZACION CAMBIAR ALMACEN
const rutacotizacioncambiaralmacen=produccion+"/cotizacion/almacen";
//////////nuevas rutas con respecto ala PROMOCION raiz principal con accesos dinamicos
const rutapromocionpermisos=produccion+"/promocion";
///nuevas rutas con respecto a PROMOCION BUSCAR Y ADJUNTAR
const rutapromocionbuscador=produccion+"/promocion/revisar";
const rutapromocionrecolector=produccion+"/promocion/recolector";
const rutapromocionrecojedor=produccion+"/promocion/mostrar";
const rutapromocionacoplador=produccion+"/promocion/acoplar";
///nuevas rutas con respecto a PROMOCION ELIMINAR
const rutapromocioneliminar=produccion+"/promocion/eliminar";
///nuevas rutas con respecto a PROMOCION CODIGOS Y DETALLES (SEGMENTO 3)
const rutapromodetalles=produccion+"/promocion/detalle";

///nuevas rutas con respecto ala CUOTA raiz principal con accesos dinamicos
const rutacuotapermisos=produccion+"/cuota"
const rutacuotarevisarregistro=produccion+"/cuota/revisar";
const rutacuotarevisarregistromarca=produccion+"/cuota/marcarevisar";
const rutacuotarevisarregistromarca2=produccion+"/cuota/marcawach";
///nuevas rutas con respecto ala CUOTA registrar
const rutacuotaregistro=produccion+"/cuota/update";
const rutacuotaregistromarcaseleccionada=produccion+"/cuota/marcaupdate";
///nuevas rutas con respecto ala CUOTA para mostrar
const rutacuotamostrar=produccion+"/cuota/mostrar";
const rutacuotamostrarmarca=produccion+"/cuota/marcamostrar";///puede q no sea necesario
const rutacuotamostraritems=produccion+"/cuota/desechar";
///nuevas rutas con respecto ala PRODUCTOS en la BUSQUEDA DE MARCAS
const rutaproductobuscarmarcas=produccion+"/producto/marcas";

///nuevas rutas con respecto ala LISTA raiz principal con accesos dinamicos
const rutalistapermisos=produccion+"/lista";
const rutalistacoti=produccion+"/lista/cotis";
const rutalistacotixdia=produccion+"/lista/cotisxdia";
const rutalistapedi=produccion+"/lista/pedidos";
const rutalistapedixdia=produccion+"/lista/pedidosxdia";
const rutalistafactus=produccion+"/lista/facturas"
const rutalistafactusxdia=produccion+"/lista/facturasxdia";
const rutalistaclientes=produccion+"/lista/clientes";

///////nuevas rutas con respecto al PROGRAMADOR raiz principal con accesos dinamicos
const rutaprogramadorpermisos=produccion+"/programador";
const rutaprogramadordespacharhoy=produccion+"/programador/despacho"
const rutaprogramadorfacturavalida=produccion+"/programador/programar";
const rutaprogramadorfacturaxdia=produccion+"/programador/despachoxdia";

///////nuevas rutas con respecto al FACTURA MODIFICACION raiz principal con accesos dinamicos
const rutafacturapermisos=produccion+"/factura";
/////////nuevas rutas con respecto al FACTURA MODIFICACION CAMPO SELECCIONADO
const rutafacturacambiodespacho=produccion+"/factura/despacho/cambio";
const rutafacturacambiotransportista=produccion+"/factura/transporte/cambio";
const rutafacturacambioatencion=produccion+"/factura/atencion/cambio";
const rutafacturacambiodireccion=produccion+"/factura/direccion/cambio";
const rutafacturacambiovendedor=produccion+"/factura/vendedor/cambio";
/////////nuevas rutas con respecto al FACTURA MODIFICACION CAMPO ACTUALISADO
const rutafacturacampoactualisar=produccion+"/factura/cambiado";


const httpcors2="https://pulpo.compudiskett.com.pe/login/chekear";////REVISAR
const cookiedata="https://pulpo.compudiskett.com.pe/login/mostrar";////REVISAR
const cookieclear="https://pulpo.compudiskett.com.pe/login/clean";////REVISAR



/* El modulo Factura ya no usa este archivo: la ficha nueva pide por
   CDK.rutas.api(). Se retiraron sus siete rutas de lectura —que el
   backend borro, dan 404— y las tres que apuntaban al equipo del
   vendedor. Quedan las cinco de opciones y la de guardado. */

/* Se retiraron de aqui, por no usarlas nadie:
     rutaropc2        no la referenciaba ningun archivo
     rutabproducto    tampoco
     rutaropc3        solo aparecia en una linea comentada de atencion.js
     rutaropc4        idem en direccion.js
     rutarevisar      idem en fac_modificar.js
     rutapivot        idem en pivot.js
     rutacuotageneral solo la usaba js/cuota/cuota.js, que no lo cargaba
                      ninguna pagina. El archivo se retiro con ella. */






/* Aqui estaban rutacotizacion (/coti/buscar) y rutaprom
   (/prom/verificar). El backend confirmo que NO EXISTEN: no hay
   ninguna ruta /verificar en todo el servidor, ni un prefijo /coti
   ni /prom. La pantalla que las usaba nunca funciono. */
const rutaaddprom=desarrollo+"/prom/add";

// const rutabfacturavalida=desarrollo+"/vendedor/programar";
const rutafacturaprogramada=desarrollo+"/vendedor/programarventanilla";
const rutafacturaprogramadaminutos=desarrollo+"/vendedor/programarventanillaminutos";


// const rutalistacoti=desarrollo+"/lista/cotis";
/* Aqui habia siete constantes mas de listas y despacho que no
   referenciaba ningun archivo. El modulo Listas usa CDK.rutas.api()
   desde que se migro, asi que se retiraron. */

// const rutalistapedi=desarrollo+"/lista/pedis";




const rutamarcas=produccion+"/reporte/marcas";
const rutastock=produccion+"/reporte/stoc";
const rutatiempo=produccion+"/reporte/tiempo";
const rutamarcaprecios=produccion+"/reporte/precios";