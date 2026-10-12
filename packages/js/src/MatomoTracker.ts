import { TRACK_TYPES } from './constants'
import {
  AddEcommerceItemParams,
  RemoveEcommerceItemParams,
  CustomDimension,
  SetEcommerceViewParams,
  TrackEcommerceOrderParams,
  TrackEventParams,
  TrackLinkParams,
  TrackPageViewParams,
  TrackParams,
  TrackSiteSearchParams,
  UserOptions,
} from './types'

class MatomoTracker {
  private mutationObserver?: MutationObserver
  private trackedElements = new WeakSet<HTMLElement>()

  constructor(userOptions: UserOptions) {
    this.validateOptions(userOptions)
    this.initialize(userOptions)
  }

  private validateOptions(userOptions: UserOptions): void {
    if (!userOptions.urlBase) {
      throw new Error('Matomo urlBase is required.')
    }
    if (!userOptions.siteId) {
      throw new Error('Matomo siteId is required.')
    }
  }

  private initialize({
    urlBase,
    siteId,
    userId,
    trackerUrl,
    srcUrl,
    disabled,
    heartBeat,
    linkTracking = true,
    configurations = {},
  }: UserOptions): void {
    if (typeof window === 'undefined') {
      return
    }

    const normalizedUrlBase = urlBase.endsWith('/') ? urlBase : `${urlBase}/`

    window._paq = window._paq || []

    if (window._paq.length !== 0 || disabled) {
      return
    }

    this.pushInstruction(
      'setTrackerUrl',
      trackerUrl ?? `${normalizedUrlBase}matomo.php`,
    )
    this.pushInstruction('setSiteId', siteId)

    if (userId) {
      this.pushInstruction('setUserId', userId)
    }

    // Apply configurations
    Object.entries(configurations).forEach(([name, instructions]) => {
      if (Array.isArray(instructions)) {
        this.pushInstruction(name, ...instructions)
      } else {
        this.pushInstruction(name, instructions)
      }
    })

    // Enable heartbeat timer if active
    if (!heartBeat || heartBeat.active) {
      this.enableHeartBeatTimer(heartBeat?.seconds ?? 15)
    }

    // Enable link tracking
    this.enableLinkTracking(linkTracking)

    // Inject Matomo script
    this.injectMatomoScript(normalizedUrlBase, srcUrl)
  }

  private injectMatomoScript(normalizedUrlBase: string, srcUrl?: string): void {
    const doc = document
    const scriptElement = doc.createElement('script')
    const scripts = doc.getElementsByTagName('script')[0]

    scriptElement.type = 'text/javascript'
    scriptElement.async = true
    scriptElement.defer = true
    scriptElement.src = srcUrl || `${normalizedUrlBase}matomo.js`

    scripts?.parentNode?.insertBefore(scriptElement, scripts)
  }

  enableHeartBeatTimer(seconds: number): void {
    this.pushInstruction('enableHeartBeatTimer', seconds)
  }

  enableLinkTracking(active: boolean): void {
    this.pushInstruction('enableLinkTracking', active)
  }

  private trackEventsForElements(elements: HTMLElement[]): void {
    elements.forEach((element) => {
      // Skip if we've already tracked this element
      if (this.trackedElements.has(element)) return

      // Mark this element as tracked
      this.trackedElements.add(element)

      element.addEventListener('click', () => {
        const { matomoCategory, matomoAction, matomoName, matomoValue } =
          element.dataset

        if (matomoCategory && matomoAction) {
          this.trackEvent({
            category: matomoCategory,
            action: matomoAction,
            name: matomoName,
            value: matomoValue ? Number(matomoValue) : undefined,
          })
        } else {
          throw new Error(
            'Error: data-matomo-category and data-matomo-action are required.',
          )
        }
      })
    })
  }

  // Tracks events based on data attributes
  trackEvents(): void {
    const matchString = '[data-matomo-event="click"]'
    let isFirstTimeObserving = false

    if (!this.mutationObserver) {
      isFirstTimeObserving = true
      this.mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            // Only track HTML elements
            if (!(node instanceof HTMLElement)) return

            // Check the inserted element itself
            if (node.matches(matchString)) {
              this.trackEventsForElements([node])
            }

            // Check child elements
            const elements = Array.from(
              node.querySelectorAll<HTMLElement>(matchString),
            )
            this.trackEventsForElements(elements)
          })
        })
      })
    }

    this.mutationObserver.observe(document, { childList: true, subtree: true })

    // Track existing elements on first initialization
    if (isFirstTimeObserving) {
      const elements = Array.from(
        document.querySelectorAll<HTMLElement>(matchString),
      )
      this.trackEventsForElements(elements)
    }
  }

  stopObserving(): void {
    this.mutationObserver?.disconnect()
  }

  // Clean up all resources
  destroy(): void {
    this.stopObserving()
    // We don't remove event listeners since we don't keep references to them
    // If needed, we could store them and clean them up here
  }

  // Tracks events
  // https://matomo.org/docs/event-tracking/#tracking-events
  trackEvent({
    category,
    action,
    name,
    value,
    ...otherParams
  }: TrackEventParams): void {
    if (!category || !action) {
      throw new Error('Error: category and action are required.')
    }

    this.track({
      data: [TRACK_TYPES.TRACK_EVENT, category, action, name, value],
      ...otherParams,
    })
  }

  // Tracks site search
  // https://developer.matomo.org/guides/tracking-javascript-guide#internal-search-tracking
  trackSiteSearch({
    keyword,
    category,
    count,
    ...otherParams
  }: TrackSiteSearchParams): void {
    if (!keyword) {
      throw new Error('Error: keyword is required.')
    }

    this.track({
      data: [TRACK_TYPES.TRACK_SEARCH, keyword, category, count],
      ...otherParams,
    })
  }

  // Tracks outgoing links to other sites and downloads
  // https://developer.matomo.org/guides/tracking-javascript-guide#enabling-download-outlink-tracking
  trackLink({ href, linkType = 'link' }: TrackLinkParams): void {
    this.pushInstruction(TRACK_TYPES.TRACK_LINK, href, linkType)
  }

  // Tracks page views
  // https://developer.matomo.org/guides/spa-tracking#tracking-a-new-page-view
  trackPageView(params?: TrackPageViewParams): void {
    this.track({ data: [TRACK_TYPES.TRACK_VIEW], ...params })
  }

  // Adds a product to an Ecommerce order to be tracked via trackEcommerceOrder.
  // https://matomo.org/docs/ecommerce-analytics
  // https://matomo.org/docs/ecommerce-analytics/#1-addecommerceitemproductsku-productname-productcategory-price-quantity
  addEcommerceItem({
    sku,
    productName,
    productCategory,
    productPrice = 0.0,
    productQuantity = 1,
  }: AddEcommerceItemParams): void {
    this.pushInstruction(
      'addEcommerceItem',
      sku,
      productName,
      productCategory,
      productPrice,
      productQuantity,
    )
  }

  // Removes a product from an Ecommerce order to be tracked via trackEcommerceOrder.
  // https://matomo.org/docs/ecommerce-analytics
  removeEcommerceItem({ sku }: RemoveEcommerceItemParams): void {
    this.pushInstruction('removeEcommerceItem', sku)
  }

  // Removes all products from an Ecommerce order to be tracked via trackEcommerceOrder.
  // https://matomo.org/docs/ecommerce-analytics
  clearEcommerceCart(): void {
    this.pushInstruction('clearEcommerceCart')
  }

  // Tracks an Ecommerce order containing items added via addEcommerceItem.
  // https://matomo.org/docs/ecommerce-analytics/#2-trackecommerceorderorderid-revenue-subtotal-tax-shipping-discount
  trackEcommerceOrder({
    orderId,
    orderRevenue,
    orderSubTotal,
    taxAmount,
    shippingAmount,
    discountOffered = false,
  }: TrackEcommerceOrderParams): void {
    this.track({
      data: [
        TRACK_TYPES.TRACK_ECOMMERCE_ORDER,
        orderId,
        orderRevenue,
        orderSubTotal,
        taxAmount,
        shippingAmount,
        discountOffered,
      ],
    })
  }

  // Tracks updates to an Ecommerce Cart before an actual purchase.
  // This will replace currently tracked information of the cart. Always include all items of the updated cart!
  // https://matomo.org/docs/ecommerce-analytics/#example-tracking-an-ecommerce-cart-update-containing-two-products
  trackEcommerceCartUpdate(amount: number): void {
    this.pushInstruction(TRACK_TYPES.TRACK_ECOMMERCE_CART_UPDATE, amount)
  }

  // Marks the next page view as an Ecommerce product page.
  // https://matomo.org/docs/ecommerce-analytics/#example-tracking-a-product-page-view
  setEcommerceView({
    sku,
    productName,
    productCategory,
    productPrice,
  }: SetEcommerceViewParams): void {
    this.pushInstruction(
      'setEcommerceView',
      sku,
      productName,
      productCategory,
      productPrice,
    )
  }

  // Marks the next tracked page view as an Ecommerce category page.
  // https://matomo.org/docs/ecommerce-analytics/#example-tracking-a-category-page-view
  setEcommerceCategoryView(productCategory: string): void {
    this.setEcommerceView({ productCategory, productName: false, sku: false })
  }

  // Sends the tracked page/view/search to Matomo
  track({
    data = [],
    documentTitle = window.document.title,
    href,
    customDimensions = false,
  }: TrackParams): void {
    if (data.length) {
      if (
        customDimensions &&
        Array.isArray(customDimensions) &&
        customDimensions.length
      ) {
        customDimensions.forEach((customDimension: CustomDimension) =>
          this.pushInstruction(
            'setCustomDimension',
            customDimension.id,
            customDimension.value,
          ),
        )
      }

      this.pushInstruction('setCustomUrl', href ?? window.location.href)
      this.pushInstruction('setDocumentTitle', documentTitle)
      this.pushInstruction(...(data as [string, ...unknown[]]))
    }
  }

  /**
   * Pushes an instruction to Matomo for execution, this is equivalent to pushing entries into the `_paq` array.
   *
   * For example:
   *
   * ```ts
   * pushInstruction('setDocumentTitle', document.title)
   * ```
   * Is the equivalent of:
   *
   * ```ts
   * _paq.push(['setDocumentTitle', document.title]);
   * ```
   *
   * @param name The name of the instruction to be executed.
   * @param args The arguments to pass along with the instruction.
   */
  pushInstruction(name: string, ...args: unknown[]): MatomoTracker {
    if (typeof window !== 'undefined') {
      window._paq.push([name, ...args])
    }

    return this
  }
}

export default MatomoTracker
