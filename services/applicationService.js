// services/ApplicationService.js
const { sequelize } = require("../models");
const { Op } = require("sequelize");

class ApplicationService {
  constructor(models) {
    this.models = models;
  }

  async createApplication(data, userId) {
    const { user, landRecord, payments, documents, coOwners } = data;
    return await sequelize.transaction(async (transaction) => {
      try {
        // Validate primary user
        let owner;
        if (user.id) {
          owner = await this.models.User.findByPk(user.id, { transaction });
          if (!owner) throw new Error("ዋና ተጠቃሚ አልተገኘም።");
        } else {
          const existingUser = await this.models.User.findOne({
            where: {
              [Op.or]: [{ email: user.email }, { phone_number: user.phone_number }]
            },
            transaction
          });
          if (existingUser) throw new Error("ዋና ተጠቃሚ ቀድሞ ተመዝግቧል።");
          owner = await this.models.User.create(
            {
              ...user,
              role_id: user.role_id,
              administrative_unit_id: user.administrative_unit_id,
              created_by: userId,
              updated_by: userId
            },
            { transaction }
          );
        }

        // Create or update co-owners
        const coOwnerRecords = [];
        if (coOwners && coOwners.length) {
          for (const coOwnerData of coOwners) {
            let coOwner;
            if (coOwnerData.id) {
              coOwner = await this.models.User.findByPk(coOwnerData.id, { transaction });
              if (!coOwner) throw new Error(`ተባባሪ ባለቤት ${coOwnerData.full_name} አልተገኘም።`);
            } else {
              const existingCoOwner = await this.models.User.findOne({
                where: {
                  [Op.or]: [
                    { email: coOwnerData.email },
                    { phone_number: coOwnerData.phone_number }
                  ]
                },
                transaction
              });
              if (existingCoOwner) {
                throw new Error(`ተባባሪ ባለቤት ${coOwnerData.full_name} ቀድሞ ተመዝግቧል።`);
              }
              coOwner = await this.models.User.create(
                {
                  ...coOwnerData,
                  role_id: coOwnerData.role_id || 3, // Default to 'LandOwner' role
                  administrative_unit_id: coOwnerData.administrative_unit_id || user.administrative_unit_id,
                  primary_owner_id: owner.id,
                  created_by: userId,
                  updated_by: userId
                },
                { transaction }
              );
            }
            coOwnerRecords.push(coOwner);
          }
        }

        // Create application
        const application = await this.models.Application.create(
          {
            user_id: owner.id,
            administrative_unit_id: landRecord.administrative_unit_id,
            application_type: data.application_type || "የመሬት ምዝገባ",
            status: "ረቂቅ",
            created_by: userId,
            updated_by: userId
          },
          { transaction }
        );

        // Validate land_level against max_land_levels
        const adminUnit = await this.models.AdministrativeUnit.findByPk(
          landRecord.administrative_unit_id,
          { transaction }
        );
        if (!adminUnit) throw new Error("አስተዳደራዊ ክፍል አልተገኘም።");
        if (landRecord.land_level > adminUnit.max_land_levels) {
          throw new Error("የመሬት ደረጃ ከአስተዳደር ክፍል ከፍተኛ ደረጃ መብለጥ አይችልም።");
        }

        // Create land record
        const landRecordData = await this.models.LandRecord.create(
          {
            ...landRecord,
            user_id: owner.id,
            application_id: application.id,
            registration_date: landRecord.registration_date || new Date()
          },
          { transaction }
        );

        // Create payments
        if (payments && payments.length) {
          for (const payment of payments) {
            await this.models.LandPayment.create(
              {
                ...payment,
                application_id: application.id,
                payment_date: payment.payment_date || null
              },
              { transaction }
            );
          }
        }

        // Create documents
        if (documents && documents.length) {
          for (const document of documents) {
            await this.models.Document.create(
              {
                ...document,
                application_id: application.id,
                document_status: "በመጠባበቅ ላይ"
              },
              { transaction }
            );
          }
        }

        return { application, owner, coOwners: coOwnerRecords, landRecord: landRecordData, payments, documents };
      } catch (error) {
        throw new Error(`መጠየቂያ መፍጠር አልተሳካም።: ${error.message}`);
      }
    });
  }

  async updateApplicationStatus(applicationId, status, userId) {
    return await sequelize.transaction(async (transaction) => {
      const application = await this.models.Application.findByPk(applicationId, { transaction });
      if (!application) throw new Error("መጠየቂያ አልተገኘም።");

      const validStatuses = ["ረቂቅ", "ቀርቧል", "ጸድቋል", "ውድቅ ተደርጓል"];
      if (!validStatuses.includes(status)) {
        throw new Error("ትክክል ያልሆነ የመጠየቂያ ሁኔታ።");
      }

      if (status === "ጸድቋል") {
        application.approved_by = userId;
      }
      await application.update({ status, updated_by: userId }, { transaction });

      return application;
    });
  }

  async updateDocumentStatus(documentId, status, userId) {
    return await sequelize.transaction(async (transaction) => {
      const document = await this.models.Document.findByPk(documentId, { transaction });
      if (!document) throw new Error("ሰነድ አልተገኘም።");

      const validStatuses = ["በመጠባበቅ ላይ", "ተረጋግጧል", "ውድቅ ተደርጓል"];
      if (!validStatuses.includes(status)) {
        throw new Error("ትክክል ያልሆነ የሰነዝ ሁኔታ።");
      }

      await document.update({ document_status: status }, { transaction });
      return document;
    });
  }

  async getApplicationDetails(applicationId) {
    const application = await this.models.Application.findByPk(applicationId, {
      include: [
        { model: this.models.User, as: "owner" },
        { model: this.models.User, as: "coOwners" },
        { model: this.models.LandRecord, as: "landRecord" },
        { model: this.models.LandPayment, as: "payments" },
        { model: this.models.Document, as: "documents" },
        { model: this.models.AdministrativeUnit, as: "administrativeUnit" }
      ]
    });
    if (!application) throw new Error("መጠየቂያ አልተገኘም።");
    return application;
  }
}

module.exports = ApplicationService;