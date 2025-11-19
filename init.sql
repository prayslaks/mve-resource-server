-- MVE Resource Server - Database Initialization
-- 이 스크립트는 login-server의 users 테이블이 이미 있다고 가정합니다.

-- ============================================
-- 1. 공용 음원 파일 테이블 (로그인한 모든 유저가 사용 가능, JWT 인증 필요)
-- ============================================
CREATE TABLE IF NOT EXISTS audio_files (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,                    -- 음원 제목
    artist VARCHAR(255),                            -- 아티스트
    file_path VARCHAR(500) NOT NULL UNIQUE,         -- 파일 서버 경로 (예: /music/song.m4a)
    file_size BIGINT,                               -- 파일 크기 (bytes)
    duration INTEGER,                               -- 재생 시간 (초)
    format VARCHAR(10) DEFAULT 'm4a',               -- 파일 포맷 (m4a, opus 등)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. 개인 3D 모델 파일 테이블 (유저별 개인 소유)
-- ============================================
CREATE TABLE IF NOT EXISTS user_models (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_name VARCHAR(255) NOT NULL,               -- 모델 이름
    file_path VARCHAR(500) NOT NULL,                -- 파일 서버 경로 (예: /models/user123/avatar.glb)
    file_size BIGINT,                               -- 파일 크기 (bytes)
    thumbnail_path VARCHAR(500),                    -- 썸네일 이미지 경로 (선택)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, model_name)                     -- 유저별 모델명 중복 방지
);

-- ============================================
-- 인덱스 생성
-- ============================================
-- 음원 검색 최적화
CREATE INDEX IF NOT EXISTS idx_audio_files_title ON audio_files(title);
CREATE INDEX IF NOT EXISTS idx_audio_files_artist ON audio_files(artist);

-- 모델 조회 최적화
CREATE INDEX IF NOT EXISTS idx_user_models_user_id ON user_models(user_id);
CREATE INDEX IF NOT EXISTS idx_user_models_name ON user_models(model_name);

-- ============================================
-- 트리거: updated_at 자동 갱신
-- ============================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 음원 테이블 트리거
DROP TRIGGER IF EXISTS update_audio_timestamp ON audio_files;
CREATE TRIGGER update_audio_timestamp
    BEFORE UPDATE ON audio_files
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- 모델 테이블 트리거
DROP TRIGGER IF EXISTS update_model_timestamp ON user_models;
CREATE TRIGGER update_model_timestamp
    BEFORE UPDATE ON user_models
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- ============================================
-- 샘플 데이터 (테스트용)
-- ============================================
-- 샘플 음원 추가 (선택사항)
INSERT INTO audio_files (title, artist, file_path, duration, format) VALUES
    ('Sample Track 1', 'Artist A', '/audio/sample1.m4a', 180, 'm4a'),
    ('Sample Track 2', 'Artist B', '/audio/sample2.m4a', 240, 'm4a'),
    ('Sample Track 3', 'Artist C', '/audio/sample3.m4a', 200, 'm4a')
ON CONFLICT (file_path) DO NOTHING;

-- 완료 메시지
DO $$
BEGIN
    RAISE NOTICE 'Audio and Model tables created successfully!';
    RAISE NOTICE 'Audio files: Public access for logged-in users (JWT required)';
    RAISE NOTICE 'User models: Private access per user (JWT required)';
END $$;
