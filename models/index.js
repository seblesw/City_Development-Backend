const { Sequelize, DataTypes } = require('sequelize');
const db = require('../config/database');

// Define models
const models = {
  User: require('./User')(db, DataTypes),
  Role: require('./Role')(db, DataTypes),
  RefreshToken: require('./RefreshToken')(db, DataTypes),
  AdministrativeUnit: require('./AdministrativeUnit')(db, DataTypes),
  Region: require('./Region')(db, DataTypes),
};

// Define associations
models.User.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
models.Role.hasMany(models.User, { foreignKey: 'role_id', as: 'users' });

models.User.hasMany(models.RefreshToken, { foreignKey: 'userId', as: 'refreshTokens' });
models.RefreshToken.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });

models.AdministrativeUnit.hasMany(models.User, { foreignKey: 'administrative_unit_id', as: 'users' });
models.User.belongsTo(models.AdministrativeUnit, { foreignKey: 'administrative_unit_id', as: 'administrativeUnit' });

// Debug model initialization
Object.keys(models).forEach(modelName => {
  console.log(`${modelName} model initialized:`, !!models[modelName].findOne);
});

// Export Sequelize instance and models
module.exports = {
  sequelize: db, // Export the Sequelize instance as 'sequelize'
  Sequelize,
  ...models,
};