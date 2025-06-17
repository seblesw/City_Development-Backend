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
      name_translations: {
        type: DataTypes.JSON,
        allowNull: true,
        defaultValue: {}
      },
      is_jurisdiction: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
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
      },
      deleted_at: {
        type: DataTypes.DATE,
        allowNull: true
      }
    },
    {
      tableName: 'administrative_units',
      timestamps: true,
      paranoid: true,
      indexes: [
        { unique: true, fields: ['code'] },
        { unique: true, fields: ['name', 'parent_id'] },
        { fields: ['parent_id'] },
        { fields: ['unit_level'] },
        { fields: ['is_jurisdiction'] },
        { fields: ['type'] }
      ],
      hooks: {
        beforeCreate: async (unit) => {
          if (!unit.code) {
            const parentCode = unit.parent_id ? (await AdministrativeUnit.findByPk(unit.parent_id))?.code : '';
            unit.code = `${parentCode}${unit.name.toUpperCase().replace(/\s/g, '')}${Date.now().toString().slice(-4)}`;
          }
        },
        beforeSave: async (unit) => {
          let currentId = unit.parent_id;
          const visited = new Set();
          while (currentId) {
            if (visited.has(currentId)) throw new Error('Circular parent reference detected');
            visited.add(currentId);
            const parent = await AdministrativeUnit.findByPk(currentId);
            currentId = parent?.parent_id;
          }
        }
      },
      validate: {
        validAttributes() {
          if (this.is_jurisdiction) {
            if (this.type || this.unit_level || this.max_land_levels) {
              throw new Error('ዳይሬክቶሬቶች አይነት፣ ደረጃ ወይም ከፍተኛ የመሬት ደረጃ ሊኖራቸው አይችልም።');
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