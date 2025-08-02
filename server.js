const express = require('express');
const cors = require('cors'); // <-- 1. IMPORTA CORS
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');

// --- Configuración de CORS ---
// 2. DEFINE LAS OPCIONES DE CORS
const corsOptions = {
  origin: 'https://meet-front.onrender.com', // La URL de tu frontend
  methods: ['GET', 'POST']
};

app.use(cors(corsOptions)); // <-- 3. APLICA CORS A TODA LA APP DE EXPRESS

// --- Configuración de Socket.IO (ya la tenías bien, pero usamos las mismas opciones) ---
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
  socket.on('join-room', (roomId, userId, userName) => {
    socket.join(roomId);

    if (!usersInRoom[roomId]) {
      usersInRoom[roomId] = [];
    }

    // Envía la lista de usuarios existentes solo al nuevo usuario
    socket.emit('all-users', usersInRoom[roomId]);

    // Añade el nuevo usuario a la lista y notifica a los demás
    usersInRoom[roomId].push({ userId, userName });
    socket.to(roomId).emit('user-joined', { userId, userName });

    socket.on('message', message => {
      io.to(roomId).emit('createMessage', message, userName);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected: ' + userName + ' (' + userId + ')');
      usersInRoom[roomId] = usersInRoom[roomId].filter(user => user.userId !== userId);
      socket.to(roomId).emit('user-disconnected', userId, userName);
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});