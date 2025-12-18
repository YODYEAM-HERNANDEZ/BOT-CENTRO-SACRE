import 'dotenv/config'
import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot'
import { MetaProvider } from '@builderbot/provider-meta'
import { MemoryDB } from '@builderbot/bot'
// --- IMPORTS PARA EL PANEL ADMIN ---
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'

/**
 * 🧠 CEREBRO DEL ADMIN (VARIABLES GLOBALES)
 */
// Aquí guardamos los chats separados por número: { "52155...": [mensajes] }
const baseDatosChats = {} 
// Aquí guardamos quién está en "Modo Humano" (Bot apagado): Set("52155...")
const usuariosEnModoHumano = new Set()

// Función para guardar mensajes en la "memoria" del panel
const registrarMensaje = (telefono, from, body) => {
    if (!baseDatosChats[telefono]) baseDatosChats[telefono] = []
    baseDatosChats[telefono].push({
        from, // 'bot', 'cliente' o 'admin'
        body,
        timestamp: Date.now()
    })
    // Guardamos solo los últimos 100 mensajes por cliente para no llenar la memoria
    if (baseDatosChats[telefono].length > 100) baseDatosChats[telefono].shift()
}

/**
 * 🛑 FLUJO SILENCIOSO (HUMAN MODE)
 * Este flujo atrapa al usuario cuando el bot está "apagado" para él.
 */
const flowHumano = addKeyword('INTERNAL_HUMAN_MODE')
    .addAction(async (ctx, { provider }) => {
        console.log(`🔇 Usuario ${ctx.from} entró en modo silencio (Humano).`)
    })
    .addAnswer(null, { capture: true }, async (ctx, { flowDynamic }) => {
        // Loop infinito: Escucha pero no responde nada
        return
    })

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
        '¿Te gustaría agendar tu cita o consultar otro servicio? 👇',
        {
            capture: true,
            buttons: [
                { body: 'Agendar Cita' }, 
                { body: 'Ver otro' },    
                { body: 'Ir al Menú' }       
            ]
        },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.includes('Agendar')) {
                return gotoFlow(flowAgendar) 
            }
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

            const descripciones = {
                '1': '🫶 *Fisioterapia:*\nTratamiento para aliviar dolor, recuperar movilidad y mejorar la función corporal.',
                '2': '👐 *Osteopatía:*\nEs un tratamiento donde evaluamos y tratamos a través de un abordaje integral observando el origen de la disfunción.',
                '3': '🚶🏻‍♀️ *Reeducación Postural Global (RPG):*\nEs un método fisioterapéutico para tratar las diferentes patologías del sistema muscular y óseo.',
                '4': '🩷 *Rehabilitación de Suelo Pélvico:*\nEs un tratamiento en el que se brinda atención especializada y personalizada para disfunciones relacionadas a esta zona.',
                '5': '👶 *Osteopatía Pediátrica:*\nEs un tratamiento no invasivo que ayuda a eliminar tensiones en el recién nacido.',
                '6': '🤰 *Preparación para el parto:*\nEs un tratamiento enfocado en mejorar la movilidad técnica, disminuir molestias y facilitar un mejor parto.',
                '7': '🤱 *Rehabilitación Post embarazo:*\nEs un tratamiento enfocado en recuperación física tras el embarazo y el parto.',
                '8': '🌿 *Mastitis y Lactancia:*\nTratamiento para inflamación o conductos mamarios tapados.',
                '9': '🚑 *Rehabilitación oncológica:*\nDirigido a pacientes que hayan tenido algún tema oncológico para mejorar calidad de vida.',
                '10': '🦵 *Drenaje linfático:*\nTratamiento enfocado a pacientes que requieran disminución del edema.',
                '11': '🙋🏻‍♂️ *Rehabilitación suelo pélvico masculino:*\nTratamiento dirigido a hombres que presentan disfunciones pélvicas.'
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
            'Alguien te escribirá en breve y yo me quedaré en silencio para que puedan hablar. 🤐',
            '',
            '🕓 *Horario de Atención:*',
            'Lunes a Viernes: 10:00 a.m. – 7:00 p.m.',
            'Sábados: 8:00 a.m. – 2:00 p.m.',
        ].join('\n'),
        null,
        async (ctx, { gotoFlow }) => { 
             // Al entrar aquí, activamos el modo humano automáticamente
             usuariosEnModoHumano.add(ctx.from)
             return gotoFlow(flowHumano) 
        }
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

const flowTarde = addKeyword(['tarde', 'retraso', 'llegar'])
    .addAnswer(
        [
            'Perfecto, lo notificaremos! 🕒',
            '',
            'Recuerda que la hora completa es tuya y al llegar tarde a la cita, el tiempo se reducirá',
            'y no será posible realizar el tratamiento completo, lo cual es importante para',
            'nosotras.',
            '¡También para poder respetar los horarios de todos los pacientes!',
            '',
            'Agradecemos su comprensión y puntualidad. 🙏'
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
            '1️⃣ Entra aquí: https://centrosacre.com/solicitudCitas?cc=yuwE3pdEW3', 
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
            '1️⃣0️⃣ Vas tarde a tu cita 🏃',
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
            if (['10', 'diez', 'tarde'].includes(opcion)) return gotoFlow(flowTarde);
            
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
    .addAction(async (ctx, { gotoFlow, endFlow }) => {
        // 🚨 CHEQUEO DE MODO HUMANO:
        // Si el usuario está en la lista de "Bot Apagado", lo mandamos directo al silencio.
        if (usuariosEnModoHumano.has(ctx.from)) {
            return gotoFlow(flowHumano)
        }
    })
    .addAnswer(
        [
            '¡Hola! 😊 Te damos la bienvenida a *Centro Sacre* 🩷.',
            'Soy tu asistente virtual FisioBot, listo para ayudarte.',
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
    
    // AGREGA flowHumano A LA LISTA DE FLUJOS
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
        flowTarde,
        flowFactura,
        flowNosotros,
        flowAsesor,
        flowContinuar,
        flowDespedida,
        flowHumano // <--- IMPORTANTE: El flujo silencioso agregado aquí
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

    // ==========================================
    // 🌐 API PARA TU PANEL "WHATSAPP WEB"
    // ==========================================

    // 1. Obtener lista de clientes (Contactos)
    adapterProvider.server.get('/api/contacts', (req, res) => {
        const contactos = Object.keys(baseDatosChats).map(telefono => {
            const msgs = baseDatosChats[telefono]
            const ultimoMsg = msgs[msgs.length - 1]
            return {
                phone: telefono,
                lastMessage: ultimoMsg ? ultimoMsg.body : '',
                timestamp: ultimoMsg ? ultimoMsg.timestamp : 0,
                isHumanMode: usuariosEnModoHumano.has(telefono) // Estado del bot
            }
        })
        // Ordenar por el más reciente
        contactos.sort((a, b) => b.timestamp - a.timestamp)
        
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(contactos))
    })

    // 2. Obtener historial de un cliente específico
    adapterProvider.server.get('/api/chat', (req, res) => {
        // Forma simple de leer params
        const url = new URL(req.url, `http://${req.headers.host}`)
        const phone = url.searchParams.get('phone')
        
        const historial = baseDatosChats[phone] || []
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(historial))
    })

    // 3. Enviar mensaje (Admin a Cliente)
    adapterProvider.server.post('/api/send', async (req, res) => {
        const body = req.body || {}
        const { phone, message } = body
        
        if (phone && message) {
            await adapterProvider.sendText(phone, message)
            registrarMensaje(phone, 'admin', message)
            res.end(JSON.stringify({ status: 'ok' }))
        } else {
            res.end(JSON.stringify({ status: 'error' }))
        }
    })

    // 4. PRENDER/APAGAR BOT (Toggle Human Mode)
    adapterProvider.server.post('/api/toggle-bot', async (req, res) => {
        const body = req.body || {}
        const { phone, active } = body // active = true (Prender bot), false (Apagar bot/Modo humano)

        if (active) {
            usuariosEnModoHumano.delete(phone)
        } else {
            usuariosEnModoHumano.add(phone)
        }
        
        res.end(JSON.stringify({ status: 'ok', isHuman: usuariosEnModoHumano.has(phone) }))
    })

    // 5. Servir el HTML (Tu Panel)
    adapterProvider.server.get('/panel', (req, res) => {
        const pathHtml = join(process.cwd(), 'public', 'index.html')
        if (existsSync(pathHtml)) {
            const html = readFileSync(pathHtml, 'utf8')
            res.end(html)
        } else {
            res.end('<h1>Error: No se encuentra public/index.html</h1>')
        }
    })

    // ESPIA: Interceptamos todos los mensajes que llegan
    provider.on('message', (payload) => {
        registrarMensaje(payload.from, 'cliente', payload.body)
        console.log(`📨 Mensaje de ${payload.from}: ${payload.body}`)
        
        // AUTO-DETECCION DE HUMANO
        // Si el usuario escribió "9" o "asesor", apagamos el bot automáticamente para que tú entres
        if (payload.body.includes('9') || payload.body.toLowerCase().includes('asesor')) {
            usuariosEnModoHumano.add(payload.from)
            console.log(`🚨 Usuario ${payload.from} solicitó asesor -> Bot Apagado automáticamente`)
        }
    })

    const PORT = process.env.PORT || 3008
    httpServer(PORT)
}

console.log('🏁 Bot Activo...')
main()