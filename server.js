const express = require('express');
const cors = require('cors');
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');

const corsOptions = {
    origin: 'https://meet-front.onrender.com',
    methods: ['GET', 'POST']
};

app.use(cors(corsOptions));
app.use(express.json());

// Configuración de Socket.IO con las opciones de CORS
const io = require('socket.io')(server, {
    cors: corsOptions
});

const peerServer = ExpressPeerServer(server, {
    path: '/myapp'
});
app.use('/peerjs', peerServer);

io.on('connection', socket => {
    socket.on('join-room', (roomId, userId, userName) => {
        console.log(`[Socket] Usuario ${userName} (${userId}) se unió a la sala ${roomId}.`);
        socket.join(roomId);

        // Notifica a los demás en la sala sobre el nuevo usuario
        socket.to(roomId).emit('user-connected', { userId, userName });

        socket.on('disconnect', () => {
            console.log(`[Socket] Usuario ${userName} (${userId}) se desconectó.`);
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor de señalización y WebRTC escuchando en el puerto ${PORT}`);
});