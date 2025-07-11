require('dotenv').config();
const express = require('express');
const http = require('http');
const socketio = require('socket.io');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./config/database');
const socketHandlers = require('./utils/socketHandlers');

// Route imports
const regionRoutes = require('./routes/regionRoutes');
const ZoneRoutes = require('./routes/zoneRoutes');
const WoredaRoutes = require('./routes/woredaRoutes');
const OversightOfficeRoutes = require('./routes/oversightOfficeRoutes');
const roleRoutes = require('./routes/roleRoutes');
const AdministrativeUnitRoutes = require('./routes/admistrativeUnitRoutes');
const landRecordRoutes = require('./routes/landRecordRoutes');
const userRoutes = require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');
const landPaymentRoutes = require('./routes/landPaymentRoutes');

// Initialize app
const app = express();
const server = http.createServer(app);

// Enhanced Socket.IO Configuration
const io = socketio(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000
});

// Initialize socket handlers
socketHandlers(io);

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.json());

// Make io accessible in routes
app.set('io', io);

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Teamwork IT Solution Land Management System API',
    version: '1.0',
    endpoints: '/api/v1 => the first version',
    websocket: {
      status: 'active',
      clients: io.engine.clientsCount,
      path: '/socket.io'
    }
  });
});

// API endpoints
app.use('/api/v1/regions', regionRoutes);
app.use('/api/v1/zones', ZoneRoutes);
app.use('/api/v1/woredas', WoredaRoutes);
app.use('/api/v1/oversight-offices', OversightOfficeRoutes);
app.use('/api/v1/roles', roleRoutes);
app.use('/api/v1/administrative-units', AdministrativeUnitRoutes);
app.use('/api/v1/land-records', landRecordRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/documents', documentRoutes);
app.use('/api/v1/land-payments', landPaymentRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    database: db.authenticate() ? 'connected' : 'disconnected',
    websocket: io.engine.clientsCount > 0 ? 'active' : 'inactive',
    uptime: process.uptime()
  });
});

// Start server
const startServer = async () => {
  try {
    await db.authenticate();
    console.log('Database connected successfully');
    
    await db.sync({ alter: true });
    console.log('Database synchronized successfully');
    
    server.listen(process.env.PORT, () => {
      console.log(`Server running on port ${process.env.PORT}`);
      console.log(`WebSocket endpoint: ws://localhost:${process.env.PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Enhanced graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Closing server gracefully...');
  
  // Close all WebSocket connections first
  io.close(() => {
    console.log('WebSocket server closed');
    
    // Then close HTTP server
    server.close(() => {
      console.log('HTTP server closed');
      process.exit(0);
    });
  });

  // Force shutdown after 10 seconds if needed
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
});

startServer();