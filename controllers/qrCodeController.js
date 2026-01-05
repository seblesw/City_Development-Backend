const db = require('../models');
const { generateDocumentQR, generatePrintableQR, getQRTextData } = require('../services/qrCodeService');

/**
 * Generate QR code for document
 */
const generateQR = async (req, res) => {
  try {
    const { documentId } = req.params;
    
    // Find document with all required attributes
    const document = await db.Document.findByPk(documentId, {
      attributes: [
        'id', 'plot_number', 'shelf_number', 'box_number', 
        'file_number', 'reference_number', 'document_type',
        'administrative_unit_id'
      ]
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    const result = await generateDocumentQR(document);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Controller error (generateQR):', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating QR code'
    });
  }
};

/**
 * Get printable QR code (SVG)
 */
const getPrintableQR = async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const document = await db.Document.findByPk(documentId, {
      attributes: [
        'id', 'plot_number', 'shelf_number', 'box_number', 
        'file_number', 'reference_number'
      ]
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    const result = await generatePrintableQR(document);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error
      });
    }

    // Set SVG content type
    res.set('Content-Type', 'image/svg+xml');
    res.send(result.svg);
  } catch (error) {
    console.error('Controller error (getPrintableQR):', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating printable QR'
    });
  }
};

/**
 * Get QR code as PNG file download
 */
const downloadQR = async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const document = await db.Document.findByPk(documentId, {
      attributes: [
        'id', 'plot_number', 'shelf_number', 'box_number', 
        'file_number', 'reference_number', 'document_type',
        'administrative_unit_id'
      ]
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    const result = await generateDocumentQR(document);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error
      });
    }

    // Extract base64 data and convert to buffer
    const base64Data = result.qrCode.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Set download headers
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="document-${document.id}-qr.png"`,
      'Content-Length': buffer.length
    });

    res.send(buffer);
  } catch (error) {
    console.error('Controller error (downloadQR):', error);
    res.status(500).json({
      success: false,
      message: 'Server error while downloading QR code'
    });
  }
};

/**
 * Get QR code text data only
 */
const getQRText = async (req, res) => {
  try {
    const { documentId } = req.params;
    
    const document = await db.Document.findByPk(documentId, {
      attributes: [
        'id', 'plot_number', 'shelf_number', 'box_number', 
        'file_number', 'reference_number'
      ]
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    const result = await getQRTextData(document);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Controller error (getQRText):', error);
    res.status(500).json({
      success: false,
      message: 'Server error while getting QR text'
    });
  }
};

module.exports = {
  generateQR,
  getPrintableQR,
  downloadQR,
  getQRText
};