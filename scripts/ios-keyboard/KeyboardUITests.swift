import XCTest

final class KeyboardUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        #if TEACHER
        app = XCUIApplication(bundleIdentifier: "com.brunerdigital.thebeesuite.teacher")
        #else
        app = XCUIApplication(bundleIdentifier: "com.brunerdigital.thebeesuite.parent")
        #endif
        XCUIDevice.shared.orientation = .portrait
        app.launch()
        XCTAssertTrue(app.webViews.firstMatch.waitForExistence(timeout: 60))
        XCTAssertTrue(app.staticTexts["UI preview ready. Network actions, form submissions, and navigation to live workspaces are disabled."].waitForExistence(timeout: 120), "Synthetic preview is hydrated and guarded")
    }

    override func tearDownWithError() throws {
        evidence("final-screen")
        let hierarchy = XCTAttachment(string: app.debugDescription)
        hierarchy.name = "accessibility-hierarchy"
        hierarchy.lifetime = .keepAlways
        add(hierarchy)
    }

    private func eventually(_ message: String, _ condition: @escaping () -> Bool) {
        let predicate = NSPredicate { _, _ in condition() }
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: predicate, object: nil)], timeout: 15), .completed, message)
    }

    private func evidence(_ name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name
        screenshot.lifetime = .keepAlways
        add(screenshot)
    }

    private func unobscured(_ element: XCUIElement) -> Bool {
        guard element.exists else { return false }
        let frame = element.frame
        // WebKit can report a hit point even underneath fixed app navigation.
        #if TEACHER
        let bottom = app.frame.height * 0.85
        #else
        // The composer rests near the footer; a percentage excludes a visible
        // editor on tall iPhones. Use the actual navigation boundary instead.
        let navigation = app.otherElements["Family portal navigation, navigation"]
        guard navigation.exists else { return false }
        let bottom = navigation.frame.minY - 8
        #endif
        return element.isHittable && frame.minY >= app.frame.height * 0.2
            && frame.maxY <= bottom
    }

    private func reveal(_ element: XCUIElement) {
        XCTAssertTrue(element.waitForExistence(timeout: 60))
        for _ in 0..<16 {
            guard element.exists else {
                XCTFail("Requested editor or action disappeared while revealing it")
                return
            }
            if unobscured(element) { return }
            #if !TEACHER
            // Keep gestures in the outer document gutter, clear of both the
            // independently scrolling history and the fixed navigation buttons.
            let navigation = app.otherElements["Family portal navigation, navigation"]
            guard navigation.exists else {
                XCTFail("Parent navigation boundary is unavailable")
                return
            }
            let top = app.frame.height * 0.2
            let bottom = navigation.frame.minY - 8
            let frame = element.frame
            let scrollDown = frame.minY < top
            let distance = min(app.frame.height * 0.18, max(48, scrollDown ? top - frame.minY : frame.maxY - bottom))
            let startY = scrollDown ? top + 24 : bottom - 24
            let endY = scrollDown ? startY + distance : startY - distance
            let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: startY / app.frame.height))
            let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: endY / app.frame.height))
            start.press(forDuration: 0.1, thenDragTo: end)
            #else
            let lower = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.75))
            let upper = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.35))
            if element.frame.minY < app.frame.height * 0.2 { upper.press(forDuration: 0.1, thenDragTo: lower) }
            else { lower.press(forDuration: 0.1, thenDragTo: upper) }
            #endif
        }
        XCTAssertTrue(unobscured(element), "Editor or action is fully clear of fixed navigation: \(element.frame)")
    }

    func testKeyboardDraftAndRotation() {
        #if TEACHER
        let shortcut = app.links["Write daily report"]
        XCTAssertTrue(shortcut.waitForExistence(timeout: 60))
        reveal(shortcut)
        shortcut.tap()
        let field = app.textViews["Teacher note for parents"]
        let action = app.buttons["Save daily report"]
        #else
        let field = app.textViews["Message"]
        let action = app.buttons["Send message"]
        #endif
        reveal(field)
        evidence("editor-before-focus")
        print("EDITOR FRAME \(field.frame)")
        field.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 15), "Real iOS software keyboard is visible")
        let draft = "Synthetic keyboard draft. Never sent."
        field.typeText(draft)
        eventually("Focused field remains above the keyboard") {
            field.isHittable && field.frame.minY >= self.app.webViews.firstMatch.frame.minY
                && field.frame.maxY <= self.app.keyboards.firstMatch.frame.minY
        }
        #if !TEACHER
        eventually("Message action stays reachable above the open keyboard") {
            action.isHittable && action.frame.maxY <=  self.app.keyboards.firstMatch.frame.minY
        }
        #endif
        evidence("portrait-keyboard-focused")
        XCTAssertTrue((field.value as? String)?.contains(draft) == true)

        // Production native apps intentionally support portrait only.
        XCUIDevice.shared.orientation = .landscapeLeft
        eventually("Simulator processes the landscape request") { XCUIDevice.shared.orientation == .landscapeLeft }
        // An immediate portrait-frame check can pass before UIKit rotates.
        // Observe the settled request long enough to catch an unwanted rotation.
        let landscapeFrame = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            self.app.frame.width > self.app.frame.height
        }, object: nil)
        landscapeFrame.isInverted = true
        XCTAssertEqual(XCTWaiter.wait(for: [landscapeFrame], timeout: 2), .completed, "Native app retains its portrait lock after rotation settles")
        XCTAssertGreaterThan(app.frame.height, app.frame.width)
        XCTAssertTrue((field.value as? String)?.contains(draft) == true, "Rotation keeps the draft")
        evidence("rotation-draft-retained")
        XCUIDevice.shared.orientation = .portrait

        // Dismiss through the native input accessory when available. A swipe
        // outside the editor provides the normal interactive dismissal fallback.
        let done = app.buttons["Done"]
        if done.exists && done.isHittable { done.tap() } else { app.swipeDown() }
        eventually("Keyboard dismisses") { !self.app.keyboards.firstMatch.exists }
        reveal(action)
        XCTAssertTrue(action.isHittable, "Action remains reachable after dismissal")
        XCTAssertTrue((field.value as? String)?.contains(draft) == true)
        evidence("dismissed-keyboard-action-reachable")
        // Never activate the action: this suite tests editing and geometry only.
    }
}
