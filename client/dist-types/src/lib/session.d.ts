import { type ReactNode } from "react";
import type { Capabilities, CurrentUser } from "./types";
type SessionValue = {
    user: CurrentUser | null;
    capabilities: Capabilities;
    loading: boolean;
    setUser: (user: CurrentUser | null) => void;
    signOut: () => Promise<void>;
};
export declare function SessionProvider({ children }: {
    children: ReactNode;
}): import("react").JSX.Element;
export declare function useSession(): SessionValue;
export {};
