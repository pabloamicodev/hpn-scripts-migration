/**
 * Cart Gift Tiers widget.
 *
 * Runs on every page of any Online Store 2.0 theme (shipped as an app
 * embed — no theme code required). Watches the cart, and once a
 * merchant-configured subtotal tier is crossed:
 *   - a single-variant gift is added to the cart silently;
 *   - a multi-variant gift shows a picker modal first.
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
(function () {
  var root = document.getElementById("cart-gift-tiers-root");
  if (!root) return;

  var PROXY_URL = root.dataset.proxyUrl || "/apps/cart-gift-tiers";
  var SHOP_CURRENCY = root.dataset.shopCurrency || "USD";
  var GIFT_TIER_ATTRIBUTE_KEY = "__cart_gift_tier";
  var FALLBACK_POLL_MS = 4000;
  var CART_MUTATION_URL_PATTERN = /\/cart\/(add|change|update|clear)\.js/;

  var tierConfig = null; // { stackingMode, tiers: [{ id, minimumSubtotal, maxFreeUnits, discountPercentage, variants }] }
  var configLoaded = false;

  var dismissedTierIds = new Set();
  var fulfilledTierIds = new Set();
  var pendingTierIds = new Set();
  var modalQueue = [];
  var modalOpen = false;

  var checking = false;
  var recheckAfter = false;

  function formatMoney(amount) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: SHOP_CURRENCY,
      }).format(Number(amount));
    } catch (err) {
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
    return cart.items.reduce(function (sum, item) {
      if (giftTierOf(item)) return sum;
      return sum + (item.original_line_price || item.line_price || 0);
    }, 0);
  }

  function addGiftVariant(variantId, tierId) {
    var properties = {};
    properties[GIFT_TIER_ATTRIBUTE_KEY] = tierId;

    return fetch("/cart/add.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ items: [{ id: Number(variantId), quantity: 1, properties: properties }] }),
    });
  }

  function removeLine(lineKey) {
    var updates = {};
    updates[lineKey] = 0;
    return fetch("/cart/update.js", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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

  function openModalForTier(tier) {
    modalOpen = true;

    var modalTemplate = document.getElementById("cart-gift-tiers-modal-template");
    var optionTemplate = document.getElementById("cart-gift-tiers-option-template");
    if (!modalTemplate || !optionTemplate) {
      modalOpen = false;
      return;
    }

    var fragment = modalTemplate.content.cloneNode(true);
    var overlay = fragment.querySelector("[data-cart-gift-tiers-overlay]");
    var optionsContainer = fragment.querySelector("[data-cart-gift-tiers-options]");
    var closeBtn = fragment.querySelector("[data-cart-gift-tiers-close]");

    function closeModal() {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      modalOpen = false;
      processModalQueue();
    }

    closeBtn.addEventListener("click", closeModal);
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) closeModal();
    });

    tier.variants.forEach(function (variant) {
      var optionFragment = optionTemplate.content.cloneNode(true);
      var button = optionFragment.querySelector(".cart-gift-tiers-option");
      var image = optionFragment.querySelector(".cart-gift-tiers-option__image");
      var title = optionFragment.querySelector(".cart-gift-tiers-option__title");
      var price = optionFragment.querySelector(".cart-gift-tiers-option__price");

      if (variant.image) {
        image.src = variant.image;
        image.alt = variant.title;
      } else {
        image.style.display = "none";
      }
      title.textContent = variant.title;
      price.textContent = formatMoney(variant.price);

      button.addEventListener("click", function () {
        button.disabled = true;
        pendingTierIds.add(tier.id);
        addGiftVariant(variant.id, tier.id)
          .then(function () {
            fulfilledTierIds.add(tier.id);
            notifyThemeCartChanged();
          })
          .catch(function () {})
          .finally(function () {
            pendingTierIds.delete(tier.id);
            closeModal();
          });
      });

      optionsContainer.appendChild(optionFragment);
    });

    document.body.appendChild(overlay);
  }

  function processModalQueue() {
    if (modalOpen || modalQueue.length === 0) return;
    openModalForTier(modalQueue.shift());
  }

  function enqueueModal(tier) {
    if (modalQueue.some(function (t) { return t.id === tier.id; })) return;
    modalQueue.push(tier);
    processModalQueue();
  }

  // ── Tier evaluation (mirrors applyCartSubtotalFreeGiftRule) ──────────

  function activeTiers(cart) {
    var subtotal = qualifyingSubtotal(cart);
    var qualifying = tierConfig.tiers.filter(function (tier) {
      return subtotal >= tier.minimumSubtotal;
    });
    if (qualifying.length === 0) return [];

    if (tierConfig.stackingMode === "cumulative") return qualifying;

    return [
      qualifying.reduce(function (best, tier) {
        return tier.minimumSubtotal > best.minimumSubtotal ? tier : best;
      }),
    ];
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
        var active = activeTiers(cart);
        var activeIds = active.map(function (t) { return t.id; });

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
            if (tier.variants.length === 1) {
              pendingTierIds.add(tier.id);
              addGiftVariant(tier.variants[0].id, tier.id)
                .then(function () {
                  fulfilledTierIds.add(tier.id);
                  notifyThemeCartChanged();
                })
                .catch(function () {})
                .finally(function () {
                  pendingTierIds.delete(tier.id);
                });
            } else if (tier.variants.length > 1) {
              enqueueModal(tier);
            }
          } else {
            dismissedTierIds.delete(tier.id);
            fulfilledTierIds.delete(tier.id);

            if (line) {
              removeLine(line.key).then(notifyThemeCartChanged).catch(function () {});
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
  window.fetch = function (input, init) {
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
})();
