const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { ExpressPeerServer } = require('peer');

const app = express();
const server = http.createServer(app);

// Configuración de CORS para Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/myapp'
});

app.use('/peerjs', peerServer);

// Objeto para mantener un registro de los usuarios en cada sala
const usersInRooms = {};

io.on('connection', socket => {
  console.log('Nuevo usuario conectado a Socket.IO:', socket.id);

  socket.on('join-room', (roomId, userId, userName) => {
    socket.join(roomId);

    // Almacenar el usuario en la sala
    if (!usersInRooms[roomId]) {
      usersInRooms[roomId] = {};
    }

    // Informar a los usuarios existentes que un nuevo usuario se unió
    // y darle al nuevo usuario la lista de los usuarios existentes
    const existingUsers = Object.values(usersInRooms[roomId]);

    // Informar al nuevo usuario sobre los usuarios ya en la sala
    socket.emit('all-users', existingUsers);

    // Añadir el nuevo usuario a la lista después de informarle a él
    usersInRooms[roomId][socket.id] = { userId, userName };

    // Informar a los demás en la sala (excepto al que acaba de unirse)
    socket.to(roomId).emit('user-joined', { userId, userName });

    console.log(`Usuario ${userName} (${userId}) se unió a la sala ${roomId}`);

    // Escucha los mensajes de chat
    socket.on('message', (message) => {
      io.to(roomId).emit('createMessage', message, userName);
    });

    // Gestiona la desconexión de un usuario
    socket.on('disconnect', () => {
      console.log(`Usuario ${userName} (${userId}) desconectado.`);
      // Eliminar al usuario del registro
      delete usersInRooms[roomId][socket.id];
      // Notificar a los demás que el usuario se ha desconectado
      socket.to(roomId).emit('user-disconnected', userId, userName);
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
