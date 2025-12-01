const multer = require('multer');
const path = require('path');
const fs = require('fs');

// uploads 디렉토리 생성
const uploadsDir = path.join(__dirname, '..', 'uploads');
const modelsDir = path.join(uploadsDir, 'models');
const thumbnailsDir = path.join(uploadsDir, 'thumbnails');

// 디렉토리가 없으면 생성
[uploadsDir, modelsDir, thumbnailsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`[UPLOAD] Created directory: ${dir}`);
    }
});

// 파일 필터링 (모델 파일)
const modelFileFilter = (req, file, cb) => {
    const allowedExtensions = ['.fbx', '.obj', '.glb', '.gltf', '.dae', '.blend', '.3ds', '.max'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid file type. Allowed: ${allowedExtensions.join(', ')}`), false);
    }
};

// 파일 필터링 (썸네일 이미지)
const imageFileFilter = (req, file, cb) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error(`Invalid image type. Allowed: ${allowedExtensions.join(', ')}`), false);
    }
};

// 모델 파일 저장 설정
const modelStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, modelsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        // 파일명: userId_basename_timestamp.ext
        cb(null, `${req.userId}_${basename}_${uniqueSuffix}${ext}`);
    }
});

// 썸네일 저장 설정
const thumbnailStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, thumbnailsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        cb(null, `${req.userId}_${basename}_${uniqueSuffix}${ext}`);
    }
});

// Multer 인스턴스 생성
const uploadModel = multer({
    storage: modelStorage,
    fileFilter: modelFileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB 제한
    }
});

const uploadThumbnail = multer({
    storage: thumbnailStorage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB 제한
    }
});

// 모델 + 썸네일 동시 업로드
const uploadModelWithThumbnail = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            if (file.fieldname === 'model') {
                cb(null, modelsDir);
            } else if (file.fieldname === 'thumbnail') {
                cb(null, thumbnailsDir);
            } else {
                cb(new Error('Invalid field name'), false);
            }
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            const basename = path.basename(file.originalname, ext);
            cb(null, `${req.userId}_${basename}_${uniqueSuffix}${ext}`);
        }
    }),
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'model') {
            modelFileFilter(req, file, cb);
        } else if (file.fieldname === 'thumbnail') {
            imageFileFilter(req, file, cb);
        } else {
            cb(new Error('Invalid field name'), false);
        }
    },
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB 제한
    }
});

module.exports = {
    uploadModel,
    uploadThumbnail,
    uploadModelWithThumbnail
};
