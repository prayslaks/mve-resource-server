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
                code: 'DEV_ONLY_API',
                message: 'This API is for development only'
            });
        }

        // 파일 검증
        if (!req.files || !req.files.model || req.files.model.length === 0) {
            console.log('[DEV-AI-UPLOAD] ERROR: 모델 파일 누락');
            return res.status(400).json({
                success: false,
                code: 'MISSING_MODEL_FILE',
                message: 'Model file is required'
            });
        }

        const modelFile = req.files.model[0];
        const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

        // user_id는 body에서 받거나 기본값 1 사용 (개발용)
        const user_id = req.body.user_id || 1;

        // 모델명 생성 (타임스탬프 추가로 중복 방지)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        let baseModelName = req.body.model_name ||
                           req.body.prompt?.substring(0, 80) ||
                           path.basename(modelFile.originalname, path.extname(modelFile.originalname)).substring(0, 80);
        const model_name = `${baseModelName}_${timestamp}`;

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
            `INSERT INTO user_models (user_id, model_name, file_path, file_size, thumbnail_path, is_ai_generated)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, model_name, file_path, file_size, thumbnail_path, is_ai_generated, created_at`,
            [user_id, model_name, file_path, modelFile.size, thumbnail_path, false]
        );

        console.log('[DEV-AI-UPLOAD] SUCCESS:', {
            modelId: result.rows[0].id,
            modelName: result.rows[0].model_name,
            userId: user_id,
            fileSize: modelFile.size,
            hasThumbnail: !!thumbnailFile
        });

        const row = result.rows[0];
        res.status(201).json({
            success: true,
            code: 'SUCCESS',
            message: 'Model uploaded successfully (DEV MODE)',
            model: {
                id: row.id,
                modelName: row.model_name,
                filePath: row.file_path,
                fileSize: row.file_size,
                thumbnailPath: row.thumbnail_path,
                isAiGenerated: row.is_ai_generated,
                createdAt: row.created_at
            }
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
                code: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/models/upload-from-ai:
 *   post:
 *     summary: AI 서버 모델 업로드
 *     description: AI 서버에서 생성된 모델을 업로드합니다 (AI 서버 전용, Job ID 검증 필요)
 *     tags:
 *       - Models
 *       - AI Generation
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - model
 *               - jobId
 *               - jobSecret
 *             properties:
 *               model:
 *                 type: string
 *                 format: binary
 *                 description: 모델 파일 (.glb)
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *                 description: 썸네일 이미지 (선택)
 *               jobId:
 *                 type: string
 *                 description: AI 작업 ID
 *               jobSecret:
 *                 type: string
 *                 description: AI 작업 Secret
 *     responses:
 *       201:
 *         description: 모델 업로드 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BaseResponse'
 *                 - type: object
 *                   properties:
 *                     model:
 *                       $ref: '#/components/schemas/ModelInfo'
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: 잘못된 jobSecret
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Job을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Job이 이미 완료됨
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
                code: 'MISSING_JOB_CREDENTIALS',
                message: 'job_id and job_secret are required'
            });
        }

        // Redis에서 job 정보 확인 (키 형식 통일)
        const jobKey = `ai:job:${job_id}`;
        const jobData = await redisClient.hGetAll(jobKey);

        if (!jobData || Object.keys(jobData).length === 0) {
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
                code: 'JOB_NOT_FOUND',
                message: 'Job not found or expired'
            });
        }

        const job = jobData; // hGetAll은 이미 객체를 반환

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
                code: 'INVALID_JOB_SECRET',
                message: 'Invalid job secret'
            });
        }

        // 상태 검증: 이미 완료되었거나 실패한 작업인지 확인
        if (job.status === 'completed') {
            console.log('[AI-UPLOAD] ERROR: Job already completed', { job_id, model_id: job.modelId || job.model_id });

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
                code: 'JOB_ALREADY_COMPLETED',
                message: 'This job has already been completed',
                modelId: job.modelId || job.model_id
            });
        }

        if (job.status === 'failed') {
            console.log('[AI-UPLOAD] WARN: Job was already marked as failed, allowing retry', { job_id });
            // failed 상태는 재시도를 허용 (AI 서버가 재시도하는 경우)
        }

        // DB 중복 체크: 이미 해당 job_id로 모델이 생성되었는지 확인
        const baseModelName = job.prompt.substring(0, 60) || 'model';
        const model_name = `${baseModelName}_${job_id}`;

        const duplicateCheck = await pool.query(
            `SELECT id FROM user_models WHERE user_id = $1 AND model_name = $2`,
            [job.user_id, model_name]
        );

        if (duplicateCheck.rows.length > 0) {
            console.log('[AI-UPLOAD] ERROR: Model already exists in DB', {
                job_id,
                model_id: duplicateCheck.rows[0].id,
                model_name
            });

            // 업로드된 파일 삭제
            if (req.files) {
                Object.values(req.files).flat().forEach(file => {
                    fs.unlink(file.path, err => {
                        if (err) console.error('[AI-UPLOAD] Failed to delete file:', err);
                    });
                });
            }

            // Redis 상태를 completed로 업데이트 (이미 완료된 작업)
            await redisClient.hSet(jobKey, {
                status: 'completed',
                modelId: duplicateCheck.rows[0].id.toString(),
                completedAt: new Date().toISOString()
            });

            return res.status(409).json({
                success: false,
                code: 'MODEL_ALREADY_EXISTS',
                message: 'Model with this job_id already exists',
                modelId: duplicateCheck.rows[0].id
            });
        }

        // 파일 검증
        if (!req.files || !req.files.model || req.files.model.length === 0) {
            console.log('[AI-UPLOAD] ERROR: 모델 파일 누락');

            // Redis 상태 업데이트: failed
            await redisClient.hSet(jobKey, {
                status: 'failed',
                errorMessage: 'Model file missing',
                completedAt: new Date().toISOString()
            });

            return res.status(400).json({
                success: false,
                code: 'MISSING_MODEL_FILE',
                message: 'Model file is required'
            });
        }

        const modelFile = req.files.model[0];
        const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

        // model_name은 이미 위에서 생성됨 (중복 체크에서 사용)

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
            `INSERT INTO user_models (user_id, model_name, file_path, file_size, thumbnail_path, is_ai_generated)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, model_name, file_path, file_size, thumbnail_path, is_ai_generated, created_at`,
            [job.user_id, model_name, file_path, modelFile.size, thumbnail_path, true]
        );

        // Redis 상태 업데이트: completed
        await redisClient.hSet(jobKey, {
            status: 'completed',
            modelId: result.rows[0].id.toString(),
            completedAt: new Date().toISOString()
        });

        console.log('[AI-UPLOAD] SUCCESS:', {
            job_id,
            modelId: result.rows[0].id,
            modelName: result.rows[0].model_name,
            fileSize: modelFile.size,
            hasThumbnail: !!thumbnailFile
        });

        const row = result.rows[0];
        res.status(201).json({
            success: true,
            code: 'SUCCESS',
            message: 'Model uploaded successfully from AI server',
            model: {
                id: row.id,
                modelName: row.model_name,
                filePath: row.file_path,
                fileSize: row.file_size,
                thumbnailPath: row.thumbnail_path,
                isAiGenerated: row.is_ai_generated,
                createdAt: row.created_at
            }
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
                const jobKey = `ai:job:${req.body.job_id}`;
                await redisClient.hSet(jobKey, {
                    status: 'failed',
                    errorMessage: error.message,
                    completedAt: new Date().toISOString()
                });
            } catch (redisError) {
                console.error('[AI-UPLOAD] Failed to update Redis:', redisError);
            }
        }

        if (error.code) {
            return res.status(500).json({
                success: false,
                code: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
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

/**
 * @swagger
 * /api/models/generate:
 *   post:
 *     summary: AI 3D 모델 생성 요청
 *     description: |
 *       프롬프트 또는 이미지를 기반으로 AI가 3D 모델을 생성합니다. 비동기 처리되며 즉시 job_id를 반환합니다.
 *
 *       **백엔드 플로우:**
 *       1. Resource Server가 요청을 받아 job_id 생성 및 Redis에 저장
 *       2. AI Server의 `/generate_3D_obj` 엔드포인트로 요청 전달 (ai-client.js 통해)
 *       3. AI Server가 비동기로 3D 모델 생성 처리
 *       4. 생성 완료 시 S3 또는 로컬에 GLB 파일 저장 및 DB 등록
 *       5. Redis job 상태를 'completed'로 업데이트
 *     tags:
 *       - Models
 *       - AI Generation
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: 3D 모델 생성 프롬프트
 *                 example: "A futuristic robot warrior"
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: 참고 이미지 (선택, PNG/JPG/WEBP, 최대 10MB)
 *     responses:
 *       202:
 *         description: AI 생성 요청 접수 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BaseResponse'
 *                 - type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *                       format: uuid
 *                       example: "550e8400-e29b-41d4-a716-446655440000"
 *       400:
 *         description: 잘못된 요청 (프롬프트 누락)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// 0-1. 모델 생성 요청 (AI 서버에 전달)
// 0-1. AI 3D 모델 생성 요청
// 언리얼 클라이언트에서 호출: /api/models/generate
router.post('/generate', verifyToken, uploadThumbnail.single('image'), async (req, res) => {
    try {
        const { prompt } = req.body;
        const userId = req.userId;
        const userEmail = req.email;

        console.log('[MODEL-GENERATE:REQUEST] AI 모델 생성 요청:', {
            userId,
            userEmail,
            prompt,
            hasImage: !!req.file,
            timestamp: new Date().toISOString()
        });

        // 프롬프트 검증
        if (!prompt || prompt.trim().length === 0) {
            if (req.file) {
                fs.unlink(req.file.path, err => {
                    if (err) console.error('[MODEL-GENERATE:VALIDATE] Failed to delete temp file:', err);
                });
            }

            return res.status(400).json({
                success: false,
                code: 'INVALID_PROMPT',
                message: 'Prompt is required and cannot be empty'
            });
        }

        // Job ID 생성
        const job_id = crypto.randomUUID();

        // Redis에 Job 정보 저장 (TTL: 1시간)
        const jobData = {
            job_id,
            user_id: userId,
            user_email: userEmail,
            prompt,
            status: 'queued',
            created_at: new Date().toISOString()
        };

        const jobKey = `ai:job:${job_id}`;
        await redisClient.hSet(jobKey, jobData);
        await redisClient.expire(jobKey, 3600); // 1시간

        // 사용자별 작업 목록에 추가
        const userJobsKey = `ai:user_jobs:${userId}`;
        await redisClient.sAdd(userJobsKey, job_id);
        await redisClient.expire(userJobsKey, 86400); // 24시간

        console.log(`[MODEL-GENERATE:QUEUED] Job ${job_id} created for user ${userId}`);

        // 클라이언트에 즉시 응답 (비동기 처리)
        res.status(202).json({
            success: true,
            code: 'SUCCESS',
            message: 'AI generation request submitted successfully',
            jobId: job_id
        });

        // 백그라운드에서 AI 서버 요청 처리 (긴 시간 소요)
        const imagePath = req.file ? req.file.path : null;

        (async () => {
            try {
                // Redis 상태 업데이트: processing
                await redisClient.hSet(jobKey, {
                    status: 'processing',
                    processing_started_at: new Date().toISOString()
                });

                console.log(`[MODEL-GENERATE:PROCESSING] Job ${job_id} AI 서버 요청 시작`);

                // AI 클라이언트로 요청 전송 (동기 응답 대기)
                const aiClient = require('../services/ai-client');
                const result = await aiClient.requestGeneration(prompt, userEmail, imagePath);

                // 임시 이미지 파일 삭제
                if (imagePath && fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }

                if (!result.success) {
                    console.error(`[MODEL-GENERATE:AI-FAILED] Job ${job_id} AI 서버 요청 실패:`, result);

                    await redisClient.hSet(jobKey, {
                        status: 'failed',
                        errorMessage: result.message || 'AI server request failed',
                        completedAt: new Date().toISOString()
                    });
                    return;
                }

                // AI 서버 응답에서 GLB 파일 데이터 추출
                // result.data는 AI 서버가 반환한 바이너리 또는 JSON 응답
                console.log(`[MODEL-GENERATE:AI-SUCCESS] Job ${job_id} AI 서버 응답 수신`);

                // S3 또는 로컬 저장
                const isS3 = process.env.STORAGE_TYPE === 's3';
                const modelFileName = `${job_id}.glb`;
                let file_path;
                let file_size;

                if (isS3) {
                    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
                    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
                    const { GetObjectCommand } = require('@aws-sdk/client-s3');

                    const s3Client = new S3Client({ region: process.env.AWS_REGION });
                    const s3Key = `models/ai-generated/${userId}/${modelFileName}`;

                    // result.data가 바이너리 데이터인 경우
                    const modelData = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data);
                    file_size = modelData.length;

                    const uploadParams = {
                        Bucket: process.env.S3_BUCKET,
                        Key: s3Key,
                        Body: modelData,
                        ContentType: 'model/gltf-binary'
                    };

                    await s3Client.send(new PutObjectCommand(uploadParams));
                    file_path = s3Key;

                    console.log(`[MODEL-GENERATE:STORAGE] Job ${job_id} S3 업로드 완료: ${s3Key}`);
                } else {
                    // 로컬 저장
                    const localDir = path.join(__dirname, '../files/models/ai-generated', userId.toString());
                    if (!fs.existsSync(localDir)) {
                        fs.mkdirSync(localDir, { recursive: true });
                    }

                    const localPath = path.join(localDir, modelFileName);
                    const modelData = Buffer.isBuffer(result.data) ? result.data : Buffer.from(result.data);
                    fs.writeFileSync(localPath, modelData);

                    file_path = path.relative(path.join(__dirname, '..'), localPath).replace(/\\/g, '/');
                    file_size = modelData.length;

                    console.log(`[MODEL-GENERATE:STORAGE] Job ${job_id} 로컬 저장 완료: ${file_path}`);
                }

                // DB에 모델 정보 저장
                // Job ID 사용으로 중복 방지 및 파일명과 일관성 유지
                const baseModelName = prompt.substring(0, 60);
                const model_name = `${baseModelName}_${job_id}`;

                const dbResult = await pool.query(
                    `INSERT INTO user_models (user_id, model_name, file_path, file_size, thumbnail_path, is_ai_generated)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING id, model_name, file_path, file_size, is_ai_generated, created_at`,
                    [userId, model_name, file_path, file_size, null, true]
                );

                const modelId = dbResult.rows[0].id;

                console.log(`[MODEL-GENERATE:DB-SAVED] Job ${job_id} DB 저장 완료: model_id=${modelId}`);

                // Presigned URL 생성 (S3) 또는 다운로드 URL (로컬)
                let download_url;

                if (isS3) {
                    const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
                    const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

                    const s3Client = new S3Client({ region: process.env.AWS_REGION });
                    const command = new GetObjectCommand({
                        Bucket: process.env.S3_BUCKET,
                        Key: file_path
                    });
                    download_url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
                } else {
                    download_url = `${process.env.RESOURCE_SERVER_URL || 'http://localhost:3001'}/api/models/${modelId}/download`;
                }

                // Redis job 상태 업데이트: completed
                await redisClient.hSet(jobKey, {
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    modelId: modelId.toString(),
                    downloadUrl: download_url
                });

                console.log(`[MODEL-GENERATE:COMPLETED] Job ${job_id} 전체 처리 완료`);

            } catch (error) {
                console.error(`[MODEL-GENERATE:ERROR] Job ${job_id} 백그라운드 처리 실패:`, error);

                // 임시 파일 정리
                if (imagePath && fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }

                // Redis 상태 업데이트: failed
                await redisClient.hSet(jobKey, {
                    status: 'failed',
                    errorMessage: error.message || 'Background processing failed',
                    completedAt: new Date().toISOString()
                });
            }
        })();

    } catch (error) {
        console.error('[MODEL-GENERATE:ERROR] 요청 처리 중 오류:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlink(req.file.path, err => {
                if (err) console.error('[MODEL-GENERATE:ERROR] Failed to delete temp file:', err);
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to process AI ge"errorMessage": "Invalid URL"neration request'
        });
    }
});

/**
 * @swagger
 * /api/models/jobs/{jobId}:
 *   get:
 *     summary: AI 작업 상태 조회
 *     description: AI 모델 생성 작업의 현재 상태를 조회합니다.
 *     tags:
 *       - AI Generation
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: jobId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: 작업 ID
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: 작업 상태 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BaseResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/AIJobStatus'
 *       403:
 *         description: 권한 없음 (다른 사용자의 작업)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 작업을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// 0-2. AI 작업 상태 조회
router.get('/jobs/:job_id', verifyToken, async (req, res) => {
    try {
        const { job_id } = req.params;
        const userId = req.userId;

        const jobKey = `ai:job:${job_id}`;
        const jobData = await redisClient.hGetAll(jobKey);

        if (!jobData || Object.keys(jobData).length === 0) {
            return res.status(404).json({
                success: false,
                code: 'JOB_NOT_FOUND',
                message: 'Job not found or expired'
            });
        }

        // 작업 소유자 확인
        if (parseInt(jobData.user_id) !== userId) {
            return res.status(403).json({
                success: false,
                code: 'FORBIDDEN',
                message: 'You do not have permission to view this job'
            });
        }

        res.json({
            success: true,
            code: 'SUCCESS',
            message: 'Operation successful',
            data: {
                jobId: job_id,
                status: jobData.status,
                prompt: jobData.prompt,
                createdAt: jobData.created_at || jobData.createdAt,
                completedAt: jobData.completed_at || jobData.completedAt || null,
                modelId: jobData.model_id || jobData.modelId || null,
                downloadUrl: jobData.download_url || jobData.downloadUrl || null,
                errorMessage: jobData.error_message || jobData.errorMessage || null
            }
        });

    } catch (error) {
        console.error('[JOB-STATUS] 조회 실패:', error);
        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

// ============================================
// 일반 모델 API (인증 필요)
// ============================================

/**
 * @swagger
 * /api/models/list:
 *   get:
 *     summary: 내 모델 목록 조회
 *     description: 로그인한 사용자가 소유한 모든 3D 모델 목록을 조회합니다.
 *     tags:
 *       - Models
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 모델 목록 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BaseResponse'
 *                 - type: object
 *                   properties:
 *                     count:
 *                       type: integer
 *                       example: 2
 *                     models:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ModelInfo'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
// 1. 내 모델 목록 조회 (자신의 모델만)
router.get('/list', async (req, res) => {
    try {
        console.log('[MODEL-LIST] 모델 목록 조회 시도:', {
            userId: req.userId,
            email: req.email,
            timestamp: new Date().toISOString()
        });

        const result = await pool.query(
            `SELECT id, model_name, file_path, file_size, thumbnail_path, is_ai_generated, created_at, updated_at
             FROM user_models
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [req.userId]
        );

        console.log('[MODEL-LIST] SUCCESS:', {
            userId: req.userId,
            count: result.rows.length
        });

        const models = result.rows.map(row => ({
            id: row.id,
            modelName: row.model_name,
            filePath: row.file_path,
            fileSize: row.file_size,
            thumbnailPath: row.thumbnail_path,
            isAiGenerated: row.is_ai_generated,
            createdAt: row.created_at,
            updatedAt: row.updated_at
        }));

        res.json({
            success: true,
            code: 'SUCCESS',
            message: 'Operation successful',
            count: result.rows.length,
            models: models
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
                code: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/models/{id}:
 *   get:
 *     summary: 특정 모델 조회
 *     description: 모델 ID로 특정 모델의 정보를 조회합니다 (자신의 모델만)
 *     tags:
 *       - Models
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 모델 ID
 *     responses:
 *       200:
 *         description: 모델 조회 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BaseResponse'
 *                 - type: object
 *                   properties:
 *                     model:
 *                       $ref: '#/components/schemas/ModelInfo'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 모델을 찾을 수 없음 또는 권한 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
            `SELECT id, model_name, file_path, file_size, thumbnail_path, is_ai_generated, created_at, updated_at
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
                code: 'MODEL_NOT_FOUND',
                message: 'Model not found or access denied'
            });
        }

        console.log('[MODEL-GET] SUCCESS:', {
            id,
            modelName: result.rows[0].model_name
        });

        const row = result.rows[0];
        res.json({
            success: true,
            code: 'SUCCESS',
            message: 'Operation successful',
            model: {
                id: row.id,
                modelName: row.model_name,
                filePath: row.file_path,
                fileSize: row.file_size,
                thumbnailPath: row.thumbnail_path,
                isAiGenerated: row.is_ai_generated,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            }
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
                code: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/models/upload:
 *   post:
 *     summary: 모델 파일 업로드
 *     description: 3D 모델 파일(GLB)과 선택적으로 썸네일 이미지를 업로드합니다.
 *     tags:
 *       - Models
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - model
 *             properties:
 *               model:
 *                 type: string
 *                 format: binary
 *                 description: 3D 모델 파일 (.glb)
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *                 description: 썸네일 이미지 (선택)
 *               modelName:
 *                 type: string
 *                 description: 모델 이름 (선택, 미입력 시 파일명 사용)
 *                 example: "My Character"
 *     responses:
 *       201:
 *         description: 모델 업로드 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BaseResponse'
 *                 - type: object
 *                   properties:
 *                     model:
 *                       $ref: '#/components/schemas/ModelInfo'
 *       400:
 *         description: 잘못된 요청 (모델 파일 누락)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 중복된 모델 이름
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
                code: 'MISSING_MODEL_FILE',
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
            `INSERT INTO user_models (user_id, model_name, file_path, file_size, thumbnail_path, is_ai_generated)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id, model_name, file_path, file_size, thumbnail_path, is_ai_generated, created_at`,
            [req.userId, model_name, file_path, modelFile.size, thumbnail_path, false]
        );

        console.log('[MODEL-UPLOAD] SUCCESS:', {
            modelId: result.rows[0].id,
            modelName: result.rows[0].model_name,
            fileSize: modelFile.size,
            hasThumbnail: !!thumbnailFile
        });

        const row = result.rows[0];
        res.status(201).json({
            success: true,
            code: 'SUCCESS',
            message: 'Model uploaded successfully',
            model: {
                id: row.id,
                modelName: row.model_name,
                filePath: row.file_path,
                fileSize: row.file_size,
                thumbnailPath: row.thumbnail_path,
                isAiGenerated: row.is_ai_generated,
                createdAt: row.created_at
            }
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
                code: 'DUPLICATE_MODEL_NAME',
                message: 'Model name already exists for this user'
            });
        }

        if (error.code) {
            return res.status(500).json({
                success: false,
                code: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/models/{id}:
 *   put:
 *     summary: 모델 정보 수정
 *     description: 모델의 정보를 수정합니다 (자신의 모델만)
 *     tags:
 *       - Models
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 모델 ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               modelName:
 *                 type: string
 *               filePath:
 *                 type: string
 *               fileSize:
 *                 type: integer
 *               thumbnailPath:
 *                 type: string
 *     responses:
 *       200:
 *         description: 모델 수정 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BaseResponse'
 *                 - type: object
 *                   properties:
 *                     model:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         modelName:
 *                           type: string
 *                         filePath:
 *                           type: string
 *                         fileSize:
 *                           type: integer
 *                         thumbnailPath:
 *                           type: string
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 모델을 찾을 수 없음 또는 권한 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 중복된 모델 이름
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
                code: 'MODEL_NOT_FOUND',
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
                code: 'NO_UPDATE_FIELDS',
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

        const row = result.rows[0];
        res.json({
            success: true,
            code: 'SUCCESS',
            message: 'Model updated successfully',
            model: {
                id: row.id,
                modelName: row.model_name,
                filePath: row.file_path,
                fileSize: row.file_size,
                thumbnailPath: row.thumbnail_path,
                updatedAt: row.updated_at
            }
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
                code: 'DUPLICATE_MODEL_NAME',
                message: 'Model name already exists for this user'
            });
        }

        if (error.code) {
            return res.status(500).json({
                success: false,
                code: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/models/{id}/thumbnail:
 *   post:
 *     summary: 썸네일 업로드/수정
 *     description: 모델의 썸네일 이미지를 업로드하거나 수정합니다 (자신의 모델만)
 *     tags:
 *       - Models
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 모델 ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - thumbnail
 *             properties:
 *               thumbnail:
 *                 type: string
 *                 format: binary
 *                 description: 썸네일 이미지 파일
 *     responses:
 *       200:
 *         description: 썸네일 업로드 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BaseResponse'
 *                 - type: object
 *                   properties:
 *                     model:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                         modelName:
 *                           type: string
 *                         thumbnailPath:
 *                           type: string
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: 잘못된 요청
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 모델을 찾을 수 없음 또는 권한 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
                code: 'MISSING_THUMBNAIL_FILE',
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
                code: 'MODEL_NOT_FOUND',
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

        const row = result.rows[0];
        res.json({
            success: true,
            code: 'SUCCESS',
            message: 'Thumbnail uploaded successfully',
            model: {
                id: row.id,
                modelName: row.model_name,
                thumbnailPath: row.thumbnail_path,
                updatedAt: row.updated_at
            }
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
                code: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/models/{modelId}/download-url:
 *   get:
 *     summary: 모델 다운로드 URL 발급 (프로토타입)
 *     description: |
 *       모델 ID로 다운로드 가능한 URL을 발급합니다.
 *
 *       - 로컬 스토리지: 다운로드 엔드포인트 URL 반환
 *       - S3 스토리지: PresignedURL 반환 (5분 만료)
 *
 *       **프로토타입 단계**: 인증된 사용자는 모든 모델의 다운로드 URL을 요청할 수 있습니다.
 *     tags:
 *       - Models
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: modelId
 *         required: true
 *         schema:
 *           type: integer
 *         description: 다운로드할 모델 ID
 *         example: 1
 *     responses:
 *       200:
 *         description: 다운로드 URL 발급 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, code, message, url, expiresIn, storageType]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 code:
 *                   type: string
 *                   example: "DOWNLOAD_URL_SUCCESS"
 *                 message:
 *                   type: string
 *                   example: "Download URL generated successfully"
 *                 url:
 *                   type: string
 *                   format: uri
 *                   example: "http://localhost:3001/api/models/1/download"
 *                   description: 다운로드 URL (로컬) 또는 PresignedURL (S3)
 *                 expiresIn:
 *                   type: integer
 *                   example: 300
 *                   description: URL 만료 시간 (초, S3만 해당)
 *                 storageType:
 *                   type: string
 *                   enum: [local, s3]
 *                   example: "local"
 *                   description: 스토리지 타입
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, code, message]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "UNAUTHORIZED"
 *                 message:
 *                   type: string
 *                   example: "Unauthorized"
 *       404:
 *         description: 모델을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, code, message]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "MODEL_NOT_FOUND"
 *                 message:
 *                   type: string
 *                   example: "Model not found"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, code, message]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INTERNAL_SERVER_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
// 5-1. 모델 다운로드 URL 발급 (프로토타입 - 모든 인증된 사용자 접근 가능)
router.get('/:modelId/download-url', async (req, res) => {
    try {
        const { modelId } = req.params;

        console.log('[MODEL-DOWNLOAD-URL] 다운로드 URL 발급 시도:', {
            modelId,
            requesterId: req.userId,
            timestamp: new Date().toISOString()
        });

        // 모델 정보 조회 (소유권 체크 없음 - 프로토타입)
        const result = await pool.query(
            `SELECT id, model_name, file_path, user_id
             FROM user_models
             WHERE id = $1`,
            [modelId]
        );

        if (result.rows.length === 0) {
            console.log('[MODEL-DOWNLOAD-URL] ERROR: 모델 없음', {
                modelId
            });
            return res.status(404).json({
                success: false,
                code: 'MODEL_NOT_FOUND',
                message: 'Model not found'
            });
        }

        const model = result.rows[0];
        const isS3 = process.env.STORAGE_TYPE === 's3';

        let downloadUrl;
        let expiresIn = null;

        if (isS3) {
            // S3 PresignedURL 생성 (5분 만료)
            const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
            const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

            const s3Client = new S3Client({ region: process.env.AWS_REGION });
            const command = new GetObjectCommand({
                Bucket: process.env.S3_BUCKET,
                Key: model.file_path
            });

            expiresIn = 300; // 5분
            downloadUrl = await getSignedUrl(s3Client, command, { expiresIn });

            console.log('[MODEL-DOWNLOAD-URL] SUCCESS (S3):', {
                modelId: model.id,
                modelName: model.model_name,
                expiresIn
            });
        } else {
            // 로컬 스토리지 - 다운로드 엔드포인트 URL 반환
            const baseUrl = process.env.RESOURCE_SERVER_URL || 'http://localhost:3001';
            downloadUrl = `${baseUrl}/api/models/${model.id}/download`;

            console.log('[MODEL-DOWNLOAD-URL] SUCCESS (Local):', {
                modelId: model.id,
                modelName: model.model_name
            });
        }

        res.json({
            success: true,
            code: 'DOWNLOAD_URL_SUCCESS',
            message: 'Download URL generated successfully',
            url: downloadUrl,
            expiresIn: expiresIn,
            storageType: isS3 ? 's3' : 'local'
        });

    } catch (error) {
        console.error('[MODEL-DOWNLOAD-URL] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

        if (error.code) {
            return res.status(500).json({
                success: false,
                code: 'DATABASE_ERROR',
                message: 'Database error'
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Internal server error'
        });
    }
});

/**
 * @swagger
 * /api/models/{id}/download:
 *   get:
 *     summary: 모델 파일 다운로드 (로컬 스토리지 전용)
 *     description: |
 *       로컬 스토리지 환경에서 모델 파일을 직접 다운로드합니다.
 *       이 API는 download-url API에서 반환된 URL을 통해 호출됩니다.
 *
 *       **프로토타입 단계**: 인증된 사용자는 모든 모델을 다운로드할 수 있습니다.
 *     tags:
 *       - Models
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 모델 ID
 *         example: 1
 *     responses:
 *       200:
 *         description: 모델 파일 다운로드 성공
 *         content:
 *           model/gltf-binary:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, code, message]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "UNAUTHORIZED"
 *                 message:
 *                   type: string
 *                   example: "Unauthorized"
 *       404:
 *         description: 모델을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, code, message]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "MODEL_NOT_FOUND"
 *                 message:
 *                   type: string
 *                   example: "Model not found"
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, code, message]
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 code:
 *                   type: string
 *                   example: "INTERNAL_SERVER_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
// 5. 모델 파일 다운로드 (로컬 스토리지 전용, 프로토타입 - 모든 인증된 사용자 접근 가능)
router.get('/:id/download', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[MODEL-DOWNLOAD] 모델 다운로드 시도:', {
            id,
            requesterId: req.userId,
            timestamp: new Date().toISOString()
        });

        // 모델 정보 조회 (소유권 체크 없음 - 프로토타입)
        const result = await pool.query(
            `SELECT id, model_name, file_path
             FROM user_models
             WHERE id = $1`,
            [id]
        );

        if (result.rows.length === 0) {
            console.log('[MODEL-DOWNLOAD] ERROR: 모델 없음', {
                id
            });
            return res.status(404).json({
                success: false,
                code: 'MODEL_NOT_FOUND',
                message: 'Model not found'
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
                code: 'FILE_NOT_FOUND',
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
                code: 'DATABASE_ERROR',
                message: 'Database error'
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Internal server error'
        });
    }
});

/**
 * @swagger
 * /api/models/{id}/thumbnail:
 *   get:
 *     summary: 썸네일 이미지 조회
 *     description: 모델의 썸네일 이미지를 조회합니다 (자신의 모델만)
 *     tags:
 *       - Models
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 모델 ID
 *     responses:
 *       200:
 *         description: 썸네일 이미지
 *         content:
 *           image/*:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 모델 또는 썸네일을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
                code: 'MODEL_NOT_FOUND',
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
                code: 'THUMBNAIL_NOT_FOUND',
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
                code: 'FILE_NOT_FOUND',
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
                code: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

/**
 * @swagger
 * /api/models/{id}:
 *   delete:
 *     summary: 모델 삭제
 *     description: 특정 모델을 DB와 파일 시스템에서 삭제합니다.
 *     tags:
 *       - Models
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 모델 ID
 *         example: 1
 *     responses:
 *       200:
 *         description: 모델 삭제 성공
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BaseResponse'
 *                 - type: object
 *                   properties:
 *                     deletedModel:
 *                       $ref: '#/components/schemas/DeletedModelInfo'
 *       401:
 *         description: 인증 실패
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 모델을 찾을 수 없음
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: 서버 오류
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
                code: 'MODEL_NOT_FOUND',
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

        const row = result.rows[0];
        res.json({
            success: true,
            code: 'SUCCESS',
            message: 'Model deleted successfully',
            deletedModel: {
                id: row.id,
                modelName: row.model_name
            }
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
                code: 'DATABASE_ERROR',
                message: 'Database error',
                code: error.code
            });
        }

        res.status(500).json({
            success: false,
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Server error'
        });
    }
});

module.exports = router;
