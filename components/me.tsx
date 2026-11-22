"use client";
import { createContext, useContext } from "react";

export type Me = { person: string; isAdmin: boolean; image?: string | null };
const MeContext = createContext<Me>({ person: "", isAdmin: false });

export const MeProvider = MeContext.Provider;
/** The signed-in trip member. */
export const useMe = () => useContext(MeContext);
