const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Define root directories
const DOCUMENTS_DIR = path.join(__dirname, "..", "uploads", "documents");
const PICTURES_DIR = path.join(__dirname, "..", "uploads", "pictures");

// Ensure upload directories exist
[DOCUMENTS_DIR, PICTURES_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const destination =
      file.fieldname === "profile_picture" ? PICTURES_DIR : DOCUMENTS_DIR;
    cb(null, destination);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);

    // Keep Amharic + other Unicode letters
    const sanitizedName = path
      .basename(file.originalname, ext)
      .replace(/[/\\?%*:|"<>]/g, "")
      .slice(0, 100);

    const filename = `${sanitizedName}-${uniqueSuffix}${ext}`;

    // Preserve original Unicode name for DB matching
    file.originalnameUnicode = sanitizedName;

    // Save server-relative path for later
    file.serverRelativePath =
      file.fieldname === "profile_picture"
        ? `uploads/pictures/${filename}`
        : `uploads/documents/${filename}`;

    cb(null, filename);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "image/jpeg",
    "image/png",
  ];

  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExts = [".pdf", ".csv", ".xlsx", ".xls", ".jpeg", ".jpg", ".png"];

  if (allowedTypes.includes(file.mimetype) && allowedExts.includes(fileExt)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        "Invalid file type. Only PDF, CSV, Excel, JPEG, or PNG files are allowed."
      ),
      false
    );
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
});

module.exports = upload;
