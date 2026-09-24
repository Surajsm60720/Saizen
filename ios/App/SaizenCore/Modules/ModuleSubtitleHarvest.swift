import Foundation

/// Pulls sidecar subtitle tracks out of module fetch JSON (Animex/Sora `tracks`).
public enum ModuleSubtitleHarvest {
  public static func tracks(fromJSONData data: Data) -> [[String: Any]] {
    guard let json = try? JSONSerialization.jsonObject(with: data) else { return [] }
    return tracks(from: json)
  }

  public static func tracks(from value: Any) -> [[String: Any]] {
    var found: [[String: Any]] = []
    collect(value, into: &found)
    return uniqued(found)
  }

  private static func collect(_ value: Any, into out: inout [[String: Any]]) {
    if let dict = asDictionary(value) {
      for key in ["tracks", "subtitles", "subs", "captions"] {
        if let rows = dict[key] {
          appendRows(rows, into: &out)
        }
      }
      if isDialogueTrack(dict) {
        out.append(dict)
      }
      for (key, nested) in dict {
        if ["tracks", "subtitles", "subs", "captions"].contains(key) { continue }
        collect(nested, into: &out)
      }
      return
    }
    if let rows = asArray(value) {
      for item in rows {
        collect(item, into: &out)
      }
    }
  }

  private static func appendRows(_ value: Any, into out: inout [[String: Any]]) {
    if let rows = asArray(value) {
      for item in rows {
        if let dict = asDictionary(item), isDialogueTrack(dict) {
          out.append(dict)
        }
      }
      return
    }
    if let dict = asDictionary(value), isDialogueTrack(dict) {
      out.append(dict)
    }
  }

  private static func isDialogueTrack(_ dict: [String: Any]) -> Bool {
    let kind = (
      string(dict["kind"]) ?? string(dict["type"]) ?? ""
    ).lowercased()
    if kind.contains("thumb") { return false }
    guard let raw = trackURL(dict) else { return false }
    let lower = raw.lowercased()
    if lower.contains(".m3u8") || lower.contains(".mp4") || lower.contains(".m4s") {
      return false
    }
    if lower.contains(".vtt") || lower.contains(".srt") || lower.contains(".ass") {
      return true
    }
    if kind.contains("caption") || kind.contains("subtitle") {
      return true
    }
    if string(dict["label"]) != nil || string(dict["lang"]) != nil || string(dict["language"]) != nil {
      return !lower.contains(".jpg") && !lower.contains(".png") && !lower.contains(".webp")
    }
    return false
  }

  private static func trackURL(_ dict: [String: Any]) -> String? {
    string(dict["file"])
      ?? string(dict["url"])
      ?? string(dict["src"])
      ?? string(dict["link"])
      ?? string(dict["subtitle"])
      ?? string(dict["vtt"])
  }

  private static func uniqued(_ tracks: [[String: Any]]) -> [[String: Any]] {
    var seen = Set<String>()
    var out: [[String: Any]] = []
    for track in tracks {
      guard let raw = trackURL(track) else { continue }
      if seen.insert(raw).inserted {
        out.append(track)
      }
    }
    return out
  }

  private static func asArray(_ value: Any) -> [Any]? {
    if let rows = value as? [Any] { return rows }
    if let rows = value as? NSArray { return rows.map { $0 } }
    return nil
  }

  private static func asDictionary(_ value: Any) -> [String: Any]? {
    if let dictionary = value as? [String: Any] { return dictionary }
    if let dictionary = value as? NSDictionary {
      var out: [String: Any] = [:]
      for (key, val) in dictionary {
        out["\(key)"] = val
      }
      return out
    }
    return nil
  }

  private static func string(_ value: Any?) -> String? {
    if let s = value as? String {
      let t = s.trimmingCharacters(in: .whitespacesAndNewlines)
      return t.isEmpty ? nil : t
    }
    if let s = value as? NSString {
      return string(s as String)
    }
    return nil
  }
}
