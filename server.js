const express = require('express');
const cors = require('cors');
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');

// --- Configuración de CORS --
// *** CORRECCIÓN CRÍTICA: Cambiado el origen a '*' para evitar problemas de conexión en Render. ***
const corsOptions = {
    origin: '*', // Permitir todas las solicitudes para garantizar la conexión del frontend
    methods: ['GET', 'POST']
};

app.use(cors(corsOptions));

// --- Configuración de Socket.IO ---
const io = require('socket.io')(server, {
    cors: corsOptions
});

// --- Configuración de PeerJS ---
// *** CORRECCIÓN: Alineado el path interno a '/peerjs' para coincidir con la configuración del cliente. ***
const peerServer = ExpressPeerServer(server, {
    path: '/peerjs' // Asegura la consistencia con app.use
});
app.use('/peerjs', peerServer); // El cliente debe conectarse a /peerjs

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

        // Informar al usuario que se une sobre los usuarios existentes
        socket.emit('all-users', usersInRoom[roomId]);

        // Agregar el nuevo usuario y emitir a la sala
        usersInRoom[roomId].push({ userId, userName });
        socket.to(roomId).emit('user-connected', userId, userName);

        console.log(`Usuario ${userName} (${userId}) se unió a la sala ${roomId}`);

        // Opcional: Mantener la lista de usuarios actualizada
        io.to(roomId).emit('update-user-list', usersInRoom[roomId]);
    });

    // Evento de Chat
    socket.on('send-chat-message', ({ roomId, message, senderId, senderName, timestamp }) => {
        // Emitir a todos en la sala EXCEPTO al emisor
        socket.to(roomId).emit('chat-message', { message, senderId, senderName, timestamp });
        console.log(`Mensaje de ${senderName} en la sala ${roomId}: ${message}`);
    });

    // Evento para cambiar el tema
    socket.on('change-theme', (roomId, theme) => { // El cliente envía roomId y theme
        // *** CORRECCIÓN: La emisión usa 'theme-change' para coincidir con el listener del cliente. ***
        // Emitir el cambio de tema a todos en la misma sala, incluido el emisor
        io.to(roomId).emit('theme-change', theme);
        console.log(`Tema cambiado a ${theme} en la sala ${roomId} por ${socket.userName}`);
    });

    // Eventos de Screen Share (mantenerlos por si se usan)
    socket.on('screen-share-started', () => {
        io.to(socket.room).emit('screen-share-active', socket.userId, socket.userName);
        console.log(`${socket.userName} inició la compartición de pantalla.`);
    });

    socket.on('stop-screen-share', () => {
        io.to(socket.room).emit('screen-share-inactive', socket.userId);
        console.log(`${socket.userName} detuvo la compartición de pantalla.`);
    });


    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.userName + ' (' + socket.userId + ')');
        if (socket.room && socket.userId) {
            // Filtrar y remover el usuario de la lista
            usersInRoom[socket.room] = usersInRoom[socket.room].filter(user => user.userId !== socket.userId);

            // Notificar a los demás
            socket.to(socket.room).emit('user-disconnected', socket.userId, socket.userName);
            console.log(`Usuario ${socket.userName} (${socket.userId}) abandonó la sala ${socket.room}`);

            // Opcional: Actualizar la lista de usuarios
            io.to(socket.room).emit('update-user-list', usersInRoom[socket.room]);
        }
    });
});

// --- Iniciar Servidor ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));