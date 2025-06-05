const express = require('express');
const dotenv = require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const db = require('./config/database'); 
const app = express();
const port = process.env.PORT
// Middleware
app.use(cors());
app.use(bodyParser.json());

// Routes
app.get('/', (req, res) => {
    res.json({
        message: 'Welcome to teamwork IT solution Land maagement system API',
        version: '1.0',
        endpoints: '/api/v1 => the first version ',
    });
});

// Start server
const startServer = async () => {
    try {
        await db.authenticate();
        console.log('Database connected successfully');
        app.listen(port, () => {
            console.log(`Server running on port ${port}`);
        });
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
};
startServer();