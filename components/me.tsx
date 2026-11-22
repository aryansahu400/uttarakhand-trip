"use client";
import { createContext, useContext } from "react";

export type Me = { person: string; isAdmin: boolean };
const MeContext = createContext<Me>({ person: "", isAdmin: false });

export const MeProvider = MeContext.Provider;
/** The signed-in trip member. */
export const useMe = () => useContext(MeContext);
