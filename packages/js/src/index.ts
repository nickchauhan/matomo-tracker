import MatomoTracker from './MatomoTracker'
import * as types from './types'

// Extend Window interface to include _paq property
declare global {
  interface Window {
    _paq: any[][]
  }
}

export default MatomoTracker

export { types }
