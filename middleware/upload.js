/**
 * File upload middleware using multer.
 * Documents/uploads are saved to public/uploads with a random filename.
 */
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomBytes(16).toString('hex') + ext;
    cb(null, name);
  }
});

// Only allow documents & images
const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'application/pdf',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only images, PDF and Word documents are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

module.exports = { upload };