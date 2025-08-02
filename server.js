const express = require('express');
const cors = require('cors'); 
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');

// --- Configuración de CORS ---
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
const peerServer = ExpressPeerServer(server, {
    path: '/myapp'
});
app.use('/peerjs', peerServer);

// --- Lógica de la aplicación ---
// Almacena los usuarios en cada sala (mejorado para guardar userId y userName en el socket)
const usersInRoom = {};

io.on('connection', socket => {
    console.log('Nuevo usuario conectado:', socket.id);

    socket.on('join-room', (roomId, userId, userName) => {
        socket.join(roomId);
        // Almacena la información del usuario y la sala directamente en el objeto socket
        socket.userId = userId; 
        socket.userName = userName; 
        socket.room = roomId; 

        if (!usersInRoom[roomId]) {
            usersInRoom[roomId] = [];
        }

        // Envía la lista de usuarios existentes solo al nuevo usuario
        socket.emit('all-users', usersInRoom[roomId]);

        // Añade el nuevo usuario a la lista y notifica a los demás
        usersInRoom[roomId].push({ userId, userName });
        socket.to(roomId).emit('user-joined', { userId, userName });
        console.log(`Usuario ${userName} (${userId}) se unió a la sala ${roomId}`);
    });

    // Cuando un usuario envía un mensaje de chat
    socket.on('message', message => {
        // Usa socket.userName que ya está almacenado
        io.to(socket.room).emit('createMessage', message, socket.userName);
        console.log(`Mensaje de ${socket.userName} en ${socket.room}: ${message}`);
    });

    // --- ¡NUEVO! Manejar reacciones ---
    socket.on('reaction', (emoji) => {
        // Emite la reacción (emoji y nombre del usuario) a todos en la sala
        io.to(socket.room).emit('reaction-received', emoji, socket.userName);
        console.log(`Reacción de ${socket.userName} en la sala ${socket.room}: ${emoji}`);
    });

    // Puedes añadir eventos para compartir pantalla si tu frontend los emite
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
        if (socket.room && socket.userId) { // Asegúrate de que los datos existen antes de filtrar
            usersInRoom[socket.room] = usersInRoom[socket.room].filter(user => user.userId !== socket.userId);
            // Notifica a los demás usuarios en la sala que alguien se desconectó
            socket.to(socket.room).emit('user-disconnected', socket.userId, socket.userName);
            console.log(`Usuario ${socket.userName} (${socket.userId}) se desconectó de la sala ${socket.room}`);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});
