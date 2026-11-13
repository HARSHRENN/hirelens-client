import { createContext, useContext } from 'react'
export const UiCtx = createContext<{ openCandidate: (id: string | null) => void }>({ openCandidate: () => {} })
export const useUi = () => useContext(UiCtx)
