import { useAppBridge } from "@shopify/app-bridge-react";
import { useTranslation } from "react-i18next";
import {
  asideCardStyle,
  modalCardStyle,
  modalOverlayStyle,
  summaryStyle,
} from "./chatPageStyles";
import { useChatPageCredentials } from "./useChatPageCredentials";

type ShopifyBridge = ReturnType<typeof useAppBridge>;

export function ChatPageCredentialsChrome({ shopify }: { shopify: ShopifyBridge }) {
  const { t } = useTranslation();
  const vm = useChatPageCredentials(shopify);

  return (
    <>
      <s-section slot="aside" heading={t("credentials.suggestionTitle")}>
        <div style={asideCardStyle}>
          <s-stack direction="block" gap="small">
            <s-paragraph>{t("credentials.suggestionIntro")}</s-paragraph>
            <s-button type="button" variant="secondary" onClick={() => vm.setIsSuggestionModalOpen(true)}>
              {t("credentials.suggestionOpen")}
            </s-button>
          </s-stack>
        </div>
      </s-section>

      <s-section slot="aside">
        <s-stack direction="block" gap="base">
          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
            <details>
              <summary style={summaryStyle}>
                <span>{t("credentials.adsAuthTitle")}</span>
                <span>{t("credentials.expand")}</span>
              </summary>
              <div style={{ marginTop: "0.75rem" }}>
                <s-stack direction="block" gap="base">
                  <s-paragraph>
                    {t("credentials.adsAuthDesc")}
                  </s-paragraph>
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    {vm.renderProviderRows(vm.adProviders, "ads")}
                  </s-box>
                </s-stack>
              </div>
            </details>
          </s-box>

          <s-box padding="base" borderWidth="base" borderRadius="base" background="base">
            <details>
              <summary style={summaryStyle}>
                <span>{t("credentials.logisticsAuthTitle")}</span>
                <span>{t("credentials.expand")}</span>
              </summary>
              <div style={{ marginTop: "0.75rem" }}>
                <s-stack direction="block" gap="base">
                  <s-paragraph>
                    {t("credentials.logisticsAuthDesc")}
                  </s-paragraph>
                  <s-box padding="base" borderWidth="base" borderRadius="base" background="subdued">
                    {vm.renderProviderRows(vm.logisticsProviders, "logistics")}
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
                  <strong>{t("credentials.modalGoogleTitle")}</strong>
                  <s-badge tone={vm.googleConfigured ? "success" : "critical"}>
                    {vm.googleConfigured ? t("credentials.configured") : t("credentials.notConfigured")}
                  </s-badge>
                </div>
                {vm.googleClientIdMasked ? (
                  <s-paragraph>{t("credentials.currentClientId", { value: vm.googleClientIdMasked })}</s-paragraph>
                ) : null}
                {vm.googleClientSecretMasked ? (
                  <s-paragraph>{t("credentials.currentClientSecret", { value: vm.googleClientSecretMasked })}</s-paragraph>
                ) : null}
                {vm.googleDeveloperTokenMasked ? (
                  <s-paragraph>{t("credentials.currentDeveloperToken", { value: vm.googleDeveloperTokenMasked })}</s-paragraph>
                ) : null}
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        {t("credentials.googleTipClientId")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.googleTipClientSecret")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.googleTipDeveloperToken")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.googleTipCustomerId")}
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                <s-text-field
                  label={t("credentials.googleFieldClientId")}
                  value={vm.googleClientId}
                  onChange={(e) => vm.setGoogleClientId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.googleFieldClientSecret")}
                  value={vm.googleClientSecret}
                  onChange={(e) => vm.setGoogleClientSecret(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.googleFieldDeveloperToken")}
                  value={vm.googleDeveloperToken}
                  onChange={(e) => vm.setGoogleDeveloperToken(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.googleFieldCustomerId")}
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
                    {t("common.cancel")}
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSaveGoogleConfig}
                    {...(vm.isSavingGoogleConfig ? { disabled: true } : {})}
                  >
                    {vm.isSavingGoogleConfig ? t("credentials.saving") : t("credentials.saveAuth")}
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
                  <strong>{t("credentials.modalTiktokTitle")}</strong>
                  <s-badge tone={vm.tiktokConfigured ? "success" : "critical"}>
                    {vm.tiktokConfigured ? t("credentials.configured") : t("credentials.notConfigured")}
                  </s-badge>
                </div>
                {vm.tiktokAppIdMasked ? <s-paragraph>{t("credentials.currentAppId", { value: vm.tiktokAppIdMasked })}</s-paragraph> : null}
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        {t("credentials.tiktokTipAppId")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.tiktokTipAppSecret")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.tiktokTipAdvertiserId")}
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                <s-text-field
                  label={t("credentials.tiktokFieldAppId")}
                  value={vm.tiktokAppId}
                  onChange={(e) => vm.setTiktokAppId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.tiktokFieldAppSecret")}
                  value={vm.tiktokAppSecret}
                  onChange={(e) => vm.setTiktokAppSecret(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.tiktokFieldAdvertiserId")}
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
                    {t("common.cancel")}
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSaveTiktokConfig}
                    {...(vm.isSavingTiktokConfig ? { disabled: true } : {})}
                  >
                    {vm.isSavingTiktokConfig ? t("credentials.saving") : t("credentials.saveAuth")}
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
                  <strong>{t("credentials.modalMicrosoftTitle")}</strong>
                  <s-badge tone={vm.microsoftConfigured ? "success" : "critical"}>
                    {vm.microsoftConfigured ? t("credentials.configured") : t("credentials.notConfigured")}
                  </s-badge>
                </div>
                {vm.microsoftClientIdMasked ? (
                  <s-paragraph>{t("credentials.currentClientId", { value: vm.microsoftClientIdMasked })}</s-paragraph>
                ) : null}
                {vm.microsoftClientSecretMasked ? (
                  <s-paragraph>{t("credentials.currentClientSecret", { value: vm.microsoftClientSecretMasked })}</s-paragraph>
                ) : null}
                {vm.microsoftDeveloperTokenMasked ? (
                  <s-paragraph>{t("credentials.currentDeveloperToken", { value: vm.microsoftDeveloperTokenMasked })}</s-paragraph>
                ) : null}
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        {t("credentials.microsoftTipClientId")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.microsoftTipClientSecret")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.microsoftTipDeveloperToken")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.microsoftTipCustomerId")}
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                <s-text-field
                  label={t("credentials.microsoftFieldClientId")}
                  value={vm.microsoftClientId}
                  onChange={(e) => vm.setMicrosoftClientId(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.microsoftFieldClientSecret")}
                  value={vm.microsoftClientSecret}
                  onChange={(e) => vm.setMicrosoftClientSecret(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.microsoftFieldDeveloperToken")}
                  value={vm.microsoftDeveloperToken}
                  onChange={(e) => vm.setMicrosoftDeveloperToken(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.microsoftFieldCustomerId")}
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
                    {t("common.cancel")}
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSaveMicrosoftConfig}
                    {...(vm.isSavingMicrosoftConfig ? { disabled: true } : {})}
                  >
                    {vm.isSavingMicrosoftConfig ? t("credentials.saving") : t("credentials.saveAuth")}
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
                  <strong>{t("credentials.modalSfTitle")}</strong>
                  <s-badge tone={vm.sfConfigured ? "success" : "critical"}>
                    {vm.sfConfigured ? t("credentials.configured") : t("credentials.notConfigured")}
                  </s-badge>
                </div>
                <s-paragraph>
                  {t("credentials.sfHint")}
                </s-paragraph>
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        {t("credentials.sfTipCustomerCode")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.sfTipCheckWord")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.sfTipMonthly")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.sfTipSupport")}
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                {vm.sfCustomerCodeMasked ? (
                  <s-paragraph>{t("credentials.currentCustomerCode", { value: vm.sfCustomerCodeMasked })}</s-paragraph>
                ) : null}
                <s-text-field
                  label={t("credentials.sfFieldCustomerCode")}
                  value={vm.sfCustomerCode}
                  onChange={(e) => vm.setSfCustomerCode(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.sfFieldCheckWord")}
                  value={vm.sfCheckWord}
                  onChange={(e) => vm.setSfCheckWord(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.sfFieldMonthlyAccount")}
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
                    {t("common.cancel")}
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSaveSfConfig}
                    {...(vm.isSavingSfConfig ? { disabled: true } : {})}
                  >
                    {vm.isSavingSfConfig ? t("credentials.saving") : t("credentials.saveAuth")}
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
                  <strong>{t("credentials.modalFedexTitle")}</strong>
                  <s-badge tone={vm.fedexConfigured ? "success" : "critical"}>
                    {vm.fedexConfigured ? t("credentials.configured") : t("credentials.notConfigured")}
                  </s-badge>
                </div>
                <s-paragraph>
                  {t("credentials.fedexHint")}
                </s-paragraph>
                <s-box padding="small" borderWidth="base" borderRadius="base" background="subdued">
                  <s-stack direction="block" gap="small">
                    <s-unordered-list>
                      <s-list-item>
                        {t("credentials.fedexTipApiKey")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.fedexTipSecret")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.fedexTipAccount")}
                      </s-list-item>
                      <s-list-item>
                        {t("credentials.fedexTipMeter")}
                      </s-list-item>
                    </s-unordered-list>
                  </s-stack>
                </s-box>
                {vm.fedexAccountNumberMasked ? (
                  <s-paragraph>{t("credentials.currentAccount", { value: vm.fedexAccountNumberMasked })}</s-paragraph>
                ) : null}
                <s-text-field
                  label={t("credentials.fedexFieldApiKey")}
                  value={vm.fedexApiKey}
                  onChange={(e) => vm.setFedexApiKey(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.fedexFieldSecretKey")}
                  value={vm.fedexSecretKey}
                  onChange={(e) => vm.setFedexSecretKey(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.fedexFieldAccountNumber")}
                  value={vm.fedexAccountNumber}
                  onChange={(e) => vm.setFedexAccountNumber(e.currentTarget.value)}
                  autocomplete="off"
                />
                <s-text-field
                  label={t("credentials.fedexFieldMeterNumber")}
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
                    {t("common.cancel")}
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSaveFedexConfig}
                    {...(vm.isSavingFedexConfig ? { disabled: true } : {})}
                  >
                    {vm.isSavingFedexConfig ? t("credentials.saving") : t("credentials.saveAuth")}
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
                <strong>{t("credentials.suggestionTitle")}</strong>
                <s-paragraph>{t("credentials.suggestionModalHint")}</s-paragraph>
                <s-text-field
                  label={t("credentials.suggestionLabel")}
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
                    {t("common.cancel")}
                  </s-button>
                  <s-button
                    type="button"
                    variant="primary"
                    onClick={vm.handleSubmitSuggestion}
                    {...(vm.isSubmittingSuggestion || !vm.suggestionText.trim()
                      ? { disabled: true }
                      : {})}
                  >
                    {vm.isSubmittingSuggestion ? t("credentials.suggestionSubmitting") : t("credentials.suggestionSubmit")}
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
