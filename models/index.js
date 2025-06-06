const { Sequelize, DataTypes } = require("sequelize");
const db = require("../config/database");

const User = require("./User")(db, DataTypes);
const Role = require("./Role")(db, DataTypes);
const RefreshToken = require("./RefreshToken")(db, DataTypes);
const AdministrativeUnit = require("./AdministrativeUnit")(db, DataTypes);
const models = {
  User,
  Role,
  RefreshToken,
  AdministrativeUnit
};

User.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
Role.hasMany(models.User, { foreignKey: 'role_id', as: 'users' });

User.hasMany(models.RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
RefreshToken.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });

AdministrativeUnit.hasMany(models.User, { foreignKey: 'administrative_unit_id', as: 'users' });
User.belongsTo(models.AdministrativeUnit, { foreignKey: 'administrative_unit_id', as: 'administrativeUnit' });


module.exports = {
  db,
  Sequelize,
  ...models,
};