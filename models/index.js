const { Sequelize, DataTypes } = require("sequelize");
const db = require("../config/database");

const User = require("./User")(db, DataTypes);
const Role = require("./Role")(db, DataTypes);
const RefreshToken = require("./RefreshToken")(db, DataTypes);
const models = {
  User,
  Role,
  RefreshToken,
};

User.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
Role.hasMany(models.User, { foreignKey: 'role_id', as: 'users' });

User.hasMany(models.RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
RefreshToken.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });


module.exports = {
  db,
  Sequelize,
  ...models,
};