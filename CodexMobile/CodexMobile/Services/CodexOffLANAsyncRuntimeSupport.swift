// FILE: CodexOffLANAsyncRuntimeSupport.swift
// Purpose: Reports whether any off-LAN async transport is available for this build.
// Layer: Service support
// Exports: CodexOffLANAsyncRuntimeSupport
// Depends on: Foundation

import Foundation

enum CodexOffLANAsyncRuntimeSupport {
    static func isSupported(
        bundleIdentifier: String? = Bundle.main.bundleIdentifier,
        provisioningProfileText: String? = nil
    ) -> Bool {
        CodexCloudAsyncRuntimeSupport.isSupported(
            bundleIdentifier: bundleIdentifier,
            provisioningProfileText: provisioningProfileText
        )
    }
}
