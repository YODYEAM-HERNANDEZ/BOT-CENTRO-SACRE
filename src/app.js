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
    
    let type = 'text';
    // LÓGICA DE ARCHIVOS
    if (mediaUrl) {
        if (mediaUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i)) type = 'image';
        else type = 'file';
    } else if (body && body.includes('_event_')) {
        if (body.includes('http')) {
             mediaUrl = body; 
             type = 'file';
        } else {
             type = 'system'; 
        }
    }

    baseDatosChats[telefono].push({ role, body, timestamp, type, mediaUrl })
    
    if (role === 'cliente') chatMetadata[telefono].unread += 1
    if (baseDatosChats[telefono].length > 300) baseDatosChats[telefono].shift()
}

// --- FLUJOS BASE (IMPORTANTE: EL ORDEN EVITA ERRORES) ---

const flowHumano = addKeyword('INTERNAL_HUMAN_MODE')
    .addAction(async (ctx) => console.log(`Usuario ${ctx.from} en modo silencio.`))
    .addAnswer(null, { capture: true }, async (ctx, { gotoFlow, endFlow }) => {
        if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano)
        return endFlow()
    })

// AQUI ESTABA EL ERROR: Faltaba definir flowDespedida antes de usarlo
const flowDespedida = addKeyword('FLUJO_DESPEDIDA')
    .addAnswer('¡Gracias por elegir Centro Sacre! 🌿💖')

// Este flujo usa flowDespedida, así que debe ir después
const flowContinuar = addKeyword('FLUJO_CONTINUAR')
    .addAnswer('¿Deseas realizar alguna otra consulta? 👇', { capture: true, buttons: [{ body: 'Ir al Menú' }, { body: 'Finalizar' }] }, 
    async (ctx, { gotoFlow }) => {
        // flowMenu se define más abajo, pero en el callback funciona bien por ser asíncrono
        if(ctx.body.includes('Menú')) return gotoFlow(flowMenu);
        return gotoFlow(flowDespedida);
    })

// --- FLUJOS DEL MENÚ (CON TUS TEXTOS) ---

const flowAsesor = addKeyword(['asesor', 'humano'])
    .addAnswer([
        '¡Por supuesto! 💬 He notificado a un miembro de nuestro equipo para darte atención personalizada.',
        'En unos momentos alguien se pondrá en contacto contigo. 🤗',
        '🕓 Nuestro horario de atención es: Lunes a Viernes: 10:00 a.m. – 7:00 p.m. Sábados: 8:00 a.m. – 2:00 p.m.',
        'IMPORTANTE: Si tu situación es urgente, puedes llamarnos directamente 📞 y con gusto te comunicaremos con una asistente.'
    ].join('\n'), null, async (ctx, { gotoFlow }) => { 
        usuariosEnModoHumano.add(ctx.from)
        return gotoFlow(flowHumano) 
    })

const flowNosotros = addKeyword(['quienes', 'somos'])
    .addAnswer([
        'Centro Sacre fue fundado el 18 de agosto de 2018 por la fisioterapeuta Nayeli Silva, con la visión de ofrecer una atención auténtica, personalizada e integral 💕',
        'En una época donde casi no existían clínicas especializadas en suelo pélvico, Nayeli decidió crear un espacio seguro y profesional para acompañar los procesos de rehabilitación 🌿',
        'Gracias a la confianza de nuestros pacientes, en 2020 se unió Grecia Zapara, fortaleciendo nuestra filosofía y ampliando nuestros servicios 🙌',
        'Hoy, contamos con dos sucursales y somos un referente en fisioterapia del suelo pélvico y bienestar integral 🌸',
        'Más que una clínica, somos un espacio que conecta cuerpo, mente y emoción, promoviendo una salud que cuida la vida misma 💗'
    ].join('\n\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowFactura = addKeyword(['factura'])
    .addAnswer('Con gusto te ayudamos con tu factura. Solo necesitamos:\n✏️ Nombre completo del paciente', { capture: true }, async (ctx, { state }) => state.update({ nombreFactura: ctx.body }))
    .addAnswer('📄 Constancia de situación fiscal (actualizada)', { capture: true })
    .addAnswer([
        'En cuanto la tengamos, procesaremos tu factura lo antes posible 💫',
        'Muchas Gracias en unos momentos recibirá su factura.',
        'Siempre agradeciendo su preferencia.'
    ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowCancelar = addKeyword(['cancelar', 'baja'])
    .addAnswer([
        'Lamentamos que tengas que cancelar 😢 Por favor, comunícate con nosotros por llamada 📞 para hacerlo directamente.',
        '⚠️ Ten en cuenta que al cancelar tu cita puede interrumpirse la continuidad de tu tratamiento, ya que el tiempo de espera para reagendar es de aproximadamente 2 semanas.',
        'Gracias por tu comprensión 💗'
    ].join('\n\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowHorarios = addKeyword(['horarios'])
    .addAnswer([
        '📍 Sucursal Condesa:',
        '🗓️ Lunes a viernes: 10:00 a.m. – 8:00 p.m.',
        '🗓️ Sábados: 8:00 a.m. – 2:00 p.m.',
        '*(Los horarios de las cita y de cada Fisioterapeuta pueden varias)*',
        '',
        '📍 Sucursal Santa Fe:',
        '🗓️ Lunes a viernes: 8:00 a.m. – 4:00 p.m.',
        '🗓️ Sábados: 8:00 a.m. – 2:00 p.m.',
        '*(Los horarios de las cita y de cada Fisioterapeuta pueden varias)*'
    ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowPrecios = addKeyword(['precios', 'costos'])
    .addAnswer([
        '💰 Lista de Precios Actuales:',
        '🔹 Consulta inicial: $1,350 MXN',
        '🔹 Sesiones subsecuentes: $1,250 MXN',
        '(Precios no incluyen IVA)'
    ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowAgendar = addKeyword(['agendar', 'cita'])
    .addAnswer([
        'Pasos para agendar tu cita:',
        '1️⃣ Ingresa al siguiente enlace: https://centrosacre.com/solicitudCitas?cc=yuwE3pdEW3',
        '2️⃣ Elige la sucursal de tu preferencia 🏠',
        '3️⃣ Selecciona el tipo de sesión que necesitas 🩼',
        '4️⃣ Elige a tu fisioterapeuta (si no conoces a ninguna, ¡todo nuestro equipo está preparado para ayudarte! 💪 )',
        '5️⃣ Escoge día y horas disponibles 🗓️',
        '6️⃣ Llena los datos del paciente ✍️ y da clic en CONFIRMAR ✅',
        '7️⃣ ¡Listo! 🎉 Tu cita quedó registrada.',
        '📩 Te enviaremos un recordatorio un día antes de tu cita.',
        'IMPORTANTE: Si no recibiste ningún mensaje comunícate directamente por llamada.',
        '⚠️ Por favor, agenda solo una vez para mantener una atención adecuada a todos los pacientes 💚'
    ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowSucursales = addKeyword(['sucursales', 'ubicacion'])
    .addAnswer([
        'Contamos con 2 sucursales para tu comodidad 💕',
        '',
        '📍 Sucursal Condesa',
        'Baja California 354, Hipódromo Condesa',
        'Contamos con un lugar de estacionamiento (si está libre, puedes usarlo con gusto).',
        '👉 https://maps.app.goo.gl/VibfPG6iFyFtMv6D7',
        '🚗 ¡Conduce con precaución y nos vemos pronto!',
        '',
        '📍 Sucursal Santa Fe',
        'Vasco de Quiroga 4299, Local 203 (arriba del Oxxo en Aserrín)',
        'Contamos con estacionamiento en la plaza.',
        '👉 https://waze.com/ul/h9g3qheze0',
        '🚗 ¡Maneja con cuidado y nos vemos pronto!'
    ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

// --- SUBFLUJOS DE SERVICIOS ---
// Estos van antes de flowServicios
const flowPostServicio = addKeyword('INTERNAL_POST_SERVICE')
    .addAnswer('Si necesitas información sobre otro servicio cuéntanos sobre cual estas interesado y te proporcionaremos información o te recomendamos llamarnos 📞 para darte atención más personalizada 💬✨',
    { capture: true, buttons: [{ body: 'Agendar Cita' }, { body: 'Ir al Menú' }] }, 
    async (ctx, { gotoFlow }) => {
        if (ctx.body.includes('Agendar')) return gotoFlow(flowAgendar)
        if (ctx.body.includes('Menú')) return gotoFlow(flowMenu)
        return gotoFlow(flowDespedida)
    })

const flowDescripcionServicios = addKeyword('INTERNAL_DESC_SERVICIOS')
    .addAnswer('Escribe el número del servicio 👇', { capture: true }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => { 
        const op = ctx.body.trim(); 
        const d = { 
            '1': '🫶 *Fisioterapia*', 
            '2': '👐 *Osteopatía*', 
            '3': '🚶🏻‍♀️ *Reeducación postural global*', 
            '4': '🩷 *Rehabilitación de Suelo Pélvico*', 
            '5': '👶 *Osteopatía Pediátrica*', 
            '6': '🤰 *Preparación para el parto*', 
            '7': '🤱 *Rehabilitación Post embarazo*', 
            '8': '🌿 *Mastitis*', 
            '9': '🚑 *Rehabilitación oncológica*', 
            '10': '🦵 *Drenaje linfático*', 
            '11': '🙋🏻‍♂️ *Rehabilitación suelo pélvico masculino*' 
        }; 
        if(d[op]) { 
            await flowDynamic(d[op]); 
            return gotoFlow(flowPostServicio); 
        } 
        return fallBack('⚠️ Opción no válida. Por favor escribe solo el número.'); 
    })

const flowServicios = addKeyword(['servicios', 'tratamientos'])
    .addAnswer([
        '¡Claro! 🌸 En Centro Sacre contamos con atención especializada en:',
        '1️⃣ 🫶 Fisioterapia',
        '2️⃣ 👐 Osteopatía',
        '3️⃣ 🚶🏻‍♀️ Reeducación postural global',
        '4️⃣ 🩷 Rehabilitación de Suelo Pélvico',
        '5️⃣ 👶 Osteopatía Pediátrica',
        '6️⃣ 🤰 Preparación para el parto',
        '7️⃣ 🤱 Rehabilitación Post embarazo',
        '8️⃣ 🌿 Mastitis',
        '9️⃣ 🚑 Rehabilitación oncológica',
        '1️⃣0️⃣ 🦵 Drenaje linfático',
        '1️⃣1️⃣ 🙋🏻‍♂️ Rehabilitación suelo pélvico masculino',
        '',
        '*(Escribe el número del servicio para más detalles)*'
    ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowDescripcionServicios))

// --- MENÚ PRINCIPAL ---
const flowMenu = addKeyword(['Menu', 'menu', 'menú'])
    .addAnswer([
        'Por favor, elige la opción que deseas para poder apoyarte:',
        '1️⃣ Saber más sobre nuestros servicios',
        '2️⃣ Sucursales',
        '3️⃣ Agendar una cita 📅',
        '4️⃣ Conocer precios 💰',
        '5️⃣ Horarios de sucursales 🕒',
        '6️⃣ Cancelar cita ❌',
        '7️⃣ Solicitar factura 🧾',
        '8️⃣ ¿Quiénes somos? 💫',
        '9️⃣ Hablar con un asesor 👩‍💻'
    ].join('\n'), { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        const op = ctx.body.trim();
        if(['1', 'servicio', 'servicios'].some(x => op.includes(x))) return gotoFlow(flowServicios);
        if(['2', 'sucursales', 'ubicacion'].some(x => op.includes(x))) return gotoFlow(flowSucursales);
        if(['3', 'agendar', 'cita'].some(x => op.includes(x))) return gotoFlow(flowAgendar);
        if(['4', 'precios', 'costos'].some(x => op.includes(x))) return gotoFlow(flowPrecios);
        if(['5', 'horarios'].some(x => op.includes(x))) return gotoFlow(flowHorarios);
        if(['6', 'cancelar', 'baja'].some(x => op.includes(x))) return gotoFlow(flowCancelar);
        if(['7', 'factura'].some(x => op.includes(x))) return gotoFlow(flowFactura);
        if(['8', 'quienes', 'somos'].some(x => op.includes(x))) return gotoFlow(flowNosotros);
        if(['9', 'asesor', 'humano'].some(x => op.includes(x))) return gotoFlow(flowAsesor);
        return fallBack('⚠️ Opción no válida. Por favor escribe solo el número (ej: 1).');
    })

const flowFormulario = addKeyword(['formulario_registro'])
    .addAnswer([
        'Nos hace muy felices que hayas elegido a Centro Sacre para tu rehabilitación 💃',
        'Para asegurarnos de preparar todo para tu visita ¿podrías compartirnos algunos datos?',
        '🔹 Nombre completo:',
        '🔹 Número de teléfono:',
        '🔹 Correo electrónico:',
        '🔹 Motivo de consulta:',
        '🔹 Doctor@ que canaliza:',
        '🔹 Fecha de nacimiento:',
        '(Envía todo en un solo mensaje por favor)'
    ].join('\n'), { capture: true }, async (ctx, { state }) => state.update({ datos: ctx.body }))
    .addAnswer([
        'Estamos aquí para hacer este proceso lo más cómodo posible para ti 😀',
        'Un gusto que formes parte de la familia Centro Sacre ❣️'
    ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowMenu))

const flowPrincipal = addKeyword(EVENTS.WELCOME)
    .addAction(async (ctx, { gotoFlow }) => { if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano) })
    .addAnswer([
        '¡Hola! 😊 Te damos la bienvenida a Centro Sacre 🩷 .',
        'Soy tu asistente virtual y estoy aquí para ayudarte a encontrar la información que necesitas de forma rápida y sencilla.',
        'Indícanos si eres paciente de primera vez:'
    ].join('\n'), { capture: true, buttons: [{ body: 'Si' }, { body: 'No' }] }, async (ctx, { gotoFlow }) => {
        if(ctx.body.toLowerCase() === 'si') return gotoFlow(flowFormulario);
        return gotoFlow(flowMenu);
    })

const main = async () => {
    const adapterDB = new MemoryDB()
    const adapterFlow = createFlow([
        flowPrincipal, flowFormulario, flowMenu, flowServicios, flowDescripcionServicios, 
        flowPostServicio, flowSucursales, flowAgendar, flowPrecios, flowHorarios, 
        flowCancelar, flowFactura, flowNosotros, flowAsesor, flowContinuar, 
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

    // --- APIs ---
    adapterProvider.server.get('/api/contacts', (req, res) => {
        const contactos = Object.keys(baseDatosChats).map(telefono => {
            const msgs = baseDatosChats[telefono]
            const ultimo = msgs[msgs.length - 1]
            initMetadata(telefono) 
            return {
                phone: telefono,
                name: nombresGuardados[telefono] || '',
                lastMessage: ultimo ? (ultimo.type === 'image' ? '📷 Foto' : (ultimo.type === 'file' ? '📂 Archivo' : ultimo.body)) : '',
                timestamp: ultimo ? ultimo.timestamp : 0,
                isHumanMode: usuariosEnModoHumano.has(telefono),
                unreadCount: chatMetadata[telefono].unread,
                tags: chatMetadata[telefono].tags,
                isChatPinned: chatMetadata[telefono].isChatPinned
            }
        }).sort((a, b) => {
            if (a.isChatPinned && !b.isChatPinned) return -1;
            if (!a.isChatPinned && b.isChatPinned) return 1;
            return b.timestamp - a.timestamp;
        });
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(contactos))
    })

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

    adapterProvider.server.post('/api/toggle-bot', async (req, res) => {
        const body = req.body || {}
        if (body.active) usuariosEnModoHumano.delete(body.phone) 
        else usuariosEnModoHumano.add(body.phone)
        res.end(JSON.stringify({ status: 'ok', isHuman: usuariosEnModoHumano.has(body.phone) }))
    })

    adapterProvider.server.post('/api/save-name', async (req, res) => {
        const body = req.body || {}; if(body.phone && body.name) nombresGuardados[body.phone] = body.name; 
        res.end(JSON.stringify({ status: 'ok' }))
    })
    
    adapterProvider.server.post('/api/pin-chat', async (req, res) => {
        const body = req.body || {}; initMetadata(body.phone);
        chatMetadata[body.phone].isChatPinned = (body.action === 'pin');
        res.end(JSON.stringify({ status: 'ok' }))
    })

    adapterProvider.server.post('/api/message-action', async (req, res) => {
        const body = req.body || {}
        const { phone, timestamp, action, type } = body 
        initMetadata(phone)
        const list = type === 'star' ? chatMetadata[phone].starred : chatMetadata[phone].pinned
        if (action === 'add') { if (!list.includes(timestamp)) list.push(timestamp) } 
        else { const index = list.indexOf(timestamp); if (index > -1) list.splice(index, 1) }
        res.end(JSON.stringify({ status: 'ok' }))
    })

    adapterProvider.server.post('/api/tags', async (req, res) => {
        const body = req.body || {}
        const { phone, tag, action } = body 
        initMetadata(phone)
        if (action === 'add' && !chatMetadata[phone].tags.includes(tag)) chatMetadata[phone].tags.push(tag)
        else if (action === 'remove') chatMetadata[phone].tags = chatMetadata[phone].tags.filter(t => t !== tag)
        res.end(JSON.stringify({ status: 'ok', tags: chatMetadata[phone].tags }))
    })

    adapterProvider.server.post('/api/send', async (req, res) => {
        const body = req.body || {}
        await originalSendText(body.phone, body.message) 
        registrarMensaje(body.phone, 'admin', body.message)
        res.end(JSON.stringify({ status: 'ok' }))
    })

    adapterProvider.server.get('/api/backup', (req, res) => {
        const allChats = baseDatosChats;
        let htmlContent = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Respaldo</title></head><body>`;
        Object.keys(allChats).forEach(phone => {
            const nombre = nombresGuardados[phone] || 'Sin Nombre';
            htmlContent += `<h3>👤 ${nombre} (${phone})</h3>`;
            allChats[phone].forEach(m => {
                let txt = m.body;
                if(m.type === 'image') txt = `[IMAGEN] <a href="${m.mediaUrl}">Ver</a>`;
                if(m.type === 'file') txt = `[ARCHIVO] <a href="${m.mediaUrl}">Descargar</a>`;
                htmlContent += `<p><strong>${m.role}:</strong> ${txt}</p>`;
            });
            htmlContent += `<hr>`;
        });
        htmlContent += `</body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Disposition': 'attachment; filename="Respaldo.html"' });
        res.end(htmlContent);
    })

    adapterProvider.server.get('/panel', (req, res) => {
        try { const html = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf8'); res.end(html); } 
        catch (e) { res.end('Error: Falta public/index.html'); }
    })

    provider.on('message', (payload) => {
        // CORRECCIÓN PARA ARCHIVOS
        let mediaUrl = null;
        if (payload.url) mediaUrl = payload.url; 
        else if (payload?.message?.imageMessage?.url) mediaUrl = payload.message.imageMessage.url;
        else if (payload?.message?.documentMessage?.url) mediaUrl = payload.message.documentMessage.url;
        if (!mediaUrl && payload.file) mediaUrl = payload.file;

        registrarMensaje(payload.from, 'cliente', payload.body, mediaUrl)
        
        if (payload.body.includes('9') || payload.body.toLowerCase().includes('asesor')) { usuariosEnModoHumano.add(payload.from) }
    })

    httpServer(+process.env.PORT || 3008)
}

main()