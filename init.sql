-- MVE Resource Server - Database Initialization
-- This script assumes the users table from login-server already exists.

-- ============================================
-- 1. Audio files table (Public for all logged-in users, JWT required)
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
-- 2. User 3D model files table (Private per user)
-- ============================================
CREATE TABLE IF NOT EXISTS user_models (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    model_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT,
    thumbnail_path VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, model_name)
);

-- ============================================
-- Indexes
-- ============================================
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

-- Audio table trigger
DROP TRIGGER IF EXISTS update_audio_timestamp ON audio_files;
CREATE TRIGGER update_audio_timestamp
    BEFORE UPDATE ON audio_files
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Model table trigger
DROP TRIGGER IF EXISTS update_model_timestamp ON user_models;
CREATE TRIGGER update_model_timestamp
    BEFORE UPDATE ON user_models
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- ============================================
-- Sample data (for testing)
-- ============================================
INSERT INTO audio_files (title, artist, file_path, duration, format) VALUES
    ('Sample Track 1', 'Artist A', '/audio/sample1.m4a', 180, 'm4a'),
    ('Sample Track 2', 'Artist B', '/audio/sample2.m4a', 240, 'm4a'),
    ('Sample Track 3', 'Artist C', '/audio/sample3.m4a', 200, 'm4a')
ON CONFLICT (file_path) DO NOTHING;

-- Done
DO $$
BEGIN
    RAISE NOTICE 'Audio and Model tables created successfully!';
    RAISE NOTICE 'Audio files: Public access for logged-in users (JWT required)';
    RAISE NOTICE 'User models: Private access per user (JWT required)';
END $$;
