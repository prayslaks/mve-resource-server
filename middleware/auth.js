const jwt = require('jsonwebtoken');

// JWT 토큰 검증 미들웨어
const verifyToken = (req, res, next) => {
    console.log('[AUTH] 토큰 검증 시도:', {
        hasAuthHeader: !!req.headers['authorization'],
        timestamp: new Date().toISOString()
    });

    const authHeader = req.headers['authorization'];

    // Authorization 헤더 확인
    if (!authHeader) {
        console.log('[AUTH] ERROR: Authorization 헤더 없음');
        return res.status(403).json({
            success: false,
            error: 'NO_AUTH_HEADER',
            message: 'No authorization header provided'
        });
    }

    // Bearer 토큰 형식 확인
    if (!authHeader.startsWith('Bearer ')) {
        console.log('[AUTH] ERROR: 잘못된 Authorization 헤더 형식', { authHeader });
        return res.status(403).json({
            success: false,
            error: 'INVALID_AUTH_FORMAT',
            message: 'Authorization header must start with "Bearer "'
        });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        console.log('[AUTH] ERROR: 토큰 없음');
        return res.status(403).json({
            success: false,
            error: 'NO_TOKEN',
            message: 'No token provided'
        });
    }

    // JWT_SECRET 확인
    if (!process.env.JWT_SECRET) {
        console.error('[AUTH] CRITICAL ERROR: JWT_SECRET 설정되지 않음');
        return res.status(500).json({
            success: false,
            error: 'SERVER_CONFIG_ERROR',
            message: 'Server configuration error'
        });
    }

    console.log('[AUTH] JWT 검증 시작');

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.log('[AUTH] ERROR: 토큰 검증 실패', {
                error: err.name,
                message: err.message
            });

            // 토큰 만료
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    error: 'TOKEN_EXPIRED',
                    message: 'Token has expired',
                    expiredAt: err.expiredAt
                });
            }

            // 잘못된 토큰
            if (err.name === 'JsonWebTokenError') {
                return res.status(401).json({
                    success: false,
                    error: 'INVALID_TOKEN',
                    message: 'Invalid token'
                });
            }

            // 기타 JWT 에러
            return res.status(401).json({
                success: false,
                error: 'TOKEN_VERIFICATION_FAILED',
                message: 'Token verification failed'
            });
        }

        console.log('[AUTH] SUCCESS: 토큰 검증 성공', {
            userId: decoded.userId,
            username: decoded.username
        });

        // 요청 객체에 사용자 정보 추가
        req.userId = decoded.userId;
        req.username = decoded.username;
        next();
    });
};

module.exports = verifyToken;
