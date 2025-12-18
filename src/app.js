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

// --- FLUJOS DEL BOT (Mismos que tenías, resumidos para el ejemplo) ---
const flowHumano = addKeyword('INTERNAL_HUMAN_MODE')
    .addAction(async (ctx) => console.log(`Usuario ${ctx.from} en modo silencio.`))
    .addAnswer(null, { capture: true }, async (ctx, { gotoFlow, endFlow }) => {
        if (usuariosEnModoHumano.has(ctx.from)) return gotoFlow(flowHumano)
        return endFlow()
    })

const flowDespedida = addKeyword('FLUJO_DESPEDIDA').addAnswer('¡Gracias por confiar en Centro Sacre! 🌿💖')
const flowContinuar = addKeyword('FLUJO_CONTINUAR')
    .addAnswer('¿Deseas realizar otra consulta? 👇', { capture: true, buttons: [{ body: 'Menú' }, { body: 'Finalizar' }] },
        async (ctx, { gotoFlow }) => { return ctx.body.includes('Menú') ? gotoFlow(flowMenu) : gotoFlow(flowDespedida) })

// ... (Aquí irían tus flujos de Servicios, Horarios, etc. Tal cual los tenías antes)
// Para que el código no sea kilométrico, asumo que mantienes tus flujos de la versión anterior.
// Si necesitas que te pegue TODOS los flujos de nuevo, avísame.
// AQUI HE DEJADO EL MENU PRINCIPAL CRITICO:

const flowMenu = addKeyword(['Menu', 'menu', 'menú'])
    .addAnswer(
        ['🙌 *Menú Principal*', '1️⃣ Servicios', '2️⃣ Sucursales', '3️⃣ Agendar cita', '4️⃣ Precios', '5️⃣ Horarios', '6️⃣ Cancelar cita', '7️⃣ Facturación', '8️⃣ ¿Quiénes somos?', '9️⃣ Hablar con asesor', '1️⃣0️⃣ Vas tarde', '*(Responde con el número)*'].join('\n'),
        { capture: true },
        async (ctx, { gotoFlow, fallBack }) => {
            // Lógica simple para derivar (puedes pegar tu lógica completa aquí si la tienes)
            if (ctx.body.includes('9')) return gotoFlow(flowAsesor)
            // ... resto de opciones
            return fallBack('Opción no válida.')
        }
    )

const flowAsesor = addKeyword(['asesor', 'humano']).addAnswer('He notificado a nuestro equipo. 💬', null, async (ctx, { gotoFlow }) => { 
     usuariosEnModoHumano.add(ctx.from)
     return gotoFlow(flowHumano) 
})

const main = async () => {
    const adapterDB = new MemoryDB()
    const adapterFlow = createFlow([flowMenu, flowAsesor, flowHumano, flowDespedida]) // Agrega aquí el resto de tus flujos
    
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

    //API 2: CHAT INDIVIDUAL (ARREGLADO PARA QUE SE VEAN LOS MENSAJES)
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
        // Enviamos directo el array en una propiedad clara
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ messages: messages, isHuman: usuariosEnModoHumano.has(phone) }))
    })

    //API 3: TOGGLE BOT (ARREGLADO)
    adapterProvider.server.post('/api/toggle-bot', async (req, res) => {
        const body = req.body || {}
        // Si active es true, queremos encender el bot (quitarlo de modo humano)
        if (body.active) {
            usuariosEnModoHumano.delete(body.phone)
        } else {
            // Si active es false, queremos apagar el bot (agregarlo a modo humano)
            usuariosEnModoHumano.add(body.phone)
        }
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

    // API 7: RESPALDO ESTILO WHATSAPP (ARREGLADO)
    adapterProvider.server.get('/api/backup', (req, res) => {
        const allChats = baseDatosChats;
        let htmlContent = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8"><title>Respaldo Sacre</title>
            <style>
                body { background-color: #e5ddd5; font-family: Helvetica, Arial, sans-serif; margin: 0; padding: 20px; }
                .chat-box { background: #fff; max-width: 900px; margin: 0 auto 30px auto; border-radius: 8px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); overflow: hidden; }
                .chat-header { background: #075e54; color: white; padding: 15px; font-size: 18px; font-weight: bold; }
                .chat-body { padding: 20px; background-image: url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png'); }
                .msg { display: flex; flex-direction: column; margin-bottom: 10px; max-width: 80%; }
                .msg-in { align-self: flex-start; align-items: flex-start; }
                .msg-out { align-self: flex-end; align-items: flex-end; }
                .bubble { padding: 8px 12px; border-radius: 7px; position: relative; font-size: 14px; line-height: 1.4; box-shadow: 0 1px 1px rgba(0,0,0,0.2); }
                .msg-in .bubble { background: #fff; border-top-left-radius: 0; }
                .msg-out .bubble { background: #dcf8c6; border-top-right-radius: 0; }
                .msg-bot .bubble { background: #f0f0f0; border: 1px dashed #999; font-style: italic; }
                .time { font-size: 10px; color: #999; margin-top: 4px; text-align: right; }
                .role-label { font-size: 10px; font-weight: bold; margin-bottom: 2px; color: #555; }
            </style>
        </head>
        <body>`;
        
        Object.keys(allChats).forEach(phone => {
            const nombre = nombresGuardados[phone] || 'Sin Nombre';
            htmlContent += `<div class="chat-box">
                <div class="chat-header">👤 ${nombre} (${phone})</div>
                <div class="chat-body" style="display:flex; flex-direction:column;">`;
            
            allChats[phone].forEach(m => {
                let typeClass = 'msg-in'; // Cliente
                let roleText = 'Cliente';
                if (m.role === 'admin') { typeClass = 'msg-out'; roleText = 'Asesor'; }
                if (m.role === 'bot') { typeClass = 'msg-out msg-bot'; roleText = 'Bot'; }
                
                const date = new Date(m.timestamp).toLocaleString();
                htmlContent += `
                    <div class="msg ${typeClass}">
                        <div class="bubble">
                            <div class="role-label">${roleText}</div>
                            <div>${m.body.replace(/\n/g, '<br>')}</div>
                            <div class="time">${date}</div>
                        </div>
                    </div>`;
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

main()