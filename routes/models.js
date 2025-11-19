const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');

const router = express.Router();

// 모든 모델 라우트에 JWT 검증 미들웨어 적용 (개인 소유)
router.use(verifyToken);

// ============================================
// 개인 3D 모델 API (인증 필요)
// ============================================

// 1. 내 모델 목록 조회 (자신의 모델만)
router.get('/list', async (req, res) => {
    try {
        console.log('[MODEL-LIST] 모델 목록 조회 시도:', {
            userId: req.userId,
            username: req.username,
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

// 3. 모델 등록 (파일 경로 저장)
router.post('/register', async (req, res) => {
    try {
        console.log('[MODEL-REGISTER] 모델 등록 시도:', {
            userId: req.userId,
            username: req.username,
            timestamp: new Date().toISOString()
        });

        const { model_name, file_path, file_size, thumbnail_path } = req.body;

        // 입력값 검증
        if (!model_name || !file_path) {
            console.log('[MODEL-REGISTER] ERROR: 필수 필드 누락');
            return res.status(400).json({
                success: false,
                error: 'MISSING_FIELDS',
                message: 'model_name and file_path are required'
            });
        }

        if (typeof model_name !== 'string' || typeof file_path !== 'string') {
            console.log('[MODEL-REGISTER] ERROR: 잘못된 입력 타입');
            return res.status(400).json({
                success: false,
                error: 'INVALID_INPUT_TYPE',
                message: 'model_name and file_path must be strings'
            });
        }

        // 모델 등록
        const result = await pool.query(
            `INSERT INTO user_models (user_id, model_name, file_path, file_size, thumbnail_path)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, model_name, file_path, file_size, thumbnail_path, created_at`,
            [req.userId, model_name, file_path, file_size || null, thumbnail_path || null]
        );

        console.log('[MODEL-REGISTER] SUCCESS:', {
            modelId: result.rows[0].id,
            modelName: result.rows[0].model_name
        });

        res.status(201).json({
            success: true,
            message: 'Model registered successfully',
            model: result.rows[0]
        });

    } catch (error) {
        console.error('[MODEL-REGISTER] EXCEPTION:', {
            message: error.message,
            stack: error.stack,
            code: error.code,
            timestamp: new Date().toISOString()
        });

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

// 5. 모델 삭제 (자신의 모델만)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[MODEL-DELETE] 모델 삭제 시도:', {
            id,
            userId: req.userId,
            timestamp: new Date().toISOString()
        });

        const result = await pool.query(
            `DELETE FROM user_models
             WHERE id = $1 AND user_id = $2
             RETURNING id, model_name`,
            [id, req.userId]
        );

        if (result.rows.length === 0) {
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
