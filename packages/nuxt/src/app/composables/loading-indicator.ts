import { computed, getCurrentScope, onScopeDispose, shallowRef } from 'vue'
import type { Ref } from 'vue'
import { useNuxtApp } from '../nuxt'

export type LoadingIndicatorOpts = {
  /** @default 2000 */
  duration: number
  /** @default 200 */
  throttle: number
  /** @default 500 */
  hideDelay: number
  /** @default 400 */
  resetDelay: number
  /**
   * You can provide a custom function to customize the progress estimation,
   * which is a function that receives the duration of the loading bar (above)
   * and the elapsed time. It should return a value between 0 and 100.
   */
  estimatedProgress?: (duration: number, elapsed: number) => number
}

export type LoadingIndicator = {
  _cleanup: () => void
  progress: Ref<number>
  isLoading: Ref<boolean>
  error: Ref<boolean>
  start: (opts?: { force?: boolean }) => void
  set: (value: number, opts?: { force?: boolean }) => void
  finish: (opts?: { force?: boolean, error?: boolean }) => void
  clear: () => void
}

function defaultEstimatedProgress (duration: number, elapsed: number): number {
  const completionPercentage = elapsed / duration * 100
  return (2 / Math.PI * 100) * Math.atan(completionPercentage / 50)
}

function createLoadingIndicator (opts: Partial<LoadingIndicatorOpts> = {}) {
  const { duration = 2000, throttle = 200, hideDelay = 500, resetDelay = 400 } = opts
  const getProgress = opts.estimatedProgress || defaultEstimatedProgress
  const nuxtApp = useNuxtApp()
  const progress = shallowRef(0)
  const isLoading = shallowRef(false)
  const error = shallowRef(false)
  let done = false
  let rafId: number

  let throttleTimeout: number | NodeJS.Timeout
  let hideTimeout: number | NodeJS.Timeout
  let resetTimeout: number | NodeJS.Timeout

  const start = (opts: { force?: boolean } = {}) => {
    _clearTimeouts()
    error.value = false
    set(0, opts)
  }

  function set (at = 0, opts: { force?: boolean } = {}) {
    if (nuxtApp.isHydrating) {
      return
    }
    if (at >= 100) { return finish({ force: opts.force }) }
    clear()
    progress.value = at < 0 ? 0 : at
    const throttleTime = opts.force ? 0 : throttle
    if (throttleTime && import.meta.client) {
      throttleTimeout = setTimeout(() => {
        isLoading.value = true
        _startProgress()
      }, throttleTime)
    } else {
      isLoading.value = true
      _startProgress()
    }
  }

  function _hide () {
    if (import.meta.client) {
      hideTimeout = setTimeout(() => {
        isLoading.value = false
        resetTimeout = setTimeout(() => { progress.value = 0 }, resetDelay)
      }, hideDelay)
    }
  }

  function finish (opts: { force?: boolean, error?: boolean } = {}) {
    progress.value = 100
    done = true
    clear()
    _clearTimeouts()
    if (opts.error) {
      error.value = true
    }
    if (opts.force) {
      progress.value = 0
      isLoading.value = false
    } else {
      _hide()
    }
  }

  function _clearTimeouts () {
    if (import.meta.client) {
      clearTimeout(hideTimeout)
      clearTimeout(resetTimeout)
    }
  }

  function clear () {
    if (import.meta.client) {
      clearTimeout(throttleTimeout)
      cancelAnimationFrame(rafId)
    }
  }

  function _startProgress () {
    done = false
    let startTimeStamp: number

    function step (timeStamp: number): void {
      if (done) { return }

      startTimeStamp ??= timeStamp
      const elapsed = timeStamp - startTimeStamp
      progress.value = Math.max(0, Math.min(100, getProgress(duration, elapsed)))
      if (import.meta.client) {
        rafId = requestAnimationFrame(step)
      }
    }

    if (import.meta.client) {
      rafId = requestAnimationFrame(step)
    }
  }

  let _cleanup = () => {}
  if (import.meta.client) {
    const unsubLoadingStartHook = nuxtApp.hook('page:loading:start', () => {
      start()
    })
    const unsubLoadingFinishHook = nuxtApp.hook('page:loading:end', () => {
      finish()
    })
    const unsubError = nuxtApp.hook('vue:error', () => finish())

    _cleanup = () => {
      unsubError()
      unsubLoadingStartHook()
      unsubLoadingFinishHook()
      clear()
    }
  }

  return {
    _cleanup,
    progress: computed(() => progress.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    start,
    set,
    finish,
    clear,
  }
}

/**
 * composable to handle the loading state of the page
 * @since 3.9.0
 */
export function useLoadingIndicator (opts: Partial<LoadingIndicatorOpts> = {}): Omit<LoadingIndicator, '_cleanup'> {
  const nuxtApp = useNuxtApp()

  // Initialise global loading indicator if it doesn't exist already
  const indicator = nuxtApp._loadingIndicator ||= createLoadingIndicator(opts)
  if (import.meta.client && getCurrentScope()) {
    nuxtApp._loadingIndicatorDeps ||= 0
    nuxtApp._loadingIndicatorDeps++
    onScopeDispose(() => {
      nuxtApp._loadingIndicatorDeps!--
      if (nuxtApp._loadingIndicatorDeps === 0) {
        indicator._cleanup()
        delete nuxtApp._loadingIndicator
      }
    })
  }

  return indicator
}
