import { jwtDecode } from "jwt-decode";

export const getUserEmail = (token: string): string => {
    const decoded = jwtDecode(token) as { email: string };
    return decoded.email;
};
