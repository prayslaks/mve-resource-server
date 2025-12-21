# MVE Resource Server

원티드 포텐업 [언리얼 & AI] 최종 프로젝트의 **리소스 파일 경로 관리** 서버입니다.

음원 파일 스트리밍 및 사용자별 3D 모델 파일 경로를 관리하는 Node.js API 서버입니다.

> **참고**: 이 서버는 파일 경로만 저장하며, 실제 파일은 별도의 파일 서버에 저장됩니다. 인증은 [mve-login-server](https://github.com/prayslaks/mve-login-server)에서 발급한 JWT 토큰을 사용합니다.

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

### AI 3D 모델 생성 (JWT 인증 필요)
- ✅ AI 생성 요청 (프롬프트 기반)
- ✅ AI 생성 요청 (이미지 + 프롬프트)
- ✅ 작업 상태 조회 (job_id 기반)
- ✅ 내 작업 목록 조회
- ✅ AI 서버 콜백 엔드포인트 (작업 완료/실패 알림)
- ✅ **Redis 기반** 작업 큐 관리
- ✅ **비동기 처리**: 요청 즉시 응답, AI 서버에서 백그라운드 생성

### 공통
- ✅ JWT 토큰 검증 (모든 API에 적용, AI 콜백 제외)
- ✅ PostgreSQL 데이터베이스
- ✅ Redis (콘서트 세션 및 AI 작업 관리)
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
# Environment Configuration
NODE_ENV=development

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
# Environment Configuration
NODE_ENV=production

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
- `NODE_ENV`: 환경 구분 (development / production)
  - `development`: 개발용 토큰 인증 우회 로직 활성화
  - `production`: 보안을 위해 반드시 JWT 토큰 검증 실행
- `JWT_SECRET`과 DB 설정은 **반드시 login-server와 동일**해야 합니다!
- AWS S3 설정은 [docs/AWS_S3_SETUP.md](docs/AWS_S3_SETUP.md)를 참고하세요.

### 개발용 토큰 인증 우회 (Unreal Engine 개발 빌드용)

**개발 환경**(`NODE_ENV=development`)에서는 로그인 없이 API를 테스트할 수 있도록 하드코딩된 개발용 토큰을 지원합니다.

**개발용 토큰:**
```
MVE_DEV_AUTH_TOKEN_2024_A
```

**사용 방법:**
```http
GET /api/audio/list
Authorization: Bearer MVE_DEV_AUTH_TOKEN_2024_A
```

**보안:**
- `NODE_ENV=development`일 때만 작동
- 프로덕션 환경(`NODE_ENV=production`)에서는 **절대 활성화되지 않음**
- 개발용 토큰 사용 시 가상 사용자 정보(`dev-user-01`) 자동 할당

**Unreal Engine 예제:**
```cpp
// 개발 빌드에서는 하드코딩된 개발용 토큰 사용
FString DevToken = TEXT("MVE_DEV_AUTH_TOKEN_2024_A");
Request->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + DevToken);

// 프로덕션 빌드에서는 실제 JWT 토큰 사용
Request->SetHeader(TEXT("Authorization"), TEXT("Bearer ") + ActualJWTToken);
```

---

## 데이터베이스 설정

이 서버는 login-server와 동일한 PostgreSQL 데이터베이스를 사용합니다.

### 1. login-server 데이터베이스가 이미 설정되어 있어야 함

먼저 [mve-login-server](https://github.com/prayslaks/mve-login-server)의 데이터베이스 설정을 완료해야 합니다.

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

### Nginx 리버스 프록시 설정

두 서버를 하나의 도메인으로 서비스하려면 nginx 설정이 필요합니다.

```nginx
server {
    listen 80;
    server_name your-domain.com;  # EC2 도메인 또는 퍼블릭 IP

    # 리소스 서버 API (audio, models)
    location /api/audio {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /api/models {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # 로그인 서버 API (기본)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

**적용 방법:**
```bash
sudo nano /etc/nginx/sites-enabled/default
# 위 내용으로 수정 후
sudo nginx -t && sudo systemctl reload nginx
```

> **⚠️ 주의**: `/api/audio`와 `/api/models` 경로를 먼저 정의해야 합니다. nginx는 위에서 아래로 매칭하므로, `/` 경로가 먼저 있으면 모든 요청이 로그인 서버(3000)로 전달됩니다.

### AWS EC2 보안 그룹 설정

EC2 인스턴스의 인바운드 규칙 예시:

| 유형 | 프로토콜 | 포트 | 소스 | 설명 |
|------|----------|------|------|------|
| HTTPS | TCP | 443 | 0.0.0.0/0 | 프로덕션 서비스 (SSL) |
| HTTP | TCP | 80 | 0.0.0.0/0 | 프로덕션 서비스 |
| SSH | TCP | 22 | 내 IP | 서버 관리용 |
| Custom TCP | TCP | 3000 | 내 IP | 개발용 로그인 서버 직접 접근 |
| Custom TCP | TCP | 3001 | 내 IP | 개발용 리소스 서버 직접 접근 |

> **⚠️ 보안 주의사항**:
> - SSH(22)는 반드시 특정 IP만 허용
> - 3000, 3001 포트는 개발 시에만 열고, 프로덕션에서는 nginx(80/443)를 통해서만 접근
> - 프로덕션 환경에서는 HTTP(80)를 HTTPS(443)로 리다이렉트 권장

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

### AI 생성 API (JWT 인증 필요)

> **참고**: AI 생성 API는 언리얼 클라이언트의 `USenderReceiver::RequestGeneration` 기능을 Node.js로 구현한 것입니다.
> 리소스 서버가 AI 서버로 요청을 전달하고, 완료 시 모델을 S3/로컬에 저장한 후 presigned URL을 제공합니다.

#### 1. AI 3D 모델 생성 요청

**프롬프트만 사용:**
```http
POST /api/models/generate
Authorization: Bearer <your_token>
Content-Type: multipart/form-data

prompt: "A futuristic robot warrior"
```

**이미지 + 프롬프트 사용:**
```http
POST /api/models/generate
Authorization: Bearer <your_token>
Content-Type: multipart/form-data

prompt: "Transform this character into sci-fi style"
image: <file> (PNG, JPG, JPEG, WEBP, 최대 10MB)
```

**응답 (성공):**
```json
{
  "success": true,
  "message": "AI generation request submitted successfully",
  "job_id": "550e8400-e29b-41d4-a716-446655440000",
  "data": {
    // AI 서버의 응답 데이터
  }
}
```

#### 2. 작업 상태 조회

```http
GET /api/models/jobs/:job_id
Authorization: Bearer <your_token>
```

**응답:**
```json
{
  "success": true,
  "data": {
    "job_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "completed",
    "prompt": "A futuristic robot warrior",
    "created_at": "2024-01-01T00:00:00.000Z",
    "completed_at": "2024-01-01T00:03:00.000Z",
    "model_id": 123,
    "download_url": "https://...",
    "error_message": null
  }
}
```

**작업 상태:**
- `queued`: 대기 중
- `processing`: AI 서버에서 생성 중
- `completed`: 완료 (S3/로컬 저장 완료, download_url 제공)
- `failed`: 실패

#### 3. 워크플로우

```
1. 클라이언트 → Resource Server: POST /api/models/generate
   Response: { job_id: "abc-123" } (즉시 응답)

2. Resource Server (백그라운드):
   - Redis job 상태를 'processing'으로 업데이트
   - AI Server에 HTTP 요청 전송 (1-3분 대기)
   - AI Server 응답으로 GLB 파일 데이터 수신
   - S3 업로드 또는 로컬 저장
   - DB에 모델 정보 저장
   - Presigned URL 생성
   - Redis job 상태를 'completed'로 업데이트

3. 클라이언트 (폴링):
   - 주기적으로 GET /api/models/jobs/abc-123 호출
   - status가 'completed'가 될 때까지 대기

4. 클라이언트: 완료 확인 시
   Response: { status: "completed", download_url: "https://...", model_id: 123 }

5. 클라이언트: download_url로 모델 다운로드
```

**지원 이미지 포맷:**
- PNG (.png)
- JPEG (.jpg, .jpeg)
- WebP (.webp)
- 최대 파일 크기: 10MB

**환경 설정:**
```env
# AI 서버 설정 (.env 파일)
AI_SERVER_URL=http://localhost:8000
AI_SERVER_TIMEOUT=180000  # 3분 (밀리초)
RESOURCE_SERVER_URL=http://localhost:3001  # AI 콜백용
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

**런타임 & 프레임워크**
- **Node.js** v20.x+ - JavaScript 런타임 환경
- **Express** v5.1.0 - 웹 애플리케이션 프레임워크

**데이터베이스 & 캐시**
- **PostgreSQL** - 관계형 데이터베이스 (login-server와 공유, 리소스 메타데이터 저장)
- **pg** v8.16.3 - PostgreSQL 클라이언트 라이브러리
- **Redis** v4.7.0 - 인메모리 캐시 (콘서트 세션 관리, AI 작업 큐)

**보안 & 인증**
- **jsonwebtoken** v9.0.2 - JWT 토큰 검증 (login-server와 동일한 secret 공유)
- **cors** v2.8.5 - Cross-Origin Resource Sharing 처리

**파일 스토리지**
- **AWS SDK v3**
  - **@aws-sdk/client-s3** v3.705.0 - S3 클라이언트 (파일 업로드/다운로드)
  - **@aws-sdk/s3-request-presigner** v3.705.0 - Presigned URL 생성 (보안 스트리밍)
- **multer** v1.4.5-lts.1 - 멀티파트 파일 업로드 미들웨어
- **multer-s3** v3.0.1 - S3 직접 업로드 스트림 처리

**외부 API 연동**
- **axios** v1.13.2 - HTTP 클라이언트 (AI 서버 API 호출)
- **node-fetch** v3.3.2 - Fetch API 구현
- **form-data** v4.0.5 - Multipart/form-data 생성 (AI 서버 통신)

**환경 설정**
- **dotenv** v17.2.3 - 환경 변수 관리

**개발 도구**
- **nodemon** v3.0.1 - 파일 변경 시 자동 재시작 (개발 환경)

**API 문서화** (루트 프로젝트)
- **swagger-jsdoc** v6.2.8 - JSDoc 주석에서 OpenAPI 스펙 생성
- **swagger-ui-express** v5.0.1 - Swagger UI 제공

**인프라 (프로덕션)**
- **PM2** - Node.js 프로세스 관리자
- **Nginx** - 리버스 프록시
- **AWS EC2** - 서버 호스팅 (Ubuntu)
- **AWS S3** - 클라우드 파일 스토리지 (음원, 3D 모델)

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

## 문서

- **[API_RESPONSES.md](docs/API_RESPONSES.md)** - API 응답 형식 및 전체 오류 코드 목록
- **[API_TEST.md](docs/API_TEST.md)** - 상세한 API 테스트 방법 및 예제
- **[ENV_SETUP.md](docs/ENV_SETUP.md)** - 환경 변수 설정
- **[AWS_S3_SETUP.md](docs/AWS_S3_SETUP.md)** - AWS S3 설정

---

## 라이선스

이 프로젝트는 포트폴리오 목적으로 개발되었습니다.

---

## 문의

프로젝트에 대한 문의사항이 있으시면 이슈를 등록해주세요.
