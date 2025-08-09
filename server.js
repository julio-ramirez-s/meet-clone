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

// --- Middleware para parsear JSON en el cuerpo de las solicitudes HTTP ---
app.use(express.json());

// --- Configuración de Socket.IO ---
const io = require('socket.io')(server, {
    cors: corsOptions 
});

// --- Configuración de PeerJS ---
const peerServer = ExpressPeerServer(server, {
    path: '/myapp' // Asegúrate de que este path coincida con la configuración del cliente
});
app.use('/peerjs', peerServer);

// --- Almacenamiento de usuarios en memoria (NO USAR EN PRODUCCIÓN) ---
const users = {}; // { username: { password, accessCode } }

// --- Rutas de Autenticación HTTP ---
app.post('/register', (req, res) => {
    const { username, password, accessCode } = req.body;

    if (!username || !password || !accessCode) {
        return res.status(400).json({ message: 'Nombre de usuario, contraseña y código de acceso son requeridos.' });
    }

    if (users[username]) {
        return res.status(409).json({ message: 'El nombre de usuario ya existe.' });
    }

    users[username] = { password, accessCode };
    console.log(`Usuario registrado: ${username}`);
    return res.status(201).json({ message: 'Registro exitoso. Ahora puedes iniciar sesión.' });
});

app.post('/login', (req, res) => {
    const { username, password, accessCode } = req.body;

    if (!username || !password || !accessCode) {
        return res.status(400).json({ message: 'Nombre de usuario, contraseña y código de acceso son requeridos.' });
    }

    const user = users[username];
    if (user && user.password === password && user.accessCode === accessCode) {
        // En una aplicación real, aquí generarías un token JWT
        return res.status(200).json({ message: 'Inicio de sesión exitoso.', username });
    } else {
        return res.status(401).json({ message: 'Credenciales inválidas.' });
    }
});


// --- Lógica de la aplicación Socket.IO ---
const usersInRoom = {}; // { roomId: [{ userId, userName }, ...] }

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

        // Emitir a solo el usuario que se une la lista de usuarios existentes en la sala
        socket.emit('room-users', { users: usersInRoom[roomId] });

        usersInRoom[roomId].push({ userId, userName });
        
        // Emitir a todos en la sala (excepto al que se acaba de unir) que un nuevo usuario se unió
        socket.to(roomId).emit('user-joined', { userId, userName });

        console.log(`Usuario ${userName} (${userId}) se unió a la sala ${roomId}.`);
        console.log(`Usuarios en la sala ${roomId}:`, usersInRoom[roomId].map(u => u.userName));
    });

    // Evento para recibir y retransmitir mensajes de chat
    socket.on('message', message => {
        io.to(socket.room).emit('createMessage', message, socket.userName);
        console.log(`Mensaje de ${socket.userName} en ${socket.room}: ${message}`);
    });

    // Evento para recibir y retransmitir reacciones
    socket.on('reaction', (emoji) => {
        io.to(socket.room).emit('reaction-received', emoji, socket.userName);
        console.log(`Reacción de ${socket.userName} en la sala ${socket.room}: ${emoji}`);
    });

    // Evento cuando un usuario inicia la compartición de pantalla
    socket.on('start-screen-share', (userId, userName) => {
        io.to(socket.room).emit('user-started-screen-share', { userId, userName });
        console.log(`${userName} inició la compartición de pantalla.`);
    });

    // Evento cuando un usuario detiene la compartición de pantalla
    socket.on('stop-screen-share', (userId) => {
        io.to(socket.room).emit('user-stopped-screen-share', userId);
        console.log(`${socket.userName} detuvo la compartición de pantalla.`);
    });

    // Nuevo evento para manejar el cambio de tema
    socket.on('change-theme', (theme) => {
        io.to(socket.room).emit('theme-changed', theme);
        console.log(`Tema cambiado a ${theme} por ${socket.userName} en la sala ${socket.room}.`);
    });


    socket.on('disconnect', () => {
        console.log('User disconnected: ' + socket.userName + ' (' + socket.userId + ')');
        if (socket.room && socket.userId) { 
            usersInRoom[socket.room] = usersInRoom[socket.room].filter(user => user.userId !== socket.userId);
            socket.to(socket.room).emit('user-disconnected', socket.userId, socket.userName);
            console.log(`Usuario ${socket.userName} (${socket.userId}) abandonó la sala ${socket.room}.`);
            console.log(`Usuarios restantes en la sala ${socket.room}:`, usersInRoom[socket.room].map(u => u.userName));
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor escuchando en el puerto ${PORT}`);
});
