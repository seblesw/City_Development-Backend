const express = require('express');
const dotenv = require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const { sequelize } = require('./models'); 
const regionRoutes = require('./routes/regiooutes'); 
const roleRoutes = require('./routes/roleRoutes'); 
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Teamwork IT Solution Land Management System API',
    version: '1.0',
    endpoints: '/api/v1 => the first version',
  });
});

//the endpoints
app.use('/api/v1/regions', regionRoutes);
app.use('/api/v1/roles', roleRoutes);

// Start server
const startServer = async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected successfully');
    // Sync models with the database
    await sequelize.sync();
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();