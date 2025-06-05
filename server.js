const express = require('express');
const dotenv = require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const app = express();
const port = process.env.PORT
// Middleware
app.use(cors());
app.use(bodyParser.json());

// Start server
const startServer = async () => {
    try {
        // await db.authenticate();
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