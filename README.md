# StaySync Backend

## 개발 환경 설정

1. 환경 변수 설정:
   ```bash
   # .env.example 파일을 복사하여 .env.development 생성
   cp .env.example .env.development
   
   # 실제 개발용 값으로 환경 변수 수정
   vi .env.development
   ```

2. 환경 변수 파일 설명:
   - `.env.example`: 템플릿 파일 (Git에 포함)
   - `.env.development`: 로컬 개발 환경용 (Git에서 제외)
   - `.env.production`: 프로덕션 환경용 (Git에서 제외)

3. 주의사항:
   - 절대로 실제 API 키나 비밀값을 `.env.example`에 포함하지 마세요
   - `.env.development`와 `.env.production`은 `.gitignore`에 포함되어 있습니다
   - 팀원들과 API 키 공유는 안전한 채널을 통해 진행해주세요

## 개발 시작하기

1. 의존성 설치:
   ```bash
   npm install
   ```

2. 개발 서버 실행:
   ```bash
   npm run dev
   ```

## API 키 관리

1. 개발용 API 키:
   - AWS 키: 개발용 IAM 계정의 키 사용
   - Kakao 키: 개발용 애플리케이션의 키 사용
   - SMS API 키: 테스트용 계정의 키 사용

2. API 키 로테이션:
   - 정기적으로 키를 변경하고 팀원들과 공유
   - 키 유출 시 즉시 키를 폐기하고 새로운 키 발급

## 배포

1. 프로덕션 배포 시:
   - AWS Ubuntu 서버에 직접 배포
   - 프로덕션 환경 변수는 서버에서 직접 관리

2. 배포 전 체크리스트:
   - 환경 변수 파일이 Git에 포함되지 않았는지 확인
   - 프로덕션 서버의 환경 변수가 최신 상태인지 확인
   - 테스트 완료 여부 확인 