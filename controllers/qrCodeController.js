const { generateLandRecordQRService } = require("../services/qrCodeService");
const { LandRecord, Document, User } = require("../models");
/**
 * Generate QR code for land record
 */
const generateLandRecordQR = async (req, res) => {
  try {
    const { landRecordId } = req.params;

    // Find land record with its documents and owners
    const landRecord = await LandRecord.findByPk(landRecordId, {
      where: {
        deletedAt: null,
        administrative_unit_id: req.user.administrative_unit_id,
      },
      include: [
        {
          model: Document,
          as: "documents",
          attributes: [
            "id",
            "plot_number",
            "shelf_number",
            "box_number",
            "file_number",
            "reference_number",
            "document_type",
            "verified_plan_number",
          ],
        },
        {
          model: User,
          as: "owners",
          through: [{ attributes: [] }],
          attributes: ["id", "first_name", "middle_name", "phone_number"],
        },
      ],
    });

    if (!landRecord) {
      return res.status(404).json({
        success: false,
        message: "Land record not found",
      });
    }

    // Generate QR code
    const result = await generateLandRecordQRService(landRecord);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error,
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Controller error (generateLandRecordQR):", error);
    res.status(500).json({
      success: false,
      message: "Server error while generating land record QR code",
    });
  }
};

const downloadLandRecordQR = async (req, res) => {
  try {
    const { landRecordId } = req.params;

    const landRecord = await LandRecord.findByPk(landRecordId, {
      where: {
        deletedAt: null,
        administrative_unit_id: req.user.administrative_unit_id,
      },
      include: [
        {
          model: Document,
          as: "documents",
          attributes: [
            "id",
            "plot_number",
            "shelf_number",
            "box_number",
            "file_number",
            "reference_number",
            "document_type",
          ],
        },
        {
          model: User,
          as: "owners",
          through: [{ attributes: [] }],
          attributes: ["id", "first_name", "middle_name"],
        },
      ],
    });

    if (!landRecord) {
      return res.status(404).json({
        success: false,
        message: "Land record not found",
      });
    }

    const result = await generateLandRecordQRService(landRecord);

    if (!result.success) {
      // Return JSON error BEFORE setting PNG headers
      return res.status(500).json({
        success: false,
        message: result.error,
      });
    }

    // Extract base64 data
    const base64Match = result.qrCode.match(/^data:image\/png;base64,(.+)$/);
    if (!base64Match) {
      return res.status(500).json({
        success: false,
        message: "Invalid QR code format",
      });
    }

    const base64Data = base64Match[1];
    const buffer = Buffer.from(base64Data, "base64");

    // Generate filename (handle special characters)
    let ownerName = "unknown";
    if (landRecord.owners && landRecord.owners.length > 0) {
      ownerName = (
        landRecord.owners[0]?.full_name ||
        landRecord.owners[0]?.first_name ||
        "unknown"
      )
        .trim()
        .replace(/[^\w\s-]/g, "") // Remove special characters
        .replace(/\s+/g, "-")     // Replace spaces with hyphens
        .toLowerCase()
        .substring(0, 50);        // Limit length
    }

    const filename = `land-record-${landRecordId}-${ownerName}.png`;

    // Set download headers
    res.set({
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": buffer.length,
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    });

    // Send the buffer
    res.send(buffer);
  } catch (error) {
    console.error("Controller error (downloadLandRecordQR):", error);
    
    // Check if headers have already been sent
    if (res.headersSent) {
      return res.end();
    }
    
    res.status(500).json({
      success: false,
      message: "Server error while downloading land record QR code",
      error: error.message,
    });
  }
};

module.exports = {
  generateLandRecordQR,
  downloadLandRecordQR,
};
