import Foundation
import AVFoundation
import React

@objc(RecorderManager)
@objcMembers
class RecorderManager: NSObject {
  private static let fileDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMdd_HHmmss"
    formatter.locale = Locale(identifier: "ja_JP")
    return formatter
  }()

  private let audioSession = AVAudioSession.sharedInstance()
  private var audioRecorder: AVAudioRecorder?

  static let shared = RecorderManager()

  @objc static func sharedInstance() -> RecorderManager {
    return RecorderManager.shared
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc func requestPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    audioSession.requestRecordPermission { granted in
      DispatchQueue.main.async {
        resolve(granted)
      }
    }
  }

  @objc func startRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      let fileName = try beginRecording()
      resolve(fileName)
    } catch {
      reject("recording_error", error.localizedDescription, error)
    }
  }

  @objc func stopRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let recorder = audioRecorder, recorder.isRecording else {
      resolve("idle")
      return
    }
    recorder.stop()
    audioRecorder = nil
    do {
      try audioSession.setActive(false, options: [.notifyOthersOnDeactivation])
    } catch {
      // セッションの非アクティブ化に失敗した場合でも録音結果は残す
    }
    resolve(recorder.url.lastPathComponent)
  }

  @objc func isRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(audioRecorder?.isRecording ?? false)
  }

  @objc func handleShortcut(withAction action: String?) {
    guard let action else { return }
    switch action.lowercased() {
    case "start":
      _ = try? beginRecording()
    case "stop":
      if let recorder = audioRecorder, recorder.isRecording {
        recorder.stop()
        audioRecorder = nil
        try? audioSession.setActive(false, options: [.notifyOthersOnDeactivation])
      }
    default:
      break
    }
  }

  private func beginRecording() throws -> String {
    if let recorder = audioRecorder, recorder.isRecording {
      return recorder.url.lastPathComponent
    }

    try configureSession()
    let url = try makeRecorderURL()
    let recorder = try AVAudioRecorder(url: url, settings: recordingSettings())
    recorder.isMeteringEnabled = true
    recorder.prepareToRecord()
    recorder.record()
    audioRecorder = recorder
    return url.lastPathComponent
  }

  private func configureSession() throws {
    try audioSession.setCategory(
      .playAndRecord,
      mode: .default,
      options: [.mixWithOthers, .allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
    )
    try audioSession.setActive(true, options: [])
  }

  private func makeRecorderURL() throws -> URL {
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
    guard let directory = documents.first else {
      throw NSError(domain: "RecorderManager", code: 0, userInfo: [NSLocalizedDescriptionKey: "Documentsディレクトリを取得できません"])
    }
    let timestamp = RecorderManager.fileDateFormatter.string(from: Date())
    let filename = "stealth-\(timestamp).m4a"
    return directory.appendingPathComponent(filename)
  }

  private func recordingSettings() -> [String: Any] {
    [
      AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
    ]
  }
}

