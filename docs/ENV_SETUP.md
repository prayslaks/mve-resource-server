# 환경 변수 (.env) 설정 가이드

이 문서는 `mve-login-server`와 `mve-resource-server`의 `.env` 파일을 설정하는 방법을 안내합니다.

---

## 중요 사항

⚠️ **두 서버는 반드시 동일한 `JWT_SECRET`과 DB 설정을 공유해야 합니다!**

- `JWT_SECRET`: login-server에서 발급한 JWT 토큰을 resource-server에서 검증하기 위해 동일해야 함
- DB 설정: 두 서버가 동일한 PostgreSQL 데이터베이스를 사용

---

## 설정 방법

### 1단계: JWT_SECRET 생성

먼저 강력한 JWT Secret 키를 생성합니다:

**Node.js 사용:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**OpenSSL 사용 (Linux/Mac/Git Bash):**
```bash
openssl rand -hex 32
```

**PowerShell 사용 (Windows):**
```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[System.BitConverter]::ToString($bytes).Replace("-", "").ToLower()
```

생성된 키를 복사해 두세요. 예: `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2`

---

### 2단계: login-server .env 파일 생성

`mve-login-server/.env` 파일을 생성하고 다음 내용을 입력합니다:

```env
# Server Configuration
PORT=3000

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgresql_password_here  # PostgreSQL 비밀번호로 변경
DB_NAME=logindb

# JWT Secret (1단계에서 생성한 키로 변경)
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2

# Email Configuration (Naver 메일 사용 예시)
EMAIL_USER=your_email@naver.com    # 발신 이메일 주소로 변경
EMAIL_PASSWORD=your_password       # Naver 계정 비밀번호로 변경
```

---

### 3단계: resource-server .env 파일 생성

`mve-resource-server/.env` 파일을 생성하고 **login-server와 동일한 값**을 입력합니다:

```env
# Server Configuration
PORT=3001

# Database Configuration (login-server와 동일)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_postgresql_password_here  # login-server와 동일한 값
DB_NAME=logindb                            # login-server와 동일한 값

# JWT Secret (login-server와 반드시 동일해야 함!!!)
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2
```

---

## .env 파일 비교 체크리스트

✅ 반드시 동일해야 하는 값:
- `JWT_SECRET` ← **가장 중요!**
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`

❌ 달라야 하는 값:
- `PORT` (login-server: 3000, resource-server: 3001)

⚪ login-server에만 필요한 값:
- `EMAIL_USER`
- `EMAIL_PASSWORD`

---

## 빠른 복사 방법 (Windows PowerShell)

login-server의 `.env`를 기반으로 resource-server의 `.env`를 만드는 간단한 방법:

```powershell
# 1. login-server의 .env 내용 읽기
$loginEnv = Get-Content "C:\Users\user\Documents\mve-login-server\.env"

# 2. resource-server용 .env 생성 (PORT만 변경, EMAIL 제거)
$resourceEnv = $loginEnv | ForEach-Object {
    if ($_ -match "^PORT=") {
        "PORT=3001"
    } elseif ($_ -notmatch "^EMAIL_") {
        $_
    }
}

# 3. resource-server에 저장
$resourceEnv | Out-File -FilePath "C:\Users\user\Documents\mve-resource-server\.env" -Encoding utf8
```

---

## 검증 방법

두 서버의 `.env` 파일이 올바르게 설정되었는지 확인:

### 1. JWT_SECRET 일치 확인

**PowerShell:**
```powershell
$loginSecret = Select-String -Path "C:\Users\user\Documents\mve-login-server\.env" -Pattern "JWT_SECRET="
$resourceSecret = Select-String -Path "C:\Users\user\Documents\mve-resource-server\.env" -Pattern "JWT_SECRET="

if ($loginSecret -eq $resourceSecret) {
    Write-Host "✅ JWT_SECRET이 동일합니다" -ForegroundColor Green
} else {
    Write-Host "❌ JWT_SECRET이 다릅니다! 수정이 필요합니다" -ForegroundColor Red
}
```

**Bash (Linux/Mac/Git Bash):**
```bash
LOGIN_SECRET=$(grep "JWT_SECRET=" ~/Documents/mve-login-server/.env)
RESOURCE_SECRET=$(grep "JWT_SECRET=" ~/Documents/mve-resource-server/.env)

if [ "$LOGIN_SECRET" = "$RESOURCE_SECRET" ]; then
    echo "✅ JWT_SECRET이 동일합니다"
else
    echo "❌ JWT_SECRET이 다릅니다! 수정이 필요합니다"
fi
```

### 2. 실제 동작 테스트

```powershell
# 1. 두 서버 모두 실행
# 터미널 1: cd mve-login-server && node server.js
# 터미널 2: cd mve-resource-server && node server.js

# 2. login-server에서 로그인하여 토큰 받기
$loginBody = @{
    username = "testuser"
    password = "password123"
} | ConvertTo-Json

$loginResult = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody

# 3. resource-server에서 토큰으로 접근 시도
$headers = @{ "Authorization" = "Bearer $($loginResult.token)" }

$profile = Invoke-RestMethod -Uri "http://localhost:3001/api/game/profile" `
    -Method GET `
    -Headers $headers

# 성공하면 JWT_SECRET이 올바르게 공유된 것입니다!
if ($profile.success) {
    Write-Host "✅ 토큰 검증 성공! 설정이 올바릅니다" -ForegroundColor Green
} else {
    Write-Host "❌ 토큰 검증 실패! JWT_SECRET을 확인하세요" -ForegroundColor Red
}
```

---

## 보안 주의사항

1. **`.env` 파일을 절대 Git에 커밋하지 마세요**
   - 두 프로젝트 모두 `.gitignore`에 `.env`가 포함되어 있습니다

2. **JWT_SECRET은 프로덕션에서 반드시 변경하세요**
   - 개발/스테이징/프로덕션 환경별로 다른 키 사용
   - 정기적으로 교체 (6개월마다 권장)

3. **`.env` 파일 권한 설정 (Linux/Mac)**
   ```bash
   chmod 600 .env  # 소유자만 읽기/쓰기 가능
   ```

4. **프로덕션 환경에서는 환경변수 관리 도구 사용**
   - AWS Systems Manager Parameter Store
   - AWS Secrets Manager
   - HashiCorp Vault
   - Docker Secrets

---

## 프로덕션 배포 시

EC2에서 두 서버를 실행할 때:

```bash
# 1. login-server 설정
cd ~/mve-login-server
nano .env  # JWT_SECRET과 DB 정보 입력

# 2. resource-server 설정 (동일한 JWT_SECRET 사용!)
cd ~/mve-resource-server
nano .env  # login-server와 동일한 JWT_SECRET과 DB 정보 입력

# 3. PM2로 실행
pm2 start ~/mve-login-server/server.js --name login-server
pm2 start ~/mve-resource-server/server.js --name resource-server

# 4. 자동 시작 설정
pm2 startup
pm2 save
```

---

## 문제 해결

### 토큰 검증 실패 (401 INVALID_TOKEN)

**원인**: login-server와 resource-server의 `JWT_SECRET`이 다름

**해결**:
1. 두 `.env` 파일의 `JWT_SECRET` 값을 비교
2. 동일하게 수정
3. 두 서버 모두 재시작

### DB 연결 실패

**원인**: DB 설정이 올바르지 않음

**해결**:
1. PostgreSQL이 실행 중인지 확인: `sudo systemctl status postgresql`
2. DB 존재 여부 확인: `psql -U postgres -l`
3. `.env`의 DB 정보가 올바른지 확인
4. 서버 재시작

---

## 참고

- login-server와 resource-server는 독립적인 Git 레포지토리로 관리됩니다
- `.env` 파일은 각 서버에서 수동으로 관리해야 합니다
- 변경사항이 있을 때 두 서버의 `.env`를 모두 업데이트해야 합니다
