import 'dotenv/config'
import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot'
import { MetaProvider } from '@builderbot/provider-meta'
import { MemoryDB } from '@builderbot/bot'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'

/**
 * 🧠 CEREBRO DEL ADMIN
 */
const baseDatosChats = {} 
const usuariosEnModoHumano = new Set()

// Función para guardar mensajes en el historial
const registrarMensaje = (telefono, role, body) => {
    // role puede ser: 'cliente', 'bot', 'admin'
    if (!baseDatosChats[telefono]) baseDatosChats[telefono] = []
    baseDatosChats[telefono].push({
        role, 
        body,
        timestamp: Date.now()
    })
    if (baseDatosChats[telefono].length > 100) baseDatosChats[telefono].shift()
}

/**
 * 🛑 FLUJO SILENCIOSO (CÁRCEL PARA MODO HUMANO)
 * Si el usuario está en modo humano, cae aquí y se queda atrapado en un bucle infinito
 * escuchando pero sin recibir respuestas del bot, hasta que el admin lo libere.
 */
const flowHumano = addKeyword('INTERNAL_HUMAN_MODE')
    .addAction(async (ctx, { flowDynamic }) => {
        console.log(`🔇 Usuario ${ctx.from} en modo silencio. Bot ignorando.`)
    })
    .addAnswer(null, { capture: true }, async (ctx, { gotoFlow, endFlow }) => {
        // Checamos si sigue castigado (Modo Humano activo)
        if (usuariosEnModoHumano.has(ctx.from)) {
            // Lo volvemos a meter al bucle infinito
            return gotoFlow(flowHumano)
        }
        // Si ya no está en la lista, lo liberamos
        return endFlow()
    })

/**
 * BLOQUE 0: TUS FLUJOS DE NEGOCIO
 */
const flowDespedida = addKeyword('FLUJO_DESPEDIDA')
    .addAnswer('¡Gracias por confiar en Centro Sacre! 🌿💖 Si nos necesitas de nuevo, solo escribe "Hola". ¡Bonito día!')

const flowContinuar = addKeyword('FLUJO_CONTINUAR')
    .addAnswer(
        '¿Deseas realizar alguna otra consulta o volver al menú? 👇',
        { capture: true, buttons: [{ body: 'Ir al Menú' }, { body: 'Finalizar' }] },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.includes('Menú')) return gotoFlow(flowMenu)
            return gotoFlow(flowDespedida)
        }
    )

const flowPostServicio = addKeyword('INTERNAL_POST_SERVICE')
    .addAnswer('¿Te gustaría agendar tu cita o consultar otro servicio? 👇',
        { capture: true, buttons: [{ body: 'Agendar Cita' }, { body: 'Ver otro' }, { body: 'Ir al Menú' }] },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.includes('Agendar')) return gotoFlow(flowAgendar) 
            if (ctx.body.includes('otro')) return gotoFlow(flowServicios) 
            if (ctx.body.includes('Menú')) return gotoFlow(flowMenu)
            return gotoFlow(flowDespedida)
        }
    )

const flowDescripcionServicios = addKeyword('INTERNAL_DESC_SERVICIOS')
    .addAnswer('Escribe el número del servicio que te interesa para ver los detalles 👇', { capture: true },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            const opcion = ctx.body;
            const descripciones = {
                '1': '🫶 *Fisioterapia:*\nTratamiento para aliviar dolor, recuperar movilidad y mejorar la función corporal.',
                '2': '👐 *Osteopatía:*\nEvaluación y tratamiento integral observando el origen de la disfunción.',
                '3': '🚶🏻‍♀️ *RPG:*\nMétodo para tratar patologías musculares y posturales.',
                '4': '🩷 *Suelo Pélvico:*\nAtención especializada para disfunciones de esta zona.',
                '5': '👶 *Osteopatía Pediátrica:*\nTratamiento no invasivo para tensiones en recién nacidos.',
                '6': '🤰 *Parto:*\nMejorar movilidad y facilitar un mejor parto.',
                '7': '🤱 *Post embarazo:*\nRecuperación física tras el embarazo.',
                '8': '🌿 *Lactancia:*\nTratamiento para inflamación o conductos tapados.',
                '9': '🚑 *Oncológica:*\nMejorar calidad de vida en pacientes oncológicos.',
                '10': '🦵 *Drenaje:*\nDisminución de edema y retención.',
                '11': '🙋🏻‍♂️ *Suelo Pélvico Masc:*\nTratamiento para disfunciones pélvicas en hombres.'
            };
            const info = descripciones[opcion];
            if (info) {
                await flowDynamic(info);
                return gotoFlow(flowPostServicio);
            }
            return fallBack('⚠️ Opción no válida. Escribe solo el número.');
        }
    )

const flowServicios = addKeyword(['servicios', 'tratamientos'])
    .addAnswer([
            '🌸 *Nuestros Servicios Especializados:*', '',
            '1️⃣ 🫶 Fisioterapia', '2️⃣ 👐 Osteopatía', '3️⃣ 🚶🏻‍♀️ RPG', '4️⃣ 🩷 Suelo Pélvico',
            '5️⃣ 👶 Osteopatía Pediátrica', '6️⃣ 🤰 Preparación Parto', '7️⃣ 🤱 Post embarazo',
            '8️⃣ 🌿 Mastitis', '9️⃣ 🚑 Oncológica', '1️⃣0️⃣ 🦵 Drenaje linfático', '1️⃣1️⃣ 🙋🏻‍♂️ Suelo Pélvico Masc'
        ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowDescripcionServicios)
    )

const flowAsesor = addKeyword(['asesor', 'humano'])
    .addAnswer([
            '¡Entendido! 💬 He notificado a nuestro equipo.',
            'Alguien te escribirá en breve. 🤗', '',
            '🕓 *Horario de Atención:*', 'Lunes a Viernes: 10am – 7pm', 'Sábados: 8am – 2pm'
        ].join('\n'), null, async (ctx, { gotoFlow }) => { 
             // ACTIVAMOS MODO HUMANO AUTOMÁTICAMENTE
             usuariosEnModoHumano.add(ctx.from)
             return gotoFlow(flowHumano) 
        }
    )

const flowNosotros = addKeyword(['quienes', 'somos'])
    .addAnswer(['🌸 *Sobre Centro Sacre*', 'Somos un referente en bienestar integral. 🌿'].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowFactura = addKeyword(['factura'])
    .addAnswer('✏️ Escribe el *Nombre completo del paciente*:', { capture: true }, async (ctx, { state }) => state.update({ nombreFactura: ctx.body }))
    .addAnswer('📄 Adjunta tu *Constancia de Situación Fiscal*:', { capture: true })
    .addAnswer('¡Recibido! ✅ Procesaremos tu factura.', null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowCancelar = addKeyword(['cancelar', 'baja'])
    .addAnswer(['😢 Comunícate por llamada 📞 para cancelar.', 'Gracias por tu comprensión.'].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowTarde = addKeyword(['tarde', 'retraso', 'llegar'])
    .addAnswer([
            'Perfecto, lo notificaremos! 🕒', '',
            'Recuerda que al llegar tarde el tiempo de sesión se reducirá.',
            'Agradecemos su comprensión. 🙏'
        ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar)
    )

const flowHorarios = addKeyword(['horarios'])
    .addAnswer('🕒 ¿Qué sede deseas consultar?', { capture: true, buttons: [{ body: 'Condesa' }, { body: 'Santa Fe' }] },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            if (ctx.body.toLowerCase().includes('condesa')) {
                await flowDynamic('📍 *Condesa:* L-V 10am-8pm, Sab 8am-2pm')
                return gotoFlow(flowContinuar)
            }
            if (ctx.body.toLowerCase().includes('santa')) {
                await flowDynamic('📍 *Santa Fe:* L-V 8am-4pm, Sab 8am-2pm')
                return gotoFlow(flowContinuar)
            }
            return fallBack('Selecciona una opción válida.')
        }
    )

const flowPrecios = addKeyword(['precios', 'costos'])
    .addAnswer(['💰 *Precios:*', '🔹 Consulta inicial: $1,350', '🔹 Subsecuentes: $1,250', '(Más IVA con factura)'].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowAgendar = addKeyword(['agendar', 'cita'])
    .addAnswer(['📅 *Para agendar:*', '1️⃣ Entra aquí: https://centrosacre.com/solicitudCitas?cc=yuwE3pdEW3'].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowSucursales = addKeyword(['sucursales', 'ubicacion'])
    .addAnswer('📍 ¿Qué sede buscas?', { capture: true, buttons: [{ body: 'Condesa' }, { body: 'Santa Fe' }] },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            if (ctx.body.toLowerCase().includes('condesa')) {
                await flowDynamic(['📍 *Condesa*', 'Baja California 354', 'Mapa: https://maps.app.goo.gl/VibfPG6iFyFtMv6D7'].join('\n'))
                return gotoFlow(flowContinuar)
            }
            if (ctx.body.toLowerCase().includes('santa')) {
                await flowDynamic(['📍 *Santa Fe*', 'Vasco de Quiroga 4299', 'Mapa: https://waze.com/ul/h9g3qheze0'].join('\n'))
                return gotoFlow(flowContinuar)
            }
            return fallBack('Opción no válida.')
        }
    )

const flowMenu = addKeyword(['Menu', 'menu', 'menú'])
    .addAnswer(
        [
            '🙌 *Menú Principal*',
            '1️⃣ Servicios', '2️⃣ Sucursales 📍', '3️⃣ Agendar cita 📅', '4️⃣ Precios 💰',
            '5️⃣ Horarios 🕒', '6️⃣ Cancelar cita ❌', '7️⃣ Facturación 🧾', '8️⃣ ¿Quiénes somos?',
            '9️⃣ Hablar con asesor 👩‍💻', '1️⃣0️⃣ Vas tarde a tu cita 🏃'
        ].join('\n'),
        { capture: true },
        async (ctx, { gotoFlow, fallBack }) => {
            const op = ctx.body;
            if (['1','uno'].includes(op)) return gotoFlow(flowServicios)
            if (['2','dos'].includes(op)) return gotoFlow(flowSucursales)
            if (['3','tres'].includes(op)) return gotoFlow(flowAgendar)
            if (['4','cuatro'].includes(op)) return gotoFlow(flowPrecios)
            if (['5','cinco'].includes(op)) return gotoFlow(flowHorarios)
            if (['6','seis'].includes(op)) return gotoFlow(flowCancelar)
            if (['7','siete'].includes(op)) return gotoFlow(flowFactura)
            if (['8','ocho'].includes(op)) return gotoFlow(flowNosotros)
            if (['9','nueve'].includes(op)) return gotoFlow(flowAsesor)
            if (['10','diez','tarde'].includes(op)) return gotoFlow(flowTarde)
            return fallBack('⚠️ Opción no válida.')
        }
    )

const flowFormulario = addKeyword(['formulario_registro'])
    .addAnswer('🔹 Envía en UN mensaje: Nombre, Teléfono, Correo, Motivo y Fecha nacimiento', { capture: true }, async (ctx, { state }) => state.update({ datos: ctx.body }))
    .addAnswer('✅ ¡Registro completado!', null, async (_, { gotoFlow }) => gotoFlow(flowMenu))

const flowPrincipal = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, { gotoFlow, endFlow }) => {
        // 🚨 INTERCEPTOR DE ENTRADA: Si está en modo humano, lo mandamos a la cárcel (flowHumano)
        if (usuariosEnModoHumano.has(ctx.from)) {
            return gotoFlow(flowHumano)
        }
    })
    .addAnswer('¡Hola! 😊 Bienvenido a *Centro Sacre*. ¿Eres paciente de primera vez?', { capture: true, buttons: [{ body: 'Si' }, { body: 'No' }] },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.toLowerCase() === 'si') return gotoFlow(flowFormulario)
            return gotoFlow(flowMenu)
        }
    )

/**
 * CONFIGURACIÓN PRINCIPAL
 */
const main = async () => {
    const adapterDB = new MemoryDB()
    const adapterFlow = createFlow([
        flowPrincipal, flowFormulario, flowMenu, flowServicios, flowDescripcionServicios, 
        flowPostServicio, flowSucursales, flowAgendar, flowPrecios, flowHorarios, 
        flowCancelar, flowTarde, flowFactura, flowNosotros, flowAsesor, flowContinuar, 
        flowDespedida, flowHumano // <--- Aquí está la cárcel
    ])

    const adapterProvider = createProvider(MetaProvider, {
        jwtToken: process.env.JWT_TOKEN,
        numberId: process.env.NUMBER_ID,
        verifyToken: process.env.VERIFY_TOKEN,
        version: 'v20.0'
    })

    // 🕵️‍♂️ INTERCEPTOR DE SALIDA (Para guardar lo que el BOT contesta)
    // Guardamos la función original de enviar mensaje
    const originalSendText = adapterProvider.sendText.bind(adapterProvider)
    
    // Sobrescribimos la función para que primero guarde en el historial y luego envíe
    adapterProvider.sendText = async (number, message, options) => {
        // Guardar como mensaje del BOT
        registrarMensaje(number, 'bot', message)
        // Ejecutar el envío real
        return await originalSendText(number, message, options)
    }

    const { httpServer, provider } = await createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    // ================= API PANEL =================

    // 1. Obtener Contactos
    adapterProvider.server.get('/api/contacts', (req, res) => {
        const contactos = Object.keys(baseDatosChats).map(telefono => {
            const msgs = baseDatosChats[telefono]
            const ultimoMsg = msgs[msgs.length - 1]
            return {
                phone: telefono,
                lastMessage: ultimoMsg ? ultimoMsg.body : '',
                timestamp: ultimoMsg ? ultimoMsg.timestamp : 0,
                isHumanMode: usuariosEnModoHumano.has(telefono)
            }
        })
        contactos.sort((a, b) => b.timestamp - a.timestamp)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(contactos))
    })

    // 2. Obtener Chat
    adapterProvider.server.get('/api/chat', (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        const phone = url.searchParams.get('phone')
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(baseDatosChats[phone] || []))
    })

    // 3. Enviar Mensaje (ADMIN)
    adapterProvider.server.post('/api/send', async (req, res) => {
        const body = req.body || {}
        const { phone, message } = body
        if (phone && message) {
            // Usamos la función original para NO duplicar el registro (ya lo registramos aquí como admin)
            await originalSendText(phone, message) 
            registrarMensaje(phone, 'admin', message)
            res.end(JSON.stringify({ status: 'ok' }))
        } else {
            res.end(JSON.stringify({ status: 'error' }))
        }
    })

    // 4. Toggle Bot (APAGAR/PRENDER)
    adapterProvider.server.post('/api/toggle-bot', async (req, res) => {
        const body = req.body || {}
        const { phone, active } = body 
        if (active) {
            usuariosEnModoHumano.delete(phone) // Prender Bot (Liberar de la cárcel)
        } else {
            usuariosEnModoHumano.add(phone) // Apagar Bot (Meter a la cárcel)
        }
        res.end(JSON.stringify({ status: 'ok', isHuman: usuariosEnModoHumano.has(phone) }))
    })

    // 5. HTML
    adapterProvider.server.get('/panel', (req, res) => {
        try {
            const html = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf8')
            res.end(html)
        } catch (e) { res.end('Error: Falta public/index.html') }
    })

    // Interceptor de ENTRADA (Cliente)
    provider.on('message', (payload) => {
        registrarMensaje(payload.from, 'cliente', payload.body)
        
        // Auto-detectar petición de asesor
        if (payload.body.includes('9') || payload.body.toLowerCase().includes('asesor')) {
            usuariosEnModoHumano.add(payload.from)
        }
    })

    httpServer(+process.env.PORT || 3008)
}

main()