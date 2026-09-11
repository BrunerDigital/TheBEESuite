import Foundation
import Vision

// Only public, unauthenticated screenshots from the isolated verification simulator.
guard CommandLine.arguments.count == 2 else {
    fputs("Usage: swift scripts/recognize-ios-screen.swift <screenshot.png>\n", stderr)
    exit(1)
}

do {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["en-US"]
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1]), options: [:])
    try handler.perform([request])
    let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
    let data = try JSONSerialization.data(withJSONObject: ["text": text], options: [.sortedKeys])
    print(String(decoding: data, as: UTF8.self))
} catch {
    fputs("Native screenshot text recognition failed: \(error.localizedDescription)\n", stderr)
    exit(1)
}
