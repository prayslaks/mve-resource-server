-- 액세서리 프리셋 테이블 생성
CREATE TABLE IF NOT EXISTS accessory_presets (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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
