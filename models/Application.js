module.exports = (db, DataTypes) => {
  const Application = db.define(
    'Application',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'በመጠባበቅ ላይ',
        validate: {
          isIn: [['በመጠባበቅ ላይ', 'ተጻፎ ተቀምጧል', 'በግምገማ ላይ', 'ውድቅ ተደርጓል', 'ጸድቋል']]
        }
      },
      submitted_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: true
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' }
      },
      administrative_unit_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'administrative_units', key: 'id' }
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' }
      },
      land_record_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'land_records', key: 'id' }
      },
      document_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'documents', key: 'id' }
      },
      land_payment_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'land_payments', key: 'id' }
      },
      comments: {
        type: DataTypes.TEXT,
        allowNull: true
      }
    },
    {
      tableName: 'applications',
      timestamps: false 
    }
  );

  return Application;
};