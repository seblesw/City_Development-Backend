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
const path = require('path');
const cron = require('node-cron');
const { checkOverdueSchedules } = require('./services/paymentScheduleService');

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
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

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

app.use(express.static(path.join(__dirname, 'dist')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
app.use('/assets', express.static(path.join(__dirname, 'dist/assets')));

// Start server and cron job
const startServer = async () => {
  try {
    await db.authenticate();
    console.log('Database connected successfully');
    // Sync models with the database
    await db.sync({ alter: true });
    console.log('Database synchronized successfully');

    // Start cron job for overdue schedules
    console.log('Starting cron job for overdue schedules at', new Date().toISOString());
    cron.schedule('* * * * *', async () => { 
    // cron.schedule('0 0 * * *', async () => { // Uncomment for daily at midnight
      try {
        console.log('Running overdue schedule check at', new Date().toISOString());
        const penaltySchedules = await checkOverdueSchedules();
        console.log(`${penaltySchedules.length} የቅጣት መርሃ ግብሮች ተፈጥሯል`);
      } catch (error) {
        console.error('የቅጣት መርሃ ግብር ስህተት:', error.message);
      }
    });

    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();