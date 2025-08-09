const express = require('express');
const cors = require('cors'); 
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');
const mongoose = require('mongoose'); // Importar Mongoose
const bcrypt = require('bcryptjs'); // Importar bcryptjs para hashing de contraseñas

// --- Configuración de CORS ---
const corsOptions = {
    origin: 'https://meet-front.onrender.com', // La URL de tu frontend
    methods: ['GET', 'POST']
};

app.use(cors(corsOptions)); 
app.use(express.json()); // Habilitar el parsing de JSON en el cuerpo de las solicitudes

// --- Configuración de Socket.IO ---
const io = require('socket.io')(server, {
    cors: corsOptions 
});

// --- Configuración de PeerJS ---
const peerServer = ExpressPeerServer(server, {
    path: '/myapp'
});
app.use('/peerjs', peerServer);

// --- Conexión a MongoDB ---
const MONGODB_URI = "mongodb+srv://julioramirezs2008:JDRS2008@cluster0.mvtvanq.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0";

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Conectado a MongoDB Atlas'))
    .catch(err => console.error('Error al conectar a MongoDB:', err));

// --- Esquema y Modelo de Usuario ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    accessCode: { type: String, required: true } // Campo para el código de acceso
});

// Middleware para hashear la contraseña antes de guardar
userSchema.pre('save', async function (next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 10);
    }
    next();
});

const User = mongoose.model('User', userSchema);

// --- Lógica de la aplicación ---
const usersInRoom = {};
const GLOBAL_ACCESS_CODE = "MundiLink2025"; // Código de acceso global para unirse a la app

// --- Rutas de Autenticación ---

// Ruta de Registro
app.post('/register', async (req, res) => {
    const { username, password, accessCode } = req.body;

    // Verificar si el accessCode coincide con el código global o uno específico si hubiera
    // En este caso, el accessCode ingresado por el usuario debe coincidir con GLOBAL_ACCESS_CODE
    if (accessCode !== GLOBAL_ACCESS_CODE) {
        return res.status(400).json({ message: 'Código de acceso incorrecto.' });
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ message: 'El nombre de usuario ya existe.' });
        }

        const newUser = new User({ username, password, accessCode });
        await newUser.save();
        res.status(201).json({ message: 'Usuario registrado exitosamente.' });
    } catch (error) {
        console.error('Error en el registro:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});

// Ruta de Inicio de Sesión
app.post('/login', async (req, res) => {
    const { username, password, accessCode } = req.body;

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Credenciales inválidas.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciales inválidas.' });
        }

        // Verificar el código de acceso proporcionado
        if (accessCode !== GLOBAL_ACCESS_CODE) {
            return res.status(400).json({ message: 'Código de acceso incorrecto.' });
        }
        
        // Aquí podrías generar un token JWT si quisieras mantener la sesión.
        // Por simplicidad, solo enviamos un mensaje de éxito por ahora.
        res.status(200).json({ message: 'Inicio de sesión exitoso.', username: user.username });
    } catch (error) {
        console.error('Error en el login:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
});


// --- Lógica de Socket.IO existente ---
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

    // Nuevo evento para cambiar el tema
    socket.on('change-theme', (theme) => {
        io.to(socket.room).emit('theme-changed', theme);
        console.log(`Tema cambiado a ${theme} en la sala ${socket.room} por ${socket.userName}`);
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
