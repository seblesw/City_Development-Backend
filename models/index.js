const { Sequelize, DataTypes } = require("sequelize");
const db = require("../config/database");

const User = require("./User")(db, DataTypes);
const Role = require("./Role")(db, DataTypes);

const models = {
  User,
  Role,
};

User.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
Role.hasMany(models.User, { foreignKey: 'role_id', as: 'users' });

module.exports = {
  db,
  Sequelize,
  ...models,
};