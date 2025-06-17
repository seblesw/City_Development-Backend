module.exports = (db, DataTypes) => {
  const CoOwners = db.define(
    'CoOwners',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
      },
     full_name:{
        type: DataTypes.STRING,
        allowNull: false
     },
      phone_number: {
        type: DataTypes.STRING,
        allowNull: true
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: true
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true
      }
    },
    {
      tableName: 'co_owners',
      timestamps: true,
      indexes: [
        { fields: ['user_id'] }
      ]
    }
  );

  return CoOwners;
};