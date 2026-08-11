#if DEBUG
import Foundation
import UIKit

public struct ModuleDay0SpikeResult: Sendable {
  public let moduleId: String
  public let sourceName: String
  public let streamURL: URL
  public let quality: String?

  public var message: String {
    var parts = ["moduleId=\(moduleId)", "source=\(sourceName)", "url=\(streamURL.absoluteString)"]
    if let quality, !quality.isEmpty {
      parts.append("quality=\(quality)")
    }
    return parts.joined(separator: " ")
  }
}

public enum ModuleDay0SpikeError: Error, LocalizedError {
  case noCandidates
  case badScriptURL(String)
  case scriptDownloadFailed(Int)
  case missingResultURL(String)
  case noPlayableCandidate([String])

  public var errorDescription: String? {
    switch self {
    case .noCandidates:
      return "No active anime HLS modules found in catalog"
    case .badScriptURL(let value):
      return "Invalid HTTPS module script URL: \(value)"
    case .scriptDownloadFailed(let status):
      return "Module script download failed with HTTP \(status)"
    case .missingResultURL(let stage):
      return "Module \(stage) did not return a url"
    case .noPlayableCandidate(let failures):
      return "No Day 0 module produced a playable HLS URL: \(failures.joined(separator: " | "))"
    }
  }
}

public enum ModuleDay0Spike {
  public static func run(from presenter: UIViewController) async throws -> ModuleDay0SpikeResult {
    let entries = try await ModuleLibraryClient.fetchCatalog()
    let candidates = Array(ModuleLibraryClient.pickDay0Candidates(entries).prefix(3))
    guard !candidates.isEmpty else { throw ModuleDay0SpikeError.noCandidates }

    var failures: [String] = []
    for entry in candidates {
      do {
        let result = try await attempt(entry: entry, presenter: presenter)
        NSLog("[Saizen] Day0 spike succeeded %@", result.message)
        return result
      } catch {
        failures.append("\(entry.id): \(errorMessage(error))")
        NSLog("[Saizen] Day0 spike failed module=%@ error=%@", entry.id, errorMessage(error))
      }
    }

    throw ModuleDay0SpikeError.noPlayableCandidate(failures)
  }

  private static func attempt(entry: ModuleCatalogEntry, presenter: UIViewController) async throws -> ModuleDay0SpikeResult {
    let scriptSource = try await downloadScript(from: entry.scriptUrl)
    let baseURL = entry.baseUrl.flatMap(URL.init(string:))
    let session = try ModuleResolveSession(moduleId: entry.id, scriptSource: scriptSource, baseURL: baseURL)

    do {
      let results = try await session.searchResults("Naruto")
      let showURL = try firstURLString(in: results, stage: "searchResults")
      let episodes = try await session.extractEpisodes(showURL)
      let episodeURL = try firstURLString(in: episodes, stage: "extractEpisodes")
      let streams = try await session.extractStreamUrl(episodeURL)
      guard let stream = streams.first(where: { $0.kind == .hls }) else {
        throw ModuleRuntimeError.invalidReturn
      }

      let title = [entry.sourceName, stream.quality].compactMap { value in
        guard let value, !value.isEmpty else { return nil }
        return value
      }.joined(separator: " ")

      await MainActor.run {
        PlayerRouter.present(
          from: topPresenter(from: presenter),
          url: stream.url,
          hint: .avplayer,
          title: title.isEmpty ? "Day 0 Spike" : title,
          onDismiss: {
            session.teardown()
          }
        )
      }

      return ModuleDay0SpikeResult(
        moduleId: entry.id,
        sourceName: entry.sourceName,
        streamURL: stream.url,
        quality: stream.quality
      )
    } catch {
      session.teardown()
      throw error
    }
  }

  private static func downloadScript(from value: String) async throws -> String {
    guard let url = URL(string: value),
          url.scheme?.lowercased() == "https",
          url.host?.isEmpty == false
    else {
      throw ModuleDay0SpikeError.badScriptURL(value)
    }

    let config = URLSessionConfiguration.ephemeral
    let session = URLSession(configuration: config)
    defer { session.invalidateAndCancel() }

    let (data, resp) = try await session.data(from: url)
    guard let http = resp as? HTTPURLResponse else { throw ModuleFetchError.badResponse }
    guard (200..<300).contains(http.statusCode) else {
      throw ModuleDay0SpikeError.scriptDownloadFailed(http.statusCode)
    }
    return String(decoding: data, as: UTF8.self)
  }

  private static func firstURLString(in items: [[String: Any]], stage: String) throws -> String {
    guard let url = items.compactMap({ $0["url"] as? String }).first(where: { !$0.isEmpty }) else {
      throw ModuleDay0SpikeError.missingResultURL(stage)
    }
    return url
  }

  @MainActor
  private static func topPresenter(from root: UIViewController) -> UIViewController {
    var presenter = root
    while let presented = presenter.presentedViewController {
      presenter = presented
    }
    return presenter
  }

  private static func errorMessage(_ error: Error) -> String {
    if let localized = error as? LocalizedError, let description = localized.errorDescription {
      return description
    }
    return error.localizedDescription
  }
}
#endif
