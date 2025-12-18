import 'dotenv/config'
import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot'
import { MetaProvider } from '@builderbot/provider-meta'
import { MemoryDB } from '@builderbot/bot'
import { join } from 'path'
import { readFileSync } from 'fs'

/**
 * 🧠 CEREBRO DEL ADMIN (Base de datos en memoria)
 */
const baseDatosChats = {} 
const usuariosEnModoHumano = new Set()
const nombresGuardados = {} 

// Metadatos para funciones avanzadas (Etiquetas, Leídos, Pines)
const chatMetadata = {} 

const initMetadata = (phone) => {
    if (!chatMetadata[phone]) {
        chatMetadata[phone] = {
            tags: [],
            unread: 0,
            starred: [], 
            pinned: []   
        }
    }
}

const registrarMensaje = (telefono, role, body) => {
    initMetadata(telefono)
    if (!baseDatosChats[telefono]) baseDatosChats[telefono] = []
    
    const timestamp = Date.now()
    baseDatosChats[telefono].push({ role, body, timestamp })
    
    // Si escribe el cliente, sumamos no leídos
    if (role === 'cliente') {
        chatMetadata[telefono].unread += 1
    }

    // Límite de historial en RAM (200 msgs)
    if (baseDatosChats[telefono].length > 200) baseDatosChats[telefono].shift()
}

/**
 * 🛑 FLUJO SILENCIOSO (Modo Humano)
 */
const flowHumano = addKeyword('INTERNAL_HUMAN_MODE')
    .addAction(async (ctx) => console.log(`🔇 Usuario ${ctx.from} en modo silencio.`))
    .addAnswer(null, { capture: true }, async (ctx, { gotoFlow, endFlow }) => {
        if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano)
        return endFlow()
    })

/**
 * BLOQUE 0: FLUJOS AUXILIARES
 */
const flowDespedida = addKeyword('FLUJO_DESPEDIDA')
    .addAnswer('¡Gracias por confiar en Centro Sacre! 🌿💖 Si nos necesitas de nuevo, solo escribe "Hola". ¡Bonito día!')

const flowContinuar = addKeyword('FLUJO_CONTINUAR')
    .addAnswer('¿Deseas realizar alguna otra consulta o volver al menú? 👇\n\n*(Selecciona el botón de la opción deseada)*',
        { capture: true, buttons: [{ body: 'Ir al Menú' }, { body: 'Finalizar' }] },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.includes('Menú')) return gotoFlow(flowMenu)
            return gotoFlow(flowDespedida)
        }
    )

/**
 * BLOQUE 1: SERVICIOS
 */
const flowPostServicio = addKeyword('INTERNAL_POST_SERVICE')
    .addAnswer('¿Te gustaría agendar tu cita o consultar otro servicio? 👇\n\n*(Selecciona el botón de la opción deseada)*',
        { capture: true, buttons: [{ body: 'Agendar Cita' }, { body: 'Ver otro' }, { body: 'Ir al Menú' }] },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.includes('Agendar')) return gotoFlow(flowAgendar) 
            if (ctx.body.includes('otro')) return gotoFlow(flowServicios) 
            if (ctx.body.includes('Menú')) return gotoFlow(flowMenu)
            return gotoFlow(flowDespedida)
        }
    )

const flowDescripcionServicios = addKeyword('INTERNAL_DESC_SERVICIOS')
    .addAnswer('Escribe el número del servicio que te interesa para ver los detalles 👇\n\n*(Por favor, responde solo con el número, ej: 1)*', 
        { capture: true },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            const opcion = ctx.body.trim();
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
            if (info) { await flowDynamic(info); return gotoFlow(flowPostServicio); }
            return fallBack('⚠️ Opción no válida. Por favor escribe solo el número (ejemplo: 1).');
        }
    )

const flowServicios = addKeyword(['servicios', 'tratamientos'])
    .addAnswer([
            '🌸 *Nuestros Servicios Especializados:*', '',
            '1️⃣ 🫶 Fisioterapia', '2️⃣ 👐 Osteopatía', '3️⃣ 🚶🏻‍♀️ RPG', '4️⃣ 🩷 Suelo Pélvico',
            '5️⃣ 👶 Osteopatía Pediátrica', '6️⃣ 🤰 Preparación Parto', '7️⃣ 🤱 Post embarazo',
            '8️⃣ 🌿 Mastitis', '9️⃣ 🚑 Oncológica', '1️⃣0️⃣ 🦵 Drenaje linfático', '1️⃣1️⃣ 🙋🏻‍♂️ Suelo Pélvico Masc',
            '', '*(Escribe el número del servicio)*'
        ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowDescripcionServicios)
    )

/**
 * BLOQUE 2: MENÚ
 */
const flowAsesor = addKeyword(['asesor', 'humano'])
    .addAnswer([
            '¡Entendido! 💬 He notificado a nuestro equipo.',
            'Alguien te escribirá en breve. 🤗', '',
            '🕓 *Horario de Atención:*', 'Lunes a Viernes: 10am – 7pm', 'Sábados: 8am – 2pm'
        ].join('\n'), null, async (ctx, { gotoFlow }) => { 
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
    .addAnswer(['😢 Ntp! Entendemos perfecto 👌 📅  Puedes indicarnos fecha y hora de tu cita para cancelar. 😥 Solo recuerda que al perder esta cita el regandarla implica tiempo de espera. ☹️ Te compartimos el link para que te re agendes directamente  https://centrosacre.com/solicitudCitas?cc=yuwE3pdEW3'].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowTarde = addKeyword(['tarde', 'retraso', 'llegar'])
    .addAnswer([
            'Perfecto, lo notificaremos! 🕒', '',
            'Recuerda que al llegar tarde el tiempo de sesión se reducirá.',
            'Agradecemos su comprensión. 🙏'
        ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar)
    )

const flowHorarios = addKeyword(['horarios'])
    .addAnswer('🕒 ¿Qué sede deseas consultar? 👇\n\n*(Selecciona el botón de la opción deseada)*', 
        { capture: true, buttons: [{ body: 'Condesa' }, { body: 'Santa Fe' }] },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            const body = ctx.body.toLowerCase();
            if (body.includes('condesa')) { await flowDynamic('📍 *Condesa:* L-V 10am-8pm, Sab 8am-2pm'); return gotoFlow(flowContinuar) }
            if (body.includes('santa')) { await flowDynamic('📍 *Santa Fe:* L-V 8am-4pm, Sab 8am-2pm'); return gotoFlow(flowContinuar) }
            return fallBack('⚠️ Opción no válida. Selecciona uno de los botones.')
        }
    )

const flowPrecios = addKeyword(['precios', 'costos'])
    .addAnswer(['💰 *Precios:*', '🔹 Consulta inicial: $1,350', '🔹 Subsecuentes: $1,250', '(Más IVA con factura)'].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowAgendar = addKeyword(['agendar', 'cita'])
    .addAnswer(['📅 *Para agendar:*', '1️⃣ Entra aquí: https://centrosacre.com/solicitudCitas?cc=yuwE3pdEW3'].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowSucursales = addKeyword(['sucursales', 'ubicacion'])
    .addAnswer('📍 ¿Qué sede buscas? 👇\n\n*(Selecciona el botón de la opción deseada)*', 
        { capture: true, buttons: [{ body: 'Condesa' }, { body: 'Santa Fe' }] },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            const body = ctx.body.toLowerCase();
            if (body.includes('condesa')) { await flowDynamic(['📍 *Condesa*', 'Baja California 354', 'Mapa: https://maps.app.goo.gl/VibfPG6iFyFtMv6D7'].join('\n')); return gotoFlow(flowContinuar) }
            if (body.includes('santa')) { await flowDynamic(['📍 *Santa Fe*', 'Vasco de Quiroga 4299', 'Mapa: https://waze.com/ul/h9g3qheze0'].join('\n')); return gotoFlow(flowContinuar) }
            return fallBack('⚠️ Opción no válida. Selecciona uno de los botones.')
        }
    )

const flowMenu = addKeyword(['Menu', 'menu', 'menú'])
    .addAnswer(
        [
            '🙌 *Menú Principal*',
            '1️⃣ Servicios', '2️⃣ Sucursales 📍', '3️⃣ Agendar cita 📅', '4️⃣ Precios 💰',
            '5️⃣ Horarios 🕒', '6️⃣ Cancelar cita ❌', '7️⃣ Facturación 🧾', '8️⃣ ¿Quiénes somos?',
            '9️⃣ Hablar con asesor 👩‍💻', '1️⃣0️⃣ Vas tarde a tu cita 🏃', '',
            '*(Por favor, responde solo con el número de la opción, ej: 1)*'
        ].join('\n'),
        { capture: true },
        async (ctx, { gotoFlow, fallBack }) => {
            let op = ctx.body.trim().toLowerCase();
            if (['1','uno', 'servicio', 'servicios'].some(x => op.includes(x))) return gotoFlow(flowServicios)
            if (['2','dos', 'sucursal'].some(x => op.includes(x))) return gotoFlow(flowSucursales)
            if (['3','tres', 'agendar'].some(x => op.includes(x))) return gotoFlow(flowAgendar)
            if (['4','cuatro', 'precio'].some(x => op.includes(x))) return gotoFlow(flowPrecios)
            if (['5','cinco', 'horario'].some(x => op.includes(x))) return gotoFlow(flowHorarios)
            if (['6','seis', 'cancelar'].some(x => op.includes(x))) return gotoFlow(flowCancelar)
            if (['7','siete', 'factura'].some(x => op.includes(x))) return gotoFlow(flowFactura)
            if (['8','ocho', 'somos'].some(x => op.includes(x))) return gotoFlow(flowNosotros)
            if (['9','nueve', 'asesor'].some(x => op.includes(x))) return gotoFlow(flowAsesor)
            if (['10','diez','tarde'].some(x => op.includes(x))) return gotoFlow(flowTarde)
            return fallBack('⚠️ Opción no válida. Por favor escribe solo el número (ej: 1).')
        }
    )

const flowFormulario = addKeyword(['formulario_registro'])
    .addAnswer('🔹 Envía en UN mensaje: Nombre, Teléfono, Correo, Motivo y Fecha nacimiento', { capture: true }, async (ctx, { state }) => state.update({ datos: ctx.body }))
    .addAnswer('✅ ¡Registro completado!', null, async (_, { gotoFlow }) => gotoFlow(flowMenu))

const flowPrincipal = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, { gotoFlow }) => { if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano) })
    .addAnswer('¡Hola! 😊 Bienvenido a *Centro Sacre*. ¿Eres paciente de primera vez? 👇\n\n*(Selecciona el botón de la opción deseada)*', 
        { capture: true, buttons: [{ body: 'Si' }, { body: 'No' }] },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.toLowerCase() === 'si') return gotoFlow(flowFormulario)
            return gotoFlow(flowMenu)
        }
    )

const main = async () => {
    const adapterDB = new MemoryDB()
    const adapterFlow = createFlow([
        flowPrincipal, flowFormulario, flowMenu, flowServicios, flowDescripcionServicios, 
        flowPostServicio, flowSucursales, flowAgendar, flowPrecios, flowHorarios, 
        flowCancelar, flowTarde, flowFactura, flowNosotros, flowAsesor, flowContinuar, 
        flowDespedida, flowHumano 
    ])

    const adapterProvider = createProvider(MetaProvider, {
        jwtToken: process.env.JWT_TOKEN,
        numberId: process.env.NUMBER_ID,
        verifyToken: process.env.VERIFY_TOKEN,
        version: 'v20.0'
    })

    const originalSendText = adapterProvider.sendText.bind(adapterProvider)
    adapterProvider.sendText = async (number, message, options) => {
        registrarMensaje(number, 'bot', message)
        return await originalSendText(number, message, options)
    }

    const { httpServer, provider } = await createBot({ flow: adapterFlow, provider: adapterProvider, database: adapterDB })

    // ================= API PANEL & BACKUP =================

    // 1. Obtener Contactos (Con metadatos: tags, unread)
    adapterProvider.server.get('/api/contacts', (req, res) => {
        const contactos = Object.keys(baseDatosChats).map(telefono => {
            const msgs = baseDatosChats[telefono]
            const ultimoMsg = msgs[msgs.length - 1]
            initMetadata(telefono) 
            return {
                phone: telefono,
                name: nombresGuardados[telefono] || '',
                lastMessage: ultimoMsg ? ultimoMsg.body : '',
                timestamp: ultimoMsg ? ultimoMsg.timestamp : 0,
                isHumanMode: usuariosEnModoHumano.has(telefono),
                unreadCount: chatMetadata[telefono].unread,
                tags: chatMetadata[telefono].tags
            }
        })
        contactos.sort((a, b) => b.timestamp - a.timestamp)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(contactos))
    })

    // 2. Guardar Nombre
    adapterProvider.server.post('/api/save-name', async (req, res) => {
        const body = req.body || {}
        if (body.phone && body.name) {
            nombresGuardados[body.phone] = body.name
            res.end(JSON.stringify({ status: 'ok' }))
        } else res.end(JSON.stringify({ status: 'error' }))
    })

    // 3. Obtener Chat (Resetear no leídos)
    adapterProvider.server.get('/api/chat', (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        const phone = url.searchParams.get('phone')
        
        initMetadata(phone)
        chatMetadata[phone].unread = 0 // Marcar como leído

        // Añadir info de starred/pinned a cada mensaje
        const messages = (baseDatosChats[phone] || []).map(msg => ({
            ...msg,
            isStarred: chatMetadata[phone].starred.includes(msg.timestamp),
            isPinned: chatMetadata[phone].pinned.includes(msg.timestamp)
        }))

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(messages))
    })

    // 4. Enviar Mensaje
    adapterProvider.server.post('/api/send', async (req, res) => {
        const body = req.body || {}
        if (body.phone && body.message) {
            await originalSendText(body.phone, body.message) 
            registrarMensaje(body.phone, 'admin', body.message)
            res.end(JSON.stringify({ status: 'ok' }))
        } else res.end(JSON.stringify({ status: 'error' }))
    })

    // 5. Toggle Bot
    adapterProvider.server.post('/api/toggle-bot', async (req, res) => {
        const body = req.body || {}
        if (body.active) usuariosEnModoHumano.delete(body.phone) 
        else usuariosEnModoHumano.add(body.phone)
        res.end(JSON.stringify({ status: 'ok', isHuman: usuariosEnModoHumano.has(body.phone) }))
    })

    // 6. Gestionar ETIQUETAS
    adapterProvider.server.post('/api/tags', async (req, res) => {
        const body = req.body || {}
        const { phone, tag, action } = body 
        initMetadata(phone)
        
        if (action === 'add' && !chatMetadata[phone].tags.includes(tag)) {
            chatMetadata[phone].tags.push(tag)
        } else if (action === 'remove') {
            chatMetadata[phone].tags = chatMetadata[phone].tags.filter(t => t !== tag)
        }
        res.end(JSON.stringify({ status: 'ok', tags: chatMetadata[phone].tags }))
    })

    // 7. Gestionar Destacados/Fijados
    adapterProvider.server.post('/api/message-action', async (req, res) => {
        const body = req.body || {}
        const { phone, timestamp, action, type } = body 
        initMetadata(phone)
        
        const list = type === 'star' ? chatMetadata[phone].starred : chatMetadata[phone].pinned
        
        if (action === 'add') {
            if (type === 'pin' && list.length >= 5) { 
                res.end(JSON.stringify({ status: 'error', msg: 'Max 5 pins' }))
                return
            }
            if (!list.includes(timestamp)) list.push(timestamp)
        } else {
            const index = list.indexOf(timestamp)
            if (index > -1) list.splice(index, 1)
        }
        res.end(JSON.stringify({ status: 'ok' }))
    })

    // 8. Respaldo
    adapterProvider.server.get('/api/backup', (req, res) => {
        const allChats = baseDatosChats;
        let htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Respaldo Chats</title></head><body><h1>📦 Respaldo Sacre</h1>`;
        Object.keys(allChats).forEach(phone => {
            const nombre = nombresGuardados[phone] || '';
            htmlContent += `<h2>📞 ${phone} ${nombre}</h2>`;
            allChats[phone].forEach(m => {
                htmlContent += `<p><strong>${m.role}:</strong> ${m.body}</p>`;
            });
        });
        htmlContent += `</body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Disposition': 'attachment; filename="backup.html"' });
        res.end(htmlContent);
    })

    adapterProvider.server.get('/panel', (req, res) => {
        try { const html = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf8'); res.end(html); } 
        catch (e) { res.end('Error: Falta public/index.html'); }
    })

    provider.on('message', (payload) => {
        registrarMensaje(payload.from, 'cliente', payload.body)
        if (payload.body.includes('9') || payload.body.toLowerCase().includes('asesor')) { usuariosEnModoHumano.add(payload.from) }
    })

    httpServer(+process.env.PORT || 3008)
}

main()