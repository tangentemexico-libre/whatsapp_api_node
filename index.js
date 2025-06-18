// Nombre del archivo: index.js

// Inicializar proyecto NODE 
// npm init -y
// npm install whatsapp-web.js
// npm install qrcode-terminal


/**
 * Bot para whatsapp
 * web: https://kuatroestrellas.github.io/blog/
 * responde al hola mundo con un mensaje
 * requiere nodejs v12 o superior y las librerias qrcode-terminal y whatsapp-web.js
 * npm i qrcode-terminal whatsapp-web.js
**/

const {
    MessageMedia
} = require('whatsapp-web.js');

const qrcode = require('qrcode-terminal');
var http = require('http');
const hostname = '127.0.0.1';
const port = process.env.PUERTO || 8086; // Elige el puerto que tu quieras
const numeroInicio  ="5215544332211@c.us";
const numeroInicio2 =""; // en caso que quieras avisar a otra persona




//Crea una sesi¢n con whatsapp-web y la guarda localmente para autenticarse solo una vez por QR
const { Client, LocalAuth } = require('whatsapp-web.js');
const client = new Client({
    authStrategy: new LocalAuth()
});

//Genera el c¢digo qr para conectarse a whatsapp-web
client.on('qr', qr => {
    qrcode.generate(qr, {small: true});
});

//Si la conexi¢n es exitosa muestra el mensaje de conexi¢n exitosa
client.on('ready', () => {
    console.log('Conexion exitosa con Whatsapp');
	client.sendMessage(numeroInicio, 'Servicio Whatsapp INICIADO ');
	if (numeroInicio2 !="")
		client.sendMessage(numeroInicio2, 'Servicio Whatsapp INICIADO ');
});



//Aqu¡ sucede la magia, escucha los mensajes y aqu¡ es donde se manipula lo que queremos que haga el bot
client.on('message', message => {
    
// 	console.log(message.body);
	if(message.body === '###')
	{
		console.log("Remitente:"+message.from);
		client.sendMessage(message.from, 'Hola, aqui estoy al pendiente ( RESPUESTA AUTOMATICA )');
	}
});

client.initialize();

// -- servidor web


   
async function isContactSaved(numero) {
    const contacts = await client.getContacts();
    return contacts.some(contact => contact.id._serialized === numero);
}



const server = http.createServer(async(req, res) => {
    res.statusCode = 200;
    //res.setHeader('Content-Type', 'text/plain');
    //res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    let fecha = new Date();

    console.log("--------------------- " + fecha.toLocaleDateString() + " " + fecha.toTimeString())

    let html = "Servidor de Whatsapp. En l¡nea";

    const buffers = [];

    for await(const chunk of req) {
        buffers.push(chunk);
    }

    const data_buff = Buffer.concat(buffers).toString();

    if (data_buff.length > 0) {
       let data = data_buff.replaceAll("\n", " ");
       

        console.log(data);
        let data_obj = {
            numero: null,
            mensaje: null
        };
        try {
            data_obj = JSON.parse(data);
        } catch (error) {
            data_obj = {
                numero: null,
                mensaje: null
            };
            console.log("********ERROR PARSE**********");
            console.log(error);
        }
		const delay = ms => new Promise(resolve => setTimeout(resolve, ms));


        if (data_obj != null && data_obj.numero != null && data_obj.mensaje != null) {

            console.log(data_obj);

            let numero = data_obj.numero;
            const chatId = numero + "@c.us";
            let message = data_obj.mensaje;
            console.log(chatId + "," + message);

            try {

                if (data_obj.Archivo_local == null && data_obj.Archivo_url == null) {
                     const contactExists = await isContactSaved(chatId);
                    if (contactExists) {
                        client.sendMessage(chatId, message);
                    } else {
                       // client.sendMessage(chatId, 'Este n£mero no est  en mis contactos.');
                    }
					await delay(5000);
//  		    client.sendMessage(numeroInicio, "copia:["+chatId+"]"+message);
                } else {
                    console.log("Tiene archivo!!");
					//client.sendMessage(numeroInicio, "Archivo- copia:["+chatId+"]"+message);

                    if (data_obj.Archivo_local != null) {
                        const media = MessageMedia.fromFilePath(data_obj.Archivo_local);
						const contactExists = await isContactSaved(chatId);
						 if (contactExists) {
                          await client.sendMessage(chatId, media, {
                            caption: message
                        })
                        .then((res) => console.log("Succesfully sent."))
                        .catch((error) => console.log("Can not send message. " + error))
						await delay(5000);
                    } else {
                      //  client.sendMessage(chatId, 'Este n£mero no est  en mis contactos.');
                    }

                       
                    } else {
                        const media = await MessageMedia.fromUrl(data_obj.Archivo_url);
						const contactExists = await isContactSaved(chatId);
                        if (contactExists) {
                          await client.sendMessage(chatId, media, {
                            caption: message
                        })
                        .then((res) => console.log("Succesfully sent."))
                        .catch((error) => console.log("Can not send message. " + error))
						await delay(5000);
                    } else {
                      //  client.sendMessage(chatId, 'Este n£mero no est  en mis contactos.');
                    }
                    }

                }

                //html+="Parametros RECIBIDOS."+data;
                html = '{"Number":1,"Message":"Valores recibidos","data":' + data + '}';
            } catch (error) {
                console.log("********ERROR 22222 **********");
                console.log(error);
                html = '{"Number":-1,"Message":"Error con datos recibidos","data":' + data + '}';
            }

            res.setHeader('Content-Type', 'application/json; charset=utf-8');
        } else {
            html += " ### Parametros incompletos ###";
        }
    } else {
        console.log(" sin data ");
    }



    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end(html);
});


server.listen(port, hostname, () => {
	console.log(`El servidor se est  ejecutando en http://${hostname}:${port}/`);
});