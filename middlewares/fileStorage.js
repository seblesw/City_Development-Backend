const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Define root directories
const DOCUMENTS_DIR = path.join(__dirname, "..", "uploads", "documents");
const PICTURES_DIR = path.join(__dirname, "..", "uploads", "pictures");

// Ensure upload directories exist
[DOCUMENTS_DIR, PICTURES_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Determine destination based on field name
    const destination = file.fieldname === 'profile_picture' 
      ? PICTURES_DIR 
      : DOCUMENTS_DIR;
    
    cb(null, destination);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const sanitizedName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9-_.]/g, "")
      .slice(0, 100);
    const filename = `${sanitizedName}-${uniqueSuffix}${ext}`;
    
    // Add server-relative path to the file object
    file.serverRelativePath = file.fieldname === 'profile_picture'
      ? `uploads/pictures/${filename}`
      : `uploads/documents/${filename}`;
    
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
//export the multer upload middleware
const upload = multer({
  storage: storage,
  fileFilter: fileFilter
});

module.exports = upload;