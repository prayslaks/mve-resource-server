# MVE Resource Server

원티드 포텐업 [언리얼 & AI] 최종 프로젝트의 **리소스 파일 경로 관리** 서버입니다.

음원 파일 스트리밍 및 사용자별 3D 모델 파일 경로를 관리하는 Node.js API 서버입니다.

> **참고**: 이 서버는 파일 경로만 저장하며, 실제 파일은 별도의 파일 서버에 저장됩니다. 인증은 [mve-login-server](../mve-login-server)에서 발급한 JWT 토큰을 사용합니다.

**⚠️ 주의**: Claude Code 바이브 코딩으로 개발했으므로, 함부로 실제 서비스에 사용하다 보안 문제가 발생해도 책임지지 않습니다.

---

## 목차

- [기능](#기능)
- [아키텍처](#아키텍처)
- [설치 방법](#설치-방법)
- [환경 설정](#환경-설정)
- [데이터베이스 설정](#데이터베이스-설정)
- [서버 실행](#서버-실행)
- [API 엔드포인트](#api-엔드포인트)
- [빠른 시작](#빠른-시작)
- [프로젝트 구조](#프로젝트-구조)
- [기술 스택](#기술-스택)

---

## 기능

### 음원 파일 (공용 - 로그인한 모든 유저 접근 가능)
- ✅ 음원 목록 조회
- ✅ 음원 정보 조회
- ✅ **음원 업로드** (AAC, M4A, MP3, WAV 지원)
- ✅ **음원 스트리밍** (S3: Presigned URL / 로컬: Range Request)
- ✅ 음원 검색 (제목, 아티스트)
- ✅ 포맷: **AAC (.m4a)** - 압축률 우수, 스트리밍 최적화
- ✅ **보안**: JWT 인증 필요 (로그인한 유저만 접근 가능)
- ✅ **스토리지**: AWS S3 (프로덕션) / 로컬 (개발) 환경별 분기

### 3D 모델 파일 (개인 - JWT 인증 필요)
- ✅ 내 모델 목록 조회
- ✅ 모델 정보 조회 (자신의 모델만)
- ✅ 모델 등록 (파일 경로 저장)
- ✅ 모델 수정
- ✅ 모델 삭제
- ✅ 포맷: **GLB** (glTF Binary)
- ✅ **보안**: 사용자 A는 사용자 B의 모델에 접근 불가

### 공통
- ✅ JWT 토큰 검증 (모든 API에 적용)
- ✅ PostgreSQL 데이터베이스
- ✅ 상세한 오류 처리 및 디버깅 로그
- ✅ CORS 지원

---

## 아키텍처

```
┌─────────────────────┐        ┌──────────────────────┐
│  MVE Login Server   │        │  MVE Resource Server │
│    (Port 3000)      │        │     (Port 3001)      │
│                     │        │                      │
│  - JWT 토큰 발급    │ Token  │  - 음원 스트리밍      │
│                     │───────▶│  - 모델 경로 관리     │
└─────────────────────┘        │  - JWT 토큰 검증      │
                               └──────────────────────┘
                                         │
        ┌────────────────────────────────┼────────────────┐
        │                                │                │
        ▼                                ▼                ▼
┌───────────────┐            ┌─────────────────┐  ┌──────────────┐
│ PostgreSQL DB │            │  File Server    │  │   Client     │
│               │            │                 │  │  (Unreal)    │
│ - audio_files │            │ - /audio/*.m4a  │  │              │
│ - user_models │            │ - /models/*.glb │  │  스트리밍    │
└───────────────┘            └─────────────────┘  └──────────────┘

공유 환경변수:
- JWT_SECRET (login-server와 동일)
- DB 설정 (동일 DB 사용)
```

---

## 설치 방법

### 1. 저장소 클론

```bash
git clone <repository-url>
cd mve-resource-server
```

### 2. 의존성 설치

```bash
npm install
```

---

## 환경 설정

`.env` 파일을 생성하고 다음 내용을 입력합니다:

### 개발 환경 (로컬 스토리지)

```env
# Server Configuration
PORT=3001

# Storage Configuration
STORAGE_TYPE=local
FILE_SERVER_PATH=./files

# Database Configuration (login-server와 동일해야 함)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_actual_password
DB_NAME=logindb

# JWT Secret (login-server와 반드시 동일해야 함!!!)
JWT_SECRET=your-strong-secret-key
```

### 프로덕션 환경 (AWS S3)

```env
# Server Configuration
PORT=3001

# Storage Configuration
STORAGE_TYPE=s3
S3_BUCKET=your-bucket-name

# AWS Credentials
AWS_REGION=ap-northeast-2
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_actual_password
DB_NAME=logindb

# JWT Secret
JWT_SECRET=your-strong-secret-key
```

**⚠️ 중요**:
- `JWT_SECRET`과 DB 설정은 **반드시 login-server와 동일**해야 합니다!
- AWS S3 설정은 [docs/AWS_S3_SETUP.md](docs/AWS_S3_SETUP.md)를 참고하세요.

---

## 데이터베이스 설정

이 서버는 login-server와 동일한 PostgreSQL 데이터베이스를 사용합니다.

### 1. login-server 데이터베이스가 이미 설정되어 있어야 함

먼저 [mve-login-server](../mve-login-server)의 데이터베이스 설정을 완료해야 합니다.

### 2. 리소스 테이블 추가

**Windows (관리자 권한):**
```powershell
psql -U postgres -d logindb -f init.sql
```

**Ubuntu:**
```bash
sudo -u postgres psql -d logindb -f init.sql
```

**생성되는 테이블:**
- `audio_files` - 공용 음원 파일 정보 (모든 유저 접근 가능)
- `user_models` - 개인 3D 모델 파일 경로 (유저별 개인 소유)

---

## 서버 실행

### 개발 환경

```bash
node server.js
```

서버가 `http://localhost:3001`에서 실행됩니다.

### 프로덕션 환경 (PM2 사용)

```bash
# PM2 설치
npm install -g pm2

# 서버 시작
pm2 start server.js --name mve-resource-server

# 자동 시작 설정
pm2 startup
pm2 save

# 서버 상태 확인
pm2 status
```

---

## API 엔드포인트

### 음원 API (공용 - JWT 인증 필요)

> **참고**: 모든 음원 API는 `Authorization: Bearer <token>` 헤더가 필요합니다.

#### 1. 음원 목록 조회
```http
GET /api/audio/list
Authorization: Bearer <your_token>
```

**응답:**
```json
{
  "success": true,
  "count": 3,
  "audio_files": [
    {
      "id": 1,
      "title": "Sample Track 1",
      "artist": "Artist A",
      "file_path": "/audio/sample1.m4a",
      "file_size": 3145728,
      "duration": 180,
      "format": "m4a",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### 2. 음원 정보 조회
```http
GET /api/audio/:id
```

#### 3. 음원 스트리밍
```http
GET /api/audio/stream/:id
```

**S3 환경 응답 (Presigned URL):**
```json
{
  "success": true,
  "stream_url": "https://bucket.s3.amazonaws.com/audio/file.aac?X-Amz-Signature=...",
  "audio_file": {
    "id": 1,
    "title": "Sample Track",
    "format": "aac",
    "file_size": 3145728
  },
  "expires_in": 3600
}
```

**로컬 환경:**
- HTTP Range Request 지원 (부분 다운로드)
- 직접 바이너리 스트리밍

**예제 (언리얼 엔진):**
```cpp
// S3 환경: Presigned URL로 직접 재생
FString StreamURL = PresignedUrlFromAPI;
MediaPlayer->OpenUrl(StreamURL);

// 로컬 환경: 서버 URL로 재생
FString StreamURL = TEXT("http://localhost:3001/api/audio/stream/1");
MediaPlayer->OpenUrl(StreamURL);
```

#### 4. 음원 업로드
```http
POST /api/audio/upload
Authorization: Bearer <your_token>
Content-Type: multipart/form-data

audio: <file>
title: "Song Title"
artist: "Artist Name" (optional)
duration: 180 (optional, seconds)
```

**응답:**
```json
{
  "success": true,
  "message": "Audio file uploaded successfully",
  "audio_file": {
    "id": 1,
    "title": "Song Title",
    "artist": "Artist Name",
    "file_path": "audio/1234567890.aac",
    "file_size": 3145728,
    "duration": 180,
    "format": "aac",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**제한사항:**
- 최대 파일 크기: 100MB
- 지원 포맷: AAC, M4A, MP3, WAV

#### 5. 음원 검색
```http
GET /api/audio/search/:query
```

**예제:**
```http
GET /api/audio/search/artist
```

---

### 모델 API (개인 - JWT 인증 필요)

> **참고**: 모든 모델 API는 `Authorization: Bearer <token>` 헤더가 필요합니다.

#### 1. 내 모델 목록 조회
```http
GET /api/models/list
Authorization: Bearer <your_token>
```

**응답:**
```json
{
  "success": true,
  "count": 2,
  "models": [
    {
      "id": 1,
      "model_name": "My Avatar",
      "file_path": "/models/user1/avatar.glb",
      "file_size": 5242880,
      "thumbnail_path": "/models/user1/avatar_thumb.jpg",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### 2. 특정 모델 조회
```http
GET /api/models/:id
Authorization: Bearer <your_token>
```

#### 3. 모델 등록
```http
POST /api/models/register
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "model_name": "My Avatar",
  "file_path": "/models/user123/avatar.glb",
  "file_size": 5242880,
  "thumbnail_path": "/models/user123/avatar_thumb.jpg"
}
```

#### 4. 모델 수정
```http
PUT /api/models/:id
Authorization: Bearer <your_token>
Content-Type: application/json

{
  "model_name": "Updated Avatar",
  "file_path": "/models/user123/avatar_v2.glb"
}
```

#### 5. 모델 삭제
```http
DELETE /api/models/:id
Authorization: Bearer <your_token>
```

---

## 빠른 시작

### 웹 UI 테스트

브라우저에서 `public/api_test.html`을 열어 간편하게 API를 테스트할 수 있습니다.

```
http://localhost:3001/api_test.html
```

### PowerShell 예제

```powershell
# 1. Login-server에서 로그인하여 토큰 받기
$loginBody = @{
    username = "testuser"
    password = "password123"
} | ConvertTo-Json

$loginResult = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody

$token = $loginResult.token
$headers = @{ "Authorization" = "Bearer $token" }

# 2. 음원 목록 조회 (JWT 인증 필요)
$audioList = Invoke-RestMethod -Uri "http://localhost:3001/api/audio/list" `
    -Method GET `
    -Headers $headers
$audioList.audio_files | Format-Table

# 3. 음원 스트리밍 URL
$streamUrl = "http://localhost:3001/api/audio/stream/1"
Write-Host "Stream URL: $streamUrl"

# 4. 내 모델 목록 조회 (인증 필요)
$modelList = Invoke-RestMethod -Uri "http://localhost:3001/api/models/list" `
    -Method GET `
    -Headers $headers
$modelList.models | Format-Table

# 5. 모델 등록
$modelBody = @{
    model_name = "My Character"
    file_path = "/models/testuser/character.glb"
    file_size = 5242880
} | ConvertTo-Json

$newModel = Invoke-RestMethod -Uri "http://localhost:3001/api/models/register" `
    -Method POST `
    -ContentType "application/json" `
    -Headers $headers `
    -Body $modelBody

$newModel.model | Format-List
```

---

## 프로젝트 구조

```
mve-resource-server/
├── server.js           # Express 서버 설정
├── db.js               # PostgreSQL 연결 풀
├── .env                # 환경 변수
├── .env.example        # 환경 변수 예제
├── init.sql            # 리소스 테이블 초기화 SQL
├── middleware/
│   └── auth.js         # JWT 토큰 검증 미들웨어
├── routes/
│   ├── audio.js        # 음원 관련 라우트 (공용)
│   └── models.js       # 모델 관련 라우트 (개인, JWT 필요)
├── package.json        # 의존성 관리
├── .gitignore          # Git 제외 파일
└── README.md           # 프로젝트 문서
```

---

## 기술 스택

- **Node.js** - 런타임 환경
- **Express** - 웹 프레임워크
- **PostgreSQL** - 관계형 데이터베이스 (login-server와 공유)
- **pg** - PostgreSQL 클라이언트
- **jsonwebtoken** - JWT 토큰 검증
- **dotenv** - 환경 변수 관리
- **cors** - CORS 처리
- **multer** - 파일 업로드 처리
- **@aws-sdk/client-s3** - AWS S3 연동
- **@aws-sdk/s3-request-presigner** - Presigned URL 생성
- **multer-s3** - S3 직접 업로드

---

## 음원 포맷: AAC (.m4a)

### 선택 이유
- ✅ 우수한 압축률 (MP3 대비 30% 더 작은 파일)
- ✅ HTTP Live Streaming (HLS) 지원
- ✅ 언리얼 엔진 Media Player 지원
- ✅ 모든 주요 브라우저 지원
- ✅ 낮은 지연시간

### 변환 방법 (FFmpeg)

```bash
# MP3 → M4A 변환
ffmpeg -i input.mp3 -c:a aac -b:a 128k output.m4a

# WAV → M4A 변환
ffmpeg -i input.wav -c:a aac -b:a 192k output.m4a
```

---

## 보안 고려사항

1. **음원 파일**: 공용 리소스이지만 JWT 인증 필요 (로그인한 유저만 접근 가능)
2. **모델 파일**: 개인 소유, JWT 검증 + 소유권 확인 (자신의 모델만 접근)
3. **S3 Presigned URL**: 서명 포함 + 1시간 만료 (URL 공유되어도 만료 후 접근 불가)
4. **SQL Injection 방지**: Prepared Statements 사용
5. **JWT_SECRET 공유**: login-server와 동일한 키 사용 필수
6. **파일 업로드 검증**: MIME 타입 + 확장자 검사, 100MB 크기 제한

---

## 라이선스

이 프로젝트는 포트폴리오 목적으로 개발되었습니다.

---

## 문의

프로젝트에 대한 문의사항이 있으시면 이슈를 등록해주세요.
