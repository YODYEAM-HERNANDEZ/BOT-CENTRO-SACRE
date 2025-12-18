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
    
    // Detectar tipo de mensaje
    let type = 'text';
    if (mediaUrl) {
        // Si tiene URL, asumimos que es archivo o imagen
        if (mediaUrl.match(/\.(jpeg|jpg|gif|png)$/i)) type = 'image';
        else type = 'file';
    } else if (body.includes('_event_')) {
        // Si es un evento sin URL capturada, lo marcamos como sistema para que no ensucie
        type = 'system';
    }

    // Solo guardamos si no es un evento vacío raro
    baseDatosChats[telefono].push({ role, body, timestamp, type, mediaUrl })
    
    if (role === 'cliente') chatMetadata[telefono].unread += 1
    if (baseDatosChats[telefono].length > 300) baseDatosChats[telefono].shift()
}

// --- FLUJOS (Sin cambios, tal cual los tienes) ---
const flowHumano = addKeyword('INTERNAL_HUMAN_MODE')
    .addAction(async (ctx) => console.log(`Usuario ${ctx.from} en modo silencio.`))
    .addAnswer(null, { capture: true }, async (ctx, { gotoFlow, endFlow }) => {
        if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano)
        return endFlow()
    })

const flowDespedida = addKeyword('FLUJO_DESPEDIDA').addAnswer('¡Gracias por confiar en Centro Sacre! 🌿💖 Si nos necesitas de nuevo, solo escribe "Hola".')
const flowContinuar = addKeyword('FLUJO_CONTINUAR').addAnswer('¿Deseas realizar otra consulta? 👇', { capture: true, buttons: [{ body: 'Ir al Menú' }, { body: 'Finalizar' }] }, async (ctx, { gotoFlow }) => { return ctx.body.includes('Menú') ? gotoFlow(flowMenu) : gotoFlow(flowDespedida) })

const flowAgendar = addKeyword(['agendar', 'cita']).addAnswer(['📅 *Para agendar:*', '1️⃣ Entra aquí: https://centrosacre.com/solicitudCitas?cc=yuwE3pdEW3'].join('\n\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))
const flowPostServicio = addKeyword('INTERNAL_POST_SERVICE').addAnswer('¿Te gustaría agendar tu cita o consultar otro servicio? 👇', { capture: true, buttons: [{ body: 'Agendar Cita' }, { body: 'Ver otro' }, { body: 'Ir al Menú' }] }, async (ctx, { gotoFlow }) => { if (ctx.body.includes('Agendar')) return gotoFlow(flowAgendar); if (ctx.body.includes('otro')) return gotoFlow(flowServicios); if (ctx.body.includes('Menú')) return gotoFlow(flowMenu); return gotoFlow(flowDespedida) })
const flowDescripcionServicios = addKeyword('INTERNAL_DESC_SERVICIOS').addAnswer('Escribe el número del servicio 👇', { capture: true }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => { const op = ctx.body.trim(); const d = { '1': '🫶 *Fisioterapia*', '2': '👐 *Osteopatía*', '3': '🚶🏻‍♀️ *RPG*', '4': '🩷 *Suelo Pélvico*', '5': '👶 *Osteopatía Pediátrica*', '6': '🤰 *Parto*', '7': '🤱 *Post embarazo*', '8': '🌿 *Lactancia*', '9': '🚑 *Oncológica*', '10': '🦵 *Drenaje*', '11': '🙋🏻‍♂️ *Suelo Pélvico Masc*' }; if(d[op]) { await flowDynamic(d[op]); return gotoFlow(flowPostServicio); } return fallBack('⚠️ Opción no válida.'); })
const flowServicios = addKeyword(['servicios', 'tratamientos']).addAnswer(['🌸 *Servicios:*', '1️⃣ Fisioterapia', '2️⃣ Osteopatía', '3️⃣ RPG', '4️⃣ Suelo Pélvico', '5️⃣ Osteopatía Pediátrica', '6️⃣ Prep. Parto', '7️⃣ Post embarazo', '8️⃣ Mastitis', '9️⃣ Oncológica', '1️⃣0️⃣ Drenaje', '1️⃣1️⃣ Suelo Pélvico Masc'].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowDescripcionServicios))
const flowSucursales = addKeyword(['sucursales', 'ubicacion']).addAnswer('📍 ¿Qué sede buscas?', { capture: true, buttons: [{ body: 'Condesa' }, { body: 'Santa Fe' }] }, async (ctx, { flowDynamic, gotoFlow, fallBack }) => { if (ctx.body.toLowerCase().includes('condesa')) { await flowDynamic('📍 Condesa: Baja California 354'); return gotoFlow(flowContinuar) } if (ctx.body.toLowerCase().includes('santa')) { await flowDynamic('📍 Santa Fe: Vasco de Quiroga 4299'); return gotoFlow(flowContinuar) } return fallBack('Selecciona un botón.') })
const flowHorarios = addKeyword(['horarios']).addAnswer('🕒 Sede:', { capture: true, buttons: [{ body: 'Condesa' }, { body: 'Santa Fe' }] }, async (ctx, { flowDynamic, gotoFlow }) => { if (ctx.body.toLowerCase().includes('condesa')) await flowDynamic('L-V 10am-8pm'); else await flowDynamic('L-V 8am-4pm'); return gotoFlow(flowContinuar) })
const flowPrecios = addKeyword(['precios', 'costos']).addAnswer(['💰 *Precios:*', 'Consulta inicial: $1,350', 'Subsecuentes: $1,250'].join('\n'), null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))
const flowFactura = addKeyword(['factura']).addAnswer('✏️ Nombre completo:', { capture: true }, async (ctx, { state }) => state.update({ nombre: ctx.body })).addAnswer('📄 Constancia Fiscal:', { capture: true }).addAnswer('✅ Recibido.', null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))
const flowCancelar = addKeyword(['cancelar', 'baja']).addAnswer('📅 Indícanos fecha/hora para cancelar o usa el link: https://centrosacre.com/solicitudCitas?cc=yuwE3pdEW3', null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))
const flowTarde = addKeyword(['tarde', 'retraso']).addAnswer('🕒 Notificado. El tiempo de sesión se reducirá.', null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))
const flowNosotros = addKeyword(['quienes', 'somos']).addAnswer('Somos un referente en bienestar integral. 🌿', null, async (_, { gotoFlow }) => gotoFlow(flowContinuar))
const flowAsesor = addKeyword(['asesor', 'humano']).addAnswer('He notificado a nuestro equipo. 💬', null, async (ctx, { gotoFlow }) => { usuariosEnModoHumano.add(ctx.from); return gotoFlow(flowHumano) })

const flowMenu = addKeyword(['Menu', 'menu', 'menú']).addAnswer(['🙌 *Menú Principal*', '1️⃣ Servicios', '2️⃣ Sucursales', '3️⃣ Agendar', '4️⃣ Precios', '5️⃣ Horarios', '6️⃣ Cancelar', '7️⃣ Factura', '8️⃣ ¿Quiénes somos?', '9️⃣ Asesor', '1️⃣0️⃣ Tarde'].join('\n'), { capture: true }, async (ctx, { gotoFlow, fallBack }) => {
    let op = ctx.body.trim();
    if (op.includes('1') || op.includes('servicio')) return gotoFlow(flowServicios);
    if (op.includes('2') || op.includes('sucursal')) return gotoFlow(flowSucursales);
    if (op.includes('3') || op.includes('agendar')) return gotoFlow(flowAgendar);
    if (op.includes('4')) return gotoFlow(flowPrecios);
    if (op.includes('5')) return gotoFlow(flowHorarios);
    if (op.includes('6')) return gotoFlow(flowCancelar);
    if (op.includes('7')) return gotoFlow(flowFactura);
    if (op.includes('8')) return gotoFlow(flowNosotros);
    if (op.includes('9') || op.includes('asesor')) return gotoFlow(flowAsesor);
    if (op.includes('10')) return gotoFlow(flowTarde);
    return fallBack('Opción no válida.');
})
const flowFormulario = addKeyword(['formulario_registro']).addAnswer('🔹 Datos (Nombre, Tel, Correo):', { capture: true }, async (ctx, { state }) => state.update({ datos: ctx.body })).addAnswer('✅ Listo.', null, async (_, { gotoFlow }) => gotoFlow(flowMenu))
const flowPrincipal = addKeyword(EVENTS.WELCOME).addAction(async (ctx, { gotoFlow }) => { if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano) }).addAnswer('¡Hola! 😊 Bienvenido a *Centro Sacre*. ¿Primera vez?', { capture: true, buttons: [{ body: 'Si' }, { body: 'No' }] }, async (ctx, { gotoFlow }) => { if (ctx.body.toLowerCase() === 'si') return gotoFlow(flowFormulario); return gotoFlow(flowMenu) })

const main = async () => {
    const adapterDB = new MemoryDB()
    const adapterFlow = createFlow([flowPrincipal, flowFormulario, flowMenu, flowServicios, flowDescripcionServicios, flowPostServicio, flowSucursales, flowAgendar, flowPrecios, flowHorarios, flowCancelar, flowTarde, flowFactura, flowNosotros, flowAsesor, flowContinuar, flowDespedida, flowHumano])
    
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
                // Mostrar si es foto o archivo en la vista de lista
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

    // --- AQUÍ ESTÁ LA MAGIA PARA LOS ARCHIVOS ---
    provider.on('message', (payload) => {
        // Intentamos sacar la URL de donde sea que Meta la mande
        let mediaUrl = payload.url || payload?.message?.imageMessage?.url || payload?.message?.documentMessage?.url || null;
        
        // Si no hay URL pero el body es raro, intentamos ver si el payload tiene file
        if (!mediaUrl && payload.file) mediaUrl = payload.file;

        registrarMensaje(payload.from, 'cliente', payload.body, mediaUrl)
        
        if (payload.body.includes('9') || payload.body.toLowerCase().includes('asesor')) { usuariosEnModoHumano.add(payload.from) }
    })

    httpServer(+process.env.PORT || 3008)
}

main()