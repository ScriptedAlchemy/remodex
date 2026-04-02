import Foundation
import XCTest
@testable import CodexMobile

private final class StubAsyncRequestTransport: CodexAsyncRequestTransporting {
    func availability(for service: CodexService) async -> CodexCloudAsyncAvailability {
        .available
    }

    func performRequest(
        method: String,
        params: JSONValue?,
        requestID: JSONValue,
        service: CodexService
    ) async throws -> RPCMessage {
        RPCMessage(id: requestID, result: .object([:]), includeJSONRPC: false)
    }

    func performNotification(
        method: String,
        params: JSONValue?,
        service: CodexService
    ) async throws {}
}

final class CodexCloudAsyncRuntimeSupportTests: XCTestCase {
    func testIsSupportedReturnsTrueForICloudContainerEntitlement() {
        let supported = CodexCloudAsyncRuntimeSupport.isSupported(
            provisioningProfileText: """
            <key>Entitlements</key>
            <dict>
                <key>com.apple.developer.icloud-container-identifiers</key>
                <array>
                    <string>iCloud.com.example.Remodex</string>
                </array>
            </dict>
            """
        )

        XCTAssertTrue(supported)
    }

    func testIsSupportedReturnsTrueForUbiquityKVSIdentifier() {
        let supported = CodexCloudAsyncRuntimeSupport.isSupported(
            provisioningProfileText: """
            <key>Entitlements</key>
            <dict>
                <key>com.apple.developer.ubiquity-kvstore-identifier</key>
                <string>TEAMID.com.example.Remodex</string>
            </dict>
            """
        )

        XCTAssertTrue(supported)
    }

    func testIsSupportedReturnsFalseWithoutICloudEntitlements() {
        let supported = CodexCloudAsyncRuntimeSupport.isSupported(
            provisioningProfileText: """
            <key>Entitlements</key>
            <dict>
                <key>get-task-allow</key>
                <true/>
            </dict>
            """
        )

        XCTAssertFalse(supported)
    }

    func testIsSupportedReturnsFalseWhenProvisioningProfileIsUnavailable() {
        let supported = CodexCloudAsyncRuntimeSupport.isSupported(
            bundleIdentifier: "com.example.Remodex",
            provisioningProfileText: nil
        )

        XCTAssertFalse(supported)
    }

    func testIsSupportedReturnsFalseByDefaultInSimulatorOrTestHost() {
        let supported = CodexCloudAsyncRuntimeSupport.isSupported(
            bundleIdentifier: "com.example.Remodex"
        )

        XCTAssertFalse(supported)
    }

    func testMakeIfSupportedReturnsNilInSimulator() {
        #if targetEnvironment(simulator)
        XCTAssertNil(CodexCloudAsyncTransport.makeIfSupported())
        #endif
    }

    func testIgnoresICloudMentionsOutsideEntitlementsSection() {
        let supported = CodexCloudAsyncRuntimeSupport.isSupported(
            bundleIdentifier: "com.example.Remodex",
            provisioningProfileText: """
            <key>DER-Encoded-Profile</key>
            <data>com.apple.developer.icloud-services</data>
            <key>Entitlements</key>
            <dict>
                <key>get-task-allow</key>
                <true/>
            </dict>
            """
        )

        XCTAssertFalse(supported)
    }

    func testDisabledPersonalBundleIdentifierForcesCloudAsyncOff() {
        let supported = CodexCloudAsyncRuntimeSupport.isSupported(
            bundleIdentifier: "com.zackkirsh.remodex",
            provisioningProfileText: """
            <key>Entitlements</key>
            <dict>
                <key>com.apple.developer.icloud-services</key>
                <array>
                    <string>CloudKit</string>
                </array>
            </dict>
            """
        )

        XCTAssertFalse(supported)
    }

    func testOffLANSupportReturnsTrueForCloudKitEntitlement() {
        let supported = CodexOffLANAsyncRuntimeSupport.isSupported(
            bundleIdentifier: "com.example.Remodex",
            provisioningProfileText: """
            <key>Entitlements</key>
            <dict>
                <key>com.apple.developer.icloud-services</key>
                <array>
                    <string>CloudKit</string>
                </array>
            </dict>
            """
        )

        XCTAssertTrue(supported)
    }

    func testOffLANSupportReturnsFalseWithoutCloudKitEntitlement() {
        let supported = CodexOffLANAsyncRuntimeSupport.isSupported(
            bundleIdentifier: "com.example.Remodex",
            provisioningProfileText: """
            <key>Entitlements</key>
            <dict>
                <key>get-task-allow</key>
                <true/>
            </dict>
            """
        )

        XCTAssertFalse(supported)
    }

    func testAsyncTransportFactoryReturnsCloudKitTransportWhenAvailable() {
        let fallback = StubAsyncRequestTransport()
        var cloudKitFactoryCalled = false
        let transport = CodexAsyncTransportFactory.make(
            cloudKitFactory: {
                cloudKitFactoryCalled = true
                return fallback
            }
        )

        XCTAssertTrue(transport === fallback)
        XCTAssertTrue(cloudKitFactoryCalled)
    }

    func testAsyncTransportFactoryReturnsNilWhenCloudKitTransportUnavailable() {
        var cloudKitFactoryCalled = false
        let transport = CodexAsyncTransportFactory.make(
            cloudKitFactory: {
                cloudKitFactoryCalled = true
                return nil
            }
        )

        XCTAssertNil(transport)
        XCTAssertTrue(cloudKitFactoryCalled)
    }
}
