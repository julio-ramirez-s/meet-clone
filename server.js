const express = require('express');
const cors = require('cors'); 
const app = express();
const server = require('http').Server(app);
const { ExpressPeerServer } = require('peer');
const mongoose = require('mongoose'); // Importar Mongoose
const bcrypt = require('bcryptjs'); // Importar bcryptjs para hashing de contraseñas

// --- Configuración de CORS ---
const corsOptions = {
    // Asegúrate de que esta URL coincida exactamente con la URL de tu frontend desplegado
    origin: 'https://meet-front.onrender.com', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Añadir otros métodos si los usas
    credentials: true // Importante para cookies, headers de autorización, etc.
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
    .then(() => console.log('✅ Conectado a MongoDB Atlas'))
    .catch(err => {
        console.error('❌ Error al conectar a MongoDB:', err);
        // Opcional: Salir del proceso si la conexión a la DB falla críticamente
        // process.exit(1); 
    });

// --- Esquema y Modelo de Usuario ---
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    accessCode: { type: String, required: true } 
}, { timestamps: true }); // Añadir timestamps para ver cuándo se creó/actualizó el usuario

// Middleware para hashear la contraseña antes de guardar
userSchema.pre('save', async function (next) {
    if (this.isModified('password')) {
        try {
            const salt = await bcrypt.genSalt(10); // Generar un salt
            this.password = await bcrypt.hash(this.password, salt); // Hashear la contraseña
        } catch (error) {
            console.error('Error al hashear la contraseña:', error);
            return next(error); // Pasar el error al siguiente middleware
        }
    }
    next();
});

const User = mongoose.model('User', userSchema);

// --- Lógica de la aplicación ---
// El código de acceso debe ser el mismo para todos los usuarios que quieran registrarse.
// Considera mover esto a una variable de entorno para producción.
const GLOBAL_ACCESS_CODE = "MundiLink2025"; 

// --- Rutas de Autenticación ---

// Ruta de Registro
app.post('/register', async (req, res) => {
    const { username, password, accessCode } = req.body;

    if (!username || !password || !accessCode) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }

    if (accessCode !== GLOBAL_ACCESS_CODE) {
        return res.status(400).json({ message: 'Código de acceso incorrecto.' });
    }

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(409).json({ message: 'El nombre de usuario ya existe. Por favor, elige otro.' });
        }

        const newUser = new User({ username, password, accessCode });
        await newUser.save();
        res.status(201).json({ message: 'Usuario registrado exitosamente. Ahora puedes iniciar sesión.' });
    } catch (error) {
        console.error('Error en el registro de usuario:', error);
        res.status(500).json({ message: 'Error interno del servidor al registrar el usuario. Inténtalo de nuevo.' });
    }
});

// Ruta de Inicio de Sesión
app.post('/login', async (req, res) => {
    const { username, password, accessCode } = req.body;

    if (!username || !password || !accessCode) {
        return res.status(400).json({ message: 'Todos los campos son obligatorios.' });
    }

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Credenciales inválidas: Usuario no encontrado.' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Credenciales inválidas: Contraseña incorrecta.' });
        }

        if (accessCode !== GLOBAL_ACCESS_CODE) {
            return res.status(400).json({ message: 'Código de acceso incorrecto.' });
        }
        
        // Si todo es correcto, el inicio de sesión es exitoso
        res.status(200).json({ message: 'Inicio de sesión exitoso.', username: user.username });
    } catch (error) {
        console.error('Error en el login de usuario:', error);
        res.status(500).json({ message: 'Error interno del servidor al iniciar sesión. Inténtalo de nuevo.' });
    }
});


// --- Lógica de Socket.IO existente ---
const usersInRoom = {}; // Asegúrate de que esta variable esté definida antes de su uso en el socket.on 'join-room'
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

        // Antes de añadir el usuario, verifica si ya existe en la lista para evitar duplicados
        const existingUser = usersInRoom[roomId].find(u => u.userId === userId);
        if (!existingUser) {
            usersInRoom[roomId].push({ userId, userName });
        }
        
        // Emitir 'room-users' para que el cliente que se une reciba la lista actual
        socket.emit('room-users', { users: usersInRoom[roomId] });

        // Emitir 'user-joined' a todos los demás en la sala
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

    socket.on('start-screen-share', (userId, userName) => {
        io.to(socket.room).emit('user-started-screen-share', { userId, userName });
        console.log(`${userName} (${userId}) inició la compartición de pantalla.`);
    });

    socket.on('stop-screen-share', () => {
        io.to(socket.room).emit('user-stopped-screen-share', socket.userId);
        console.log(`${socket.userName} (${socket.userId}) detuvo la compartición de pantalla.`);
    });

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
