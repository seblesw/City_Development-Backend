const { Sequelize, DataTypes } = require('sequelize');
const db = require('../config/database');
const User=require('./User')(db, DataTypes);
const Role=require('./Role')(db, DataTypes);
const RefreshToken=require('./RefreshToken')(db, DataTypes);
const AdministrativeUnit=require('./AdministrativeUnit')(db, DataTypes);
const Region=require('./Region')(db, DataTypes);
// Define models
const models = {
  User,
  Role,
  RefreshToken,
  AdministrativeUnit,
  Region,
};

// Define associations
models.User.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
models.Role.hasMany(models.User, { foreignKey: 'role_id', as: 'users' });

AdministrativeUnit.belongsTo(AdministrativeUnit, { foreignKey: 'parent_id', as: 'parent' });
AdministrativeUnit.hasMany(AdministrativeUnit, { foreignKey: 'parent_id', as: 'children' });

models.User.hasMany(models.RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
models.RefreshToken.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });

models.AdministrativeUnit.hasMany(models.User, { foreignKey: 'administrative_unit_id', as: 'users' });
models.User.belongsTo(models.AdministrativeUnit, { foreignKey: 'administrative_unit_id', as: 'administrativeUnit' });


// Export Sequelize instance and models
module.exports = {
  sequelize: db,
  Sequelize,
  ...models,
};