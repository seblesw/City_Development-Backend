// config/database.js
const { Sequelize } = require('sequelize');
const db = new Sequelize({
  database: process.env.DB_NAME ,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD, 
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: process.env.DB_DIALECT || "postgres",
  logging: process.env.logging ? console.log : false,
});

module.exports = db;