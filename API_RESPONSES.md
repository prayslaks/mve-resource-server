# API 응답 및 오류 코드 정리

## 공통 응답 구조

모든 API 응답은 다음과 같은 공통 구조를 따릅니다:

### 성공 응답
```json
{
  "success": true,
  "message": "...",
  // ... 추가 데이터
}
```

### 실패 응답
```json
{
  "success": false,
  "error": "ERROR_CODE",
  "message": "Human readable error message",
  "details": { ... }  // 선택적
}
```

---

## 헬스 체크 (GET /health)

### 성공 응답 (200 OK)
```json
{
  "status": "ok",
  "server": "mve-resource-server",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 공용 음원 API (모든 엔드포인트는 JWT 인증 필요)

### 1. 음원 목록 조회 (GET /api/audio/list)

#### 요청
```
GET /api/audio/list
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 성공 응답 (200 OK)
```json
{
  "success": true,
  "count": 2,
  "audio_files": [
    {
      "id": 1,
      "title": "Sample Audio 1",
      "artist": "Artist Name",
      "file_path": "audio/sample1.mp3",
      "file_size": 5242880,
      "duration": 180,
      "format": "mp3",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### 오류 응답

##### 403 Forbidden
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `NO_AUTH_HEADER` | Authorization 헤더 없음 | `{ "success": false, "error": "NO_AUTH_HEADER", "message": "No authorization header provided" }` |
| `INVALID_AUTH_FORMAT` | Bearer 형식이 아님 | `{ "success": false, "error": "INVALID_AUTH_FORMAT", "message": "Authorization header must start with \"Bearer \"" }` |
| `NO_TOKEN` | 토큰 없음 | `{ "success": false, "error": "NO_TOKEN", "message": "No token provided" }` |

##### 401 Unauthorized
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `TOKEN_EXPIRED` | 토큰 만료 | `{ "success": false, "error": "TOKEN_EXPIRED", "message": "Token has expired", "expiredAt": "2024-01-01T02:00:00.000Z" }` |
| `INVALID_TOKEN` | 잘못된 토큰 | `{ "success": false, "error": "INVALID_TOKEN", "message": "Invalid token" }` |
| `TOKEN_VERIFICATION_FAILED` | 토큰 검증 실패 | `{ "success": false, "error": "TOKEN_VERIFICATION_FAILED", "message": "Token verification failed" }` |

##### 500 Internal Server Error
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `DATABASE_ERROR` | 데이터베이스 오류 | `{ "success": false, "error": "DATABASE_ERROR", "message": "Database error", "code": "..." }` |
| `INTERNAL_SERVER_ERROR` | 기타 서버 오류 | `{ "success": false, "error": "INTERNAL_SERVER_ERROR", "message": "Server error" }` |

---

### 2. 특정 음원 정보 조회 (GET /api/audio/:id)

#### 요청
```
GET /api/audio/1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 성공 응답 (200 OK)
```json
{
  "success": true,
  "audio_file": {
    "id": 1,
    "title": "Sample Audio 1",
    "artist": "Artist Name",
    "file_path": "audio/sample1.mp3",
    "file_size": 5242880,
    "duration": 180,
    "format": "mp3",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 오류 응답

##### 404 Not Found
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `AUDIO_NOT_FOUND` | 음원 없음 | `{ "success": false, "error": "AUDIO_NOT_FOUND", "message": "Audio file not found" }` |

##### 403 Forbidden, 401 Unauthorized, 500 Internal Server Error
위의 "음원 목록 조회" 오류 응답과 동일

---

### 3. 음원 스트리밍 (GET /api/audio/stream/:id)

#### 요청
```
GET /api/audio/stream/1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Range: bytes=0-1023 (선택적, Range Request 지원)
```

#### 성공 응답

##### 200 OK (전체 파일)
- **Headers:**
  - `Content-Type`: `audio/mp3` (또는 파일 형식에 따라)
  - `Content-Length`: 파일 크기
  - `Accept-Ranges`: `bytes`
- **Body:** 오디오 파일 데이터 (바이너리)

##### 206 Partial Content (Range Request)
- **Headers:**
  - `Content-Type`: `audio/mp3`
  - `Content-Range`: `bytes 0-1023/5242880`
  - `Content-Length`: 청크 크기
  - `Accept-Ranges`: `bytes`
- **Body:** 요청된 범위의 오디오 데이터 (바이너리)

#### 오류 응답

##### 404 Not Found
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `AUDIO_NOT_FOUND` | DB에 음원 없음 | `{ "success": false, "error": "AUDIO_NOT_FOUND", "message": "Audio file not found" }` |
| `FILE_NOT_FOUND` | 파일 시스템에 파일 없음 | `{ "success": false, "error": "FILE_NOT_FOUND", "message": "Audio file not found on server" }` |

##### 500 Internal Server Error
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `STREAMING_ERROR` | 스트리밍 오류 | `{ "success": false, "error": "STREAMING_ERROR", "message": "Failed to stream audio file" }` |

##### 403 Forbidden, 401 Unauthorized
위의 "음원 목록 조회" 오류 응답과 동일

---

### 4. 음원 검색 (GET /api/audio/search/:query)

#### 요청
```
GET /api/audio/search/sample
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 성공 응답 (200 OK)
```json
{
  "success": true,
  "count": 1,
  "audio_files": [
    {
      "id": 1,
      "title": "Sample Audio 1",
      "artist": "Artist Name",
      "file_path": "audio/sample1.mp3",
      "file_size": 5242880,
      "duration": 180,
      "format": "mp3",
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### 오류 응답
##### 403 Forbidden, 401 Unauthorized, 500 Internal Server Error
위의 "음원 목록 조회" 오류 응답과 동일

---

## 개인 3D 모델 API (모든 엔드포인트는 JWT 인증 필요)

### 1. 내 모델 목록 조회 (GET /api/models/list)

#### 요청
```
GET /api/models/list
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 성공 응답 (200 OK)
```json
{
  "success": true,
  "count": 2,
  "models": [
    {
      "id": 1,
      "model_name": "Character Model 1",
      "file_path": "models/user123/character1.fbx",
      "file_size": 10485760,
      "thumbnail_path": "thumbnails/user123/character1.png",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

#### 오류 응답
##### 403 Forbidden, 401 Unauthorized, 500 Internal Server Error
위의 "음원 목록 조회" 오류 응답과 동일

---

### 2. 특정 모델 조회 (GET /api/models/:id)

#### 요청
```
GET /api/models/1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 성공 응답 (200 OK)
```json
{
  "success": true,
  "model": {
    "id": 1,
    "model_name": "Character Model 1",
    "file_path": "models/user123/character1.fbx",
    "file_size": 10485760,
    "thumbnail_path": "thumbnails/user123/character1.png",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 오류 응답

##### 404 Not Found
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `MODEL_NOT_FOUND` | 모델 없음 또는 권한 없음 | `{ "success": false, "error": "MODEL_NOT_FOUND", "message": "Model not found or access denied" }` |

##### 403 Forbidden, 401 Unauthorized, 500 Internal Server Error
위의 "음원 목록 조회" 오류 응답과 동일

---

### 3. 모델 등록 (POST /api/models/register)

#### 요청
```json
{
  "model_name": "Character Model 1",
  "file_path": "models/user123/character1.fbx",
  "file_size": 10485760,
  "thumbnail_path": "thumbnails/user123/character1.png"
}
```

#### 성공 응답 (201 Created)
```json
{
  "success": true,
  "message": "Model registered successfully",
  "model": {
    "id": 1,
    "model_name": "Character Model 1",
    "file_path": "models/user123/character1.fbx",
    "file_size": 10485760,
    "thumbnail_path": "thumbnails/user123/character1.png",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

#### 오류 응답

##### 400 Bad Request
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `MISSING_FIELDS` | 필수 필드 누락 | `{ "success": false, "error": "MISSING_FIELDS", "message": "model_name and file_path are required" }` |
| `INVALID_INPUT_TYPE` | 입력값 타입 오류 | `{ "success": false, "error": "INVALID_INPUT_TYPE", "message": "model_name and file_path must be strings" }` |

##### 409 Conflict
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `DUPLICATE_MODEL_NAME` | 중복된 모델명 | `{ "success": false, "error": "DUPLICATE_MODEL_NAME", "message": "Model name already exists for this user" }` |

##### 403 Forbidden, 401 Unauthorized, 500 Internal Server Error
위의 "음원 목록 조회" 오류 응답과 동일

---

### 4. 모델 수정 (PUT /api/models/:id)

#### 요청
```json
{
  "model_name": "Updated Model Name",
  "file_path": "models/user123/character1_v2.fbx",
  "file_size": 11534336,
  "thumbnail_path": "thumbnails/user123/character1_v2.png"
}
```

**참고:** 모든 필드는 선택적입니다. 제공된 필드만 업데이트됩니다.

#### 성공 응답 (200 OK)
```json
{
  "success": true,
  "message": "Model updated successfully",
  "model": {
    "id": 1,
    "model_name": "Updated Model Name",
    "file_path": "models/user123/character1_v2.fbx",
    "file_size": 11534336,
    "thumbnail_path": "thumbnails/user123/character1_v2.png",
    "updated_at": "2024-01-02T00:00:00.000Z"
  }
}
```

#### 오류 응답

##### 400 Bad Request
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `NO_UPDATE_FIELDS` | 업데이트할 필드 없음 | `{ "success": false, "error": "NO_UPDATE_FIELDS", "message": "No fields to update" }` |

##### 404 Not Found
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `MODEL_NOT_FOUND` | 모델 없음 또는 권한 없음 | `{ "success": false, "error": "MODEL_NOT_FOUND", "message": "Model not found or access denied" }` |

##### 409 Conflict
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `DUPLICATE_MODEL_NAME` | 중복된 모델명 | `{ "success": false, "error": "DUPLICATE_MODEL_NAME", "message": "Model name already exists for this user" }` |

##### 403 Forbidden, 401 Unauthorized, 500 Internal Server Error
위의 "음원 목록 조회" 오류 응답과 동일

---

### 5. 모델 삭제 (DELETE /api/models/:id)

#### 요청
```
DELETE /api/models/1
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 성공 응답 (200 OK)
```json
{
  "success": true,
  "message": "Model deleted successfully",
  "deleted_model": {
    "id": 1,
    "model_name": "Character Model 1"
  }
}
```

#### 오류 응답

##### 404 Not Found
| 오류 코드 | 설명 | 응답 예시 |
|---------|------|----------|
| `MODEL_NOT_FOUND` | 모델 없음 또는 권한 없음 | `{ "success": false, "error": "MODEL_NOT_FOUND", "message": "Model not found or access denied" }` |

##### 403 Forbidden, 401 Unauthorized, 500 Internal Server Error
위의 "음원 목록 조회" 오류 응답과 동일

---

## HTTP 상태 코드 요약

| 상태 코드 | 의미 | 사용 케이스 |
|---------|------|------------|
| 200 | OK | 음원/모델 조회, 목록 조회, 검색, 수정, 삭제 성공, 전체 파일 스트리밍 |
| 201 | Created | 모델 등록 성공 |
| 206 | Partial Content | Range Request 스트리밍 |
| 400 | Bad Request | 입력값 검증 실패 |
| 401 | Unauthorized | 토큰 검증 실패 (만료, 잘못된 토큰) |
| 403 | Forbidden | 인증 정보 없음 (토큰 미제공) |
| 404 | Not Found | 리소스 없음 (음원/모델 없음, 파일 없음) |
| 409 | Conflict | 리소스 충돌 (중복 모델명) |
| 500 | Internal Server Error | 서버 내부 오류 |

---

## 에러 처리 전략

### 클라이언트 측 권장 처리

1. **`success` 필드 확인**: 모든 응답에서 `success` 필드를 먼저 확인
2. **`error` 코드별 처리**: 각 에러 코드에 따라 적절한 사용자 메시지 표시
3. **재시도 로직**:
   - `DATABASE_ERROR`: 재시도 가능
   - `TOKEN_EXPIRED`: 재로그인 유도
   - `INVALID_TOKEN`: 로그아웃 후 재로그인
   - `FILE_NOT_FOUND`: 관리자에게 문의 유도
4. **사용자 피드백**: `message` 필드를 사용자에게 표시

### 예시: 에러 코드별 처리
```javascript
switch (error.error) {
  case 'TOKEN_EXPIRED':
    // 토큰 갱신 또는 재로그인 유도
    redirectToLogin();
    break;
  case 'AUDIO_NOT_FOUND':
  case 'MODEL_NOT_FOUND':
    // 리소스 없음 - 목록으로 돌아가기
    showError('요청한 리소스를 찾을 수 없습니다.');
    redirectToList();
    break;
  case 'DUPLICATE_MODEL_NAME':
    // 중복 모델명
    showError('이미 같은 이름의 모델이 존재합니다. 다른 이름을 사용해주세요.');
    break;
  case 'FILE_NOT_FOUND':
    // 파일이 서버에 없음
    showError('파일을 찾을 수 없습니다. 관리자에게 문의하세요.');
    break;
  case 'STREAMING_ERROR':
    // 스트리밍 오류
    showError('음원을 재생할 수 없습니다. 다시 시도해주세요.');
    break;
  default:
    // 일반 에러 메시지
    showError(error.message);
}
```

---

## 인증 관련 공통 처리

모든 API 엔드포인트는 JWT 토큰을 요구합니다. 토큰은 mve-login-server의 `/api/auth/login` 엔드포인트에서 발급받을 수 있습니다.

### 인증 헤더 형식
```
Authorization: Bearer <JWT_TOKEN>
```

### 인증 실패 시 처리 흐름
1. **403 Forbidden**: Authorization 헤더가 없거나 형식이 잘못됨
   - → 로그인 페이지로 리다이렉트
2. **401 Unauthorized**: 토큰이 만료되었거나 잘못됨
   - `TOKEN_EXPIRED`: → 재로그인 유도
   - `INVALID_TOKEN`: → 로그아웃 후 재로그인

### 토큰 갱신 전략 (권장)
- 토큰 만료 시간이 임박하면 자동으로 재로그인 유도
- 백그라운드에서 토큰 갱신 API를 호출하여 사용자 경험 개선 (향후 구현 예정)
