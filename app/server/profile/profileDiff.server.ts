import type {
  ProfileFieldPatch,
  SessionAuthSnapshot,
  SessionFieldsRow,
  TokenFieldPatch,
  UserProfileFields,
} from "./profileTypes.server";

function normalized(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function profileFieldChanged(
  dbValue: string | null | undefined,
  incoming: string,
): boolean {
  return normalized(dbValue) !== incoming.trim();
}

/**
 * 对比 DB 与 GraphQL 资料，仅返回有变化的字段。
 */
export function diffProfileFields(
  db: Pick<
    SessionFieldsRow,
    "firstName" | "lastName" | "email"
  > | null,
  incoming: UserProfileFields,
): ProfileFieldPatch | null {
  const patch: ProfileFieldPatch = {};

  if (profileFieldChanged(db?.firstName, incoming.firstName)) {
    patch.firstName = incoming.firstName.trim() || null;
  }
  if (profileFieldChanged(db?.lastName, incoming.lastName)) {
    patch.lastName = incoming.lastName.trim() || null;
  }
  if (profileFieldChanged(db?.email, incoming.email)) {
    patch.email = incoming.email.trim() || null;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

function tokenChanged(
  dbValue: string | null | undefined,
  incoming: string | undefined,
): boolean {
  const next = incoming?.trim();
  if (!next) return false;
  return normalized(dbValue) !== next;
}

function dateChanged(
  dbValue: Date | null | undefined,
  incoming: Date | null | undefined,
): boolean {
  const dbMs = dbValue?.getTime() ?? null;
  const inMs = incoming?.getTime() ?? null;
  return dbMs !== inMs;
}

/**
 * 对比 DB 与鉴权 session 中的 token 字段，仅返回有变化的列（单行 patch）。
 */
export function diffTokenFields(
  db: SessionFieldsRow | null,
  incoming: SessionAuthSnapshot,
): TokenFieldPatch | null {
  const patch: TokenFieldPatch = {};

  if (tokenChanged(db?.accessToken, incoming.accessToken)) {
    patch.accessToken = incoming.accessToken!.trim();
  }
  if (
    incoming.refreshToken !== undefined &&
    normalized(db?.refreshToken) !== normalized(incoming.refreshToken)
  ) {
    patch.refreshToken = incoming.refreshToken?.trim() || null;
  }
  if (
    incoming.refreshTokenExpires !== undefined &&
    dateChanged(db?.refreshTokenExpires, incoming.refreshTokenExpires)
  ) {
    patch.refreshTokenExpires = incoming.refreshTokenExpires ?? null;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
