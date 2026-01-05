const QRCode = require('qrcode');

/**
 * Generate QR code for land record with its documents
 */
const generateLandRecordQRService = async (landRecord) => {
  try {
    // Get documents from landRecord
    const documents = landRecord.documents || [];
    
    // Get plot numbers from documents (there could be multiple documents with different plot numbers)
    const plotNumbers = [...new Set(documents.map(doc => doc.plot_number).filter(Boolean))];
    const plotNumbersText = plotNumbers.length > 0 ? plotNumbers.join(', ') : 'N/A';
    
    // Get document storage information (take from first document if exists)
    const primaryDocument = documents[0] || {};
    
    // Get owner information (assuming landRecord has owners association)
    const owners = landRecord.owners || [];
    const ownerNames = owners.map(owner => `${owner.first_name} ${owner.middle_name}`).filter(Boolean);
    const ownerNamesText = ownerNames.length > 0 ? ownerNames.join(', ') : 'N/A';
    
    // Prepare QR text content
    const qrText = `
የመሬት መረጃ
========================
የይዞታ አይዲ: LR-${landRecord.id}
የካርታ ቁጥር: ${plotNumbersText}
የቦታው ስፋት: ${landRecord.area || 'N/A'} ካ.ሜ

ባለይዞታ መረጃ
-----------------
ባለይዞታ ስም: ${ownerNamesText}
${owners[0]?.id ? `አይዲ: ${owners[0].id}` : ''}
${owners[0]?.phone_number ? `ስልክ: ${owners[0].phone_number}` : ''}

የሰነድ/ፋይል መገኛ
----------------
ሸልፍ ቁ: ${primaryDocument.shelf_number || 'N/A'}
ሳጥን ቁ: ${primaryDocument.box_number || 'N/A'}
ኬንት/አቃፊ ቁ: ${primaryDocument.reference_number || 'N/A'}
የፋይል ቁ: ${primaryDocument.file_number || 'N/A'}
ካርታ የተሰጠበት ቀን: ${primaryDocument.issue_date || new Date().toLocaleDateString('en-GB')}
የሰነድ አይነት: ${documents.map(d => d.document_type).filter(Boolean).join(', ') || 'N/A'}

========================


`.trim();

    // Generate QR code
    const qrCodeBase64 = await QRCode.toDataURL(qrText, {
      errorCorrectionLevel: 'H',
      width: 350,
      margin: 2,
      color: {
        dark: '#1a237e', 
        light: '#FFFFFF'
      }
    });

    return {
      success: true,
      qrCode: qrCodeBase64,
      qrText: qrText,
      landRecord: {
        id: landRecord.id,
        plotNumbers: plotNumbers,
        area: landRecord.area,
        issueDate: primaryDocument.issue_date,
        ownerCount: owners.length,
        documentCount: documents.length,
        storageInfo: {
          shelfNumber: primaryDocument.shelf_number,
          boxNumber: primaryDocument.box_number,
          fileNumber: primaryDocument.file_number,
          referenceNumber: primaryDocument.reference_number
        }
      }
    };
  } catch (error) {
    console.error('Land Record QR generation error:', error);
    return {
      success: false,
      error: 'Failed to generate land record QR code'
    };
  }
};

module.exports = {
  generateLandRecordQRService
};