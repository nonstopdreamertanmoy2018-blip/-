/**
 * Protects the ERP application from third-party browser extensions (e.g. request
 * interceptors injecting `chrome-extension://.../libs/requests.js`) that attempt
 * to overwrite `window.fetch` when the host preview environment defines `fetch`
 * with a getter-only property descriptor.
 */
export function installBrowserExtensionFetchGuard(targetWin: Window = window): void {
  if (!targetWin) return;

  try {
    const winRecord = targetWin as unknown as Record<string, unknown>;
    if (winRecord.__ngErpFetchGuardInstalled) return;
    winRecord.__ngErpFetchGuardInstalled = true;
  } catch {
    // Continue if window expandos are restricted
  }

  const nativeDefineProperty = Object.defineProperty;

  const makeSafeDescriptor = (
    win: Window,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    if (typeof descriptor.get === 'function' && typeof descriptor.set !== 'function') {
      const originalGetter = descriptor.get;
      let overrideFn: typeof fetch | null = null;
      return {
        configurable: true,
        enumerable: descriptor.enumerable !== false,
        get() {
          if (typeof overrideFn === 'function') {
            return overrideFn;
          }
          const resolved = originalGetter.call(this || win);
          return typeof resolved === 'function' ? resolved.bind(win) : resolved;
        },
        set(nextFn: unknown) {
          if (typeof nextFn === 'function') {
            overrideFn = ((...args: Parameters<typeof fetch>) =>
              (nextFn as (...a: Parameters<typeof fetch>) => ReturnType<typeof fetch>).apply(
                win,
                args,
              )) as typeof fetch;
          }
        },
      };
    }

    if ('value' in descriptor && descriptor.writable === false) {
      return {
        configurable: true,
        enumerable: descriptor.enumerable !== false,
        writable: true,
        value:
          typeof descriptor.value === 'function'
            ? descriptor.value.bind(win)
            : descriptor.value,
      };
    }

    return descriptor;
  };

  const targets: object[] = [targetWin];
  try {
    const proto = Object.getPrototypeOf(targetWin);
    if (proto) targets.push(proto);
  } catch {
    // Ignore prototype lookup failures
  }

  for (const obj of targets) {
    try {
      const desc = Object.getOwnPropertyDescriptor(obj, 'fetch');
      if (
        desc &&
        desc.configurable !== false &&
        ((typeof desc.get === 'function' && typeof desc.set !== 'function') ||
          ('value' in desc && desc.writable === false))
      ) {
        nativeDefineProperty.call(Object, obj, 'fetch', makeSafeDescriptor(targetWin, desc));
      }
    } catch {
      // Ignore non-configurable host descriptors
    }
  }
}

installBrowserExtensionFetchGuard(window);
