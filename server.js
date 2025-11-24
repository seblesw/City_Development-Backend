const express = require('express');
const dotenv = require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./config/database');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cron = require('node-cron');

// Import your routes
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
const paymentSchedulesRoutes = require('./routes/paymentScheduleRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const leaseAgreementRoutes = require('./routes/leaseAgreementRoutes');
const ownershipTransferRoutes = require('./routes/ownershipTransferRoutes');
const actionLogsRoutes = require('./routes/actionLogsRoutes');

// Import services
const { checkOverdueSchedules } = require('./services/paymentScheduleService');
const { createReminderNotifications, createOverdueNotifications, sendPendingNotifications, createGlobalNoticeNotifications } = require('./services/notificationService');

// Import socket handlers and notification utils
const { setupSocketHandlers } = require('./utils/socketHandlers');
const { notifyNewAction, userSessionUtils } = require('./utils/notificationUtils');
const { AdministrativeUnit, User } = require('./models');

// Initialize express app
const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000;

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
}));
app.use(bodyParser.json());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

// Make io and notification utils accessible to routes
app.set('io', io);
app.set('notifyNewAction', (actionData) => notifyNewAction(io, actionData));
app.set('userSessionUtils', userSessionUtils);

// Socket.IO connection handling
io.on('connection', (socket) => {
  setupSocketHandlers(io, socket);
});

// Your existing endpoints
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
app.use('/api/v1/payment-schedules', paymentSchedulesRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/lease-agreements', leaseAgreementRoutes);
app.use('/api/v1/ownership-transfers', ownershipTransferRoutes);
app.use('/api/v1/action-logs', actionLogsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: db.authenticated ? 'Connected' : 'Disconnected'
  });
});

// Database sync function with better error handling
const syncDatabase = async () => {
  try {
    console.log('Starting database sync at', new Date().toISOString());
    
    // Choose one of these sync options:
    
    // Option 1: Safe sync (recommended for production)
    // await db.sync();
    
    // Option 2: Force sync (DANGEROUS - drops all tables and recreates)
    // await db.sync({ force: });
    
    // Option 3: Alter sync (modifies tables to match model definitions)
    // await db.sync({ alter: true });
    
    console.log('Database synchronized successfully at', new Date().toISOString());
    return true;
  } catch (error) {
    console.error('Database sync failed:', error);
    throw error;
  }
};

// Start server and cron jobs
const startServer = async () => {
  try {
    console.log('Attempting database connection at', new Date().toISOString());
    
    // Test database connection
    await db.authenticate();
    console.log('Database connected successfully at', new Date().toISOString());
    
    // Sync database tables
    await syncDatabase();
    
    // Initialize cron jobs after successful sync
    initializeCronJobs();
    
    server.listen(port, () => {
      console.log(`Server running on port ${port} at ${new Date().toISOString()}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

// Initialize cron jobs separately
const initializeCronJobs = () => {
  console.log('Initializing cron jobs at', new Date().toISOString());
  
  // Cron job for overdue schedules (penalties) - Run daily at 2 AM
  // cron.schedule('0 2 * * *', async () => { 
  //   try {
  //     console.log('Running overdue schedule check at', new Date().toISOString());
  //     const penaltySchedules = await checkOverdueSchedules();
  //     console.log(`${penaltySchedules.length} የቅጣት መርሃ ግብሮች ተፈጥሯል at ${new Date().toISOString()}`);
  //   } catch (error) {
  //     console.error(`የቅጣት መርሃ ግብር ስህተት at ${new Date().toISOString()}:`, error.message);
  //   }
  // });

  // Cron job for reminder notifications - Run daily at 8 AM
  // cron.schedule('0 8 * * *', async () => { 
  //   try {
  //     console.log('Running reminder notification creation at', new Date().toISOString());
  //     const notifications = await createReminderNotifications();
  //     console.log(`${notifications.length} የአስታዋሽ ማሳወቂያዎች ተፈጥሯል at ${new Date().toISOString()}`);
  //   } catch (error) {
  //     console.error(`የአስታዋሽ ማሳወቂያ ስህተት at ${new Date().toISOString()}:`, error.message);
  //   }
  // });

  // Cron job for overdue notifications - Run daily at 9 AM
  // cron.schedule('0 9 * * *', async () => { 
  //   try {
  //     console.log('Running overdue notification creation at', new Date().toISOString());
  //     const notifications = await createOverdueNotifications();
  //     console.log(`${notifications.length} ያለፈበት ማሳወቂያዎች ተፈጥሯል at ${new Date().toISOString()}`);
  //   } catch (error) {
  //     console.error(`ያለፈበት ማሳወቂያ ስህተት at ${new Date().toISOString()}:`, error.message);
  //   }
  // });

  // Cron job for global notice notifications - Run daily at 10 AM
  cron.schedule('* * * * *', async () => { 
    try {
      console.log('Running global notice notification creation at', new Date().toISOString());
      const notifications = await createGlobalNoticeNotifications();
      console.log(`${notifications.length} አጠቃላይ ማሳወቂያዎች ተፈጥሯል at ${new Date().toISOString()}`);
    } catch (error) {
      console.error(`አጠቃላይ ማሳወቂያ ስህተት at ${new Date().toISOString()}:`, error.message);
    }
  });

  // Cron job for sending notifications - Run every 5 minutes
  cron.schedule('* * * * *', async () => { 
    try {
      console.log('Running notification sending at', new Date().toISOString());
      const sentCount = await sendPendingNotifications();
      console.log(`${sentCount} ማሳወቂያዎች ተልከዋል at ${new Date().toISOString()}`);
    } catch (error) {
      console.error(`ማሳወቂያ መላክ ስህተት at ${new Date().toISOString()}:`, error.message);
    }
  });

  console.log('All cron jobs initialized successfully');
};

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Start the server
startServer();