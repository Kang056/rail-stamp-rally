'use client';

import { useTranslation } from '@/lib/i18n';
import { useTheme } from '@/lib/theme/ThemeContext';
import type { ThemeColor } from '@/lib/theme/ThemeContext';
import type { LocaleCode } from '@/lib/i18n';
import { SYSTEM_LABELS } from '@/lib/railwayConstants';
import styles from './AccountSettings.module.css';

const THEME_COLOR_HEX: Record<ThemeColor, string> = {
  default: '#20b8d4',
  blue: '#3b82f6',
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
};

const THEME_COLOR_KEYS: ThemeColor[] = ['default', 'blue', 'green', 'orange', 'red'];

const LOCALE_OPTIONS: LocaleCode[] = ['zh-TW', 'en'];

interface MapDisplaySettings {
  showStations: boolean;
  onToggleStations: () => void;
  visibleSystems: Set<string>;
  onToggleSystem: (system: string) => void;
}

export default function AccountSettings({ onBack, mapDisplay }: { onBack?: () => void; mapDisplay?: MapDisplaySettings }) {
  const { t, locale, setLocale } = useTranslation();
  const { colorMode, themeColor, setColorMode, setThemeColor } = useTheme();

  const colorLabel = (c: ThemeColor): string => {
    const map: Record<ThemeColor, string> = {
      default: t.account.settings.colorDefault,
      blue: t.account.settings.colorBlue,
      green: t.account.settings.colorGreen,
      orange: t.account.settings.colorOrange,
      red: t.account.settings.colorRed,
    };
    return map[c];
  };

  return (
    <div className={styles.settings}>
      {onBack && (
        <button className={styles.backBtn} onClick={onBack} type="button">
          ← {t.common.back}
        </button>
      )}
      <p className={styles.settingsTitle}>{t.account.settings.title}</p>

      <div className={styles.settingSection}>
        {/* Appearance: light / dark */}
        <div className={styles.settingRow}>
          <span className={styles.settingLabel}>{t.account.settings.theme}</span>
          <div className={styles.segmentedControl}>
            <button
              className={`${styles.segmentBtn} ${colorMode === 'light' ? styles.segmentBtnActive : ''}`}
              onClick={() => setColorMode('light')}
              type="button"
            >
              ☀️ {t.account.settings.themeLight}
            </button>
            <button
              className={`${styles.segmentBtn} ${colorMode === 'dark' ? styles.segmentBtnActive : ''}`}
              onClick={() => setColorMode('dark')}
              type="button"
            >
              🌙 {t.account.settings.themeDark}
            </button>
          </div>
        </div>

        {/* Theme color */}
        <div className={styles.settingRow}>
          <span className={styles.settingLabel}>{t.account.settings.themeColor}</span>
          <div className={styles.colorPicker}>
            {THEME_COLOR_KEYS.map((c) => (
              <button
                key={c}
                className={`${styles.colorSwatch} ${themeColor === c ? styles.colorSwatchActive : ''}`}
                style={{ background: THEME_COLOR_HEX[c] }}
                onClick={() => setThemeColor(c)}
                type="button"
                title={colorLabel(c)}
                aria-label={colorLabel(c)}
                aria-pressed={themeColor === c}
              />
            ))}
          </div>
        </div>

        {/* Language */}
        <div className={styles.settingRow}>
          <span className={styles.settingLabel}>{t.account.settings.language}</span>
          <div className={styles.segmentedControl}>
            {LOCALE_OPTIONS.map((code) => (
              <button
                key={code}
                className={`${styles.segmentBtn} ${locale === code ? styles.segmentBtnActive : ''}`}
                onClick={() => setLocale(code)}
                type="button"
              >
                {t.languages[code]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Map display settings */}
      {mapDisplay && (
        <div className={styles.settingSection}>
          <p className={styles.settingSectionTitle}>{t.account.settings.mapDisplaySettings}</p>

          {/* Station display toggle */}
          <div className={styles.settingRow}>
            <div className={styles.settingToggleRow}>
              <span className={styles.settingLabel}>{t.account.settings.stationDisplay}</span>
              <button
                className={`${styles.toggleSwitch} ${mapDisplay.showStations ? styles.toggleOn : styles.toggleOff}`}
                onClick={mapDisplay.onToggleStations}
                aria-label={mapDisplay.showStations ? t.progress.hideStation : t.progress.showStation}
                aria-pressed={mapDisplay.showStations}
                type="button"
              >
                <span className={styles.toggleKnob} />
              </button>
            </div>
          </div>

          {/* Per-system route display toggles */}
          <div className={styles.settingRow}>
            <span className={styles.settingLabel}>{t.account.settings.routeDisplay}</span>
            <div className={styles.systemToggleList}>
              {Object.entries(SYSTEM_LABELS).map(([key, label]) => {
                const isVisible = mapDisplay.visibleSystems.has(key);
                return (
                  <div key={key} className={styles.systemToggleItem}>
                    <span className={styles.systemToggleLabel}>{label}</span>
                    <button
                      className={`${styles.toggleSwitch} ${isVisible ? styles.toggleOn : styles.toggleOff}`}
                      onClick={() => mapDisplay.onToggleSystem(key)}
                      aria-label={isVisible ? t.progress.hide(label) : t.progress.show(label)}
                      aria-pressed={isVisible}
                      type="button"
                    >
                      <span className={styles.toggleKnob} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
