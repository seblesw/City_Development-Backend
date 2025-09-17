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
const userRoutes =require('./routes/userRoutes');
const authRoutes = require('./routes/authRoutes');
const documentRoutes = require('./routes/documentRoutes');
const landPaymentRoutes = require('./routes/landPaymentRoutes');
const paymentSchedulesRoutes = require('./routes/paymentScheduleRoutes');
const path = require('path');
// Initialize express app

const app = express();
const port = process.env.PORT ;

// Middleware
app.use(cors(
  {
    origin: '*', 
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    // credentials: true,
  }
));
app.use(bodyParser.json());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

//the endpoints
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

app.use(express.static(path.join(__dirname,'dist','index.html')))
    app.get('/',(req,res)=>{
      res.sendFile(path.join(__dirname,'dist','index.html'))
    });
    app.use('/assets', express.static(path.join(__dirname, 'dist/assets')));

// Start server
const startServer = async () => {
  try {
    await db.authenticate();
    console.log('Database connected successfully');
    // Sync models with the database
    // Set force to true only in development to drop tables={force:true}
    // set alter to true for to add new attribuete with out drop existing table {alter:true}
    // await db.sync({alter:true}); 
    console.log('Database synchronized successfully');
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
    
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();