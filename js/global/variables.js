/////NUEVA COTIZACION
var cliente_data=[];/////////data exacta del cliente seleccionado
let almc_id="D";////////////identificador para la seleccion del almacen//ahora la moneda
const agrupacion={};///////conjunto de productos seleccionados por el vendedor
var promos_insertadas={};////PODRIA NO VALER NADA
///////////////////
////MODIFICAR COTIZACION
let cotimodi_tipcli=[];////variable temporal para saber el tipo de cliente de esa coti que se modificara,etc
let cotimodi_tmpitems={};///variable temporal para guardar los agregados,cantidades,removidos items segun seleccion
//////////////////
////MODIFICAR FACTURA

//////////////////
////MANEJADOR PROMOCIONES
var coti_cant=0;/////variable para guardar el acumulado de cuantos items tiene esta cotizacion
let cont_grupo_id=[];///variable para guardar el id de grupo(promocion dar el mejor premio) y no repetir por cada ves q se busca promo
var prom_numero={};//////variable de emergencia para recodar las prom
let promos_conjunto_diferenciales=[];/////////promos acumuladas con posibles resultados devueltos
//////////////////
var acumulador=[];


/////VARIABLES PARA PROGRAMAR LAS FACTURAS REVISAR DESPUES
const objprogramar={}

let objfactura=[];///////VARIABLES PARA LA MODIFICACION DE LA FACTURA TEMPORAL Y SUS CAMPOS 0CODIGOCLIENTE 1FACTURA


//////VARIABLES PARA EL GUARDADO TEMPORAL DE LAS PROMOCIONES SELECCIONADAS EN LA ELIMINACION DE LA PROMOCION
const promos_recojidas=[];
////VARIABLE TEMPORAL PARA EL GUARDADO DE MARCAS SEGUN ESPECIALISTA
const marcas_recojidas=[];