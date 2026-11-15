import { createContext, useContext } from 'react'
import type { Me } from './cloud'

/** The signed-in recruiter (null in the demo and the Claude preview). */
export const MeCtx = createContext<{ me: Me | null; refresh: () => Promise<void> }>({ me: null, refresh: async () => {} })
export const useMe = () => useContext(MeCtx)
