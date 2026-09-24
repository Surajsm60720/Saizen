#if SAIZEN_STANDALONE_TESTS
import Foundation

@main
enum SaizenPickerTests {
  static func main() {
    testPrefersEnglishNonForced()
    testFallsBackToDefault()
    testPrefersEnglishOverGenericCC()
    testSoraArrayPicksDefaultEnglish()
    testSoraIgnoresThumbnailsAndHttp()
    testLegacySubtitleStringStillWorks()
    testSoraSubsKey()
    testSingleObjectSubtitles()
    testLanguageMapSubtitles()
    testNSDictionaryRowsFromJSContext()
    testLinkKeyAndProtocolRelative()
    testNSStringJSONArray()
    testHarvestAnimexSourcesTracks()
    testHarvestIgnoresVideoUrls()
    testHLSMediaTagParse()
    testCaptionHintSoftAndHard()
    testGenericCCIsNotRealEmbedded()
    testNamedHLSIsRealEmbedded()
    testAutoEnableSidecarAvoidsOverlap()
    testListTracksUniquesByLanguagePrefersVTT()
    testCaptionMenuStartsWithOffAndSkipsGenericCC()
    testDefaultKindOffWhenHardSub()
    testDefaultKindSidecarWhenSoftAndEmptyCC()
    testDefaultKindEmbeddedWhenRealHLS()
    testMenuPrefersEmbeddedWhenLanguageOverlaps()
    print("SaizenPickerTests passed")
  }

  static func testPrefersEnglishNonForced() {
    let options = [
      SaizenMediaOption(name: "Signs", languageCodes: ["en"], isDefault: false, isForced: true),
      SaizenMediaOption(name: "English", languageCodes: ["en", "English"], isDefault: false, isForced: false),
      SaizenMediaOption(name: "Spanish", languageCodes: ["es"], isDefault: true, isForced: false)
    ]
    let idx = SaizenMediaTrackPicker.pickLegibleIndex(
      options: options,
      preferredLanguages: ["en", "eng", "english"]
    )
    precondition(idx == 1, "expected English non-forced, got \(String(describing: idx))")
  }

  static func testPrefersEnglishOverGenericCC() {
    let options = [
      SaizenMediaOption(name: "CC", languageCodes: ["CC"], isDefault: true, isForced: false),
      SaizenMediaOption(name: "English", languageCodes: ["en", "English"], isDefault: false, isForced: false)
    ]
    let idx = SaizenMediaTrackPicker.pickLegibleIndex(
      options: options,
      preferredLanguages: ["en", "eng", "english"]
    )
    precondition(idx == 1, "expected English over generic CC, got \(String(describing: idx))")
  }

  static func testFallsBackToDefault() {
    let options = [
      SaizenMediaOption(name: "Japanese CC", languageCodes: ["ja"], isDefault: true, isForced: false)
    ]
    let idx = SaizenMediaTrackPicker.pickLegibleIndex(
      options: options,
      preferredLanguages: ["en"]
    )
    precondition(idx == 0, "expected default fallback, got \(String(describing: idx))")
  }

  static func testSoraArrayPicksDefaultEnglish() {
    let payload: [String: Any] = [
      "subtitles": [
        ["file": "https://cdn.example/thumbs.vtt", "kind": "thumbnails", "label": "Thumbnails"],
        ["url": "https://cdn.example/es.vtt", "label": "Spanish", "lang": "es"],
        ["file": "https://cdn.example/en.vtt", "label": "English", "default": true]
      ]
    ]
    let url = ModuleSubtitlePicker.pickURL(payload: payload, stream: nil, baseURL: nil)
    precondition(url?.absoluteString == "https://cdn.example/en.vtt", "got \(String(describing: url))")
  }

  static func testSoraIgnoresThumbnailsAndHttp() {
    let payload: [String: Any] = [
      "tracks": [
        ["file": "http://insecure.example/en.vtt", "label": "English", "default": true],
        ["file": "https://cdn.example/en.ass", "label": "English ASS"]
      ]
    ]
    let url = ModuleSubtitlePicker.pickURL(payload: payload, stream: nil, baseURL: nil)
    precondition(url?.absoluteString == "https://cdn.example/en.ass", "got \(String(describing: url))")
  }

  static func testLegacySubtitleStringStillWorks() {
    let payload: [String: Any] = [
      "subtitle": "https://cdn.example/legacy.vtt"
    ]
    let url = ModuleSubtitlePicker.pickURL(payload: payload, stream: nil, baseURL: nil)
    precondition(url?.absoluteString == "https://cdn.example/legacy.vtt", "got \(String(describing: url))")
  }

  static func testSoraSubsKey() {
    let payload: [String: Any] = [
      "subs": [
        ["file": "https://cdn.example/en.vtt", "label": "English"]
      ]
    ]
    let url = ModuleSubtitlePicker.pickURL(payload: payload, stream: nil, baseURL: nil)
    precondition(url?.absoluteString == "https://cdn.example/en.vtt", "got \(String(describing: url))")
  }

  static func testSingleObjectSubtitles() {
    let payload: [String: Any] = [
      "subtitles": ["file": "https://cdn.example/en.vtt", "label": "English", "default": true]
    ]
    let url = ModuleSubtitlePicker.pickURL(payload: payload, stream: nil, baseURL: nil)
    precondition(url?.absoluteString == "https://cdn.example/en.vtt", "got \(String(describing: url))")
  }

  static func testLanguageMapSubtitles() {
    let payload: [String: Any] = [
      "subtitles": [
        "Spanish": "https://cdn.example/es.vtt",
        "English": "https://cdn.example/en.vtt"
      ]
    ]
    let url = ModuleSubtitlePicker.pickURL(payload: payload, stream: nil, baseURL: nil)
    precondition(url?.absoluteString == "https://cdn.example/en.vtt", "got \(String(describing: url))")
  }

  static func testNSDictionaryRowsFromJSContext() {
    let row = NSDictionary(dictionary: [
      "file": "https://cdn.example/en.vtt",
      "label": "English"
    ])
    let payload: [String: Any] = [
      "subtitles": NSArray(array: [row])
    ]
    let url = ModuleSubtitlePicker.pickURL(payload: payload, stream: nil, baseURL: nil)
    precondition(url?.absoluteString == "https://cdn.example/en.vtt", "got \(String(describing: url))")
  }

  static func testLinkKeyAndProtocolRelative() {
    let payload: [String: Any] = [
      "subtitles": [
        ["link": "//cdn.example/en.vtt", "label": "English"]
      ]
    ]
    let url = ModuleSubtitlePicker.pickURL(payload: payload, stream: nil, baseURL: nil)
    precondition(url?.absoluteString == "https://cdn.example/en.vtt", "got \(String(describing: url))")
  }

  static func testNSStringJSONArray() {
    let json = NSString(string: #"[{"file":"https://cdn.example/en.vtt","label":"English"}]"#)
    let payload: [String: Any] = ["subtitles": json]
    let url = ModuleSubtitlePicker.pickURL(payload: payload, stream: nil, baseURL: nil)
    precondition(url?.absoluteString == "https://cdn.example/en.vtt", "got \(String(describing: url))")
  }

  static func testHarvestAnimexSourcesTracks() {
    let json: [String: Any] = [
      "sources": [["url": "https://cdn.example/index.m3u8", "quality": "1080p"]],
      "tracks": [
        ["file": "https://cdn.example/thumbs.vtt", "kind": "thumbnails"],
        ["file": "https://cdn.example/en.vtt", "label": "English", "kind": "captions", "default": true]
      ]
    ]
    let tracks = ModuleSubtitleHarvest.tracks(from: json)
    precondition(tracks.count == 1, "expected 1 dialogue track, got \(tracks.count)")
    let url = ModuleSubtitlePicker.pickURL(
      payload: ["subtitles": tracks],
      stream: nil,
      baseURL: nil
    )
    precondition(url?.absoluteString == "https://cdn.example/en.vtt", "got \(String(describing: url))")
  }

  static func testHarvestIgnoresVideoUrls() {
    let json: [String: Any] = [
      "url": "https://cdn.example/master.m3u8",
      "streamUrl": "https://cdn.example/index.m3u8"
    ]
    let tracks = ModuleSubtitleHarvest.tracks(from: json)
    precondition(tracks.isEmpty, "expected no harvested video urls, got \(tracks)")
  }

  static func testHLSMediaTagParse() {
    let playlist = """
    #EXTM3U
    #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="Japanese",DEFAULT=YES,URI="ja.m3u8"
    #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="en.m3u8"
    #EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="Signs",LANGUAGE="en",FORCED=YES,URI="signs.m3u8"
    #EXT-X-STREAM-INF:BANDWIDTH=2000000,AUDIO="aac",SUBTITLES="subs"
    index.m3u8
    """
    let tags = HLSSubtitleDiscovery.mediaTags(in: playlist)
    precondition(tags.count == 2, "expected 2 subtitle tags, got \(tags.count)")
    precondition(tags[0].name == "English", "got \(tags[0].name)")
    precondition(tags[0].uri == "en.m3u8", "got \(tags[0].uri)")
    let picked = HLSSubtitleDiscovery.pick(tags, preferredLanguages: ["en"])
    precondition(picked?.uri == "en.m3u8", "got \(String(describing: picked?.uri))")
  }

  static func testCaptionHintSoftAndHard() {
    precondition(SaizenCaptionPolicy.hint(fromStreamTitle: "YUKI - SUB (Soft sub, Good)") == .soft)
    precondition(SaizenCaptionPolicy.hint(fromStreamTitle: "BEEP Hardsub 1080p") == .hard)
    precondition(SaizenCaptionPolicy.hint(fromStreamTitle: "I Want to Love You") == .unknown)
  }

  static func testGenericCCIsNotRealEmbedded() {
    let options = [
      SaizenMediaOption(name: "CC", languageCodes: ["CC"], isDefault: true, isForced: false)
    ]
    precondition(SaizenCaptionPolicy.hasRealEmbeddedCaptions(options) == false)
  }

  static func testNamedHLSIsRealEmbedded() {
    let options = [
      SaizenMediaOption(name: "English", languageCodes: ["en"], isDefault: true, isForced: false)
    ]
    precondition(SaizenCaptionPolicy.hasRealEmbeddedCaptions(options) == true)
  }

  static func testAutoEnableSidecarAvoidsOverlap() {
    precondition(SaizenCaptionPolicy.shouldAutoEnableSidecar(hint: .soft, hasRealEmbeddedCaptions: false))
    precondition(!SaizenCaptionPolicy.shouldAutoEnableSidecar(hint: .hard, hasRealEmbeddedCaptions: false))
    precondition(!SaizenCaptionPolicy.shouldAutoEnableSidecar(hint: .unknown, hasRealEmbeddedCaptions: true))
    precondition(SaizenCaptionPolicy.shouldAutoEnableSidecar(hint: .unknown, hasRealEmbeddedCaptions: false))
  }

  static func testListTracksUniquesByLanguagePrefersVTT() {
    let payload: [String: Any] = [
      "subtitles": [
        ["file": "https://a.example/en.ass", "label": "English", "lang": "en"],
        ["file": "https://a.example/en.vtt", "label": "English", "lang": "en"],
        ["file": "https://b.example/en.vtt", "label": "English", "lang": "en"],
        ["file": "https://a.example/ja.vtt", "label": "Japanese", "lang": "ja"]
      ]
    ]
    let tracks = ModuleSubtitlePicker.listTracks(payload: payload, stream: nil, baseURL: nil)
    precondition(tracks.count == 2, "expected 2 unique languages, got \(tracks.count)")
    precondition(tracks[0].url.absoluteString == "https://a.example/en.vtt", "got \(tracks[0].url)")
    precondition(tracks[1].url.absoluteString == "https://a.example/ja.vtt", "got \(tracks[1].url)")
  }

  static func testCaptionMenuStartsWithOffAndSkipsGenericCC() {
    let sidecar = [
      SidecarSubtitle(
        url: URL(string: "https://cdn.example/en.vtt")!,
        label: "English",
        language: "en"
      )
    ]
    let embedded = [
      SaizenMediaOption(name: "CC", languageCodes: ["CC"], isDefault: true, isForced: false),
      SaizenMediaOption(name: "Spanish", languageCodes: ["es"], isDefault: false, isForced: false)
    ]
    let menu = SaizenCaptionPolicy.menu(sidecarTracks: sidecar, embeddedOptions: embedded)
    precondition(menu.first?.kind == .off, "Off must be first")
    precondition(menu.contains { $0.title == "English" }, "missing sidecar English")
    precondition(menu.contains { $0.title == "Spanish" }, "missing embedded Spanish")
    precondition(!menu.contains { $0.title == "CC" }, "generic CC must not be listed")
  }

  static func testDefaultKindOffWhenHardSub() {
    let sidecar = [
      SidecarSubtitle(
        url: URL(string: "https://cdn.example/en.vtt")!,
        label: "English",
        language: "en"
      )
    ]
    let kind = SaizenCaptionPolicy.defaultKind(
      hint: .hard,
      sidecarTracks: sidecar,
      embeddedOptions: []
    )
    precondition(kind == .off, "hard-sub must default Off, got \(kind)")
  }

  static func testDefaultKindSidecarWhenSoftAndEmptyCC() {
    let sidecar = [
      SidecarSubtitle(
        url: URL(string: "https://cdn.example/en.vtt")!,
        label: "English",
        language: "en"
      )
    ]
    let embedded = [
      SaizenMediaOption(name: "CC", languageCodes: ["CC"], isDefault: true, isForced: false)
    ]
    let kind = SaizenCaptionPolicy.defaultKind(
      hint: .soft,
      sidecarTracks: sidecar,
      embeddedOptions: embedded
    )
    precondition(kind == .sidecar(sidecar[0].url), "got \(kind)")
  }

  static func testDefaultKindEmbeddedWhenRealHLS() {
    let sidecar = [
      SidecarSubtitle(
        url: URL(string: "https://cdn.example/en.vtt")!,
        label: "English",
        language: "en"
      )
    ]
    let embedded = [
      SaizenMediaOption(name: "English", languageCodes: ["en"], isDefault: true, isForced: false)
    ]
    let kind = SaizenCaptionPolicy.defaultKind(
      hint: .unknown,
      sidecarTracks: sidecar,
      embeddedOptions: embedded
    )
    precondition(kind == .embedded(index: 0), "got \(kind)")
  }

  static func testMenuPrefersEmbeddedWhenLanguageOverlaps() {
    let sidecar = [
      SidecarSubtitle(
        url: URL(string: "https://cdn.example/en.vtt")!,
        label: "English",
        language: "en"
      )
    ]
    let embedded = [
      SaizenMediaOption(name: "English", languageCodes: ["en"], isDefault: true, isForced: false)
    ]
    let menu = SaizenCaptionPolicy.menu(sidecarTracks: sidecar, embeddedOptions: embedded)
    precondition(menu.count == 2, "Off + embedded English, got \(menu)")
    precondition(menu[1].kind == .embedded(index: 0), "got \(menu[1].kind)")
  }
}
#endif
