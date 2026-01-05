const QRCode = require("qrcode");

/**
 * Generate QR code for document
 */
const generateDocumentQR = async (document) => {
  try {
    // Create simple text format for QR code
    const qrText = `
DOCUMENT TRACKING
Plot: ${document.plot_number}
Shelf: ${document.shelf_number || "N/A"}
Box: ${document.box_number || "N/A"}
File: ${document.file_number || "N/A"}
Ref: ${document.reference_number || "N/A"}
ID: ${document.id}
Type: ${document.document_type || "N/A"}
Unit: ${document.administrative_unit_id || ""}
`.trim();

    // Generate QR code as base64 data URL
    const qrCodeBase64 = await QRCode.toDataURL(qrText, {
      errorCorrectionLevel: "H",
      width: 300,
      margin: 1,
    });

    return {
      success: true,
      qrCode: qrCodeBase64,
      qrText: qrText,
      document: {
        id: document.id,
        plotNumber: document.plot_number,
        shelfNumber: document.shelf_number,
        boxNumber: document.box_number,
        fileNumber: document.file_number,
        referenceNumber: document.reference_number,
        documentType: document.document_type,
        unitId: document.administrative_unit_id,
      },
    };
  } catch (error) {
    console.error("QR generation error:", error);
    return {
      success: false,
      error: "Failed to generate QR code",
    };
  }
};

/**
 * Generate printable QR code (SVG format)
 */
const generatePrintableQR = async (document) => {
  try {
    const qrText = `DOC:${document.id}|PLOT:${document.plot_number}|SHELF:${
      document.shelf_number || ""
    }|BOX:${document.box_number || ""}|FILE:${document.file_number || ""}|REF:${
      document.reference_number || ""
    }`;

    const svgString = await QRCode.toString(qrText, {
      type: "svg",
      errorCorrectionLevel: "H",
      width: 200,
      margin: 1,
    });

    return {
      success: true,
      svg: svgString,
    };
  } catch (error) {
    console.error("Printable QR error:", error);
    return {
      success: false,
      error: "Failed to generate printable QR",
    };
  }
};

/**
 * Get QR text data only (for API display)
 */
const getQRTextData = async (document) => {
  try {
    const qrText = `PLOT:${document.plot_number}|SHELF:${
      document.shelf_number || ""
    }|BOX:${document.box_number || ""}|FILE:${document.file_number || ""}|REF:${
      document.reference_number || ""
    }|ID:${document.id}`;

    return {
      success: true,
      qrText: qrText,
      documentInfo: {
        plotNumber: document.plot_number,
        shelfNumber: document.shelf_number,
        boxNumber: document.box_number,
        fileNumber: document.file_number,
        referenceNumber: document.reference_number,
        documentId: document.id,
      },
    };
  } catch (error) {
    console.error("QR text error:", error);
    return {
      success: false,
      error: "Failed to generate QR text",
    };
  }
};

module.exports = {
  generateDocumentQR,
  generatePrintableQR,
  getQRTextData,
};
