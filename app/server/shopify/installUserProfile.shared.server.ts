/** 店铺店主资料（名、姓、邮箱；lastName 对应业务 second_name）。 */
export type ShopOwnerProfile = {
  firstName: string;
  lastName: string;
  email: string;
};

/** 将 Shopify 返回的完整姓名拆为名、姓。 */
export function splitPersonFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const trimmed = fullName.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const spaceIndex = trimmed.indexOf(" ");
  if (spaceIndex <= 0) return { firstName: trimmed, lastName: "" };
  return {
    firstName: trimmed.slice(0, spaceIndex).trim(),
    lastName: trimmed.slice(spaceIndex + 1).trim(),
  };
}
