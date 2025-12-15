const express = require('express');
const cors = require('cors'); 
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');
const { Server } = require("socket.io"); // Usar el import moderno de Server

// --- Configuración de CORS ---
const corsOptions = {
    origin: 'https://meet-front.onrender.com', // La URL de tu frontend
    methods: ['GET', 'POST']
};

app.use(cors(corsOptions)); 

// --- Configuración de Socket.IO ---
// Usar el constructor de Server de socket.io para mejor configuración
const io = new Server(server, {
    cors: corsOptions,
    // Es buena práctica especificar el path de socket.io, aunque no es el problema actual
    path: '/socket.io/' 
});

// --- Configuración de PeerJS ---
const peerServer = ExpressPeerServer(server, {
    path: '/myapp', // Esta es la ruta base interna de PeerServer
    allow_discovery: true // Permite que el servidor PeerJS liste los IDs (útil para debug)
});
// La ruta final de PeerJS será /peerjs/myapp
app.use('/peerjs', peerServer);

// Endpoint simple para verificar si el servidor está vivo
app.get('/', (req, res) => {
    res.send('Meet-Clone Server is Running!');
});


// --- Lógica de la aplicación ---
// Usaremos un objeto de objetos para almacenar a los usuarios, indexados por Peer ID
const usersInRoom = {}; 

io.on('connection', socket => {
    console.log('Nuevo usuario conectado:', socket.id);

    socket.on('join-room', (roomId, userId, userName, initialStatus = {}) => {
        socket.join(roomId);
        socket.userId = userId; 
        socket.userName = userName; 
        socket.room = roomId; 

        if (!usersInRoom[roomId]) {
            usersInRoom[roomId] = {};
        }

        const newUser = { 
            userId, 
            name: userName, 
            socketId: socket.id, 
            ...initialStatus 
        };

        // 1. Notificar a TODOS (incluido el emisor) el estado actual de la sala
        // Antes de agregar al nuevo usuario (para que el nuevo sepa a quién llamar)
        const currentUsers = { ...usersInRoom[roomId] };
        
        // 2. Agregar al nuevo usuario a la lista
        usersInRoom[roomId][userId] = newUser;
        
        // 3. Emitir el estado COMPLETO a todos
        // Al nuevo usuario: para que sepa a quién llamar
        socket.emit('room-state', currentUsers); 

        // A los usuarios existentes: para que sepan que el nuevo usuario se ha unido y puedan llamarlo
        socket.to(roomId).emit('user-connected', userId, userName);
        
        // 4. Actualizar el estado de la sala para todos (útil si hay un nuevo usuario)
        // Podríamos también emitir el estado completo de nuevo, pero user-connected es más ligero
        
        console.log(`Usuario ${userName} (${userId}) se unió a la sala ${roomId}.`);
    });

    socket.on('update-status', (status) => {
        if (socket.room && socket.userId) {
            // Actualizar el estado localmente
            if (usersInRoom[socket.room] && usersInRoom[socket.room][socket.userId]) {
                usersInRoom[socket.room][socket.userId] = { 
                    ...usersInRoom[socket.room][socket.userId], 
                    ...status 
                };
            }
            
            // Notificar a todos los demás en la sala
            socket.to(socket.room).emit('user-status-update', socket.userId, status);
            console.log(`Estado actualizado para ${socket.userName}: ${JSON.stringify(status)}`);
        }
    });

    socket.on('chat-message', (message) => {
        if (socket.room) {
            // Reenviar el mensaje a todos los demás en la sala
            socket.to(socket.room).emit('chat-message', message);
            console.log(`Mensaje de chat de ${socket.userName} en ${socket.room}: ${message.text}`);
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.userName + ' (' + socket.userId + ')');
        if (socket.room && socket.userId) { 
            
            // Eliminar al usuario de la sala
            if (usersInRoom[socket.room]) {
                delete usersInRoom[socket.room][socket.userId];
            }

            // Notificar a los demás que el usuario se ha desconectado
            socket.to(socket.room).emit('user-disconnected', socket.userId, socket.userName);
            console.log(`Usuario ${socket.userName} (${socket.userId}) ha abandonado la sala ${socket.room}.`);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server corriendo en el puerto ${PORT}`);
});