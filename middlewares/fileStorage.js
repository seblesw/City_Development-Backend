const multer = require("multer");
const path = require("path");
const fs = require("fs");

const ROOT_UPLOAD_DIR = path.join(__dirname, "..", "uploads", "documents");

// Ensure upload directory exists
if (!fs.existsSync(ROOT_UPLOAD_DIR)) {
  fs.mkdirSync(ROOT_UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const recordId = req.body.land_record_id || req.params.id || "files";
    const safeRecordId = recordId.toString().replace(/[^a-zA-Z0-9-_]/g, "");
    const folderPath = path.join(ROOT_UPLOAD_DIR, safeRecordId);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    cb(null, folderPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const sanitizedName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_.]/g, "")
      .slice(0, 100);
    const filename = `${sanitizedName}-${uniqueSuffix}${ext}`;
    
    // Add server-relative path to the file object
    file.serverRelativePath = `uploads/documents/${req.body.land_record_id || req.params.id || "uncategorized"}/${filename}`;
    
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "image/jpeg",
    "image/png"
  ];
  
  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = ['.pdf', '.csv', '.xlsx', '.xls', '.jpeg', '.jpg', '.png'];

  if (allowedTypes.includes(file.mimetype) && allowedExts.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF, CSV, Excel, JPEG, or PNG files are allowed."), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,

});

module.exports = upload;