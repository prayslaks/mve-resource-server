const express = require('express');
const cors = require('cors');
const https = require('https');
const fs = require('fs');
require('dotenv').config();

const audioRoutes = require('./routes/audio');
const modelRoutes = require('./routes/models');

const app = express();

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 라우트
app.use('/api/audio', audioRoutes);      // 공용 음원 API
app.use('/api/models', modelRoutes);     // 개인 모델 API (JWT 필요)

// 헬스 체크
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        server: 'mve-resource-server',
        timestamp: new Date().toISOString()
    });
});

// 루트 경로
app.get('/', (req, res) => {
    res.json({
        message: 'MVE Resource Server - Audio & 3D Model File Path API',
        version: '1.0.0',
        description: 'Manage audio file streaming and user 3D model file paths',
        endpoints: {
            health: 'GET /health',
            audio_list: 'GET /api/audio/list (requires JWT)',
            audio_info: 'GET /api/audio/:id (requires JWT)',
            audio_stream: 'GET /api/audio/stream/:id (requires JWT, supports range requests)',
            audio_search: 'GET /api/audio/search/:query (requires JWT)',
            model_list: 'GET /api/models/list (requires JWT)',
            model_get: 'GET /api/models/:id (requires JWT)',
            model_register: 'POST /api/models/register (requires JWT)',
            model_update: 'PUT /api/models/:id (requires JWT)',
            model_delete: 'DELETE /api/models/:id (requires JWT)'
        }
    });
});

// HTTP 서버 (개발용)
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`MVE Resource Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`DB: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
});

// HTTPS 서버 (프로덕션용)
// const httpsOptions = {
//     key: fs.readFileSync('./ssl/private.key'),
//     cert: fs.readFileSync('./ssl/certificate.crt')
// };
// https.createServer(httpsOptions, app).listen(443);
