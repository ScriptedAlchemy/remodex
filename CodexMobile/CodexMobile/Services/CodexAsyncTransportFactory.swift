// FILE: CodexAsyncTransportFactory.swift
// Purpose: Chooses the active off-LAN async transport without coupling callers to a specific backend.
// Layer: Service support
// Exports: CodexAsyncTransportFactory
// Depends on: Foundation

import Foundation

enum CodexAsyncTransportFactory {
    static func make(
        cloudKitFactory: () -> CodexAsyncRequestTransporting? = { CodexCloudAsyncTransport.makeIfSupported() }
    ) -> CodexAsyncRequestTransporting? {
        cloudKitFactory()
    }
}
