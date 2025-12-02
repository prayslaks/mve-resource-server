const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const { uploadModel, uploadThumbnail, uploadModelWithThumbnail } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const redisClient = require('../redis-client');

const router = express.Router();

// ============================================
// AI 서버 전용 API (JWT 검증 없음, Redis Job 검증)
// ============================================

// [DEV ONLY] AI 서버 테스트용 - 인증 없는 모델 업로드
// WARNING: 프로덕션 환경에서는 반드시 제거할 것!
router.post('/dev/upload-from-ai', uploadModelWithThumbnail.fields([
    { name: 'model', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('[DEV-AI-UPLOAD] 개발용 AI 서버 업로드 시도:', {
            hasModel: !!req.files?.model,
            hasThumbnail: !!req.files?.thumbnail,
            body: req.body,
            timestamp: new Date().toISOString()
        });

        // 프로덕션 환경 체크
        if (process.env.NODE_ENV === 'production') {
            console.log('[DEV-AI-UPLOAD] ERROR: 프로덕션 환경에서는 사용 불가');

            // 업로드된 파일 삭제
            if (req.files) {
                Object.values(req.files).flat().forEach(file => {
                    fs.unlink(file.path, err => {
                        if (err) console.error('[DEV-AI-UPLOAD] Failed to delete file:', err);
                    });
                });
            }

            return res.status(403).json({
                success: false,
                error: 'DEV_ONLY_API',
                message: 'This API is for development only'
            });
        }

        // 파일 검증
        if (!req.files || !req.files.model || req.files.model.length === 0) {
            console.log('[DEV-AI-UPLOAD] ERROR: 모델 파일 누락');
            return res.status(400).json({
                success: false,
                error: 'MISSING_MODEL_FILE',
                message: 'Model file is required'
            });
        }

        const modelFile = req.files.model[0];
        const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

        // user_id는 body에서 받거나 기본값 1 사용 (개발용)
        const user_id = req.body.user_id || 1;
        const model_name = req.body.model_name ||
                          req.body.prompt?.substring(0, 100) ||
                          path.basename(modelFile.originalname, path.extname(modelFile.originalname));

        // 파일 경로를 상대 경로로 저장
        const file_path = path.relative(
            path.join(__dirname, '..'),
            modelFile.path
        ).replace(/\\/g, '/');

        const thumbnail_path = thumbnailFile ? path.relative(
            path.join(__dirname, '..'),
            thumbnailFile.path
        ).replace(/\\/g, '/') : null;

        // DB에 모델 정보 저장
        const result = await pool.query(
            `INSERT INTO user_models (user_id, model_name, file_path, file_size, thumbnail_path)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, model_name, file_path, file_size, thumbnail_path, created_at`,
            [user_id, model_name, file_path, modelFile.size, thumbnail_path]
        );

        console.log('[DEV-AI-UPLOAD] SUCCESS:', {
            modelId: result.rows[0].id,
            modelName: result.rows[0].model_name,
            userId: user_id,
            fileSize: modelFile.size,
            hasThumbnail: !!thumbnailFile
        });

        res.status(201).json({
            success: true,
            message: 'Model uploaded successfully (DEV MODE)',
            model: result.rows[0]
        });

    } catch (error) {
        console.error('[DEV-AI-UPLOAD] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        // 업로드된 파일 삭제 (에러 발생 시)
        if (req.files) {
            Object.values(req.files).flat().forEach(file => {
                fs.unlink(file.path, err => {
                    if (err) console.error('[DEV-AI-UPLOAD] Failed to delete file:', err);
                });
            });
        }

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

// AI 서버에서 생성된 모델 업로드
router.post('/upload-from-ai', uploadModelWithThumbnail.fields([
    { name: 'model', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
    try {
        const { job_id, job_secret } = req.body;

        console.log('[AI-UPLOAD] AI 서버 업로드 시도:', {
            job_id,
            hasModel: !!req.files?.model,
            hasThumbnail: !!req.files?.thumbnail,
            timestamp: new Date().toISOString()
        });

        // job_id 검증
        if (!job_id || !job_secret) {
            console.log('[AI-UPLOAD] ERROR: job_id 또는 job_secret 누락');

            // 업로드된 파일 삭제
            if (req.files) {
                Object.values(req.files).flat().forEach(file => {
                    fs.unlink(file.path, err => {
                        if (err) console.error('[AI-UPLOAD] Failed to delete file:', err);
                    });
                });
            }

            return res.status(400).json({
                success: false,
                error: 'MISSING_JOB_CREDENTIALS',
                message: 'job_id and job_secret are required'
            });
        }

        // Redis에서 job 정보 확인
        const jobKey = `job:${job_id}`;
        const jobData = await redisClient.get(jobKey);

        if (!jobData) {
            console.log('[AI-UPLOAD] ERROR: Job not found', { job_id });

            // 업로드된 파일 삭제
            if (req.files) {
                Object.values(req.files).flat().forEach(file => {
                    fs.unlink(file.path, err => {
                        if (err) console.error('[AI-UPLOAD] Failed to delete file:', err);
                    });
                });
            }

            return res.status(404).json({
                success: false,
                error: 'JOB_NOT_FOUND',
                message: 'Job not found or expired'
            });
        }

        const job = JSON.parse(jobData);

        // Secret 검증
        if (job.secret !== job_secret) {
            console.log('[AI-UPLOAD] ERROR: Invalid job secret', { job_id });

            // 업로드된 파일 삭제
            if (req.files) {
                Object.values(req.files).flat().forEach(file => {
                    fs.unlink(file.path, err => {
                        if (err) console.error('[AI-UPLOAD] Failed to delete file:', err);
                    });
                });
            }

            return res.status(403).json({
                success: false,
                error: 'INVALID_JOB_SECRET',
                message: 'Invalid job secret'
            });
        }

        // 상태 검증: 이미 완료되었거나 실패한 작업인지 확인
        if (job.status === 'completed') {
            console.log('[AI-UPLOAD] ERROR: Job already completed', { job_id, model_id: job.model_id });

            // 업로드된 파일 삭제
            if (req.files) {
                Object.values(req.files).flat().forEach(file => {
                    fs.unlink(file.path, err => {
                        if (err) console.error('[AI-UPLOAD] Failed to delete file:', err);
                    });
                });
            }

            return res.status(409).json({
                success: false,
                error: 'JOB_ALREADY_COMPLETED',
                message: 'This job has already been completed',
                model_id: job.model_id
            });
        }

        if (job.status === 'failed') {
            console.log('[AI-UPLOAD] WARN: Job was already marked as failed, allowing retry', { job_id });
            // failed 상태는 재시도를 허용 (AI 서버가 재시도하는 경우)
        }

        // 파일 검증
        if (!req.files || !req.files.model || req.files.model.length === 0) {
            console.log('[AI-UPLOAD] ERROR: 모델 파일 누락');

            // Redis 상태 업데이트: failed
            job.status = 'failed';
            job.error = 'Model file missing';
            await redisClient.setEx(jobKey, 1800, JSON.stringify(job)); // 30분

            return res.status(400).json({
                success: false,
                error: 'MISSING_MODEL_FILE',
                message: 'Model file is required'
            });
        }

        const modelFile = req.files.model[0];
        const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

        // 모델명은 job의 prompt 또는 파일명에서 추출
        const model_name = job.prompt.substring(0, 100) || path.basename(modelFile.originalname, path.extname(modelFile.originalname));

        // 파일 경로를 상대 경로로 저장
        const file_path = path.relative(
            path.join(__dirname, '..'),
            modelFile.path
        ).replace(/\\/g, '/');

        const thumbnail_path = thumbnailFile ? path.relative(
            path.join(__dirname, '..'),
            thumbnailFile.path
        ).replace(/\\/g, '/') : null;

        // DB에 모델 정보 저장
        const result = await pool.query(
            `INSERT INTO user_models (user_id, model_name, file_path, file_size, thumbnail_path)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, model_name, file_path, file_size, thumbnail_path, created_at`,
            [job.user_id, model_name, file_path, modelFile.size, thumbnail_path]
        );

        // Redis 상태 업데이트: completed
        job.status = 'completed';
        job.model_id = result.rows[0].id;
        job.completed_at = new Date().toISOString();
        await redisClient.setEx(jobKey, 1800, JSON.stringify(job)); // 30분

        console.log('[AI-UPLOAD] SUCCESS:', {
            job_id,
            modelId: result.rows[0].id,
            modelName: result.rows[0].model_name,
            fileSize: modelFile.size,
            hasThumbnail: !!thumbnailFile
        });

        res.status(201).json({
            success: true,
            message: 'Model uploaded successfully from AI server',
            model: result.rows[0]
        });

    } catch (error) {
        console.error('[AI-UPLOAD] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        // 업로드된 파일 삭제 (에러 발생 시)
        if (req.files) {
            Object.values(req.files).flat().forEach(file => {
                fs.unlink(file.path, err => {
                    if (err) console.error('[AI-UPLOAD] Failed to delete file:', err);
                });
            });
        }

        // Redis 상태 업데이트: failed
        if (req.body.job_id) {
            try {
                const jobKey = `job:${req.body.job_id}`;
                const jobData = await redisClient.get(jobKey);
                if (jobData) {
                    const job = JSON.parse(jobData);
                    job.status = 'failed';
                    job.error = error.message;
                    await redisClient.setEx(jobKey, 1800, JSON.stringify(job));
                }
            } catch (redisError) {
                console.error('[AI-UPLOAD] Failed to update Redis:', redisError);
            }
        }

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

// ============================================
// 개인 3D 모델 API (JWT 인증 필요)
// ============================================

// 모든 모델 라우트에 JWT 검증 미들웨어 적용 (개인 소유)
router.use(verifyToken);

// ============================================
// 개인 3D 모델 API (인증 필요)
// ============================================

// 0-1. 모델 생성 요청 (AI 서버에 전달)
router.post('/generate', uploadThumbnail.single('image'), async (req, res) => {
    try {
        const { prompt } = req.body;

        console.log('[MODEL-GENERATE] 모델 생성 요청:', {
            userId: req.userId,
            email: req.email,
            prompt,
            hasImage: !!req.file,
            timestamp: new Date().toISOString()
        });

        // 입력값 검증
        if (!prompt || typeof prompt !== 'string') {
            console.log('[MODEL-GENERATE] ERROR: 유효하지 않은 프롬프트');

            // 업로드된 이미지 삭제
            if (req.file) {
                fs.unlink(req.file.path, err => {
                    if (err) console.error('[MODEL-GENERATE] Failed to delete image:', err);
                });
            }

            return res.status(400).json({
                success: false,
                error: 'INVALID_PROMPT',
                message: 'Valid prompt is required'
            });
        }

        // 이미지 파일 검증 (.png만 허용)
        if (!req.file) {
            console.log('[MODEL-GENERATE] ERROR: 이미지 파일 누락');
            return res.status(400).json({
                success: false,
                error: 'MISSING_IMAGE_FILE',
                message: 'PNG image file is required'
            });
        }

        const imageExt = path.extname(req.file.originalname).toLowerCase();
        if (imageExt !== '.png') {
            console.log('[MODEL-GENERATE] ERROR: PNG 파일이 아님:', imageExt);

            // 업로드된 이미지 삭제
            fs.unlink(req.file.path, err => {
                if (err) console.error('[MODEL-GENERATE] Failed to delete image:', err);
            });

            return res.status(400).json({
                success: false,
                error: 'INVALID_IMAGE_TYPE',
                message: 'Only PNG images are allowed'
            });
        }

        // Job ID 및 Secret 생성
        const job_id = crypto.randomUUID();
        const job_secret = crypto.randomBytes(32).toString('hex');

        // Redis에 Job 정보 저장 (TTL: 30분)
        const jobData = {
            job_id,
            secret: job_secret,
            user_id: req.userId,
            email: req.email,
            prompt,
            image_path: req.file.path,
            status: 'pending',
            created_at: new Date().toISOString()
        };

        const jobKey = `job:${job_id}`;
        await redisClient.setEx(jobKey, 1800, JSON.stringify(jobData)); // 30분 TTL

        console.log('[MODEL-GENERATE] Job created:', {
            job_id,
            userId: req.userId,
            imagePath: req.file.path
        });

        // AI 서버에 비동기 요청 전송 (백그라운드)
        const aiServerUrl = process.env.AI_SERVER_URL || 'http://localhost:8000';
        const resourceServerUrl = process.env.RESOURCE_SERVER_URL || 'http://localhost:3001';

        // 백그라운드에서 AI 서버 요청
        (async () => {
            try {
                // Redis 상태 업데이트: processing
                jobData.status = 'processing';
                jobData.processing_started_at = new Date().toISOString();
                await redisClient.setEx(jobKey, 1800, JSON.stringify(jobData));

                const FormData = require('form-data');
                const fetch = (await import('node-fetch')).default;

                // multipart/form-data 생성
                const formData = new FormData();
                formData.append('image', fs.createReadStream(req.file.path));
                formData.append('prompt', prompt);
                formData.append('job_id', job_id);
                formData.append('job_secret', job_secret);
                formData.append('callback_url', `${resourceServerUrl}/api/models/upload-from-ai`);

                const response = await fetch(`${aiServerUrl}/generate_mesh`, {
                    method: 'POST',
                    body: formData,
                    headers: formData.getHeaders(),
                    timeout: parseInt(process.env.AI_SERVER_TIMEOUT) || 180000
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`AI server returned ${response.status}: ${errorText}`);
                }

                console.log('[MODEL-GENERATE] AI 서버 요청 성공:', { job_id });

                // 이미지 파일 삭제 (AI 서버에 전송 완료)
                fs.unlink(req.file.path, err => {
                    if (err) console.error('[MODEL-GENERATE] Failed to delete image:', err);
                    else console.log('[MODEL-GENERATE] Image file deleted:', req.file.path);
                });

            } catch (error) {
                console.error('[MODEL-GENERATE] AI 서버 요청 실패:', {
                    job_id,
                    error: error.message
                });

                // Redis 상태 업데이트: failed
                try {
                    const currentJobData = await redisClient.get(jobKey);
                    if (currentJobData) {
                        const job = JSON.parse(currentJobData);
                        job.status = 'failed';
                        job.error = `AI server error: ${error.message}`;
                        await redisClient.setEx(jobKey, 1800, JSON.stringify(job));
                    }
                } catch (redisError) {
                    console.error('[MODEL-GENERATE] Redis 업데이트 실패:', redisError);
                }

                // 이미지 파일 삭제 (에러 발생 시)
                if (req.file && req.file.path) {
                    fs.unlink(req.file.path, err => {
                        if (err) console.error('[MODEL-GENERATE] Failed to delete image:', err);
                    });
                }
            }
        })();

        // 즉시 응답 반환
        res.status(202).json({
            success: true,
            message: 'Model generation job created',
            job_id,
            status: 'pending'
        });

    } catch (error) {
        console.error('[MODEL-GENERATE] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        // 업로드된 이미지 삭제 (에러 발생 시)
        if (req.file && req.file.path) {
            fs.unlink(req.file.path, err => {
                if (err) console.error('[MODEL-GENERATE] Failed to delete image:', err);
            });
        }

        res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

// 0-2. 작업 상태 조회 (폴링용)
router.get('/jobs/:job_id', async (req, res) => {
    try {
        const { job_id } = req.params;

        console.log('[JOB-STATUS] 작업 상태 조회:', {
            job_id,
            userId: req.userId,
            timestamp: new Date().toISOString()
        });

        // Redis에서 Job 정보 조회
        const jobKey = `job:${job_id}`;
        const jobData = await redisClient.get(jobKey);

        if (!jobData) {
            console.log('[JOB-STATUS] ERROR: Job not found', { job_id });
            return res.status(404).json({
                success: false,
                error: 'JOB_NOT_FOUND',
                message: 'Job not found or expired'
            });
        }

        const job = JSON.parse(jobData);

        // 소유권 확인
        if (job.user_id !== req.userId) {
            console.log('[JOB-STATUS] ERROR: 권한 없음', {
                job_id,
                job_user_id: job.user_id,
                request_user_id: req.userId
            });
            return res.status(403).json({
                success: false,
                error: 'ACCESS_DENIED',
                message: 'Access denied to this job'
            });
        }

        // Secret 제거 후 반환
        const { secret, ...jobInfo } = job;

        // 완료된 경우 모델 정보도 함께 반환
        if (job.status === 'completed' && job.model_id) {
            try {
                const modelResult = await pool.query(
                    `SELECT id, model_name, file_path, file_size, thumbnail_path, created_at
                     FROM user_models
                     WHERE id = $1 AND user_id = $2`,
                    [job.model_id, req.userId]
                );

                if (modelResult.rows.length > 0) {
                    jobInfo.model = modelResult.rows[0];
                }
            } catch (dbError) {
                console.error('[JOB-STATUS] 모델 조회 실패:', dbError);
            }
        }

        console.log('[JOB-STATUS] SUCCESS:', {
            job_id,
            status: job.status
        });

        res.json({
            success: true,
            job: jobInfo
        });

    } catch (error) {
        console.error('[JOB-STATUS] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        res.status(500).json({
            success: false,
            error: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

// 1. 내 모델 목록 조회 (자신의 모델만)
router.get('/list', async (req, res) => {
    try {
        console.log('[MODEL-LIST] 모델 목록 조회 시도:', {
            userId: req.userId,
            email: req.email,
            timestamp: new Date().toISOString()
        });

        const result = await pool.query(
            `SELECT id, model_name, file_path, file_size, thumbnail_path, created_at, updated_at
             FROM user_models
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.userId]
        );

        console.log('[MODEL-LIST] SUCCESS:', {
            userId: req.userId,
            count: result.rows.length
        });

        res.json({
            success: true,
            count: result.rows.length,
            models: result.rows
        });

    } catch (error) {
        console.error('[MODEL-LIST] EXCEPTION:', {
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

// 2. 특정 모델 조회 (자신의 모델만)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[MODEL-GET] 모델 조회 시도:', {
            id,
            userId: req.userId,
            timestamp: new Date().toISOString()
        });

        const result = await pool.query(
            `SELECT id, model_name, file_path, file_size, thumbnail_path, created_at, updated_at
             FROM user_models
             WHERE id = $1 AND user_id = $2`,
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            console.log('[MODEL-GET] ERROR: 모델 없음 또는 권한 없음', {
                id,
                userId: req.userId
            });
            return res.status(404).json({
                success: false,
                error: 'MODEL_NOT_FOUND',
                message: 'Model not found or access denied'
            });
        }

        console.log('[MODEL-GET] SUCCESS:', {
            id,
            modelName: result.rows[0].model_name
        });

        res.json({
            success: true,
            model: result.rows[0]
        });

    } catch (error) {
        console.error('[MODEL-GET] EXCEPTION:', {
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

// 3-1. 모델 파일 업로드 (모델 파일 + 썸네일)
router.post('/upload', uploadModelWithThumbnail.fields([
    { name: 'model', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
]), async (req, res) => {
    try {
        console.log('[MODEL-UPLOAD] 모델 업로드 시도:', {
            userId: req.userId,
            email: req.email,
            files: req.files,
            timestamp: new Date().toISOString()
        });

        // 파일 검증
        if (!req.files || !req.files.model || req.files.model.length === 0) {
            console.log('[MODEL-UPLOAD] ERROR: 모델 파일 누락');
            return res.status(400).json({
                success: false,
                error: 'MISSING_MODEL_FILE',
                message: 'Model file is required'
            });
        }

        const modelFile = req.files.model[0];
        const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

        // 모델명은 body에서 받거나, 파일명에서 추출
        const model_name = req.body.model_name || path.basename(modelFile.originalname, path.extname(modelFile.originalname));

        // 파일 경로를 상대 경로로 저장 (uploads/models/...)
        const file_path = path.relative(
            path.join(__dirname, '..'),
            modelFile.path
        ).replace(/\\/g, '/'); // Windows 경로 처리

        const thumbnail_path = thumbnailFile ? path.relative(
            path.join(__dirname, '..'),
            thumbnailFile.path
        ).replace(/\\/g, '/') : null;

        // DB에 모델 정보 저장
        const result = await pool.query(
            `INSERT INTO user_models (user_id, model_name, file_path, file_size, thumbnail_path)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, model_name, file_path, file_size, thumbnail_path, created_at`,
            [req.userId, model_name, file_path, modelFile.size, thumbnail_path]
        );

        console.log('[MODEL-UPLOAD] SUCCESS:', {
            modelId: result.rows[0].id,
            modelName: result.rows[0].model_name,
            fileSize: modelFile.size,
            hasThumbnail: !!thumbnailFile
        });

        res.status(201).json({
            success: true,
            message: 'Model uploaded successfully',
            model: result.rows[0]
        });

    } catch (error) {
        console.error('[MODEL-UPLOAD] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        // 업로드된 파일 삭제 (에러 발생 시)
        if (req.files) {
            if (req.files.model) {
                req.files.model.forEach(file => {
                    fs.unlink(file.path, err => {
                        if (err) console.error('[MODEL-UPLOAD] Failed to delete model file:', err);
                    });
                });
            }
            if (req.files.thumbnail) {
                req.files.thumbnail.forEach(file => {
                    fs.unlink(file.path, err => {
                        if (err) console.error('[MODEL-UPLOAD] Failed to delete thumbnail file:', err);
                    });
                });
            }
        }

        // 중복 모델명 에러
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                error: 'DUPLICATE_MODEL_NAME',
                message: 'Model name already exists for this user'
            });
        }

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

// 4. 모델 수정 (자신의 모델만)
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { model_name, file_path, file_size, thumbnail_path } = req.body;

        console.log('[MODEL-UPDATE] 모델 수정 시도:', {
            id,
            userId: req.userId,
            timestamp: new Date().toISOString()
        });

        // 소유권 확인
        const checkResult = await pool.query(
            'SELECT id FROM user_models WHERE id = $1 AND user_id = $2',
            [id, req.userId]
        );

        if (checkResult.rows.length === 0) {
            console.log('[MODEL-UPDATE] ERROR: 모델 없음 또는 권한 없음', {
                id,
                userId: req.userId
            });
            return res.status(404).json({
                success: false,
                error: 'MODEL_NOT_FOUND',
                message: 'Model not found or access denied'
            });
        }

        // 업데이트할 필드만 수정
        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (model_name !== undefined) {
            updates.push(`model_name = $${paramIndex++}`);
            values.push(model_name);
        }
        if (file_path !== undefined) {
            updates.push(`file_path = $${paramIndex++}`);
            values.push(file_path);
        }
        if (file_size !== undefined) {
            updates.push(`file_size = $${paramIndex++}`);
            values.push(file_size);
        }
        if (thumbnail_path !== undefined) {
            updates.push(`thumbnail_path = $${paramIndex++}`);
            values.push(thumbnail_path);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'NO_UPDATE_FIELDS',
                message: 'No fields to update'
            });
        }

        values.push(id, req.userId);

        const result = await pool.query(
            `UPDATE user_models
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex++} AND user_id = $${paramIndex++}
             RETURNING id, model_name, file_path, file_size, thumbnail_path, updated_at`,
            values
        );

        console.log('[MODEL-UPDATE] SUCCESS:', {
            modelId: result.rows[0].id,
            modelName: result.rows[0].model_name
        });

        res.json({
            success: true,
            message: 'Model updated successfully',
            model: result.rows[0]
        });

    } catch (error) {
        console.error('[MODEL-UPDATE] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                error: 'DUPLICATE_MODEL_NAME',
                message: 'Model name already exists for this user'
            });
        }

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

// 4-1. 썸네일 업로드/수정 (자신의 모델만)
router.post('/:id/thumbnail', uploadThumbnail.single('thumbnail'), async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[MODEL-THUMBNAIL] 썸네일 업로드 시도:', {
            id,
            userId: req.userId,
            file: req.file,
            timestamp: new Date().toISOString()
        });

        // 파일 검증
        if (!req.file) {
            console.log('[MODEL-THUMBNAIL] ERROR: 썸네일 파일 누락');
            return res.status(400).json({
                success: false,
                error: 'MISSING_THUMBNAIL_FILE',
                message: 'Thumbnail file is required'
            });
        }

        // 소유권 확인 및 기존 썸네일 경로 가져오기
        const checkResult = await pool.query(
            'SELECT id, thumbnail_path FROM user_models WHERE id = $1 AND user_id = $2',
            [id, req.userId]
        );

        if (checkResult.rows.length === 0) {
            // 업로드된 파일 삭제
            fs.unlink(req.file.path, err => {
                if (err) console.error('[MODEL-THUMBNAIL] Failed to delete file:', err);
            });

            console.log('[MODEL-THUMBNAIL] ERROR: 모델 없음 또는 권한 없음', {
                id,
                userId: req.userId
            });
            return res.status(404).json({
                success: false,
                error: 'MODEL_NOT_FOUND',
                message: 'Model not found or access denied'
            });
        }

        const oldThumbnailPath = checkResult.rows[0].thumbnail_path;

        // 새 썸네일 경로
        const thumbnail_path = path.relative(
            path.join(__dirname, '..'),
            req.file.path
        ).replace(/\\/g, '/');

        // DB 업데이트
        const result = await pool.query(
            `UPDATE user_models
             SET thumbnail_path = $1, updated_at = NOW()
             WHERE id = $2 AND user_id = $3
             RETURNING id, model_name, thumbnail_path, updated_at`,
            [thumbnail_path, id, req.userId]
        );

        // 기존 썸네일 파일 삭제
        if (oldThumbnailPath) {
            const oldFilePath = path.join(__dirname, '..', oldThumbnailPath);
            fs.unlink(oldFilePath, err => {
                if (err) console.error('[MODEL-THUMBNAIL] Failed to delete old thumbnail:', err);
            });
        }

        console.log('[MODEL-THUMBNAIL] SUCCESS:', {
            modelId: result.rows[0].id,
            modelName: result.rows[0].model_name
        });

        res.json({
            success: true,
            message: 'Thumbnail uploaded successfully',
            model: result.rows[0]
        });

    } catch (error) {
        console.error('[MODEL-THUMBNAIL] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        // 업로드된 파일 삭제 (에러 발생 시)
        if (req.file) {
            fs.unlink(req.file.path, err => {
                if (err) console.error('[MODEL-THUMBNAIL] Failed to delete file:', err);
            });
        }

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

// 5. 모델 파일 다운로드 (자신의 모델만)
router.get('/:id/download', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[MODEL-DOWNLOAD] 모델 다운로드 시도:', {
            id,
            userId: req.userId,
            timestamp: new Date().toISOString()
        });

        const result = await pool.query(
            `SELECT id, model_name, file_path
             FROM user_models
             WHERE id = $1 AND user_id = $2`,
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            console.log('[MODEL-DOWNLOAD] ERROR: 모델 없음 또는 권한 없음', {
                id,
                userId: req.userId
            });
            return res.status(404).json({
                success: false,
                error: 'MODEL_NOT_FOUND',
                message: 'Model not found or access denied'
            });
        }

        const model = result.rows[0];
        const filePath = path.join(__dirname, '..', model.file_path);

        // 파일 존재 확인
        if (!fs.existsSync(filePath)) {
            console.log('[MODEL-DOWNLOAD] ERROR: 파일 없음', {
                id,
                filePath
            });
            return res.status(404).json({
                success: false,
                error: 'FILE_NOT_FOUND',
                message: 'Model file not found on server'
            });
        }

        console.log('[MODEL-DOWNLOAD] SUCCESS:', {
            modelId: model.id,
            modelName: model.model_name
        });

        // 파일 다운로드
        res.download(filePath, path.basename(filePath));

    } catch (error) {
        console.error('[MODEL-DOWNLOAD] EXCEPTION:', {
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

// 6. 썸네일 이미지 제공 (자신의 모델만)
router.get('/:id/thumbnail', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[MODEL-THUMBNAIL-GET] 썸네일 조회 시도:', {
            id,
            userId: req.userId,
            timestamp: new Date().toISOString()
        });

        const result = await pool.query(
            `SELECT id, thumbnail_path
             FROM user_models
             WHERE id = $1 AND user_id = $2`,
            [id, req.userId]
        );

        if (result.rows.length === 0) {
            console.log('[MODEL-THUMBNAIL-GET] ERROR: 모델 없음 또는 권한 없음', {
                id,
                userId: req.userId
            });
            return res.status(404).json({
                success: false,
                error: 'MODEL_NOT_FOUND',
                message: 'Model not found or access denied'
            });
        }

        const model = result.rows[0];

        if (!model.thumbnail_path) {
            console.log('[MODEL-THUMBNAIL-GET] ERROR: 썸네일 없음', {
                id
            });
            return res.status(404).json({
                success: false,
                error: 'THUMBNAIL_NOT_FOUND',
                message: 'Thumbnail not found for this model'
            });
        }

        const filePath = path.join(__dirname, '..', model.thumbnail_path);

        // 파일 존재 확인
        if (!fs.existsSync(filePath)) {
            console.log('[MODEL-THUMBNAIL-GET] ERROR: 썸네일 파일 없음', {
                id,
                filePath
            });
            return res.status(404).json({
                success: false,
                error: 'FILE_NOT_FOUND',
                message: 'Thumbnail file not found on server'
            });
        }

        console.log('[MODEL-THUMBNAIL-GET] SUCCESS:', {
            modelId: model.id
        });

        // 이미지 파일 전송
        res.sendFile(filePath);

    } catch (error) {
        console.error('[MODEL-THUMBNAIL-GET] EXCEPTION:', {
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

// 7. 모델 삭제 (자신의 모델만)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[MODEL-DELETE] 모델 삭제 시도:', {
            id,
            userId: req.userId,
            timestamp: new Date().toISOString()
        });

        // 파일 경로 가져오기
        const fileResult = await pool.query(
            `SELECT file_path, thumbnail_path FROM user_models WHERE id = $1 AND user_id = $2`,
            [id, req.userId]
        );

        if (fileResult.rows.length === 0) {
            console.log('[MODEL-DELETE] ERROR: 모델 없음 또는 권한 없음', {
                id,
                userId: req.userId
            });
            return res.status(404).json({
                success: false,
                error: 'MODEL_NOT_FOUND',
                message: 'Model not found or access denied'
            });
        }

        const { file_path, thumbnail_path } = fileResult.rows[0];

        // DB에서 삭제
        const result = await pool.query(
            `DELETE FROM user_models
             WHERE id = $1 AND user_id = $2
             RETURNING id, model_name`,
            [id, req.userId]
        );

        // 파일 삭제
        if (file_path) {
            const modelFilePath = path.join(__dirname, '..', file_path);
            fs.unlink(modelFilePath, err => {
                if (err) console.error('[MODEL-DELETE] Failed to delete model file:', err);
                else console.log('[MODEL-DELETE] Model file deleted:', modelFilePath);
            });
        }

        if (thumbnail_path) {
            const thumbnailFilePath = path.join(__dirname, '..', thumbnail_path);
            fs.unlink(thumbnailFilePath, err => {
                if (err) console.error('[MODEL-DELETE] Failed to delete thumbnail file:', err);
                else console.log('[MODEL-DELETE] Thumbnail file deleted:', thumbnailFilePath);
            });
        }

        console.log('[MODEL-DELETE] SUCCESS:', {
            modelId: result.rows[0].id,
            modelName: result.rows[0].model_name
        });

        res.json({
            success: true,
            message: 'Model deleted successfully',
            deleted_model: result.rows[0]
        });

    } catch (error) {
        console.error('[MODEL-DELETE] EXCEPTION:', {
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
