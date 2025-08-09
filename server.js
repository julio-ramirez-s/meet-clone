const express = require('express');
const cors = require('cors');
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');
const io = require('socket.io')(server);

const corsOptions = {
    origin: 'https://meet-front.onrender.com',
    methods: ['GET', 'POST']
};

app.use(cors(corsOptions));
app.use(express.json());

const peerServer = ExpressPeerServer(server, {
    path: '/myapp'
});

app.use('/peerjs', peerServer);

io.on('connection', socket => {
    socket.on('join-room', (roomId, userId) => {
        console.log(`[Socket] Usuario ${userId} se unió a la sala ${roomId}.`);
        socket.join(roomId);

        socket.to(roomId).emit('user-connected', userId);

        socket.on('disconnect', () => {
            console.log(`[Socket] Usuario ${userId} se desconectó.`);
            socket.to(roomId).emit('user-disconnected', userId);
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});