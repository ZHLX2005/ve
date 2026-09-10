// src/hooks/useAuth.ts —— host jwtAuth 跨框架桥。
// 组件不重新实现 JWT 管理;仅 re-export host 的 hook + 类型。

export { useJwtAuth, getJwtAuthSnapshot, jwtAuth } from '@/api/http/auth-store';
export type { JwtAuthStatus } from '@/api/http/auth-store';
