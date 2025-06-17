module.exports = (db, DataTypes) => {
  const AdministrativeUnit = db.define(
    'AdministrativeUnit',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false
      },
      is_jurisdiction: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      jurisdiction_type: {
        type: DataTypes.STRING,
        allowNull: true
      },
      type: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          isIn: [['ሪጂኦፖሊታን', 'መካከለኛ ከተማ', 'አነስተኛ ከተማ', 'መሪ ማዘጋጃ ከተማ', 'ንዑስ ማዘጋጃ ከተማ', 'ታዳጊ ከተማ', 'ሪጂዮን', 'ዞን', 'ወረዳ']]
        }
      },
      unit_level: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 1, max: 6 }
      },
      parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'administrative_units', key: 'id' }
      },
      code: {
        type: DataTypes.STRING,
        unique: true,
        allowNull: true
      },
      max_land_levels: {
        type: DataTypes.INTEGER,
        allowNull: true,
        validate: { min: 1 },
        set(value) {
          if (!this.is_jurisdiction && !value && this.unit_level) {
            const levels = { 1: 5, 2: 5, 3: 5, 4: 4, 5: 3, 6: 2 };
            this.setDataValue('max_land_levels', levels[this.unit_level] || null);
          } else {
            this.setDataValue('max_land_levels', value);
          }
        }
      },
      created_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' }
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' }
      }
    },
    {
      tableName: 'administrative_units',
      timestamps: true,
      indexes: [
        { unique: true, fields: ['code'] },
        { fields: ['parent_id'] },
        { fields: ['unit_level'] },
        { fields: ['is_jurisdiction'] },
        { fields: ['type'] }
      ],
      validate: {
        validAttributes() {
          if (this.is_jurisdiction) {
            if (this.type || this.unit_level || this.max_land_levels) {
              throw new Error('ዳይሬክቶሬቶች አይነት፣ ደረጃ ወይም ከፍተኛ የመሬት ደረጃ ሊኖራቸው አይችልም።');
            }
            if (!this.jurisdiction_type) {
              throw new Error('ዳይሬክቶሬቶች የዳይሬክቶሬት አይነት መግለፅ አለባቸው።');
            }
          } else {
            if (!this.type || !this.unit_level || !this.max_land_levels) {
              throw new Error('ማዘጋጃ ቤቶች አይነት፣ ደረጃ እና ከፍተኛ የመሬት ደረጃ መግለፅ አለባቸው።');
            }
          }
        }
      }
    }
  );

  return AdministrativeUnit;
};