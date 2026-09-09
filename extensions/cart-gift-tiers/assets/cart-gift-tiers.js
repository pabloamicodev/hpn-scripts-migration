/**
 * Cart Gift Tiers widget.
 *
 * Runs on every page of any Online Store 2.0 theme (shipped as an app
 * embed — no theme code required). Watches the cart, and once a
 * merchant-configured subtotal tier is crossed:
 *   - a single-variant gift is added to the cart silently;
 *   - a multi-variant (or multi-product) gift shows a picker modal first,
 *     rendered as one "mini PDP" (gallery + variant pills) per gift product.
 *
 * The discount function (extensions/hpn-discount-function) is the source
 * of truth for pricing: it only ever discounts a cart line already tagged
 * __cart_gift_tier by this widget, and it stops discounting automatically
 * the moment a tier's anchor subtotal is no longer met. This widget's job
 * is purely the cart line itself — add the right gift, and clean up the
 * now full-price line if the tier is no longer met (the discount function
 * already made sure it isn't secretly free at that point).
 *
 * Deliberately decoupled from any theme's cart component internals (they
 * vary wildly store to store — see extensions/hpn-discount-function's
 * sibling admin app for one theme's completely custom cart architecture).
 * Instead it watches outgoing /cart/*.js requests directly, plus a
 * periodic fallback poll, so it keeps working regardless of which cart UI
 * a given store's theme uses.
 */
// The widget body is an IIFE assigned to a module-level variable purely so
// the pure tier-qualification functions (giftTierOf, qualifyingSubtotal,
// productTierQualifies, activeTiers — no DOM/fetch dependency) can be
// exported below for cart-gift-tiers.test.js. That export is inert for the
// storefront itself: this file is loaded as a module script (see
// cart-gift-tiers.liquid) purely to make that export reachable, but nothing
// here relies on module scoping otherwise, and the IIFE's early "no root
// element" return is unchanged real behavior.
var cartGiftTiersInternals = (function () {
  // Needed by giftTierOf/qualifyingSubtotal/productTierQualifies/activeTiers,
  // which stay reachable (and must work correctly) even down the "no root
  // element" path below, so this has to be assigned before that check —
  // not just declared: `var` hoists the declaration but not the value.
  var GIFT_TIER_ATTRIBUTE_KEY = "__cart_gift_tier";

  var root = document.getElementById("cart-gift-tiers-root");
  if (!root) {
    return {
      giftTierOf: giftTierOf,
      qualifyingSubtotal: qualifyingSubtotal,
      productTierQualifies: productTierQualifies,
      activeTiers: activeTiers,
    };
  }

  var PROXY_URL = root.dataset.proxyUrl || "/apps/cart-gift-tiers";
  var SHOP_CURRENCY = root.dataset.shopCurrency || "USD";
  var FALLBACK_POLL_MS = 4000;
  var CART_MUTATION_URL_PATTERN = /\/cart\/(add|change|update|clear)\.js/;

  // tierConfig: { stackingMode, tiers: [...] }. A tier is either:
  //   { id, qualifyingType: "subtotal", minimumSubtotal, maxFreeUnits, discountPercentage, message, products }
  //   { id, qualifyingType: "product", triggerProductIds, maxFreeUnits, discountPercentage, message, products }
  // stackingMode only ever reduces subtotal tiers to "the" active one;
  // product tiers have no such competition (see activeTiers below).
  var tierConfig = null;
  var configLoaded = false;

  var dismissedTierIds = new Set();
  var fulfilledTierIds = new Set();
  var pendingTierIds = new Set();
  var modalQueue = [];
  var modalOpen = false;

  var checking = false;
  var recheckAfter = false;

  // ── Tier/product helpers ─────────────────────────────────────────────

  function tierVariants(tier) {
    var variants = [];
    (tier.products || []).forEach(function (product) {
      (product.variants || []).forEach(function (variant) {
        variants.push(variant);
      });
    });
    return variants;
  }

  function pillLabel(variant) {
    var options = Array.isArray(variant.options) ? variant.options : [];
    var values = options
      .filter(function (option) {
        return option && option.value && option.value !== "Default Title";
      })
      .map(function (option) {
        return option.value;
      });
    return values.length ? values.join(" / ") : variant.title || "Option";
  }

  function pickerLabel(variants) {
    var first = variants[0];
    var options = first && Array.isArray(first.options) ? first.options : [];
    var names = options
      .filter(function (option) {
        return option && option.name && option.value !== "Default Title";
      })
      .map(function (option) {
        return option.name;
      });
    return "Select " + (names.length ? names.join(" / ") : "an option");
  }

  function formatMoney(amount) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: SHOP_CURRENCY,
      }).format(Number(amount));
    } catch {
      return amount;
    }
  }

  function loadTierConfig() {
    return fetch(PROXY_URL, { credentials: "same-origin" })
      .then(function (response) {
        return response.ok ? response.json() : { stackingMode: "highest_tier_only", tiers: [] };
      })
      .then(function (data) {
        tierConfig = {
          stackingMode: data.stackingMode === "cumulative" ? "cumulative" : "highest_tier_only",
          tiers: Array.isArray(data.tiers) ? data.tiers : [],
        };
        configLoaded = true;
      })
      .catch(function () {
        tierConfig = { stackingMode: "highest_tier_only", tiers: [] };
        configLoaded = true;
      });
  }

  // ── Cart helpers ──────────────────────────────────────────────────────

  function fetchCart() {
    return fetch("/cart.js", { credentials: "same-origin" }).then(function (r) {
      return r.json();
    });
  }

  function giftTierOf(item) {
    return item.properties && item.properties[GIFT_TIER_ATTRIBUTE_KEY];
  }

  function qualifyingSubtotal(cart) {
    // /cart.js expresses every money value in the shop's smallest currency
    // unit (cents for USD) — tier.minimumSubtotal is a plain dollar amount
    // (same convention the discount function uses via the Admin GraphQL
    // API's decimal MoneyV2 strings), so this must convert before comparing.
    var cents = cart.items.reduce(function (sum, item) {
      if (giftTierOf(item)) return sum;
      return sum + (item.original_line_price || item.line_price || 0);
    }, 0);
    return cents / 100;
  }

  // A "product" tier qualifies when the cart has any unit of one of its
  // trigger products (matched by /cart.js's numeric product_id — the proxy
  // already converts each triggerProductId GID to that same legacy id).
  // Gift lines are excluded from the match for the same reason
  // qualifyingSubtotal excludes them: a gift should never be able to
  // trigger its own (or another) tier.
  function productTierQualifies(tier, cart) {
    var triggerIds = tier.triggerProductIds || [];
    return cart.items.some(function (item) {
      return !giftTierOf(item) && triggerIds.indexOf(String(item.product_id)) !== -1;
    });
  }

  function addGiftVariant(variantId, tierId) {
    var properties = {};
    properties[GIFT_TIER_ATTRIBUTE_KEY] = tierId;

    return fetch("/cart/add.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        items: [{ id: String(variantId), quantity: 1, properties: properties }],
      }),
    }).then(function (response) {
      if (!response.ok) throw new Error("Shopify rejected the gift variant.");
      return response;
    });
  }

  function removeLine(lineKey) {
    var updates = {};
    updates[lineKey] = 0;
    return fetch("/cart/update.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({ updates: updates }),
    });
  }

  function notifyThemeCartChanged() {
    // Best-effort only: there is no universal "refresh the cart UI" API
    // across themes. These are the two event names most Dawn-derived
    // themes already listen for; harmless no-op if nothing subscribes.
    document.dispatchEvent(new CustomEvent("cart:updated"));
    document.dispatchEvent(new CustomEvent("cart:refresh"));
  }

  // ── Modal ─────────────────────────────────────────────────────────────

  // One gallery main image up top, with a thumbnail strip below it built
  // from the product's own full photo set — always the same gallery
  // regardless of which variant is selected, since a picked variant (pills,
  // below) and a browsed photo are independent actions. See the photo
  // carousel block further down for why.
  function renderProduct(tier, product, onFulfilled) {
    var productTemplate = document.getElementById("cart-gift-tiers-product-template");
    var pillTemplate = document.getElementById("cart-gift-tiers-pill-template");
    var thumbTemplate = document.getElementById("cart-gift-tiers-thumb-template");
    if (!productTemplate) return null;

    var fragment = productTemplate.content.cloneNode(true);
    var title = fragment.querySelector(".cart-gift-tiers-info__title");
    var description = fragment.querySelector(".cart-gift-tiers-info__description");
    var mainImageWrap = fragment.querySelector(".cart-gift-tiers-gallery__main");
    var mainImage = fragment.querySelector(".cart-gift-tiers-gallery__main-image");
    var thumbsRow = fragment.querySelector("[data-cart-gift-tiers-thumbs-row]");
    var thumbsContainer = fragment.querySelector("[data-cart-gift-tiers-thumbs]");
    var prevBtn = fragment.querySelector("[data-cart-gift-tiers-thumb-prev]");
    var nextBtn = fragment.querySelector("[data-cart-gift-tiers-thumb-next]");
    var pickerWrap = fragment.querySelector("[data-cart-gift-tiers-picker]");
    var pickerLabelEl = fragment.querySelector("[data-cart-gift-tiers-picker-label]");
    var pillsContainer = fragment.querySelector("[data-cart-gift-tiers-pills]");
    var priceEl = fragment.querySelector("[data-cart-gift-tiers-price]");
    var addButton = fragment.querySelector("[data-cart-gift-tiers-add]");

    if (product.description) {
      description.textContent = product.description;
    } else {
      description.style.display = "none";
    }

    function setMainImage(url, alt) {
      if (!url) {
        mainImageWrap.style.display = "none";
        return;
      }
      mainImage.src = url;
      mainImage.alt = alt || product.title || "";
      mainImageWrap.style.display = "";
    }

    var defaultImage = (Array.isArray(product.images) && product.images[0]) || null;

    var variants = Array.isArray(product.variants) ? product.variants : [];
    var selected = variants[0] || null;
    var titleTouched = false;
    var selectables = []; // { variant, button }[] — pills and thumbnails together

    function updateTitle() {
      title.textContent = (titleTouched && selected ? selected.title : product.title) || "";
    }

    function highlightSelected() {
      selectables.forEach(function (entry) {
        entry.button.classList.toggle("is-active", selected && entry.variant.id === selected.id);
      });
    }

    function selectVariant(variant, fromUserClick) {
      selected = variant;
      if (fromUserClick) titleTouched = true;
      updateTitle();
      if (priceEl) priceEl.textContent = formatMoney(variant.price);
      highlightSelected();
    }

    updateTitle();
    setMainImage(
      defaultImage ? defaultImage.url : selected && selected.image,
      defaultImage ? defaultImage.altText : selected && selected.title,
    );
    if (selected && priceEl) priceEl.textContent = formatMoney(selected.price);

    // The photo carousel always shows the product's own full image gallery
    // (not per-variant images) — sizes rarely have distinct photos per
    // variant, and even for flavors this keeps browsing photos and picking
    // a variant as two independent actions instead of an inconsistent mix.
    var productImages = Array.isArray(product.images) ? product.images : [];
    if (productImages.length > 1 && thumbTemplate) {
      thumbsRow.hidden = false;
      productImages.forEach(function (image, index) {
        var thumbFragment = thumbTemplate.content.cloneNode(true);
        var thumbButton = thumbFragment.querySelector(".cart-gift-tiers-gallery__thumb");
        var thumbImage = thumbFragment.querySelector("img");
        thumbImage.src = image.url;
        thumbImage.alt = image.altText || product.title || "";
        if (index === 0) thumbButton.classList.add("is-active");
        thumbButton.addEventListener("click", function () {
          setMainImage(image.url, image.altText || product.title);
          thumbsContainer.querySelectorAll(".cart-gift-tiers-gallery__thumb").forEach(function (btn) {
            btn.classList.remove("is-active");
          });
          thumbButton.classList.add("is-active");
        });
        thumbsContainer.appendChild(thumbFragment);
      });

      if (prevBtn) {
        prevBtn.addEventListener("click", function () {
          thumbsContainer.scrollBy({ left: -96, behavior: "smooth" });
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", function () {
          thumbsContainer.scrollBy({ left: 96, behavior: "smooth" });
        });
      }
    }

    if (variants.length > 1 && pillTemplate) {
      pickerWrap.hidden = false;
      if (pickerLabelEl) pickerLabelEl.textContent = pickerLabel(variants);
      variants.forEach(function (variant) {
        var pillFragment = pillTemplate.content.cloneNode(true);
        var pillButton = pillFragment.querySelector(".cart-gift-tiers-pill");
        pillButton.textContent = pillLabel(variant);
        pillButton.addEventListener("click", function () {
          selectVariant(variant, true);
        });
        selectables.push({ variant: variant, button: pillButton });
        pillsContainer.appendChild(pillFragment);
      });
    } else if (pickerWrap) {
      pickerWrap.hidden = true;
    }

    highlightSelected();

    if (addButton) {
      addButton.addEventListener("click", function () {
        if (!selected) return;
        addButton.disabled = true;
        pendingTierIds.add(tier.id);
        addGiftVariant(selected.id, tier.id)
          .then(function () {
            notifyThemeCartChanged();
            onFulfilled();
          })
          .catch(function () {
            addButton.disabled = false;
          })
          .finally(function () {
            pendingTierIds.delete(tier.id);
          });
      });
    }

    return fragment;
  }

  function openModalForTier(tier) {
    modalOpen = true;

    var modalTemplate = document.getElementById("cart-gift-tiers-modal-template");
    if (!modalTemplate) {
      modalOpen = false;
      return;
    }

    var products = Array.isArray(tier.products) ? tier.products : [];
    if (products.length === 0) {
      modalOpen = false;
      processModalQueue();
      return;
    }

    var fragment = modalTemplate.content.cloneNode(true);
    var dialog = fragment.querySelector("[data-cart-gift-tiers-dialog]");
    var productsContainer = fragment.querySelector("[data-cart-gift-tiers-products]");
    var closeBtn = fragment.querySelector("[data-cart-gift-tiers-close]");
    var subtitle = fragment.querySelector("#cart-gift-tiers-modal-subtitle");
    var description = fragment.querySelector("#cart-gift-tiers-modal-description");
    var variantChosen = false;

    if (tier.message) {
      subtitle.textContent = tier.message;
    } else {
      subtitle.style.display = "none";
    }

    description.textContent =
      products.length > 1
        ? "Select an option for each gift below."
        : "Select the flavor, size, or option you want as your gift.";

    function closeModal() {
      if (!variantChosen) dismissedTierIds.add(tier.id);
      if (dialog.open) dialog.close();
    }

    function cleanUpModal() {
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
      modalOpen = false;
      processModalQueue();
    }

    closeBtn.addEventListener("click", closeModal);
    dialog.addEventListener("cancel", function () {
      dismissedTierIds.add(tier.id);
    });
    dialog.addEventListener("close", cleanUpModal, { once: true });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeModal();
    });

    products.forEach(function (product) {
      var productFragment = renderProduct(tier, product, function () {
        variantChosen = true;
        fulfilledTierIds.add(tier.id);
        closeModal();
      });
      if (productFragment) productsContainer.appendChild(productFragment);
    });

    document.body.appendChild(dialog);
    dialog.showModal();
    var firstFocusable = productsContainer.querySelector(".cart-gift-tiers-pill, [data-cart-gift-tiers-add]");
    if (firstFocusable) firstFocusable.focus();
  }

  function processModalQueue() {
    if (modalOpen || modalQueue.length === 0) return;
    openModalForTier(modalQueue.shift());
  }

  function enqueueModal(tier) {
    if (
      modalQueue.some(function (t) {
        return t.id === tier.id;
      })
    )
      return;
    modalQueue.push(tier);
    processModalQueue();
  }

  // ── Tier evaluation (mirrors applyCartSubtotalFreeGiftRule and
  // applyProductTriggerFreeGiftRule) ───────────────────────────────────
  //
  // Takes tierConfig explicitly (rather than reading the module-level
  // variable) so it stays a pure function of its arguments — see the
  // exports at the bottom of this file, which let cart-gift-tiers.test.js
  // exercise this exact logic (including the tier-id-collision regression)
  // without needing a DOM at all.

  function activeTiers(cart, config) {
    var subtotal = qualifyingSubtotal(cart);

    var subtotalTiers = config.tiers.filter(function (tier) {
      return tier.qualifyingType !== "product";
    });
    var qualifyingSubtotalTiers = subtotalTiers.filter(function (tier) {
      return subtotal >= tier.minimumSubtotal;
    });

    var activeSubtotalTiers = [];
    if (qualifyingSubtotalTiers.length > 0) {
      activeSubtotalTiers =
        config.stackingMode === "cumulative"
          ? qualifyingSubtotalTiers
          : [
              qualifyingSubtotalTiers.reduce(function (best, tier) {
                return tier.minimumSubtotal > best.minimumSubtotal ? tier : best;
              }),
            ];
    }

    // Every qualifying product tier applies at once — each is tied to a
    // different trigger product, not a competing spend level, so there's
    // no "highest tier" reduction to do here.
    var activeProductTiers = config.tiers.filter(function (tier) {
      return tier.qualifyingType === "product" && productTierQualifies(tier, cart);
    });

    return activeSubtotalTiers.concat(activeProductTiers);
  }

  function checkCart() {
    if (!configLoaded || !tierConfig.tiers.length) return;
    if (checking) {
      recheckAfter = true;
      return;
    }
    checking = true;

    fetchCart()
      .then(function (cart) {
        var active = activeTiers(cart, tierConfig);
        var activeIds = active.map(function (t) {
          return t.id;
        });

        tierConfig.tiers.forEach(function (tier) {
          var line = cart.items.find(function (item) {
            return giftTierOf(item) === tier.id;
          });
          var isActive = activeIds.indexOf(tier.id) !== -1;

          if (isActive) {
            if (line) {
              fulfilledTierIds.add(tier.id);
              return;
            }

            if (dismissedTierIds.has(tier.id) || pendingTierIds.has(tier.id)) return;

            if (fulfilledTierIds.has(tier.id)) {
              // Was fulfilled, still qualifies, but the line is gone —
              // the customer removed it on purpose. Don't force it back.
              dismissedTierIds.add(tier.id);
              fulfilledTierIds.delete(tier.id);
              return;
            }

            // Newly qualifying tier.
            var variants = tierVariants(tier);
            if (variants.length === 1) {
              pendingTierIds.add(tier.id);
              addGiftVariant(variants[0].id, tier.id)
                .then(function () {
                  fulfilledTierIds.add(tier.id);
                  notifyThemeCartChanged();
                })
                .catch(function () {})
                .finally(function () {
                  pendingTierIds.delete(tier.id);
                });
            } else if (variants.length > 1) {
              enqueueModal(tier);
            }
          } else {
            dismissedTierIds.delete(tier.id);
            fulfilledTierIds.delete(tier.id);

            if (line) {
              removeLine(line.key)
                .then(notifyThemeCartChanged)
                .catch(function () {});
            }
          }
        });
      })
      .catch(function () {})
      .finally(function () {
        checking = false;
        if (recheckAfter) {
          recheckAfter = false;
          checkCart();
        }
      });
  }

  var originalFetch = window.fetch;
  window.fetch = function (input, _init) {
    var url = typeof input === "string" ? input : (input && input.url) || "";
    var isCartMutation = CART_MUTATION_URL_PATTERN.test(url);
    var result = originalFetch.apply(window, arguments);
    if (isCartMutation) {
      result
        .then(function (response) {
          if (response && response.ok) checkCart();
          return response;
        })
        .catch(function () {});
    }
    return result;
  };

  loadTierConfig().then(function () {
    if (!tierConfig.tiers.length) return;
    checkCart();
    setInterval(checkCart, FALLBACK_POLL_MS);
  });

  return {
    giftTierOf: giftTierOf,
    qualifyingSubtotal: qualifyingSubtotal,
    productTierQualifies: productTierQualifies,
    activeTiers: activeTiers,
  };
})();

export var giftTierOf = cartGiftTiersInternals.giftTierOf;
export var qualifyingSubtotal = cartGiftTiersInternals.qualifyingSubtotal;
export var productTierQualifies = cartGiftTiersInternals.productTierQualifies;
export var activeTiers = cartGiftTiersInternals.activeTiers;
