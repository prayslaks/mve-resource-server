-- MVE Resource Server - Database Initialization
-- This database is now SEPARATE from logindb
-- user_id references are validated at application level via JWT

-- ============================================
-- 1. 모든 유저를 위한 음원 파일 테이블 (공용 리소스)
-- ============================================
CREATE TABLE IF NOT EXISTS audio_files (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    artist VARCHAR(255),
    file_path VARCHAR(500) NOT NULL UNIQUE,
    file_size BIGINT,
    duration INTEGER,
    format VARCHAR(10) DEFAULT 'm4a',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- 2. 각 유저를 위한 모델 파일 테이블 (유저별 리소스)
-- ============================================
-- user_id는 JWT에서 검증된 값으로만 추가됨 (application level 검증)
CREATE TABLE IF NOT EXISTS user_models (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    model_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    thumbnail_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, model_name)
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_audio_files_title ON audio_files(title);
CREATE INDEX IF NOT EXISTS idx_audio_files_artist ON audio_files(artist);
CREATE INDEX IF NOT EXISTS idx_user_models_user_id ON user_models(user_id);
CREATE INDEX IF NOT EXISTS idx_user_models_name ON user_models(model_name);

-- ============================================
-- Trigger: auto-update updated_at
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
-- 테스트 용 샘플 데이터
-- ============================================
INSERT INTO audio_files (title, artist, file_path, duration, format) VALUES
    ('Sample Track 1', 'Artist A', '/audio/sample1.m4a', 180, 'm4a'),
    ('Sample Track 2', 'Artist B', '/audio/sample2.m4a', 240, 'm4a'),
    ('Sample Track 3', 'Artist C', '/audio/sample3.m4a', 200, 'm4a')
ON CONFLICT (file_path) DO NOTHING;

-- 완료
DO $$
BEGIN
    RAISE NOTICE 'Audio and Model tables created successfully!';
    RAISE NOTICE 'Audio files: Public access for logged-in users (JWT required)';
    RAISE NOTICE 'User models: Private access per user (JWT required)';
END $$;

-- ============================================
-- 3. 액세서리 프리셋 테이블 (유저별 리소스)
-- ============================================
-- user_id는 JWT에서 검증된 값으로만 추가됨 (application level 검증)
CREATE TABLE IF NOT EXISTS accessory_presets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    preset_name VARCHAR(100) NOT NULL,
    description TEXT,
    file_path VARCHAR(500) NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, preset_name)
);

-- 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_accessory_presets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_accessory_presets_updated_at
BEFORE UPDATE ON accessory_presets
FOR EACH ROW
EXECUTE FUNCTION update_accessory_presets_updated_at();

-- 인덱스 생성
CREATE INDEX idx_accessory_presets_user_id ON accessory_presets(user_id);
CREATE INDEX idx_accessory_presets_is_public ON accessory_presets(is_public);
CREATE INDEX idx_accessory_presets_created_at ON accessory_presets(created_at DESC);
