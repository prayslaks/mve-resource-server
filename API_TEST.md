# API 테스트 가이드

이 문서는 MVE Resource Server API를 테스트하는 다양한 방법을 설명합니다.

---

## 목차
- [사전 준비](#사전-준비)
- [PowerShell 테스트](#powershell-테스트)
  - [헬스 체크](#헬스-체크)
  - [음원 API 테스트](#음원-api-테스트)
  - [3D 모델 API 테스트](#3d-모델-api-테스트)
- [curl 테스트](#curl-테스트)
- [전체 시나리오 테스트](#전체-시나리오-테스트)

---

## 사전 준비

### 1. JWT 토큰 발급

MVE Resource Server의 모든 API는 JWT 인증을 요구합니다. 먼저 MVE Login Server에서 토큰을 발급받아야 합니다.

#### PowerShell에서 토큰 발급
```powershell
# MVE Login Server에서 로그인
$loginBody = @{
    username = "testuser"
    password = "password123"
} | ConvertTo-Json

$loginResult = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody

# 토큰 저장
$token = $loginResult.token
Write-Host "Token: $token"

# 헤더 설정
$headers = @{
    "Authorization" = "Bearer $token"
}
```

### 2. 서버 URL 설정

```powershell
$baseUrl = "http://localhost:3001"  # MVE Resource Server 기본 포트
```

---

## PowerShell 테스트

### 헬스 체크

```powershell
# 방법 1: Invoke-RestMethod (권장)
Invoke-RestMethod -Uri "$baseUrl/health"
```

```powershell
# 방법 2: Invoke-WebRequest (상세 정보 필요 시)
$response = Invoke-WebRequest -Uri "$baseUrl/health"
$response.Content | ConvertFrom-Json
$response.StatusCode
```

**예상 응답:**
```json
{
  "status": "ok",
  "server": "mve-resource-server",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 음원 API 테스트

### 1. 음원 목록 조회

```powershell
try {
    $audioList = Invoke-RestMethod -Uri "$baseUrl/api/audio/list" `
        -Method GET `
        -Headers $headers

    if ($audioList.success) {
        Write-Host "음원 목록 조회 성공!" -ForegroundColor Green
        Write-Host "총 음원 수: $($audioList.count)"
        $audioList.audio_files | Format-Table id, title, artist, format, duration
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

### 2. 특정 음원 정보 조회

```powershell
$audioId = 1  # 조회할 음원 ID

try {
    $audio = Invoke-RestMethod -Uri "$baseUrl/api/audio/$audioId" `
        -Method GET `
        -Headers $headers

    if ($audio.success) {
        Write-Host "음원 정보 조회 성공!" -ForegroundColor Green
        $audio.audio_file | Format-List
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

### 3. 음원 스트리밍

#### 전체 파일 다운로드

```powershell
$audioId = 1
$outputPath = "downloaded_audio.mp3"

try {
    Invoke-WebRequest -Uri "$baseUrl/api/audio/stream/$audioId" `
        -Method GET `
        -Headers $headers `
        -OutFile $outputPath

    Write-Host "음원 다운로드 성공: $outputPath" -ForegroundColor Green

    # 파일 크기 확인
    $fileInfo = Get-Item $outputPath
    Write-Host "파일 크기: $($fileInfo.Length) bytes"
} catch {
    Write-Host "다운로드 실패" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)"
        Write-Host "Message: $($errorBody.message)"
    }
}
```

#### Range Request 테스트 (부분 다운로드)

```powershell
$audioId = 1
$rangeHeaders = @{
    "Authorization" = "Bearer $token"
    "Range" = "bytes=0-1023"  # 처음 1KB만 요청
}

try {
    $response = Invoke-WebRequest -Uri "$baseUrl/api/audio/stream/$audioId" `
        -Method GET `
        -Headers $rangeHeaders

    Write-Host "Status Code: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Content-Range: $($response.Headers['Content-Range'])"
    Write-Host "Content-Length: $($response.Headers['Content-Length'])"
    Write-Host "Accept-Ranges: $($response.Headers['Accept-Ranges'])"
} catch {
    Write-Host "Range Request 실패" -ForegroundColor Red
}
```

---

### 4. 음원 검색

```powershell
$searchQuery = "sample"  # 검색할 키워드

try {
    $searchResult = Invoke-RestMethod -Uri "$baseUrl/api/audio/search/$searchQuery" `
        -Method GET `
        -Headers $headers

    if ($searchResult.success) {
        Write-Host "검색 성공! 검색어: $searchQuery" -ForegroundColor Green
        Write-Host "검색 결과: $($searchResult.count)개"
        $searchResult.audio_files | Format-Table id, title, artist, format
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

## 3D 모델 API 테스트

### 1. 내 모델 목록 조회

```powershell
try {
    $modelList = Invoke-RestMethod -Uri "$baseUrl/api/models/list" `
        -Method GET `
        -Headers $headers

    if ($modelList.success) {
        Write-Host "모델 목록 조회 성공!" -ForegroundColor Green
        Write-Host "총 모델 수: $($modelList.count)"
        $modelList.models | Format-Table id, model_name, file_size, created_at
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

### 2. 특정 모델 조회

```powershell
$modelId = 1  # 조회할 모델 ID

try {
    $model = Invoke-RestMethod -Uri "$baseUrl/api/models/$modelId" `
        -Method GET `
        -Headers $headers

    if ($model.success) {
        Write-Host "모델 정보 조회 성공!" -ForegroundColor Green
        $model.model | Format-List
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

### 3. 모델 등록

```powershell
$registerBody = @{
    model_name = "Test Character Model"
    file_path = "models/testuser/character_test.fbx"
    file_size = 10485760
    thumbnail_path = "thumbnails/testuser/character_test.png"
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "$baseUrl/api/models/register" `
        -Method POST `
        -ContentType "application/json" `
        -Headers $headers `
        -Body $registerBody

    if ($result.success) {
        Write-Host "모델 등록 성공!" -ForegroundColor Green
        Write-Host "Model ID: $($result.model.id)"
        Write-Host "Model Name: $($result.model.model_name)"
        $result.model | Format-List
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

### 4. 모델 수정

```powershell
$modelId = 1  # 수정할 모델 ID
$updateBody = @{
    model_name = "Updated Character Model"
    file_size = 11534336
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "$baseUrl/api/models/$modelId" `
        -Method PUT `
        -ContentType "application/json" `
        -Headers $headers `
        -Body $updateBody

    if ($result.success) {
        Write-Host "모델 수정 성공!" -ForegroundColor Green
        $result.model | Format-List
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

### 5. 모델 삭제

```powershell
$modelId = 1  # 삭제할 모델 ID

try {
    $result = Invoke-RestMethod -Uri "$baseUrl/api/models/$modelId" `
        -Method DELETE `
        -Headers $headers

    if ($result.success) {
        Write-Host "모델 삭제 성공!" -ForegroundColor Green
        Write-Host "삭제된 모델: $($result.deleted_model.model_name)"
    }
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode" -ForegroundColor Red

    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "Error: $($errorBody.error)" -ForegroundColor Red
        Write-Host "Message: $($errorBody.message)"
    }
}
```

---

## curl 테스트

### 헬스 체크

```bash
curl http://localhost:3001/health
```

### 음원 목록 조회

```bash
TOKEN="your_jwt_token_here"

curl -X GET http://localhost:3001/api/audio/list \
  -H "Authorization: Bearer $TOKEN"
```

### 특정 음원 정보 조회

```bash
curl -X GET http://localhost:3001/api/audio/1 \
  -H "Authorization: Bearer $TOKEN"
```

### 음원 스트리밍 (다운로드)

```bash
# 전체 파일 다운로드
curl -X GET http://localhost:3001/api/audio/stream/1 \
  -H "Authorization: Bearer $TOKEN" \
  -o downloaded_audio.mp3

# Range Request (부분 다운로드)
curl -X GET http://localhost:3001/api/audio/stream/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Range: bytes=0-1023" \
  -o audio_chunk.mp3
```

### 음원 검색

```bash
curl -X GET http://localhost:3001/api/audio/search/sample \
  -H "Authorization: Bearer $TOKEN"
```

### 모델 목록 조회

```bash
curl -X GET http://localhost:3001/api/models/list \
  -H "Authorization: Bearer $TOKEN"
```

### 특정 모델 조회

```bash
curl -X GET http://localhost:3001/api/models/1 \
  -H "Authorization: Bearer $TOKEN"
```

### 모델 등록

```bash
curl -X POST http://localhost:3001/api/models/register \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "Test Character Model",
    "file_path": "models/testuser/character_test.fbx",
    "file_size": 10485760,
    "thumbnail_path": "thumbnails/testuser/character_test.png"
  }'
```

### 모델 수정

```bash
curl -X PUT http://localhost:3001/api/models/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model_name": "Updated Character Model",
    "file_size": 11534336
  }'
```

### 모델 삭제

```bash
curl -X DELETE http://localhost:3001/api/models/1 \
  -H "Authorization: Bearer $TOKEN"
```

---

## 전체 시나리오 테스트

### PowerShell 통합 테스트 스크립트

```powershell
# ============================================
# MVE Resource Server 통합 테스트
# ============================================

$loginServerUrl = "http://localhost:3000"
$resourceServerUrl = "http://localhost:3001"

Write-Host "=== MVE Resource Server 통합 테스트 ===" -ForegroundColor Cyan

# 1. Login Server에서 JWT 토큰 발급
Write-Host "`n[1] JWT 토큰 발급..." -ForegroundColor Yellow
$loginBody = @{
    username = "testuser"
    password = "password123"
} | ConvertTo-Json

try {
    $loginResult = Invoke-RestMethod -Uri "$loginServerUrl/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body $loginBody

    if ($loginResult.success) {
        Write-Host "✓ 로그인 성공" -ForegroundColor Green
        $token = $loginResult.token
        $headers = @{
            "Authorization" = "Bearer $token"
        }
    }
} catch {
    Write-Host "✗ 로그인 실패 - 테스트 중단" -ForegroundColor Red
    exit
}

# 2. 헬스 체크
Write-Host "`n[2] Resource Server 헬스 체크..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$resourceServerUrl/health"
    Write-Host "✓ Resource Server 정상 작동: $($health.status)" -ForegroundColor Green
} catch {
    Write-Host "✗ Resource Server 연결 실패" -ForegroundColor Red
    exit
}

# 3. 음원 목록 조회
Write-Host "`n[3] 음원 목록 조회..." -ForegroundColor Yellow
try {
    $audioList = Invoke-RestMethod -Uri "$resourceServerUrl/api/audio/list" `
        -Method GET `
        -Headers $headers

    if ($audioList.success) {
        Write-Host "✓ 음원 목록 조회 성공" -ForegroundColor Green
        Write-Host "  총 음원 수: $($audioList.count)"

        if ($audioList.count -gt 0) {
            $firstAudioId = $audioList.audio_files[0].id
            Write-Host "  첫 번째 음원 ID: $firstAudioId"
        }
    }
} catch {
    Write-Host "✗ 음원 목록 조회 실패" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $error = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "  Error: $($error.error)"
    }
}

# 4. 특정 음원 정보 조회
if ($audioList.count -gt 0) {
    Write-Host "`n[4] 특정 음원 정보 조회..." -ForegroundColor Yellow
    try {
        $audio = Invoke-RestMethod -Uri "$resourceServerUrl/api/audio/$firstAudioId" `
            -Method GET `
            -Headers $headers

        if ($audio.success) {
            Write-Host "✓ 음원 정보 조회 성공" -ForegroundColor Green
            Write-Host "  제목: $($audio.audio_file.title)"
            Write-Host "  아티스트: $($audio.audio_file.artist)"
        }
    } catch {
        Write-Host "✗ 음원 정보 조회 실패" -ForegroundColor Red
    }
}

# 5. 음원 검색
Write-Host "`n[5] 음원 검색..." -ForegroundColor Yellow
try {
    $searchResult = Invoke-RestMethod -Uri "$resourceServerUrl/api/audio/search/test" `
        -Method GET `
        -Headers $headers

    if ($searchResult.success) {
        Write-Host "✓ 음원 검색 성공" -ForegroundColor Green
        Write-Host "  검색 결과: $($searchResult.count)개"
    }
} catch {
    Write-Host "✗ 음원 검색 실패" -ForegroundColor Red
}

# 6. 모델 목록 조회
Write-Host "`n[6] 모델 목록 조회..." -ForegroundColor Yellow
try {
    $modelList = Invoke-RestMethod -Uri "$resourceServerUrl/api/models/list" `
        -Method GET `
        -Headers $headers

    if ($modelList.success) {
        Write-Host "✓ 모델 목록 조회 성공" -ForegroundColor Green
        Write-Host "  총 모델 수: $($modelList.count)"
    }
} catch {
    Write-Host "✗ 모델 목록 조회 실패" -ForegroundColor Red
}

# 7. 모델 등록
Write-Host "`n[7] 모델 등록..." -ForegroundColor Yellow
$registerBody = @{
    model_name = "Test_Model_$(Get-Random -Minimum 1000 -Maximum 9999)"
    file_path = "models/test/character_test.fbx"
    file_size = 10485760
    thumbnail_path = "thumbnails/test/character_test.png"
} | ConvertTo-Json

try {
    $registerResult = Invoke-RestMethod -Uri "$resourceServerUrl/api/models/register" `
        -Method POST `
        -ContentType "application/json" `
        -Headers $headers `
        -Body $registerBody

    if ($registerResult.success) {
        Write-Host "✓ 모델 등록 성공" -ForegroundColor Green
        Write-Host "  Model ID: $($registerResult.model.id)"
        Write-Host "  Model Name: $($registerResult.model.model_name)"
        $testModelId = $registerResult.model.id
    }
} catch {
    Write-Host "✗ 모델 등록 실패" -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        $error = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "  Error: $($error.error)"
    }
}

# 8. 모델 수정
if ($testModelId) {
    Write-Host "`n[8] 모델 수정..." -ForegroundColor Yellow
    $updateBody = @{
        model_name = "Updated_Test_Model"
    } | ConvertTo-Json

    try {
        $updateResult = Invoke-RestMethod -Uri "$resourceServerUrl/api/models/$testModelId" `
            -Method PUT `
            -ContentType "application/json" `
            -Headers $headers `
            -Body $updateBody

        if ($updateResult.success) {
            Write-Host "✓ 모델 수정 성공" -ForegroundColor Green
            Write-Host "  Updated Name: $($updateResult.model.model_name)"
        }
    } catch {
        Write-Host "✗ 모델 수정 실패" -ForegroundColor Red
    }
}

# 9. 모델 삭제
if ($testModelId) {
    Write-Host "`n[9] 모델 삭제..." -ForegroundColor Yellow
    try {
        $deleteResult = Invoke-RestMethod -Uri "$resourceServerUrl/api/models/$testModelId" `
            -Method DELETE `
            -Headers $headers

        if ($deleteResult.success) {
            Write-Host "✓ 모델 삭제 성공" -ForegroundColor Green
            Write-Host "  Deleted Model: $($deleteResult.deleted_model.model_name)"
        }
    } catch {
        Write-Host "✗ 모델 삭제 실패" -ForegroundColor Red
    }
}

# 10. 잘못된 토큰 테스트
Write-Host "`n[10] 잘못된 토큰 테스트..." -ForegroundColor Yellow
$invalidHeaders = @{
    "Authorization" = "Bearer invalid_token_here"
}

try {
    $invalidResult = Invoke-RestMethod -Uri "$resourceServerUrl/api/audio/list" `
        -Method GET `
        -Headers $invalidHeaders
} catch {
    if ($_.ErrorDetails.Message) {
        $error = $_.ErrorDetails.Message | ConvertFrom-Json
        if ($error.error -eq "INVALID_TOKEN") {
            Write-Host "✓ 잘못된 토큰 거부 성공" -ForegroundColor Green
        }
    }
}

Write-Host "`n=== 테스트 완료 ===" -ForegroundColor Cyan
```

---

## 에러 시나리오 테스트

### 1. 토큰 없이 요청

```powershell
try {
    Invoke-RestMethod -Uri "$baseUrl/api/audio/list" -Method GET
} catch {
    $error = $_.ErrorDetails.Message | ConvertFrom-Json
    # 예상: error = "NO_AUTH_HEADER"
    Write-Host "Error Code: $($error.error)"
}
```

### 2. 만료된 토큰 테스트

```powershell
$expiredHeaders = @{
    "Authorization" = "Bearer expired_token_here"
}

try {
    Invoke-RestMethod -Uri "$baseUrl/api/audio/list" `
        -Method GET `
        -Headers $expiredHeaders
} catch {
    $error = $_.ErrorDetails.Message | ConvertFrom-Json
    # 예상: error = "TOKEN_EXPIRED" 또는 "INVALID_TOKEN"
    Write-Host "Error Code: $($error.error)"
}
```

### 3. 존재하지 않는 리소스 조회

```powershell
$nonExistentId = 99999

try {
    Invoke-RestMethod -Uri "$baseUrl/api/audio/$nonExistentId" `
        -Method GET `
        -Headers $headers
} catch {
    $error = $_.ErrorDetails.Message | ConvertFrom-Json
    # 예상: error = "AUDIO_NOT_FOUND"
    Write-Host "Error Code: $($error.error)"
}
```

### 4. 필수 필드 누락 테스트 (모델 등록)

```powershell
$invalidBody = @{
    file_path = "models/test.fbx"
    # model_name 누락
} | ConvertTo-Json

try {
    Invoke-RestMethod -Uri "$baseUrl/api/models/register" `
        -Method POST `
        -ContentType "application/json" `
        -Headers $headers `
        -Body $invalidBody
} catch {
    $error = $_.ErrorDetails.Message | ConvertFrom-Json
    # 예상: error = "MISSING_FIELDS"
    Write-Host "Error Code: $($error.error)"
}
```

### 5. 다른 사용자의 모델 접근 시도

```powershell
# 다른 사용자로 로그인
$otherUserLoginBody = @{
    username = "otheruser"
    password = "password123"
} | ConvertTo-Json

$otherUserLogin = Invoke-RestMethod -Uri "$loginServerUrl/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $otherUserLoginBody

$otherUserHeaders = @{
    "Authorization" = "Bearer $($otherUserLogin.token)"
}

# 첫 번째 사용자의 모델 ID로 접근 시도
try {
    Invoke-RestMethod -Uri "$baseUrl/api/models/1" `
        -Method GET `
        -Headers $otherUserHeaders
} catch {
    $error = $_.ErrorDetails.Message | ConvertFrom-Json
    # 예상: error = "MODEL_NOT_FOUND" (권한 없음)
    Write-Host "Error Code: $($error.error)"
}
```

---

## 디버깅 팁

### 상세한 에러 정보 출력

```powershell
try {
    # API 요청
} catch {
    Write-Host "=== 전체 에러 정보 ===" -ForegroundColor Red

    # HTTP 상태 코드
    $statusCode = $_.Exception.Response.StatusCode.value__
    Write-Host "Status Code: $statusCode"

    # 에러 메시지
    Write-Host "Exception Message: $($_.Exception.Message)"

    # 응답 본문
    if ($_.ErrorDetails.Message) {
        $errorBody = $_.ErrorDetails.Message | ConvertFrom-Json
        Write-Host "`nResponse Body:"
        $errorBody | ConvertTo-Json -Depth 10
    }

    # 스택 트레이스
    Write-Host "`nStack Trace:"
    $_.ScriptStackTrace
}
```

### 요청/응답 로깅

```powershell
# 요청 본문 출력
Write-Host "Request Body:" -ForegroundColor Cyan
$body | ConvertFrom-Json | ConvertTo-Json -Depth 10

# 요청 헤더 출력
Write-Host "`nRequest Headers:" -ForegroundColor Cyan
$headers | Format-Table

# 응답 출력
Write-Host "`nResponse:" -ForegroundColor Cyan
$result | ConvertTo-Json -Depth 10
```

---

## 참고 문서

- [API_RESPONSES.md](./API_RESPONSES.md) - 전체 API 응답 형식 및 오류 코드
- [README.md](./README.md) - 프로젝트 설치 및 실행 가이드
- [MVE Login Server API_TEST.md](../mve-login-server/API_TEST.md) - Login Server 테스트 가이드
