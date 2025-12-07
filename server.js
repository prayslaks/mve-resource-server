const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

// 서버 내 라우트 경로
console.log('[SERVER] Loading Redis client...');
const redisClient = require('./redis-client');
console.log('[SERVER] Redis client loaded successfully');
const audioRoutes = require('./routes/audio');
const modelRoutes = require('./routes/models');
const concertRoutes = require('./routes/concert');
const accessoryPresetRoutes = require('./routes/accessory-presets');

const app = express();

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 라우트
app.use('/api/audio', audioRoutes);                        // 공용 음원 API
app.use('/api/models', modelRoutes);                       // 개인 모델 API + AI 생성 (JWT 필요)
app.use('/api/concert', concertRoutes);                    // 콘서트 API (JWT 필요)
app.use('/api/accessory-presets', accessoryPresetRoutes);  // 액세서리 프리셋 API (JWT 필요)

// 헬스 체크
app.get('/health/resource', async (req, res) => {
    try {
        const redisPing = await redisClient.ping();

        res.json({
            success: true,
            server: 'mve-resource-server',
            redis: redisPing === 'PONG' ? 'connected' : 'disconnected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.json({
            success: false,
            error: 'SERVER_PROBLEM',
            message: 'There is some error in Server.',
            timestamp: new Date().toISOString()
        });
    }
});

// 루트 경로
app.get('/', (req, res) => {
    res.json({
        message: 'MVE Resource Server - Audio & 3D Model File Path API',
        version: '1.0.0',
        description: 'Manage audio file streaming and user 3D model file paths',
        endpoints: {
            health: 'GET /health/resource',
            audio_list: 'GET /api/audio/list (requires JWT)',
            audio_info: 'GET /api/audio/:id (requires JWT)',
            audio_stream: 'GET /api/audio/stream/:id (requires JWT, supports range requests)',
            audio_search: 'GET /api/audio/search/:query (requires JWT)',
            model_generate: 'POST /api/models/generate (requires JWT)',
            model_job_status: 'GET /api/models/jobs/:job_id (requires JWT)',
            model_list: 'GET /api/models/list (requires JWT)',
            model_get: 'GET /api/models/:id (requires JWT)',
            model_upload: 'POST /api/models/upload (requires JWT)',
            model_upload_from_ai: 'POST /api/models/upload-from-ai (requires job_id + job_secret)',
            model_thumbnail_upload: 'POST /api/models/:id/thumbnail (requires JWT)',
            model_download: 'GET /api/models/:id/download (requires JWT)',
            model_thumbnail_view: 'GET /api/models/:id/thumbnail (requires JWT)',
            model_update: 'PUT /api/models/:id (requires JWT)',
            model_delete: 'DELETE /api/models/:id (requires JWT)',
            concert_create: 'POST /api/concert/create (requires JWT)',
            concert_list: 'GET /api/concert/list (requires JWT)',
            concert_join: 'POST /api/concert/:roomId/join (requires JWT)',
            concert_info: 'GET /api/concert/:roomId/info (requires JWT)',
            concert_add_song: 'POST /api/concert/:roomId/songs/add (requires JWT, studio only)',
            concert_remove_song: 'DELETE /api/concert/:roomId/songs/:songNum (requires JWT, studio only)',
            concert_change_song: 'POST /api/concert/:roomId/songs/change (requires JWT, studio only)',
            concert_current_song: 'GET /api/concert/:roomId/current-song (requires JWT, audience)',
            concert_add_accessory: 'POST /api/concert/:roomId/accessories/add (requires JWT, studio only)',
            concert_remove_accessory: 'DELETE /api/concert/:roomId/accessories/:index (requires JWT, studio only)',
            concert_update_accessories: 'PUT /api/concert/:roomId/accessories (requires JWT, studio only)',
            concert_update_listen_server: 'POST /api/concert/:roomId/listen-server (requires JWT, studio only)',
            concert_toggle_open: 'POST /api/concert/:roomId/toggle-open (requires JWT, studio only)',
            accessory_preset_save: 'POST /api/accessory-presets/save (requires JWT)',
            accessory_preset_list: 'GET /api/accessory-presets/list (requires JWT)',
            accessory_preset_get: 'GET /api/accessory-presets/:id (requires JWT)',
            accessory_preset_update: 'PUT /api/accessory-presets/:id (requires JWT)',
            accessory_preset_delete: 'DELETE /api/accessory-presets/:id (requires JWT)',
            ai_generate: 'POST /api/models/generate (requires JWT, multipart/form-data with prompt and optional image)',
            ai_job_status: 'GET /api/models/jobs/:job_id (requires JWT)'
        }
    });
});

// HTTP 서버 (개발용)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`MVE Resource Server running on port ${PORT}`);
    console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`DB: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    console.log(`Redis: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
});

// HTTPS 서버 (프로덕션용)
// const httpsOptions = {
//     key: fs.readFileSync('./ssl/private.key'),
//     cert: fs.readFileSync('./ssl/certificate.crt')
// };
// https.createServer(httpsOptions, app).listen(443);
