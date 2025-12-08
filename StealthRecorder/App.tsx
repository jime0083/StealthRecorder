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
        id: 'accessibility',
        title: '背面タップ設定',
        subtitle: '設定 > アクセシビリティ > タッチ > 背面タップ',
        description:
          'iPhone設定アプリを開き、ダブルタップ動作にショートカットを割り当てます。感度が低い場合は同画面で調整してください。',
        actionLabel: '設定アプリを開く',
        onAction: openBackTapSettings,
      },
      {
        id: 'shortcut',
        title: 'ショートカット割り当て',
        subtitle: 'ショートカットアプリで URL を開く',
        description:
          'ショートカットアプリで「URLを開く」アクションを追加し、stealthrecorder://start（録音開始）や stop（録音停止）を設定します。',
        actionLabel: 'ショートカットを開く',
        onAction: openShortcuts,
      },
      {
        id: 'test',
        title: '録音テスト',
        subtitle: '無音録音のチェック',
        description:
          '背面タップで録音が開始されるか、アプリ内ボタンで停止と保存ができるか確認してください。録音後はファイルアプリから音声を確認できます。',
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
        <View style={styles.content}>
          <Text style={styles.settingTitle}>設定</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            pagingEnabled
            contentContainerStyle={styles.slideContainer}>
            {settingSlides.map(slide => (
              <Pressable
                key={slide.id}
                onPress={() => setSelectedSlide(slide)}
                style={styles.slideCard}>
                <ImageBackground
                  source={require('./assets/background.png')}
                  style={styles.slideImage}
                  imageStyle={styles.slideImageInner}>
                  <View style={styles.slideImageOverlay}>
                    <Text style={styles.slideTitle}>{slide.title}</Text>
                  </View>
                </ImageBackground>
                <View style={styles.slideBody}>
                  <Text style={styles.slideSubtitle}>{slide.subtitle}</Text>
                  <Pressable
                    style={styles.slideButton}
                    onPress={() => setSelectedSlide(slide)}>
                    <Text style={styles.slideButtonText}>詳しく見る</Text>
                  </Pressable>
                </View>
              </Pressable>
            ))}
          </ScrollView>

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
        </View>
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
  content: {
    flex: 1,
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
  slideContainer: {
    paddingBottom: 16,
  },
  slideCard: {
    width: 260,
    marginRight: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(8,12,20,0.85)',
  },
  slideImage: {
    height: 130,
    justifyContent: 'flex-end',
  },
  slideImageInner: {
    opacity: 0.55,
  },
  slideImageOverlay: {
    padding: 16,
  },
  slideTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  slideBody: {
    padding: 16,
    gap: 12,
  },
  slideSubtitle: {
    color: '#9fb3d4',
    fontSize: 14,
    lineHeight: 20,
  },
  slideButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6fb1ff',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  slideButtonText: {
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
