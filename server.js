const express = require('express');
const cors = require('cors'); 
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');

// --- Configuración de CORS MULTI-ORIGEN (CRUCIAL) ---

// Lista de orígenes permitidos.
// AÑADE AQUÍ todas las URLs desde donde tus clientes se conectan.
const ALLOWED_ORIGINS = [
    "http://localhost:3000",                         // 1. Desarrollo local de React/HTML
    "https://meet-front.onrender.com",               // 2. El frontend principal de React (si esta es la URL)
    "https://meet-clone-v0ov.onrender.com",          // 3. La URL de tu backend (necesaria para el cliente Lite/Canvas)
    "https://mundi-link-lite.onrender.com",           // 4. Cualquier otra URL de despliegue
];

const corsOptions = {
    // Permitir múltiples orígenes
    origin: ALLOWED_ORIGINS, 
    methods: ['GET', 'POST'],
    credentials: true // Es buena práctica incluirlo para WebRTC
};

app.use(cors(corsOptions)); 

// --- Configuración de Socket.IO ---
const io = require('socket.io')(server, {
    cors: corsOptions,
    // La configuración de transports es redundante aquí, pero se mantiene si usas Socket.io v2/v3
});

// --- Configuración de PeerJS ---
const peerServer = ExpressPeerServer(server, {
    path: '/myapp' // El path que el cliente debe usar, se accede como [URL]/peerjs/myapp
});
app.use('/peerjs', peerServer);

// --- Lógica de la aplicación ---
const usersInRoom = {};

io.on('connection', socket => {
    console.log('Nuevo usuario conectado:', socket.id);

    socket.on('join-room', (roomId, userId, userName) => {
        socket.join(roomId);
        socket.userId = userId; 
        socket.userName = userName; 
        socket.room = roomId; 

        if (!usersInRoom[roomId]) {
            usersInRoom[roomId] = [];
        }

        socket.emit('all-users', usersInRoom[roomId]);

        // Asegúrate de que el usuario no exista antes de agregarlo (manejo de reconexión)
        const userExists = usersInRoom[roomId].some(user => user.userId === userId);
        if (!userExists) {
            usersInRoom[roomId].push({ userId, userName });
            // Notificar a los demás que un nuevo usuario se ha unido
            socket.to(roomId).emit('user-joined', { userId, userName });
        }
        
        console.log(`${userName} (${userId}) se unió a la sala: ${roomId}`);

    });
    
    // [EVENTOS DE COMUNICACIÓN]

    socket.on('message', (message) => {
        // Enviar mensaje al resto de usuarios de la sala (excluyendo al remitente)
        socket.to(socket.room).emit('createMessage', message, socket.userName);
    });

    socket.on('emoji-reaction', (emoji) => {
        // Enviar reacción a todos, incluido el remitente
        io.to(socket.room).emit('user-reaction', socket.userId, emoji);
        console.log(`Reacción de ${socket.userName} en la sala ${socket.room}: ${emoji}`);
    });

    socket.on('screen-share-started', () => {
        // Notifica a todos, incluido el remitente (para que el frontend lo maneje)
        io.to(socket.room).emit('screen-share-active', socket.userId, socket.userName);
        console.log(`${socket.userName} inició la compartición de pantalla.`);
    });

    socket.on('stop-screen-share', () => {
        // Notifica a todos
        io.to(socket.room).emit('screen-share-inactive', socket.userId);
        console.log(`${socket.userName} detuvo la compartición de pantalla.`);
    });

    // Nuevo evento para cambiar el tema
    socket.on('change-theme', (theme) => {
        // Emitir el cambio de tema a todos en la misma sala, incluido el emisor
        io.to(socket.room).emit('theme-changed', theme);
        console.log(`Tema cambiado a ${theme} en la sala ${socket.room} por ${socket.userName}`);
    });


    // [EVENTO DE DESCONEXIÓN]
    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.userName + ' (' + socket.userId + ')');
        if (socket.room && socket.userId) { 
            // Filtrar y remover al usuario de la lista de usuarios en la sala
            usersInRoom[socket.room] = usersInRoom[socket.room].filter(user => user.userId !== socket.userId);
            
            // Notificar a los demás
            socket.to(socket.room).emit('user-disconnected', socket.userId, socket.userName);
            console.log(`Usuario ${socket.userName} (${socket.userId}) salió de ${socket.room}. Restantes: ${usersInRoom[socket.room].length}`);
        }
    });
});

// --- INICIO DEL SERVIDOR ---

const port = process.env.PORT || 9000; // Usamos un puerto genérico (Render lo asignará)

server.listen(port, () => {
    console.log(`Servidor corriendo en puerto ${port}`);
    console.log('Orígenes CORS permitidos:', ALLOWED_ORIGINS.join(', '));
});