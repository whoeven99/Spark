import { createContext, useContext, type ReactNode } from "react";
import {
  usePictureTranslate,
  type UsePictureTranslateParams,
  type UsePictureTranslateReturn,
} from "../../../hooks/usePictureTranslate";

const PictureTranslateContext = createContext<UsePictureTranslateReturn | null>(null);

export function PictureTranslateProvider({
  children,
  ...params
}: UsePictureTranslateParams & { children: ReactNode }) {
  const value = usePictureTranslate(params);
  return (
    <PictureTranslateContext.Provider value={value}>
      {children}
    </PictureTranslateContext.Provider>
  );
}

export function usePictureTranslateContext(): UsePictureTranslateReturn {
  const ctx = useContext(PictureTranslateContext);
  if (!ctx) {
    throw new Error("usePictureTranslateContext must be used within PictureTranslateProvider");
  }
  return ctx;
}
