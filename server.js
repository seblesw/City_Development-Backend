const express = require('express');
const dotenv = require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./config/database');
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
const port = process.env.PORT;

// Middleware
app.use(cors({
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
}));
app.use(bodyParser.json());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));-

// Endpoints
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
    await db.sync({ alter: true });
    console.log('Database synchronized successfully at', new Date().toISOString());

    // Cron job for overdue schedules (penalties)
    console.log('Starting cron job for overdue schedules at', new Date().toISOString());
    cron.schedule('* * * * *', async () => { 
      try {
        console.log('Running overdue schedule check at', new Date().toISOString());
        const penaltySchedules = await checkOverdueSchedules();
        console.log(`${penaltySchedules.length} የቅጣት መርሃ ግብሮች ተፈጥሯል at ${new Date().toISOString()}`);
      } catch (error) {
        console.error(`የቅጣት መርሃ ግብር ስህተት at ${new Date().toISOString()}:`, error.message);
      }
    });

    // Cron job for reminder notifications
    console.log('Starting cron job for reminder notifications at', new Date().toISOString());
    cron.schedule('* * * * *', async () => { 
      try {
        console.log('Running reminder notification creation at', new Date().toISOString());
        const notifications = await createReminderNotifications();
        console.log(`${notifications.length} የአስታዋሽ ማሳወቂያዎች ተፈጥሯል at ${new Date().toISOString()}`);
      } catch (error) {
        console.error(`የአስታዋሽ ማሳወቂያ ስህተት at ${new Date().toISOString()}:`, error.message);
      }
    });

    // Cron job for overdue notifications
    console.log('Starting cron job for overdue notifications at', new Date().toISOString());
    cron.schedule('* * * * *', async () => { 
      try {
        console.log('Running overdue notification creation at', new Date().toISOString());
        const notifications = await createOverdueNotifications();
        // console.log(`${notifications.length} ያለፈበት ማሳወቂያዎች ተፈጥሯል at ${new Date().toISOString()}`);
      } catch (error) {
        console.error(`ያለፈበት ማሳወቂያ ስህተት at ${new Date().toISOString()}:`, error.message);
      }
    });

    // Cron job for global notice notifications
    console.log('Starting cron job for global notice notifications at', new Date().toISOString());
    cron.schedule('* * * * *', async () => { 
      try {
        console.log('Running global notice notification creation at', new Date().toISOString());
        const notifications = await createGlobalNoticeNotifications();
        console.log(`${notifications.length} አጠቃላይ ማሳወቂያዎች ተፈጥሯል at ${new Date().toISOString()}`);
      } catch (error) {
        console.error(`አጠቃላይ ማሳወቂያ ስህተት at ${new Date().toISOString()}:`, error.message);
      }
    });

    // Cron job for sending notifications 
    console.log('Starting cron job for sending notifications at', new Date().toISOString());
    cron.schedule('* * * * *', async () => { 
      try {
        console.log('Running notification sending at', new Date().toISOString());
        const sentCount = await sendPendingNotifications();
        // console.log(`${sentCount} ማሳወቂያዎች ተልከዋል at ${new Date().toISOString()}`);
      } catch (error) {
        console.error(`ማሳወቂያ መላክ ስህተት at ${new Date().toISOString()}:`, error.message);
      }
    });

    app.listen(port, () => {
      console.log(`Server running on port ${port} at ${new Date().toISOString()}`);
    });
  } catch (err) {
    console.error(`Failed to start server at ${new Date().toISOString()}:`, err);
    process.exit(1);
  }
};

startServer();