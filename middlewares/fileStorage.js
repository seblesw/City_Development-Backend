const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ROOT_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "documents");

// Ensure root folder exists
if (!fs.existsSync(ROOT_UPLOAD_DIR)) {
  fs.mkdirSync(ROOT_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const recordId =
      req.body.land_record_id || req.query.land_record_id || "ሰነድ";
    const folderPath = path.join(ROOT_UPLOAD_DIR, `${recordId}`);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // Correct MIME for .xlsx
    "application/vnd.ms-excel", // For older .xls files
    "image/jpeg",
    "image/png"
  ];
  
  // Also check file extension as additional validation
  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.pdf', '.csv', '.xlsx', '.xls', '.jpeg', '.jpg', '.png'];

  if (allowedTypes.includes(file.mimetype) && allowedExts.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error("ፋይሉ PDF፣ CSV፣ XLSX, JPEG ወይም PNG አይነት መሆን አለበት።"), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  }
});

module.exports = upload;