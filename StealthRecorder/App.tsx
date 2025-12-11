import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  AppState,
  Clipboard,
  ImageBackground,
  Linking,
  Modal,
  NativeModules,
  Pressable,
  ScrollView,
  SafeAreaView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACK_TAP_STORAGE_KEY = 'stealthrecorder:hasAcceptedBackTap';

type RecorderModule = {
  requestPermission: () => Promise<boolean>;
  startRecording: () => Promise<string>;
  stopRecording: () => Promise<string>;
  isRecording: () => Promise<boolean>;
};

type SettingSlide = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  actionLabel: string;
  onAction?: () => void;
  copyableText?: string;
};

const recorderModule: RecorderModule | undefined =
  NativeModules.RecorderManager;

const App = (): React.JSX.Element => {
  const [isRecording, setIsRecording] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);

  const syncRecordingState = useCallback(() => {
    if (!recorderModule) {
      setIsRecording(false);
      return;
    }
    recorderModule
      .isRecording()
      .then(setIsRecording)
      .catch(() => {
        setIsRecording(false);
      });
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(BACK_TAP_STORAGE_KEY).then(value => {
      setShowOnboarding(value !== 'accepted');
    });
    syncRecordingState();
    const sub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        syncRecordingState();
      }
    });
    return () => sub.remove();
  }, [syncRecordingState]);

  const ensurePermission = useCallback(async () => {
    if (!recorderModule || permissionChecked) {
      return;
    }
    try {
      const granted = await recorderModule.requestPermission();
      if (!granted) {
        Alert.alert(
          'マイク権限が必要です',
          '設定アプリでマイク権限を許可してからもう一度お試しください。',
        );
      } else {
        setPermissionChecked(true);
      }
    } catch (error) {
      Alert.alert('権限の確認に失敗しました', String(error));
    }
  }, [permissionChecked]);

  const handleOnboardingChoice = useCallback(
    async (accepted: boolean) => {
      setShowOnboarding(false);
      if (!accepted) {
        return;
      }
      await AsyncStorage.setItem(BACK_TAP_STORAGE_KEY, 'accepted');
      setGuideExpanded(true);
      ensurePermission();
    },
    [ensurePermission],
  );

  const openShortcuts = useCallback(async () => {
    const shortcutsURL = 'shortcuts://';
    const supported = await Linking.canOpenURL(shortcutsURL);
    if (supported) {
      Linking.openURL(shortcutsURL);
    } else {
      Alert.alert(
        'ショートカットアプリを開けません',
        'App Storeからショートカットアプリをインストールしてください。',
      );
    }
  }, []);

  const openBackTapSettings = useCallback(async () => {
    // Appleの非公開URLスキーム。失敗時は設定アプリトップへフォールバック。
    const backTapURL = 'App-prefs:Accessibility';
    const settingsURL = 'App-Prefs:';
    const canOpenSpecific = await Linking.canOpenURL(backTapURL);
    if (canOpenSpecific) {
      Linking.openURL(backTapURL);
      return;
    }
    const canOpenSettings = await Linking.canOpenURL(settingsURL);
    if (canOpenSettings) {
      Linking.openURL(settingsURL);
    } else {
      Alert.alert(
        '設定アプリを開けません',
        '手動で設定アプリを開いてください。',
      );
    }
  }, []);

  const openRecorderTestGuide = useCallback(() => {
    ensurePermission();
    Alert.alert(
      '録音テストの流れ',
      [
        '1. アプリ内のステータスカードで「録音中」と表示されるか確認。',
        '2. 背面ダブルタップでショートカットを起動し録音開始。',
        '3. 再度アプリに戻り「録音停止」ボタンで保存できるか確認。',
      ].join('\n'),
    );
  }, [ensurePermission]);

  const stopRecording = useCallback(async () => {
    if (!recorderModule) {
      Alert.alert('iOS専用機能', '録音機能はiOSデバイスでのみ利用できます。');
      return;
    }
    try {
      await recorderModule.stopRecording();
      setIsRecording(false);
    } catch (error) {
      Alert.alert('録音停止に失敗しました', String(error));
    }
  }, []);

  const instructions = useMemo(
    () => [
      '設定アプリ > アクセシビリティ > タッチ > 背面タップ を開きます。',
      '「ダブルタップ」に「ショートカット」を割り当てます。',
      'ショートカットで「URLを開く」を追加し、URLに stealthrecorder://start を入力します。',
      '停止用に stealthrecorder://stop を割り当てたショートカットを作ると便利です。',
      '録音停止はこのアプリの「録音停止」ボタンで行います。',
    ],
    [],
  );

  const settingSlides = useMemo<SettingSlide[]>(
    () => [
      {
        id: 'download',
        title: '①アプリのダウンロード',
        subtitle: 'ショートカットアプリを入手',
        description:
          '1. App Storeを開く\n' +
          '2.「ショートカット」と検索\n' +
          '3. Apple公式アプリをダウンロード（無料）\n\n' +
          '※既にインストール済みの場合は②へ',
        actionLabel: 'App Storeを開く',
        onAction: openShortcuts,
      },
      {
        id: 'shortcut',
        title: '②ショートカットの作成',
        subtitle: '録音開始用のショートカットを作る',
        description:
          '1. ショートカットアプリを開く\n' +
          '2. 右上「＋」→「アクションを追加」\n' +
          '3.「Web」を選択 →「URLを開く」を選択\n' +
          '4. 下のURLをコピーして貼り付け\n' +
          '5. 名前を「録音開始」にして完了',
        actionLabel: 'ショートカットを開く',
        onAction: openShortcuts,
        copyableText: 'stealthrecorder://start',
      },
      {
        id: 'accessibility',
        title: '③背面タップを設定',
        subtitle: '②で作成したショートカットを割り当て',
        description:
          '1. 設定 > アクセシビリティ > タッチ\n' +
          '2.「背面タップ」→「ダブルタップ」\n' +
          '3. 下にスクロールして「ショートカット」欄へ\n' +
          '4.「録音開始」を選択（チェックが付けばOK）',
        actionLabel: '設定を開く',
        onAction: openBackTapSettings,
      },
      {
        id: 'test',
        title: '④動作テスト',
        subtitle: '正しく録音できるか確認',
        description:
          '1. このアプリを閉じてホーム画面へ\n' +
          '2. iPhoneの背面を2回タップ\n' +
          '3. アプリを開いて「録音中」と表示されれば成功\n' +
          '4.「録音停止」ボタンで保存\n\n' +
          '※録音中は画面右上に赤い点が表示されます',
        actionLabel: 'テスト手順',
        onAction: openRecorderTestGuide,
      },
    ],
    [openBackTapSettings, openRecorderTestGuide, openShortcuts],
  );

  return (
    <ImageBackground
      source={require('./assets/background.png')}
      style={styles.background}
      imageStyle={styles.backgroundImage}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>現在の状態</Text>
            <Text
              style={[
                styles.statusValue,
                isRecording && styles.statusValueActive,
              ]}>
              {isRecording ? '録音中' : '待機中'}
            </Text>
            <Pressable
              style={[
                styles.stopButton,
                !isRecording && styles.stopButtonDisabled,
              ]}
              onPress={stopRecording}
              disabled={!isRecording}>
              <Text style={styles.stopButtonText}>
                {isRecording ? '録音停止' : '録音は待機中'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.settingSection}>
            <Text style={styles.settingTitle}>ステルスレコーダーの設定方法</Text>
            <View style={styles.settingList}>
              {settingSlides.map(slide => (
                <View key={slide.id} style={styles.settingItem}>
                  <View style={styles.settingItemHeader}>
                    <Text style={styles.settingItemTitle}>{slide.title}</Text>
                    <Text style={styles.settingItemSubtitle}>{slide.subtitle}</Text>
                  </View>
                  <Text style={styles.settingItemDescription}>
                    {slide.description}
                  </Text>
                  {slide.copyableText && (
                    <Pressable
                      style={styles.copyButton}
                      onPress={() => {
                        Clipboard.setString(slide.copyableText || '');
                        Alert.alert('コピーしました', slide.copyableText);
                      }}>
                      <Text style={styles.copyButtonText}>
                        {slide.copyableText}
                      </Text>
                      <Text style={styles.copyButtonLabel}>タップでコピー</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          </View>

          <Pressable
            style={styles.guideToggle}
            onPress={() => setGuideExpanded(prev => !prev)}>
            <Text style={styles.guideToggleText}>
              {guideExpanded
                ? 'Back Tap & ショートカット設定を閉じる'
                : 'Back Tap & ショートカット設定ガイド'}
            </Text>
          </Pressable>

          {guideExpanded && (
            <View style={styles.guideCard}>
              {instructions.map((text, index) => (
                <Text key={text} style={styles.guideText}>
                  {index + 1}. {text}
                </Text>
              ))}
              <View style={styles.guideActions}>
                <Pressable
                  style={[
                    styles.linkButton,
                    styles.guideActionButton,
                    styles.guideActionButtonSpacing,
                  ]}
                  onPress={openBackTapSettings}>
                  <Text style={styles.linkButtonText}>設定アプリを開く</Text>
                </Pressable>
                <Pressable
                  style={[styles.linkButton, styles.guideActionButton]}
                  onPress={openShortcuts}>
                  <Text style={styles.linkButtonText}>
                    ショートカットを開く
                  </Text>
                </Pressable>
              </View>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <Modal visible={showOnboarding} animationType="fade" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              背面ダブルタップを有効にしますか？
            </Text>
            <Text style={styles.modalDescription}>
              ステルスレコーダーを使用するには、背面2回タップで録音を開始できるようショートカットを設定する必要があります。
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                style={[
                  styles.modalButton,
                  styles.modalButtonSecondary,
                  styles.modalButtonSpacing,
                ]}
                onPress={() => handleOnboardingChoice(false)}>
                <Text style={styles.modalButtonSecondaryText}>No</Text>
              </Pressable>
              <Pressable
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => handleOnboardingChoice(true)}>
                <Text style={styles.modalButtonPrimaryText}>Yes</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
};

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#020406',
  },
  backgroundImage: {
    resizeMode: 'cover',
    opacity: 0.65,
  },
  safeArea: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
  },
  settingTitle: {
    color: '#cfd3dd',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  settingSection: {
    marginTop: 12,
    marginBottom: 12,
  },
  settingList: {
    gap: 12,
  },
  settingItem: {
    backgroundColor: 'rgba(8,12,20,0.85)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  settingItemHeader: {
    marginBottom: 8,
    gap: 4,
  },
  settingItemTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  settingItemSubtitle: {
    color: '#9fb3d4',
    fontSize: 13,
    lineHeight: 18,
  },
  settingItemDescription: {
    color: '#cfd3dd',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  settingItemButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6fb1ff',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  settingItemButtonText: {
    color: '#6fb1ff',
    fontWeight: '600',
  },
  copyButton: {
    backgroundColor: 'rgba(111,177,255,0.15)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6fb1ff',
    padding: 12,
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#6fb1ff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Menlo',
  },
  copyButtonLabel: {
    color: '#9fb3d4',
    fontSize: 11,
    marginTop: 4,
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#cfd3dd',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 16,
  },
  statusCard: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  statusLabel: {
    color: '#a3acc3',
    fontSize: 14,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  statusValue: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 16,
  },
  statusValueActive: {
    color: '#f85c70',
  },
  stopButton: {
    backgroundColor: '#f85c70',
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  stopButtonDisabled: {
    opacity: 0.5,
  },
  stopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  guideToggle: {
    paddingVertical: 12,
    marginBottom: 8,
  },
  guideToggleText: {
    color: '#6fb1ff',
    fontSize: 16,
    fontWeight: '600',
  },
  guideCard: {
    backgroundColor: 'rgba(6,10,18,0.72)',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  guideText: {
    color: '#dde3f7',
    lineHeight: 22,
    marginBottom: 8,
  },
  guideActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  guideActionButton: {
    flex: 1,
  },
  guideActionButtonSpacing: {
    marginRight: 12,
  },
  linkButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#6fb1ff',
    paddingVertical: 10,
    alignItems: 'center',
    minWidth: 140,
  },
  linkButtonText: {
    color: '#6fb1ff',
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#0f1424',
    borderRadius: 20,
    padding: 24,
  },
  slideModalContent: {
    backgroundColor: '#0f1424',
    borderRadius: 24,
    overflow: 'hidden',
    width: '100%',
  },
  slideModalImage: {
    height: 180,
  },
  slideModalImageInner: {
    opacity: 0.5,
  },
  slideModalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  slideModalTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
  },
  slideModalSubtitle: {
    color: '#cfd3dd',
    marginTop: 6,
  },
  slideModalDescription: {
    color: '#cfd3dd',
    padding: 20,
    fontSize: 15,
    lineHeight: 22,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalDescription: {
    color: '#cfd3dd',
    fontSize: 15,
    lineHeight: 20,
    marginBottom: 16,
  },
  modalActions: {
    flexDirection: 'row',
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonPrimary: {
    backgroundColor: '#6fb1ff',
  },
  modalButtonPrimaryText: {
    color: '#0f1424',
    fontWeight: '700',
  },
  modalButtonSecondary: {
    borderWidth: 1,
    borderColor: '#6fb1ff',
  },
  modalButtonSpacing: {
    marginRight: 12,
  },
  modalButtonSecondaryText: {
    color: '#6fb1ff',
    fontWeight: '700',
  },
});

export default App;
