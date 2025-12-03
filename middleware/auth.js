const jwt = require('jsonwebtoken');

// JWT 토큰 검증 미들웨어
const verifyToken = (req, res, next) => {
    console.log('[AUTH] 토큰 검증 시도:', {
        hasAuthHeader: !!req.headers['authorization'],
        timestamp: new Date().toISOString()
    });

    const authHeader = req.headers['authorization'];

    // --- 개발용 토큰 처리 시작 ---
    // 보안: 개발 환경에서만 활성화
    console.log('[AUTH] NODE_ENV:', process.env.NODE_ENV);
    if (process.env.NODE_ENV === 'development') {
        const devToken = 'MVE_DEV_AUTH_TOKEN_2024_A';
        const incomingToken = authHeader?.split(' ')[1];

        console.log('[AUTH] 개발 모드 - 토큰 비교:', {
            received: incomingToken,
            expected: devToken,
            match: incomingToken === devToken
        });

        if (incomingToken === devToken) {
            console.log('[AUTH] 개발용 토큰 확인. JWT 검증을 우회합니다.');

            // 요청 객체에 가상 개발 사용자 정보 할당
            req.userId = 'dev-user-01';
            req.email = 'developer@mve.com';

            return next();
        }
    }
    // --- 개발용 토큰 처리 종료 ---

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
            email: decoded.email
        });

        // 요청 객체에 사용자 정보 추가
        req.userId = decoded.userId;
        req.email = decoded.email;
        next();
    });
};

module.exports = verifyToken;
