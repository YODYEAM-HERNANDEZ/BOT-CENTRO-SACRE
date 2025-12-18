import 'dotenv/config'
import { createBot, createProvider, createFlow, addKeyword, EVENTS } from '@builderbot/bot'
import { MetaProvider } from '@builderbot/provider-meta'
import { MemoryDB } from '@builderbot/bot'
import { join } from 'path'
import { readFileSync } from 'fs'

const baseDatosChats = {} 
const usuariosEnModoHumano = new Set()
const nombresGuardados = {} 
const chatMetadata = {} 

const initMetadata = (phone) => {
    if (!chatMetadata[phone]) {
        chatMetadata[phone] = { tags: [], unread: 0, starred: [], pinned: [], isChatPinned: false }
    }
}

const registrarMensaje = (telefono, role, body, mediaUrl = null) => {
    initMetadata(telefono)
    if (!baseDatosChats[telefono]) baseDatosChats[telefono] = []
    const timestamp = Date.now()
    const type = mediaUrl ? (mediaUrl.match(/\.(jpeg|jpg|gif|png)$/) ? 'image' : 'file') : 'text';
    baseDatosChats[telefono].push({ role, body, timestamp, type, mediaUrl })
    if (role === 'cliente') chatMetadata[telefono].unread += 1
    if (baseDatosChats[telefono].length > 300) baseDatosChats[telefono].shift()
}

// --- FLUJO HUMANO Y DESPEDIDA ---
const flowHumano = addKeyword('INTERNAL_HUMAN_MODE')
    .addAction(async (ctx) => console.log(`Usuario ${ctx.from} en modo silencio.`))
    .addAnswer(null, { capture: true }, async (ctx, { gotoFlow, endFlow }) => {
        if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano)
        return endFlow()
    })

const flowDespedida = addKeyword('FLUJO_DESPEDIDA').addAnswer('¡Gracias por confiar en Centro Sacre! 🌿💖 Si nos necesitas de nuevo, solo escribe "Hola".')

const flowContinuar = addKeyword('FLUJO_CONTINUAR')
    .addAnswer('¿Deseas realizar otra consulta? 👇', { capture: true, buttons: [{ body: 'Ir al Menú' }, { body: 'Finalizar' }] },
        async (ctx, { gotoFlow }) => { 
            if (ctx.body.includes('Menú')) return gotoFlow(flowMenu)
            return gotoFlow(flowDespedida) 
        })

// --- FLUJOS DE SERVICIOS Y LÓGICA ---

const flowAgendar = addKeyword(['agendar', 'cita'])
    .addAnswer(['📅 *Para agendar:*', '1️⃣ Entra aquí: https://centrosacre.com/solicitudCitas?cc=yuwE3pdEW3'].join('\n\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

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
    .addAnswer('Escribe el número del servicio que te interesa para ver los detalles 👇', 
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

const flowSucursales = addKeyword(['sucursales', 'ubicacion'])
    .addAnswer('📍 ¿Qué sede buscas? 👇', 
        { capture: true, buttons: [{ body: 'Condesa' }, { body: 'Santa Fe' }] },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            const body = ctx.body.toLowerCase();
            if (body.includes('condesa')) { await flowDynamic(['📍 *Condesa*', 'Baja California 354', 'Mapa: https://maps.app.goo.gl/VibfPG6iFyFtMv6D7'].join('\n')); return gotoFlow(flowContinuar) }
            if (body.includes('santa')) { await flowDynamic(['📍 *Santa Fe*', 'Vasco de Quiroga 4299', 'Mapa: https://waze.com/ul/h9g3qheze0'].join('\n')); return gotoFlow(flowContinuar) }
            return fallBack('⚠️ Opción no válida. Selecciona uno de los botones.')
        }
    )

const flowHorarios = addKeyword(['horarios'])
    .addAnswer('🕒 ¿Qué sede deseas consultar? 👇', 
        { capture: true, buttons: [{ body: 'Condesa' }, { body: 'Santa Fe' }] },
        async (ctx, { flowDynamic, gotoFlow, fallBack }) => {
            const body = ctx.body.toLowerCase();
            if (body.includes('condesa')) { await flowDynamic('📍 *Condesa:* L-V 10am-8pm, Sab 8am-2pm'); return gotoFlow(flowContinuar) }
            if (body.includes('santa')) { await flowDynamic('📍 *Santa Fe:* L-V 8am-4pm, Sab 8am-2pm'); return gotoFlow(flowContinuar) }
            return fallBack('⚠️ Opción no válida. Selecciona uno de los botones.')
        }
    )

const flowPrecios = addKeyword(['precios', 'costos'])
    .addAnswer(['💰 *Precios:*', '', '🔹 Consulta inicial: $1,350', '🔹 Subsecuentes: $1,250', '', '(Más IVA con factura)'].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowFactura = addKeyword(['factura'])
    .addAnswer('✏️ Escribe el *Nombre completo del paciente*:', { capture: true }, async (ctx, { state }) => state.update({ nombreFactura: ctx.body }))
    .addAnswer('📄 Adjunta tu *Constancia de Situación Fiscal* (PDF o Foto):', { capture: true })
    .addAnswer('¡Recibido! ✅ Procesaremos tu factura.', null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowCancelar = addKeyword(['cancelar', 'baja'])
    .addAnswer(['😢 Ntp! Entendemos perfecto 👌', '', '📅  Puedes indicarnos fecha y hora de tu cita para cancelar.', '', '😥 Solo recuerda que al perder esta cita el re-agendarla implica tiempo de espera.', '☹️ Te compartimos el link para que te re agendes directamente:','https://centrosacre.com/solicitudCitas?cc=yuwE3pdEW3'].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowTarde = addKeyword(['tarde', 'retraso', 'llegar'])
    .addAnswer([
            'Perfecto, lo notificaremos! 🕒', '',
            'Recuerda que al llegar tarde el tiempo de sesión se reducirá.',
            'Agradecemos su comprensión. 🙏'
        ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar)
    )

const flowNosotros = addKeyword(['quienes', 'somos'])
    .addAnswer(['🌸 *Sobre Centro Sacre*', 'Somos un referente en bienestar integral. 🌿'].join('\n\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowAsesor = addKeyword(['asesor', 'humano']).addAnswer('He notificado a nuestro equipo. 💬', null, async (ctx, { gotoFlow }) => { 
     usuariosEnModoHumano.add(ctx.from)
     return gotoFlow(flowHumano) 
})

// --- MENU PRINCIPAL Y BIENVENIDA ---

const flowMenu = addKeyword(['Menu', 'menu', 'menú'])
    .addAnswer(
        ['🙌 *Menú Principal*', '1️⃣ Servicios', '2️⃣ Sucursales', '3️⃣ Agendar cita', '4️⃣ Precios', '5️⃣ Horarios', '6️⃣ Cancelar cita', '7️⃣ Facturación', '8️⃣ ¿Quiénes somos?', '9️⃣ Hablar con asesor', '1️⃣0️⃣ Vas tarde', '*(Responde con el número)*'].join('\n'),
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
            return fallBack('Opción no válida.')
        }
    )

const flowFormulario = addKeyword(['formulario_registro'])
    .addAnswer('🔹 Envía en UN mensaje: Nombre, Teléfono, Correo, Motivo y Fecha nacimiento', { capture: true }, async (ctx, { state }) => state.update({ datos: ctx.body }))
    .addAnswer('✅ ¡Registro completado!', null, async (_, { gotoFlow }) => gotoFlow(flowMenu))

// ESTE ES EL QUE FALTABA PARA QUE RESPONDA AL "HOLA":
const flowPrincipal = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, { gotoFlow }) => { if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano) })
    .addAnswer('¡Hola! 😊 Bienvenido a *Centro Sacre*. ¿Eres paciente de primera vez? 👇', 
        { capture: true, buttons: [{ body: 'Si' }, { body: 'No' }] },
        async (ctx, { gotoFlow }) => {
            if (ctx.body.toLowerCase() === 'si') return gotoFlow(flowFormulario)
            return gotoFlow(flowMenu)
        }
    )

const main = async () => {
    const adapterDB = new MemoryDB()
    
    // AQUI AGREGAMOS TODOS LOS FLUJOS QUE CREAMOS ARRIBA
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

    //API 1: CONTACTOS
    adapterProvider.server.get('/api/contacts', (req, res) => {
        const contactos = Object.keys(baseDatosChats).map(telefono => {
            const msgs = baseDatosChats[telefono]
            const ultimo = msgs[msgs.length - 1]
            initMetadata(telefono) 
            return {
                phone: telefono,
                name: nombresGuardados[telefono] || '',
                lastMessage: ultimo ? (ultimo.type === 'image' ? '📷 Foto' : ultimo.body) : '',
                timestamp: ultimo ? ultimo.timestamp : 0,
                isHumanMode: usuariosEnModoHumano.has(telefono),
                unreadCount: chatMetadata[telefono].unread,
                tags: chatMetadata[telefono].tags,
                isChatPinned: chatMetadata[telefono].isChatPinned
            }
        }).sort((a, b) => (a.isChatPinned === b.isChatPinned) ? b.timestamp - a.timestamp : a.isChatPinned ? -1 : 1);

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(contactos))
    })

    //API 2: CHAT INDIVIDUAL
    adapterProvider.server.get('/api/chat', (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`)
        const phone = url.searchParams.get('phone')
        initMetadata(phone)
        chatMetadata[phone].unread = 0 
        const messages = (baseDatosChats[phone] || []).map(msg => ({
            ...msg,
            isStarred: chatMetadata[phone].starred.includes(msg.timestamp),
            isPinned: chatMetadata[phone].pinned.includes(msg.timestamp)
        }))
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ messages: messages, isHuman: usuariosEnModoHumano.has(phone) }))
    })

    //API 3: TOGGLE BOT
    adapterProvider.server.post('/api/toggle-bot', async (req, res) => {
        const body = req.body || {}
        if (body.active) { usuariosEnModoHumano.delete(body.phone) } 
        else { usuariosEnModoHumano.add(body.phone) }
        res.end(JSON.stringify({ status: 'ok', isHuman: usuariosEnModoHumano.has(body.phone) }))
    })

    //API 4: GUARDAR NOMBRE
    adapterProvider.server.post('/api/save-name', async (req, res) => {
        const body = req.body || {}; nombresGuardados[body.phone] = body.name; res.end(JSON.stringify({ status: 'ok' }))
    })
    
    //API 5: ETIQUETAS Y PINS
    adapterProvider.server.post('/api/pin-chat', async (req, res) => {
        const body = req.body || {}; initMetadata(body.phone);
        chatMetadata[body.phone].isChatPinned = (body.action === 'pin');
        res.end(JSON.stringify({ status: 'ok' }))
    })

    // API 6: ENVIAR MENSAJE
    adapterProvider.server.post('/api/send', async (req, res) => {
        const body = req.body || {}
        await originalSendText(body.phone, body.message) 
        registrarMensaje(body.phone, 'admin', body.message)
        res.end(JSON.stringify({ status: 'ok' }))
    })

    // API 7: RESPALDO ESTILO WHATSAPP
    adapterProvider.server.get('/api/backup', (req, res) => {
        const allChats = baseDatosChats;
        let htmlContent = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Respaldo Sacre</title><style>body { background-color: #e5ddd5; font-family: Helvetica, Arial, sans-serif; margin: 0; padding: 20px; } .chat-box { background: #fff; max-width: 900px; margin: 0 auto 30px auto; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); overflow: hidden; } .chat-header { background: #075e54; color: white; padding: 15px; font-size: 18px; font-weight: bold; } .chat-body { padding: 20px; background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); } .msg { display: flex; flex-direction: column; margin-bottom: 10px; max-width: 80%; } .msg-in { align-self: flex-start; align-items: flex-start; } .msg-out { align-self: flex-end; align-items: flex-end; } .bubble { padding: 8px 12px; border-radius: 7px; position: relative; font-size: 14px; line-height: 1.4; box-shadow: 0 1px 1px rgba(0,0,0,0.2); } .msg-in .bubble { background: #fff; border-top-left-radius: 0; } .msg-out .bubble { background: #dcf8c6; border-top-right-radius: 0; } .msg-bot .bubble { background: #f0f0f0; border: 1px dashed #999; font-style: italic; } .time { font-size: 10px; color: #999; margin-top: 4px; text-align: right; } .role-label { font-size: 10px; font-weight: bold; margin-bottom: 2px; color: #555; }</style></head><body>`;
        Object.keys(allChats).forEach(phone => {
            const nombre = nombresGuardados[phone] || 'Sin Nombre';
            htmlContent += `<div class="chat-box"><div class="chat-header">👤 ${nombre} (${phone})</div><div class="chat-body" style="display:flex; flex-direction:column;">`;
            allChats[phone].forEach(m => {
                let typeClass = 'msg-in'; let roleText = 'Cliente';
                if (m.role === 'admin') { typeClass = 'msg-out'; roleText = 'Asesor'; }
                if (m.role === 'bot') { typeClass = 'msg-out msg-bot'; roleText = 'Bot'; }
                const date = new Date(m.timestamp).toLocaleString();
                htmlContent += `<div class="msg ${typeClass}"><div class="bubble"><div class="role-label">${roleText}</div><div>${m.body.replace(/\n/g, '<br>')}</div><div class="time">${date}</div></div></div>`;
            });
            htmlContent += `</div></div>`;
        });
        htmlContent += `</body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Disposition': 'attachment; filename="Respaldo_Sacre_WhatsApp_Style.html"' });
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

m

ain()