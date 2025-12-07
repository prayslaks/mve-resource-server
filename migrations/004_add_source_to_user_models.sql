-- user_models 테이블에 is_ai_generated 컬럼 추가
-- AI 생성 모델과 사용자 직접 업로드 모델을 구분하기 위한 컬럼

ALTER TABLE user_models
ADD COLUMN IF NOT EXISTS is_ai_generated BOOLEAN DEFAULT FALSE;

-- 기존 데이터는 모두 FALSE로 설정 (기본값 = 직접 업로드)
UPDATE user_models
SET is_ai_generated = FALSE
WHERE is_ai_generated IS NULL;

-- 인덱스 추가 (필터링 성능 향상)
CREATE INDEX IF NOT EXISTS idx_user_models_is_ai ON user_models(is_ai_generated);
CREATE INDEX IF NOT EXISTS idx_user_models_user_is_ai ON user_models(user_id, is_ai_generated);

-- 마이그레이션 완료 확인용 주석
-- 적용일: 2025-12-07
-- 목적: AI 생성 모델과 직접 업로드 모델 구분 (BOOLEAN 타입 사용)
