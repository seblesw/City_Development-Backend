const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { Op } = require("sequelize");
const { LandRecord } = require("../models");

const ROOT_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "documents");

// Ensure root folder exists
if (!fs.existsSync(ROOT_UPLOAD_DIR)) {
  fs.mkdirSync(ROOT_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      // Get land record ID from body, params, or query
      const landRecordId = req.body.land_record_id || 
                         req.params.land_record_id || 
                         req.query.land_record_id;

      if (!landRecordId) {
        return cb(new Error("የመሬት መዝገብ መለያ ቁጥር ያስፈልጋል"), null);
      }

      // Verify land record exists and get parcel number
      const landRecord = await LandRecord.findOne({
        where: {
          id: landRecordId,
          deletedAt: { [Op.eq]: null }
        },
        attributes: ['id', 'parcel_number']
      });

      if (!landRecord) {
        return cb(new Error("የመሬት መዝገብ አልተገኘም"), null);
      }

      // Create folder using both ID and parcel number for easy identification
      const folderName = `${landRecord.id}-${landRecord.parcel_number}`;
      const folderPath = path.join(ROOT_UPLOAD_DIR, folderName);

      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      cb(null, folderPath);
    } catch (error) {
      cb(error, null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const originalName = path.parse(file.originalname).name;
    
    // Create filename with original name + timestamp
    cb(null, `${originalName}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document" // .docx
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("የሚፈቀዱ ፋይል አይነቶች: PDF, JPEG, PNG, DOC, DOCX"), false);
  }
};

const limits = {
  fileSize: 10 * 1024 * 1024, // 10MB
  files: 10 // Max 10 files per upload
};

const upload = multer({
  storage,
  fileFilter,
  limits
});

// Middleware to handle errors properly
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      status: "error",
      message: err.code === "LIMIT_FILE_SIZE" 
        ? "ፋይሉ በጣም ትልቅ ነው (ከ10MB በላይ)"
        : "የፋይል ስህተት: " + err.message
    });
  } else if (err) {
    return res.status(400).json({
      status: "error",
      message: err.message
    });
  }
  next();
};

module.exports = {
  upload,
  handleUploadErrors
};