/** 用户资料三字段（lastName 对应业务 second_name）。 */
export type UserProfileFields = {
  firstName: string;
  lastName: string;
  email: string;
};

export type ProfileFieldPatch = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

export type TokenFieldPatch = {
  accessToken?: string;
  refreshToken?: string | null;
  refreshTokenExpires?: Date | null;
};

/** authenticate.admin 返回的 session 中用于 diff 的字段。 */
export type SessionAuthSnapshot = {
  accessToken?: string;
  refreshToken?: string | null;
  refreshTokenExpires?: Date | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};

export type SessionFieldsRow = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  accessToken: string;
  refreshToken: string | null;
  refreshTokenExpires: Date | null;
};
