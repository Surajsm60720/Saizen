import Foundation

public enum ModuleLibraryClient {
  public static let catalogURL = URL(string: "https://library.cufiy.net/api/modules.json")!

  public static func fetchCatalog() async throws -> [ModuleCatalogEntry] {
    let (data, resp) = try await URLSession.shared.data(from: catalogURL)
    // Catalog listing may use URLSession.shared; module script/extract traffic must not.
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
    }
  }
}
