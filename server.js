const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
const { ExpressPeerServer } = require('peer');

const peerServer = ExpressPeerServer(server, {
  path: '/myapp'
});
app.use('/peerjs', peerServer);

// Este servidor solo manejará las conexiones, por lo que no necesita servir archivos estáticos.
// En Render, el servicio estático se encargará de ello.

const usersInRoom = {};

io.on('connection', socket => {
  socket.on('join-room', (roomId, userId, userName) => {
    socket.join(roomId);

    if (!usersInRoom[roomId]) {
      usersInRoom[roomId] = [];
    }

    socket.emit('all-users', usersInRoom[roomId]);

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
