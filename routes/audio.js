const express = require('express');
const pool = require('../db');
const verifyToken = require('../middleware/auth');
const fs = require('fs');
const path = require('path');

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

// 2. 특정 음원 정보 조회
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

// 3. 음원 스트리밍 (Range Request 지원)
router.get('/stream/:id', async (req, res) => {
    try {
        const { id } = req.params;

        console.log('[AUDIO-STREAM] 스트리밍 시도:', {
            id,
            range: req.headers.range,
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
        const fileSize = stat.size;
        const range = req.headers.range;

        // Range Request 처리 (스트리밍)
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;

            const fileStream = fs.createReadStream(filePath, { start, end });

            const headers = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': `audio/${audioFile.format}`,
            };

            console.log('[AUDIO-STREAM] Range request:', { start, end, chunkSize });

            res.writeHead(206, headers);
            fileStream.pipe(res);

        } else {
            // 전체 파일 전송
            const headers = {
                'Content-Length': fileSize,
                'Content-Type': `audio/${audioFile.format}`,
                'Accept-Ranges': 'bytes'
            };

            console.log('[AUDIO-STREAM] Full file streaming:', { fileSize });

            res.writeHead(200, headers);
            fs.createReadStream(filePath).pipe(res);
        }

        console.log('[AUDIO-STREAM] SUCCESS:', { id, title: audioFile.title });

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

// 4. 음원 검색 (제목 또는 아티스트)
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

module.exports = router;
