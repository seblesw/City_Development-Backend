const { generateLandRecordQRService } = require('../services/qrCodeService');
const { LandRecord, Document, User } = require('../models');
/**
 * Generate QR code for land record
 */
const generateLandRecordQR = async (req, res) => {
  try {
    const { landRecordId } = req.params;

    
    // Find land record with its documents and owners
    const landRecord = await LandRecord.findByPk(landRecordId, {
        where: { deletedAt: null ,
            administrative_unit_id: req.user.administrative_unit_id
        },
      include: [
        {
          model: Document,
          as: 'documents',
          attributes: [
            'id', 'plot_number', 'shelf_number', 'box_number', 
            'file_number', 'reference_number', 'document_type',
            'verified_plan_number'
          ]
        },
        {
          model: User,
          as: 'owners',
          through: [{ attributes: [] }],
          attributes: ['id', 'first_name', 'middle_name', 'phone_number']
        }
      ]
    });

    if (!landRecord) {
      return res.status(404).json({
        success: false,
        message: 'Land record not found'
      });
    }

    // Generate QR code
    const result = await generateLandRecordQRService(landRecord);
    
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
    console.error('Controller error (generateLandRecordQR):', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating land record QR code'
    });
  }
};

/**
 * Download land record QR code as PNG
 */
const downloadLandRecordQR = async (req, res) => {
  try {
    const { landRecordId } = req.params;
    
    const landRecord = await LandRecord.findByPk(landRecordId, {
      include: [
        {
          model: Document,
          as: 'documents',
          attributes: [
            'id', 'plot_number', 'shelf_number', 'box_number', 
            'file_number', 'reference_number', 'document_type'
          ]
        },
        {
          model: Owner,
          as: 'owners',
          attributes: ['id', 'full_name', 'first_name', 'last_name']
        }
      ]
    });

    if (!landRecord) {
      return res.status(404).json({
        success: false,
        message: 'Land record not found'
      });
    }

    const result = await generateLandRecordQR(landRecord);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.error
      });
    }

    // Convert base64 to buffer for download
    const base64Data = result.qrCode.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Generate filename
    const ownerName = landRecord.owners[0]?.full_name || 
                     landRecord.owners[0]?.first_name || 
                     'unknown';
    const filename = `land-record-${landRecordId}-${ownerName.replace(/\s+/g, '-')}.png`;

    // Set download headers
    res.set({
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length
    });

    res.send(buffer);
  } catch (error) {
    console.error('Controller error (downloadLandRecordQR):', error);
    res.status(500).json({
      success: false,
      message: 'Server error while downloading land record QR code'
    });
  }
};

module.exports = {
  generateLandRecordQR,
  downloadLandRecordQR
};