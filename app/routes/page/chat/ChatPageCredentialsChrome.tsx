import { useAppBridge } from "@shopify/app-bridge-react";
import {
  asideCardStyle,
  modalCardStyle,
  modalOverlayStyle,
  summaryStyle,
} from "./chatPageStyles";
import { useChatPageCredentials } from "./useChatPageCredentials";

type ShopifyBridge = ReturnType<typeof useAppBridge>;

export function ChatPageCredentialsChrome({ shopify }: { shopify: ShopifyBridge }) {
  const vm = useChatPageCredentials(shopify);

  return (
    <>
      <s-section slot="aside" heading="提交建议">
        <div style={asideCardStyle}>
          <s-stack direction="block" gap="small">
            <s-paragraph>在此输入你想要 assistant 添加的功能。</s-paragraph>
            <s-button type="button" variant="secondary" onClick={() => vm.setIsSuggestionModalOpen(true)}>
              点击提交建议
            </s-button>
          </s-stack>
        </div>
      </s-section>

      <s-section slot="aside">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
            <details>
              <summary style={summaryStyle}>
                <span>广告数据授权</span>
                <span>点击展开</span>
              </summary>
              <div style={{ marginTop: "0.75rem" }}>
                <s-stack direction="block" gap="base">
                  <s-paragraph>
                    授权广告平台后，AI 可结合渠道来源分析投放表现（如 ROAS、转化、渠道贡献）。
                  </s-paragraph>
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    {vm.renderProviderRows(vm.adProviders, "广告")}
                  </s-box>
                </s-stack>
              </div>
            </details>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
            <details>
              <summary style={summaryStyle}>
                <span>物流数据授权</span>
                <span>点击展开</span>
              </summary>
              <div style={{ marginTop: "0.75rem" }}>
                <s-stack direction="block" gap="base">
                  <s-paragraph>
                    授权物流平台后，AI 可结合妥投时效、运输异常、签收率等指标做履约分析。
                  </s-paragraph>
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    {vm.renderProviderRows(vm.logisticsProviders, "物流")}
                  </s-box>
                </s-stack>
              </div>
            </details>
          </s-box>
        </s-stack>
      </s-section>

      {vm.isGoogleAuthModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => vm.setIsGoogleAuthModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>Google Ads 授权信息</strong>
                  <s-badge tone={vm.googleConfigured ? "success" : "critical"}>
                    {vm.googleConfigured ? "已配置" : "未配置"}
                  </s-badge>
                </div>
                {vm.googleClientIdMasked ? (
                  <s-paragraph>当前 Client ID：{vm.googleClientIdMasked}</s-paragraph>
                ) : null}
                {vm.googleClientSecretMasked ? (
                  <s-paragraph>当前 Client Secret：{vm.googleClientSecretMasked}</s-paragraph>
                ) : null}
                {vm.googleDeveloperTokenMasked ? (
                  <s-paragraph>当前 Developer Token：{vm.googleDeveloperTokenMasked}</s-paragraph>
                ) : null}
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        OAuth Client ID：在 Google Cloud Console 的 OAuth 凭据页面获取。
                      </s-list-item>
                      <s-list-item>
                        OAuth Client Secret：与 Client ID 在同一凭据项中获取。
                      </s-list-item>
                      <s-list-item>
                        Developer Token：在 Google Ads 后台的 API Center 申请/查看。
                      </s-list-item>
                      <s-list-item>
                        Customer ID：Google Ads 账户 ID，建议填写纯数字（去掉中划线）。
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                <s-text-field
                  label="OAuth Client ID"
                  value={vm.googleClientId}
                  onChange={(e) => vm.setGoogleClientId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="OAuth Client Secret"
                  value={vm.googleClientSecret}
                  onChange={(e) => vm.setGoogleClientSecret(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Developer Token"
                  value={vm.googleDeveloperToken}
                  onChange={(e) => vm.setGoogleDeveloperToken(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Customer ID"
                  value={vm.googleCustomerId}
                  onChange={(e) => vm.setGoogleCustomerId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => vm.setIsGoogleAuthModalOpen(false)}
                    {...(vm.isSavingGoogleConfig ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSaveGoogleConfig}
                    {...(vm.isSavingGoogleConfig ? { disabled: true } : {})}
                  >
                    {vm.isSavingGoogleConfig ? "保存中..." : "保存授权信息"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}

      {vm.isTiktokAuthModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => vm.setIsTiktokAuthModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>TikTok Ads 授权信息</strong>
                  <s-badge tone={vm.tiktokConfigured ? "success" : "critical"}>
                    {vm.tiktokConfigured ? "已配置" : "未配置"}
                  </s-badge>
                </div>
                {vm.tiktokAppIdMasked ? <s-paragraph>当前 App ID：{vm.tiktokAppIdMasked}</s-paragraph> : null}
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        App ID：在 TikTok for Business 开发者后台创建应用后获取。
                      </s-list-item>
                      <s-list-item>
                        App Secret：与 App ID 同一应用配置页获取。
                      </s-list-item>
                      <s-list-item>
                        Advertiser ID：在 TikTok Ads 广告主账户信息页查看（通常为纯数字字符串）。
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                <s-text-field
                  label="App ID"
                  value={vm.tiktokAppId}
                  onChange={(e) => vm.setTiktokAppId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="App Secret"
                  value={vm.tiktokAppSecret}
                  onChange={(e) => vm.setTiktokAppSecret(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Advertiser ID"
                  value={vm.tiktokAdvertiserId}
                  onChange={(e) => vm.setTiktokAdvertiserId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => vm.setIsTiktokAuthModalOpen(false)}
                    {...(vm.isSavingTiktokConfig ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSaveTiktokConfig}
                    {...(vm.isSavingTiktokConfig ? { disabled: true } : {})}
                  >
                    {vm.isSavingTiktokConfig ? "保存中..." : "保存授权信息"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}

      {vm.isMicrosoftAuthModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => vm.setIsMicrosoftAuthModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>Microsoft Ads 授权信息</strong>
                  <s-badge tone={vm.microsoftConfigured ? "success" : "critical"}>
                    {vm.microsoftConfigured ? "已配置" : "未配置"}
                  </s-badge>
                </div>
                {vm.microsoftClientIdMasked ? (
                  <s-paragraph>当前 Client ID：{vm.microsoftClientIdMasked}</s-paragraph>
                ) : null}
                {vm.microsoftClientSecretMasked ? (
                  <s-paragraph>当前 Client Secret：{vm.microsoftClientSecretMasked}</s-paragraph>
                ) : null}
                {vm.microsoftDeveloperTokenMasked ? (
                  <s-paragraph>当前 Developer Token：{vm.microsoftDeveloperTokenMasked}</s-paragraph>
                ) : null}
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        Client ID：在 Azure Portal 的应用注册（App registrations）中获取。
                      </s-list-item>
                      <s-list-item>
                        Client Secret：在同一应用的 Certificates & secrets 中创建并获取。
                      </s-list-item>
                      <s-list-item>
                        Developer Token：在 Microsoft Advertising 后台/API 管理页获取。
                      </s-list-item>
                      <s-list-item>
                        Customer ID：Microsoft Advertising 账户 ID（常见为数字字符串）。
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                <s-text-field
                  label="Client ID"
                  value={vm.microsoftClientId}
                  onChange={(e) => vm.setMicrosoftClientId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Client Secret"
                  value={vm.microsoftClientSecret}
                  onChange={(e) => vm.setMicrosoftClientSecret(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Developer Token"
                  value={vm.microsoftDeveloperToken}
                  onChange={(e) => vm.setMicrosoftDeveloperToken(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Customer ID"
                  value={vm.microsoftCustomerId}
                  onChange={(e) => vm.setMicrosoftCustomerId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => vm.setIsMicrosoftAuthModalOpen(false)}
                    {...(vm.isSavingMicrosoftConfig ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSaveMicrosoftConfig}
                    {...(vm.isSavingMicrosoftConfig ? { disabled: true } : {})}
                  >
                    {vm.isSavingMicrosoftConfig ? "保存中..." : "保存授权信息"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}

      {vm.isSfAuthModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => vm.setIsSfAuthModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>顺丰速运接口授权</strong>
                  <s-badge tone={vm.sfConfigured ? "success" : "critical"}>
                    {vm.sfConfigured ? "已配置" : "未配置"}
                  </s-badge>
                </div>
                <s-paragraph>
                  顺丰开放平台通常不是 OAuth 跳转授权，而是通过接口凭证接入。请填写顺丰顾客编码和校验码，月结账号可选。
                </s-paragraph>
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        顾客编码（Customer Code）：在顺丰开放平台或电子运单 API 对接资料中获取。
                      </s-list-item>
                      <s-list-item>
                        校验码（Check Word）：由顺丰开放平台提供，通常与顾客编码配套下发。
                      </s-list-item>
                      <s-list-item>
                        月结账号：来自顺丰月结客户资料（无月结可先留空）。
                      </s-list-item>
                      <s-list-item>
                        如果不确定字段值，可联系顺丰商务/技术支持按企业信息协助开通并提供参数。
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                {vm.sfCustomerCodeMasked ? (
                  <s-paragraph>当前顾客编码：{vm.sfCustomerCodeMasked}</s-paragraph>
                ) : null}
                <s-text-field
                  label="顺丰顾客编码（Customer Code）"
                  value={vm.sfCustomerCode}
                  onChange={(e) => vm.setSfCustomerCode(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="顺丰校验码（Check Word）"
                  value={vm.sfCheckWord}
                  onChange={(e) => vm.setSfCheckWord(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="顺丰月结账号（可选）"
                  value={vm.sfMonthlyAccount}
                  onChange={(e) => vm.setSfMonthlyAccount(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => vm.setIsSfAuthModalOpen(false)}
                    {...(vm.isSavingSfConfig ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSaveSfConfig}
                    {...(vm.isSavingSfConfig ? { disabled: true } : {})}
                  >
                    {vm.isSavingSfConfig ? "保存中..." : "保存授权信息"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}

      {vm.isFedexAuthModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => vm.setIsFedexAuthModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong>FedEx 接口授权</strong>
                  <s-badge tone={vm.fedexConfigured ? "success" : "critical"}>
                    {vm.fedexConfigured ? "已配置" : "未配置"}
                  </s-badge>
                </div>
                <s-paragraph>
                  FedEx 为 API 凭证接入模式。请填写 API Key、Secret Key 和 Account Number；Meter Number 按你的账户情况选填。
                </s-paragraph>
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        API Key：在 FedEx Developer Portal 创建项目后生成。
                      </s-list-item>
                      <s-list-item>
                        Secret Key：与 API Key 同一页面生成并配套使用。
                      </s-list-item>
                      <s-list-item>
                        Account Number：来自 FedEx 账号资料页面（通常为数字字符串）。
                      </s-list-item>
                      <s-list-item>
                        Meter Number：可在 FedEx Web Services 历史接入资料中查询（没有可先留空）。
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                {vm.fedexAccountNumberMasked ? (
                  <s-paragraph>当前账号：{vm.fedexAccountNumberMasked}</s-paragraph>
                ) : null}
                <s-text-field
                  label="API Key"
                  value={vm.fedexApiKey}
                  onChange={(e) => vm.setFedexApiKey(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Secret Key"
                  value={vm.fedexSecretKey}
                  onChange={(e) => vm.setFedexSecretKey(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Account Number"
                  value={vm.fedexAccountNumber}
                  onChange={(e) => vm.setFedexAccountNumber(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label="Meter Number（可选）"
                  value={vm.fedexMeterNumber}
                  onChange={(e) => vm.setFedexMeterNumber(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => vm.setIsFedexAuthModalOpen(false)}
                    {...(vm.isSavingFedexConfig ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSaveFedexConfig}
                    {...(vm.isSavingFedexConfig ? { disabled: true } : {})}
                  >
                    {vm.isSavingFedexConfig ? "保存中..." : "保存授权信息"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}

      {vm.isSuggestionModalOpen ? (
        <div style={modalOverlayStyle} onClick={() => vm.setIsSuggestionModalOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} style={modalCardStyle}>
            <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
              <s-stack direction="block" gap="base">
                <strong>提交建议</strong>
                <s-paragraph>请输入你希望 assistant 新增的功能描述。</s-paragraph>
                <s-text-field
                  label="建议描述"
                  value={vm.suggestionText}
                  onChange={(e) => vm.setSuggestionText(e.currentTarget.value)}
                  autocomplete="off"
                />
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                  <s-button
                    type="button"
                    variant="secondary"
                    onClick={() => vm.setIsSuggestionModalOpen(false)}
                    {...(vm.isSubmittingSuggestion ? { disabled: true } : {})}
                  >
                    取消
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSubmitSuggestion}
                    {...(vm.isSubmittingSuggestion || !vm.suggestionText.trim()
                      ? { disabled: true }
                      : {})}
                  >
                    {vm.isSubmittingSuggestion ? "提交中..." : "提交"}
                  </s-button>
                </div>
              </s-stack>
            </s-box>
          </div>
        </div>
      ) : null}
    </>
  );
}
