import Foundation
import AVFoundation
import React

@objc(RecorderManager)
@objcMembers
public class RecorderManager: NSObject {
  private static let fileDateFormatter: DateFormatter = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyyMMdd_HHmmss"
    formatter.locale = Locale(identifier: "ja_JP")
    return formatter
  }()

  // 全インスタンスで共有するためstatic変数に変更
  private static let audioSession = AVAudioSession.sharedInstance()
  private static var audioRecorder: AVAudioRecorder?

  public static let shared = RecorderManager()

  @objc public static func sharedInstance() -> RecorderManager {
    return RecorderManager.shared
  }

  @objc public static func requiresMainQueueSetup() -> Bool {
    return true
  }

  @objc public func requestPermission(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    RecorderManager.audioSession.requestRecordPermission { granted in
      DispatchQueue.main.async {
        resolve(granted)
      }
    }
  }

  @objc public func startRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    do {
      let fileName = try RecorderManager.beginRecording()
      resolve(fileName)
    } catch {
      reject("recording_error", error.localizedDescription, error)
    }
  }

  @objc public func stopRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let result = RecorderManager.stopRecordingInternal()
    resolve(result)
  }

  @objc public func isRecording(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    resolve(RecorderManager.audioRecorder?.isRecording ?? false)
  }

  @objc public func getRecordingFiles(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    let fileManager = FileManager.default
    guard let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first else {
      resolve([])
      return
    }
    
    NSLog("[StealthRecorder] Documents directory: %@", documentsURL.path)
    
    do {
      let files = try fileManager.contentsOfDirectory(at: documentsURL, includingPropertiesForKeys: [.creationDateKey, .fileSizeKey], options: [])
      let audioFiles = files
        .filter { $0.pathExtension == "m4a" }
        .compactMap { url -> [String: Any]? in
          let attributes = try? fileManager.attributesOfItem(atPath: url.path)
          let size = attributes?[.size] as? Int64 ?? 0
          let date = attributes?[.creationDate] as? Date ?? Date()
          return [
            "name": url.lastPathComponent,
            "path": url.path,
            "size": size,
            "date": ISO8601DateFormatter().string(from: date)
          ]
        }
        .sorted { ($0["date"] as? String ?? "") > ($1["date"] as? String ?? "") }
      
      NSLog("[StealthRecorder] Found %d audio files", audioFiles.count)
      resolve(audioFiles)
    } catch {
      NSLog("[StealthRecorder] Error listing files: %@", error.localizedDescription)
      resolve([])
    }
  }

  @objc public func handleShortcut(withAction action: String?) {
    guard let action else {
      NSLog("[StealthRecorder] handleShortcut: action is nil")
      return
    }
    NSLog("[StealthRecorder] handleShortcut: action = %@", action)
    switch action.lowercased() {
    case "start":
      // マイク権限を確認してから録音開始
      RecorderManager.audioSession.requestRecordPermission { granted in
        NSLog("[StealthRecorder] Permission granted: %@", granted ? "YES" : "NO")
        if granted {
          DispatchQueue.main.async {
            do {
              let fileName = try RecorderManager.beginRecording()
              NSLog("[StealthRecorder] Recording started: %@", fileName)
            } catch {
              NSLog("[StealthRecorder] Recording failed: %@", error.localizedDescription)
            }
          }
        }
      }
    case "stop":
      let result = RecorderManager.stopRecordingInternal()
      NSLog("[StealthRecorder] Recording stopped: %@", result)
    default:
      NSLog("[StealthRecorder] Unknown action: %@", action)
      break
    }
  }

  private static func stopRecordingInternal() -> String {
    guard let recorder = audioRecorder, recorder.isRecording else {
      return "idle"
    }
    recorder.stop()
    let fileName = recorder.url.lastPathComponent
    audioRecorder = nil
    do {
      try audioSession.setActive(false, options: [.notifyOthersOnDeactivation])
    } catch {
      // セッションの非アクティブ化に失敗した場合でも録音結果は残す
    }
    return fileName
  }

  private static func beginRecording() throws -> String {
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

  private static func configureSession() throws {
    try audioSession.setCategory(
      .playAndRecord,
      mode: .default,
      options: [.mixWithOthers, .allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
    )
    try audioSession.setActive(true, options: [])
  }

  private static func makeRecorderURL() throws -> URL {
    let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)
    guard let directory = documents.first else {
      throw NSError(domain: "RecorderManager", code: 0, userInfo: [NSLocalizedDescriptionKey: "Documentsディレクトリを取得できません"])
    }
    let timestamp = fileDateFormatter.string(from: Date())
    let filename = "stealth-\(timestamp).m4a"
    return directory.appendingPathComponent(filename)
  }

  private static func recordingSettings() -> [String: Any] {
    [
      AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 1,
      AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
    ]
  }
}

