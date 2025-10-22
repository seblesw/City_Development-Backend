// models/Notification.js
module.exports = (db, DataTypes) => {
  const PushNotification = db.define('PushNotification', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    user_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    land_record_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'land_records',
        key: 'id'
      }
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    action_type: {
      type: DataTypes.STRING,
      allowNull: false
    },
    is_seen: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    additional_data: {
      type: DataTypes.JSONB,
      allowNull: true
    }
  }, {
    tableName: 'push_notifications',
    timestamps: true,
    underscored: true
  });

  return PushNotification;
};