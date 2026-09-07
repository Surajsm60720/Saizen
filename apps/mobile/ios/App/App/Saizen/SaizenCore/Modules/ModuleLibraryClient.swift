import Foundation

public enum ModuleLibraryClient {
  public static let catalogURL = URL(string: "https://library.cufiy.net/api/modules.json")!

  private static let extraCatalogsKey = "saizen.modules.extraCatalogUrls"

  /// User-added HTTPS catalog index URLs (e.g. personal NSFW `index.json`).
  public static func extraCatalogURLs() -> [URL] {
    let raw = UserDefaults.standard.stringArray(forKey: extraCatalogsKey) ?? []
    return raw.compactMap { URL(string: $0) }.filter { $0.scheme?.lowercased() == "https" }
  }

  public static func setExtraCatalogURLs(_ urls: [URL]) {
    let https = urls
      .filter { $0.scheme?.lowercased() == "https" }
      .map(\.absoluteString)
    // Dedupe preserving order
    var seen = Set<String>()
    var out: [String] = []
    for u in https {
      if seen.insert(u).inserted { out.append(u) }
    }
    UserDefaults.standard.set(out, forKey: extraCatalogsKey)
  }

  @discardableResult
  public static func addExtraCatalogURL(_ url: URL) throws -> [URL] {
    guard url.scheme?.lowercased() == "https" else {
      throw ModuleStoreError.nonHttps(url.absoluteString)
    }
    var urls = extraCatalogURLs()
    if !urls.contains(where: { $0.absoluteString == url.absoluteString }) {
      urls.append(url)
      setExtraCatalogURLs(urls)
    }
    return extraCatalogURLs()
  }

  @discardableResult
  public static func removeExtraCatalogURL(_ url: URL) -> [URL] {
    let next = extraCatalogURLs().filter { $0.absoluteString != url.absoluteString }
    setExtraCatalogURLs(next)
    return next
  }

  public static func fetchCatalog() async throws -> [ModuleCatalogEntry] {
    var merged: [ModuleCatalogEntry] = []
    var seenIds = Set<String>()

    let primary = try await fetchCatalog(from: catalogURL)
    for e in primary {
      if seenIds.insert(e.id).inserted { merged.append(e) }
    }

    for url in extraCatalogURLs() {
      do {
        let extra = try await fetchCatalog(from: url)
        for e in extra {
          // Prefer first-seen id (Cufiy wins over custom duplicates).
          if seenIds.insert(e.id).inserted { merged.append(e) }
        }
      } catch {
        NSLog(
          "[Saizen] ModuleLibraryClient extra catalog failed url=%@ err=%@",
          url.absoluteString,
          String(describing: error)
        )
      }
    }
    return merged
  }

  public static func fetchCatalog(from url: URL) async throws -> [ModuleCatalogEntry] {
    let (data, resp) = try await URLSession.shared.data(from: url)
    guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      throw ModuleFetchError.badResponse
    }
    return try JSONDecoder().decode([ModuleCatalogEntry].self, from: data)
  }

  public static func pickDay0Candidates(_ entries: [ModuleCatalogEntry]) -> [ModuleCatalogEntry] {
    entries.filter {
      ($0.status ?? "").lowercased() == "active"
        && ($0.type ?? "").lowercased() == "anime"
        && ($0.streamType ?? "").uppercased().contains("HLS")
        && $0.scriptUrl.lowercased().hasPrefix("https://")
        && !$0.isNsfw
    }
  }
}
