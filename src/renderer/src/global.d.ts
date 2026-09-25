declare module '*.png' {
  const src: string
  export default src
}

import type { DashboardApi } from '../../preload/index'

declare global {
  interface Window {
    dashboard?: DashboardApi
    __PIXERA_OUTPUT__?: boolean
  }
}

export {}
