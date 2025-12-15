const express = require('express');
const cors = require('cors'); 
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');

// --- Configuración de CORS ---
// NOTA: Para un despliegue en Render/producción, esta URL debe ser la de tu frontend.
// Para desarrollo local, podrías necesitar cambiarla a 'http://localhost:3000' u otras.
const corsOptions = {
    origin: 'https://meet-front.onrender.com', // La URL de tu frontend
    methods: ['GET', 'POST']
};
 
app.use(cors(corsOptions)); 

// --- Configuración de Socket.IO ---
const io = require('socket.io')(server, {
    cors: corsOptions 
});

// --- Configuración de PeerJS ---
// CORRECCIÓN CLAVE: Se monta PeerJS en la ruta raíz ('/') en lugar de '/peerjs' 
// para que coincida con la configuración del cliente en App.js (path: '/') y 
// evitar errores 404 en el servidor de Render.
const peerServer = ExpressPeerServer(server, {
    path: '/myapp' // El path interno de PeerJS, pero la URL de montaje es la siguiente línea.
});
app.use('/', peerServer); // CAMBIO: Montaje en la raíz

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

        // Enviar la lista de usuarios existentes al nuevo usuario
        socket.emit('all-users', usersInRoom[roomId]);

        usersInRoom[roomId].push({ userId, userName });
        
        // Informar a los demás usuarios sobre la nueva conexión
        socket.to(roomId).emit('user-connected', userId, userName);
        
        console.log(`Usuario ${userName} (${userId}) se unió a la sala ${roomId}`);
    });
    
    // Nuevo evento para solicitar información de un usuario
    socket.on('get-user-info', (targetUserId) => {
        // Encontrar la información del usuario que está solicitando
        const userInfo = usersInRoom[socket.room]?.find(u => u.userId === socket.userId);
        if (userInfo) {
            // Enviar la información de vuelta al usuario que realizó la llamada (targetUserId)
            socket.to(targetUserId).emit('user-info', { userId: socket.userId, userName: userInfo.userName });
        }
    });

    // Evento de chat
    socket.on('chat-message', (message) => {
        // Reenviar el mensaje a todos en la sala, incluido el emisor
        io.to(socket.room).emit('chat-message', message);
    });

    // Evento de reacción (emojis)
    socket.on('reaction', (emoji) => {
        io.to(socket.room).emit('reaction', socket.userId, emoji);
        console.log(`Reacción de ${socket.userName} en la sala ${socket.room}: ${emoji}`);
    });

    socket.on('screen-share-started', () => {
        io.to(socket.room).emit('screen-share-active', socket.userId, socket.userName);
        console.log(`${socket.userName} inició la compartición de pantalla.`);
    });

    socket.on('stop-screen-share', () => {
        io.to(socket.room).emit('screen-share-inactive', socket.userId);
        console.log(`${socket.userName} detuvo la compartición de pantalla.`);
    });

    // Nuevo evento para cambiar el tema
    socket.on('change-theme', (theme) => {
        // Emitir el cambio de tema a todos en la misma sala, incluido el emisor
        io.to(socket.room).emit('theme-changed', theme);
        console.log(`Tema cambiado a ${theme} en la sala ${socket.room} por ${socket.userName}`);
    });


    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.userName + ' (' + socket.userId + ')');
        if (socket.room && socket.userId) { 
            // Eliminar al usuario de la lista
            usersInRoom[socket.room] = usersInRoom[socket.room].filter(user => user.userId !== socket.userId);
            // Notificar a los demás usuarios
            socket.to(socket.room).emit('user-disconnected', socket.userId, socket.userName);
            console.log(`Usuario ${socket.userName} (${socket.userId}) abandonó la sala ${socket.room}.`);
        }
    });
});

const PORT = process.env.PORT || 9000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});