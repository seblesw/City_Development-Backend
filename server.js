const express = require('express');
const dotenv = require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./config/database');
const http = require('http'); // Added
const { Server } = require('socket.io'); // Added
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
const leaseAgreementRoutes = require('./routes/leaseAgreementRoutes')
const path = require('path');
const cron = require('node-cron');
const { checkOverdueSchedules } = require('./services/paymentScheduleService');
const { createReminderNotifications, createOverdueNotifications, sendPendingNotifications, createGlobalNoticeNotifications } = require('./services/notificationService');

// Initialize express app
const app = express();
const server = http.createServer(app); 
const port = process.env.PORT;

// Socket.IO setup 
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true
  }
});

// Store user sessions for real-time notifications
const userSockets = new Map(); // userId -> socketId

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
}));
app.use(bodyParser.json());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

// Make io accessible to routes 
app.set('io', io);

// Socket.IO connection handling 
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User authentication and session setup
  socket.on('user_authenticated', (userData) => {
    const { userId, userRole } = userData;
    
    userSockets.set(userId, socket.id);
    socket.join(`user_${userId}`);
    
    console.log(`User ${userId} authenticated with socket ${socket.id}`);
  });

  // Get new actions count based on last login
  socket.on('get_new_actions_count', async (userId) => {
    try {
      // We'll implement this logic in the next step
      console.log(`Getting new actions count for user ${userId}`);
      // For now, send a dummy count
      socket.emit('new_actions_count', { count: 0 });
    } catch (error) {
      console.error('Error getting new actions count:', error);
    }
  });

  // Get new actions list
  socket.on('get_new_actions', async (data) => {
    try {
      const { userId, limit = 20 } = data;
      console.log(`Getting new actions for user ${userId}`);
      // We'll implement this in the next step
      socket.emit('new_actions_list', []);
    } catch (error) {
      console.error('Error getting new actions:', error);
      socket.emit('new_actions_list', []);
    }
  });

  // Mark actions as seen
  socket.on('mark_actions_seen', async (userId) => {
    try {
      console.log(`Marking actions as seen for user ${userId}`);
      socket.emit('new_actions_count', { count: 0 });
    } catch (error) {
      console.error('Error marking actions as seen:', error);
    }
  });

  socket.on('disconnect', () => {
    // Remove user from tracking
    for (const [userId, socketId] of userSockets.entries()) {
      if (socketId === socket.id) {
        userSockets.delete(userId);
        console.log(`User ${userId} disconnected`);
        break;
      }
    }
    console.log('User disconnected:', socket.id);
  });
});

// Helper function to notify about new action 
async function notifyNewAction(actionData) {
  try {
    const { landRecordId, parcelNumber, action, changed_by, changed_at } = actionData;
    
    // Notify all connected users about new action
    io.emit('new_action_occurred', {
      land_record_id: landRecordId,
      parcel_number: parcelNumber,
      action: action,
      changed_by: changed_by,
      changed_at: changed_at || new Date().toISOString()
    });
    
    // Update new actions count for all connected users
    userSockets.forEach((socketId, userId) => {
      // We'll implement the count logic in the next step
      io.to(`user_${userId}`).emit('action_refresh_needed');
    });
    
    console.log(`New action notified: ${action} for record ${landRecordId}`);
  } catch (error) {
    console.error('Error notifying new action:', error);
  }
}

// Make notify function available globally - Added this
global.notifyNewAction = notifyNewAction;
global.getIO = () => io;

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
app.use('/api/v1/lease-agreements', leaseAgreementRoutes)

// Add health check endpoint with socket status - Added this
app.get('/api/v1/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    connectedUsers: userSockets.size,
    socketConnections: io.engine.clientsCount,
    message: 'Server with Socket.IO is running'
  });
});

// Test Socket.IO endpoint - Added this
app.get('/api/v1/test-notification', (req, res) => {
  try {
    // Send a test notification to all connected clients
    io.emit('test_notification', {
      message: 'This is a test notification from the server!',
      timestamp: new Date().toISOString()
    });
    
    res.json({
      success: true,
      message: 'Test notification sent to all connected clients',
      connectedClients: io.engine.clientsCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Error sending test notification: ${error.message}`
    });
  }
});

// app.use(express.static(path.join(__dirname, 'dist')));
// app.get('/', (req, res) => {
//   res.sendFile(path.join(__dirname, 'dist', 'index.html'));
// });
// app.use('/assets', express.static(path.join(__dirname, 'dist/assets')));

// Start server and cron jobs
const startServer = async () => {
  try {
    await db.authenticate();
    console.log('Database connected successfully at', new Date().toISOString());
    //sync the database tables
    // await db.sync({ alter: true });
    console.log('Database synchronized successfully at', new Date().toISOString());

    // Cron job for overdue schedules (penalties)
    // console.log('Starting cron job for overdue schedules at', new Date().toISOString());
    // cron.schedule('* * * * *', async () => { 
    //   try {
    //     console.log('Running overdue schedule check at', new Date().toISOString());
    //     const penaltySchedules = await checkOverdueSchedules();
    //     console.log(`${penaltySchedules.length} የቅጣት መርሃ ግብሮች ተፈጥሯል at ${new Date().toISOString()}`);
    //   } catch (error) {
    //     console.error(`የቅጣት መርሃ ግብር ስህተት at ${new Date().toISOString()}:`, error.message);
    //   }
    // });

    // Cron job for reminder notifications
    // console.log('Starting cron job for reminder notifications at', new Date().toISOString());
    // cron.schedule('* * * * *', async () => { 
    //   try {
    //     console.log('Running reminder notification creation at', new Date().toISOString());
    //     const notifications = await createReminderNotifications();
    //     console.log(`${notifications.length} የአስታዋሽ ማሳወቂያዎች ተፈጥሯል at ${new Date().toISOString()}`);
    //   } catch (error) {
    //     console.error(`የአስታዋሽ ማሳወቂያ ስህተት at ${new Date().toISOString()}:`, error.message);
    //   }
    // });

    // Cron job for overdue notifications
    // console.log('Starting cron job for overdue notifications at', new Date().toISOString());
    // cron.schedule('* * * * *', async () => { 
    //   try {
    //     console.log('Running overdue notification creation at', new Date().toISOString());
    //     const notifications = await createOverdueNotifications();
    //     // console.log(`${notifications.length} ያለፈበት ማሳወቂያዎች ተፈጥሯል at ${new Date().toISOString()}`);
    //   } catch (error) {
    //     console.error(`ያለፈበት ማሳወቂያ ስህተት at ${new Date().toISOString()}:`, error.message);
    //   }
    // });

    // Cron job for global notice notifications
    // console.log('Starting cron job for global notice notifications at', new Date().toISOString());
    // cron.schedule('0 0 1 */3 *', async () => { 
    //   try {
    //     console.log('Running global notice notification creation at', new Date().toISOString());
    //     const notifications = await createGlobalNoticeNotifications();
    //     console.log(`${notifications.length} አጠቃላይ ማሳወቂያዎች ተፈጥሯል at ${new Date().toISOString()}`);
    //   } catch (error) {
    //     console.error(`አጠቃላይ ማሳወቂያ ስህተት at ${new Date().toISOString()}:`, error.message);
    //   }
    // });

    // Cron job for sending notifications 
    // console.log('Starting cron job for sending notifications at', new Date().toISOString());
    // cron.schedule('0 0 1 */3 *', async () => { 
    //   try {
    //     console.log('Running notification sending at', new Date().toISOString());
    //     const sentCount = await sendPendingNotifications();
    //     // console.log(`${sentCount} ማሳወቂያዎች ተልከዋል at ${new Date().toISOString()}`);
    //   } catch (error) {
    //     console.error(`ማሳወቂያ መላክ ስህተት at ${new Date().toISOString()}:`, error.message);
    //   }
    // });

    // Changed from app.listen to server.listen
    server.listen(port, () => {
      console.log(`Server running on port ${port} at ${new Date().toISOString()}`);
      console.log(`Socket.IO is ready for connections`);
    });
  } catch (err) {
    console.error(`Failed to start server at ${new Date().toISOString()}:`, err);
    process.exit(1);
  }
};

startServer();