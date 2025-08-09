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

        usersInRoom[roomId].push({ userId, userName });
        socket.to(roomId).emit('user-joined', { userId, userName });
        console.log(`Usuario ${userName} (${userId}) se unió a la sala ${roomId}`);
    });

    socket.on('message', message => {
        io.to(socket.room).emit('createMessage', message, socket.userName);
        console.log(`Mensaje de ${socket.userName} en ${socket.room}: ${message}`);
    });

    socket.on('reaction', (emoji) => {
        io.to(socket.room).emit('reaction-received', emoji, socket.userName);
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


    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.userName + ' (' + socket.userId + ')');
        if (socket.room && socket.userId) { 
            usersInRoom[socket.room] = usersInRoom[socket.room].filter(user => user.userId !== socket.userId);
            socket.to(socket.room).emit('user-disconnected', socket.userId, socket.userName);
            console.log(`Usuario ${socket.userName} (${socket.userId}) se desconectó de la sala ${socket.room}`);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});