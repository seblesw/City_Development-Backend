// config/database.js
const { Sequelize } = require('sequelize');
const config = require('../config/config.json')[process.env.NODE_ENV || 'development'];

// Initialize Sequelize
const db = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    dialect: config.dialect || 'postgres',
    logging: config.logging ? console.log : false,
    port: config.port || 5432,
  }
);


module.exports = db;
