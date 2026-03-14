/** Chrome cookie format (from chrome.cookies API). */
export interface ChromeCookie {
    name: string;
    value: string;
    domain?: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    expirationDate?: number;
    sameSite?: 'no_restriction' | 'lax' | 'strict';
}

/** Playwright storage state cookie (expires in seconds since epoch). */
export interface PlaywrightCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
}