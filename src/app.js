import 'dotenv/config'
import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot'
import { MetaProvider } from '@builderbot/provider-meta'
import { MemoryDB } from '@builderbot/bot'

/**
 * BLOQUE 0: FLUJOS DE NAVEGACIÓN Y CIERRE
 */
const flowDespedida = addKeyword('FLUJO_DESPEDIDA')
    .addAnswer('¡Gracias por confiar en Centro Sacre! 🌿💖 Si nos necesitas de nuevo, solo escribe "Hola". ¡Bonito día!')

const flowContinuar = addKeyword('FLUJO_CONTINUAR')
    .addAnswer(
        '¿Deseas realizar alguna otra consulta o volver al menú? 👇',
        { 
            capture: true, 
            buttons: [
                { body: 'Ir al Menú' }, 
                { body: 'Finalizar' } 
            ] 
        },
        async (ctx, { gotoFlow, endFlow }) => {
            if (ctx.body.includes('Menú')) {
                return gotoFlow(flowMenu)
            }
            return gotoFlow(flowDespedida)
        }
    )

/**
 * BLOQUE 1: SERVICIOS ESPECIALIZADOS
 */
const flowPostServicio = addKeyword('INTERNAL_POST_SERVICE')
    .addAnswer(
        '¿Te gustaría consultar información de otro servicio? 👇',
        {
            capture: true,
            buttons: [
                { body: 'Ver otro' },    
                { body: 'Ir al Menú' },  
                { body: 'Salir' }       
            ]
        },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.includes('otro')) {
                return gotoFlow(flowServicios) 
            }
            if (ctx.body.includes('Menú')) {
                return gotoFlow(flowMenu)
            }
            return gotoFlow(flowDespedida)
        }
    )

const flowDescripcionServicios = addKeyword('INTERNAL_DESC_SERVICIOS')
    .addAnswer(
        'Escribe el número del servicio que te interesa para ver los detalles 👇',
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            const opcion = ctx.body;

            // BASE DE DATOS DE DESCRIPCIONES (Limpia)
            const descripciones = {
                '1': '🫶 *Fisioterapia:*\nAbordamos tu salud de forma integral para recuperar movilidad, seguridad y eliminar dolor a través de técnicas manuales, liberación miofascial y reeducación, buscando el equilibrio de todos tus sistemas.',
                '2': '👐 *Osteopatía:*\nEvaluamos y tratamos el origen de la disfunción con un abordaje integral. Usamos técnicas manuales sobre los tejidos, viendo al cuerpo como una unidad donde todo está conectado.',
                '3': '🚶🏻‍♀️ *Reeducación Postural Global (RPG):*\nMétodo eficaz para tratar patologías musculares y óseas relacionadas con la postura. Trabajamos con posturas físicas activas y respiración para corregir la coordinación muscular.',
                '4': '🩷 *Rehabilitación de Suelo Pélvico:*\nTratamiento especializado para incontinencia, prolapsos, dolor pélvico y disfunciones sexuales. Buscamos recuperar la funcionalidad y calidad de vida en cualquier etapa de la mujer.',
                '5': '👶 *Osteopatía Pediátrica:*\nTratamiento suave y no invasivo para bebés. Ayudamos a eliminar tensiones por el parto, y tratamos reflujo, cólicos y estreñimiento restableciendo la movilidad digestiva.',
                '6': '🤰 *Preparación para el parto:*\nTe acompañamos desde la semana 13 reeducando postura y core. Hacia la semana 33 trabajamos pelvis, respiración, masaje perineal y pujo para un parto consciente.',
                '7': '🤱 *Rehabilitación Post embarazo:*\nRecuperamos la fuerza abdominal y pélvica tras el parto. Tratamos cicatrices (cesárea/episiotomía), diástasis y prevenimos incontinencia o prolapsos.',
                '8': '🌿 *Mastitis y Lactancia:*\nTratamiento de conductos tapados y mastitis mediante técnicas manuales y aparatología especializada para liberar los ductos, aliviar dolor y favorecer la lactancia.',
                '9': '🚑 *Rehabilitación oncológica:*\nAcompañamiento en procesos oncológicos pélvicos. Tratamos efectos secundarios post-cirugía como incontinencia, dolor o disfunciones sexuales, mejorando tu calidad de vida.',
                '10': '🦵 *Drenaje linfático:*\nTécnicas manuales especializadas para tratar alteraciones venosas, retención de líquidos, piernas cansadas o linfedema, reeducando tu sistema circulatorio.',
                '11': '🙋🏻‍♂️ *Rehabilitación suelo pélvico masculino:*\nAtención integral para hombres: disfunciones genitourinarias, dolor pélvico, problemas de próstata, recuperación post-quirúrgica y sexualidad plena.'
            };

            const info = descripciones[opcion];

            if (info) {
                await flowDynamic(info);
                return gotoFlow(flowPostServicio);
            }

            return fallBack('⚠️ Opción no válida. Por favor escribe solo el número (ej: 1).');
        }
    )

const flowServicios = addKeyword(['servicios', 'tratamientos'])
    .addAnswer(
        [
            '🌸 *Nuestros Servicios Especializados:*',
            '',
            '1️⃣ 🫶 Fisioterapia',
            '2️⃣ 👐 Osteopatía',
            '3️⃣ 🚶🏻‍♀️ Reeducación Postural Global (RPG)',
            '4️⃣ 🩷 Rehabilitación de Suelo Pélvico',
            '5️⃣ 👶 Osteopatía Pediátrica',
            '6️⃣ 🤰 Preparación para el parto',
            '7️⃣ 🤱 Rehabilitación Post embarazo',
            '8️⃣ 🌿 Mastitis',
            '9️⃣ 🚑 Rehabilitación oncológica',
            '1️⃣0️⃣ 🦵 Drenaje linfático',
            '1️⃣1️⃣ 🙋🏻‍♂️ Rehabilitación suelo pélvico masculino'
        ].join('\n'),
        null,
        async (_, { gotoFlow }) => { return gotoFlow(flowDescripcionServicios) }
    )

/**
 * BLOQUE 2: MENÚ PRINCIPAL
 */
const flowAsesor = addKeyword(['asesor', 'humano'])
    .addAnswer(
        [
            '¡Entendido! 💬 He notificado a nuestro equipo para darte atención personal.',
            'Alguien te escribirá en breve. 🤗',
            '',
            '🕓 *Horario de Atención:*',
            'Lunes a Viernes: 10:00 a.m. – 7:00 p.m.',
            'Sábados: 8:00 a.m. – 2:00 p.m.',
            '',
            '📞 Si es urgente, llámanos directamente para comunicarte con una asistente.'
        ].join('\n'),
        null,
        async (_, { gotoFlow }) => { return gotoFlow(flowContinuar) }
    )

const flowNosotros = addKeyword(['quienes', 'somos', 'mision'])
    .addAnswer(
        [
            '🌸 *Sobre Centro Sacre*',
            '',
            'Sacre nace el 18 de agosto de 2018 con la visión de ofrecer atención auténtica e integral en suelo pélvico. 💕',
            'Nalleli Silva y Grecia Zapata unieron objetivos y metas haciendo más fuerte esta filosofía !',
            '',
            'Hoy, somos un referente en bienestar integral, conectando cuerpo, mente y emoción. 🌿',
            'Más que una clínica, somos un espacio que cuida la vida misma. 💗'
        ].join('\n'),
        null,
        async (_, { gotoFlow }) => { return gotoFlow(flowContinuar) }
    )

const flowFactura = addKeyword(['factura', 'facturacion'])
    .addAnswer(
        [
            'Con gusto te ayudamos con tu factura. Solo necesitamos algunos datos.',
            '',
            '✏️ Por favor, escribe el *Nombre completo del paciente*:'
        ].join('\n'), 
        { capture: true }, 
        async (ctx, { state }) => { await state.update({ nombreFactura: ctx.body }) }
    )
    .addAnswer('📄 Ahora adjunta o escribe los datos de tu *Constancia de Situación Fiscal (actualizada)*:', { capture: true })
    .addAnswer(
        [
            '¡Información recibida! ✅',
            'Procesaremos tu factura lo antes posible y te la enviaremos por este medio.',
            'Gracias por tu preferencia. 💫'
        ].join('\n'),
        null,
        async (_, { gotoFlow }) => { return gotoFlow(flowContinuar) }
    )

const flowCancelar = addKeyword(['cancelar', 'baja'])
    .addAnswer(
        [
            '😢 Lamentamos que tengas que cancelar.',
            'Por favor, comunícate por llamada 📞 para hacerlo directamente.',
            '',
            '⚠️ *Importante:* Cancelar puede interrumpir tu tratamiento y el tiempo de espera para reagendar es de aprox. 2 semanas.',
            'Gracias por tu comprensión. 💗'
        ].join('\n'),
        null,
        async (_, { gotoFlow }) => { return gotoFlow(flowContinuar) }
    )

const flowHorarios = addKeyword(['horarios', 'horario', 'abierto'])
    .addAnswer(
        '🕒 Los horarios varían por sede. ¿Cuál deseas consultar?',
        {
            capture: true,
            buttons: [
                { body: 'Condesa' },
                { body: 'Santa Fe' }
            ]
        },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            const opcion = ctx.body.toLowerCase()
            const textoCondesa = [
                '📍 *Horarios Sucursal Condesa:*',
                '🗓️ Lunes a viernes: 10:00 a.m. – 8:00 p.m.',
                '🗓️ Sábados: 8:00 a.m. – 2:00 p.m.',
                '*(Sujeto a disponibilidad de Fisioterapeuta)*'
            ].join('\n')
            const textoSantaFe = [
                '📍 *Horarios Sucursal Santa Fe:*',
                '🗓️ Lunes a viernes: 8:00 a.m. – 4:00 p.m.',
                '🗓️ Sábados: 8:00 a.m. – 2:00 p.m.',
                '*(Sujeto a disponibilidad de Fisioterapeuta)*'
            ].join('\n')

            if (opcion.includes('condesa')) {
                await flowDynamic(textoCondesa)
                return gotoFlow(flowHorariosNavegacion)
            }
            if (opcion.includes('santa fe')) {
                await flowDynamic(textoSantaFe)
                return gotoFlow(flowHorariosNavegacion)
            }
            return fallBack('⚠️ Por favor selecciona Condesa o Santa Fe.')
        }
    )

const flowHorariosNavegacion = addKeyword('INTERNAL_HORARIOS_NAV')
    .addAnswer(
        '¿Deseas ver el horario de la otra sede?', 
        {
            capture: true,
            buttons: [
                { body: 'Ver otra' },    
                { body: 'Ir al Menú' },  
                { body: 'Salir' }       
            ]
        },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.includes('otra')) return gotoFlow(flowHorarios)
            if (ctx.body.includes('Menú')) return gotoFlow(flowMenu)
            return gotoFlow(flowDespedida)
        }
    )

const flowPrecios = addKeyword(['precios', 'costos', 'cuanto', 'vale'])
    .addAnswer(
        [
            '💰 *Lista de Precios Actuales:*',
            '',
            '🔹 Consulta inicial: $1,350 MXN',
            '🔹 Sesiones subsecuentes: $1,250 MXN',
            '',
            '*(Precios más IVA si requieres factura)*'
        ].join('\n'),
        null,
        async (_, { gotoFlow }) => { return gotoFlow(flowContinuar) }
    )

const flowAgendar = addKeyword(['agendar', 'cita', 'reservar'])
    .addAnswer(
        [
            '📅 *Pasos para agendar tu cita:*',
            '',
            '1️⃣ Entra aquí: https://tu-link-de-agenda.com', 
            '2️⃣ Elige sucursal, sesión y fisioterapeuta.',
            '3️⃣ Selecciona hora y confirma tus datos. ✅',
            '',
            '📩 Recibirás un recordatorio un día antes.',
            '⚠️ *Nota:* Agenda solo una vez para mantener el orden. ¡Gracias! 💚'
        ].join('\n'),
        null,
        async (_, { gotoFlow }) => { return gotoFlow(flowContinuar) }
    )

const flowSucursales = addKeyword(['sucursales', 'ubicacion', 'donde', 'estan'])
    .addAnswer(
        '📍 Contamos con 2 sedes. ¿De cuál necesitas la ubicación?',
        {
            capture: true,
            buttons: [
                { body: 'Condesa' },
                { body: 'Santa Fe' }
            ]
        },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            const opcion = ctx.body.toLowerCase()
            const infoCondesa = [
                '📍 *Sucursal Condesa*',
                'Baja California 354, Hipódromo Condesa.',
                '🅿️ Estacionamiento disponible (sujeto a espacio).',
                '🗺️ Mapa: https://maps.app.goo.gl/VibfPG6iFyFtMv6D7',
                '🚗 ¡Conduce con cuidado!'
            ].join('\n')
            const infoSantaFe = [
                '📍 *Sucursal Santa Fe*',
                'Vasco de Quiroga 4299, Local 203 (arriba del Oxxo en Aserrín).',
                '🅿️ Estacionamiento en la plaza.',
                '🗺️ Mapa: https://waze.com/ul/h9g3qheze0',
                '🚗 ¡Conduce con cuidado!'
            ].join('\n')

            if (opcion.includes('condesa')) {
                await flowDynamic(infoCondesa)
                return gotoFlow(flowSucursalesNavegacion)
            }
            if (opcion.includes('santa fe')) {
                await flowDynamic(infoSantaFe)
                return gotoFlow(flowSucursalesNavegacion)
            }
            return fallBack('⚠️ Por favor selecciona una opción válida.')
        }
    )

const flowSucursalesNavegacion = addKeyword('INTERNAL_SUCURSALES_NAV')
    .addAnswer(
        '¿Quieres ver la ubicación de la otra sede?', 
        {
            capture: true,
            buttons: [
                { body: 'Ver otra' },    
                { body: 'Ir al Menú' },  
                { body: 'Salir' }       
            ]
        },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.includes('otra')) return gotoFlow(flowSucursales)
            if (ctx.body.includes('Menú')) return gotoFlow(flowMenu)
            return gotoFlow(flowDespedida)
        }
    )

const flowMenu = addKeyword(['Menu', 'menu', 'menú'])
    .addAnswer(
        [
            '🙌 *Menú Principal*',
            'Elige la opción que deseas para apoyarte:',
            '',
            '1️⃣ Servicios',
            '2️⃣ Sucursales 📍',
            '3️⃣ Agendar cita 📅',
            '4️⃣ Precios 💰',
            '5️⃣ Horarios 🕒',
            '6️⃣ Cancelar cita ❌',
            '7️⃣ Facturación 🧾',
            '8️⃣ ¿Quiénes somos? ✨',
            '9️⃣ Hablar con asesor 👩‍💻',
            '',
            '*(Escribe el número de la opción)*'
        ].join('\n'),
        { capture: true },
        async (ctx, { gotoFlow, fallBack }) => {
            const opcion = ctx.body;
            if (['1', 'uno'].includes(opcion)) return gotoFlow(flowServicios);
            if (['2', 'dos'].includes(opcion)) return gotoFlow(flowSucursales);
            if (['3', 'tres'].includes(opcion)) return gotoFlow(flowAgendar);
            if (['4', 'cuatro'].includes(opcion)) return gotoFlow(flowPrecios);
            if (['5', 'cinco'].includes(opcion)) return gotoFlow(flowHorarios);
            if (['6', 'seis'].includes(opcion)) return gotoFlow(flowCancelar);
            if (['7', 'siete'].includes(opcion)) return gotoFlow(flowFactura);
            if (['8', 'ocho'].includes(opcion)) return gotoFlow(flowNosotros);
            if (['9', 'nueve'].includes(opcion)) return gotoFlow(flowAsesor);
            
            return fallBack('⚠️ Opción no válida. Escribe solo el número (ej: 1).');
        }
    )

const flowFormulario = addKeyword(['formulario_registro'])
    .addAnswer(
        [
            'Nos hace muy felices que hayas elegido a Centro Sacre para tu rehabilitación 💃',
            '',
            'Para asegurarnos de preparar todo para tu visita, por favor respóndenos en *UN SOLO MENSAJE* con los siguientes datos:',
            '',
            '🔹 Nombre completo',
            '🔹 Número de teléfono',
            '🔹 Correo electrónico',
            '🔹 Motivo de consulta',
            '🔹 Doctor@ que canaliza',
            '🔹 Fecha de nacimiento'
        ].join('\n'),
        { capture: true },
        async (ctx, { state }) => {
            await state.update({ datosPaciente: ctx.body })
        }
    )
    .addAnswer(
        [
            '✅ *¡Lista! Registro completado*',
            'Estamos aquí para hacer este proceso lo más cómodo posible para ti. 😀',
            'Un gusto que formes parte de la familia Centro Sacre ❣️',
            '',
            'Ahora te mostramos el menú para que explores nuestros servicios.'
        ].join('\n'),
        null, 
        async (_, { gotoFlow }) => { return gotoFlow(flowMenu) }
    )

const flowPrincipal = addKeyword(EVENTS.WELCOME)
    .addAnswer(
        [
            '¡Hola! 😊 Te damos la bienvenida a *Centro Sacre* 🩷.',
            'Soy tu asistente virtual, listo para ayudarte.',
            '',
            'Indícanos si eres paciente de primera vez:'
        ].join('\n'),
        {
            capture: true, 
            buttons: [
                { body: 'Si' },
                { body: 'No' }
            ]
        },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.toLowerCase() === 'si') {
                return gotoFlow(flowFormulario);
            }
            return gotoFlow(flowMenu);
        }
    )

/**
 * CONFIGURACIÓN PRINCIPAL
 */
const main = async () => {
    const adapterDB = new MemoryDB()
    
    const adapterFlow = createFlow([
        flowPrincipal,
        flowFormulario,
        flowMenu,
        flowServicios,
        flowDescripcionServicios, 
        flowPostServicio,         
        flowSucursales,
        flowSucursalesNavegacion, 
        flowAgendar,
        flowPrecios,
        flowHorarios,
        flowHorariosNavegacion,
        flowCancelar,
        flowFactura,
        flowNosotros,
        flowAsesor,
        flowContinuar,
        flowDespedida
    ])

    const adapterProvider = createProvider(MetaProvider, {
    jwtToken: process.env.JWT_TOKEN,
    numberId: process.env.NUMBER_ID,
    verifyToken: process.env.VERIFY_TOKEN,
    version: 'v20.0'
    })
  
    const { httpServer, provider } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    provider.on('message', ({ body, from, name }) => {
        console.log(`\n🟢 MENSAJE DE: ${name} (+${from})`)
        console.log(`💬 DICE: ${body}`)
        console.log('-----------------------------------')
    })

    const PORT = process.env.PORT || 3008
    httpServer(PORT)
}

console.log('🏁 Bot Activo...')
main()