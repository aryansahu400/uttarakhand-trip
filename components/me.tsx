"use client";
import { createContext, useContext } from "react";

/** The signed-in member. `email` is their Google account email (shown only to themselves, on Home). */
export type Me = { person: string; isAdmin: boolean; image?: string | null; email?: string | null };
const MeContext = createContext<Me>({ person: "", isAdmin: false });

export const MeProvider = MeContext.Provider;
/** The signed-in trip member. */
export const useMe = () => useContext(MeContext);
