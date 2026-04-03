# Authentication Setup (PostgreSQL + JWT + OTP)

## 1) Environment variables
Set these variables in `backend/.env`:

- `POSTGRES_URL` or (`POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`)
- `POSTGRES_SSL` (`true`/`false`)
- `JWT_SECRET`
- `JWT_EXPIRES_IN` (example: `7d`)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `OTP_EXPIRY_MINUTES` (default `10`)
- `BCRYPT_ROUNDS` (default `12`)

## 2) Run backend
From workspace root:

```bash
npm --prefix backend run dev
```

On startup, backend initializes auth tables in PostgreSQL:
- `auth_users`
- `auth_password_resets`

## 3) API endpoints
Base URL: `/api/auth`

- `POST /signup`
- `POST /login`
- `POST /forgot-password`
- `POST /verify-otp`
- `POST /reset-password`

## 4) Validation rules
- Email format required
- Mobile regex: `^[6-9]\d{9}$`
- Invalid mobile response: HTTP `400` with `Invalid mobile number`

## 5) Request payloads

### Signup
```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "mobile": "9876543210",
  "password": "secret123"
}
```

### Login
```json
{
  "identifier": "john@example.com",
  "password": "secret123"
}
```
Or
```json
{
  "identifier": "9876543210",
  "password": "secret123"
}
```

### Forgot Password
```json
{
  "email": "john@example.com"
}
```

### Verify OTP
```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

### Reset Password
```json
{
  "email": "john@example.com",
  "otp": "123456",
  "newPassword": "newSecret123"
}
```
