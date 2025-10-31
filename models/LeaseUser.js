
const LEASE_USER_TYPES = {
  LESSEE: 'ውል ተቀባይ',
  LEASER: 'ውል ሰጭ',
  LESSEE_TESTIMONIAL: 'የውል ተቀባይ ምስክር',
  LEASER_TESTIMONIAL: 'የውል ሰጭ ምስክር',
};

module.exports = (db, DataTypes) => {
  const LeaseUser = db.define(
    'LeaseUser',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      lease_agreement_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'lease_agreements', key: 'id' },
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
          isIn: {
            args: [Object.values(LEASE_USER_TYPES)],
            msg: `የተጠቃሚ አይነት ከተፈቀዱቷ (${Object.values(LEASE_USER_TYPES).join(', ')}) ውስጥ መሆን አለበት።`,
          },
        },
      },
      name: {
        type: DataTypes.STRING,
        allowNull: true,
        validate: {
          len: { args: [1, 200], msg: 'ስም ከ1-200 ፊደላት መሆን አለበት።' },
        },
      },
      phone: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      email:{
        type:DataTypes.STRING,
        allowNull:true
      },
      address: {
        type: DataTypes.STRING,
        allowNull: true,        
      },
      national_id: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
        validate: {
          len: { args: [0, 50], msg: 'ብሔራዊ መለያ ከ50 ፊደላት መብለጥ አይችልም።' },
        },
      },
      nationality:{
        type:DataTypes.STRING,
        allowNull:true
      },
    },
    {
      tableName: 'lease_users',
      timestamps: true,
      paranoid: true,
      freezeTableName: true,
      indexes: [
        { fields: ['lease_agreement_id'] },
        { fields: ['type'] },
        { fields: ['national_id'], unique: true },
      ],
    }
  );

  return { LeaseUser, LEASE_USER_TYPES };
};