import { PlaywrightCookie } from "../types/cookies.js"

type HandshakeState = {
    cookies: PlaywrightCookie[]
}

const AUTH_COOKIES = [
    "hss-global",
    "production_current_user",
    "_trajectory_session",
    "TGC"
]

export function isHandshakeSessionExpired(state: HandshakeState): boolean {
    const now = Date.now() / 1000 // seconds

    const authCookies = state.cookies.filter(c =>
        AUTH_COOKIES.includes(c.name)
    )

    if (authCookies.length === 0) {
        return true
    }

    for (const cookie of authCookies) {
        if (cookie.expires === -1) {
            continue
        }

        if (cookie.expires < now) {
            return true
        }
    }

    return false
}