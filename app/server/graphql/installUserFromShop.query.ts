/**
 * Admin GraphQL：店铺店主信息。
 * 仅 shop.email / shop.shopOwnerName，不查 accountOwner（需 read_users + Plus 审批）。
 */
export const INSTALL_USER_FROM_SHOP_QUERY = `#graphql
  query InstallUserProfileFromShop {
    shop {
      email
      shopOwnerName
    }
  }
`;
