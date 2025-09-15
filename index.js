/**
 * Bot WhatsApp con whatsapp-web.js
 * - Loguea en consola cada petición: número entrante y mensaje
 * - Envía a números aunque NO estén en contactos (usa getNumberId)
 * - Soporta media por archivo local o URL
 * - Respuestas JSON consistentes
 * Requisitos: Node 16+, whatsapp-web.js, qrcode-terminal
 */

const http = require('http');
const https = require('https');            // ? agregado
const { URL } = require('url');            // ? agregado
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const {
    Client,
    LocalAuth,
    MessageMedia
} = require('whatsapp-web.js');

// -------------------------------------------------------------
// Configuración
// -------------------------------------------------------------
const hostname = '127.0.0.1';
const port = process.env.PUERTO || 8086;

// Números para notificación de arranque (opcional, formato @c.us)
var numeroConectado = "";
const numeroInicio = "5215511223344@c.us"; // Numero que recibe aviso cuando arranca el servicio
const numeroInicio2 = "";
// const url_notificacion = "http://localhost:5245/api/Whatsapp/Respuesta";
const url_notificacion = ""; // a quien le avisamos cuando alguien nos escribe

// -------------------------------------------------------------
/** Helpers */
// -------------------------------------------------------------
const ts = () => new Date().toISOString().replace('T', ' ').replace('Z', '');

function onlyDigits(s) {
    return String(s || '').replace(/\D/g, '');
}

/**
 * Normaliza a dígitos E.164 sin '+'. Si recibe 10 dígitos, antepone país MX (52).
 * Cambia '52' si tu país base es otro.
 */
function toE164Digits(raw, defaultCountry = '52') {
    const digits = onlyDigits(raw);
    if (!digits) return '';
    if (digits.startsWith(defaultCountry)) return digits;
    if (digits.length === 10) return defaultCountry + digits; // nacional MX
    return digits; // ya trae país
}

/** Devuelve últimos 10 dígitos (útil para MX local) */
function last10(raw) {
    const d = onlyDigits(raw);
    return d.slice(-10);
}

/** POST JSON (http/https nativo) */
function postJSON(urlString, data) {
    return new Promise((resolve, reject) => {
        try {
            const u = new URL(urlString);
            const body = JSON.stringify(data);
            const isHttps = u.protocol === 'https:';
            const lib = isHttps ? https : http;

            const options = {
                hostname: u.hostname,
                port: u.port || (isHttps ? 443 : 80),
                path: u.pathname + (u.search || ''),
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                },
                timeout: 10000
            };

            const req = lib.request(options, (res) => {
                let chunks = [];
                res.on('data', (c) => chunks.push(c));
                res.on('end', () => {
                    const text = Buffer.concat(chunks).toString('utf8');
                    resolve({ status: res.statusCode, body: text });
                });
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy(new Error('timeout'));
            });

            req.write(body);
            req.end();
        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Envía texto/media a un número que puede NO estar en contactos.
 * Retorna: { ok:boolean, reason?:string, to?:string }
 */
async function sendToNumber(client, rawNumber, text, opts = {}) {
    const e164 = toE164Digits(rawNumber, '52'); // cambia 52 si tu país base no es MX
    if (!e164) {
        console.log(`[${ts()}] ? numero_invalido | raw="${rawNumber}"`);
        return { ok: false, reason: 'numero_invalido' };
    }

    console.log(`[${ts()}] ? Envío     | numeroE164=${e164} | mensaje="${(text || '').replace(/\s+/g, ' ').slice(0, 200)}${text && text.length > 200 ? '…' : ''}"`);

    // Verifica si el número existe en WhatsApp
    const numberId = await client.getNumberId(e164);
    if (!numberId) {
        console.log(`[${ts()}] ? no_existe_en_whatsapp | e164=${e164}`);
        return { ok: false, reason: 'no_existe_en_whatsapp' };
    }

    const { archivoLocal, archivoUrl, caption } = opts;
    try {
        if (!archivoLocal && !archivoUrl) {
            await client.sendMessage(numberId._serialized, text || '');
            console.log(`[${ts()}] ? Enviado  | to=${numberId._serialized}`);
            return { ok: true, to: numberId._serialized };
        }

        let media = null;
        if (archivoLocal) {
            if (!fs.existsSync(archivoLocal)) {
                console.log(`[${ts()}] ? archivo_local_no_existe | ${archivoLocal}`);
                return { ok: false, reason: 'archivo_local_no_existe' };
            }
            console.log(`[${ts()}] ? Media    | local="${archivoLocal}" | caption="${(caption || text || '').slice(0, 120)}${(caption || text || '').length > 120 ? '…' : ''}"`);
            media = MessageMedia.fromFilePath(archivoLocal);
        } else if (archivoUrl) {
            console.log(`[${ts()}] ? Media    | url="${archivoUrl}" | caption="${(caption || text || '').slice(0, 120)}${(caption || text || '').length > 120 ? '…' : ''}"`);
            media = await MessageMedia.fromUrl(archivoUrl);
        }

        await client.sendMessage(numberId._serialized, media, { caption: caption || text || '' });
        console.log(`[${ts()}] ? Enviado  | to=${numberId._serialized}`);
        return { ok: true, to: numberId._serialized };
    } catch (err) {
        console.error(`[${ts()}] ? error_envio:`, err?.message || err);
        return { ok: false, reason: 'error_envio' };
    }
}

// -------------------------------------------------------------
/** Cliente WhatsApp */
// -------------------------------------------------------------
const client = new Client({
    authStrategy: new LocalAuth({ clientId: 'default' }), // sesión persistente en .wwebjs_auth
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

let isReady = false;

// QR para la primera vinculación
client.on('qr', (qr) => {
    console.log(`[${ts()}] Escanea el QR para vincular tu sesión:`);
    qrcode.generate(qr, { small: true });
});

// Listo
client.on('ready', async () => {
    isReady = true;
    console.log(`[${ts()}] ? Conexión exitosa con WhatsApp`);
	
 // ? NUEVO: obtener número de la sesión
  const myWid = client.info?.wid?._serialized || '';        // "5215511223344@c.us"
  const myDigits = onlyDigits(myWid);                        // "5215511223344"
  numeroConectadoE164 = myDigits || null;                    // con lada país
  numeroConectado10   = myDigits ? myDigits.slice(-10) : null; // 10 dígitos MX
  console.log(`[${ts()}] ?? Mi cuenta: wid=${myWid} | +${numeroConectadoE164} | local=${numeroConectado10}`);
  numeroConectado=numeroConectado10;
	
    try {
		await client.sendMessage(myWid, 'Te aviso. WhatsApp INICIADO');
        if (numeroInicio) await client.sendMessage(numeroInicio, 'Primer Aviso. WhatsApp INICIADO');
        if (numeroInicio2) await client.sendMessage(numeroInicio2, 'Segundo aviso. WhatsApp INICIADO');
    } catch (_) {}
});

// Auto-reply simple + NOTIFICACIÓN A TU API
client.on('message', async (message) => {
    // Evitar notificar mensajes de grupos (opcional)
    if (message.from.endsWith('@g.us')) return;

    // Log del mensaje entrante
    console.log(`[${ts()}] ? WhatsApp | from=${message.from} | body="${(message.body || '').replace(/\s+/g, ' ').slice(0, 200)}${message.body && message.body.length > 200 ? '…' : ''}"`);

    if (message.body.trim().toLowerCase() === '###') {
        console.log(`[${ts()}] Ping de: ${message.from}`);
        await client.sendMessage(message.from, 'Hola, aquí estoy al pendiente (RESPUESTA AUTOMÁTICA)');
    }

    // MENSAJE RECIBIDO. NOTIFICACIÓN A TU API . INICIO
    try {
        const numeroOrigen10   = last10(message.from);        // quien te escribió (10 dígitos MX)
        const numeroDestino10  = last10(numeroConectado);     // tu línea conectada (10 dígitos MX)

        const data = {
            Numero_origen:  numeroOrigen10,
            Numero_destino: numeroDestino10,
            Mensaje:        message.body || ''
        };

        console.log(`[${ts()}] ? Notificar API | ${url_notificacion} | ${JSON.stringify(data)}`);

        // Disparo no bloqueante (si falla, solo se loguea)
        postJSON(url_notificacion, data)
            .then(r => {
                console.log(`[${ts()}] ? API resp | status=${r.status} | body=${(r.body || '').slice(0, 200)}${r.body && r.body.length > 200 ? '…' : ''}`);
            })
            .catch(err => {
                console.error(`[${ts()}] ? API err  | ${err?.message || err}`);
            });

    } catch (err) {
        console.error(`[${ts()}] ? notificacion_api_error:`, err?.message || err);
    }
    // MENSAJE RECIBIDO. NOTIFICACIÓN A TU API . FIN
});

// Manejo básico de errores para no tumbar el proceso
process.on('unhandledRejection', (r) => console.error(`[${ts()}] ? unhandledRejection:`, r));
process.on('uncaughtException', (e) => console.error(`[${ts()}] ? uncaughtException:`, e));

client.initialize();

// -------------------------------------------------------------
/** Servidor HTTP */
// Body esperado (JSON):
// {
//   "numero": "8111223344" | "528111223344" | "+528111223344",
//   "mensaje": "Texto",
//   "Archivo_local": "C:\\ruta\\archivo.pdf",   (opcional)
//   "Archivo_url": "https://dominio/imagen.png" (opcional),
//   "caption": "Texto para media"               (opcional)
// }
// -------------------------------------------------------------
const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const buffers = [];
    for await (const chunk of req) buffers.push(chunk);
    const body = Buffer.concat(buffers).toString('utf8').trim();

    console.log(`[${ts()}] ? Petición recibida. Body: ${body || '(vacío)'}`);

    if (!isReady) {
        res.statusCode = 503;
        return res.end(JSON.stringify({ ok: false, message: 'whatsapp_no_listo' }));
    }

    if (!body) {
        res.statusCode = 200;
        return res.end(JSON.stringify({ ok: true, message: 'Servidor de Whatsapp en línea' }));
    }

    // Parse JSON
    let payload;
    try {
        payload = JSON.parse(body.replace(/\n/g, ' '));
    } catch (err) {
        console.log(`[${ts()}] ? json_invalido: ${err?.message || err}`);
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok: false, message: 'json_invalido' }));
    }

    // Campos (acepta alias comunes)
    const numeroEntrada = payload.numero ?? payload.Numero ?? payload.phone ?? payload.to ?? null;
    const mensajeEntrada = payload.mensaje ?? payload.Mensaje ?? payload.text ?? '';
    const Archivo_local = payload.Archivo_local ?? payload.archivo_local ?? payload.filePath ?? null;
    const Archivo_url = payload.Archivo_url ?? payload.archivo_url ?? payload.fileUrl ?? null;
    const caption = payload.caption ?? payload.titulo ?? null;

    // Log del número y mensaje TAL CUAL llegaron
    console.log(
        `[${ts()}] ? Entrante | numero=${numeroEntrada ?? '(null)'} | ` +
        `mensaje="${(mensajeEntrada || '').replace(/\s+/g, ' ').slice(0, 200)}${mensajeEntrada && mensajeEntrada.length > 200 ? '…' : ''}"`
    );

    if (!numeroEntrada) {
        res.statusCode = 422;
        return res.end(JSON.stringify({ ok: false, message: 'numero_requerido' }));
    }

    // Envío
    try {
        const result = await sendToNumber(client, numeroEntrada, mensajeEntrada, {
            archivoLocal: Archivo_local,
            archivoUrl: Archivo_url,
            caption
        });

        // Respondemos 200 aunque no exista en WhatsApp para evitar reintentos infinitos del integrador
        res.statusCode = 200;
        if (!result.ok) {
            return res.end(JSON.stringify({
                ok: false,
                numero: numeroEntrada,
                reason: result.reason || 'desconocido'
            }));
        }

        return res.end(JSON.stringify({ ok: true, numero: result.to, message: 'enviado' }));
    } catch (err) {
        console.log(`[${ts()}] ? error_interno:`, err?.message || err);
        res.statusCode = 500;
        return res.end(JSON.stringify({ ok: false, message: 'error_interno' }));
    }
});

server.listen(port, hostname, () => {
    console.log(`[${ts()}] HTTP escuchando en http://${hostname}:${port}/`);
});
