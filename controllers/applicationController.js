// controllers/ApplicationController.js
const ApplicationService = require("../services/applicationService");

class ApplicationController {
  constructor(models) {
    this.service = new ApplicationService(models);
  }

  async createApplication(req, res) {
    try {
      const data = req.body;
      const userId = req.user.id; // From auth middleware
      const result = await this.service.createApplication(data, userId);
      return res.status(201).json({
        success: true,
        message: "መጠየቂያ በተሳካ ሁኔታ ተፈጥሯል።",
        data: result
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateApplicationStatus(req, res) {
    try {
      const { applicationId } = req.params;
      const { status } = req.body;
      const userId = req.user.id;

      // Restrict to managers (role_id: 1 or 2)
      if (![1, 2].includes(req.user.role_id)) {
        return res.status(403).json({
          success: false,
          message: "ይህን እርምጃ ለመፈፀም ፈቃድ የሎትም።"
        });
      }

      const application = await this.service.updateApplicationStatus(applicationId, status, userId);
      return res.status(200).json({
        success: true,
        message: "የመጠየቂያ ሁኔታ ተዘምኗል።",
        data: application
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async updateDocumentStatus(req, res) {
    try {
      const { documentId } = req.params;
      const { status } = req.body;
      const userId = req.user.id;

      // Restrict to managers
      if (![1, 2].includes(req.user.role_id)) {
        return res.status(403).json({
          success: false,
          message: "ይህን እርምጃ ለመፈፀም ፈቃድ የሎትም።"
        });
      }

      const document = await this.service.updateDocumentStatus(documentId, status, userId);
      return res.status(200).json({
        success: true,
        message: "የሰነድ ሁኔታ ተዘምኗል።",
        data: document
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  async getApplicationDetails(req, res) {
    try {
      const { applicationId } = req.params;
      const application = await this.service.getApplicationDetails(applicationId);
      return res.status(200).json({
        success: true,
        message: "የመጠየቂያ ዝርዝሮች ተገኝተዋል።",
        data: application
      });
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = ApplicationController;