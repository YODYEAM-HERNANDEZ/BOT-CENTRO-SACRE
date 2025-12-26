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

// LEYENDA OBLIGATORIA
const LEYENDA_STRICT = '\n\n_⚠️ Por favor, responde solo con la opción indicada_'

const initMetadata = (phone) => {
    if (!chatMetadata[phone]) {
        chatMetadata[phone] = { tags: [], unread: 0, starred: [], pinned: [], isChatPinned: false }
    }
}

// --- FUNCIÓN PARA GESTIONAR ETIQUETAS AUTOMÁTICAS ---
const agregarEtiqueta = (phone, tag) => {
    initMetadata(phone);
    if (!chatMetadata[phone].tags.includes(tag)) {
        chatMetadata[phone].tags.push(tag);
    }
}

// REGISTRO DE MENSAJES
const registrarMensaje = (telefono, role, body, mediaUrl = null, id = null) => {
    initMetadata(telefono)
    if (!baseDatosChats[telefono]) baseDatosChats[telefono] = []
    const timestamp = Date.now()
    
    let type = 'text';

    if (mediaUrl) {
        if (mediaUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i)) type = 'image';
        else if (mediaUrl.match(/\.(mp3|ogg|wav)$/i)) type = 'audio';
        else type = 'file';
    } else if (body && body.includes('_event_')) {
         if (body.includes('http')) {
             mediaUrl = body; 
             type = 'file';
         } else {
             type = 'system'; 
         }
    }

    baseDatosChats[telefono].push({ role, body, timestamp, type, mediaUrl, id })
    
    if (role === 'cliente') chatMetadata[telefono].unread += 1
    if (baseDatosChats[telefono].length > 300) baseDatosChats[telefono].shift()
}

// --- FLUJOS BASE ---

const flowHumano = addKeyword('INTERNAL_HUMAN_MODE')
    .addAction(async (ctx) => console.log(`Usuario ${ctx.from} en modo silencio.`))
    .addAnswer(null, { capture: true }, async (ctx, { gotoFlow, endFlow }) => {
        if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano)
        return endFlow()
    })

const flowDespedida = addKeyword('FLUJO_DESPEDIDA')
    .addAnswer('¡Gracias por elegir Centro Sacre! 🌿💖')

const flowContinuar = addKeyword('FLUJO_CONTINUAR')
    .addAnswer('¿Deseas realizar alguna otra consulta? 👇\n\n*(Por favor, selecciona el número o el botón de lo que desees hacer)*' + LEYENDA_STRICT, 
    { capture: true, buttons: [{ body: 'Ir al Menú' }, { body: 'Finalizar' }] }, 
    async (ctx, { gotoFlow, fallBack }) => {
        if(ctx.body.includes('Menú')) return gotoFlow(flowMenu);
        if(ctx.body.includes('Finalizar')) return gotoFlow(flowDespedida);
        return fallBack('⚠️ Opción no válida. Selecciona una opción.' + LEYENDA_STRICT)
    })

// --- FLUJOS DE RESPUESTA ---

const flowAsesor = addKeyword(['asesor', 'humano'])
    .addAction(async (ctx) => {
        agregarEtiqueta(ctx.from, 'Atención');
        usuariosEnModoHumano.add(ctx.from);
    })
    .addAnswer([
        '¡Por supuesto! 💬 He notificado a un miembro de nuestro equipo para darte atención personalizada.',
        'En unos momentos alguien se pondrá en contacto contigo. 🤗',
        '🕓 Nuestro horario de atención es: Lunes a Viernes: 10:00 a.m. – 7:00 p.m. Sábados: 8:00 a.m. – 2:00 p.m.',
        'IMPORTANTE: Si tu situación es urgente, puedes llamarnos directamente 📞 y con gusto te comunicaremos con una asistente.'
    ].join('\n'), null, async (ctx, { gotoFlow }) => { 
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

// --- FACTURA ---
const flowFactura = addKeyword(['factura'])
    .addAnswer([
        'Puedes solicitar tu factura enviando un correo a: centrosacre@gmail.com',
        'Envíanos tu Constancia de situación Fiscal y en asunto pon: Factura'
    ].join('\n\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

const flowCancelar = addKeyword(['cancelar', 'baja'])
    .addAnswer([
        'Lamentamos que tengas que cancelar 😢 Por favor, comunícate con nosotros por llamada 📞 para hacerlo directamente.',
        '⚠️ Ten en cuenta que al cancelar tu cita puede interrumpirse la continuidad de tu tratamiento, ya que el tiempo de espera para reagendar es de aproximadamente 2 semanas.',
        'Gracias por tu comprensión 💗'
    ].join('\n\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

// --- VAS TARDE ---
const flowTarde = addKeyword(['tarde', 'retraso', 'llegar'])
    .addAction(async (ctx) => {
        agregarEtiqueta(ctx.from, 'Tarde');
        agregarEtiqueta(ctx.from, 'Atención');
    })
    .addAnswer([
        '😢 Ntp! Entendemos perfecto 👌',
        '',
        '📅  Puedes indicarnos fecha y hora de tu cita para cancelar.',
        '',
        '😥 Solo recuerda que al perder esta cita el re-agendarla implica tiempo de espera.',
        '☹️ Te compartimos el link para que te reagendes directamente:',
        'https://centrosacre.com/solicitudCitas?cc=yuwE3pdEW3'
    ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))

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
const flowPostServicio = addKeyword('INTERNAL_POST_SERVICE')
    .addAnswer('Si necesitas información sobre otro servicio cuéntanos sobre cual estas interesado y te proporcionaremos información o te recomendamos llamarnos 📞 para darte atención más personalizada 💬✨\n\n*(Por favor, selecciona el número o el botón de lo que desees hacer)*' + LEYENDA_STRICT,
    { capture: true, buttons: [{ body: 'Agendar Cita' }, { body: 'Ir al Menú' }] }, 
    async (ctx, { gotoFlow, fallBack }) => {
        if (ctx.body.includes('Agendar')) return gotoFlow(flowAgendar)
        if (ctx.body.includes('Menú')) return gotoFlow(flowMenu)
        return fallBack('⚠️ Selecciona una opción válida.' + LEYENDA_STRICT)
    })

const flowDescripcionServicios = addKeyword('INTERNAL_DESC_SERVICIOS')
    .addAnswer('Escribe el número del servicio 👇' + LEYENDA_STRICT, { capture: true }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => { 
        const op = ctx.body.trim(); 
        const d = { 
            '1': '🫶 *Fisioterapia:*\nNuestro objetivo es que logres recuperar la movilidad, seguridad y eliminar dolor a través también de un abordaje integral y sistémico donde se abarque el inicio de su disfunción con la ayuda de técnicas manuales, liberación miofascial, cambios en su estilo de vida y apreciación de la su salud desde un enfoque preventivo.', 
            '2': '👐 *Osteopatía:*\nEvaluamos y tratamos a traves de un abordaje integral observando el origen de la disfunción la cual se aborda a través de técnicas manuales a los tejidos y estructuras del cuerpo observándose como una unidad completa en donde si un sistema está en desequilibrio automáticamente altera la función del cuerpo en general.', 
            '3': '🚶🏻‍♀️ *RPG (Reeducación Postural Global):*\nEs un método fisioterapéutico eficaz para tratar diferentes patologías del sistema muscular y óseo, especialmente aquellas que tienen relación con la postura. Consiste en la realización de posturas físicas activas, poniendo especial atención en la respiración y trabajando distintas regiones y sistemas de coordinación muscular.', 
            '4': '🩷 *Suelo Pélvico:*\nAbordamos disfunciones como incontinencia urinaria, incontinencia fecal, vaginismo, prolapsos vaginales, alteraciones sexuales, dolor pélvico, dispareunia y estreñimiento. Buscamos reintegrarte a tu vida diaria recuperando fuerza y movilidad con técnicas manuales y aparatología especializada.', 
            '5': '👶 *Osteopatía Pediátrica:*\nEs un tratamiento no invasivo que ayuda a eliminar tensiones en el recién nacido posiblemente generadas por posiciones uterinas, cesáreas o expulsivos prolongados. Ayuda también en reflujo, cólico y estreñimiento restableciendo una correcta movilidad del sistema digestivo.', 
            '6': '🤰 *Preparación para el parto:*\nDurante el embarazo el cuerpo de la mujer desarrolla grandes cambios. En Centro Sacre trabajamos desde la semana 13 reeducando postura y core. Llegando a la semana 33, el conocer tu pelvis y cadera ayudará a conducir a tu bebé al canal del parto, junto con respiraciones, masaje perineal y un buen pujo.', 
            '7': '🤱 *Rehabilitación Post embarazo:*\nEl post parto trae consigo cambios mecánicos, musculares y posturales. Te acompañamos integrándote a tu vida diaria, dando fuerza y reeducación en musculatura abdominal y pélvica. Tratamos cicatrices (cesárea), diástasis y prevenimos futuras disfunciones.', 
            '8': '🌿 *Mastitis / Lactancia:*\nTratamos posibles alteraciones en la lactancia como mastitis o algún conducto tapado que genere dolor al momento de lactar con la ayuda de técnicas manuales y aparatología para liberar los ductos y favorecer una lactancia favorable.', 
            '9': '🚑 *Rehabilitación oncológica:*\nEn Centro Sacre te acompañamos en cada una de las etapas de tu proceso oncológico. Por medio de diferentes técnicas manuales y equipos identificamos las causas que afectan o interfieren en los efectos secundarios posteriores a tu cirugía (cáncer de ovario, útero, mama, próstata, colon).', 
            '10': '🦵 *Drenaje linfático:*\nLas alteraciones venosas y linfáticas (flebitis, trombosis, linfedema) se tratan por medio de técnicas manuales de drenaje linfático, uso de diferentes equipos y ejercicios para reeducar estos sistemas y mejorar tu calidad de vida.', 
            '11': '🙋🏻‍♂️ *Suelo Pélvico Masculino:*\nAbordamos la sexualidad sana y plena, reeducación postural y tratamientos para el dolor. Tratamos alteraciones como eyaculación precoz, dolor pélvico, disfunciones genitourinarias y rehabilitación post-quirúrgica de próstata.' 
        }; 

        if(d[op]) { 
            await flowDynamic(d[op]); 
            return gotoFlow(flowPostServicio); 
        } 
        return fallBack('⚠️ Opción no válida. Por favor escribe solo el número.' + LEYENDA_STRICT); 
    })

const flowServicios = addKeyword(['servicios', 'tratamientos'])
    .addAnswer([
        '¡Claro! 🌸 En Centro Sacre contamos con atención especializada en:',
        '1️⃣ 🫶 Fisioterapia',
        '2️⃣ 👐 Osteopatía',
        '3️⃣ 🚶🏻‍♀️ Reeducación postural global (RPG)',
        '4️⃣ 🩷 Rehabilitación de Suelo Pélvico',
        '5️⃣ 👶 Osteopatía Pediátrica',
        '6️⃣ 🤰 Preparación para el parto',
        '7️⃣ 🤱 Rehabilitación Post embarazo',
        '8️⃣ 🌿 Mastitis',
        '9️⃣ 🚑 Rehabilitación oncológica',
        '10️⃣ 🦵 Drenaje linfático',
        '11️⃣ 🙋🏻‍♂️ Rehabilitación suelo pélvico masculino',
        '',
        '*(Escribe el número del servicio para más detalles)*'
    ].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowDescripcionServicios))

// --- MENÚ PRINCIPAL (SIN SALUDOS AQUÍ, PARA QUE VAYAN A BIENVENIDA) ---
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
        '9️⃣ Hablar con un asesor 👩‍💻',
        '10️⃣ Vas tarde 🏃‍♀️'
    ].join('\n'), { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
        const op = ctx.body.trim();

        if(['10', 'diez', 'tarde', 'vas tarde'].some(x => op.toLowerCase().includes(x))) {
             return gotoFlow(flowTarde);
        }
        
        if(['1', 'servicio', 'servicios'].some(x => op.includes(x))) return gotoFlow(flowServicios);
        if(['2', 'sucursales', 'ubicacion'].some(x => op.includes(x))) return gotoFlow(flowSucursales);
        if(['3', 'agendar', 'cita'].some(x => op.includes(x))) return gotoFlow(flowAgendar);
        if(['4', 'precios', 'costos'].some(x => op.includes(x))) return gotoFlow(flowPrecios);
        if(['5', 'horarios'].some(x => op.includes(x))) return gotoFlow(flowHorarios);
        if(['6', 'cancelar', 'baja'].some(x => op.includes(x))) return gotoFlow(flowCancelar);
        if(['7', 'factura'].some(x => op.includes(x))) return gotoFlow(flowFactura);
        if(['8', 'quienes', 'somos'].some(x => op.includes(x))) return gotoFlow(flowNosotros);
        if(['9', 'asesor', 'humano'].some(x => op.includes(x))) return gotoFlow(flowAsesor);
        
        return fallBack('⚠️ Opción no válida. Por favor escribe solo el número (ej: 1).' + LEYENDA_STRICT);
    })
    .addAnswer('*(Por favor, selecciona el número o el botón de lo que desees hacer)*' + LEYENDA_STRICT)

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

// --- FLOW PRINCIPAL CON SALUDOS INCLUIDOS ---
const flowPrincipal = addKeyword([EVENTS.WELCOME, 'hola', 'buenas', 'buenos dias', 'buenas tardes', 'inicio'])
    .addAction(async (ctx, { gotoFlow, endFlow }) => {
        if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano);
    })
    .addAnswer([
        '¡Hola! 😊 Te damos la bienvenida a Centro Sacre 🩷 .',
        'Soy FisioBot tu asistente virtual y estoy aquí para ayudarte a encontrar la información que necesitas de forma rápida y sencilla.',
        'Indícanos si eres paciente de primera vez:'
    ].join('\n'), { capture: true, buttons: [{ body: 'Si' }, { body: 'No' }] }, async (ctx, { gotoFlow, fallBack }) => {
        if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano);
        if(ctx.body.toLowerCase() === 'si') return gotoFlow(flowFormulario);
        if(ctx.body.toLowerCase() === 'no') return gotoFlow(flowMenu);
        return fallBack('⚠️ Por favor selecciona Si o No.' + LEYENDA_STRICT);
    })

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
        const response = await originalSendText(number, message, options)
        const messageId = response?.messages?.[0]?.id || response?.id || null;
        registrarMensaje(number, 'admin', message, null, messageId)
        return response
    }

    const { httpServer, provider } = await createBot({ flow: adapterFlow, provider: adapterProvider, database: adapterDB })

    // --- APIs ---
    adapterProvider.server.get('/api/contacts', (req, res) => {
        const contactos = Object.keys(baseDatosChats).map(telefono => {
            const msgs = baseDatosChats[telefono]
            const ultimo = msgs[msgs.length - 1]
            initMetadata(telefono)
            
            const diff = Date.now() - (ultimo ? ultimo.timestamp : 0);
            const expired = diff > (24 * 60 * 60 * 1000);

            return {
                phone: telefono,
                name: nombresGuardados[telefono] || '',
                lastMessage: ultimo ? (ultimo.type === 'image' ? '📷 Foto' : (ultimo.type === 'file' ? '📂 Archivo' : ultimo.body)) : '',
                timestamp: ultimo ? ultimo.timestamp : 0,
                isHumanMode: usuariosEnModoHumano.has(telefono),
                unreadCount: chatMetadata[telefono].unread,
                tags: chatMetadata[telefono].tags,
                isChatPinned: chatMetadata[telefono].isChatPinned,
                sessionExpired: expired
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

    adapterProvider.server.post('/api/react', async (req, res) => {
        const body = req.body || {}
        const { phone, messageId, emoji } = body
        if(!messageId) return res.end(JSON.stringify({ status: 'error', error: 'Falta ID del mensaje' }))
        try {
            const payload = {
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: phone,
                type: "reaction",
                reaction: { message_id: messageId, emoji: emoji }
            }
            await adapterProvider.sendMessage(phone, payload.reaction.emoji, {
                options: { type: 'reaction', messageId: payload.reaction.message_id }
            })
            res.end(JSON.stringify({ status: 'ok' }))
        } catch (e) {
           console.error(e)
           res.end(JSON.stringify({ status: 'error', error: e.message }))
        }
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
        try {
            const response = await originalSendText(body.phone, body.message) 
            const messageId = response?.messages?.[0]?.id || response?.id || null;
            registrarMensaje(body.phone, 'admin', body.message, null, messageId)
            res.end(JSON.stringify({ status: 'ok' }))
        } catch (e) {
          console.error(e)
          res.end(JSON.stringify({ status: 'error', error: 'No se pudo enviar. Verifica la ventana de 24h.' }))
        }
    })

    adapterProvider.server.get('/api/backup', (req, res) => {
        const allChats = baseDatosChats;
        const names = nombresGuardados;
        let htmlContent = `
        <!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Respaldo de Chats - Centro Sacre</title>
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #d1d7db; margin: 0; padding: 20px; }
            h1 { text-align: center; color: #444; margin-bottom: 30px; }
            .chat-container { background: #efeae2; max-width: 800px; margin: 0 auto 30px auto; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); overflow: hidden; border: 1px solid #ccc; }
            .chat-header { background: #008069; color: white; padding: 15px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #005c4b; }
            .chat-header h2 { margin: 0; font-size: 18px; }
            .chat-header span { font-size: 14px; opacity: 0.9; }
            .messages-area { padding: 20px; display: flex; flex-direction: column; gap: 8px; background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); opacity: 0.95; }
            .msg { padding: 8px 12px; border-radius: 8px; max-width: 80%; position: relative; word-wrap: break-word; font-size: 14px; box-shadow: 0 1px 1px rgba(0,0,0,0.1); line-height: 1.4; }
            .msg-client { background: white; align-self: flex-start; border-top-left-radius: 0; color: #111b21; }
            .msg-admin { background: #d9fdd3; align-self: flex-end; border-top-right-radius: 0; color: #111b21; }
            .msg-bot { background: #f0f2f5; align-self: flex-end; font-style: italic; border: 1px dashed #ccc; font-size: 13px; color: #555; }
            .timestamp { font-size: 10px; color: #667781; text-align: right; margin-top: 4px; display: block; }
            img.chat-img { max-width: 250px; border-radius: 6px; margin-bottom: 5px; display: block; border: 1px solid #ddd; }
            audio { width: 100%; max-width: 250px; margin-top: 5px; }
        </style></head><body><h1>📁 Respaldo de Conversaciones - Centro Sacre</h1>`;

        Object.keys(allChats).forEach(phone => {
            const name = names[phone] || 'Desconocido';
            const messages = allChats[phone];
            if(messages && messages.length > 0) {
                htmlContent += `<div class="chat-container"><div class="chat-header"><h2>👤 ${name}</h2><span>📞 ${phone}</span></div><div class="messages-area">`;
                messages.forEach(msg => {
                    let cls = 'msg-client';
                    if(msg.role === 'admin') cls = 'msg-admin';
                    if(msg.role === 'bot') cls = 'msg-bot';
                    let content = msg.body || '';
                    if(msg.type === 'image') content = `<img src="${msg.mediaUrl}" class="chat-img"><a href="${msg.mediaUrl}" target="_blank" style="color: #027eb5;">📷 Ver Imagen</a>`;
                    else if(msg.type === 'file') content = `📄 <strong>Archivo adjunto:</strong><br><a href="${msg.mediaUrl}" target="_blank" style="color: #027eb5;">⬇️ Descargar</a>`;
                    else if(msg.type === 'audio') content = `🎵 <strong>Nota de voz:</strong><br><audio controls src="${msg.mediaUrl}"></audio>`;
                    const time = new Date(msg.timestamp).toLocaleString('es-MX');
                    htmlContent += `<div class="msg ${cls}">${content}<span class="timestamp">${time}</span></div>`;
                });
                htmlContent += `</div></div>`;
            }
        });
        htmlContent += `</body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Disposition': 'attachment; filename="Respaldo_Sacre_CRM.html"' });
        res.end(htmlContent);
    })

    adapterProvider.server.get('/panel', (req, res) => {
      try { const html = readFileSync(join(process.cwd(), 'public', 'index.html'), 'utf8'); res.end(html); } 
      catch (e) { res.end('Error: Falta public/index.html'); }
    })

    provider.on('message', (payload) => {
        let mediaUrl = null;
        if (payload.url) mediaUrl = payload.url; 
        else if (payload?.message?.imageMessage?.url) mediaUrl = payload.message.imageMessage.url;
        else if (payload?.message?.documentMessage?.url) mediaUrl = payload.message.documentMessage.url;
        if (!mediaUrl && payload.file) mediaUrl = payload.file;

        const messageId = payload.id || payload.key?.id || payload.messageId || payload.wamid || null;
        registrarMensaje(payload.from, 'cliente', payload.body, mediaUrl, messageId)
        
        if (payload.body.toLowerCase().includes('asesor')) { 
           usuariosEnModoHumano.add(payload.from);
           agregarEtiqueta(payload.from, 'Atención');
        }
    })

    httpServer(+process.env.PORT || 3008)
}

main()