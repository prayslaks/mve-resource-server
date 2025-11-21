const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// S3 설정 (프로덕션용)
let s3Client = null;
let multerS3 = null;
const isS3Storage = process.env.STORAGE_TYPE === 's3';

let GetObjectCommand = null;
let getSignedUrl = null;

if (isS3Storage) {
    const { S3Client, GetObjectCommand: GOC } = require('@aws-sdk/client-s3');
    const { getSignedUrl: gsu } = require('@aws-sdk/s3-request-presigner');
    multerS3 = require('multer-s3');
    GetObjectCommand = GOC;
    getSignedUrl = gsu;

    // EC2 IAM Role 사용 시 credentials 생략 (자동으로 메타데이터에서 가져옴)
    // 환경변수에 AWS_ACCESS_KEY_ID가 있으면 명시적으로 사용
    const s3Config = {
        region: process.env.AWS_REGION || 'ap-northeast-2'
    };

    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        s3Config.credentials = {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        };
    }

    s3Client = new S3Client(s3Config);
}

// 파일 필터 (공통)
const fileFilter = (req, file, cb) => {
    const allowedMimes = ['audio/aac', 'audio/aacp', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a'];
    const allowedExts = ['.aac', '.m4a', '.mp3', '.wav'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only AAC, M4A, MP3, WAV files are allowed.'), false);
    }
};

// 스토리지 설정 (환경별 분기)
let storage;

if (isS3Storage) {
    // 프로덕션: S3 스토리지
    storage = multerS3({
        s3: s3Client,
        bucket: process.env.S3_BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, `audio/${uniqueSuffix}${ext}`);
        }
    });
} else {
    // 개발: 로컬 디스크 스토리지
    storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const uploadDir = path.join(process.env.FILE_SERVER_PATH || './files', 'audio');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }
            cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, uniqueSuffix + ext);
        }
    });
}

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB 제한
    }
});

const router = express.Router();

// 모든 음원 라우트에 JWT 검증 미들웨어 적용 (로그인한 유저만 접근 가능)
router.use(verifyToken);

// ============================================
// 공용 음원 API (JWT 인증 필요 - 로그인한 유저만 접근)
// ============================================

// 1. 음원 목록 조회 (모든 유저 접근 가능)
router.get('/list', async (req, res) => {
    try {
        console.log('[AUDIO-LIST] 음원 목록 조회 시도:', {
            timestamp: new Date().toISOString()
        });

        const result = await pool.query(
            'SELECT id, title, artist, file_path, file_size, duration, format, created_at FROM audio_files ORDER BY title ASC'
        );

        console.log('[AUDIO-LIST] SUCCESS:', { count: result.rows.length });

        res.json({
            success: true,
            count: result.rows.length,
            audio_files: result.rows
        });

    } catch (error) {
        console.error('[AUDIO-LIST] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        if (error.code) {
            return res.status(500).json({
                success: false,
                error: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

// 2. 음원 스트리밍 URL 획득 (S3: Presigned URL, 로컬: 내부 URL)
router.get('/stream/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[AUDIO-STREAM] 스트리밍 시도:', {
            id,
            storage: isS3Storage ? 's3' : 'local',
            timestamp: new Date().toISOString()
        });

        // DB에서 파일 경로 조회
        const result = await pool.query(
            'SELECT file_path, file_size, format, title FROM audio_files WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            console.log('[AUDIO-STREAM] ERROR: 음원 없음', { id });
            return res.status(404).json({
                success: false,
                error: 'AUDIO_NOT_FOUND',
                message: 'Audio file not found'
            });
        }

        const audioFile = result.rows[0];

        // S3 스토리지: Presigned URL 반환
        if (isS3Storage) {
            const command = new GetObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: audioFile.file_path
            });

            const presignedUrl = await getSignedUrl(s3Client, command, {
                expiresIn: 3600 // 1시간 유효
            });

            console.log('[AUDIO-STREAM] S3 Presigned URL 생성:', {
                id,
                title: audioFile.title,
                expiresIn: '1h'
            });

            return res.json({
                success: true,
                stream_url: presignedUrl,
                audio_file: {
                    id: parseInt(id),
                    title: audioFile.title,
                    format: audioFile.format,
                    file_size: audioFile.file_size
                },
                expires_in: 3600
            });
        }

        // 로컬 스토리지: URL 반환 (S3와 동일한 응답 형식)
        const filePath = path.join(process.env.FILE_SERVER_PATH || './files', audioFile.file_path);

        // 파일 존재 확인
        if (!fs.existsSync(filePath)) {
            console.log('[AUDIO-STREAM] ERROR: 파일 없음', { filePath });
            return res.status(404).json({
                success: false,
                error: 'FILE_NOT_FOUND',
                message: 'Audio file not found on server'
            });
        }

        const stat = fs.statSync(filePath);

        console.log('[AUDIO-STREAM] Local URL 생성:', {
            id,
            title: audioFile.title
        });

        // S3와 동일한 형식으로 URL 반환
        return res.json({
            success: true,
            stream_url: `/api/audio/file/${id}`,
            audio_file: {
                id: parseInt(id),
                title: audioFile.title,
                format: audioFile.format,
                file_size: stat.size
            },
            storage_type: 'local'
        });

    } catch (error) {
        console.error('[AUDIO-STREAM] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'STREAMING_ERROR',
                message: 'Failed to stream audio file'
            });
        }
    }
});

// 3. 로컬 파일 직접 스트리밍 (Range Request 지원)
router.get('/file/:id', async (req, res) => {
    try {
        const { id } = req.params;

        // DB에서 파일 경로 조회
        const result = await pool.query(
            'SELECT file_path, file_size, format, title FROM audio_files WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'AUDIO_NOT_FOUND',
                message: 'Audio file not found'
            });
        }

        const audioFile = result.rows[0];
        const filePath = path.join(process.env.FILE_SERVER_PATH || './files', audioFile.file_path);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'FILE_NOT_FOUND',
                message: 'Audio file not found on server'
            });
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        // Range Request 처리
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;

            const fileStream = fs.createReadStream(filePath, { start, end });

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': `audio/${audioFile.format}`,
            });

            fileStream.pipe(res);
        } else {
            res.writeHead(200, {
                'Content-Length': fileSize,
                'Content-Type': `audio/${audioFile.format}`,
                'Accept-Ranges': 'bytes'
            });

            fs.createReadStream(filePath).pipe(res);
        }

    } catch (error) {
        console.error('[AUDIO-FILE] EXCEPTION:', error.message);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'STREAMING_ERROR',
                message: 'Failed to stream audio file'
            });
        }
    }
});

// 4. 음원 업로드
router.post('/upload', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'NO_FILE',
                message: 'No audio file provided'
            });
        }

        const { title, artist, duration } = req.body;

        if (!title) {
            // 파일 삭제
            fs.unlinkSync(req.file.path);
            return res.status(400).json({
                success: false,
                error: 'MISSING_TITLE',
                message: 'Title is required'
            });
        }

        console.log('[AUDIO-UPLOAD] 음원 업로드 시도:', {
            filename: req.file.filename,
            originalname: req.file.originalname,
            size: req.file.size,
            title,
            artist,
            timestamp: new Date().toISOString()
        });

        // 파일 포맷 추출
        const ext = path.extname(req.file.originalname).toLowerCase().replace('.', '');
        const format = ext === 'm4a' ? 'aac' : ext;

        // 파일 경로 (S3 vs 로컬)
        let filePath;
        if (isS3Storage) {
            // S3: key 또는 location 사용
            filePath = req.file.key || req.file.location;
        } else {
            // 로컬: 상대 경로
            filePath = 'audio/' + req.file.filename;
        }

        // DB에 저장
        const result = await pool.query(
            `INSERT INTO audio_files (title, artist, file_path, file_size, duration, format)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, title, artist, file_path, file_size, duration, format, created_at`,
            [
                title,
                artist || null,
                filePath,
                req.file.size,
                duration ? parseFloat(duration) : null,
                format
            ]
        );

        console.log('[AUDIO-UPLOAD] SUCCESS:', {
            id: result.rows[0].id,
            title: result.rows[0].title
        });

        res.status(201).json({
            success: true,
            message: 'Audio file uploaded successfully',
            audio_file: result.rows[0]
        });

    } catch (error) {
        console.error('[AUDIO-UPLOAD] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        // 에러 발생 시 업로드된 파일 삭제 (로컬만)
        if (!isS3Storage && req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        // S3의 경우 파일은 이미 업로드됨 - 필요시 DeleteObject 호출

        if (error.code) {
            return res.status(500).json({
                success: false,
                error: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            error: 'UPLOAD_ERROR',
            message: error.message || 'Failed to upload audio file'
        });
    }
});

// 5. 음원 검색 (제목 또는 아티스트)
router.get('/search/:query', async (req, res) => {
    try {
        const { query } = req.params;

        console.log('[AUDIO-SEARCH] 음원 검색 시도:', {
            query,
            timestamp: new Date().toISOString()
        });

        const result = await pool.query(
            `SELECT id, title, artist, file_path, file_size, duration, format, created_at
             FROM audio_files
             WHERE title ILIKE $1 OR artist ILIKE $1
             ORDER BY title ASC`,
            [`%${query}%`]
        );

        console.log('[AUDIO-SEARCH] SUCCESS:', { query, count: result.rows.length });

        res.json({
            success: true,
            count: result.rows.length,
            audio_files: result.rows
        });

    } catch (error) {
        console.error('[AUDIO-SEARCH] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        if (error.code) {
            return res.status(500).json({
                success: false,
                error: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

// 6. 특정 음원 정보 조회 (반드시 맨 마지막에 위치해야 함 - :id가 다른 경로를 가로채지 않도록)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[AUDIO-INFO] 음원 정보 조회 시도:', {
            id,
            timestamp: new Date().toISOString()
        });

        const result = await pool.query(
            'SELECT id, title, artist, file_path, file_size, duration, format, created_at FROM audio_files WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            console.log('[AUDIO-INFO] ERROR: 음원 없음', { id });
            return res.status(404).json({
                success: false,
                error: 'AUDIO_NOT_FOUND',
                message: 'Audio file not found'
            });
        }

        console.log('[AUDIO-INFO] SUCCESS:', { id, title: result.rows[0].title });

        res.json({
            success: true,
            audio_file: result.rows[0]
        });

    } catch (error) {
        console.error('[AUDIO-INFO] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        if (error.code) {
            return res.status(500).json({
                success: false,
                error: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

module.exports = router;
