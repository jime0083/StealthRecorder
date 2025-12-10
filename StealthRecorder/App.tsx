import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Alert,
  AppState,
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
};

const recorderModule: RecorderModule | undefined =
  NativeModules.RecorderManager;

const App = (): React.JSX.Element => {
  const [isRecording, setIsRecording] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(false);
  const [permissionChecked, setPermissionChecked] = useState(false);
  const [selectedSlide, setSelectedSlide] = useState<SettingSlide | null>(null);

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
        id: 'shortcut',
        title: '①ショートカットを作成',
        subtitle: '※最初にこの手順を行ってください',
        description:
          '【録音開始用ショートカットの作成】\n\n' +
          '1. iPhoneのホーム画面から「ショートカット」アプリを開く\n' +
          '   （青い四角が重なったアイコン）\n\n' +
          '2. 画面右上の「＋」ボタンをタップ\n\n' +
          '3.「アクションを追加」の青いボタンをタップ\n\n' +
          '4. 上部の検索欄に「URL」と入力\n\n' +
          '5. 検索結果から「URLを開く」をタップ\n\n' +
          '6. 画面に表示された「URL」の薄い文字部分をタップし、\n' +
          '   以下を正確に入力：\n' +
          '   stealthrecorder://start\n\n' +
          '7. 画面上部の「URLを開く」という文字をタップ\n\n' +
          '8.「名称変更」を選び「録音開始」と入力\n\n' +
          '9. 画面右上の「完了」をタップして保存\n\n' +
          '✅ これで録音開始用のショートカットが完成です！',
        actionLabel: 'ショートカットアプリを開く',
        onAction: openShortcuts,
      },
      {
        id: 'accessibility',
        title: '②背面タップを設定',
        subtitle: '①で作成したショートカットを割り当てます',
        description:
          '【背面ダブルタップの設定】\n\n' +
          '1. iPhoneの「設定」アプリを開く（歯車アイコン）\n\n' +
          '2.「アクセシビリティ」をタップ\n\n' +
          '3. 下にスクロールして「タッチ」をタップ\n\n' +
          '4. 一番下までスクロールして「背面タップ」をタップ\n\n' +
          '5.「ダブルタップ」をタップ\n\n' +
          '6. 画面を下にスクロールして「ショートカット」の欄を探す\n\n' +
          '7. ①で作成した「録音開始」をタップして選択\n' +
          '   （チェックマークが付けばOK）\n\n' +
          '8. 左上の「＜背面タップ」で戻る\n\n' +
          '✅ これで背面ダブルタップで録音が開始できます！',
        actionLabel: '設定アプリを開く',
        onAction: openBackTapSettings,
      },
      {
        id: 'test',
        title: '③動作テスト',
        subtitle: '正しく録音できるか確認しましょう',
        description:
          '【録音テストの方法】\n\n' +
          '1. このアプリを一度閉じる（ホーム画面に戻る）\n\n' +
          '2. iPhoneの背面（リンゴマークの下あたり）を\n' +
          '   指で2回タップする\n\n' +
          '3. ステルスレコーダーアプリを開く\n\n' +
          '4. 画面上部に「録音中」と表示されていれば成功！\n\n' +
          '5.「録音停止」ボタンをタップして録音を保存\n\n' +
          '【録音ファイルの確認方法】\n' +
          '・「ファイル」アプリ > このiPhone内 >\n' +
          '  StealthRecorder フォルダ内に保存されます\n\n' +
          '⚠️ 注意：録音中は画面右上に赤い点が表示されます\n' +
          '（これはiOSの仕様で非表示にできません）',
        actionLabel: 'テスト手順を見る',
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
          <Text style={styles.title}>ステルスレコーダー</Text>
          <Text style={styles.subtitle}>
            背面ダブルタップで無音録音を開始。証拠保全をよりスマートに。
          </Text>
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
                <Pressable
                  key={slide.id}
                  style={styles.settingItem}
                  onPress={() => setSelectedSlide(slide)}>
                  <View style={styles.settingItemHeader}>
                    <Text style={styles.settingItemTitle}>{slide.title}</Text>
                    <Text style={styles.settingItemSubtitle}>{slide.subtitle}</Text>
                  </View>
                  <Text style={styles.settingItemDescription}>
                    {slide.description}
                  </Text>
                  <Pressable
                    style={styles.settingItemButton}
                    onPress={() => setSelectedSlide(slide)}>
                    <Text style={styles.settingItemButtonText}>詳しく見る</Text>
                  </Pressable>
                </Pressable>
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

      <Modal
        visible={!!selectedSlide}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedSlide(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.slideModalContent}>
            <ImageBackground
              source={require('./assets/background.png')}
              style={styles.slideModalImage}
              imageStyle={styles.slideModalImageInner}>
              <View style={styles.slideModalOverlay}>
                <Text style={styles.slideModalTitle}>
                  {selectedSlide?.title}
                </Text>
                <Text style={styles.slideModalSubtitle}>
                  {selectedSlide?.subtitle}
                </Text>
              </View>
            </ImageBackground>
            <Text style={styles.slideModalDescription}>
              {selectedSlide?.description}
            </Text>
            <View style={styles.modalActions}>
              {selectedSlide?.onAction ? (
                <Pressable
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={() => {
                    selectedSlide?.onAction?.();
                    setSelectedSlide(null);
                  }}>
                  <Text style={styles.modalButtonPrimaryText}>
                    {selectedSlide?.actionLabel}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.modalButton, styles.modalButtonSecondary]}
                onPress={() => setSelectedSlide(null)}>
                <Text style={styles.modalButtonSecondaryText}>閉じる</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
